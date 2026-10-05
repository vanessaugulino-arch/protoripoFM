import { describe, it, expect } from 'vitest'
import { buildChannel, applyRevenue, giroFromEdit } from '../channelDefaultScenario'

const rates = { margemBruta: 42.3, pmv: 155, ticketMedio: 320, custoMedio: 89.44, giro: 6.9, cobertura: 999, mkdPct: 5, gmroi: 3.23 }

// Σlucro ÷ Σestoque — a mesma conta do consolidado em ChannelPlanning.
const consolidadoGmroi = (chs: ReturnType<typeof buildChannel>[]) =>
  chs.reduce((s, c) => s + c.margemBrutaRS, 0) / chs.reduce((s, c) => s + c.estoqueMedioRS, 0)

describe('canal (M2): GMROI e cobertura saem do estoque e do lucro', () => {
  it('canal ignora o GMROI solto do M1 e calcula o próprio', () => {
    const c = buildChannel(1_000_000, rates)
    expect(c.gmroi).toBeCloseTo(0.423 * 6.9, 6)          // margem × giro = 2,92, não 3,23
    expect(c.cobertura).toBeCloseTo(365 / 6.9, 6)
  })

  it('canais iguais → consolidado igual a cada canal', () => {
    const chs = [buildChannel(940_500, rates), buildChannel(969_000, rates), buildChannel(940_500, rates)]
    for (const c of chs) expect(c.gmroi).toBeCloseTo(consolidadoGmroi(chs), 9)
  })

  it('estoque em peças converte pelo custo, como o M1', () => {
    const c = buildChannel(1_000_000, rates)
    expect(c.estoqueMedioPecas).toBeCloseTo(c.estoqueMedioRS / rates.custoMedio, 6)
  })

  it('editar o GMROI move o giro e o estoque, e o GMROI fica o digitado', () => {
    const c = buildChannel(1_000_000, rates)
    const novo = applyRevenue({ ...c, giro: giroFromEdit(c, 'gmroi', 4) }, c.receita)
    expect(novo.gmroi).toBeCloseTo(4, 9)
    expect(novo.estoqueMedioRS).toBeCloseTo(novo.margemBrutaRS / 4, 6)
  })

  it('editar a cobertura move o giro', () => {
    const c = buildChannel(1_000_000, rates)
    const novo = applyRevenue({ ...c, giro: giroFromEdit(c, 'cobertura', 73) }, c.receita)
    expect(novo.cobertura).toBeCloseTo(73, 9)
    expect(novo.giro).toBeCloseTo(5, 9)
  })

  it('mudar a receita mantém as taxas', () => {
    const c = buildChannel(1_000_000, rates)
    const d = applyRevenue(c, 2_000_000)
    expect(d.gmroi).toBeCloseTo(c.gmroi, 9)
    expect(d.estoqueMedioRS).toBeCloseTo(2 * c.estoqueMedioRS, 6)
  })
})
