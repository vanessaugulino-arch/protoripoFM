// ─── consolidatedHierarchyService.ts ───────────────────────────────────────────
// Fase 2 do plano de ajustes (ver conversa com Gemini em 5_PRD/FASHION_MIND/BRUTO):
// cruza divisão→categoria→subcategoria→linha com faixa de preço, para que o
// planejamento efetivo (hoje só visível espalhado entre M3 e Pirâmide de Preço)
// possa ser consultado/exportado a qualquer momento.
//
// O que é INPUT real do usuário:
//   • riskMatrix por divisão       — division_scenarios.divisions (M3)
//   • faixa de preço por categoria — price_pyramid_plans.plan (Pirâmide de Preço)
//
// O que é ESTIMADO (proporcional à receita histórica — sales_history×products —
// porque não existe hoje nenhuma tela onde o usuário configure isso diretamente):
//   • participação de cada categoria dentro da divisão
//   • participação de cada subcategoria/linha dentro da categoria
//
// Tabela: division_hierarchy_consolidated (migration 023).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'
import { normalizeDivision } from './historicalProfileService'
import { fetchHierarchyPaths, type HierarchyPath } from './productHierarchyService'
import { listDivisionScenarios } from './divisionScenarioService'
import { loadPyramidPlan } from './pricePyramidService'
import type { PriceTierId } from '../../app/types/pricePyramid'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface HierarchyRevenueWeight {
  division: string
  category: string
  subcategory: string | null
  linha: string | null
  riskLevel: string | null
  totalRevenue: number
  /** Peças vendidas (real) — alimenta PMV/MKD% reais por categoria. */
  quantitySum: number
  /** Σ(preço realizado × receita) — dividir por totalRevenue pra achar o PMV ponderado real. */
  pmvWeightedSum: number
  /** Σ desconto real. */
  discountSum: number
  /** Σ(quantidade × preço de tabela) — divisor do MKD% real (discountSum ÷ priceSaleQtySum). */
  priceSaleQtySum: number
}

export interface ConsolidatedRow {
  divisionId: string
  category: string
  subcategory: string
  linha: string
  priceTier: PriceTierId
  revenueEstimate: number
  pctSustentadorMargem: number | null
  pctMotorGiro: number | null
  pctIconeMarca: number | null
  pctBasico: number | null
}

const NO_SUBCATEGORY = '(sem subcategoria)'
const NO_LINHA        = '(sem linha)'

// ── Peso histórico (agregação pura, sem regra de negócio) ────────────────────

export async function getHierarchyRevenueByPath(tenantId: string): Promise<HierarchyRevenueWeight[]> {
  const { data, error } = await db.rpc('get_hierarchy_revenue_by_path', { p_tenant_id: tenantId })
  if (error) {
    console.warn('[consolidatedHierarchy] get_hierarchy_revenue_by_path:', error.message)
    return []
  }
  // BUG real corrigido aqui (2026-09-08): a função RPC devolve colunas
  // snake_case (total_revenue, risk_level) — o cast direto pra
  // HierarchyRevenueWeight (camelCase) nunca mapeava os campos, então todo
  // peso histórico (w.totalRevenue) sempre lia `undefined`. distributeByWeight
  // caía sempre no fallback "sem histórico, divide igualmente" — por isso
  // categoria/subcategoria/linha sempre apareciam com splits perfeitamente
  // iguais na Cascata do Sortimento, nunca refletindo o histórico real.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    division:        r.division as string,
    category:        r.category as string,
    subcategory:     (r.subcategory as string) ?? null,
    linha:           (r.linha as string) ?? null,
    riskLevel:       (r.risk_level as string) ?? null,
    totalRevenue:    Number(r.total_revenue) || 0,
    quantitySum:     Number(r.quantity_sum) || 0,
    pmvWeightedSum:  Number(r.pmv_weighted_sum) || 0,
    discountSum:     Number(r.discount_sum) || 0,
    priceSaleQtySum: Number(r.price_sale_qty_sum) || 0,
  }))
}

/**
 * PMV e MKD% reais por categoria, escopados a uma divisão — Ano Anterior da
 * Engenharia de Sortimento (M6). Mesma categoria pode existir em mais de uma
 * divisão (ex.: "Calças" em Feminino e Masculino) com histórico bem
 * diferente, por isso escopa por divisão — mesmo padrão de computeCategoryGrids.
 * Fórmula: PMV = soma ponderada por receita ÷ receita total (mesma de
 * historicalProfileService.ts); MKD% = desconto total ÷ (peças × preço de
 * tabela), mesma fórmula confirmada na migration 034, agora por categoria.
 */
