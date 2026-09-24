// src/services/supabase/cascadeProgressService.ts
// Progresso da Cascata Automática M1→M6 (plan_cascade_runs, migration 040).
//
// Fonte única de verdade sobre "a rodada 1 já terminou pra este ano fiscal?"
// — não deriva de annual_plan_cycles.detail_level (ratchet único por
// tenant+ano, sem dimensão de temporada, não serve pra isso).

import { supabase } from '../../lib/supabase'

export type CascadeStepStatus = 'pending' | 'done' | 'blocked_on_dependency' | 'failed'

/** module: 2=Canal, 3=Sazonalidade (seasonId sempre null), 4=Divisão, 5=Coleção, 6=Sortimento (seasonId obrigatório). */
export interface CascadeStep {
  module: 2 | 3 | 4 | 5 | 6
  seasonId: string | null
  status: CascadeStepStatus
  errorMessage: string | null
}

export interface PlanCascadeStatus {
  /** true = rodada 1 completa (todas as etapas esperadas estão 'done') — o plano está "fechado". */
  closed: boolean
  /** true = a cascata já foi disparada ao menos uma vez para este ano (existe alguma linha). */
  started: boolean
  steps: CascadeStep[]
}

export async function getPlanCascadeStatus(
  tenantId: string,
  year: number,
): Promise<PlanCascadeStatus> {
  if (!tenantId) return { closed: false, started: false, steps: [] }
  const { data, error } = await supabase.rpc('get_plan_cascade_status', {
    p_tenant_id: tenantId,
    p_year: year,
  })
  if (error || !data) return { closed: false, started: false, steps: [] }
  const raw = data as unknown as { closed: boolean; started: boolean; steps: CascadeStep[] | null }
  return { closed: raw.closed, started: raw.started, steps: raw.steps ?? [] }
}

/** Atalho — usado pelas telas pra decidir roteamento de aprovação e travas de UI. */
export async function isPlanClosed(tenantId: string, year: number): Promise<boolean> {
  return (await getPlanCascadeStatus(tenantId, year)).closed
}

/**
 * Insere TODAS as etapas esperadas de uma rodada 1 como 'pending', de uma vez
 * só (atômico) — é o primeiro ato do orquestrador, ANTES de processar
 * qualquer etapa de verdade. Garante que a trava do M1 engate na hora que a
 * cascata começa, em vez de só conforme cada etapa for (ou não) terminando.
 * Idempotente: se já existem linhas para este ano, não faz nada (evita
 * redisparar a rodada 1 por engano).
 */
export async function initCascadeRun(
  tenantId: string,
  year: number,
  seasonIdsForYear: string[],
): Promise<{ alreadyStarted: boolean }> {
  const existing = await getPlanCascadeStatus(tenantId, year)
  if (existing.started) return { alreadyStarted: true }

  const rows: { tenant_id: string; year: number; module: number; season_id: string | null; status: 'pending' }[] = [
    { tenant_id: tenantId, year, module: 2, season_id: null, status: 'pending' },
    { tenant_id: tenantId, year, module: 3, season_id: null, status: 'pending' },
  ]
  for (const seasonId of seasonIdsForYear) {
    rows.push({ tenant_id: tenantId, year, module: 4, season_id: seasonId, status: 'pending' })
    rows.push({ tenant_id: tenantId, year, module: 5, season_id: seasonId, status: 'pending' })
    rows.push({ tenant_id: tenantId, year, module: 6, season_id: seasonId, status: 'pending' })
  }

  const { error } = await (supabase as any).from('plan_cascade_runs').insert(rows)
  if (error) throw error
  return { alreadyStarted: false }
}

/**
 * Atualiza o status de uma etapa. Escrita MONOTÔNICA: nunca regride uma
 * linha já 'done' pra outro status (mesma convenção de advanceDetailLevel em
 * officialPlanService.ts — "só avança, nunca retrocede automaticamente").
 */
export async function updateCascadeStep(
  tenantId: string,
  year: number,
  module: 2 | 3 | 4 | 5 | 6,
  seasonId: string | null,
  status: CascadeStepStatus,
  opts?: { appliedScenarioId?: string | null; errorMessage?: string | null },
): Promise<void> {
  const db = supabase as any
  let q = db
    .from('plan_cascade_runs')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .eq('module', module)
  q = seasonId ? q.eq('season_id', seasonId) : q.is('season_id', null)
  const { data: existing } = await q.maybeSingle()

  if (existing?.status === 'done') return // nunca regride

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (opts?.appliedScenarioId !== undefined) patch.applied_scenario_id = opts.appliedScenarioId
  if (opts?.errorMessage !== undefined) patch.error_message = opts.errorMessage

  if (existing?.id) {
    await db.from('plan_cascade_runs').update(patch).eq('id', existing.id)
  } else {
    await db.from('plan_cascade_runs').insert({
      tenant_id: tenantId, year, module, season_id: seasonId, ...patch,
    })
  }
}
