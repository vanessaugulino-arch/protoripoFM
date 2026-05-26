// src/engine/planningEngine.ts
// v3 — triângulos bidirecionais completos + OTB real + escala proporcional

export type FieldKey =
  | 'receitaBruta'
  | 'devolucoes'
  | 'receitaLiquida'
  | 'margemBruta'
  | 'pmv'
  | 'pecasVendidas'
  | 'estoqueInicial'
  | 'estoqueFinal'
  | 'estoqueMediao'
  | 'giro'
  | 'cobertura'
  | 'mkdPct'
  | 'mkdRS'
  | 'otbCompra'       // OTB de COMPRA em R$ (separado da produção)
  | 'otbTotal'        // OTB total = compra + produção em valor
  | 'producaoPecas'   // volume de produção em peças (definido pelo usuário ou calculado)
  | 'producaoValor'   // produção em R$ = producaoPecas * custoMedio (sempre calculado)
  | 'comprasPecas'    // peças compradas = totalPecas - producaoPecas
  | 'totalPecas'
  | 'gmroi'
  | 'custoMedio'

export type FieldState = 'free' | 'locked' | 'calculated'

export interface PlanningValues extends Record<FieldKey, number | null> {}

export interface PlanningState {
  values: PlanningValues
  states: Record<FieldKey, FieldState>
  touched: Set<FieldKey>
  baseline: Partial<PlanningValues> // dados históricos — fonte da verdade para unlock
}

// ─── Campos sempre calculados (nunca livres) ───────────────────────────────
export const ALWAYS_CALCULATED: FieldKey[] = [
  'mkdRS',
  'totalPecas',
  'gmroi',
  'receitaLiquida',
  'producaoValor',
  'otbTotal',
  'comprasPecas',
]

// ─── Estado inicial de campos ─────────────────────────────────────────────
export const INITIAL_STATES: Record<FieldKey, FieldState> = {
  receitaBruta:    'free',
  devolucoes:      'free',
  receitaLiquida:  'calculated',
  margemBruta:     'free',
  pmv:             'free',
  pecasVendidas:   'free',
  estoqueInicial:  'free',
  estoqueFinal:    'free',
  estoqueMediao:   'free',
  giro:            'free',
  cobertura:       'free',
  mkdPct:          'free',
  mkdRS:           'calculated',
  otbCompra:       'free',
  otbTotal:        'calculated',
  producaoPecas:   'free',
  producaoValor:   'calculated',
  comprasPecas:    'calculated',
  totalPecas:      'calculated',
  gmroi:           'calculated',
  custoMedio:      'free',
}

export const INITIAL_VALUES: PlanningValues = {
  receitaBruta:   null, devolucoes:     null, receitaLiquida: null,
  margemBruta:    null, pmv:            null, pecasVendidas:  null,
  estoqueInicial: null, estoqueFinal:   null, estoqueMediao:  null,
  giro:           null, cobertura:      null, mkdPct:         null,
  mkdRS:          null, otbCompra:      null, otbTotal:       null,
  producaoPecas:  null, producaoValor:  null, comprasPecas:   null,
  totalPecas:     null, gmroi:          null, custoMedio:     null,
}

// ─── Dados hipotéticos para validação (substitua por importação real) ──────
export const MOCK_BASELINE: Partial<PlanningValues> = {
  receitaBruta:   2850000,
  devolucoes:     142500,
  receitaLiquida: 2707500,
  margemBruta:    52,         // 52%
  pmv:            189,        // R$ 189 preço médio de venda
  pecasVendidas:  14327,
  estoqueInicial: 680000,     // R$ em custo
  estoqueMediao:  620000,
  giro:           4.37,
  cobertura:      83,         // dias
  mkdPct:         12,
  custoMedio:     87,
  producaoPecas:  4200,
  otbCompra:      890000,
}

