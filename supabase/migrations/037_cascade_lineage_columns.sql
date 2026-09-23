-- 037_cascade_lineage_columns.sql
-- Linhagem real entre módulos (Fase 4): cada elo M1→M2→M3→M4→M5 já faz
-- auto-seed de valores padrão a partir do nível acima (confirmado por
-- auditoria), mas nenhuma tabela registrava DE QUAL cenário específico do
-- nível acima os valores foram semeados. Este é o mesmo padrão já aplicado a
-- sortiment_plans.source_collection_plan_id (M5→M6, migration 036).

-- M1 → M2: annual_plan_cycles.versions[] não é uma tabela própria (é jsonb),
-- então guardamos o versionId (texto estável gerado em addVersionToCycle),
-- não uma FK.
ALTER TABLE public.channel_scenarios
  ADD COLUMN IF NOT EXISTS source_plan_version_id text;

COMMENT ON COLUMN public.channel_scenarios.source_plan_version_id IS
  'annual_plan_cycles.versions[].versionId (M1) usado para semear as taxas deste cenário na primeira abertura do ano. NULL = não há registro (cenário criado antes desta coluna, ou sem M1 salvo no momento).';

-- M2 → M3: planning_scenarios é compartilhada por M1 e M3 — esta coluna só é
-- preenchida em linhas de M3 (Sazonalidade).
ALTER TABLE public.planning_scenarios
  ADD COLUMN IF NOT EXISTS source_channel_scenario_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_scenarios_source_channel_fk') THEN
    ALTER TABLE public.planning_scenarios
      ADD CONSTRAINT planning_scenarios_source_channel_fk
      FOREIGN KEY (source_channel_scenario_id)
      REFERENCES public.channel_scenarios(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.planning_scenarios.source_channel_scenario_id IS
  'channel_scenarios.id (M2, aplicado) usado para semear plannedRevenue quando este cenário de Sazonalidade (M3) foi criado do zero. NULL nas linhas de M1 (esta tabela também guarda cenários do M1).';

-- M3 → M4
ALTER TABLE public.division_scenarios
  ADD COLUMN IF NOT EXISTS source_month_scenario_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'division_scenarios_source_month_fk') THEN
    ALTER TABLE public.division_scenarios
      ADD CONSTRAINT division_scenarios_source_month_fk
      FOREIGN KEY (source_month_scenario_id)
      REFERENCES public.planning_scenarios(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.division_scenarios.source_month_scenario_id IS
  'planning_scenarios.id (M3 — cenário de Sazonalidade aplicado) usado para semear a meta de receita da temporada e a % de participação sugerida por divisão.';

-- M4 → M5
ALTER TABLE public.collection_plans
  ADD COLUMN IF NOT EXISTS source_division_scenario_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_plans_source_division_fk') THEN
    ALTER TABLE public.collection_plans
      ADD CONSTRAINT collection_plans_source_division_fk
      FOREIGN KEY (source_division_scenario_id)
      REFERENCES public.division_scenarios(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.collection_plans.source_division_scenario_id IS
  'division_scenarios.id (M4, aplicado) usado para semear targetPieces (volumeCoverage.productionVolume) por divisão neste plano de trabalho do M5.';
