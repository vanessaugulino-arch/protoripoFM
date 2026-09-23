-- 039_division_giro_by_risk_level.sql
-- Giro por nível de risco (products.risk_level: basico/motor_giro/sustentador/
-- icone) dentro de uma divisão e período — fecha o gap do M5 (Plano de
-- Coleção), que hoje não expõe nenhuma quebra por risco (Marina não
-- conseguia ver "Giro de Sustentador de Margem e Básico" em lugar nenhum).
-- Giro em peças: vendas_pecas (sales_history) ÷ estoque_medio_pecas
-- (inventory_snapshots) — mesma convenção usada no cluster do M4.

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

GRANT EXECUTE ON FUNCTION public.get_division_giro_by_risk_level(uuid, text, date, date) TO anon, authenticated;
