-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 024 — Plano de Coleção (Fase 4/5)
--
-- Novo Módulo 5 — "Plano de Coleção": régua de tempo da temporada onde o
-- usuário distribui o volume de peças estimado (definido no M4/Divisão,
-- volumeCoverage.productionVolume) entre coleções/drops por mês. Mesmo
-- padrão de sortiment_plans (Módulo 6 — Engenharia de Sortimento, era M5):
-- plano de trabalho (is_applied=true, name='__working__') + simulações
-- nomeadas (is_applied=false), tudo em divisions jsonb.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.collection_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  name        text        NOT NULL DEFAULT 'Plano Principal',
  divisions   jsonb       NOT NULL DEFAULT '{}',
  is_applied  boolean     NOT NULL DEFAULT false,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

CREATE INDEX IF NOT EXISTS collection_plans_tenant_season_idx
  ON public.collection_plans (tenant_id, season_id);

ALTER TABLE public.collection_plans ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de division_scenarios/sortiment_plans em produção
-- (get_tenant_id() + is_super_admin(), 4 policies por operação).
CREATE POLICY tenant_select_collection_plans
  ON public.collection_plans FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_collection_plans
  ON public.collection_plans FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_collection_plans
  ON public.collection_plans FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_collection_plans
  ON public.collection_plans FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.collection_plans IS
  'Plano de Coleção (Módulo 5, Fase 4/5) — distribui o volume de peças '
  'estimado do M4/Divisão entre coleções/drops por mês, com cenários '
  'nomeados e plano de trabalho, mesmo padrão de sortiment_plans.';
COMMENT ON COLUMN public.collection_plans.divisions IS
  'JSONB: Record<divisionId, { targetPieces, entries: CollectionPlanEntry[] }> '
  '— entries = coleções/drops com mês, tipo e peças planejadas.';
