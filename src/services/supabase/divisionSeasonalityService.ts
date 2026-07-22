// ─── divisionSeasonalityService.ts ───────────────────────────────────────────
// Computa o perfil histórico mensal por divisão a partir de sales_history × products.
//
// Resultado: para cada divisão, qual % da receita anual caiu em cada mês.
// Usado pelo M4 (CycleValidation) para distribuir a receita mensal entre divisões
// respeitando a sazonalidade histórica de cada uma.
//
// Calibração bi-proporcional:
//   Quando o gestor edita a receita de uma divisão em um mês específico,
//   o sistema redistribui o delta entre os demais meses usando os pesos
//   históricos como fator de rateio, mantendo o total da divisão inalterado.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'
import { matchChannelToCanal, normalizeDivision } from './historicalProfileService'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Perfil mensal de uma divisão: % da receita anual da divisão em cada mês. */
export interface DivisionMonthProfile {
  division: string        // id normalizado ex: "feminino"
  label: string           // nome original ex: "Feminino"
  /** month (ex: "Janeiro") → % do total anual desta divisão (0–100), somam 100 */
  monthlyPcts: Record<string, number>
  /** PMV médio ponderado por receita para esta divisão */
  pmv: number
  /** Receita histórica total desta divisão (referência) */
  totalRevenue: number
}

/** Perfil mensal por canal × divisão. */
export interface CanalDivisionProfile {
  canalId: string
  /** Para cada divisão neste canal: perfil mensal */
  divisions: DivisionMonthProfile[]
  totalRevenue: number
}

