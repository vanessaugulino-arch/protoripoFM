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
  totalRevenue: number
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
  return (data ?? []) as HierarchyRevenueWeight[]
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

  for (const [divisionId, block] of Object.entries(divisions)) {
    const divisionRevenue: number =
      consolidated?.divisionBreakdown?.[divisionId]?.revenue ??
      block?.indicators?.revenue ??
      0
    if (!divisionRevenue) continue // sem receita planejada, nada a distribuir

    const riskMatrix = block?.riskMatrix ?? {}
    const pctSustentadorMargem = riskMatrix.sustentadorMargem ?? null
    const pctMotorGiro         = riskMatrix.motorGiro ?? null
    const pctIconeMarca        = riskMatrix.iconeMarca ?? null

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
    updatedAt:             r.updated_at,
  }))
}

// ── Exportação CSV ────────────────────────────────────────────────────────────

export function buildConsolidatedCsv(rows: ConsolidatedDbRow[]): string {
  const header = [
    'Divisão', 'Categoria', 'Subcategoria', 'Linha', 'Faixa de Preço',
    'Receita Estimada', '% Sustentador de Margem', '% Motor de Giro', '% Ícone de Marca',
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
