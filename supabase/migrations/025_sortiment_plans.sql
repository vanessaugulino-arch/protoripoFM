-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 025 — sortiment_plans (Módulo 6 — Engenharia de Sortimento)
--
-- BUG encontrado ao testar as telas após a Fase 4/5: sortimentPlanService.ts
-- sempre gravou/leu de "sortiment_plans", mas essa tabela nunca existiu de
-- fato em produção. O migration 010_collections_sortiment_plan_cycles.sql
-- (tracked no repo) tentava criá-la junto de outras 5 tabelas — mas só
-- collections/annual_plan_cycles/planning_scenarios/channel_scenarios/
-- division_scenarios foram efetivamente criadas em produção (por outro
-- caminho, com o padrão de RLS corrigido); sortiment_plans ficou pra trás.
-- Resultado: todo o M6 (salvar/aplicar cenário, plano de trabalho) falhava
-- silenciosamente (chamadas .catch(()=>{}) engoliam o erro).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sortiment_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  name        text        NOT NULL DEFAULT 'Plano Principal',
  divisions   jsonb       NOT NULL DEFAULT '{}',
  is_applied  boolean     NOT NULL DEFAULT false,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

CREATE INDEX IF NOT EXISTS sortiment_plans_tenant_season_idx
  ON public.sortiment_plans (tenant_id, season_id);

ALTER TABLE public.sortiment_plans ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão real de produção (get_tenant_id() + is_super_admin(), 4
-- policies por operação) usado em division_scenarios/collection_plans —
-- NÃO o padrão profiles/auth.uid() do migration 010 tracked (obsoleto).
CREATE POLICY tenant_select_sortiment_plans
  ON public.sortiment_plans FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_sortiment_plans
  ON public.sortiment_plans FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_sortiment_plans
  ON public.sortiment_plans FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_sortiment_plans
  ON public.sortiment_plans FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.sortiment_plans IS
  'Planos de sortimento (Módulo 6 — Engenharia de Sortimento) — plano de '
  'trabalho (is_applied=true, name=''__working__'') + cenários nomeados '
  '(is_applied=false), mesmo padrão de collection_plans.';
COMMENT ON COLUMN public.sortiment_plans.divisions IS
  'JSONB: Record<divisionId, dados de sortimento por divisão> (Division[] no front)';
