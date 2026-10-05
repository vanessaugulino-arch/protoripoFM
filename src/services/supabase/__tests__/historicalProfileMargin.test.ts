// Margem de canal e divisão: venda sem custo de produto não pode contar como
// margem zero (bug até 05/10/2026: dividia pela receita total).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

import { getHistoricalProfiles } from '../historicalProfileService'

// Um mês de e-commerce feminino: R$ 1.000 de receita, só R$ 400 com custo
// conhecido, a 50% de margem → margin_weighted_sum = 50 × 400 = 20.000.
const linha = (over: Record<string, unknown> = {}) => ({
  channel: 'E-commerce', division: 'Feminino', sale_year: 2025, sale_month: 3,
  revenue_net: 1000, quantity: 10, price_realized_sum: 1000, price_realized_count: 10,
  pmv_weighted_sum: 100_000, cost_weighted_sum: 20_000, margin_weighted_sum: 20_000,
  discount_sum: 50, price_sale_qty_sum: 1100, receipt_count: 8, revenue_net_matched: 400,
  ...over,
})

beforeEach(() => rpc.mockReset())

describe('getHistoricalProfiles — margem', () => {
  it('divide pela receita com custo: 50%, não 20%', async () => {
    rpc.mockResolvedValue({ data: [linha()], error: null })
    const p = await getHistoricalProfiles('t1', 2025)
    expect(p.channels[0].avgMargin).toBe(50)
    expect(p.divisions[0].avgMargin).toBe(50)
    expect(p.channels[0].avgCost).toBe(50)   // 20.000 ÷ 400, não ÷ 1.000
  })

  it('banco antigo sem revenue_net_matched mantém a conta anterior', async () => {
    rpc.mockResolvedValue({ data: [linha({ revenue_net_matched: undefined })], error: null })
    const p = await getHistoricalProfiles('t1', 2025)
    expect(p.channels[0].avgMargin).toBe(20)
  })

  it('sem nenhuma venda com custo, margem 0 (sem dado), não divide por zero', async () => {
    rpc.mockResolvedValue({ data: [linha({ revenue_net_matched: 0, margin_weighted_sum: 0 })], error: null })
    const p = await getHistoricalProfiles('t1', 2025)
    expect(p.channels[0].avgMargin).toBe(0)
    expect(Number.isFinite(p.channels[0].avgCost)).toBe(true)
  })
})
