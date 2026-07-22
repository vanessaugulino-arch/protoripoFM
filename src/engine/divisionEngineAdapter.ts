// ─── divisionEngineAdapter.ts ────────────────────────────────────────────────
// Adaptador que roda o motor de cálculo do M1 (planningEngine) sobre UMA divisão
// do M3. Faz a edição de um indicador seguir a absorção dos clusters:
//   • PMV        → T1 (peças/volume seguem)
//   • Margem/MKD → T3 (markdown corrói a margem)
//   • GMROI      → ponte T2 (Estoque Médio absorve; giro/cobertura seguem)
// Sell-Through fica fora dos clusters (é razão de performance, não indicador
// financeiro do motor) — editá-lo apenas grava o valor.
//
// Cada edição é tratada como "toque único fresco": monta o baseline a partir dos
// indicadores atuais da divisão, aplica o campo editado e lê o resultado.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildStateFromBaseline,
  recalculate,
  type FieldKey,
  type PlanningValues,
} from './planningEngine'

/** Indicadores comerciais da divisão que o motor conhece. */
export interface DivisionIndicators {
  avgPrice:    number  // PMV
  margin:      number  // %
  mkd:         number  // %
  gmroi:       number
  sellThrough: number  // % — fora dos clusters
  revenue?:    number
}

/** Campo do M3 → campo do motor. Sell-Through não tem correspondente. */
const FIELD_MAP: Record<string, FieldKey | undefined> = {
  avgPrice:    'pmv',
  margin:      'margemBruta',
  mkd:         'mkdPct',
  gmroi:       'gmroi',
  sellThrough: undefined,
}

/**
 * Aplica a edição de um indicador de divisão pelo motor de clusters.
 *
 * @param current     indicadores atuais da divisão
 * @param revenue     receita da divisão em R$ (receita_macro × participação, ou indicators.revenue)
 * @param editedField campo editado ('avgPrice' | 'margin' | 'mkd' | 'gmroi' | 'sellThrough')
 * @param editedValue novo valor
 * @returns indicadores atualizados após a absorção dos clusters
 */
export function applyDivisionEdit(
  current: DivisionIndicators,
  revenue: number,
  editedField: keyof DivisionIndicators,
  editedValue: number,
): DivisionIndicators {
  // Sell-Through (e revenue) não passam pelo motor — grava direto.
  const engineField = FIELD_MAP[editedField as string]
  if (!engineField) {
    return { ...current, [editedField]: editedValue }
  }

  const rev   = revenue > 0 ? revenue : (current.revenue ?? 0)
  const pmv   = current.avgPrice > 0 ? current.avgPrice : 1
  const pecas = rev > 0 && pmv > 0 ? rev / pmv : 0
  const lucro = rev * (current.margin / 100)
  const mkdRS = rev * (current.mkd / 100)
  const custo = pecas > 0 ? Math.max(0, (rev - lucro - mkdRS) / pecas) : 0
  const estoque = current.gmroi > 0 ? lucro / current.gmroi : 0

  // Baseline do motor a partir dos indicadores atuais da divisão.
  const baseline: Partial<PlanningValues> = {
    receitaBruta:  rev,
    devolucoes:    0,
    pmv:           current.avgPrice,
    pecasVendidas: pecas,
    margemBruta:   current.margin,
    mkdPct:        current.mkd,
    custoMedio:    custo,
    estoqueMediao: estoque,
    gmroi:         current.gmroi,
  }

  const base = buildStateFromBaseline(baseline)
  const touched = new Set<FieldKey>([engineField])
  const next = recalculate(
    { ...base, values: { ...base.values, [engineField]: editedValue }, touched },
  )
  const v = next.values

  return {
    ...current,
    avgPrice:    v.pmv         ?? current.avgPrice,
    margin:      v.margemBruta ?? current.margin,
    mkd:         v.mkdPct      ?? current.mkd,
    gmroi:       v.gmroi       ?? current.gmroi,
    // sellThrough e revenue inalterados por edições que passam pelo motor
  }
}
