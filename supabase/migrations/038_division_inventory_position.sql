-- 038_division_inventory_position.sql
-- Posição real de estoque e reposições por DIVISÃO (M4 — Bloco Volume/Cobertura).
-- Agregação feita em Postgres (SECURITY DEFINER + filtro explícito de tenant,
-- mesmo padrão usado para sales_history) para evitar buscar toda a lista de
-- SKUs da divisão no cliente e montar um .in() potencialmente enorme.

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

GRANT EXECUTE ON FUNCTION public.get_division_inventory_position(uuid, text, date, date) TO anon, authenticated;

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

GRANT EXECUTE ON FUNCTION public.get_division_replenishments(uuid, text, date, date) TO anon, authenticated;