export async function getCategoryHistoricalIndicators(
  tenantId: string,
  divisionId: string,
): Promise<Record<string, { avgPrice: number; mkdPct: number | null }>> {
  const weights = await getHierarchyRevenueByPath(tenantId)
  const byCategory = new Map<string, { revenue: number; pmvW: number; discount: number; priceSaleQty: number }>()
  for (const w of weights) {
    if (normalizeDivision(w.division) !== divisionId) continue
    const acc = byCategory.get(w.category) ?? { revenue: 0, pmvW: 0, discount: 0, priceSaleQty: 0 }
    acc.revenue     += w.totalRevenue
    acc.pmvW        += w.pmvWeightedSum
    acc.discount    += w.discountSum
    acc.priceSaleQty += w.priceSaleQtySum
    byCategory.set(w.category, acc)
  }

  const result: Record<string, { avgPrice: number; mkdPct: number | null }> = {}
  for (const [category, acc] of byCategory) {
    if (acc.revenue <= 0) continue
    result[category] = {
      avgPrice: acc.pmvW / acc.revenue,
      mkdPct:   acc.priceSaleQty > 0 ? (acc.discount / acc.priceSaleQty) * 100 : null,
    }
  }
  return result
}

/**
 * Matriz de risco REAL por divisão — distribuição de receita histórica por
 * products.risk_level (mesma fonte usada no painel de Giro por Perfil de
 * Risco do M5), agregada a partir de getHierarchyRevenueByPath. Fecha o gap
 * "Básico só existe no M6" — antes o M4 só tinha um default genérico
 * (3 vias, sem nenhuma base real), sem nenhuma ponte com o histórico real de
 * risco que o catálogo já tem.
 */
export async function getDivisionRiskProfile(
  tenantId: string,
): Promise<Record<string, { sustentadorMargem: number; motorGiro: number; iconeMarca: number; basico: number }>> {
  const weights = await getHierarchyRevenueByPath(tenantId)
  const byDivision = new Map<string, Map<string, number>>()
  for (const w of weights) {
    if (!w.riskLevel) continue
    const divId = normalizeDivision(w.division)
    if (!byDivision.has(divId)) byDivision.set(divId, new Map())
    const m = byDivision.get(divId)!
    m.set(w.riskLevel, (m.get(w.riskLevel) ?? 0) + w.totalRevenue)
  }

  const result: Record<string, { sustentadorMargem: number; motorGiro: number; iconeMarca: number; basico: number }> = {}
  for (const [divId, m] of byDivision) {
    const sum = Array.from(m.values()).reduce((s, v) => s + v, 0)
    if (sum <= 0) continue
    result[divId] = {
      sustentadorMargem: ((m.get('sustentador') ?? 0) / sum) * 100,
      motorGiro:          ((m.get('motor_giro')  ?? 0) / sum) * 100,
      iconeMarca:         ((m.get('icone')       ?? 0) / sum) * 100,
      basico:             ((m.get('basico')      ?? 0) / sum) * 100,
    }
  }
  return result
}

// ── Composição: aplica os inputs reais (M3 + Pirâmide) sobre a hierarquia real,
//    distribuindo os níveis sem input direto proporcionalmente ao histórico ───

function distributeByWeight<T>(
  items: T[],
  weightOf: (item: T) => number,
): Map<T, number> {
  const total = items.reduce((s, it) => s + weightOf(it), 0)
  const shares = new Map<T, number>()
  if (total > 0) {
    for (const it of items) shares.set(it, weightOf(it) / total)
  } else {
    // Sem histórico nenhum para este grupo — divide igualmente para não zerar.
    const equal = items.length > 0 ? 1 / items.length : 0
    for (const it of items) shares.set(it, equal)
  }
  return shares
}

