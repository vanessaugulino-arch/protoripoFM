-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 027 — get_hierarchy_revenue_by_path ganha risk_level
--
-- Fase A da Cascata do Sortimento editável (Aba 1: grid Faixa de Preço ×
-- Nível de Moda, por categoria): a usuária foi explícita — os números do
-- grid não podem ser inventados, têm que nascer do histórico real da
-- CATEGORIA, não de uma média uniforme da divisão inteira (o riskMatrix do
-- M4 é só 3 valores por divisão, igual pra toda categoria dela — não serve
-- pra semear um grid que varia categoria a categoria).
--
-- products.risk_level já é um dado real, 100% preenchido por SKU (básico/
-- motor_giro/sustentador/icone) — só nunca tinha sido cruzado com
-- sales_history por categoria. Adiciona essa coluna à função que já existia
-- (get_hierarchy_revenue_by_path, migration 023), em vez de criar uma função
-- irmã: mesma agregação, mesmo peso, um group by a mais. Consumidores
-- existentes (consolidatedHierarchyService.ts) continuam funcionando —
-- ganham um campo novo que já sabem ignorar.
--
-- CREATE OR REPLACE não permite mudar as colunas de retorno — precisa DROP.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_hierarchy_revenue_by_path(uuid);

CREATE OR REPLACE FUNCTION public.get_hierarchy_revenue_by_path(p_tenant_id uuid)
RETURNS TABLE (
  division      text,
  category      text,
  subcategory   text,
  linha         text,
  risk_level    text,
  total_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER (não INVOKER, que era o padrão implícito da versão
  -- anterior): mesmo motivo já documentado em get_sales_monthly_aggregates
  -- (migration 026) — join grande sobre sales_history com RLS avaliada linha
  -- a linha estoura o statement_timeout do cliente silenciosamente. Filtro
  -- de tenant explícito abaixo preserva o isolamento sem o custo do RLS.
  SELECT
    p.division,
    p.category,
    p.subcategory,
    p.linha,
    p.risk_level,
    SUM(s.revenue_net)::numeric AS total_revenue
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
  'Peso puro (sem regra de negócio) usado por consolidatedHierarchyService.ts '
  'para estimar categoria/subcategoria/linha, e pelo grid de participação por '
  'faixa de preço × nível de risco da Cascata do Sortimento (M6).';
