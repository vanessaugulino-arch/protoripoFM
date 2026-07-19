-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010 — Eliminar dependência de localStorage para dados de negócio
--
-- Novas tabelas:
--   collections          — Coleções/Drops (antes em localStorage)
--   sortiment_plans      — Planos de sortimento M5 (antes em localStorage)
--   annual_plan_cycles   — Ciclos anuais M1 (antes em localStorage via planCycle.ts)
--   planning_scenarios   — Cenários de planejamento M1 (antes em localStorage)
--   channel_scenarios    — Cenários M2 (antes em localStorage)
--   division_scenarios   — Cenários M3 (antes em localStorage)
--
-- Nota: annual_plan_cycles, planning_scenarios, channel_scenarios e
--       division_scenarios podem já existir em ambientes com migrações parciais.
--       Usamos CREATE TABLE IF NOT EXISTS em todos.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. collections (Coleções / Drops) ────────────────────────────────────────
-- Vinculada a uma temporada (season_id). Datas podem ser atualizadas mas a
-- coleção não pode ser excluída enquanto tiver produtos em produção.

CREATE TABLE IF NOT EXISTS public.collections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  season_id   uuid        NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  data_inicio date        NOT NULL,
  data_fim    date        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_collections" ON public.collections
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS collections_tenant_season_idx
  ON public.collections (tenant_id, season_id);

COMMENT ON TABLE  public.collections              IS 'Coleções e drops por temporada — substituí fashionmind_colecoes do localStorage';
COMMENT ON COLUMN public.collections.season_id    IS 'FK para seasons.id — a coleção pertence a uma temporada';
COMMENT ON COLUMN public.collections.data_inicio  IS 'Data de início (deve estar dentro do intervalo de meses da temporada)';
COMMENT ON COLUMN public.collections.data_fim     IS 'Data de fim da coleção/drop';


-- ── 2. sortiment_plans (Plano de Sortimento M5) ───────────────────────────────
-- Um plano por temporada por tenant. Armazena as divisões e suas alocações.

CREATE TABLE IF NOT EXISTS public.sortiment_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  season_id   uuid        NOT NULL,
  name        text        NOT NULL DEFAULT 'Plano Principal',
  divisions   jsonb       NOT NULL DEFAULT '{}',
  is_applied  boolean     NOT NULL DEFAULT false,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

ALTER TABLE public.sortiment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_sortiment_plans" ON public.sortiment_plans
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS sortiment_plans_tenant_season_idx
  ON public.sortiment_plans (tenant_id, season_id);

COMMENT ON TABLE  public.sortiment_plans           IS 'Planos de sortimento M5 — substituí fashionmind_sortiment_<seasonId> do localStorage';
COMMENT ON COLUMN public.sortiment_plans.divisions IS 'JSONB: Record<divisionId, SortimentDivisionData> com alocações por divisão';


-- ── 3. annual_plan_cycles (Ciclos Anuais M1) ─────────────────────────────────
-- Um ciclo por ano fiscal por tenant. Armazena foco estratégico e prioridades.

CREATE TABLE IF NOT EXISTS public.annual_plan_cycles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year              integer     NOT NULL,
  mode              text        NOT NULL DEFAULT 'new',
  focus             text        NOT NULL DEFAULT 'crescimento',
  custom_focus_name text,
  field_priorities  jsonb       NOT NULL DEFAULT '[]',
  versions          jsonb       NOT NULL DEFAULT '[]',
  applied_at        timestamptz,
  applied_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, year)
);

ALTER TABLE public.annual_plan_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_annual_plan_cycles" ON public.annual_plan_cycles
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS annual_plan_cycles_tenant_year_idx
  ON public.annual_plan_cycles (tenant_id, year);

COMMENT ON TABLE  public.annual_plan_cycles                  IS 'Ciclos anuais de planejamento M1 — substituí fashionmind_cycle_<year> do localStorage';
COMMENT ON COLUMN public.annual_plan_cycles.field_priorities IS 'JSONB: PlanFieldPriority[] — indicadores foco e suas prioridades';
COMMENT ON COLUMN public.annual_plan_cycles.versions         IS 'JSONB: AnnualPlanVersion[] — histórico de versões salvas (máx. 20)';


-- ── 4. planning_scenarios (Cenários M1) ──────────────────────────────────────
-- Cenários de valores dentro de um ciclo anual.

CREATE TABLE IF NOT EXISTS public.planning_scenarios (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id    uuid        NOT NULL REFERENCES public.annual_plan_cycles(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  version     integer     NOT NULL DEFAULT 1,
  values      jsonb       NOT NULL DEFAULT '{}',
  is_applied  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

ALTER TABLE public.planning_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_planning_scenarios" ON public.planning_scenarios
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS planning_scenarios_tenant_cycle_idx
  ON public.planning_scenarios (tenant_id, cycle_id);

COMMENT ON TABLE  public.planning_scenarios        IS 'Cenários de valores do planejamento M1 por ciclo anual';
COMMENT ON COLUMN public.planning_scenarios.values IS 'JSONB: Record<fieldKey, number|null> com os valores planejados';


-- ── 5. channel_scenarios (Cenários M2) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_scenarios (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year         integer     NOT NULL,
  name         text        NOT NULL,
  percents     jsonb       NOT NULL DEFAULT '{}',
  channel_data jsonb       NOT NULL DEFAULT '{}',
  is_applied   boolean     NOT NULL DEFAULT false,
  saved_at     timestamptz NOT NULL DEFAULT now(),
  created_by   text
);

ALTER TABLE public.channel_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_scenarios" ON public.channel_scenarios
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS channel_scenarios_tenant_year_idx
  ON public.channel_scenarios (tenant_id, year);

COMMENT ON TABLE  public.channel_scenarios             IS 'Cenários M2 por canal/ano — substituí fashionmind_channel_scenarios_<year> do localStorage';
COMMENT ON COLUMN public.channel_scenarios.percents    IS 'JSONB: Record<channelId, percent> — participação % por canal';
COMMENT ON COLUMN public.channel_scenarios.channel_data IS 'JSONB: Record<channelId, Record<field, number>> — dados calculados por canal';


-- ── 6. division_scenarios (Cenários M3) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.division_scenarios (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  season_id   uuid        NOT NULL,
  year        integer     NOT NULL,
  name        text        NOT NULL,
  description text,
  divisions   jsonb       NOT NULL DEFAULT '{}',
  consolidated jsonb      NOT NULL DEFAULT '{}',
  is_applied  boolean     NOT NULL DEFAULT false,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

ALTER TABLE public.division_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_division_scenarios" ON public.division_scenarios
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS division_scenarios_tenant_season_idx
  ON public.division_scenarios (tenant_id, season_id);

COMMENT ON TABLE  public.division_scenarios              IS 'Cenários M3 por divisão/temporada — substituí fashionmind_m3_scenarios_<seasonId> do localStorage';
COMMENT ON COLUMN public.division_scenarios.divisions    IS 'JSONB: Record<BusinessDivisionId, DivisionPlanBlock>';
COMMENT ON COLUMN public.division_scenarios.consolidated IS 'JSONB: { totalRevenue, avgMargin, avgSellThrough, avgGmroi, meetsAllTargets }';
