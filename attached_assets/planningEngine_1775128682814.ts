// src/engine/planningEngine.ts  — v2
// Regras:
// 1. Abre sempre com dados históricos como base
// 2. Só bloqueia quando o USUÁRIO edita 2 vértices de um triângulo
// 3. Unlock restaura o campo ao valor histórico (baseline)

export type FieldKey =
  | 'receitaBruta' | 'devolucoes' | 'receitaLiquida'
  | 'margemBruta' | 'pmv' | 'pecasVendidas'
  | 'estoqueMedio' | 'giro' | 'cobertura'
  | 'mkdPct' | 'mkdRS' | 'otb'
  | 'producaoPecas' | 'totalPecas' | 'gmroi' | 'custoMedio'

export type FieldState = 'free' | 'locked' | 'calculated'

export interface PlanningValues {
  receitaBruta:   number | null
  devolucoes:     number | null
  receitaLiquida: number | null
  margemBruta:    number | null
  pmv:            number | null
  pecasVendidas:  number | null
  estoqueMedio:   number | null
  giro:           number | null
  cobertura:      number | null
  mkdPct:         number | null
  mkdRS:          number | null
  otb:            number | null
  producaoPecas:  number | null
  totalPecas:     number | null
  gmroi:          number | null
  custoMedio:     number | null
}

export interface PlanningFieldStates {
  receitaBruta:   FieldState
  devolucoes:     FieldState
  receitaLiquida: FieldState
  margemBruta:    FieldState
  pmv:            FieldState
  pecasVendidas:  FieldState
  estoqueMedio:   FieldState
  giro:           FieldState
  cobertura:      FieldState
  mkdPct:         FieldState
  mkdRS:          FieldState
  otb:            FieldState
  producaoPecas:  FieldState
  totalPecas:     FieldState
  gmroi:          FieldState
  custoMedio:     FieldState
}

// Dados históricos que servem de ponto de partida e referência de unlock
export interface HistoricalBaseline {
  receitaBruta:  number
  margemBruta:   number
  pmv:           number
  giro:          number
  cobertura:     number
  otb:           number
  producaoPecas: number
  mkdPct:        number
  custoMedio:    number
  totalPecas:    number
  gmroi:         number
}

export interface PlanningState {
  values:   PlanningValues
  states:   PlanningFieldStates
  touched:  FieldKey[]      // apenas campos que o USUÁRIO alterou
  baseline: HistoricalBaseline
}

export const ALWAYS_CALCULATED: FieldKey[] = [
  'mkdRS', 'totalPecas', 'gmroi', 'receitaLiquida',
]

function known(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && !isNaN(v) && isFinite(v)
}

export function buildInitialStates(): PlanningFieldStates {
  return {
    receitaBruta: 'free', devolucoes: 'free', receitaLiquida: 'calculated',
    margemBruta: 'free', pmv: 'free', pecasVendidas: 'free',
    estoqueMedio: 'free', giro: 'free', cobertura: 'free',
    mkdPct: 'free', mkdRS: 'calculated', otb: 'free',
    producaoPecas: 'free', totalPecas: 'calculated',
    gmroi: 'calculated', custoMedio: 'free',
  }
}

// Constrói estado inicial populado com o histórico — sem nada bloqueado
export function buildStateFromHistorical(baseline: HistoricalBaseline): PlanningState {
  const devolucoes     = +(baseline.receitaBruta * 0.05).toFixed(2)
  const receitaLiquida = baseline.receitaBruta - devolucoes
  const mkdRS          = +(baseline.receitaBruta * (baseline.mkdPct / 100)).toFixed(2)
  const pecasVendidas  = baseline.pmv > 0 ? +(receitaLiquida / baseline.pmv).toFixed(0) : 0
  const estoqueMedio   = baseline.giro > 0 ? +(receitaLiquida / baseline.giro).toFixed(2) : null

  const values: PlanningValues = {
    receitaBruta:   baseline.receitaBruta,
    devolucoes,
    receitaLiquida,
    margemBruta:    baseline.margemBruta,
    pmv:            baseline.pmv,
    pecasVendidas,
    estoqueMedio,
    giro:           baseline.giro,
    cobertura:      baseline.cobertura,
    mkdPct:         baseline.mkdPct,
    mkdRS,
    otb:            baseline.otb,
    producaoPecas:  baseline.producaoPecas,
    totalPecas:     baseline.totalPecas,
    gmroi:          baseline.gmroi,
    custoMedio:     baseline.custoMedio,
  }

  return {
    values,
    states:  buildInitialStates(), // tudo free/calculated — nada locked
    touched: [],                   // usuário não tocou em nada ainda
    baseline,
  }
}

