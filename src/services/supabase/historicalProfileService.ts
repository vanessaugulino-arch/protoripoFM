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

// ─── Função principal ─────────────────────────────────────────────────────────

export async function getHistoricalProfiles(tenantId: string): Promise<HistoricalProfiles> {
  const empty: HistoricalProfiles = {
    channels: [], divisions: [], totalReceita: 0, totalPecas: 0, hasData: false,
  }
  if (!tenantId) return empty

  const db = supabase as any

  // 1. Lê sales_history (limita a 100k linhas para performance)
  const { data: salesRows, error: salesErr } = await db
    .from('sales_history')
    .select('channel, revenue_net, quantity, price_realized, sku')
    .eq('tenant_id', tenantId)
    .not('revenue_net', 'is', null)
    .gt('revenue_net', 0)
    .limit(100_000)

  if (salesErr || !salesRows?.length) return empty

  // 2. Lê produtos (division, price_tier, risk_level, price_cost, price_sale, sku)
  const { data: productRows } = await db
    .from('products')
    .select('sku, division, price_tier, risk_level, price_cost, price_sale')
    .eq('tenant_id', tenantId)
    .not('sku', 'is', null)

  // 3. Monta map sku → product
  const skuMap = new Map<string, {
    division: string; price_tier: string; risk_level: string;
    price_cost: number; price_sale: number;
  }>()
  for (const p of (productRows ?? [])) {
    if (p.sku) skuMap.set(String(p.sku), p)
  }

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

  for (const row of salesRows) {
    const receita = (row.revenue_net as number) ?? 0
    const pecas   = (row.quantity    as number) ?? 0
    const canal   = matchChannelToCanal(row.channel ?? '')
    const m2      = canalToM2Group(canal)
    const prod    = skuMap.get(String(row.sku ?? ''))

    totalReceita += receita
    totalPecas   += pecas

    // ── Canal M2 ──────────────────────────────────────────────────────────────
    if (m2) {
      const acc = canalAcc.get(m2) ?? { receita: 0, pecas: 0, sumPmvW: 0, sumCostW: 0, wTotal: 0 }
      const pmv      = row.price_realized ?? (prod?.price_sale ?? 0)
      const cost     = prod?.price_cost ?? 0
      acc.receita   += receita
      acc.pecas     += pecas
      acc.sumPmvW   += pmv  * receita
      acc.sumCostW  += cost * receita
      acc.wTotal    += receita
      canalAcc.set(m2, acc)
    }

    // ── Divisão ──────────────────────────────────────────────────────────────
    if (prod?.division) {
      const divId  = normalizeDivision(prod.division)
      const acc    = divAcc.get(divId) ?? {
        label: prod.division, receita: 0, pecas: 0,
        sumPmvW: 0, sumCostW: 0, sumMarginW: 0, wTotal: 0,
      }
      const pmv    = row.price_realized ?? (prod?.price_sale ?? 0)
      const cost   = prod?.price_cost ?? 0
      const margin = pmv > 0 ? ((pmv - cost) / pmv) * 100 : 0
      acc.receita    += receita
      acc.pecas      += pecas
      acc.sumPmvW    += pmv    * receita
      acc.sumCostW   += cost   * receita
      acc.sumMarginW += margin * receita
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
