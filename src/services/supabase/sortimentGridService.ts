// ─── sortimentGridService.ts ───────────────────────────────────────────────
// Aba 1 da Cascata do Sortimento (M6) — grid por categoria: Faixa de Preço
// (P1/P2/P3) × Nível de Risco (básico/motor_giro/sustentador/icone).
//
// Semente real (nunca em branco, nunca aleatória): peso histórico da
// CATEGORIA por nível de risco (sales_history × products.risk_level, via
// getHierarchyRevenueByPath) cruzado com a Pirâmide de Preço já decidida
// para essa categoria (price_pyramid_plans). Cada célula pode ser ajustada
// manualmente pelo usuário — o ajuste persiste em sortiment_grid_adjustments
// (migration 028); sem ajuste salvo, a célula usa o valor calculado.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'
import { normalizeDivision } from './historicalProfileService'
import { getHierarchyRevenueByPath } from './consolidatedHierarchyService'
import { loadPyramidPlan } from './pricePyramidService'
import type { PriceTierId } from '../../app/types/pricePyramid'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export type RiskLevelId = 'basico' | 'motor_giro' | 'sustentador' | 'icone'

export const RISK_LEVELS: RiskLevelId[] = ['basico', 'motor_giro', 'sustentador', 'icone']

export const RISK_LEVEL_LABELS: Record<RiskLevelId, string> = {
  basico:      'Básico',
  motor_giro:  'Motor de Giro',
  sustentador: 'Sustentador de Margem',
  icone:       'Ícone de Marca',
}

export const PRICE_TIER_LABELS: Record<PriceTierId, string> = { p1: 'P1', p2: 'P2', p3: 'P3' }

export interface GridCell {
  priceTier:  PriceTierId
  riskLevel:  RiskLevelId
  pct:        number   // 0–100, participação desta célula na receita da categoria
  isOverride: boolean  // true quando veio de sortiment_grid_adjustments (não do cálculo)
}

export interface CategoryGrid {
  category:        string
  categoryRevenue: number  // receita já alocada a esta categoria (vem do cascadeTree existente)
  cells:           GridCell[]  // 12 células (3 faixas × 4 níveis de risco)
}

// ── Semente real: histórico da categoria por risco × Pirâmide de Preço ──────
export async function computeCategoryGrids(
  tenantId: string,
  seasonId: string,
  divisionId: string,
  categoryRevenues: Map<string, number>,
): Promise<CategoryGrid[]> {
  const [weights, pyramid, overrides] = await Promise.all([
    getHierarchyRevenueByPath(tenantId),
    loadPyramidPlan(tenantId, seasonId, divisionId),
    getGridAdjustments(tenantId, seasonId, divisionId),
  ])
  const tiersByCategory = new Map((pyramid ?? []).map(c => [c.label, c.tiers]))

  const grids: CategoryGrid[] = []
  for (const [category, categoryRevenue] of categoryRevenues) {
    if (categoryRevenue <= 0) continue

    // Peso histórico real desta categoria, por nível de risco.
    const catWeights = weights.filter(
      w => w.category === category && normalizeDivision(w.division) === divisionId && w.riskLevel != null,
    )
    const riskTotals = new Map<string, number>()
    for (const w of catWeights) {
      riskTotals.set(w.riskLevel!, (riskTotals.get(w.riskLevel!) ?? 0) + w.totalRevenue)
    }
    const sumRisk = Array.from(riskTotals.values()).reduce((s, v) => s + v, 0)
    const riskPct: Record<string, number> = {}
    for (const rl of RISK_LEVELS) {
      riskPct[rl] = sumRisk > 0 ? (riskTotals.get(rl) ?? 0) / sumRisk : 1 / RISK_LEVELS.length
    }

    // Faixa de preço já decidida na Pirâmide de Preço para esta categoria —
    // input real (M4), não estimado. Sem plano salvo, divide igualmente.
    const tiers = tiersByCategory.get(category)
    const tierPct: Record<PriceTierId, number> = tiers
      ? {
          p1: (tiers.p1?.participation ?? 0) / 100,
          p2: (tiers.p2?.participation ?? 0) / 100,
          p3: (tiers.p3?.participation ?? 0) / 100,
        }
      : { p1: 1 / 3, p2: 1 / 3, p3: 1 / 3 }

    const cells: GridCell[] = []
    for (const tier of ['p1', 'p2', 'p3'] as PriceTierId[]) {
      for (const rl of RISK_LEVELS) {
        const key = `${category}::${tier}::${rl}`
        const override = overrides.get(key)
        cells.push({
          priceTier:  tier,
          riskLevel:  rl,
          pct:        override ?? (tierPct[tier] * riskPct[rl] * 100),
          isOverride: override != null,
        })
      }
    }
    grids.push({ category, categoryRevenue, cells })
  }
  return grids
}

