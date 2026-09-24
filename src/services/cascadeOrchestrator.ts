// src/services/cascadeOrchestrator.ts
// ─── Orquestrador da Cascata Automática M1→M6 ──────────────────────────────
//
// Disparado uma única vez, na primeira vez que o M1 é salvo para um ano
// (Planning.tsx). Roda no navegador de quem salvou — não existe função de
// servidor neste projeto — por isso é desenhado para ser retomável
// (resumeCascadeIfIncomplete): se a aba fechar no meio, plan_cascade_runs
// guarda exatamente onde parou, e uma sessão futura completa o resto.
//
// Cada etapa: calcula o padrão (motor puro em src/engine/*), salva, aplica,
// e — se o resultado sair da banda de tolerância do nível acima — cria um
// pedido de aprovação em paralelo (nunca bloqueia a aplicação: mesmo
// comportamento das telas manuais hoje, que sempre aplicam direto e deixam
// "Solicitar aprovação" como ação separada).

import { supabase } from '../lib/supabase'
import {
  initCascadeRun,
  updateCascadeStep,
  getPlanCascadeStatus,
  type CascadeStep,
} from './supabase/cascadeProgressService'
import { listSeasonsDb } from './supabase/seasonService'
import { seasonFiscalYearsTouched } from './supabase/planningScenarioService'
import { getCycle, saveScenario as savePlanningScenario, applyScenario as applyPlanningScenario } from './supabase/planningScenarioService'
import { linkAppliedMonthScenario } from './supabase/officialPlanService'
import { createApprovalRequest } from './supabase/planApprovalService'
import type { Temporada } from './temporadaService'

import {
  computeDefaultChannelScenario,
  isOutsideBand as isChannelOutsideBand,
  computeConsolidatedFromRaw,
  RATE_KEYS_FOR_DELTA,
} from '../engine/channelDefaultScenario'
import { saveChannelScenario, applyChannelScenario } from './supabase/channelScenarioService'

import { computeDefaultMonthScenario, computeMonthDivergence } from '../engine/monthDefaultScenario'

import { computeDefaultDivisionScenario } from '../engine/divisionDefaultScenario'
import { saveDivisionScenario, applyDivisionScenario } from './supabase/divisionScenarioService'

import { computeDefaultCollectionScenario, computeCollectionDivergence } from '../engine/collectionDefaultScenario'
import { saveWorkingCollectionPlan } from './supabase/collectionPlanService'

import { buildDivisionsFromM3, buildCollectionsFromM5Division, type Division } from '../engine/sortimentDefaultScenario'
import { computeSortimentDivergence } from '../engine/sortimentGate'
import { saveWorkingPlan } from './supabase/sortimentPlanService'
import { expandSeasonMonths } from '../engine/seasonMonths'
import { MONTHS } from './temporadaService'
import { fetchTenantDivisions } from './supabase/productHierarchyService'

const CASCADE_JUSTIFICATION = 'Gerado automaticamente pela Cascata Automática a partir do Planejamento Macro (M1).'

async function fetchM1Values(tenantId: string, year: number): Promise<Record<string, number | null> | null> {
  const { data: cycle } = await (supabase as any)
    .from('annual_plan_cycles').select('versions').eq('tenant_id', tenantId).eq('year', year).maybeSingle()
  const versions = (cycle?.versions as { values?: Record<string, number | null> }[] | null) ?? []
  return versions[0]?.values ?? null
}

// ─── M2 — Canal ───────────────────────────────────────────────────────────────

async function runChannelStep(tenantId: string, year: number, userEmail?: string): Promise<void> {
  try {
    const seed = await computeDefaultChannelScenario(tenantId, year)
    if (!seed) { await updateCascadeStep(tenantId, year, 2, null, 'blocked_on_dependency'); return }

    const channels = Object.keys(seed.channelData) as (keyof typeof seed.channelData)[]
    const scenario = await saveChannelScenario(
      tenantId, year, `Cascata Automática ${year}`,
      { percents: seed.percents, channelData: seed.channelData as unknown as Record<string, Record<string, number>> },
      userEmail, null,
    )
    await applyChannelScenario(tenantId, year, scenario.id)

    // Gate: consolidado calculado vs taxas do M1 (mesma checagem da tela manual)
    const consolidated = computeConsolidatedFromRaw(seed.channelData as unknown as Record<string, Record<string, number>>, channels)
    const impacted = RATE_KEYS_FOR_DELTA.filter(key => {
      const planned = seed.macroRates[key]
      const projected = consolidated[key]
      return planned != null && projected != null && isChannelOutsideBand(key, planned, projected)
    })
    if (impacted.length > 0 && userEmail) {
      await createApprovalRequest({
        tenantId, year, fromModule: 2, toModule: 1,
        requesterEmail: userEmail, justification: CASCADE_JUSTIFICATION,
        proposedData: consolidated as unknown as Record<string, unknown>,
        originalData: seed.macroRates as unknown as Record<string, unknown>,
        impactedIndicators: impacted.map(key => ({
          key, label: key, planned: seed.macroRates[key] as number, projected: consolidated[key] as number,
          gap: (consolidated[key] as number) - (seed.macroRates[key] as number), isRate: true,
        })),
        scenarioId: scenario.id,
      }).catch(() => { /* pedido não bloqueia a aplicação */ })
    }

    await updateCascadeStep(tenantId, year, 2, null, 'done', { appliedScenarioId: scenario.id })
  } catch (err) {
    await updateCascadeStep(tenantId, year, 2, null, 'failed', { errorMessage: err instanceof Error ? err.message : 'erro desconhecido' })
  }
}

