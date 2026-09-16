// ─── cascadePropagation.ts ─────────────────────────────────────────────────
// Motor único e puro de propagação de delta em cascata — extraído do efeito
// "Propagação delta" que existia só dentro de useModule3.ts (fronteira
// M1/M3 → M4), pra virar reaproveitável em qualquer fronteira do fluxo
// (M4→M5, M4→M6, dentro do M6) sem duplicar a lógica em cada tela.
// Ver src/engine/HISTORICAL_CASCADE_ARCHITECTURE.md, Mecânica 2.
//
// Prova matemática (a mesma que já estava no comentário original): se o
// consolidado de um grupo é a média ponderada dos filhos pelo peso
// histórico de cada um —
//   consolidado = Σ(peso_i × valor_i) / Σpeso_i
// — e TODOS os filhos são escalados pelo MESMO fator k, o novo consolidado
// é exatamente k × consolidado_antigo, qualquer que seja o peso de cada
// filho. Por isso escalar cada filho pelo mesmo k reproduz o valor editado
// no pai sem precisar resolver um sistema — é direto, não uma aproximação.
//
// Este módulo é agnóstico de como cada tela guarda seus indicadores por nó
// (Record<F, number> genérico) — quem chama passa getValues/setValues pra
// traduzir de/para a forma real do seu estado (ex.: DivisionPlanBlock.indicators).
// ─────────────────────────────────────────────────────────────────────────────

export interface DeltaDetectionOptions {
  /** Variação mínima (fração) pra considerar que o valor de fato mudou. Default 0.001 (0,1%). */
  epsilon?: number
}

/**
 * Compara um valor anterior e o atual e retorna o fator de escala
 * k = atual/anterior quando a mudança supera o epsilon — ou null quando não
 * houve mudança relevante, ou quando um dos dois é <= 0 (razão mal definida,
 * ex.: indicador ainda não seedado).
 */
export function detectDelta(
  previous: number,
  current: number,
  options: DeltaDetectionOptions = {},
): number | null {
  const epsilon = options.epsilon ?? 0.001
  if (previous <= 0 || current <= 0) return null
  const ratio = current / previous
  if (Math.abs(ratio - 1) <= epsilon) return null
  return ratio
}

/**
 * Versão em lote de detectDelta — detecta os deltas de um conjunto de
 * campos entre um snapshot anterior e o atual do NÓ PAI, pra chamar uma vez
 * por edição em vez de campo a campo.
 */
export function detectDeltas<F extends string>(
  previous: Record<F, number>,
  current: Record<F, number>,
  fields: readonly F[],
  options: DeltaDetectionOptions = {},
): Partial<Record<F, number>> {
  const deltas: Partial<Record<F, number>> = {}
  for (const field of fields) {
    const k = detectDelta(previous[field], current[field], options)
    if (k !== null) deltas[field] = k
  }
  return deltas
}

/**
 * Aplica os deltas detectados a UM filho — escala cada campo presente em
 * `deltas` pelo fator correspondente; campos sem delta ficam como estavam
 * (regra "último toque = gatilho": um campo não tocado no pai não se move).
 */
export function scaleChildByDeltas<F extends string>(
  childValues: Record<F, number>,
  deltas: Partial<Record<F, number>>,
): Record<F, number> {
  const next = { ...childValues }
  for (const field of Object.keys(deltas) as F[]) {
    const k = deltas[field]
    if (k !== undefined) next[field] = childValues[field] * k
  }
  return next
}

/**
 * Aplica os deltas a TODOS os filhos de um grupo — a função de mais alto
 * nível que qualquer fronteira do fluxo deveria chamar quando o nó pai é
 * reeditado. Retorna o mesmo objeto `children` (sem cópia) quando não há
 * delta nenhum a aplicar, pra não forçar re-render/recalculo à toa.
 */
export function propagateDeltaToChildren<Node, F extends string>(
  children: Record<string, Node>,
  deltas: Partial<Record<F, number>>,
  getValues: (node: Node) => Record<F, number>,
  setValues: (node: Node, next: Record<F, number>) => Node,
): Record<string, Node> {
  if (Object.keys(deltas).length === 0) return children
  const next: Record<string, Node> = {}
  for (const key of Object.keys(children)) {
    const node = children[key]
    next[key] = setValues(node, scaleChildByDeltas(getValues(node), deltas))
  }
  return next
}