// ── Ajustes manuais (overrides) ─────────────────────────────────────────────

export async function getGridAdjustments(
  tenantId: string,
  seasonId: string,
  divisionId: string,
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from('sortiment_grid_adjustments')
    .select('category, price_tier, risk_level, pct')
    .eq('tenant_id', tenantId)
    .eq('season_id', seasonId)
    .eq('division_id', divisionId)
  if (error) {
    console.warn('[sortimentGrid] getGridAdjustments:', error.message)
    return new Map()
  }
  const map = new Map<string, number>()
  for (const r of (data ?? []) as { category: string; price_tier: string; risk_level: string; pct: number }[]) {
    map.set(`${r.category}::${r.price_tier}::${r.risk_level}`, Number(r.pct))
  }
  return map
}

/**
 * Salva o ajuste de UMA célula E redistribui a diferença entre as outras
 * células da MESMA categoria, ponderado pelo valor atual de cada uma — mesmo
 * princípio já usado em outras telas (useModule3.ts, "Propagação delta"):
 * escalar cada uma pelo mesmo fator preserva a proporção entre elas e faz a
 * soma da categoria voltar a fechar em 100%, sem resolver um sistema.
 */
export async function saveGridCellAdjustment(
  tenantId: string,
  seasonId: string,
  divisionId: string,
  category: string,
  grid: CategoryGrid,
  editedTier: PriceTierId,
  editedRisk: RiskLevelId,
  newPct: number,
  userEmail?: string,
): Promise<CategoryGrid> {
  const clamped = Math.max(0, Math.min(100, newPct))
  const others = grid.cells.filter(c => !(c.priceTier === editedTier && c.riskLevel === editedRisk))
  const oldSumOthers = others.reduce((s, c) => s + c.pct, 0)
  const newSumOthers = Math.max(0, 100 - clamped)

  const nextCells: GridCell[] = grid.cells.map(c => {
    if (c.priceTier === editedTier && c.riskLevel === editedRisk) {
      return { ...c, pct: clamped, isOverride: true }
    }
    const scaled = oldSumOthers > 0 ? (c.pct / oldSumOthers) * newSumOthers : newSumOthers / others.length
    return { ...c, pct: scaled, isOverride: true }
  })

  const rows = nextCells.map(c => ({
    tenant_id:   tenantId,
    season_id:   seasonId,
    division_id: divisionId,
    category,
    price_tier:  c.priceTier,
    risk_level:  c.riskLevel,
    pct:         c.pct,
    updated_at:  new Date().toISOString(),
    updated_by:  userEmail ?? null,
  }))

  const { error } = await db
    .from('sortiment_grid_adjustments')
    .upsert(rows, { onConflict: 'tenant_id,season_id,division_id,category,price_tier,risk_level' })
  if (error) console.warn('[sortimentGrid] saveGridCellAdjustment:', error.message)

  return { ...grid, cells: nextCells }
}
