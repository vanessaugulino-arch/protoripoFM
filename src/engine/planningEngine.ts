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

// ─── Motor de recálculo principal ─────────────────────────────────────────
// Ordem de prioridade:
//   1. Receita Líquida
//   2. Escala proporcional (só receitaBruta tocada)
//   3. T1 — Receita ↔ PMV ↔ Peças
//   4. T3 — Margem ↔ CustoMédio ↔ Receita (engenharia reversa)
//   5. T2 — Giro ↔ EstoqueMédio ↔ Cobertura → OTB silencioso
//   6. OTB delta: (PeçasVendidas * Custo) + (EstoqueMediao - BaselineEstoqueMediao)
//   7. Produção em valor, Estoque Final, OTB Total
//   8. Peças Compradas / Total de Peças
//   9. MKD
//  10. GMROI
//  11. Enforce ALWAYS_CALCULATED
export function recalculate(state: PlanningState): PlanningState {
  const v = { ...state.values }
  const s = { ...state.states }
  const touched = new Set(state.touched)
  const base = state.baseline

  // ── PASSO 1: Receita Líquida ──────────────────────────────────────────────
  if (v.receitaBruta !== null && v.devolucoes !== null) {
    v.receitaLiquida = v.receitaBruta - v.devolucoes
    s.receitaLiquida = 'calculated'
  }

  // ── PASSO 2: Escala Proporcional pela Receita (Fator de Crescimento) ─────
  // Aplica SOMENTE quando receitaBruta é o ÚNICO campo principal tocado.
  // Os campos escalados ficam como 'calculated' (sem cadeado).
  const CAMPOS_PRINCIPAIS: FieldKey[] = [
    'pmv', 'pecasVendidas', 'margemBruta', 'custoMedio',
    'giro', 'cobertura', 'estoqueMediao', 'otbCompra', 'producaoPecas',
  ]
  const soAlterouReceita =
    touched.has('receitaBruta') &&
    CAMPOS_PRINCIPAIS.every(k => !touched.has(k))

  if (soAlterouReceita && v.receitaBruta && base.receitaBruta) {
    const fator = v.receitaBruta / base.receitaBruta

    if (base.estoqueMediao  != null) { v.estoqueMediao  = base.estoqueMediao  * fator;                       s.estoqueMediao  = 'calculated' }
    if (base.estoqueInicial != null) { v.estoqueInicial = base.estoqueInicial * fator;                       s.estoqueInicial = 'calculated' }
    if (base.otbCompra      != null) { v.otbCompra      = base.otbCompra      * fator;                       s.otbCompra      = 'calculated' }
    if (base.producaoPecas  != null) { v.producaoPecas  = Math.round(base.producaoPecas * fator);            s.producaoPecas  = 'calculated' }
    if (base.pecasVendidas  != null) { v.pecasVendidas  = Math.round((base.pecasVendidas ?? 0) * fator);     s.pecasVendidas  = 'calculated' }
    // Cobertura e Giro mantêm valor do baseline (índices relativos, não escalam com receita)
    if (base.cobertura != null) { v.cobertura = base.cobertura; s.cobertura = 'calculated' }
    if (base.giro      != null) { v.giro      = base.giro;      s.giro      = 'calculated' }
    if (base.pmv       != null) { v.pmv       = base.pmv;       s.pmv       = 'calculated' }
  }

  // ── PASSO 3: Triângulo T1 — Receita ↔ PMV ↔ Peças ───────────────────────
  // Regra: editar PMV impacta pecasVendidas; o volume resultante alimenta T2 e OTB.
  if (!soAlterouReceita) {
    const hasRL  = touched.has('receitaBruta') || touched.has('receitaLiquida')
    const hasPMV = touched.has('pmv')
    const hasPec = touched.has('pecasVendidas')
    const t1     = [hasRL, hasPMV, hasPec].filter(Boolean).length

    if (t1 >= 2) {
      if (hasRL && hasPMV && v.receitaLiquida && v.pmv && v.pmv > 0) {
        // Receita + PMV → calcula Peças (Bug 3: sem travar PMV)
        v.pecasVendidas = v.receitaLiquida / v.pmv
        s.pecasVendidas = 'calculated'
      } else if (hasRL && hasPec && v.receitaLiquida && v.pecasVendidas && v.pecasVendidas > 0) {
        // Receita + Peças → calcula PMV
        v.pmv           = v.receitaLiquida / v.pecasVendidas
        s.pmv           = 'calculated'
        s.pecasVendidas = 'locked'
      } else if (hasPMV && hasPec && v.pmv && v.pecasVendidas && v.pmv > 0) {
        // PMV + Peças → força Receita (engenharia reversa)
        v.receitaLiquida = v.pmv * v.pecasVendidas
        v.receitaBruta   = v.receitaLiquida + (v.devolucoes ?? 0)
        s.receitaLiquida = 'calculated'
        s.receitaBruta   = 'calculated'
        s.pmv            = 'locked'
      }
    } else if (hasPMV && v.pmv && v.pmv > 0 && v.receitaLiquida) {
      // Apenas PMV tocado: deriva pecasVendidas silenciosamente (calculated)
      v.pecasVendidas = v.receitaLiquida / v.pmv
      s.pecasVendidas = 'calculated'
    }
  }

  // ── PASSO 4: Triângulo T3 — Margem ↔ CustoMédio ↔ Receita ───────────────
  // Fórmula: Margem% = ((RL - CustoMédio * PeçasVendidas) / RL) * 100
  {
    const hasRL    = touched.has('receitaBruta') || touched.has('receitaLiquida')
    const hasMarg  = touched.has('margemBruta')
    const hasCusto = touched.has('custoMedio')
    const t3       = [hasRL, hasMarg, hasCusto].filter(Boolean).length
    const rl       = v.receitaLiquida
    // Bug 4: se pecasVendidas ainda é null, deriva localmente de RL/PMV
    const pec      = v.pecasVendidas ?? (rl && v.pmv && v.pmv > 0 ? rl / v.pmv : null)

    if (t3 >= 2 && rl && pec && pec > 0) {
      if (hasMarg && hasCusto && v.margemBruta !== null && v.custoMedio) {
        // Margem + Custo → força Receita (engenharia reversa)
        // RL = (CustoMédio * Peças) / (1 - Margem%)
        const cpv    = v.custoMedio * pec
        v.receitaLiquida = cpv / (1 - v.margemBruta / 100)
        v.receitaBruta   = v.receitaLiquida + (v.devolucoes ?? 0)
        s.receitaLiquida = 'calculated'
        s.receitaBruta   = 'calculated'
        s.margemBruta    = 'locked'
      } else if (hasRL && hasMarg && v.margemBruta !== null) {
        // Receita + Margem → calcula CustoMédio e trava-o (locked)
        const cpv    = rl * (1 - v.margemBruta / 100)
        v.custoMedio = cpv / pec
        s.custoMedio = 'locked'
        s.margemBruta = 'locked'
      } else if (hasRL && hasCusto && v.custoMedio) {
        // Receita + Custo → calcula Margem
        const cpv    = v.custoMedio * pec
        v.margemBruta = ((rl - cpv) / rl) * 100
        s.margemBruta = 'calculated'
        s.custoMedio  = 'locked'
      }
    } else if (hasMarg && !hasCusto && !hasRL && v.margemBruta !== null && rl && pec && pec > 0) {
      // Apenas margemBruta tocada: calcula custoMedio silenciosamente e trava
      const cpv    = rl * (1 - v.margemBruta / 100)
      v.custoMedio = cpv / pec
      s.custoMedio = 'locked'
    } else if (hasCusto && !hasMarg && !hasRL && v.custoMedio && rl && pec && pec > 0) {
      // Apenas custoMedio tocado: recalcula margem
      const cpv    = v.custoMedio * pec
      v.margemBruta = ((rl - cpv) / rl) * 100
      s.margemBruta = 'calculated'
    }
  }

  // ── PASSO 5: Triângulo T2 — Giro ↔ EstoqueMédio ↔ Cobertura ─────────────
  // Após resolver T2, EstoqueMédio e OTB são recalculados silenciosamente.
  {
    const hasGiro   = touched.has('giro')
    const hasEstMed = touched.has('estoqueMediao')
    const hasCober  = touched.has('cobertura')
    const t2        = [hasGiro, hasEstMed, hasCober].filter(Boolean).length
    const rl        = v.receitaLiquida

    if (t2 >= 2 && rl && rl > 0) {
      if (hasGiro && hasEstMed && v.giro && v.giro > 0 && v.estoqueMediao) {
        // Giro + Estoque → Cobertura (dias)
        v.cobertura = (v.estoqueMediao / rl) * 365
        s.cobertura = 'calculated'
        s.giro      = 'locked'
      } else if (hasGiro && hasCober && v.giro && v.giro > 0 && v.cobertura) {
        // Giro + Cobertura → EstoqueMédio (R$)
        v.estoqueMediao = rl / v.giro
        s.estoqueMediao = 'calculated'
        s.cobertura     = 'locked'
      } else if (hasEstMed && hasCober && v.estoqueMediao && v.estoqueMediao > 0 && v.cobertura) {
        // Estoque + Cobertura → Giro
        v.giro          = rl / v.estoqueMediao
        s.giro          = 'calculated'
        s.estoqueMediao = 'locked'
      }
    } else if (!soAlterouReceita && rl && rl > 0) {
      // Derivações silenciosas (1 vértice tocado)
      // Bug 5: gangorra — tocar Giro trava Cobertura, tocar Cobertura trava Giro
      if (hasGiro && v.giro && v.giro > 0) {
        v.estoqueMediao = rl / v.giro
        s.estoqueMediao = 'calculated'
        if (v.estoqueMediao > 0) {
          v.cobertura = (v.estoqueMediao / rl) * 365
          s.cobertura = 'locked'   // Bug 5: trava Cobertura quando Giro é editado
        }
      } else if (hasEstMed && v.estoqueMediao && v.estoqueMediao > 0) {
        v.giro = rl / v.estoqueMediao
        s.giro = 'calculated'
        v.cobertura = (v.estoqueMediao / rl) * 365
        s.cobertura = 'calculated'
      } else if (hasCober && v.cobertura && v.cobertura > 0) {
        v.estoqueMediao = (rl / 365) * v.cobertura
        s.estoqueMediao = 'calculated'
        if (v.estoqueMediao > 0) {
          v.giro = rl / v.estoqueMediao
          s.giro = 'locked'        // Bug 5: trava Giro quando Cobertura é editada
        }
      }
    }
  }

  // ── PASSO 6: OTB com fórmula delta ───────────────────────────────────────
  // OTB (R$) = (PeçasVendidas × CustoMédio) + (EstoqueMédioPlano − EstoqueMédioBaseline)
  // Bug 6: OTB só vira 'calculated' quando producaoPecas foi tocado (funil de abastecimento).
  // Caso contrário, o valor é computado para exibição mas o campo permanece 'free' (editável).
  if (!touched.has('otbCompra')) {
    const pec       = v.pecasVendidas
    const custo     = v.custoMedio
    const estPlan   = v.estoqueMediao
    const estBase   = base.estoqueMediao ?? 0

    if (pec !== null && custo !== null && custo > 0 && estPlan !== null) {
      const otbCalc = (pec * custo) + (estPlan - estBase)
      v.otbCompra   = Math.max(0, otbCalc)
      // Só trava como 'calculated' se o usuário definiu Produção (funil de abastecimento)
      if (touched.has('producaoPecas')) {
        s.otbCompra = 'calculated'
      }
      // Caso contrário, mantém 'free' — o valor exibido é uma sugestão editável
    }
  }

  // ── PASSO 7: Produção em valor / Estoque Final / OTB Total ───────────────
  const custo = v.custoMedio

  if (v.producaoPecas !== null && custo !== null) {
    v.producaoValor = v.producaoPecas * custo
    s.producaoValor = 'calculated'
  }

  if (v.receitaLiquida && v.cobertura && v.margemBruta !== null && v.cobertura > 0) {
    v.estoqueFinal = (v.receitaLiquida / 365) * v.cobertura * (1 - v.margemBruta / 100)
    s.estoqueFinal = 'calculated'
  }

  const prodVal = v.producaoValor ?? 0
  if (v.otbCompra !== null) {
    v.otbTotal = v.otbCompra + prodVal
    s.otbTotal = 'calculated'
  }

  // ── PASSO 8: Peças Compradas / Total de Peças ─────────────────────────────
  if (v.otbCompra !== null && custo && custo > 0) {
    v.comprasPecas = Math.round(v.otbCompra / custo)
    s.comprasPecas = 'calculated'
  }

  v.totalPecas = (v.comprasPecas ?? 0) + (v.producaoPecas ?? 0)
  s.totalPecas = 'calculated'

  // ── PASSO 9: MKD ─────────────────────────────────────────────────────────
  if (v.receitaBruta && v.mkdPct !== null) {
    v.mkdRS = v.receitaBruta * (v.mkdPct / 100)
    s.mkdRS = 'calculated'
  }

  // ── PASSO 10: GMROI ───────────────────────────────────────────────────────
  if (v.receitaLiquida && v.margemBruta !== null && v.estoqueMediao && v.estoqueMediao > 0) {
    const lucroBruto = v.receitaLiquida * (v.margemBruta / 100)
    v.gmroi = lucroBruto / v.estoqueMediao
    s.gmroi = 'calculated'
  }

  // ── PASSO 11: Garante que always-calculated nunca sejam 'free' ───────────
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
