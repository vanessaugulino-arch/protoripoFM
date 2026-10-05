import { describe, it, expect } from 'vitest'
import { historicalYearFromSummary, notaEstimado, PADROES_SEM_DADO } from '../historicalYear'

const base = {
  year: '2025', receita: 1_000_000, producao: 8_000, pmv: 125, markdown: 50_000,
  ticket_medio: 310, estoque_medio_pecas: 2_000,
}

describe('historicalYearFromSummary', () => {
  it('ano completo: tudo real, nada estimado', () => {
    const a = historicalYearFromSummary({
      ...base, margem_bruta: 55, receita_com_custo_pct: 92,
      estoque_medio_custo: 110_000, estoque_medio_venda: 250_000,
    })
    expect(a.estimados).toEqual([])
    expect(a.margemBruta).toBe(55)
    expect(a.orcamento).toBe(450_000)        // custo do vendido = 1.000.000 × 45%
    expect(a.estoqueMedioRS).toBe(250_000)   // a preço de venda, mesma base da receita
    expect(a.giro).toBe(4)                   // 1.000.000 ÷ 250.000
    expect(a.cobertura).toBe(91)             // 365 ÷ 4
    expect(a.gmroi).toBe(5)                  // lucro 550.000 ÷ estoque a custo 110.000
    expect(a.receitaComCustoPct).toBe(92)
  })

  it('margem nunca é 40% fixos quando o banco traz a real', () => {
    const a = historicalYearFromSummary({ ...base, margem_bruta: 61.3 })
    expect(a.margemBruta).toBe(61.3)
    expect(a.estimados).not.toContain('margemBruta')
  })

  it('sem custo de produto: margem e orçamento estimados e avisados', () => {
    const a = historicalYearFromSummary({ ...base, margem_bruta: null, estoque_medio_custo: 110_000 })
    expect(a.margemBruta).toBe(PADROES_SEM_DADO.margemBruta)
    expect(a.estimados).toEqual(expect.arrayContaining(['margemBruta', 'orcamento', 'gmroi']))
    expect(notaEstimado(a, 'margemBruta')).toMatch(/custo cadastrado/)
  })

  it('banco antigo (sem as colunas novas) continua funcionando, tudo que falta marcado', () => {
    const a = historicalYearFromSummary(base)
    expect(a.estoqueMedioRS).toBe(250_000)   // peças × PMV, como antes
    expect(a.giro).toBe(4)
    expect(a.estimados).toEqual(expect.arrayContaining(['margemBruta', 'orcamento', 'gmroi']))
    expect(a.estimados).not.toContain('giro')
    expect(a.receitaComCustoPct).toBeNull()
  })

  it('sem estoque: giro e cobertura estimados, não apresentados como reais', () => {
    const a = historicalYearFromSummary({ ...base, estoque_medio_pecas: 0, margem_bruta: 50 })
    expect(a.giro).toBe(PADROES_SEM_DADO.giro)
    expect(a.cobertura).toBe(PADROES_SEM_DADO.cobertura)
    expect(a.estimados).toEqual(expect.arrayContaining(['estoqueMedioRS', 'giro', 'cobertura']))
  })

  it('sem cupom: ticket marcado como sem dado', () => {
    const a = historicalYearFromSummary({ ...base, ticket_medio: 0 })
    expect(a.estimados).toContain('ticketMedio')
    expect(notaEstimado(a, 'ticketMedio')).toMatch(/cupom/)
  })

  it('aceita números como texto (o PostgREST devolve numeric como string)', () => {
    const a = historicalYearFromSummary({
      year: 2026, receita: '600.00', producao: '10', pmv: '60.00', markdown: '0', ticket_medio: '0',
      estoque_medio_pecas: '0', margem_bruta: '48.50', receita_com_custo_pct: '100.0',
      estoque_medio_custo: null, estoque_medio_venda: null,
    })
    expect(a.year).toBe('2026')
    expect(a.receita).toBe(600)
    expect(a.margemBruta).toBe(48.5)
  })
})