// ─── Constrói o estado inicial a partir do baseline ───────────────────────
export function buildStateFromBaseline(baseline: Partial<PlanningValues>): PlanningState {
  const values: PlanningValues = { ...INITIAL_VALUES }

  // Popula com os dados do baseline
  for (const key of Object.keys(baseline) as FieldKey[]) {
    values[key] = baseline[key] ?? null
  }

  const states: Record<FieldKey, FieldState> = { ...INITIAL_STATES }

  // Campos derivados que já conhecemos a partir do baseline
  if (values.receitaBruta !== null && values.devolucoes !== null) {
    values.receitaLiquida = values.receitaBruta - values.devolucoes
    states.receitaLiquida = 'calculated'
  }
  if (values.receitaBruta !== null && values.mkdPct !== null) {
    values.mkdRS = values.receitaBruta * (values.mkdPct / 100)
    states.mkdRS = 'calculated'
  }
  if (values.producaoPecas !== null && values.custoMedio !== null) {
    values.producaoValor = values.producaoPecas * values.custoMedio
    states.producaoValor = 'calculated'
  }
  if (values.otbCompra !== null && values.producaoValor !== null) {
    values.otbTotal = values.otbCompra + values.producaoValor
    states.otbTotal = 'calculated'
  }

  // touched vazio — baseline não trava nenhum campo
  return { values, states, touched: new Set<FieldKey>(), baseline }
}

// ─── Helper: quantos vértices de um triângulo estão tocados ───────────────
function countTouched(touched: Set<FieldKey>, ...keys: FieldKey[]): number {
  return keys.filter(k => touched.has(k)).length
}

