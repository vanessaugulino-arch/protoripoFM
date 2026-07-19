// src/services/supabase/pricePyramidService.ts
// Gerencia planos de pirâmide de preço por divisão/temporada no Supabase.
//
// Tabela: price_pyramid_plans
//   tenant_id   uuid  NOT NULL
//   season_id   text  NOT NULL
//   division_id text  NOT NULL
//   plan        jsonb NOT NULL   -- CategoryPricePlan[]
//   updated_at  timestamptz
//   PRIMARY KEY (tenant_id, season_id, division_id)
//
// Médias históricas são calculadas diretamente dos produtos importados
// (tabela products), filtrando por division e faixa de sale_price.

import { supabase as _supabase } from '../../lib/supabase'
import type { CategoryPricePlan, PriceTierId } from '../../app/types/pricePyramid'
import type { FaixaCategoria } from './operationSettingsService'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any // price_pyramid_plans não está no database.types.ts

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TierRange {
  min: number
  max: number
}

/** Média histórica de sale_price por faixa, calculada sobre os produtos do tenant. */
export type TierHistoricalAvg = Record<PriceTierId, number | null>

/** Ranges P1/P2/P3 para uma categoria específica (carregados do operation_settings). */
export interface CategoryTierRanges {
  categoryLabel: string
  p1: TierRange
  p2: TierRange
  p3: TierRange
}

// ─── Configuração de Faixas (OperationSettings) ──────────────────────────────

/**
 * Carrega as faixas P1/P2/P3 por categoria de uma divisão a partir de
 * operation_settings.faixas_categoria.
 *
 * Retorna:
 *   byCategory — ranges por label de categoria (para display individual na PricePyramid)
 *   global     — união dos ranges de todas as categorias (para query histórica no M3)
 *
 * Retorna null se não houver dados salvos ou se a divisão não tiver categorias.
 */
export async function loadDivisionTierConfig(
  tenantId: string,
  divisionId: string,
): Promise<{ byCategory: CategoryTierRanges[]; global: Record<PriceTierId, TierRange> } | null> {
  const { data, error } = await supabase
    .from('operation_settings')
    .select('faixas_categoria')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data?.faixas_categoria) return null

  const all = data.faixas_categoria as FaixaCategoria[]
  const forDiv = all.filter((f) => !f.divisao || f.divisao === divisionId)
  if (forDiv.length === 0) return null

  const byCategory: CategoryTierRanges[] = forDiv.map((f) => ({
    categoryLabel: f.categoria,
    p1: { min: f.faixas.P1.inicio, max: f.faixas.P1.fim },
    p2: { min: f.faixas.P2.inicio, max: f.faixas.P2.fim },
    p3: { min: f.faixas.P3.inicio, max: f.faixas.P3.fim },
  }))

  const global: Record<PriceTierId, TierRange> = {
    p1: { min: Math.min(...byCategory.map((c) => c.p1.min)), max: Math.max(...byCategory.map((c) => c.p1.max)) },
    p2: { min: Math.min(...byCategory.map((c) => c.p2.min)), max: Math.max(...byCategory.map((c) => c.p2.max)) },
    p3: { min: Math.min(...byCategory.map((c) => c.p3.min)), max: Math.max(...byCategory.map((c) => c.p3.max)) },
  }

  return { byCategory, global }
}

/**
 * Carrega os ranges globais (P1/P2/P3) de todas as divisões em uma única query.
 * Usado pelo M3 para substituir M3_TIER_RANGES hardcoded.
 * Retorna null se não houver dados; caller usa fallback hardcoded.
 */
