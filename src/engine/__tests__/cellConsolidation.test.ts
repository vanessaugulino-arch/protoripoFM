import { describe, it, expect } from 'vitest'
import { consolidateCells, groupConsolidate, addCells, emptyCell, type MacroCell } from '../cellConsolidation'

const cell = (o: Partial<MacroCell>): MacroCell => ({ ...emptyCell(), ...o })

describe('consolidateCells — primazia dos absolutos', () => {
  it('sem células retorna null', () => {
    expect(consolidateCells([])).toBeNull()
  })

  it('PMV do agregado é Σreceita ÷ Σpeças, não média dos PMVs', () => {
    // canal A: 100 peças a R$ 100 = PMV 100; canal B: 900 peças a R$ 50 = PMV 50
    // média simples daria 75; o certo é 55.000 ÷ 1.000 = 55
    const m = consolidateCells([
      cell({ receita: 10_000, pecas: 100 }),
      cell({ receita: 45_000, pecas: 900 }),
    ])!
    expect(m.pmv).toBe(55)
  })

  it('margem, giro, GMROI, markdown e cobertura derivam dos totais', () => {
    const m = consolidateCells([
      cell({ receita: 60_000, pecas: 600, lucroBruto: 30_000, estoqueMedioRS: 20_000, markdownRS: 3_000, orcamento: 25_000 }),
      cell({ receita: 40_000, pecas: 400, lucroBruto: 10_000, estoqueMedioRS: 30_000, markdownRS: 2_000, orcamento: 15_000 }),
    ])!
    expect(m).toMatchObject({
      receitaBruta: 100_000,
      pecasVendidas: 1_000,
      pmv: 100,
      margemBruta: 40,                       // 40.000 ÷ 100.000
      custoMedio: 55,                        // (100.000 − 40.000 − 5.000) ÷ 1.000
      estoqueMediao: 50_000,
      giro: 2,                               // 100.000 ÷ 50.000
      cobertura: 183,                        // 50.000 ÷ 100.000 × 365 = 182,5
      gmroi: 0.8,                            // 40.000 ÷ 50.000
      mkdRS: 5_000,
      mkdPct: 5,
      orcamento: 40_000,
    })
  })

  it('divisões por zero viram 0, nunca NaN/Infinity', () => {
    const m = consolidateCells([cell({ orcamento: 1_000 })])!
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true)
    expect(m).toMatchObject({ pmv: 0, margemBruta: 0, custoMedio: 0, giro: 0, cobertura: 0, gmroi: 0, mkdPct: 0, orcamento: 1_000 })
  })

  it('consolidar em partes e depois juntar dá o mesmo que consolidar tudo', () => {
    const cells = Array.from({ length: 12 }, (_, i) =>
      cell({ receita: 1_000 * (i + 1), pecas: 10 * (i + 1) + 3, lucroBruto: 400 * (i + 1), estoqueMedioRS: 2_500, markdownRS: 37 * i, month: i + 1 }),
    )
    const semestre1 = cells.slice(0, 6).reduce(addCells, emptyCell())
    const semestre2 = cells.slice(6).reduce(addCells, emptyCell())
    expect(consolidateCells([semestre1, semestre2])).toEqual(consolidateCells(cells))
  })
})

describe('groupConsolidate', () => {
  it('agrupa por chave e consolida cada grupo separadamente', () => {
    const out = groupConsolidate(
      [
        cell({ receita: 100, pecas: 1, fiscalYear: 2025 }),
        cell({ receita: 300, pecas: 2, fiscalYear: 2026 }),
        cell({ receita: 100, pecas: 2, fiscalYear: 2026 }),
      ],
      c => c.fiscalYear!,
    )
    expect(Object.keys(out).sort()).toEqual(['2025', '2026'])
    expect(out['2025'].pmv).toBe(100)
    expect(out['2026'].pmv).toBe(100)   // 400 ÷ 4
  })
})