// ─── Motor de recálculo principal ─────────────────────────────────────────
export function recalculate(state: PlanningState): PlanningState {
  const v = { ...state.values }
  const s = { ...state.states }
  const touched = new Set(state.touched)
  const base = state.baseline

  // ── Receita Líquida (sempre calculada) ──────────────────────────────────
  if (v.receitaBruta !== null && v.devolucoes !== null) {
    v.receitaLiquida = v.receitaBruta - v.devolucoes
    s.receitaLiquida = 'calculated'
  }

  // ── ESCALA PROPORCIONAL ao alterar apenas Receita ───────────────────────
  // Se o usuário alterou somente a receita, escala os demais proporcionalmente
  const soAlterouReceita =
    touched.has('receitaBruta') &&
    !touched.has('pmv') &&
    !touched.has('pecasVendidas') &&
    !touched.has('margemBruta') &&
    !touched.has('custoMedio') &&
    !touched.has('giro') &&
    !touched.has('cobertura')

  if (soAlterouReceita && v.receitaBruta && base.receitaBruta) {
    const fator = v.receitaBruta / base.receitaBruta
    if (base.estoqueMediao)   v.estoqueMediao   = base.estoqueMediao   * fator
    if (base.estoqueInicial)  v.estoqueInicial  = base.estoqueInicial  * fator
    if (base.otbCompra)       v.otbCompra       = base.otbCompra       * fator
    if (base.producaoPecas)   v.producaoPecas   = Math.round((base.producaoPecas ?? 0) * fator)
    if (base.cobertura)       v.cobertura       = base.cobertura       // cobertura em dias não muda proporcionalmente
  }

  // ── TRIÂNGULO T1: Receita ←→ PMV ←→ Peças ───────────────────────────────
  const t1 = countTouched(touched, 'receitaLiquida', 'pmv', 'pecasVendidas')

  if (t1 >= 2) {
    const hasRL  = touched.has('receitaLiquida') || touched.has('receitaBruta')
    const hasPMV = touched.has('pmv')
    const hasPec = touched.has('pecasVendidas')

    if (hasRL && hasPMV && v.receitaLiquida && v.pmv) {
      // Receita + PMV → calcula Peças
      v.pecasVendidas = v.receitaLiquida / v.pmv
      s.pecasVendidas = 'calculated'
      s.pmv           = 'locked'
    } else if (hasRL && hasPec && v.receitaLiquida && v.pecasVendidas) {
      // Receita + Peças → calcula PMV
      v.pmv  = v.receitaLiquida / v.pecasVendidas
      s.pmv  = 'calculated'
      s.pecasVendidas = 'locked'
    } else if (hasPMV && hasPec && v.pmv && v.pecasVendidas) {
      // PMV + Peças → calcula Receita (e consequentemente receita bruta)
      v.receitaLiquida = v.pmv * v.pecasVendidas
      v.receitaBruta   = v.receitaLiquida + (v.devolucoes ?? 0)
      s.receitaLiquida = 'calculated'
      s.receitaBruta   = 'calculated'
      s.pmv            = 'locked'
    }
  }

  // ── TRIÂNGULO T2: Giro ←→ EstoqueMédio ←→ Cobertura ─────────────────────
  const hasGiro     = touched.has('giro')
  const hasEstMed   = touched.has('estoqueMediao')
  const hasCober    = touched.has('cobertura')
  const t2 = [hasGiro, hasEstMed, hasCober].filter(Boolean).length

  if (t2 >= 2 && v.receitaLiquida) {
    if (hasGiro && hasEstMed && v.giro && v.estoqueMediao) {
      // Giro + Estoque → Cobertura
      v.cobertura = (v.estoqueMediao / (v.receitaLiquida / 365))
      s.cobertura = 'calculated'
      s.giro      = 'locked'
    } else if (hasGiro && hasCober && v.giro && v.receitaLiquida) {
      // Giro + Cobertura → Estoque Médio
      v.estoqueMediao = v.receitaLiquida / v.giro
      s.estoqueMediao = 'calculated'
      s.cobertura     = 'locked'
    } else if (hasEstMed && hasCober && v.estoqueMediao && v.receitaLiquida) {
      // Estoque + Cobertura → Giro
      v.giro  = v.receitaLiquida / v.estoqueMediao
      s.giro  = 'calculated'
      s.estoqueMediao = 'locked'
    }
  }

  // ── TRIÂNGULO T3: Receita ←→ Margem ←→ CustoMédio ──────────────────────
  const hasRL3  = touched.has('receitaBruta') || touched.has('receitaLiquida')
  const hasMarg = touched.has('margemBruta')
  const hasCusto= touched.has('custoMedio')
  const t3 = [hasRL3, hasMarg, hasCusto].filter(Boolean).length

  if (t3 >= 2 && v.receitaLiquida) {
    if (hasMarg && hasCusto && v.margemBruta !== null && v.custoMedio && v.pecasVendidas) {
      // Margem + Custo → Receita (engenharia reversa)
      // Receita = CPV / (1 - margem%)
      const cpv = v.custoMedio * v.pecasVendidas
      v.receitaLiquida = cpv / (1 - v.margemBruta / 100)
      v.receitaBruta   = v.receitaLiquida + (v.devolucoes ?? 0)
      s.receitaLiquida = 'calculated'
      s.receitaBruta   = 'calculated'
      s.margemBruta    = 'locked'
    } else if (hasRL3 && hasMarg && v.receitaLiquida && v.margemBruta !== null && v.pecasVendidas) {
      // Receita + Margem → CustoMédio
      const cpv = v.receitaLiquida * (1 - v.margemBruta / 100)
      v.custoMedio = cpv / v.pecasVendidas
      s.custoMedio = 'calculated'
      s.margemBruta = 'locked'
    } else if (hasRL3 && hasCusto && v.receitaLiquida && v.custoMedio && v.pecasVendidas) {
      // Receita + Custo → Margem
      const cpv = v.custoMedio * v.pecasVendidas
      v.margemBruta = ((v.receitaLiquida - cpv) / v.receitaLiquida) * 100
      s.margemBruta = 'calculated'
      s.custoMedio  = 'locked'
    }
  }

  // ── MKD (sempre calculado a partir de inputs livres) ────────────────────
  if (v.receitaBruta && v.mkdPct !== null) {
    v.mkdRS = v.receitaBruta * (v.mkdPct / 100)
    s.mkdRS = 'calculated'
  }

  // ── OTB REAL (fórmula de varejo) ─────────────────────────────────────────
  // OTB Compra = Vendas em custo + Estoque Final Desejado - Estoque Inicial
  // Estoque Final Desejado = (RL / 365) * cobertura * (1 - margem%)
  // Separado da produção — otbCompra é só o que será COMPRADO

  const rl       = v.receitaLiquida
  const marg     = v.margemBruta
  const custo    = v.custoMedio
  const cob      = v.cobertura
  const estIni   = v.estoqueInicial ?? (base.estoqueInicial ?? null)

  if (rl && marg !== null && custo && cob && estIni !== null) {
    const vendasCusto   = rl * (1 - marg / 100)
    const estFinalDes   = (rl / 365) * cob * (1 - marg / 100)
    const otbBruto      = vendasCusto + estFinalDes - estIni

    // Produção em valor
    const prodVal       = (v.producaoPecas ?? 0) * custo
    v.producaoValor     = prodVal
    s.producaoValor     = 'calculated'

    // OTB Compra = OTB Bruto - Produção (o que sobra precisa ser comprado)
    if (s.otbCompra !== 'free' || !touched.has('otbCompra')) {
      v.otbCompra     = Math.max(0, otbBruto - prodVal)
      s.otbCompra     = 'calculated'
    }

    // Estoque Final Desejado (registra para referência)
    v.estoqueFinal      = estFinalDes
    s.estoqueFinal      = 'calculated'

    // OTB Total
    v.otbTotal          = (v.otbCompra ?? 0) + prodVal
    s.otbTotal          = 'calculated'
  }

  // ── Peças Compradas ───────────────────────────────────────────────────────
  if (v.otbCompra !== null && custo) {
    v.comprasPecas  = Math.round(v.otbCompra / custo)
    s.comprasPecas  = 'calculated'
  }

  // ── Total de Peças ────────────────────────────────────────────────────────
  const compPec = v.comprasPecas ?? 0
  const prodPec = v.producaoPecas ?? 0
  v.totalPecas  = compPec + prodPec
  s.totalPecas  = 'calculated'

  // ── GMROI ─────────────────────────────────────────────────────────────────
  if (v.receitaLiquida && v.margemBruta !== null && v.estoqueMediao && v.custoMedio) {
    const lucroBruto       = v.receitaLiquida * (v.margemBruta / 100)
    const custoEstoqueMed  = v.estoqueMediao  // já está em valor de custo no baseline
    if (custoEstoqueMed > 0) {
      v.gmroi  = lucroBruto / custoEstoqueMed
      s.gmroi  = 'calculated'
    }
  }

  // ── Garante que always-calculated nunca sejam 'free' ─────────────────────
  ALWAYS_CALCULATED.forEach(k => {
    if (s[k] === 'free') s[k] = 'calculated'
  })

  return { values: v, states: s, touched, baseline: state.baseline }
}

// ─── Reverte campo ao valor do baseline (clique no cadeado) ───────────────
export function unlockField(state: PlanningState, field: FieldKey): PlanningState {
  const touched = new Set(state.touched)
  touched.delete(field)

  const baselineValue = state.baseline[field] ?? null

  const values = {
    ...state.values,
    [field]: baselineValue,
  }
  const states = {
    ...state.states,
    [field]: 'free' as FieldState,
  }

  return recalculate({ ...state, values, states, touched })
}

// ─── Reseta tudo ao baseline ───────────────────────────────────────────────
export function resetToBaseline(baseline: Partial<PlanningValues>): PlanningState {
  return buildStateFromBaseline(baseline)
}

// ─── Gera nome do cenário: "2027-V1", "2027-V2" etc. ──────────────────────
export function generateScenarioName(year: number, existingCount: number): string {
  return `${year}-V${existingCount + 1}`
}