export async function loadAllDivisionGlobalRanges(
  tenantId: string,
): Promise<Record<string, Record<PriceTierId, TierRange>> | null> {
  const { data, error } = await supabase
    .from('operation_settings')
    .select('faixas_categoria')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data?.faixas_categoria) return null

  const all = data.faixas_categoria as FaixaCategoria[]
  if (all.length === 0) return null

  // Agrupa por divisão
  const byDiv = new Map<string, FaixaCategoria[]>()
  for (const f of all) {
    const div = f.divisao ?? '_global'
    if (!byDiv.has(div)) byDiv.set(div, [])
    byDiv.get(div)!.push(f)
  }

  const result: Record<string, Record<PriceTierId, TierRange>> = {}
  for (const [div, faixas] of byDiv.entries()) {
    result[div] = {
      p1: { min: Math.min(...faixas.map((f) => f.faixas.P1.inicio)), max: Math.max(...faixas.map((f) => f.faixas.P1.fim)) },
      p2: { min: Math.min(...faixas.map((f) => f.faixas.P2.inicio)), max: Math.max(...faixas.map((f) => f.faixas.P2.fim)) },
      p3: { min: Math.min(...faixas.map((f) => f.faixas.P3.inicio)), max: Math.max(...faixas.map((f) => f.faixas.P3.fim)) },
    }
  }

  return result
}

// ─── Médias Históricas ────────────────────────────────────────────────────────

/**
 * Busca a média de preço de venda dos produtos importados para cada faixa,
 * filtrada por divisão e intervalo de preço.
 *
 * @param tenantId  tenant do cliente
 * @param division  valor do campo `division` na tabela products (ex: "feminino")
 * @param tiers     limites min/max de cada faixa (p1/p2/p3) em R$
 */
export async function fetchHistoricalTierAvgs(
  tenantId: string,
  division: string,
  tiers: Record<PriceTierId, TierRange>,
): Promise<TierHistoricalAvg> {
  const result: TierHistoricalAvg = { p1: null, p2: null, p3: null }

  await Promise.all(
    (Object.entries(tiers) as [PriceTierId, TierRange][]).map(async ([tid, range]) => {
      const { data, error } = await supabase
        .from('products')
        .select('sale_price')
        .eq('tenant_id', tenantId)
        .eq('division', division)
        .gte('sale_price', range.min)
        .lte('sale_price', range.max)

      if (error) {
        console.warn(`[pricePyramid] fetchHistoricalTierAvgs ${tid}:`, error.message)
        return
      }

      const rows = (data ?? []) as { sale_price: number }[]
      if (rows.length === 0) return

      const avg = rows.reduce((sum, r) => sum + (r.sale_price ?? 0), 0) / rows.length
      result[tid] = Math.round(avg)
    }),
  )

  return result
}

// ─── Plano de pirâmide ────────────────────────────────────────────────────────

/**
 * Persiste o plano de pirâmide de preço (participações + médias planejadas)
 * para uma divisão em uma temporada. Upsert por (tenant_id, season_id, division_id).
 */
export async function savePyramidPlan(
  tenantId: string,
  seasonId: string,
  divisionId: string,
  categories: CategoryPricePlan[],
): Promise<void> {
  const { error } = await supabase
    .from('price_pyramid_plans')
    .upsert(
      {
        tenant_id:   tenantId,
        season_id:   seasonId,
        division_id: divisionId,
        plan:        categories,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'tenant_id,season_id,division_id' },
    )

  if (error) console.warn('[pricePyramid] savePyramidPlan:', error.message)
}

/**
 * Carrega o plano de pirâmide de preço para uma divisão em uma temporada.
 * Retorna null se não houver plano salvo (usar defaults no caller).
 */
export async function loadPyramidPlan(
  tenantId: string,
  seasonId: string,
  divisionId: string,
): Promise<CategoryPricePlan[] | null> {
  const { data, error } = await supabase
    .from('price_pyramid_plans')
    .select('plan')
    .eq('tenant_id', tenantId)
    .eq('season_id', seasonId)
    .eq('division_id', divisionId)
    .maybeSingle()

  if (error) {
    console.warn('[pricePyramid] loadPyramidPlan:', error.message)
    return null
  }

  return (data?.plan as CategoryPricePlan[]) ?? null
}
