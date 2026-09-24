// src/engine/collectionDefaultScenario.ts
// ─── Motor puro da Coleção (M5) ─────────────────────────────────────────────
// Lógica NOVA — hoje a distribuição de coleções/drops por mês é 100% manual
// (não existia nenhuma fórmula de semente antes desta Fase). Decisão
// confirmada com a usuária: baseado no histórico REAL de cada divisão
// (formato mensal do ano anterior); quando a divisão não tem perfil
// histórico, cai para uma única "Coleção Principal" com 100% do volume no
// 1º mês da temporada.

import { getAppliedDivisionScenario } from '../services/supabase/divisionScenarioService'
import { getDivisionSeasonality } from '../services/supabase/divisionSeasonalityService'
import { expandSeasonMonths } from './seasonMonths'
import { MONTHS } from '../services/temporadaService'
import type { CollectionPlanDivision, CollectionPlanEntry } from '../services/supabase/collectionPlanService'
import type { DivisionPlanBlock } from '../app/types/module3'

export interface SeasonRef {
  mesInicio: string
  mesFim: string
  anoFiscal: number
}

export interface DefaultCollectionScenario {
  divisions: Record<string, CollectionPlanDivision>
  sourceDivisionScenarioId: string
}

/**
 * Calcula a distribuição padrão de coleções/drops por mês, por divisão, a
 * partir do volume-teto do M4 aplicado (volumeCoverage.productionVolume) +
 * formato histórico real de cada divisão (getDivisionSeasonality). Retorna
 * null quando não há M4 aplicado para esta temporada — nada a semear ainda.
 */
export async function computeDefaultCollectionScenario(
  tenantId: string,
  seasonId: string,
  season: SeasonRef,
): Promise<DefaultCollectionScenario | null> {
  const divScenario = await getAppliedDivisionScenario(tenantId, seasonId)
  if (!divScenario) return null

  const divs = (divScenario.divisions ?? {}) as Record<string, DivisionPlanBlock>
  const histProfiles = await getDivisionSeasonality(tenantId).then(r => r.consolidated).catch(() => [])
  const seasonMonths = expandSeasonMonths(season.mesInicio, season.mesFim, season.anoFiscal).map(m => MONTHS[m.month - 1])

  const result: Record<string, CollectionPlanDivision> = {}

  for (const [divId, block] of Object.entries(divs)) {
    const targetPieces = block?.volumeCoverage?.productionVolume ?? 0
    if (targetPieces <= 0) {
      result[divId] = { targetPieces: 0, entries: [] }
      continue
    }

    const hist = histProfiles.find(p => p.division === divId)
    const entries: CollectionPlanEntry[] = []

    if (hist) {
      for (const month of seasonMonths) {
        const pct = hist.monthlyPcts[month] ?? 0
        if (pct <= 0) continue
        const plannedPieces = Math.round(targetPieces * (pct / 100))
        if (plannedPieces <= 0) continue
        entries.push({
          id: `cascade-${divId}-${month}`,
          name: `Alocação Automática — ${month}`,
          type: 'colecao',
          month,
          plannedPieces,
        })
      }
    }

    if (entries.length === 0) {
      // Sem perfil histórico pra esta divisão (ou tudo zerado): uma única
      // coleção com 100% do volume no 1º mês da temporada.
      entries.push({
        id: `cascade-${divId}-principal`,
        name: 'Coleção Principal',
        type: 'colecao',
        month: seasonMonths[0] ?? '',
        plannedPieces: targetPieces,
      })
    }

    result[divId] = { targetPieces, entries }
  }

  return { divisions: result, sourceDivisionScenarioId: divScenario.id }
}

/** Mesma tolerância (2%) já usada em CollectionPlan.tsx para "Solicitar ajuste ao M4". */
export const COLLECTION_TOLERANCE_PCT = 2

export function computeCollectionDivergence(
  allocated: number,
  target: number,
): { gapPct: number; outsideTolerance: boolean } {
  const gapPct = target > 0 ? ((allocated - target) / target) * 100 : 0
  return { gapPct, outsideTolerance: target > 0 && Math.abs(gapPct) > COLLECTION_TOLERANCE_PCT }
}