// ─────────────────────────────────────────────────────────────
// RECALCULATE
// Só bloqueia quando o USUÁRIO tocou em 2 vértices do triângulo
// ─────────────────────────────────────────────────────────────
export function recalculate(state: PlanningState): PlanningState {
  const v  = { ...state.values }
  const s  = { ...state.states }
  const t  = state.touched
  const ue = (f: FieldKey) => t.includes(f)

  // 1. Receita Líquida
  if (known(v.receitaBruta)) {
    v.receitaLiquida = v.receitaBruta - (known(v.devolucoes) ? v.devolucoes : 0)
    s.receitaLiquida = 'calculated'
  }
  const rl = v.receitaLiquida

  // 2. PMV / Peças
  if (ue('pmv') && ue('pecasVendidas')) {
    s.pmv = 'locked'
  } else if (ue('pmv') && known(rl) && known(v.pmv) && v.pmv > 0) {
    v.pecasVendidas = +(rl / v.pmv).toFixed(0)
    s.pecasVendidas = 'calculated'
  } else if (ue('pecasVendidas') && known(rl) && known(v.pecasVendidas) && v.pecasVendidas > 0) {
    v.pmv = +(rl / v.pecasVendidas).toFixed(2)
    s.pmv = 'calculated'
    s.pecasVendidas = 'locked'
  } else if (known(rl) && known(v.pmv) && v.pmv > 0 && !ue('pecasVendidas')) {
    // histórico → deriva silenciosamente sem bloquear
    v.pecasVendidas = +(rl / v.pmv).toFixed(0)
    s.pecasVendidas = 'calculated'
  }

  // 3. Giro / Estoque Médio / Cobertura
  const nTouched = [ue('giro'), ue('estoqueMedio'), ue('cobertura')].filter(Boolean).length

  if (nTouched >= 2) {
    if (ue('giro') && ue('estoqueMedio') && known(v.giro) && known(v.estoqueMedio) && known(rl) && rl > 0) {
      v.cobertura = +((v.estoqueMedio / rl) * 365).toFixed(1)
      s.cobertura = 'calculated'
      s.giro      = 'locked'
    } else if (ue('giro') && ue('cobertura') && known(rl) && known(v.giro) && v.giro > 0) {
      v.estoqueMedio = +(rl / v.giro).toFixed(2)
      s.estoqueMedio = 'calculated'
      s.cobertura    = 'locked'
    } else if (ue('estoqueMedio') && ue('cobertura') && known(v.estoqueMedio) && known(rl) && rl > 0) {
      v.giro         = +(rl / v.estoqueMedio).toFixed(2)
      s.giro         = 'calculated'
      s.estoqueMedio = 'locked'
    }
  } else {
    // derivações silenciosas do histórico — sem bloquear
    if (known(rl) && known(v.giro) && v.giro > 0 && !ue('estoqueMedio')) {
      v.estoqueMedio = +(rl / v.giro).toFixed(2)
      s.estoqueMedio = 'calculated'
    } else if (known(rl) && known(v.estoqueMedio) && v.estoqueMedio > 0 && !ue('giro')) {
      v.giro = +(rl / v.estoqueMedio).toFixed(2)
      s.giro = 'calculated'
    }
    if (known(v.estoqueMedio) && known(rl) && rl > 0 && !ue('cobertura')) {
      v.cobertura = +((v.estoqueMedio / rl) * 365).toFixed(1)
      s.cobertura = 'calculated'
    }
  }

  // 4. Margem Bruta — só calcula se usuário não definiu manualmente
  if (!ue('margemBruta') && known(rl) && known(v.custoMedio) && known(v.pecasVendidas) && rl > 0) {
    const cpv = v.custoMedio * v.pecasVendidas
    v.margemBruta = +((( rl - cpv) / rl) * 100).toFixed(1)
    s.margemBruta = 'calculated'
  }

  // 5. MKD R$
  if (known(v.receitaBruta) && known(v.mkdPct)) {
    v.mkdRS = +(v.receitaBruta * (v.mkdPct / 100)).toFixed(2)
    s.mkdRS = 'calculated'
  }

  // 6. OTB — se usuário não definiu
  if (!ue('otb') && known(v.pecasVendidas) && known(v.custoMedio)) {
    v.otb = +(v.pecasVendidas * v.custoMedio).toFixed(2)
    s.otb = 'calculated'
  }

  // 7. Total de Peças
  const compradas  = known(v.otb) && known(v.custoMedio) && v.custoMedio > 0
    ? v.otb / v.custoMedio : 0
  const produzidas = known(v.producaoPecas) ? v.producaoPecas : 0
  if (compradas > 0 || produzidas > 0) {
    v.totalPecas = +(compradas + produzidas).toFixed(0)
    s.totalPecas = 'calculated'
  }

  // 8. GMROI
  if (known(rl) && known(v.margemBruta) && known(v.custoMedio) && known(v.pecasVendidas) && v.custoMedio > 0) {
    const lucro      = rl * (v.margemBruta / 100)
    const custoTotal = v.custoMedio * v.pecasVendidas
    if (custoTotal > 0) {
      v.gmroi = +(lucro / custoTotal).toFixed(2)
      s.gmroi = 'calculated'
    }
  }

  // Garante ALWAYS_CALCULATED
  ALWAYS_CALCULATED.forEach(k => { s[k as keyof PlanningFieldStates] = 'calculated' })

  return { ...state, values: v, states: s }
}

// ─────────────────────────────────────────────────────────────
// UNLOCK — restaura ao valor do baseline e remove do touched
// ─────────────────────────────────────────────────────────────
const BASELINE_MAP: Partial<Record<FieldKey, keyof HistoricalBaseline>> = {
  receitaBruta: 'receitaBruta', margemBruta: 'margemBruta',
  pmv: 'pmv', giro: 'giro', cobertura: 'cobertura',
  otb: 'otb', producaoPecas: 'producaoPecas', mkdPct: 'mkdPct',
  custoMedio: 'custoMedio', totalPecas: 'totalPecas', gmroi: 'gmroi',
}

export function unlockField(state: PlanningState, field: FieldKey): PlanningState {
  if (ALWAYS_CALCULATED.includes(field)) return state

  const touched       = state.touched.filter(f => f !== field)
  const baselineKey   = BASELINE_MAP[field]
  const baselineValue = baselineKey ? state.baseline[baselineKey] : null

  return recalculate({
    ...state,
    values:  { ...state.values,  [field]: baselineValue },
    states:  { ...state.states,  [field]: 'free' },
    touched,
  })
}

export function generateScenarioName(year: number, existingCount: number): string {
  return `${year}-V${existingCount + 1}`
}
