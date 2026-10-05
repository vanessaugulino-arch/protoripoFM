import { describe, it, expect } from 'vitest'
import { mesesCobertos } from '../seasonRollup'

describe('mesesCobertos', () => {
  it('só o Inverno (mar–jul) cobre 5 meses: macro anual não pode vir das divisões', () => {
    expect(mesesCobertos([{ monthStart: 3, monthEnd: 7, seasonFiscalYear: 2027 }], 2027).size).toBe(5)
  })

  it('Verão do ano anterior (ago–fev) + Inverno + Verão do ano cobrem os 12 meses', () => {
    const s = mesesCobertos([
      { monthStart: 8, monthEnd: 2, seasonFiscalYear: 2026 },   // jan–fev de 2027
      { monthStart: 3, monthEnd: 7, seasonFiscalYear: 2027 },
      { monthStart: 8, monthEnd: 2, seasonFiscalYear: 2027 },   // ago–dez de 2027
    ], 2027)
    expect(s.size).toBe(12)
  })

  it('aceita nome do mês', () => {
    expect(mesesCobertos([{ monthStart: 'Março', monthEnd: 'Julho', seasonFiscalYear: 2027 }], 2027).size).toBe(5)
  })
})
