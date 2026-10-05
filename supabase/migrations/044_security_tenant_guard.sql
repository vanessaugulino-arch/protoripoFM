-- 044_security_tenant_guard.sql
-- Etapa 0 da unificação: fecha o acesso entre empresas nas funções de banco.
--
-- Problema: seis funções SECURITY DEFINER (rodam ignorando RLS) recebiam o
-- tenant como parâmetro e não conferiam se quem chama pertence a ele. Como
-- tinham GRANT para anon, qualquer pessoa com a chave pública (que vai no
-- bundle do front) lia estoque/compras/cascata ou recalculava o plano de
-- qualquer empresa só passando o uuid. A tabela plan_cascade_runs tinha RLS
-- ligada mas com USING (true) nas 4 operações.
--
-- O que muda:
--   1. assert_tenant_access(uuid): mesma regra das funções de vendas
--      (026/034/042/043): tenant = get_tenant_id() OU is_super_admin().
--      Libera também service_role e conexões diretas (SQL editor, scripts
--      com a senha do banco), que não passam pelo PostgREST.
--   2. As seis funções são recriadas com o corpo idêntico à última versão,
--      só com a chamada da trava logo após o BEGIN.
--   3. EXECUTE sai de PUBLIC/anon e fica só para authenticated e service_role,
--      também nas funções de vendas que já tinham a trava.
--   4. plan_cascade_runs passa a usar o padrão das outras tabelas.
--
-- Convenção a partir daqui: toda função SECURITY DEFINER que recebe tenant
-- chama PERFORM public.assert_tenant_access(<param>) na primeira linha e não
-- recebe GRANT para anon.

