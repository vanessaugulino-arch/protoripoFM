// src/engine/divisionDefaultScenario.ts
// ─── Motor puro da Divisão (M4) ─────────────────────────────────────────────
// Extraído/composto a partir da lógica real já existente em
// Module3DivisionPlanning.tsx (deriveSeasonMacroTarget, sazonalidadeSuggestedPct)
// e useModule3.ts (initializeDivisions, agora exportada) — fonte única de
// verdade reutilizada pelo orquestrador da Cascata Automática.
//
// Autossuficiente por desenho: não depende de nenhum estado calculado por um
// passo anterior do orquestrador na mesma execução — sempre lê o M1/M3
// aplicados direto do banco. Isso é o que permite retomar a cascata numa
// sessão futura (aba fechada no meio) sem arrastar estado em memória.

import { supabase } from '../lib/supabase'
import { seasonFiscalYearsTouched } from '../services/supabase/planningScenarioService'
import { expandSeasonMonths } from './seasonMonths'
import { getHistoricalProfiles, normalizeDivisionPcts } from '../services/supabase/historicalProfileService'
import { getDivisionSeasonality } from '../services/supabase/divisionSeasonalityService'
import { getDivisionRiskProfile } from '../services/supabase/consolidatedHierarchyService'
import { initializeDivisions } from '../hooks/useModule3'
import type { MacroTarget, DivisionPlanBlock, RiskMatrix } from '../app/types/module3'
import { MONTHS } from '../services/temporadaService'

export interface SeasonRef {
  mesInicio: string
  mesFim: string
  anoFiscal: number
}

async function fetchM1Values(tenantId: string, year: number): Promise<Record<string, number | null> | null> {
  const { data: cycle } = await (supabase as any)
    .from('annual_plan_cycles').select('versions').eq('tenant_id', tenantId).eq('year', year).maybeSingle()
  const versions = (cycle?.versions as { values?: Record<string, number | null> }[] | null) ?? []
  const version = versions.find(v => (v.values?.receitaBruta as number | undefined) != null && (v.values!.receitaBruta as number) > 0)
  return version?.values ?? null
}

/** plannedRevenue (canal -> mês -> receita) do M3 aplicado de um ano fiscal, ou null se não há M3 aplicado ainda. */
async function fetchAppliedMonthRevenue(tenantId: string, year: number): Promise<Record<string, Record<string, number>> | null> {
  const { data: cycle } = await (supabase as any).from('annual_plan_cycles').select('id').eq('tenant_id', tenantId).eq('year', year).maybeSingle()
  if (!cycle) return null
  const { data } = await (supabase as any).from('planning_scenarios').select('values')
    .eq('tenant_id', tenantId).eq('cycle_id', cycle.id).eq('is_applied', true).maybeSingle()
  return (data?.values?.plannedRevenue as Record<string, Record<string, number>> | undefined) ?? null
}

export interface DefaultDivisionScenario {
  divisions: Record<string, DivisionPlanBlock>
  macroTargets: MacroTarget
}

/**
 * Calcula o cenário padrão de Divisão a partir do M3 aplicado (receita real
 * por mês, somada pelos meses da temporada) + participação real (sugerida
 * pela curva de Sazonalidade ponderada pelo formato histórico de cada
 * divisão, com fallback no histórico plano de divisão). Cai no rateio linear
 * do M1 quando ainda não há M3 aplicado para nenhum dos anos fiscais que a
 * temporada toca. Retorna null quando não há M1 nem M3 — nada real a semear.
 */
export async function computeDefaultDivisionScenario(
  tenantId: string,
  seasonId: string,
  season: SeasonRef,
  divisionIds: string[],
): Promise<DefaultDivisionScenario | null> {
  if (divisionIds.length === 0) return null

  const touchedYears = seasonFiscalYearsTouched(season.mesInicio, season.mesFim, season.anoFiscal)
  const seasonMonthNames = new Set(
    expandSeasonMonths(season.mesInicio, season.mesFim, season.anoFiscal).map(m => MONTHS[m.month - 1]),
  )

  // Soma a receita real do M3 (todos os anos fiscais que a temporada toca),
  // já filtrada só pelos meses que pertencem a esta temporada.
  const monthlyTotal: Record<string, number> = {}
  let hasM3 = false
  for (const year of touchedYears) {
    const plannedRevenue = await fetchAppliedMonthRevenue(tenantId, year)
    if (!plannedRevenue) continue
    hasM3 = true
    for (const canalMonths of Object.values(plannedRevenue)) {
      for (const [month, rev] of Object.entries(canalMonths ?? {})) {
        if (seasonMonthNames.has(month)) monthlyTotal[month] = (monthlyTotal[month] ?? 0) + (rev ?? 0)
      }
    }
  }

  const m1Values = await fetchM1Values(tenantId, season.anoFiscal)
  if (!hasM3 && !m1Values) return null

  const revenue = hasM3
    ? Object.values(monthlyTotal).reduce((s, v) => s + v, 0)
    : ((m1Values?.receitaBruta as number) ?? 0) * (seasonMonthNames.size / 12) // rateio linear do M1 — mesmo fallback já usado na tela

  const macroTargets: MacroTarget = {
    seasonId,
    revenue,
    margin:      (m1Values?.margemBruta as number) ?? 48,
    sellThrough: 75,
    gmroi:       (m1Values?.gmroi as number) ?? 3.5,
    pmv:         (m1Values?.pmv as number | null) ?? undefined,
  }

  // Participação real: prefere a sugerida pela Sazonalidade (curva mensal real
  // ponderada pelo formato histórico de cada divisão) — cai pro histórico
  // plano de divisão quando ainda não há M3 aplicado.
  let participationOverrides: Record<string, number> | undefined

  if (hasM3) {
    const divisionHistProfiles = await getDivisionSeasonality(tenantId).then(r => r.consolidated).catch(() => [])
    if (divisionHistProfiles.length > 0) {
      const raw: Record<string, number> = {}
      for (const prof of divisionHistProfiles) {
        let total = 0
        for (const [month, monthTotal] of Object.entries(monthlyTotal)) {
          total += monthTotal * ((prof.monthlyPcts[month] ?? 0) / 100)
        }
        raw[prof.division] = total
      }
      const sum = Object.values(raw).reduce((s, v) => s + v, 0)
      if (sum > 0) {
        participationOverrides = {}
        for (const [divId, v] of Object.entries(raw)) participationOverrides[divId] = (v / sum) * 100
      }
    }
  }

  if (!participationOverrides) {
    const profiles = await getHistoricalProfiles(tenantId).catch(() => ({ hasData: false, divisions: [] as any[] }))
    if (profiles.hasData) {
      participationOverrides = normalizeDivisionPcts(profiles.divisions, divisionIds)
    }
  }

  // Matriz de risco real (products.risk_level por divisão) — mesma fonte do
  // painel de Giro por Perfil de Risco do M5, fecha o gap "Básico só no M6".
  const riskMatrixOverrides = await getDivisionRiskProfile(tenantId).catch(() => ({} as Record<string, RiskMatrix>))

  const divisions = initializeDivisions(divisionIds, macroTargets, participationOverrides, riskMatrixOverrides)
  return { divisions, macroTargets }
}
