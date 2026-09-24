// src/engine/sortimentDefaultScenario.ts
// ─── Motor puro do Sortimento (M6) ──────────────────────────────────────────
// Extraído de SortimentPlan.tsx (Fase 4/Cascata Automática) — fonte única de
// verdade tanto para o bootstrap M4→M6/M5→M6 que a tela já fazia quanto para
// o orquestrador da Cascata Automática (cascadeOrchestrator.ts).

import type { DivisionScenarioRow } from '../services/supabase/divisionScenarioService'
import type { CollectionPlanDivision } from '../services/supabase/collectionPlanService'
import { MONTHS } from '../services/temporadaService'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CollectionType = 'colecao' | 'drop'
export type ProfileType = 'Sustentador de Margem' | 'Motor de Giro' | 'Ícone de Marca'
export type PriceTier = 'P1' | 'P2' | 'P3'
export type MixStatus = 'nao_configurado' | 'em_andamento' | 'validado'

export interface TierLayer {
  tier: PriceTier
  tierPct: number
  avgPrice: number
  profile: ProfileType
}

export interface CategoryMix {
  id: string
  category: string
  participationPct: number
}

export interface CollectionEntry {
  date: string  // "YYYY-MM-DD"
  label: string // "Entrada 1", "Entrada 2"...
}

export interface Collection {
  id: string
  name: string
  type: CollectionType
  numEntradas: number
  revenuePct: number // % da meta de receita da divisão
  entries: CollectionEntry[]
  categories: CategoryMix[]
  tierLayers: Record<string, TierLayer[]> // chave = category.id
  mixStatus: MixStatus
}

export interface Division {
  id: string
  name: string
  revenueTarget: number
  participationPct: number
  targetMarginPct: number
  targetMkdPct: number
  pricePyramid: { p1: number; p2: number; p3: number }
  avgPriceP1: number
  avgPriceP2: number
  avgPriceP3: number
  collections: Collection[]
}

export const DIVISION_NAMES: Record<string, string> = {
  feminino: 'Feminino',
  masculino: 'Masculino',
  acessorios: 'Acessórios',
  infantil: 'Infantil',
}

/** Converte faixa de preço "119-169" em preço médio */
export function midpointPrice(range: string, fallback: number): number {
  if (!range) return fallback
  const parts = range.split('-').map(p => parseFloat(p.trim())).filter(v => !isNaN(v))
  if (parts.length === 2) return Math.round((parts[0] + parts[1]) / 2)
  if (parts.length === 1) return parts[0]
  return fallback
}

/**
 * Constrói o array inicial de Division[] para o M6 a partir do cenário aplicado do M4.
 * @param m3Row   Linha aplicada de division_scenarios
 * @param macroRec Receita total da coleção (do M1, em R$) para calcular revenueTarget
 */
export function buildDivisionsFromM3(m3Row: DivisionScenarioRow, macroRec: number): Division[] {
  const divMap = (m3Row.divisions ?? {}) as Record<string, any>
  const divIds = Object.keys(divMap)
  if (!divIds.length) return []

  return divIds
    .map(divId => {
      const block = divMap[divId] as any
      if (!block) return null

      const participation: number = block.participation ?? 0
      const indicators = block.indicators ?? {}
      const priceRange = block.priceRange ?? {}

      const revenueTarget = macroRec > 0 ? Math.round(macroRec * participation / 100) : 0

      const avgPriceP1 = midpointPrice(priceRange.entry ?? '', 120)
      const avgPriceP2 = midpointPrice(priceRange.middle ?? '', 180)
      const avgPriceP3 = midpointPrice(priceRange.premium ?? '', 280)

      const p1 = priceRange.entryPercent   ?? 40
      const p2 = priceRange.middlePercent  ?? 40
      const p3 = priceRange.premiumPercent ?? 20

      const targetMarginPct = indicators.margin ?? 60
      const targetMkdPct = indicators.mkd ?? 15

      return {
        id: divId,
        name: DIVISION_NAMES[divId] ?? divId.charAt(0).toUpperCase() + divId.slice(1),
        revenueTarget,
        participationPct: participation,
        targetMarginPct,
        targetMkdPct,
        pricePyramid: { p1, p2, p3 },
        avgPriceP1,
        avgPriceP2,
        avgPriceP3,
        collections: [],
      } as Division
    })
    .filter((d): d is Division => d !== null)
    .sort((a, b) => b.revenueTarget - a.revenueTarget)
}

/**
 * Converte as entries de uma divisão do Plano de Coleção (M5 — volume em
 * peças por mês) nas Collection[] do Sortimento (M6 — % de receita da
 * divisão). Cada entry do M5 já é uma coleção/drop com nome+tipo+mês+peças —
 * vira 1 Collection com 1 entrada de data. O revenuePct é aproximado a
 * partir da participação de peças dentro da divisão (o M5 não modela preço/receita).
 */
export function buildCollectionsFromM5Division(
  m5div: CollectionPlanDivision | undefined,
  monthToYear: Map<string, number>,
): Collection[] {
  if (!m5div || !m5div.entries || m5div.entries.length === 0) return []
  const totalPieces = m5div.entries.reduce((s, e) => s + (e.plannedPieces || 0), 0)
  if (totalPieces <= 0) return []

  return m5div.entries.map((e, i) => {
    const year = monthToYear.get(e.month)
    const monthIdx = MONTHS.indexOf(e.month) // 0-based
    const date = year && monthIdx >= 0 ? `${year}-${String(monthIdx + 1).padStart(2, '0')}-01` : ''
    return {
      id: e.id || `m5-${i}-${Date.now()}`,
      name: e.name || `Coleção ${i + 1}`,
      type: e.type,
      numEntradas: 1,
      revenuePct: Math.round((e.plannedPieces / totalPieces) * 1000) / 10,
      entries: date ? [{ date, label: 'Entrada 1' }] : [],
      categories: [],
      tierLayers: {},
      mixStatus: 'nao_configurado' as MixStatus,
    }
  })
}
