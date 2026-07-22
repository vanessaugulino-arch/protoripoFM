-- 022_official_plan_phase1.sql
-- Fase 1 da arquitetura bottom-up: o Plano Oficial único.
--
-- O annual_plan_cycles (âncora tenant+year já existente) passa a guardar o macro
-- canônico e ponteiros para o cenário aplicado em cada nível. Os dados detalhados
-- PERMANECEM nas tabelas de cenário (channel_scenarios, division_scenarios,
-- planning_scenarios) — sem cópia, sem risco de divergência. O macro é sempre
-- DERIVADO da base pela função recompute_official_macro (primazia dos absolutos).

-- ── Colunas do Plano Oficial ──────────────────────────────────────────────────
ALTER TABLE public.annual_plan_cycles
  ADD COLUMN IF NOT EXISTS detail_level                  smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS official_macro                jsonb,
  ADD COLUMN IF NOT EXISTS applied_channel_scenario_id   uuid,
  ADD COLUMN IF NOT EXISTS applied_division_scenario_id  uuid,
  ADD COLUMN IF NOT EXISTS applied_month_scenario_id     uuid,
  ADD COLUMN IF NOT EXISTS applied_sortiment_scenario_id uuid;

COMMENT ON COLUMN public.annual_plan_cycles.detail_level IS
  'Até onde o Plano Oficial avançou: 1=Macro(M1) 2=Canal(M2) 3=Divisão(M3) 4=Mensal(M4) 5=Sortimento(M5)';
COMMENT ON COLUMN public.annual_plan_cycles.official_macro IS
  'Macro canônico do ciclo, sempre derivado dos níveis inferiores aplicados (primazia dos absolutos). Nunca editado à mão.';

-- Ponteiros com ON DELETE SET NULL: se o cenário aplicado for excluído, o ponteiro zera.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='apc_applied_channel_fk') THEN
    ALTER TABLE public.annual_plan_cycles
      ADD CONSTRAINT apc_applied_channel_fk
      FOREIGN KEY (applied_channel_scenario_id)
      REFERENCES public.channel_scenarios(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='apc_applied_division_fk') THEN
    ALTER TABLE public.annual_plan_cycles
      ADD CONSTRAINT apc_applied_division_fk
      FOREIGN KEY (applied_division_scenario_id)
      REFERENCES public.division_scenarios(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='apc_applied_month_fk') THEN
    ALTER TABLE public.annual_plan_cycles
      ADD CONSTRAINT apc_applied_month_fk
      FOREIGN KEY (applied_month_scenario_id)
      REFERENCES public.planning_scenarios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Função de recompute do macro (primazia dos absolutos) ─────────────────────
-- Recalcula o macro a partir do cenário de canal (M2) aplicado. Consistente com o
-- T3 (markdown corrói a margem): custoMedio exclui markdown. Se não há canal
-- aplicado, retorna NULL e não altera o macro.
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

GRANT EXECUTE ON FUNCTION public.recompute_official_macro(uuid, int) TO anon, authenticated;
