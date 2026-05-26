// src/engine/planningEngine.ts
// Motor de cálculo do Módulo 1 — Planejamento Estratégico Ano Fiscal
// Sem dependências externas — testável puro

export type FieldKey =
  | 'receitaBruta'
  | 'devolucoes'
  | 'receitaLiquida'
  | 'margemBruta'
  | 'pmv'
  | 'pecasVendidas'
  | 'estoqueInicial'
  | 'estoqueTotal'
  | 'estoqueMedio'
  | 'giro'
  | 'cobertura'
  | 'mkdPct'
  | 'mkdRS'
  | 'otb'
  | 'producaoPecas'
  | 'totalPecas'
  | 'gmroi'
  | 'custoMedio'

export type FieldState = 'free' | 'locked' | 'calculated'

export interface PlanningValues {
  receitaBruta:   number | null
  devolucoes:     number | null
  receitaLiquida: number | null
  margemBruta:    number | null
  pmv:            number | null
  pecasVendidas:  number | null
  estoqueInicial: number | null
  estoqueTotal:   number | null
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
  estoqueInicial: FieldState
  estoqueTotal:   FieldState
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

export interface PlanningState {
  values:  PlanningValues
  states:  PlanningFieldStates
  touched: FieldKey[]
}

// Campos sempre calculados — nunca editáveis pelo usuário
export const ALWAYS_CALCULATED: FieldKey[] = ['mkdRS', 'totalPecas', 'gmroi', 'receitaLiquida']

// Campos visíveis no card principal (os demais são usados no backend)
export const VISIBLE_FIELDS: FieldKey[] = [
  'receitaBruta', 'margemBruta', 'pmv', 'giro',
  'cobertura', 'otb', 'producaoPecas', 'mkdPct',
  'mkdRS', 'totalPecas', 'gmroi'
]

export const INITIAL_VALUES: PlanningValues = {
  receitaBruta:   null,
  devolucoes:     null,
  receitaLiquida: null,
  margemBruta:    null,
  pmv:            null,
  pecasVendidas:  null,
  estoqueInicial: null,
  estoqueTotal:   null,
  estoqueMedio:   null,
  giro:           null,
  cobertura:      null,
  mkdPct:         null,
  mkdRS:          null,
  otb:            null,
  producaoPecas:  null,
  totalPecas:     null,
  gmroi:          null,
  custoMedio:     null,
}

export const INITIAL_STATES: PlanningFieldStates = {
  receitaBruta:   'free',
  devolucoes:     'free',
  receitaLiquida: 'calculated',
  margemBruta:    'free',
  pmv:            'free',
  pecasVendidas:  'free',
  estoqueInicial: 'free',
  estoqueTotal:   'free',
  estoqueMedio:   'free',
  giro:           'free',
  cobertura:      'free',
  mkdPct:         'free',
  mkdRS:          'calculated',
  otb:            'free',
  producaoPecas:  'free',
  totalPecas:     'calculated',
  gmroi:          'calculated',
  custoMedio:     'free',
}

// ─────────────────────────────────────────────────────────────────
// MOTOR DE RECÁLCULO
// Chamado toda vez que qualquer campo muda.
// Regra central: quando 2 dos 3 vértices de uma equação são
// preenchidos, o terceiro é bloqueado e calculado automaticamente.
// ─────────────────────────────────────────────────────────────────
export function recalculate(state: PlanningState): PlanningState {
  const v = { ...state.values }
  const s = { ...state.states }
  const touched = [...state.touched]

  const has = (field: FieldKey) => touched.includes(field)
  const known = (val: number | null): val is number => val !== null && !isNaN(val) && val !== 0

  // ── 1. Receita Líquida ──────────────────────────────────────
  // Sempre calculada: Receita Bruta - Devoluções
  if (known(v.receitaBruta) && known(v.devolucoes)) {
    v.receitaLiquida = v.receitaBruta - v.devolucoes
    s.receitaLiquida = 'calculated'
  } else if (known(v.receitaBruta) && !known(v.devolucoes)) {
    v.receitaLiquida = v.receitaBruta
    s.receitaLiquida = 'calculated'
  }

  // ── 2. Triângulo PMV / Peças / Receita ──────────────────────
  // 2 conhecidos → calcula o 3º e bloqueia
  const rl = v.receitaLiquida
  if (has('pmv') && has('pecasVendidas') && known(v.pmv) && known(v.pecasVendidas)) {
    // PMV e Peças definidos → Receita é derivada (mas já calculada acima, então trava PMV)
    s.pmv = 'locked'
  } else if (known(rl) && has('pmv') && known(v.pmv)) {
    // Receita + PMV → calcula Peças
    v.pecasVendidas = rl / v.pmv
    s.pecasVendidas = 'calculated'
    s.pmv = 'locked'
  } else if (known(rl) && has('pecasVendidas') && known(v.pecasVendidas)) {
    // Receita + Peças → calcula PMV
    v.pmv = rl / v.pecasVendidas
    s.pmv = 'calculated'
    s.pecasVendidas = 'locked'
  }

  // ── 3. Triângulo Giro / Estoque Médio / Cobertura ───────────
  // Giro ($) = Receita Líquida / Estoque Médio
  // Cobertura (dias) = (Estoque Médio / Receita Líquida) × 365
  const hasGiro     = has('giro')     && known(v.giro)
  const hasEstoque  = has('estoqueMedio') && known(v.estoqueMedio)
  const hasCobert   = has('cobertura') && known(v.cobertura)

  if (hasGiro && hasEstoque) {
    // Giro + Estoque → Cobertura e trava Giro
    if (known(v.estoqueMedio) && known(v.giro)) {
      v.cobertura = (v.estoqueMedio / (v.estoqueMedio * v.giro)) * 365
      if (known(rl)) v.cobertura = (v.estoqueMedio / rl) * 365
    }
    s.cobertura  = 'calculated'
    s.giro       = 'locked'
  } else if (hasGiro && hasCobert) {
    // Giro + Cobertura → Estoque Médio e trava Cobertura
    if (known(rl) && known(v.giro)) {
      v.estoqueMedio = rl / v.giro
      s.estoqueMedio = 'calculated'
      s.cobertura    = 'locked'
    }
  } else if (hasEstoque && hasCobert) {
    // Estoque + Cobertura → Giro e trava Estoque
    if (known(v.estoqueMedio) && known(rl)) {
      v.giro         = rl / v.estoqueMedio
      s.giro         = 'calculated'
      s.estoqueMedio = 'locked'
    }
  } else if (known(rl) && hasGiro && known(v.giro)) {
    // Só Giro definido: calcula Estoque Médio
    v.estoqueMedio = rl / v.giro
    s.estoqueMedio = 'calculated'
  } else if (known(rl) && hasEstoque && known(v.estoqueMedio)) {
    // Só Estoque definido: calcula Giro
    v.giro = rl / v.estoqueMedio
    s.giro = 'calculated'
  }

  // ── 4. Margem Bruta ─────────────────────────────────────────
  // MB% = (Receita Líquida - CPV) / Receita Líquida × 100
  // CPV = custoMedio × totalPecas (calculado abaixo)
  // Se o usuário definiu MB% manualmente, trava ela
  if (!has('margemBruta') && known(rl) && known(v.custoMedio) && known(v.pecasVendidas)) {
    const cpv = v.custoMedio * v.pecasVendidas
    v.margemBruta = ((rl - cpv) / rl) * 100
    s.margemBruta = 'calculated'
  }

  // ── 5. MKD ──────────────────────────────────────────────────
  // MKD R$ = Receita Bruta × (MKD% / 100)
  if (known(v.receitaBruta) && known(v.mkdPct)) {
    v.mkdRS = v.receitaBruta * (v.mkdPct / 100)
    s.mkdRS = 'calculated'
  }

  // ── 6. OTB ──────────────────────────────────────────────────
  // OTB R$ = Peças Necessárias × Custo Médio
  // Peças Necessárias = Peças Vendidas (a cobertura final é calculada no Módulo 4)
  // Se o usuário não definiu OTB manualmente, calcula
  if (!has('otb') && known(v.pecasVendidas) && known(v.custoMedio)) {
    v.otb = v.pecasVendidas * v.custoMedio
    s.otb = 'calculated'
  }

  // ── 7. Produção de Peças ─────────────────────────────────────
  // Se o usuário não definiu produção, deriva do OTB
  if (!has('producaoPecas') && known(v.otb) && known(v.custoMedio)) {
    // Só popula se não houver compras separadas definidas
    // (lógica completa virá com integração de canal no Módulo 4)
    s.producaoPecas = 'free'
  }

  // ── 8. Total de Peças ────────────────────────────────────────
  // Total = (OTB / custoMedio) + producaoPecas
  const compradas  = known(v.otb) && known(v.custoMedio) ? v.otb / v.custoMedio : 0
  const produzidas = known(v.producaoPecas) ? v.producaoPecas : 0
  if (compradas > 0 || produzidas > 0) {
    v.totalPecas = compradas + produzidas
    s.totalPecas = 'calculated'
  }

  // ── 9. GMROI ─────────────────────────────────────────────────
  // GMROI = Lucro Bruto / Custo Médio do Estoque
  if (known(rl) && known(v.margemBruta) && known(v.custoMedio) && known(v.estoqueMedio)) {
    const lucroBruto       = rl * (v.margemBruta / 100)
    const custoEstoque     = v.custoMedio * (known(v.pecasVendidas) ? v.pecasVendidas : 1)
    v.gmroi = lucroBruto / custoEstoque
    s.gmroi = 'calculated'
  }

  // Garante que campos always-calculated nunca escapem para free
  ALWAYS_CALCULATED.forEach(k => {
    if (s[k] !== 'calculated') s[k] = 'calculated'
  })

  return { values: v, states: s, touched }
}

// ─────────────────────────────────────────────────────────────────
// UNLOCK — usuário clica no cadeado para reverter o bloqueio
// Remove o campo dos touched e recalcula
// ─────────────────────────────────────────────────────────────────
export function unlockField(state: PlanningState, field: FieldKey): PlanningState {
  if (ALWAYS_CALCULATED.includes(field)) return state // nunca desbloqueia estes
  const touched = state.touched.filter(f => f !== field)
  const states  = { ...state.states, [field]: 'free' as FieldState }
  const values  = { ...state.values, [field]: null }
  return recalculate({ ...state, values, states, touched })
}

// ─────────────────────────────────────────────────────────────────
// NOME DO CENÁRIO — formato AAAA-VN
// ─────────────────────────────────────────────────────────────────
export function generateScenarioName(year: number, existingCount: number): string {
  return `${year}-V${existingCount + 1}`
}
