-- 040_plan_cascade_runs.sql
-- Rastreamento de progresso da Cascata Automática M1→M6.
--
-- Cada linha representa "este módulo, para este ano fiscal (e temporada,
-- quando aplicável), já concluiu sua etapa da rodada 1 da cascata?" — não
-- existia NENHUM rastreamento disso antes (annual_plan_cycles.detail_level é
-- um ratchet único por tenant+ano, sem dimensão de temporada, incapaz de
-- responder isso corretamente quando um ano tem 2 temporadas em estágios
-- diferentes).
--
-- module: 2=Canal, 3=Sazonalidade (por ano, season_id NULL), 4=Divisão,
-- 5=Coleção, 6=Sortimento (por temporada, season_id preenchido).
--
-- status:
--   pending               — etapa enfileirada pelo orquestrador, ainda não rodou
--   done                  — aplicada com sucesso (nunca regride para outro status)
--   blocked_on_dependency — esperando uma dependência real (ex.: M4 de uma
--                           temporada de Verão esperando o M3 do ano fiscal
--                           seguinte) — não é falha, é um estado de espera legítimo
--   failed                — tentou rodar e um erro real impediu a conclusão
--
-- "Rodada 1 completa para tenant+ano" = existe linha done para module=2(ano),
-- module=3(ano), e para CADA temporada com fiscal_year=ano: module 4, 5 e 6
-- todos done.

CREATE TABLE IF NOT EXISTS public.plan_cascade_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  year                 int NOT NULL,
  module               smallint NOT NULL CHECK (module BETWEEN 2 AND 6),
  season_id            uuid NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','done','blocked_on_dependency','failed')),
  applied_scenario_id  uuid NULL,
  error_message        text NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Uma linha por (tenant, ano, módulo, temporada) — season_id NULL conta como
-- valor distinto normalmente em UNIQUE, então module 2/3 (season_id sempre
-- NULL) já ficam naturalmente únicos por (tenant,year,module).
CREATE UNIQUE INDEX IF NOT EXISTS plan_cascade_runs_unique_step
  ON public.plan_cascade_runs (tenant_id, year, module, COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS plan_cascade_runs_tenant_year_idx
  ON public.plan_cascade_runs (tenant_id, year);

ALTER TABLE public.plan_cascade_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_cascade_runs_select ON public.plan_cascade_runs
  FOR SELECT USING (true);
CREATE POLICY plan_cascade_runs_insert ON public.plan_cascade_runs
  FOR INSERT WITH CHECK (true);
CREATE POLICY plan_cascade_runs_update ON public.plan_cascade_runs
  FOR UPDATE USING (true);
CREATE POLICY plan_cascade_runs_delete ON public.plan_cascade_runs
  FOR DELETE USING (true);

-- ── Função: status da rodada 1 para um tenant+ano ────────────────────────────
-- Retorna jsonb: { closed: boolean, steps: [{module, seasonId, status}] }
-- "closed" = true somente quando TODAS as etapas esperadas (module 2, module
-- 3, e module 4/5/6 de CADA temporada com fiscal_year = p_year) existem E
-- estão status='done'. Se a cascata nunca foi disparada para este ano
-- (nenhuma linha existe), closed=false e steps=[] — quem chama distingue
-- "nunca rodou" de "rodou e não terminou" pelo tamanho de steps.
CREATE OR REPLACE FUNCTION public.get_plan_cascade_status(
  p_tenant_id uuid,
  p_year      int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_expected_count int;
  v_done_count     int;
  v_steps          jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('module', module, 'seasonId', season_id, 'status', status, 'errorMessage', error_message) ORDER BY module, season_id)
  INTO v_steps
  FROM public.plan_cascade_runs
  WHERE tenant_id = p_tenant_id AND year = p_year;

  IF v_steps IS NULL THEN
    RETURN jsonb_build_object('closed', false, 'started', false, 'steps', '[]'::jsonb);
  END IF;

  -- Quantidade esperada de etapas: module 2 + module 3 (1 cada) + 3 módulos
  -- (4,5,6) por temporada do ano fiscal.
  SELECT 2 + 3 * count(*) INTO v_expected_count
  FROM public.seasons s
  WHERE s.tenant_id = p_tenant_id AND s.fiscal_year = p_year;

  SELECT count(*) INTO v_done_count
  FROM public.plan_cascade_runs
  WHERE tenant_id = p_tenant_id AND year = p_year AND status = 'done';

  RETURN jsonb_build_object(
    'closed',  (v_done_count > 0 AND v_done_count = v_expected_count),
    'started', true,
    'steps',   v_steps
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_plan_cascade_status(uuid, int) TO anon, authenticated;