export async function computeConsolidatedRows(
  tenantId: string,
  seasonId: string,
): Promise<ConsolidatedRow[]> {
  const [scenarios, weights, paths] = await Promise.all([
    listDivisionScenarios(tenantId, seasonId),
    getHierarchyRevenueByPath(tenantId),
    fetchHierarchyPaths(tenantId),
  ])

  const applied = scenarios.find(s => s.is_applied)
  if (!applied) return [] // nada aplicado no M3 para esta temporada ainda

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const divisions = (applied.divisions ?? {}) as Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consolidated = (applied.consolidated ?? {}) as any

  const rows: ConsolidatedRow[] = []

  // BUG real corrigido aqui (2026-09-08): a cascata do M6 nunca gerava
  // nenhuma linha, pra NENHUM tenant — `consolidated.divisionBreakdown` é um
  // stub sempre gravado como `{}` (useModule3.ts/module3ScenarioService.ts
  // nunca o populam) e `block.indicators.revenue` nunca é escrito em lugar
  // nenhum (é sempre calculado on-the-fly como macroRevenue×participação, não
  // persistido no indicador). `divisionRevenue` caía sempre em 0, então TODA
  // divisão era pulada e a cascata voltava vazia — mesmo com catálogo e
  // Pirâmide de Preço completos. `consolidated.totalRevenue` é o campo que
  // REALMENTE existe (gravado por calculateScenarioConsolidated a cada save,
  // é a receita macro total da temporada, não da divisão) — a receita por
  // divisão se deriva dele × participação, do mesmo jeito que a tela do M6
  // já faz para montar o card "Metas Estratégicas".
  const totalRevenueSeason: number = consolidated?.totalRevenue ?? 0

  for (const [divisionId, block] of Object.entries(divisions)) {
    const participation: number = block?.participation ?? 0
    const divisionRevenue: number =
      totalRevenueSeason > 0 && participation > 0
        ? totalRevenueSeason * (participation / 100)
        : (block?.indicators?.revenue ?? 0)
    if (!divisionRevenue) continue // sem receita planejada, nada a distribuir

    const riskMatrix = block?.riskMatrix ?? {}
    const pctSustentadorMargem = riskMatrix.sustentadorMargem ?? null
    const pctMotorGiro         = riskMatrix.motorGiro ?? null
    const pctIconeMarca        = riskMatrix.iconeMarca ?? null
    const pctBasico            = riskMatrix.basico ?? null

    // Caminhos reais do catálogo desta divisão (compara pelo id normalizado —
    // products.division guarda o rótulo bruto, ex. "Feminino").
    const divisionPaths: HierarchyPath[] = paths.filter(
      p => p.division != null && normalizeDivision(p.division) === divisionId,
    )
    if (divisionPaths.length === 0) continue

    const divisionWeights = weights.filter(
      w => w.division != null && normalizeDivision(w.division) === divisionId,
    )

    // ── Nível 2: participação de cada categoria dentro da divisão (estimada) ──
    const categories = Array.from(new Set(divisionPaths.map(p => p.category ?? '')))
      .filter(c => c !== '')
    const categoryWeightOf = (cat: string) =>
      divisionWeights
        .filter(w => w.category === cat)
        .reduce((s, w) => s + (w.totalRevenue ?? 0), 0)
    const categoryShares = distributeByWeight(categories, categoryWeightOf)

    // Plano de faixa de preço por categoria (Pirâmide de Preço) — input real.
    const pyramidPlan = await loadPyramidPlan(tenantId, seasonId, divisionId)
    const tiersByCategory = new Map(
      (pyramidPlan ?? []).map(c => [c.label, c.tiers]),
    )

    for (const category of categories) {
      const categoryShare = categoryShares.get(category) ?? 0
      const categoryRevenue = divisionRevenue * categoryShare
      if (categoryRevenue <= 0) continue

      const tiers = tiersByCategory.get(category)
      const tierPct: Record<PriceTierId, number> = tiers
        ? {
            p1: (tiers.p1?.participation ?? 0) / 100,
            p2: (tiers.p2?.participation ?? 0) / 100,
            p3: (tiers.p3?.participation ?? 0) / 100,
          }
        // Sem plano salvo na Pirâmide de Preço para esta categoria — divide
        // igualmente entre as 3 faixas em vez de zerar a categoria inteira.
        : { p1: 1 / 3, p2: 1 / 3, p3: 1 / 3 }

      // ── Níveis 3/4: participação de subcategoria/linha dentro da categoria
      //    (estimada) ──────────────────────────────────────────────────────
      const pathsInCategory = divisionPaths.filter(p => (p.category ?? '') === category)
      const pathWeightOf = (p: HierarchyPath) =>
        divisionWeights
          .filter(w => w.category === category && w.subcategory === p.subcategory && w.linha === p.linha)
          .reduce((s, w) => s + (w.totalRevenue ?? 0), 0)
      const pathShares = distributeByWeight(pathsInCategory, pathWeightOf)

      for (const path of pathsInCategory) {
        const pathShare = pathShares.get(path) ?? 0
        if (pathShare <= 0) continue

        for (const tier of ['p1', 'p2', 'p3'] as PriceTierId[]) {
          const revenueEstimate = categoryRevenue * tierPct[tier] * pathShare
          if (revenueEstimate <= 0) continue
          rows.push({
            divisionId,
            category,
            subcategory: path.subcategory ?? NO_SUBCATEGORY,
            linha: path.linha ?? NO_LINHA,
            priceTier: tier,
            revenueEstimate,
            pctSustentadorMargem,
            pctMotorGiro,
            pctIconeMarca,
            pctBasico,
          })
        }
      }
    }
  }

  return rows
}

