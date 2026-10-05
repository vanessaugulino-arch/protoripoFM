// ─── divisionVolumes.ts ───────────────────────────────────────────────────────
// Mantém as peças de cada divisão (M4) coerentes com a receita da temporada.
//
// Bug corrigido (05/10/2026): ao trocar de temporada, as divisões eram
// montadas com a receita do momento, mas a receita certa (curva do M3) chega
// depois, de forma assíncrona. Quando só a receita mudava, o hook recalculava
// o consolidado e deixava as peças antigas: Inverno (5 meses) ficava com as
// vendas esperadas do Verão (7 meses) e o M5 recebia 40% a mais de peças.
//
// Regra: vendas esperadas = receita da divisão ÷ PMV. Volume de produção,
// reposições e estoque médio acompanham na mesma proporção. Estoque inicial
// é fato (posição real de estoque) e não muda — a não ser que ainda seja a
// estimativa automática de initializeDivisions (5/6 das vendas esperadas),
// que então acompanha também.
// ─────────────────────────────────────────────────────────────────────────────

import type { DivisionPlanBlock } from '../app/types/module3'

export function alinharVolumesAReceita<K extends string>(
  divisions: Record<K, DivisionPlanBlock>,
  receitaTemporada: number,
): Record<K, DivisionPlanBlock> {
  if (!(receitaTemporada > 0)) return divisions
  const out = { ...divisions }
  for (const id of Object.keys(divisions) as K[]) {
    const d = divisions[id]
    const pmv = d.indicators.avgPrice
    if (!(pmv > 0)) continue
    const vc = d.volumeCoverage
    const novas = Math.round((receitaTemporada * (d.participation / 100)) / pmv)
    const antigas = vc.unitsExpectedSold
    if (novas === antigas) continue
    const k = antigas > 0 ? novas / antigas : 1
    out[id] = {
      ...d,
      volumeCoverage: {
        ...vc,
        unitsExpectedSold: novas,
        initialStock:     vc.initialStock === Math.round(antigas * (5 / 6)) ? Math.round(novas * (5 / 6)) : vc.initialStock,
        productionVolume: vc.productionVolume != null ? Math.round(vc.productionVolume * k) : novas,
        replenishments:   Math.round(vc.replenishments * k),
        estoqueMedio:     vc.giro && vc.giro > 0 ? novas / vc.giro : vc.estoqueMedio,
      },
    }
  }
  return out
}