// ─── M3 — Sazonalidade ────────────────────────────────────────────────────────

async function runMonthStep(tenantId: string, year: number, userEmail?: string): Promise<void> {
  try {
    const seed = await computeDefaultMonthScenario(tenantId, year)
    if (!seed) { await updateCascadeStep(tenantId, year, 3, null, 'blocked_on_dependency'); return }

    const cycle = await getCycle(tenantId, year)
    if (!cycle) { await updateCascadeStep(tenantId, year, 3, null, 'blocked_on_dependency'); return }

    const row = await savePlanningScenario(
      tenantId, cycle.id, `Cascata Automática ${year}`, 1,
      {
        plannedRevenue: seed.plannedRevenue,
        coverageTarget: seed.coverageTarget,
        estoqueColeçãoPassada: seed.estoqueColecaoPassada,
        totalPlanned: seed.totalPlanned,
        avgCoverage: 90,
      },
      userEmail, seed.sourceChannelScenarioId,
    )
    await applyPlanningScenario(tenantId, cycle.id, row.id, userEmail ?? '')
    await linkAppliedMonthScenario(tenantId, year, row.id)

    const m1Values = await fetchM1Values(tenantId, year)
    const metaReceita = (m1Values?.receitaBruta as number) ?? 0
    const { hasDivergence, divergence, divergencePct } = computeMonthDivergence(metaReceita, seed.totalPlanned)
    if (hasDivergence && userEmail) {
      await createApprovalRequest({
        tenantId, year, fromModule: 3, toModule: 2,
        requesterEmail: userEmail, justification: CASCADE_JUSTIFICATION,
        proposedData: { totalPlanned: seed.totalPlanned, divergence, divergencePct },
        originalData: { metaReceita },
        impactedIndicators: [{ key: 'receitaTotal', label: 'Receita Total (ciclo)', planned: metaReceita, projected: seed.totalPlanned, gap: divergence, isRate: false }],
        scenarioId: row.id,
      }).catch(() => {})
    }

    await updateCascadeStep(tenantId, year, 3, null, 'done', { appliedScenarioId: row.id })
  } catch (err) {
    await updateCascadeStep(tenantId, year, 3, null, 'failed', { errorMessage: err instanceof Error ? err.message : 'erro desconhecido' })
  }
}

// ─── M4 — Divisão (por temporada) ─────────────────────────────────────────────

