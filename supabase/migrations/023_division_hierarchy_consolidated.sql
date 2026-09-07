-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 023 — Consolidado de Planejamento por Hierarquia (Fase 2)
--
-- Cruza os inputs reais já configurados no M3/Pirâmide de Preço com a
-- hierarquia completa do catálogo (divisão→categoria→subcategoria→linha),
-- para que o planejamento efetivo possa ser consultado/exportado a qualquer
-- momento — hoje isso só existia em memória, espalhado entre duas telas.
--
-- O que é INPUT real do usuário (não estimado):
--   • riskMatrix por divisão      — division_scenarios.divisions (M3)
--   • faixa de preço por categoria — price_pyramid_plans.plan (Pirâmide de Preço)
--
-- O que é ESTIMADO (proporcional à receita histórica, sem input direto hoje):
--   • participação de cada categoria dentro da divisão
--   • participação de cada subcategoria/linha dentro da categoria
--
-- get_hierarchy_revenue_by_path fornece o peso histórico (sales_history ×
-- products) usado nessas duas estimativas — a composição fica no
-- consolidatedHierarchyService.ts (TypeScript), não em PL/pgSQL, para manter
-- a lógica de negócio fácil de revisar e ajustar sem depender de migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.division_hierarchy_consolidated (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL,
  season_id               text NOT NULL,
  division_id             text NOT NULL,
  category                text NOT NULL,
  subcategory             text NOT NULL DEFAULT '(sem subcategoria)',
  linha                   text NOT NULL DEFAULT '(sem linha)',
  price_tier              text NOT NULL CHECK (price_tier IN ('p1', 'p2', 'p3')),
  revenue_estimate        numeric NOT NULL DEFAULT 0,
  pct_sustentador_margem  numeric,
  pct_motor_giro          numeric,
  pct_icone_marca         numeric,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, season_id, division_id, category, subcategory, linha, price_tier)
);

CREATE INDEX IF NOT EXISTS division_hierarchy_consolidated_lookup_idx
  ON public.division_hierarchy_consolidated (tenant_id, season_id, division_id);

ALTER TABLE public.division_hierarchy_consolidated ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de division_scenarios/annual_plan_cycles (get_tenant_id() +
-- is_super_admin(), 4 policies por operação) — não o padrão mais antigo
-- (profiles/auth.uid() direto) que aparecia nas migrations rastreadas; a
-- tabela em produção já foi migrada para este padrão novo.
CREATE POLICY tenant_select_division_hierarchy_consolidated
  ON public.division_hierarchy_consolidated FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_division_hierarchy_consolidated
  ON public.division_hierarchy_consolidated FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_division_hierarchy_consolidated
  ON public.division_hierarchy_consolidated FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_division_hierarchy_consolidated
  ON public.division_hierarchy_consolidated FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.division_hierarchy_consolidated IS
  'Consolidado de planejamento cruzando divisão→categoria→subcategoria→linha '
  'com faixa de preço (P1/P2/P3). riskMatrix (as 3 colunas pct_*) e a faixa de '
  'preço por categoria são inputs reais (M3 e Pirâmide de Preço); a divisão de '
  'receita entre categoria/subcategoria/linha é estimada proporcionalmente à '
  'receita histórica (sales_history × products) — não é input do usuário. '
  'Recalculado sempre que o M3 aplica um cenário ou a Pirâmide de Preço salva.';

-- ── 2. Peso histórico por caminho de hierarquia ────────────────────────────────
-- Agregação simples (sem regra de negócio) — usada pelo TS como peso para
-- distribuir os totais planejados de divisão/categoria até subcategoria/linha.

CREATE OR REPLACE FUNCTION public.get_hierarchy_revenue_by_path(p_tenant_id uuid)
RETURNS TABLE (
  division      text,
  category      text,
  subcategory   text,
  linha         text,
  total_revenue numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.division,
    p.category,
    p.subcategory,
    p.linha,
    SUM(s.revenue_net)::numeric AS total_revenue
  FROM public.sales_history s
  JOIN public.products p
    ON p.sku = s.sku AND p.tenant_id = s.tenant_id
  WHERE s.tenant_id = p_tenant_id
    AND s.revenue_net IS NOT NULL
    AND p.division IS NOT NULL
    AND p.category IS NOT NULL
  GROUP BY p.division, p.category, p.subcategory, p.linha;
$$;

COMMENT ON FUNCTION public.get_hierarchy_revenue_by_path IS
  'Receita histórica somada por caminho completo de hierarquia, via join '
  'sales_history×products por SKU. Peso puro (sem regra de negócio) usado por '
  'consolidatedHierarchyService.ts para estimar categoria/subcategoria/linha.';
