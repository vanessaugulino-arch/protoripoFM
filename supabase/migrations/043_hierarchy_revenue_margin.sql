-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 043 — get_hierarchy_revenue_by_path ganha Margem real
--
-- Plano Final (tela de entrega M1-M6) precisa de Margem % por categoria —
-- mesma agregação já existente, mais uma coluna de soma. Fórmula idêntica à
-- já confirmada na migration 034 (margin_weighted_sum por canal/divisão):
-- (revenue_net_post_tax − quantity×price_cost) ÷ revenue_net_post_tax × 100,
-- ponderado por revenue_net — dividir depois de somar por grupo, nunca soma
-- de percentuais já calculados.
--
-- CREATE OR REPLACE não permite mudar as colunas de retorno — precisa DROP.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_hierarchy_revenue_by_path(uuid);

CREATE OR REPLACE FUNCTION public.get_hierarchy_revenue_by_path(p_tenant_id uuid)
RETURNS TABLE (
  division           text,
  category           text,
  subcategory        text,
  linha              text,
  risk_level         text,
  total_revenue      numeric,
  quantity_sum       numeric,
  pmv_weighted_sum   numeric,
  discount_sum       numeric,
  price_sale_qty_sum numeric,
  margin_weighted_sum numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.division,
    p.category,
    p.subcategory,
    p.linha,
    p.risk_level,
    SUM(s.revenue_net)::numeric AS total_revenue,
    SUM(s.quantity)::numeric AS quantity_sum,
    SUM(COALESCE(s.price_realized, p.price_sale, 0) * s.revenue_net)::numeric AS pmv_weighted_sum,
    SUM(s.discount_value)::numeric AS discount_sum,
    SUM(s.quantity * p.price_sale)::numeric AS price_sale_qty_sum,
    SUM(
      CASE WHEN COALESCE(s.revenue_net_post_tax, s.revenue_net) > 0
        THEN ((COALESCE(s.revenue_net_post_tax, s.revenue_net) - p.price_cost * s.quantity)
              / COALESCE(s.revenue_net_post_tax, s.revenue_net) * 100) * s.revenue_net
        ELSE 0
      END
    )::numeric AS margin_weighted_sum
  FROM public.sales_history s
  JOIN public.products p
    ON p.sku = s.sku AND p.tenant_id = s.tenant_id
  WHERE s.tenant_id = p_tenant_id
    AND (p_tenant_id = get_tenant_id() OR is_super_admin())
    AND s.revenue_net IS NOT NULL
    AND p.division IS NOT NULL
    AND p.category IS NOT NULL
  GROUP BY p.division, p.category, p.subcategory, p.linha, p.risk_level;
$$;

COMMENT ON FUNCTION public.get_hierarchy_revenue_by_path IS
  'Receita histórica somada por caminho completo de hierarquia + nível de '
  'risco (products.risk_level), via join sales_history×products por SKU. '
  'quantity_sum/pmv_weighted_sum/discount_sum/price_sale_qty_sum alimentam '
  'PMV e MKD% reais por categoria; margin_weighted_sum alimenta a Margem % '
  'real por categoria (Plano Final, M1-M6) — todas dividir depois de somar '
  'por grupo, nunca antes. Peso puro (sem regra de negócio) usado também por '
  'consolidatedHierarchyService.ts e pelo grid Faixa×Risco (M6).';
