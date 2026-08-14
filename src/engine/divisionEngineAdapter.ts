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

// ─── Cluster Giro × Cobertura × Estoque Médio (Bloco 4 — Volume/Orçamento) ────
// Diferente do T3 (Custo > Margem > MKD, hierarquia fixa), este cluster não tem
// prioridade fixa: as 3 pontas são equivalentes, e a última editada vira o
// driver — as outras duas se ajustam. Nunca dá pra editar duas pontas ao mesmo
// tempo, porque Giro e Cobertura são reciprocamente definidos pelo mesmo par
// (Vendas Esperadas, dias da temporada), e Estoque Médio decorre de qualquer
// um dos dois.
//
//   Giro (vezes na temporada)     = diasDaTemporada / Cobertura
//   Cobertura (dias)              = diasDaTemporada / Giro
//   Estoque Médio (peças)         = Vendas Esperadas / Giro
//
// Estoque Inicial é fato real (protegido, nunca recalculado por este cluster).
// Reposições absorve pra fechar a conta de estoque médio clássica:
//   Estoque Médio ≈ Estoque Inicial + (Reposições − Vendas Esperadas) / 2
//   → Reposições = 2 × (Estoque Médio − Estoque Inicial) + Vendas Esperadas

export interface VolumeClusterInputs {
  vendasEsperadas: number  // peças — âncora do cluster
  estoqueInicial:  number  // peças — protegido, fato real
  diasDaTemporada: number
}

export interface VolumeClusterResult {
  giro:           number
  coverage:       number
  estoqueMedio:   number
  replenishments: number
}

export function applyVolumeCoverageEdit(
  editedField: 'giro' | 'coverage' | 'estoqueMedio',
  editedValue: number,
  inputs: VolumeClusterInputs,
): VolumeClusterResult {
  const { vendasEsperadas, estoqueInicial, diasDaTemporada } = inputs
  let giro = 0, coverage = 0, estoqueMedio = 0

  if (editedField === 'giro') {
    giro         = Math.max(0.01, editedValue)
    coverage     = diasDaTemporada / giro
    estoqueMedio = vendasEsperadas / giro
  } else if (editedField === 'coverage') {
    coverage     = Math.max(0, editedValue)
    giro         = coverage > 0 ? diasDaTemporada / coverage : 0
    estoqueMedio = diasDaTemporada > 0 ? (vendasEsperadas * coverage) / diasDaTemporada : 0
  } else {
    estoqueMedio = Math.max(0, editedValue)
    giro         = estoqueMedio > 0 ? vendasEsperadas / estoqueMedio : 0
    coverage     = giro > 0 ? diasDaTemporada / giro : 0
  }

  const replenishments = Math.max(0, 2 * (estoqueMedio - estoqueInicial) + vendasEsperadas)

  return { giro, coverage, estoqueMedio, replenishments }
}

/**
 * Recalcula Estoque Médio + Reposições quando Vendas Esperadas ou Estoque
 * Inicial mudam — mantém a Cobertura atual como referência (é a ponta mais
 * "assentada" do cluster), já que essas duas edições não fazem parte do
 * round-robin do cluster, mas ainda precisam refletir nele.
 */
export function recalcVolumeClusterFromAnchor(
  currentCoverage: number,
  inputs: VolumeClusterInputs,
): VolumeClusterResult {
  return applyVolumeCoverageEdit('coverage', currentCoverage, inputs)
}
