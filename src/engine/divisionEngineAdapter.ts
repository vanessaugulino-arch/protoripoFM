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

/**
 * Indicadores comerciais que o motor conhece — usado tanto pela divisão (M3)
 * quanto pelo canal (M2). custoMedio é opcional porque o M3 não expõe esse
 * campo na tela (é derivado internamente); quando ausente, o motor deriva o
 * custo a partir de margem/mkd/pmv, preservando o comportamento do M3.
 */
export interface DivisionIndicators {
  avgPrice:    number  // PMV
  margin:      number  // %
  mkd:         number  // %
  gmroi:       number
  sellThrough: number  // % — fora dos clusters
  revenue?:    number
  custoMedio?: number  // R$ — quando presente (M2), é a fonte de verdade; senão é derivado
}

/** Campo → campo do motor. Sell-Through não tem correspondente. */
const FIELD_MAP: Record<string, FieldKey | undefined> = {
  avgPrice:    'pmv',
  margin:      'margemBruta',
  mkd:         'mkdPct',
  gmroi:       'gmroi',
  sellThrough: undefined,
  custoMedio:  'custoMedio',
}

/** Expõe o mapeamento campo M3 → campo do motor pro chamador acumular `touched`. */
export function mapToEngineField(field: keyof DivisionIndicators): FieldKey | undefined {
  return FIELD_MAP[field as string]
}

/**
 * Aplica a edição de um indicador de divisão pelo motor de clusters.
 *
 * @param current     indicadores atuais da divisão
 * @param revenue     receita da divisão em R$ (receita_macro × participação, ou indicators.revenue)
 * @param editedField campo editado ('avgPrice' | 'margin' | 'mkd' | 'gmroi' | 'sellThrough')
 * @param editedValue novo valor
 * @param touchedSoFar campos do motor já tocados pelo usuário nesta divisão,
 *   antes desta edição (persistido pelo chamador entre chamadas) — sem isso,
 *   a regra "MKD só trava depois de 2 alavancas tocadas" não tem memória e
 *   trava (ou nunca trava) incorretamente a cada edição isolada.
 * @returns indicadores atualizados após a absorção dos clusters
 */
export function applyDivisionEdit(
  current: DivisionIndicators,
  revenue: number,
  editedField: keyof DivisionIndicators,
  editedValue: number,
  touchedSoFar?: Set<FieldKey>,
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
  // M2 tem custoMedio real (fonte de verdade); M3 não expõe o campo — deriva.
  const custo = current.custoMedio ?? (pecas > 0 ? Math.max(0, (rev - lucro - mkdRS) / pecas) : 0)
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
  const touched = new Set<FieldKey>(touchedSoFar)
  touched.add(engineField)
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
    // custoMedio só é devolvido quando a entrada já o tinha (M2) — no M3,
    // onde o campo é derivado internamente, current.custoMedio é undefined
    // e o resultado também fica undefined (comportamento inalterado do M3).
    custoMedio:  current.custoMedio !== undefined ? (v.custoMedio ?? current.custoMedio) : undefined,
    // sellThrough e revenue inalterados por edições que passam pelo motor
  }
}

// ─── Cluster Giro × Estoque Médio (Bloco 4 — Volume/Orçamento) ────────────────
// 2026-09-08: Cobertura SAIU deste cluster (decisão da usuária) — virou
// Forward Coverage, indicador real e independente (estoque inicial ÷ vendas
// em janela fixa de 90 dias, via inventory_snapshots/sales_history), sem
// relação algébrica com Giro. Ver HISTORICAL_CASCADE_ARCHITECTURE.md.
//
// Com só 2 pontas (Giro, Estoque Médio) e 1 equação, não há mais hierarquia
// nem round-robin de 3 vias: a última editada vira o driver, a outra deriva.
//
//   Giro (vezes na temporada)     = Vendas Esperadas / Estoque Médio
//   Estoque Médio (peças)         = Vendas Esperadas / Giro
//
// Estoque Inicial é fato real (protegido, nunca recalculado por este cluster).
// Reposições absorve pra fechar a conta de estoque médio clássica:
//   Estoque Médio ≈ Estoque Inicial + (Reposições − Vendas Esperadas) / 2
//   → Reposições = 2 × (Estoque Médio − Estoque Inicial) + Vendas Esperadas

export interface VolumeClusterInputs {
  vendasEsperadas: number  // peças — âncora do cluster
  estoqueInicial:  number  // peças — protegido, fato real
  diasDaTemporada: number  // não usado neste cluster (era só p/ Cobertura) — mantido no tipo para não quebrar chamadores existentes
}

export interface VolumeClusterResult {
  giro:           number
  estoqueMedio:   number
  replenishments: number
}

export function applyVolumeEdit(
  editedField: 'giro' | 'estoqueMedio',
  editedValue: number,
  inputs: VolumeClusterInputs,
): VolumeClusterResult {
  const { vendasEsperadas, estoqueInicial } = inputs
  let giro = 0, estoqueMedio = 0

  if (editedField === 'giro') {
    giro         = Math.max(0.01, editedValue)
    estoqueMedio = vendasEsperadas / giro
  } else {
    estoqueMedio = Math.max(0, editedValue)
    giro         = estoqueMedio > 0 ? vendasEsperadas / estoqueMedio : 0
  }

  const replenishments = Math.max(0, 2 * (estoqueMedio - estoqueInicial) + vendasEsperadas)

  return { giro, estoqueMedio, replenishments }
}

/**
 * Recalcula Giro + Reposições quando Vendas Esperadas ou Estoque Inicial
 * mudam — mantém o Estoque Médio atual como referência (é a ponta mais
 * "assentada" do cluster agora que só restam duas), já que essas duas
 * edições não fazem parte do round-robin do cluster, mas ainda precisam
 * refletir nele.
 */
export function recalcVolumeClusterFromAnchor(
  currentEstoqueMedio: number,
  inputs: VolumeClusterInputs,
): VolumeClusterResult {
  return applyVolumeEdit('estoqueMedio', currentEstoqueMedio, inputs)
}