CREATE OR REPLACE FUNCTION public.assert_tenant_access(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Fora do PostgREST (SQL editor, psql, jobs): confiança no papel do banco.
  IF session_user <> 'authenticator' THEN
    RETURN;
  END IF;
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF p_tenant IS NOT NULL AND (p_tenant = get_tenant_id() OR is_super_admin()) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'acesso negado a esta empresa' USING ERRCODE = '42501';
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.assert_tenant_access(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.assert_tenant_access(uuid) TO authenticated, service_role;

-- ── classify_color (corpo de 020_product_enrichment_columns.sql) ────────────
CREATE OR REPLACE FUNCTION public.classify_color(
  p_cor_norm    text,
  p_cor_display text,
  p_familia     text,
  p_intensidade text,
  p_tenant_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_color_group text := p_familia || ' ' || p_intensidade;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  -- Upsert no banco global de cores
  INSERT INTO public.color_bank (cor_norm, cor_display, familia, intensidade, contributed_by_tenant)
  VALUES (p_cor_norm, p_cor_display, p_familia, p_intensidade, p_tenant_id)
  ON CONFLICT (cor_norm) DO UPDATE
    SET familia              = EXCLUDED.familia,
        intensidade          = EXCLUDED.intensidade,
        cor_display          = EXCLUDED.cor_display,
        updated_at           = now();

  -- Propaga color_group + color_family + color_intensity para produtos do tenant
  -- que tenham a cor bruta correspondente e cujos campos diferem do novo valor
  UPDATE public.products
    SET color_group     = v_color_group,
        color_family    = p_familia,
        color_intensity = p_intensidade,
        updated_at      = now()
  WHERE tenant_id = p_tenant_id
    AND (
      lower(trim(color)) = p_cor_norm
      OR color_group     = v_color_group   -- atualiza mesmo se cor bruta difere mas grupo bate
    )
    AND (
      color_group     IS DISTINCT FROM v_color_group
      OR color_family    IS DISTINCT FROM p_familia
      OR color_intensity IS DISTINCT FROM p_intensidade
    );
END;
$$;

-- ── recompute_official_macro (corpo de 022_official_plan_phase1.sql) ────────
CREATE OR REPLACE FUNCTION public.recompute_official_macro(p_tenant uuid, p_year int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_scenario_id uuid;
  v_data        jsonb;
  ch            record;
  s_receita     numeric := 0;
  s_pecas       numeric := 0;
  s_lucro       numeric := 0;
  s_estoque     numeric := 0;
  s_markdown    numeric := 0;
  s_orcamento   numeric := 0;
  macro         jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant);

  SELECT id, channel_data INTO v_scenario_id, v_data
  FROM channel_scenarios
  WHERE tenant_id = p_tenant AND year = p_year AND is_applied = true
  ORDER BY saved_at DESC
  LIMIT 1;

  IF v_data IS NULL THEN
    RETURN NULL;
  END IF;

  FOR ch IN SELECT value FROM jsonb_each(v_data) LOOP
    s_receita   := s_receita   + COALESCE((ch.value->>'receita')::numeric,        0);
    s_pecas     := s_pecas     + COALESCE((ch.value->>'producao')::numeric,       0);
    s_lucro     := s_lucro     + COALESCE((ch.value->>'margemBrutaRS')::numeric,  0);
    s_estoque   := s_estoque   + COALESCE((ch.value->>'estoqueMedioRS')::numeric, 0);
    s_markdown  := s_markdown  + COALESCE((ch.value->>'markdown')::numeric,       0);
    s_orcamento := s_orcamento + COALESCE((ch.value->>'orcamento')::numeric,      0);
  END LOOP;

  macro := jsonb_build_object(
    'receitaBruta',  round(s_receita, 2),
    'pecasVendidas', round(s_pecas),
    'pmv',           CASE WHEN s_pecas   > 0 THEN round(s_receita / s_pecas, 2)                        ELSE 0 END,
    'margemBruta',   CASE WHEN s_receita > 0 THEN round(s_lucro / s_receita * 100, 2)                  ELSE 0 END,
    'custoMedio',    CASE WHEN s_pecas   > 0 THEN round((s_receita - s_lucro - s_markdown) / s_pecas, 2) ELSE 0 END,
    'estoqueMediao', round(s_estoque, 2),
    'giro',          CASE WHEN s_estoque > 0 THEN round(s_receita / s_estoque, 2)                      ELSE 0 END,
    'cobertura',     CASE WHEN s_receita > 0 THEN round(s_estoque / s_receita * 365)                   ELSE 0 END,
    'gmroi',         CASE WHEN s_estoque > 0 THEN round(s_lucro / s_estoque, 2)                        ELSE 0 END,
    'mkdRS',         round(s_markdown, 2),
    'mkdPct',        CASE WHEN s_receita > 0 THEN round(s_markdown / s_receita * 100, 2)               ELSE 0 END,
    'orcamento',     round(s_orcamento, 2),
    'source',        'channel_rollup',
    'recomputed_at', now()
  );

  UPDATE public.annual_plan_cycles
     SET official_macro              = macro,
         applied_channel_scenario_id = v_scenario_id,
         detail_level                = GREATEST(detail_level, 2),
         updated_at                  = now()
   WHERE tenant_id = p_tenant AND year = p_year;

  RETURN macro;
END;
$fn$;

-- ── get_division_inventory_position (corpo de 038_division_inventory_position.sql) ────
CREATE OR REPLACE FUNCTION public.get_division_inventory_position(
  p_tenant_id uuid,
  p_division  text,
  p_date_from date,
  p_date_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_init_date   date;
  v_init        jsonb;
  v_medio       jsonb;
  v_range_count int;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT snap.snapshot_date INTO v_init_date
  FROM inventory_snapshots snap
  JOIN products p ON p.sku = snap.sku AND p.tenant_id = snap.tenant_id
  WHERE snap.tenant_id = p_tenant_id
    AND p.division = p_division
    AND snap.snapshot_date <= p_date_from
  ORDER BY snap.snapshot_date DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'pecas',      COALESCE(SUM(snap.quantity), 0),
    'valorCusto', COALESCE(SUM(snap.value_cost), 0),
    'valorVenda', COALESCE(SUM(snap.value_sale), 0)
  ) INTO v_init
  FROM inventory_snapshots snap
  JOIN products p ON p.sku = snap.sku AND p.tenant_id = snap.tenant_id
  WHERE snap.tenant_id = p_tenant_id
    AND p.division = p_division
    AND snap.snapshot_date = v_init_date;

  WITH per_date AS (
    SELECT snap.snapshot_date AS d,
           SUM(snap.quantity)   AS pecas,
           SUM(snap.value_cost) AS custo,
           SUM(snap.value_sale) AS venda
    FROM inventory_snapshots snap
    JOIN products p ON p.sku = snap.sku AND p.tenant_id = snap.tenant_id
    WHERE snap.tenant_id = p_tenant_id
      AND p.division = p_division
      AND snap.snapshot_date BETWEEN p_date_from AND p_date_to
    GROUP BY snap.snapshot_date
  )
  SELECT count(*),
         jsonb_build_object(
           'pecas',      COALESCE(AVG(pecas), 0),
           'valorCusto', COALESCE(AVG(custo), 0),
           'valorVenda', COALESCE(AVG(venda), 0)
         )
  INTO v_range_count, v_medio
  FROM per_date;

  IF v_range_count = 0 THEN
    v_medio := v_init;
  END IF;

  RETURN jsonb_build_object(
    'estoqueInicial', COALESCE(v_init, jsonb_build_object('pecas', 0, 'valorCusto', 0, 'valorVenda', 0)),
    'estoqueMedio',   v_medio,
    'hasData',        (v_init_date IS NOT NULL OR v_range_count > 0)
  );
END;
$fn$;

-- ── get_division_replenishments (corpo de 038_division_inventory_position.sql) ────
CREATE OR REPLACE FUNCTION public.get_division_replenishments(
  p_tenant_id uuid,
  p_division  text,
  p_date_from date,
  p_date_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pecas numeric;
  v_count int;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT COALESCE(SUM(po.quantity_ordered), 0), count(*)
  INTO v_pecas, v_count
  FROM purchase_orders po
  JOIN products p ON p.sku = po.sku AND p.tenant_id = po.tenant_id
  WHERE po.tenant_id = p_tenant_id
    AND p.division = p_division
    AND po.expected_delivery BETWEEN p_date_from AND p_date_to;

  RETURN jsonb_build_object('pecas', v_pecas, 'hasOrders', v_count > 0);
END;
$fn$;

-- ── get_division_giro_by_risk_level (corpo de 039_division_giro_by_risk_level.sql) ────
CREATE OR REPLACE FUNCTION public.get_division_giro_by_risk_level(
  p_tenant_id uuid,
  p_division  text,
  p_date_from date,
  p_date_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_init_date date;
  v_result    jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT snap.snapshot_date INTO v_init_date
  FROM inventory_snapshots snap
  JOIN products p ON p.sku = snap.sku AND p.tenant_id = snap.tenant_id
  WHERE snap.tenant_id = p_tenant_id AND p.division = p_division AND snap.snapshot_date <= p_date_from
  ORDER BY snap.snapshot_date DESC
  LIMIT 1;

  WITH init_by_risk AS (
    SELECT COALESCE(p.risk_level, 'sem_classificacao') AS risk_level,
           SUM(snap.quantity) AS pecas
    FROM inventory_snapshots snap
    JOIN products p ON p.sku = snap.sku AND p.tenant_id = snap.tenant_id
    WHERE snap.tenant_id = p_tenant_id AND p.division = p_division AND snap.snapshot_date = v_init_date
    GROUP BY COALESCE(p.risk_level, 'sem_classificacao')
  ),
  medio_by_risk AS (
    SELECT risk_level, AVG(pecas) AS pecas FROM (
      SELECT COALESCE(p.risk_level, 'sem_classificacao') AS risk_level,
             snap.snapshot_date AS d,
             SUM(snap.quantity) AS pecas
      FROM inventory_snapshots snap
      JOIN products p ON p.sku = snap.sku AND p.tenant_id = snap.tenant_id
      WHERE snap.tenant_id = p_tenant_id AND p.division = p_division
        AND snap.snapshot_date BETWEEN p_date_from AND p_date_to
      GROUP BY COALESCE(p.risk_level, 'sem_classificacao'), snap.snapshot_date
    ) t
    GROUP BY risk_level
  ),
  vendas_by_risk AS (
    SELECT COALESCE(p.risk_level, 'sem_classificacao') AS risk_level,
           SUM(sh.quantity) AS pecas
    FROM sales_history sh
    JOIN products p ON p.sku = sh.sku AND p.tenant_id = sh.tenant_id
    WHERE sh.tenant_id = p_tenant_id AND p.division = p_division
      AND sh.sale_date BETWEEN p_date_from AND p_date_to
    GROUP BY COALESCE(p.risk_level, 'sem_classificacao')
  ),
  all_risks AS (
    SELECT risk_level FROM init_by_risk
    UNION SELECT risk_level FROM medio_by_risk
    UNION SELECT risk_level FROM vendas_by_risk
  )
  SELECT jsonb_object_agg(
    r.risk_level,
    jsonb_build_object(
      'estoqueInicialPecas', COALESCE(i.pecas, 0),
      'estoqueMedioPecas',   COALESCE(m.pecas, i.pecas, 0),
      'vendasPecas',         COALESCE(v.pecas, 0),
      'giro', CASE WHEN COALESCE(m.pecas, i.pecas, 0) > 0
                   THEN round(COALESCE(v.pecas, 0) / COALESCE(m.pecas, i.pecas), 2)
                   ELSE NULL END
    )
  ) INTO v_result
  FROM all_risks r
  LEFT JOIN init_by_risk   i ON i.risk_level = r.risk_level
  LEFT JOIN medio_by_risk  m ON m.risk_level = r.risk_level
  LEFT JOIN vendas_by_risk v ON v.risk_level = r.risk_level;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$fn$;

-- ── get_plan_cascade_status (corpo de 040_plan_cascade_runs.sql) ────────────
CREATE OR REPLACE FUNCTION public.get_plan_cascade_status(
  p_tenant_id uuid,
  p_year      int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_expected_count int;
  v_done_count     int;
  v_steps          jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT jsonb_agg(jsonb_build_object('module', module, 'seasonId', season_id, 'status', status, 'errorMessage', error_message) ORDER BY module, season_id)
  INTO v_steps
  FROM public.plan_cascade_runs
  WHERE tenant_id = p_tenant_id AND year = p_year;

  IF v_steps IS NULL THEN
    RETURN jsonb_build_object('closed', false, 'started', false, 'steps', '[]'::jsonb);
  END IF;

  -- Quantidade esperada de etapas: module 2 + module 3 (1 cada) + 3 módulos
  -- (4,5,6) por temporada do ano fiscal.
  SELECT 2 + 3 * count(*) INTO v_expected_count
  FROM public.seasons s
  WHERE s.tenant_id = p_tenant_id AND s.fiscal_year = p_year;

  SELECT count(*) INTO v_done_count
  FROM public.plan_cascade_runs
  WHERE tenant_id = p_tenant_id AND year = p_year AND status = 'done';

  RETURN jsonb_build_object(
    'closed',  (v_done_count > 0 AND v_done_count = v_expected_count),
    'started', true,
    'steps',   v_steps
  );
END;
$fn$;

-- ── Permissões ─────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.classify_color(text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.classify_color(text, text, text, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recompute_official_macro(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recompute_official_macro(uuid, int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_division_inventory_position(uuid, text, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_division_inventory_position(uuid, text, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_division_replenishments(uuid, text, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_division_replenishments(uuid, text, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_division_giro_by_risk_level(uuid, text, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_division_giro_by_risk_level(uuid, text, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_plan_cascade_status(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_plan_cascade_status(uuid, int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_sales_monthly_aggregates(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_sales_monthly_aggregates(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_hierarchy_revenue_by_path(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_hierarchy_revenue_by_path(uuid) TO authenticated, service_role;


-- ── plan_cascade_runs: mesmo padrão de collection_plans (024) ──────────────
DROP POLICY IF EXISTS plan_cascade_runs_select ON public.plan_cascade_runs;
DROP POLICY IF EXISTS plan_cascade_runs_insert ON public.plan_cascade_runs;
DROP POLICY IF EXISTS plan_cascade_runs_update ON public.plan_cascade_runs;
DROP POLICY IF EXISTS plan_cascade_runs_delete ON public.plan_cascade_runs;

CREATE POLICY tenant_select_plan_cascade_runs ON public.plan_cascade_runs
  FOR SELECT USING (tenant_id = get_tenant_id() OR is_super_admin());
CREATE POLICY tenant_insert_plan_cascade_runs ON public.plan_cascade_runs
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY tenant_update_plan_cascade_runs ON public.plan_cascade_runs
  FOR UPDATE USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY tenant_delete_plan_cascade_runs ON public.plan_cascade_runs
  FOR DELETE USING (tenant_id = get_tenant_id());
