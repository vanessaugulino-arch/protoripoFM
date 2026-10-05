import { describe, it, expect } from 'vitest'
import { alinharVolumesAReceita } from '../divisionVolumes'
import { initializeDivisions } from '../../hooks/useModule3'

// Receita anual 2,85 mi, PMV 155, duas divisões a 50%.
const anual = 2_850_000
const verao = { seasonId: 'v', revenue: anual * 7 / 12, margin: 42.3, sellThrough: 75, gmroi: 2.92, pmv: 155, mkd: 5 }
const invernoReceita = anual * 5 / 12   // 1.187.500

describe('alinharVolumesAReceita (M4)', () => {
  it('divisões montadas com a receita do Verão passam a usar a do Inverno', () => {
    const divs = initializeDivisions(['feminino', 'acessorios'], verao)
    expect(divs.feminino.volumeCoverage.unitsExpectedSold).toBe(5363)   // o número que aparecia no M5
    const al = alinharVolumesAReceita(divs, invernoReceita)
    expect(al.feminino.volumeCoverage.unitsExpectedSold).toBe(3831)     // 593.750 ÷ 155
    expect(al.feminino.volumeCoverage.productionVolume).toBe(3831)
  })

  it('estoque inicial real (ou editado) não muda', () => {
    const divs = initializeDivisions(['feminino'], verao)
    divs.feminino.volumeCoverage.initialStock = 4000
    expect(alinharVolumesAReceita(divs, invernoReceita).feminino.volumeCoverage.initialStock).toBe(4000)
  })

  it('estoque inicial ainda estimado acompanha a receita', () => {
    const divs = initializeDivisions(['feminino', 'acessorios'], verao)
    expect(divs.feminino.volumeCoverage.initialStock).toBe(4469)
    expect(alinharVolumesAReceita(divs, invernoReceita).feminino.volumeCoverage.initialStock).toBe(3193)
  })

  it('volume editado à mão acompanha a proporção da receita', () => {
    const divs = initializeDivisions(['feminino'], verao)
    divs.feminino.volumeCoverage.productionVolume = 6000
    const al = alinharVolumesAReceita(divs, verao.revenue * 2)
    expect(al.feminino.volumeCoverage.productionVolume).toBe(12000)
  })

  it('receita igual ou zero não mexe em nada', () => {
    const divs = initializeDivisions(['feminino'], verao)
    expect(alinharVolumesAReceita(divs, verao.revenue)).toEqual(divs)
    expect(alinharVolumesAReceita(divs, 0)).toBe(divs)
  })
})
