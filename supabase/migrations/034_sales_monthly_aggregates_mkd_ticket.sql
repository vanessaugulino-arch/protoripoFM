-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 034 — get_sales_monthly_aggregates ganha MKD% real e Ticket Médio
--
-- Fecha dois gaps do HISTORICAL_CASCADE_ARCHITECTURE.md na mesma função,
-- reaproveitando o join/agregação já existente (canal/divisão/ano/mês) em vez
-- de criar uma função nova:
--
-- 1) MKD % (remarcação) real — nunca esteve implementado em nenhuma função
--    SQL. Fórmula confirmada: Σdiscount_value ÷ Σ(quantity × products.price_sale).
--    Como é uma razão entre duas somas (não uma média direta), expõe as duas
--    somas separadas (discount_sum, price_sale_qty_sum) — o chamador divide
--    depois de somar por grupo, nunca soma percentuais já calculados.
--
-- 2) Ticket Médio — agora que sales_history tem receipt_number (migration
--    033), expõe receipt_count = COUNT(DISTINCT receipt_number) por grupo.
--    Ticket Médio = revenue_net (já retornado) ÷ receipt_count. Continua
--    "sem dado" quando receipt_count = 0 (histórico ainda sem cupom/pedido
--    importado) — nunca é fabricado.
--
-- 3) Corrige margin_weighted_sum, que na migration 026 usava price_realized
--    como base — a fórmula real confirmada usa revenue_net_post_tax (venda
--    já líquida de imposto): (revenue_net_post_tax − quantity×price_cost) /
--    revenue_net_post_tax × 100. Continua ponderado por revenue_net, então
--    a reconstrução em historicalProfileService.ts (soma ponderada / soma
--    dos pesos) não muda — só o número fica mais correto.
--
-- 4) margin_weighted_sum, discount_sum e price_sale_qty_sum só somam linhas
--    com produto casado (p.sku IS NOT NULL) — achado ao testar: ~27% da
--    receita deste tenant casa com o catálogo atual de products (SKUs de
--    coleções antigas/descontinuadas não estão mais lá). Sem esse filtro,
--    COALESCE(p.price_cost,0) faz toda linha sem produto virar "margem
--    100%" e toda linha sem produto entrar no desconto do MKD% sem entrar
--    no denominador — inflando os dois artificialmente. Com o filtro, os
--    dois ficam calculados só sobre a fatia com dado real de produto (mesmo
--    princípio de "nunca fabricar", aplicado à ponderação, não só à
--    presença da linha).
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_sales_monthly_aggregates(uuid);

CREATE FUNCTION public.get_sales_monthly_aggregates(p_tenant_id uuid)
RETURNS TABLE (
  channel               text,
  division              text,
  sale_year             int,
  sale_month            int,
  revenue_net           numeric,
  quantity              numeric,
  price_realized_sum    numeric,
  price_realized_count  bigint,
  pmv_weighted_sum      numeric,
  cost_weighted_sum     numeric,
  margin_weighted_sum   numeric,
  discount_sum          numeric,
  price_sale_qty_sum    numeric,
  receipt_count         bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sh.channel,
    p.division,
    EXTRACT(YEAR  FROM sh.sale_date)::int AS sale_year,
    EXTRACT(MONTH FROM sh.sale_date)::int AS sale_month,
    SUM(sh.revenue_net)                                                 AS revenue_net,
    SUM(sh.quantity)                                                    AS quantity,
    SUM(sh.price_realized) FILTER (WHERE sh.price_realized > 0)         AS price_realized_sum,
    COUNT(*)               FILTER (WHERE sh.price_realized > 0)         AS price_realized_count,
    SUM(COALESCE(sh.price_realized, p.price_sale, 0) * sh.revenue_net)  AS pmv_weighted_sum,
    SUM(COALESCE(p.price_cost, 0) * sh.revenue_net)                     AS cost_weighted_sum,
    SUM(
      CASE WHEN p.sku IS NOT NULL AND COALESCE(sh.revenue_net_post_tax, sh.revenue_net) > 0
        THEN ((COALESCE(sh.revenue_net_post_tax, sh.revenue_net) - p.price_cost * sh.quantity)
              / COALESCE(sh.revenue_net_post_tax, sh.revenue_net) * 100) * sh.revenue_net
        ELSE 0
      END
    )                                                                    AS margin_weighted_sum,
    SUM(sh.discount_value) FILTER (WHERE p.sku IS NOT NULL)              AS discount_sum,
    SUM(sh.quantity * p.price_sale) FILTER (WHERE p.sku IS NOT NULL)     AS price_sale_qty_sum,
    COUNT(DISTINCT sh.receipt_number) FILTER (WHERE sh.receipt_number IS NOT NULL) AS receipt_count
  FROM public.sales_history sh
  LEFT JOIN public.products p ON p.sku = sh.sku AND p.tenant_id = sh.tenant_id
  WHERE sh.tenant_id = p_tenant_id
    AND (p_tenant_id = get_tenant_id() OR is_super_admin())
    AND sh.revenue_net IS NOT NULL
    AND sh.revenue_net > 0
    AND sh.sale_date IS NOT NULL
  GROUP BY sh.channel, p.division, sale_year, sale_month
$$;

COMMENT ON FUNCTION public.get_sales_monthly_aggregates(uuid) IS
  'Agregação mensal de sales_history por canal/divisão. margin_weighted_sum '
  'usa revenue_net_post_tax (fórmula real, corrigida 2026-09-16). '
  'discount_sum/price_sale_qty_sum alimentam MKD% real (dividir depois de '
  'somar por grupo, nunca antes). receipt_count alimenta Ticket Médio '
  '(revenue_net / receipt_count) — fica 0 até o histórico ter receipt_number '
  'populado (migration 033).';