// ── Persistência: recalcula tudo e substitui as linhas da temporada ──────────

export async function computeAndSaveConsolidated(
  tenantId: string,
  seasonId: string,
): Promise<void> {
  try {
    const rows = await computeConsolidatedRows(tenantId, seasonId)

    // Substitui as linhas desta temporada — mais simples e seguro que tentar
    // reconciliar upsert parcial quando categorias/caminhos somem entre um
    // recálculo e outro (ex.: catálogo reimportado, plano de preço mudou).
    const { error: delErr } = await db
      .from('division_hierarchy_consolidated')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('season_id', seasonId)
    if (delErr) throw delErr

    if (rows.length === 0) return

    const payload = rows.map(r => ({
      tenant_id:              tenantId,
      season_id:              seasonId,
      division_id:            r.divisionId,
      category:               r.category,
      subcategory:            r.subcategory,
      linha:                  r.linha,
      price_tier:             r.priceTier,
      revenue_estimate:       r.revenueEstimate,
      pct_sustentador_margem: r.pctSustentadorMargem,
      pct_motor_giro:         r.pctMotorGiro,
      pct_icone_marca:        r.pctIconeMarca,
      pct_basico:             r.pctBasico,
      updated_at:             new Date().toISOString(),
    }))

    const { error: insErr } = await db
      .from('division_hierarchy_consolidated')
      .insert(payload)
    if (insErr) throw insErr
  } catch (err) {
    // Best-effort — não bloqueia o fluxo de quem aplicou o M3 ou salvou a
    // Pirâmide de Preço. O consolidado fica desatualizado até o próximo
    // recálculo bem-sucedido; não há perda de dados de planejamento em si.
    console.warn('[consolidatedHierarchy] computeAndSaveConsolidated:', err)
  }
}

// ── Consulta ──────────────────────────────────────────────────────────────────

export interface ConsolidatedDbRow extends ConsolidatedRow {
  updatedAt: string
}

export async function getConsolidated(
  tenantId: string,
  seasonId: string,
): Promise<ConsolidatedDbRow[]> {
  const { data, error } = await db
    .from('division_hierarchy_consolidated')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('season_id', seasonId)
    .order('division_id', { ascending: true })
    .order('category', { ascending: true })

  if (error) {
    console.warn('[consolidatedHierarchy] getConsolidated:', error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    divisionId:            r.division_id,
    category:              r.category,
    subcategory:           r.subcategory,
    linha:                 r.linha,
    priceTier:             r.price_tier,
    revenueEstimate:       Number(r.revenue_estimate ?? 0),
    pctSustentadorMargem:  r.pct_sustentador_margem != null ? Number(r.pct_sustentador_margem) : null,
    pctMotorGiro:          r.pct_motor_giro != null ? Number(r.pct_motor_giro) : null,
    pctIconeMarca:         r.pct_icone_marca != null ? Number(r.pct_icone_marca) : null,
    pctBasico:             r.pct_basico != null ? Number(r.pct_basico) : null,
    updatedAt:             r.updated_at,
  }))
}

// ── Exportação CSV ────────────────────────────────────────────────────────────

export function buildConsolidatedCsv(rows: ConsolidatedDbRow[]): string {
  const header = [
    'Divisão', 'Categoria', 'Subcategoria', 'Linha', 'Faixa de Preço',
    'Receita Estimada', '% Sustentador de Margem', '% Motor de Giro', '% Ícone de Marca', '% Básico',
    'Atualizado em',
  ]
  const lines = rows.map(r => [
    r.divisionId,
    r.category,
    r.subcategory,
    r.linha,
    r.priceTier.toUpperCase(),
    r.revenueEstimate.toFixed(2),
    r.pctSustentadorMargem?.toFixed(1) ?? '',
    r.pctMotorGiro?.toFixed(1) ?? '',
    r.pctIconeMarca?.toFixed(1) ?? '',
    r.pctBasico?.toFixed(1) ?? '',
    r.updatedAt,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))

  return [header.join(';'), ...lines].join('\n')
}

export async function exportConsolidatedCsv(tenantId: string, seasonId: string): Promise<void> {
  const rows = await getConsolidated(tenantId, seasonId)
  const csv = buildConsolidatedCsv(rows)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `consolidado_hierarquia_${seasonId}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
