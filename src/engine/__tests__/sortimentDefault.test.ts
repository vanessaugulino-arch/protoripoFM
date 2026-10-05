import { describe, it, expect } from 'vitest'
import { ajustarPiramideAoPmv, buildDivisionsFromM3 } from '../sortimentDefaultScenario'
import { initializeDivisions } from '../../hooks/useModule3'

const pmvPonderado = (d: { avgPriceP1: number; avgPriceP2: number; avgPriceP3: number; pricePyramid: { p1: number; p2: number; p3: number } }) =>
  (d.avgPriceP1 * d.pricePyramid.p1 + d.avgPriceP2 * d.pricePyramid.p2 + d.avgPriceP3 * d.pricePyramid.p3) / 100

describe('pirâmide de preço (M4 → M6)', () => {
  it('ajusta as três faixas para a média bater com o PMV', () => {
    const [a, b, c] = ajustarPiramideAoPmv([144, 219, 329], [30, 50, 20], 155)
    expect(Math.abs((a * 30 + b * 50 + c * 20) / 100 - 155)).toBeLessThan(1)
    expect(a).toBeLessThan(b); expect(b).toBeLessThan(c)
  })

  it('sem PMV, mantém os preços', () => {
    expect(ajustarPiramideAoPmv([100, 200, 300], [30, 50, 20], 0)).toEqual([100, 200, 300])
  })

  it('divisão nova do M4 já nasce com pirâmide coerente com o PMV do M1', () => {
    const divs = initializeDivisions(['feminino', 'acessorios'],
      { seasonId: 'i', revenue: 1_187_500, margin: 42.3, sellThrough: 75, gmroi: 2.92, pmv: 155, mkd: 5 })
    const row = { divisions: divs, consolidated: { totalRevenue: 1_187_500 } } as never
    const [f] = buildDivisionsFromM3(row, 1_187_500)
    expect(Math.abs(pmvPonderado(f) - 155)).toBeLessThan(1)
  })

  it('receita da divisão no M6 = receita da temporada × participação', () => {
    const divs = initializeDivisions(['feminino', 'acessorios'],
      { seasonId: 'i', revenue: 1_187_500, margin: 42.3, sellThrough: 75, gmroi: 2.92, pmv: 155, mkd: 5 })
    const out = buildDivisionsFromM3({ divisions: divs } as never, 1_187_500)
    expect(out.map(d => d.revenueTarget)).toEqual([593_750, 593_750])
  })
})