export interface DivisionSeasonalityResult {
  /** Perfil consolidado (todos os canais juntos) — usado para view total */
  consolidated: DivisionMonthProfile[]
  /** Perfil por canal */
  byCanal: CanalDivisionProfile[]
  hasData: boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS_FULL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// ─── Função principal ─────────────────────────────────────────────────────────

export async function getDivisionSeasonality(
  tenantId: string,
): Promise<DivisionSeasonalityResult> {
  const empty: DivisionSeasonalityResult = {
    consolidated: [], byCanal: [], hasData: false,
  }
  if (!tenantId) return empty

  const db = supabase as any

  // 1. Lê sales_history
  const { data: sales, error: salesErr } = await db
    .from('sales_history')
    .select('channel, sale_date, revenue_net, price_realized, sku')
    .eq('tenant_id', tenantId)
    .not('revenue_net', 'is', null)
    .gt('revenue_net', 0)
    .limit(150_000)

  if (salesErr || !sales?.length) return empty

  // 2. Lê catálogo de produtos (para obter divisão por SKU)
  const { data: products } = await db
    .from('products')
    .select('sku, division, price_sale')
    .eq('tenant_id', tenantId)
    .not('sku', 'is', null)

  // 3. Monta map SKU → { division, price_sale }
  const skuMap = new Map<string, { division: string; price_sale: number }>()
  for (const p of products ?? []) {
    if (p.sku) skuMap.set(String(p.sku), { division: p.division ?? '', price_sale: p.price_sale ?? 0 })
  }

  // ─── Acumuladores ────────────────────────────────────────────────────────────
  // canal → divId → monthName → { receita, sumPmvW, wTotal }
  type MonthAcc = { receita: number; sumPmvW: number; wTotal: number }
  type DivAcc   = { label: string; months: Map<string, MonthAcc> }

  const canalDivMap = new Map<string, Map<string, DivAcc>>()
  const consoDivMap = new Map<string, DivAcc>()   // consolidated across canals

  for (const row of sales) {
    const rev     = (row.revenue_net  as number) ?? 0
    const pmv     = (row.price_realized as number) ?? 0
    const canalId = matchChannelToCanal(row.channel ?? '')
    const prod    = skuMap.get(String(row.sku ?? ''))
    if (!prod?.division) continue

    const divId   = normalizeDivision(prod.division)
    const label   = prod.division
    const dateStr = (row.sale_date as string) ?? ''
    const monthIdx = dateStr ? new Date(dateStr + 'T00:00:00').getMonth() : -1
    if (monthIdx < 0) continue
    const month = MONTHS_FULL[monthIdx]

    const updateAcc = (map: Map<string, DivAcc>) => {
      if (!map.has(divId)) map.set(divId, { label, months: new Map() })
      const divAcc = map.get(divId)!
      if (!divAcc.months.has(month)) divAcc.months.set(month, { receita: 0, sumPmvW: 0, wTotal: 0 })
      const mAcc = divAcc.months.get(month)!
      mAcc.receita  += rev
      mAcc.sumPmvW  += pmv * rev
      mAcc.wTotal   += rev
    }

    // Por canal
    if (!canalDivMap.has(canalId)) canalDivMap.set(canalId, new Map())
    updateAcc(canalDivMap.get(canalId)!)
    // Consolidado
    updateAcc(consoDivMap)
  }

  if (consoDivMap.size === 0) return empty

  // ─── Converte acumuladores em DivisionMonthProfile ────────────────────────

  function buildProfiles(divMap: Map<string, DivAcc>): DivisionMonthProfile[] {
    return Array.from(divMap.entries()).map(([division, acc]) => {
      let totalRev = 0
      let sumPmvW  = 0
      let wTotal   = 0

      // Soma por todos os meses
      for (const [, mAcc] of acc.months) {
        totalRev += mAcc.receita
        sumPmvW  += mAcc.sumPmvW
        wTotal   += mAcc.wTotal
      }

      // % de cada mês em relação ao total desta divisão
      const monthlyPcts: Record<string, number> = {}
      for (const month of MONTHS_FULL) {
        const mAcc = acc.months.get(month)
        monthlyPcts[month] = totalRev > 0 && mAcc
          ? Math.round((mAcc.receita / totalRev) * 1000) / 10
          : 0
      }

      // Renormaliza para garantir soma = 100 (arredondamentos)
      const sumPcts = Object.values(monthlyPcts).reduce((s, v) => s + v, 0)
      if (sumPcts > 0 && Math.abs(sumPcts - 100) > 0.1) {
        for (const m of Object.keys(monthlyPcts)) {
          monthlyPcts[m] = Math.round((monthlyPcts[m] / sumPcts) * 1000) / 10
        }
      }

      return {
        division,
        label:       acc.label,
        monthlyPcts,
        pmv:         wTotal > 0 ? Math.round(sumPmvW / wTotal) : 0,
        totalRevenue: totalRev,
      }
    }).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }

  const consolidated = buildProfiles(consoDivMap)

  const byCanal: CanalDivisionProfile[] = Array.from(canalDivMap.entries()).map(([canalId, divMap]) => {
    const divs = buildProfiles(divMap)
    return {
      canalId,
      divisions: divs,
      totalRevenue: divs.reduce((s, d) => s + d.totalRevenue, 0),
    }
  }).sort((a, b) => b.totalRevenue - a.totalRevenue)

  return { consolidated, byCanal, hasData: true }
}

// ─── Helpers para inicialização da matrix Division × Mês ─────────────────────

/**
 * Distribui a receita mensal de um canal entre divisões usando os perfis históricos.
 *
 * Lógica:
 *   1. Para cada mês: receita_canal_mês × pct_divisão_nesse_mês (normalizado cross-divisões)
 *   2. Garante que a soma das divisões em cada mês = receita_canal_mês
 *   3. Garante que o total anual de cada divisão ≈ m3Participation × totalColecao
 *
 * @param monthlyRevenue  Record<month, R$>  — receita total do canal por mês
 * @param profiles        Perfis históricos das divisões (consolidated ou byCanal)
 * @param m3Pcts          Record<divId, participationPct>  — do M3 (0–100)
 * @param months          Lista de meses no ciclo (ordem correta)
 */
export function buildDivisionMonthRevenue(
  monthlyRevenue: Record<string, number>,
  profiles: DivisionMonthProfile[],
  m3Pcts: Record<string, number>,
  months: string[],
): Record<string, Record<string, number>> {
  const divIds = Object.keys(m3Pcts)
  if (!divIds.length || !months.length) return {}

  const result: Record<string, Record<string, number>> = {}

  for (const month of months) {
    const totalMes = monthlyRevenue[month] ?? 0

    // Para cada mês, distribui entre divisões usando pesos cross-divisional
    // Peso de divisão D no mês M = hist_pctDivTotal(D,M) × m3Pcts(D)
    // (historicalMonthlyPct diz "D concentra X% da sua receita neste mês")
    // Ao multiplicar pelo total anual planeado da div, obtemos um peso de receita relativa neste mês

    const rawWeights: Record<string, number> = {}
    for (const divId of divIds) {
      const prof    = profiles.find(p => p.division === divId)
      const histPct = prof?.monthlyPcts[month] ?? (100 / months.length)  // fallback: distribuição uniforme
      const annPct  = m3Pcts[divId] ?? 0                                  // participação anual da div
      rawWeights[divId] = (histPct / 100) * annPct
    }

    const sumW = Object.values(rawWeights).reduce((s, v) => s + v, 0)

    let assigned = 0
    const divOrder = [...divIds]
    for (let i = 0; i < divOrder.length; i++) {
      const divId = divOrder[i]
      if (!result[divId]) result[divId] = {}
      if (i < divOrder.length - 1) {
        const share = sumW > 0 ? (rawWeights[divId] / sumW) * totalMes : 0
        result[divId][month] = Math.round(share)
        assigned += Math.round(share)
      } else {
        // Último: garante soma exata
        result[divId][month] = Math.max(0, Math.round(totalMes - assigned))
      }
    }
  }

  return result
}

/**
 * Aplica calibração bi-proporcional:
 * Quando o gestor edita div D no mês M → redistribui o delta entre os demais meses
 * de D proporcionalmente ao peso histórico de cada mês, mantendo o total de D inalterado.
 *
 * @param divRevenue  Estado atual de divId → month → R$
 * @param divId       Divisão editada
 * @param month       Mês editado
 * @param newValue    Novo valor R$
 * @param monthlyHistWeights  Pesos históricos: month → pct (usados como denominador do rateio)
 */
export function applyBiproportional(
  divRevenue: Record<string, Record<string, number>>,
  divId: string,
  month: string,
  newValue: number,
  monthlyHistWeights: Record<string, number>,
): Record<string, Record<string, number>> {
  const currentDiv = { ...(divRevenue[divId] ?? {}) }
  const oldValue   = currentDiv[month] ?? 0
  const delta      = newValue - oldValue

  if (delta === 0) return divRevenue

  // Fixa o mês editado
  currentDiv[month] = Math.max(0, newValue)

  // Demais meses absorvem o delta com peso histórico
  const otherMonths = Object.keys(currentDiv).filter(m => m !== month)
  const sumHistOther = otherMonths.reduce((s, m) => s + (monthlyHistWeights[m] ?? 0), 0)

  if (sumHistOther > 0) {
    for (const m of otherMonths) {
      const weight  = (monthlyHistWeights[m] ?? 0) / sumHistOther
      const adjusted = (currentDiv[m] ?? 0) - delta * weight
      currentDiv[m] = Math.max(0, Math.round(adjusted))
    }
  } else {
    // Fallback: distribui igualmente
    const each = delta / otherMonths.length
    for (const m of otherMonths) {
      currentDiv[m] = Math.max(0, Math.round((currentDiv[m] ?? 0) - each))
    }
  }

  return { ...divRevenue, [divId]: currentDiv }
}
