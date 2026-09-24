-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 042 — get_hierarchy_revenue_by_path ganha PMV e MKD% reais
--
-- A usuária pediu Ano Anterior (real) também nos indicadores por CATEGORIA
-- na Engenharia de Sortimento (Preço Médio e Remarcação) — hoje só existia
-- pra Participação (peso histórico por categoria, já usado pra semear o
-- grid). Mesma agregação já existente (mesmo join sales_history×products,
-- mesmo group by), ganhando mais colunas de soma — mesmo princípio das
-- migrations 027 (risk_level) e 034 (PMV/MKD% real por canal/divisão):
-- nunca somar percentuais já calculados, sempre expor as somas separadas
-- pro chamador dividir depois de agregar por grupo.
--
-- PMV = Σ(price_realized ou products.price_sale como fallback) × revenue_net
--       ÷ Σrevenue_net (ponderado, mesma fórmula de pmv_weighted_sum já usada
--       em get_sales_monthly_aggregates).
-- MKD% = Σdiscount_value ÷ Σ(quantity × products.price_sale) — mesma fórmula
--        confirmada na migration 034, agora também por categoria.
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
  price_sale_qty_sum numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER: mesmo motivo já documentado em get_sales_monthly_aggregates
  -- (migration 026) — join grande sobre sales_history com RLS avaliada linha a
  -- linha estoura o statement_timeout do cliente silenciosamente. Filtro de
  -- tenant explícito abaixo preserva o isolamento sem o custo do RLS.
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
    SUM(s.quantity * p.price_sale)::numeric AS price_sale_qty_sum
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
  'PMV e MKD% reais por categoria (dividir depois de somar por grupo, nunca '
  'antes) — usados pelo Ano Anterior da Engenharia de Sortimento (M6). Peso '
  'puro (sem regra de negócio) usado também por consolidatedHierarchyService.ts '
  'e pelo grid de participação por faixa de preço × nível de risco (M6).';
