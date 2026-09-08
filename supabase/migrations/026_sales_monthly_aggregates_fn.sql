-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 026 — get_sales_monthly_aggregates(p_tenant_id)
--
-- BUG real corrigido aqui, achado ao investigar "por que a Sazonalidade do
-- ano fiscal 2028 só mostra venda em 3 meses": todo cálculo de sazonalidade/
-- perfil histórico (getChannelSeasonality, getHistoricalProfiles,
-- getDivisionSeasonality, e dois fetches em CycleValidation.tsx) buscava as
-- linhas CRUAS de sales_history com um LIMIT fixo (5.000 a 150.000) e
-- agregava em JavaScript. Isso funcionava enquanto o tenant tinha poucas
-- linhas — mas sales_history deste tenant já tem 637 mil+ linhas, e sem
-- ORDER BY o Postgres devolve as primeiras que achar fisicamente, não uma
-- amostra representativa do ano inteiro. Resultado: a "sazonalidade
-- histórica" calculada refletia só 2-3 meses de dados (o que coube no
-- limite), não o ano inteiro — daí meses "sem venda nenhuma" que na
-- realidade têm venda real no banco.
--
-- Correção: agrega no banco (GROUP BY canal/divisão/ano/mês) em vez de trazer
-- linha a linha pro JS. O resultado tem, no máximo, canais × divisões ×
-- meses × anos linhas (poucas centenas) — nunca precisa de LIMIT. Os campos
-- *_weighted_sum já vêm ponderados por receita (revenue_net), pra quem
-- calcula PMV/custo/margem médios reconstruir a média ponderada só dividindo
-- pelo revenue_net do grupo — mesma fórmula que já existia em JS, só
-- computada no banco em vez de linha a linha no cliente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_monthly_aggregates(p_tenant_id uuid)
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
  margin_weighted_sum   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER (não INVOKER): a primeira versão desta função rodava
  -- como o papel autenticado do cliente, o que faz o Postgres reavaliar a
  -- policy de RLS (tenant_id = get_tenant_id()) linha a linha durante o JOIN
  -- + GROUP BY sobre 637 mil+ linhas — na prática, o client-side sempre
  -- estourava o statement_timeout do pooler e voltava um array vazio (sem
  -- erro visível na tela, só nenhum dado). Rodando como DEFINER a RLS é
  -- ignorada (evita a reavaliação linha a linha), mas a filtragem por tenant
  -- continua obrigatória abaixo — sem ela, qualquer usuário autenticado
  -- poderia passar o tenant_id de outra empresa e ler os dados dela.
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
      CASE WHEN COALESCE(sh.price_realized, p.price_sale, 0) > 0
        THEN ((COALESCE(sh.price_realized, p.price_sale, 0) - COALESCE(p.price_cost, 0))
              / COALESCE(sh.price_realized, p.price_sale, 0) * 100) * sh.revenue_net
        ELSE 0
      END
    )                                                                    AS margin_weighted_sum
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
  'Agregação mensal de sales_history por canal/divisão — substitui o padrão '
  'de trazer linhas cruas com LIMIT fixo pro JS, que ficou incorreto assim '
  'que um tenant passou a ter mais linhas do que o limite (sazonalidade '
  'calculada refletia só uma fatia arbitrária do histórico). Campos '
  '*_weighted_sum já vêm × revenue_net, pra reconstruir médias ponderadas '
  'sem reprocessar linha a linha no cliente.';