async function runDivisionStep(
  tenantId: string, year: number, season: Temporada, divisionIds: string[], userEmail?: string,
): Promise<boolean> {
  try {
    const touchedYears = seasonFiscalYearsTouched(season.mesInicio, season.mesFim, season.anoFiscal!)
    const status = await getPlanCascadeStatus(tenantId, year)
    // M4 só roda depois que a Sazonalidade (M3) de TODOS os anos fiscais que a
    // temporada toca já aplicou — inclusive um ano fiscal futuro ainda sem M1/M3
    // (temporada de Verão cruzando o ano). Não é falha, é dependência real.
    for (const touchedYear of touchedYears) {
      if (touchedYear === year) {
        if (!status.steps.find(s => s.module === 3 && s.status === 'done')) {
          await updateCascadeStep(tenantId, year, 4, season.id, 'blocked_on_dependency')
          return false
        }
      } else {
        const otherStatus = await getPlanCascadeStatus(tenantId, touchedYear)
        if (!otherStatus.steps.find(s => s.module === 3 && s.status === 'done')) {
          await updateCascadeStep(tenantId, year, 4, season.id, 'blocked_on_dependency')
          return false
        }
      }
    }

    const seed = await computeDefaultDivisionScenario(tenantId, season.id, { mesInicio: season.mesInicio, mesFim: season.mesFim, anoFiscal: season.anoFiscal! }, divisionIds)
    if (!seed) { await updateCascadeStep(tenantId, year, 4, season.id, 'blocked_on_dependency'); return false }

    const revenueWeighted = (field: 'margin' | 'sellThrough' | 'gmroi') => {
      const totalRev = Object.values(seed.divisions).reduce((s, d) => s + (d.participation / 100) * seed.macroTargets.revenue, 0)
      if (totalRev <= 0) return 0
      return Object.values(seed.divisions).reduce((s, d) => s + (d.indicators[field] ?? 0) * (d.participation / 100) * seed.macroTargets.revenue, 0) / totalRev
    }
    const consolidated = {
      totalRevenue: seed.macroTargets.revenue,
      avgMargin: revenueWeighted('margin'),
      avgSellThrough: revenueWeighted('sellThrough'),
      avgGmroi: revenueWeighted('gmroi'),
      meetsAllTargets: true,
      referenceSeasonId: season.id,
    }

    const row = await saveDivisionScenario(
      tenantId, season.id, year, `Cascata Automática ${season.nome}`, null,
      seed.divisions as unknown as Record<string, unknown>,
      consolidated as unknown as Record<string, unknown>,
      userEmail, null,
    )
    await applyDivisionScenario(tenantId, season.id, row.id)

    await updateCascadeStep(tenantId, year, 4, season.id, 'done', { appliedScenarioId: row.id })
    return true
  } catch (err) {
    await updateCascadeStep(tenantId, year, 4, season.id, 'failed', { errorMessage: err instanceof Error ? err.message : 'erro desconhecido' })
    return false
  }
}

// ─── M5 — Coleção (por temporada) ─────────────────────────────────────────────

async function runCollectionStep(tenantId: string, year: number, season: Temporada, userEmail?: string): Promise<boolean> {
  try {
    const seed = await computeDefaultCollectionScenario(tenantId, season.id, { mesInicio: season.mesInicio, mesFim: season.mesFim, anoFiscal: season.anoFiscal! })
    if (!seed) { await updateCascadeStep(tenantId, year, 5, season.id, 'blocked_on_dependency'); return false }

    await saveWorkingCollectionPlan(tenantId, season.id, seed.divisions, seed.sourceDivisionScenarioId)

    for (const [divId, div] of Object.entries(seed.divisions)) {
      const allocated = div.entries.reduce((s, e) => s + e.plannedPieces, 0)
      const { outsideTolerance, gapPct } = computeCollectionDivergence(allocated, div.targetPieces)
      if (outsideTolerance && userEmail) {
        await createApprovalRequest({
          tenantId, year, fromModule: 5, toModule: 4,
          requesterEmail: userEmail, justification: CASCADE_JUSTIFICATION,
          proposedData: { seasonId: season.id, divisions: seed.divisions },
          originalData: { divId, target: div.targetPieces },
          impactedIndicators: [{ key: divId, label: divId, planned: div.targetPieces, projected: allocated, gap: allocated - div.targetPieces, isRate: false }],
          scenarioId: undefined,
        }).catch(() => {})
        void gapPct
      }
    }

    await updateCascadeStep(tenantId, year, 5, season.id, 'done')
    return true
  } catch (err) {
    await updateCascadeStep(tenantId, year, 5, season.id, 'failed', { errorMessage: err instanceof Error ? err.message : 'erro desconhecido' })
    return false
  }
}

// ─── M6 — Sortimento (por temporada) ──────────────────────────────────────────

