// ─── historicalProfileService.ts ──────────────────────────────────────────────
// Computa proporções históricas reais a partir de sales_history × products.
//
// Usado por:
//   • ChannelPlanning  — proporções de receita/peças por canal
//   • Module3Division  — proporções de receita/peças por divisão
//   • CycleValidation  — PMV e custo médio por canal (fallback enriquecido)
//
// Lógica: lê sales_history (revenue_net, quantity, channel, sku) e faz join
// em memória com products (division, price_tier, risk_level, price_cost).
// Grupos sem correspondência são descartados do denominador.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'

// ─── Normalização de canal (mesma lógica de CycleValidation) ─────────────────
export function matchChannelToCanal(channel: string): string {
  const ch = (channel ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (ch.includes('varejo') || ch.includes('fisico') || ch.includes('loja'))   return 'varejo'
  if (ch.includes('ecommerce') || ch.includes('online') || ch.includes('site')) return 'ecommerce'
  if (ch.includes('atacado') || ch.includes('distrib'))                         return 'atacado'
  if (ch.includes('franquia'))                                                   return 'franquia'
  if (ch.includes('multimarca') || ch.includes('revend'))                       return 'multimarca'
  if (ch.includes('marketplace'))                                                return 'marketplace'
  if (ch.includes('popup') || ch.includes('evento'))                            return 'popup'
  if (ch.includes('social'))                                                     return 'social_commerce'
  return ch
}

// Agrupamento M2: 3 macro-canais (idêntico ao CHANNEL_SALES_IDS de ChannelPlanning)
export function canalToM2Group(canalId: string): 'atacado' | 'varejo' | 'ecommerce' | null {
  if (['atacado'].includes(canalId))                                              return 'atacado'
  if (['varejo', 'franquia', 'popup'].includes(canalId))                         return 'varejo'
  if (['ecommerce', 'marketplace', 'social_commerce'].includes(canalId))         return 'ecommerce'
  return null
}

// Normalização de divisão → BusinessDivisionId
export function normalizeDivision(div: string): string {
  const d = (div ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (d.includes('fem'))                                       return 'feminino'
  if (d.includes('masc') || d.includes('hom') || d.includes('mas')) return 'masculino'
  if (d.includes('inf') || d.includes('kid') || d.includes('crian')) return 'infantil'
  if (d.includes('acess') || d.includes('aces'))              return 'acessorios'
  return d.replace(/\s+/g, '_').slice(0, 20)
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface HistoricalChannelProfile {
  canalId:    string    // canal canônico (ex: 'varejo', 'ecommerce', 'atacado')
  pctReceita: number    // % da receita total (0–100)
  pctPecas:   number    // % das peças totais (0–100)
  avgPmv:     number    // PMV médio do canal em R$
  avgCost:    number    // custo médio ponderado (dos produtos vendidos neste canal)
  totalReceita: number  // R$ absoluto
}

export interface HistoricalDivisionProfile {
  division:   string    // id normalizado (ex: 'feminino', 'masculino')
  label:      string    // nome original (ex: 'Feminino')
  pctReceita: number
  pctPecas:   number
  avgPmv:     number
  avgCost:    number
  avgMargin:  number    // margem estimada %
  totalReceita: number
}

export interface HistoricalProfiles {
  channels:  HistoricalChannelProfile[]
  divisions: HistoricalDivisionProfile[]
  totalReceita: number
  totalPecas:   number
  hasData:      boolean
}

// ─── Agregação mensal (banco) ─────────────────────────────────────────────────
// BUG real corrigido aqui: toda função abaixo lia sales_history CRUA com um
// LIMIT fixo (100k) e agregava em JS. Um tenant com mais linhas que o limite
// (este já passou de 637 mil) tinha sua "sazonalidade histórica" calculada
// sobre uma fatia ARBITRÁRIA do banco (sem ORDER BY, o Postgres devolve as
// primeiras linhas que achar fisicamente) — meses inteiros ficavam de fora
// silenciosamente. Corrigido com uma função SQL (get_sales_monthly_aggregates,
// migration 026) que agrega no banco por canal/divisão/ano/mês — o resultado
// tem no máximo algumas centenas de linhas, nunca precisa de LIMIT.

export interface SalesMonthlyAggregate {
  channel: string
  division: string | null
  saleYear: number
  saleMonth: number // 1–12
  revenueNet: number
  quantity: number
  priceRealizedSum: number
  priceRealizedCount: number
  pmvWeightedSum: number
  costWeightedSum: number
  marginWeightedSum: number
}

export async function getSalesMonthlyAggregates(tenantId: string): Promise<SalesMonthlyAggregate[]> {
  if (!tenantId) return []
  const db = supabase as any
  const { data, error } = await db.rpc('get_sales_monthly_aggregates', { p_tenant_id: tenantId })
  if (error || !data) return []
  return (data as any[]).map(r => ({
    channel:            (r.channel as string) ?? '',
    division:           (r.division as string | null) ?? null,
    saleYear:           Number(r.sale_year) || 0,
    saleMonth:          Number(r.sale_month) || 0,
    revenueNet:         Number(r.revenue_net) || 0,
    quantity:           Number(r.quantity) || 0,
    priceRealizedSum:   Number(r.price_realized_sum) || 0,
    priceRealizedCount: Number(r.price_realized_count) || 0,
    pmvWeightedSum:     Number(r.pmv_weighted_sum) || 0,
    costWeightedSum:    Number(r.cost_weighted_sum) || 0,
    marginWeightedSum:  Number(r.margin_weighted_sum) || 0,
  }))
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function getHistoricalProfiles(tenantId: string): Promise<HistoricalProfiles> {
  const empty: HistoricalProfiles = {
    channels: [], divisions: [], totalReceita: 0, totalPecas: 0, hasData: false,
  }
  if (!tenantId) return empty

  const rows = await getSalesMonthlyAggregates(tenantId)
  if (!rows.length) return empty

  // ─── Acumuladores por canal M2 ─────────────────────────────────────────────
  type CanalAcc = {
    receita: number; pecas: number;
    sumPmvW: number; sumCostW: number; wTotal: number
  }
  const canalAcc = new Map<string, CanalAcc>()

  // ─── Acumuladores por divisão ─────────────────────────────────────────────
  type DivAcc = {
    label: string; receita: number; pecas: number;
    sumPmvW: number; sumCostW: number; sumMarginW: number; wTotal: number
  }
  const divAcc = new Map<string, DivAcc>()

  let totalReceita = 0
  let totalPecas   = 0

  for (const row of rows) {
    const receita = row.revenueNet
    const pecas   = row.quantity
    const canal   = matchChannelToCanal(row.channel)
    const m2      = canalToM2Group(canal)

    totalReceita += receita
    totalPecas   += pecas

    // ── Canal M2 ──────────────────────────────────────────────────────────────
    if (m2) {
      const acc = canalAcc.get(m2) ?? { receita: 0, pecas: 0, sumPmvW: 0, sumCostW: 0, wTotal: 0 }
      acc.receita  += receita
      acc.pecas    += pecas
      acc.sumPmvW  += row.pmvWeightedSum
      acc.sumCostW += row.costWeightedSum
      acc.wTotal   += receita
      canalAcc.set(m2, acc)
    }

    // ── Divisão ──────────────────────────────────────────────────────────────
    if (row.division) {
      const divId = normalizeDivision(row.division)
      const acc   = divAcc.get(divId) ?? {
        label: row.division, receita: 0, pecas: 0,
        sumPmvW: 0, sumCostW: 0, sumMarginW: 0, wTotal: 0,
      }
      acc.receita    += receita
      acc.pecas      += pecas
      acc.sumPmvW    += row.pmvWeightedSum
      acc.sumCostW   += row.costWeightedSum
      acc.sumMarginW += row.marginWeightedSum
      acc.wTotal     += receita
      divAcc.set(divId, acc)
    }
  }

  if (totalReceita === 0) return empty

  // ─── Monta resultado de canais ─────────────────────────────────────────────
  const channels: HistoricalChannelProfile[] = Array.from(canalAcc.entries()).map(([canalId, acc]) => ({
    canalId,
    pctReceita:    Math.round((acc.receita / totalReceita) * 1000) / 10,
    pctPecas:      totalPecas > 0 ? Math.round((acc.pecas / totalPecas) * 1000) / 10 : 0,
    avgPmv:        acc.wTotal > 0 ? Math.round(acc.sumPmvW  / acc.wTotal) : 0,
    avgCost:       acc.wTotal > 0 ? Math.round(acc.sumCostW / acc.wTotal) : 0,
    totalReceita:  acc.receita,
  })).sort((a, b) => b.pctReceita - a.pctReceita)

  // ─── Monta resultado de divisões ──────────────────────────────────────────
  const divisions: HistoricalDivisionProfile[] = Array.from(divAcc.entries()).map(([division, acc]) => ({
    division,
    label:         acc.label,
    pctReceita:    Math.round((acc.receita / totalReceita) * 1000) / 10,
    pctPecas:      totalPecas > 0 ? Math.round((acc.pecas / totalPecas) * 1000) / 10 : 0,
    avgPmv:        acc.wTotal > 0 ? Math.round(acc.sumPmvW    / acc.wTotal) : 0,
    avgCost:       acc.wTotal > 0 ? Math.round(acc.sumCostW   / acc.wTotal) : 0,
    avgMargin:     acc.wTotal > 0 ? Math.round((acc.sumMarginW / acc.wTotal) * 10) / 10 : 0,
    totalReceita:  acc.receita,
  })).sort((a, b) => b.pctReceita - a.pctReceita)

  return { channels, divisions, totalReceita, totalPecas, hasData: true }
}

// ─── Helpers para inicialização de módulos ────────────────────────────────────

/**
 * Retorna proporções de canal M2 normalizadas para somar 100%.
 * Se não houver histórico, retorna proporções iguais entre os canais fornecidos.
 */
export function normalizeChannelPcts(
  channels: HistoricalChannelProfile[],
  validM2: ('atacado' | 'varejo' | 'ecommerce')[],
): Record<string, number> {
  const filtered = channels.filter(c => validM2.includes(c.canalId as any))
  if (!filtered.length) {
    const each = Math.round(100 / validM2.length)
    return Object.fromEntries(validM2.map((c, i) => [c, i === validM2.length - 1 ? 100 - each * (validM2.length - 1) : each]))
  }
  const total = filtered.reduce((s, c) => s + c.pctReceita, 0)
  const result: Record<string, number> = {}
  filtered.forEach((c, i) => {
    result[c.canalId] = i < filtered.length - 1
      ? Math.round((c.pctReceita / total) * 100)
      : 100 - filtered.slice(0, -1).reduce((s, fc) => s + Math.round((fc.pctReceita / total) * 100), 0)
  })
  return result
}

/**
 * Retorna proporções de divisão normalizadas para somar 100%.
 * Se não houver histórico para uma divisão esperada, distribui o restante igualmente.
 */
export function normalizeDivisionPcts(
  divisions: HistoricalDivisionProfile[],
  validDivisions: string[],
): Record<string, number> {
  const filtered = divisions.filter(d => validDivisions.includes(d.division))
  if (!filtered.length) {
    const each = Math.round(100 / validDivisions.length)
    return Object.fromEntries(validDivisions.map((d, i) => [d, i === validDivisions.length - 1 ? 100 - each * (validDivisions.length - 1) : each]))
  }
  const total = filtered.reduce((s, d) => s + d.pctReceita, 0)
  // Divisões sem histórico recebem 0 (excluídas do plano até terem dados)
  const result: Record<string, number> = Object.fromEntries(validDivisions.map(d => [d, 0]))
  filtered.forEach((d, i) => {
    result[d.division] = i < filtered.length - 1
      ? Math.round((d.pctReceita / total) * 100)
      : 100 - filtered.slice(0, -1).reduce((s, fd) => s + Math.round((fd.pctReceita / total) * 100), 0)
  })
  return result
}

// ─── Sazonalidade mensal por canal ────────────────────────────────────────────
// Mesmo espírito de divisionSeasonalityService.getDivisionSeasonality, mas por
// canal M2 em vez de divisão — usado pela Sazonalidade (M3) para sugerir uma
// curva mensal inicial em vez de abrir tudo zerado (o usuário só ajusta a
// partir daí, não digita a temporada inteira do zero).

const MONTHS_FULL_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** Para cada canal M2: % da receita anual histórica caída em cada mês (0–100, soma 100). */
export async function getChannelSeasonality(
  tenantId: string,
): Promise<Record<string, Record<string, number>>> {
  if (!tenantId) return {}

  const rows = await getSalesMonthlyAggregates(tenantId)
  if (!rows.length) return {}

  const acc = new Map<string, Map<string, number>>() // canalId → month → receita
  const totals = new Map<string, number>()

  for (const row of rows) {
    const canalId = canalToM2Group(matchChannelToCanal(row.channel))
    if (!canalId) continue
    if (row.saleMonth < 1 || row.saleMonth > 12) continue
    const month = MONTHS_FULL_PT[row.saleMonth - 1]

    if (!acc.has(canalId)) acc.set(canalId, new Map())
    const monthMap = acc.get(canalId)!
    monthMap.set(month, (monthMap.get(month) ?? 0) + row.revenueNet)
    totals.set(canalId, (totals.get(canalId) ?? 0) + row.revenueNet)
  }

  const result: Record<string, Record<string, number>> = {}
  for (const [canalId, monthMap] of acc.entries()) {
    const total = totals.get(canalId) ?? 0
    if (total <= 0) continue
    const pcts: Record<string, number> = {}
    for (const month of MONTHS_FULL_PT) {
      const rev = monthMap.get(month) ?? 0
      pcts[month] = total > 0 ? Math.round((rev / total) * 1000) / 10 : 0
    }
    result[canalId] = pcts
  }
  return result
}