async function runSortimentStep(tenantId: string, year: number, season: Temporada, userEmail?: string): Promise<void> {
  try {
    const { data: divScenarioRow } = await (supabase as any)
      .from('division_scenarios').select('*')
      .eq('tenant_id', tenantId).eq('season_id', season.id).eq('is_applied', true).maybeSingle()
    if (!divScenarioRow) { await updateCascadeStep(tenantId, year, 6, season.id, 'blocked_on_dependency'); return }

    const m1Values = await fetchM1Values(tenantId, year)
    const macroRec = (m1Values?.receitaBruta as number) ?? 0
    const divisions: Division[] = buildDivisionsFromM3(divScenarioRow, macroRec)
    if (divisions.length === 0) { await updateCascadeStep(tenantId, year, 6, season.id, 'blocked_on_dependency'); return }

    const { data: collectionPlanRow } = await (supabase as any)
      .from('collection_plans').select('*')
      .eq('tenant_id', tenantId).eq('season_id', season.id).eq('is_applied', true).maybeSingle()

    const monthToYear = new Map<string, number>(
      expandSeasonMonths(season.mesInicio, season.mesFim, season.anoFiscal!).map(({ month, year: y }) => [MONTHS[month - 1], y]),
    )
    const finalDivisions = divisions.map(d => {
      const seeded = collectionPlanRow ? buildCollectionsFromM5Division(collectionPlanRow.divisions?.[d.id], monthToYear) : []
      return seeded.length > 0 ? { ...d, collections: seeded } : d
    })

    await saveWorkingPlan(tenantId, season.id, finalDivisions as unknown as Record<string, unknown>[], collectionPlanRow?.id ?? null)

    const checks = computeSortimentDivergence(finalDivisions.map(d => ({ id: d.id, collections: d.collections })))
    for (const check of checks) {
      if (check.outsideTolerance && userEmail) {
        const div = finalDivisions.find(d => d.id === check.divId)
        await createApprovalRequest({
          tenantId, year, fromModule: 6, toModule: 4,
          requesterEmail: userEmail, justification: CASCADE_JUSTIFICATION,
          proposedData: { seasonId: season.id, divId: check.divId, mixPct: check.mixPct },
          originalData: { divId: check.divId, target: 100 },
          impactedIndicators: [{ key: check.divId, label: div?.name ?? check.divId, planned: div?.revenueTarget ?? 0, projected: (div?.revenueTarget ?? 0) * check.mixPct / 100, gap: check.gapPct, isRate: true }],
          scenarioId: undefined,
        }).catch(() => {})
      }
    }

    await updateCascadeStep(tenantId, year, 6, season.id, 'done')
  } catch (err) {
    await updateCascadeStep(tenantId, year, 6, season.id, 'failed', { errorMessage: err instanceof Error ? err.message : 'erro desconhecido' })
  }
}

// ─── Orquestração ─────────────────────────────────────────────────────────────

async function seasonsForYear(tenantId: string): Promise<Temporada[]> {
  const all = await listSeasonsDb(tenantId)
  return all
}

/**
 * Dispara a rodada 1 da Cascata Automática para um ano — só na PRIMEIRA vez
 * que o M1 é salvo para esse ano (nunca redispara numa revisão posterior;
 * ver plan_cascade_runs). Roda M2 → M3 → (M4 → M5 → M6 por temporada), cada
 * etapa sempre lendo do banco (nunca de estado em memória de página), o que
 * permite retomar de onde parou numa sessão futura (resumeCascadeIfIncomplete).
 */
export async function runCascadeFromM1(tenantId: string, year: number, userEmail?: string): Promise<void> {
  const existing = await getPlanCascadeStatus(tenantId, year)
  if (existing.started) return // já rodou (ou está rodando) — revisão de M1 não redispara

  const seasons = (await seasonsForYear(tenantId)).filter(s => s.anoFiscal === year)
  await initCascadeRun(tenantId, year, seasons.map(s => s.id))

  await runChannelStep(tenantId, year, userEmail)
  await runMonthStep(tenantId, year, userEmail)

  const divisionIds = (await fetchTenantDivisions(tenantId)).map(d => d.id)
  for (const season of seasons) {
    const okM4 = await runDivisionStep(tenantId, year, season, divisionIds, userEmail)
    if (!okM4) continue
    const okM5 = await runCollectionStep(tenantId, year, season, userEmail)
    if (!okM5) continue
    await runSortimentStep(tenantId, year, season, userEmail)
  }
}

/**
 * Retoma uma cascata que ficou incompleta (aba fechada no meio) — chamada ao
 * carregar telas de topo (Dashboard/PlanningGateway). Reprocessa só as
 * etapas 'pending' ou 'blocked_on_dependency' (nunca mexe em 'done').
 */
export async function resumeCascadeIfIncomplete(tenantId: string, year: number, userEmail?: string): Promise<void> {
  const status = await getPlanCascadeStatus(tenantId, year)
  if (!status.started || status.closed) return

  const isDone = (module: number, seasonId: string | null) =>
    status.steps.some((s: CascadeStep) => s.module === module && s.seasonId === seasonId && s.status === 'done')

  if (!isDone(2, null)) await runChannelStep(tenantId, year, userEmail)
  if (!isDone(3, null)) await runMonthStep(tenantId, year, userEmail)

  const seasons = (await seasonsForYear(tenantId)).filter(s => s.anoFiscal === year)
  const divisionIds = (await fetchTenantDivisions(tenantId)).map(d => d.id)
  for (const season of seasons) {
    if (!isDone(4, season.id)) { const ok = await runDivisionStep(tenantId, year, season, divisionIds, userEmail); if (!ok) continue }
    if (!isDone(5, season.id)) { const ok = await runCollectionStep(tenantId, year, season, userEmail); if (!ok) continue }
    if (!isDone(6, season.id)) await runSortimentStep(tenantId, year, season, userEmail)
  }
}
