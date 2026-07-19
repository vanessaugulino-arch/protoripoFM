// src/engine/planningEngine.ts
// v4 — todos indicadores derivados, baseline robusto, T1 com fallback de RL
//
// ─── HIERARQUIA DE DECISÃO DOS CLUSTERS ───────────────────────────────────────
// Ver documentação completa em: src/engine/INDICATOR_HIERARCHY.md
//
// PRINCÍPIO UNIVERSAL:
//   "Último toque = gatilho. Campo mais antigo/não tocado = absorvedor.
//    Campo mais estratégico = mais protegido."
//
// CLUSTER T1 — RECEITA × PMV × PEÇAS VENDIDAS
//   Hierarquia: PMV > Receita > Peças
//   Escala proporcional (só Receita tocada):
//     Escalam:    pecasVendidas, orcamento, producaoPecas, estoqueMediao, comprasPecas
//     Não escalam: pmv, margemBruta, custoMedio, giro, gmroi, cobertura, mkdPct, ticketMedio
//     MKD R$ = Receita × MKD% → escala como consequência natural (% fica, R$ acompanha)
//
// CLUSTER T2 — GIRO × ESTOQUE MÉDIO R$ × COBERTURA
//   Hierarquia: Giro > Cobertura > Estoque Médio
//
// CLUSTER T3 — MARGEM% × CUSTO MÉDIO × MKD%
//   Hierarquia: Custo Médio > Margem% > MKD% (MKD absorve por padrão)
//
// CLUSTER T4 — ORÇAMENTO PREVISTO × COMPRAS EM PEÇAS   [NOVO em v4.1]
//   Natureza: BIDIRECIONAL — sem hierarquia fixa, LIFO (último tocado = driver)
//   Bridge com T3: CustoMédio (ComprasPeças = Orçamento / CustoMédio)
//   Soberania pós-commit: o último campo definido vira âncora do cenário
//   Cascata para T2: ComprasPeças muda → EstMed muda → Giro/Cobertura ajustam
//   Nota: LIFO completo requer touchOrder[] — implementado parcialmente em v4.1,
//         completo na reescrita v5 (task #36)
//
// ALWAYS_CALCULATED (v4.1):
//   mkdRS, totalPecas, gmroi, receitaLiquida, producaoValor, orcamentoTotal,
//   estoqueMedioPecas, giroUnidades, idadeMediaEstoque
//   REMOVIDO: comprasPecas → agora FREE em T4
// ──────────────────────────────────────────────────────────────────────────────

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
  | 'estoqueMedioPecas'  // Estoque Médio em peças = estoqueMediao / custoMedio
  | 'giro'               // Giro (R$) = RL / estoqueMediao
  | 'giroUnidades'       // Giro (peças) = pecasVendidas / estoqueMedioPecas
  | 'idadeMediaEstoque'  // Idade Média de Estoque (dias) = (estoqueMedioPecas / pecasVendidas) × 365
  | 'cobertura'
  | 'mkdPct'
  | 'mkdRS'
  | 'orcamento'           // Orçamento de COMPRA em R$ (separado da produção)
  | 'orcamentoTotal'      // Orçamento total = compra + produção em valor
  | 'producaoPecas'      // volume de produção em peças (definido pelo usuário ou calculado)
  | 'producaoValor'      // produção em R$ = producaoPecas × custoMedio (sempre calculado)
  | 'comprasPecas'       // peças compradas = totalPecas - producaoPecas
  | 'totalPecas'
  | 'gmroi'
  | 'custoMedio'
  | 'ticketMedio'

export type FieldState = 'free' | 'locked' | 'calculated'

export interface PlanningValues extends Record<FieldKey, number | null> {}

export interface PlanningState {
  values:   PlanningValues
  states:   Record<FieldKey, FieldState>
  touched:  Set<FieldKey>
  baseline: Partial<PlanningValues>
}

// ─── Campos sempre calculados (nunca livres) ───────────────────────────────
// comprasPecas REMOVIDO daqui — passou a FREE (entra em CLUSTER T4)
export const ALWAYS_CALCULATED: FieldKey[] = [
  'mkdRS',
  'totalPecas',
  'gmroi',
  'receitaLiquida',
  'producaoValor',
  'orcamentoTotal',
  'estoqueMedioPecas',
  'giroUnidades',
  'idadeMediaEstoque',
]

// ─── Estado inicial de campos ─────────────────────────────────────────────
export const INITIAL_STATES: Record<FieldKey, FieldState> = {
  receitaBruta:       'free',
  devolucoes:         'free',
  receitaLiquida:     'calculated',
  margemBruta:        'free',
  pmv:                'free',
  pecasVendidas:      'free',
  estoqueInicial:     'free',
  estoqueFinal:       'free',
  estoqueMediao:      'free',
  estoqueMedioPecas:  'calculated',
  giro:               'free',
  giroUnidades:       'calculated',
  idadeMediaEstoque:  'calculated',
  cobertura:          'free',
  mkdPct:            'free',
  mkdRS:             'calculated',
  orcamento:          'free',
  orcamentoTotal:     'calculated',
  producaoPecas:     'free',
  producaoValor:     'calculated',
  comprasPecas:      'free',       // T4 — bidirecional com orcamento
  totalPecas:        'calculated',
  gmroi:             'calculated',
  custoMedio:        'free',
  ticketMedio:       'free',
}

export const INITIAL_VALUES: PlanningValues = {
  receitaBruta:      null, devolucoes:        null, receitaLiquida:     null,
  margemBruta:       null, pmv:               null, pecasVendidas:      null,
  estoqueInicial:    null, estoqueFinal:      null, estoqueMediao:      null,
  estoqueMedioPecas: null, giro:              null, giroUnidades:       null,
  idadeMediaEstoque: null, cobertura:         null, mkdPct:             null, mkdRS: null,
  orcamento:         null, orcamentoTotal:    null, producaoPecas:     null,
  producaoValor:     null, comprasPecas:      null, totalPecas:        null,
  gmroi:             null, custoMedio:        null, ticketMedio:       null,
}

// ─── Dados hipotéticos para validação (substitua por importação real) ──────
export const MOCK_BASELINE: Partial<PlanningValues> = {
  receitaBruta:   2850000,
  devolucoes:     142500,
  receitaLiquida: 2707500,
  margemBruta:    52,
  pmv:            189,
  pecasVendidas:  14327,
  estoqueInicial: 680000,
  estoqueMediao:  620000,
  estoqueMedioPecas: 7126,  // 620000 / 87
  giro:           4.37,
  giroUnidades:   2.01,     // 14327 / 7126
  cobertura:      83,
  mkdPct:         12,
  custoMedio:     87,
  producaoPecas:  4200,
  orcamento:       890000,
}

// ─── Constrói o estado inicial a partir do baseline ───────────────────────
export function buildStateFromBaseline(baseline: Partial<PlanningValues>): PlanningState {
  const values: PlanningValues = { ...INITIAL_VALUES }

  for (const key of Object.keys(baseline) as FieldKey[]) {
    values[key] = baseline[key] ?? null
  }

  const states: Record<FieldKey, FieldState> = { ...INITIAL_STATES }

  // Reconstrói devolucoes quando apenas receitaBruta + receitaLiquida estão presentes
  if (values.devolucoes === null && values.receitaBruta !== null && values.receitaLiquida !== null) {
    values.devolucoes = values.receitaBruta - values.receitaLiquida
  }

  // Deriva receitaLiquida (devolucoes pode ser 0)
  if (values.receitaBruta !== null) {
    values.receitaLiquida = values.receitaBruta - (values.devolucoes ?? 0)
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

  if (values.orcamento !== null && values.producaoValor !== null) {
    values.orcamentoTotal = values.orcamento + values.producaoValor
    states.orcamentoTotal = 'calculated'
  }

  if (values.estoqueMediao !== null && values.custoMedio !== null && values.custoMedio > 0) {
    values.estoqueMedioPecas = values.estoqueMediao / values.custoMedio
    states.estoqueMedioPecas = 'calculated'
  }

  if (values.pecasVendidas !== null && values.estoqueMedioPecas !== null && values.estoqueMedioPecas > 0) {
    values.giroUnidades = values.pecasVendidas / values.estoqueMedioPecas
    states.giroUnidades = 'calculated'
  }

  if (values.estoqueMedioPecas !== null && values.pecasVendidas !== null && values.pecasVendidas > 0) {
    values.idadeMediaEstoque = (values.estoqueMedioPecas / values.pecasVendidas) * 365
    states.idadeMediaEstoque = 'calculated'
  }

  return { values, states, touched: new Set<FieldKey>(), baseline }
}

// ─── Motor de recálculo principal ─────────────────────────────────────────
// Ordem de passes:
//   1.  Receita Líquida (com fallback devolucoes=0)
//   2.  T1 — Escala proporcional (SOMENTE receitaBruta tocada, nenhum principal)
//            Escalam:     pecasVendidas, orcamento, producaoPecas, estoqueMediao, comprasPecas
//            Não escalam: pmv, margemBruta, custoMedio, giro, cobertura, mkdPct, ticketMedio
//            MKD R$:      escala como consequência (= Receita × mkdPct% — passo 9)
//   3.  T1 — Receita ↔ PMV ↔ Peças (quando há toques além da receita)
//            Hierarquia: PMV > Receita > Peças
//   4.  T3 — Margem% ↔ CustoMédio ↔ MKD%
//            Hierarquia: Custo > Margem > MKD% (MKD absorve por padrão)
//            Selection-aware: activeKeys determina qual combinação está ativa
//   5.  T2 — Giro(R$) ↔ EstoqueMédio(R$) ↔ Cobertura
//            Hierarquia: Giro > Cobertura > EstMed
//   6.  T4 — Orçamento ↔ ComprasPeças  [BIDIRECIONAL]
//            LIFO: último tocado entre orcamento/comprasPecas = driver
//            Bridge: CustoMédio (ComprasPeças = Orcamento / CustoMédio)
//            Cascata: ComprasPeças → EstMed → Giro/Cobertura
//   7.  Produção em valor / Estoque Final / Orçamento Total (derivados)
//   8.  Total de Peças (derivado)
//   9.  MKD R$ (derivado: Receita × MKD%)
//  10.  GMROI (derivado: LucroBruto / EstMed)
//  11.  EstMed Peças + Giro Peças + Idade Média (derivados)
//  12.  Enforce ALWAYS_CALCULATED
export function recalculate(state: PlanningState, activeKeys?: string[]): PlanningState {
  const v       = { ...state.values }
  const s       = { ...state.states }
  const touched = new Set(state.touched)
  const base    = state.baseline

  // ── PASSO 1: Receita Líquida ──────────────────────────────────────────────
  // Quando devolucoes é null assume-se 0 (sem devoluções informadas).
  // Isso garante que RL sempre existe quando receitaBruta existe.
  if (v.receitaBruta !== null) {
    v.receitaLiquida = v.receitaBruta - (v.devolucoes ?? 0)
    s.receitaLiquida = 'calculated'
  }

  // ── PASSO 2: T1 — Escala Proporcional pela Receita ───────────────────────
  // CLUSTER T1 — regra de escala proporcional
  // Aplica SOMENTE quando receitaBruta é o ÚNICO campo principal tocado.
  //
  // ESCALAM pelo fator (fator = RB_novo / RB_base):
  //   pecasVendidas, orcamento, producaoPecas, estoqueMediao, comprasPecas, estoqueInicial
  //
  // NÃO ESCALAM (são taxas ou decisões independentes):
  //   pmv           → PMV = RL/Peças, ambos escalam → PMV permanece inalterado ✓
  //   margemBruta   → Margem = (RL−Custo×Peças)/RL, tudo escala → Margem permanece ✓
  //   custoMedio    → decisão de sourcing, independe da receita
  //   giro          → RL/EstMed, ambos escalam → Giro permanece ✓
  //   cobertura     → EstMed×365/RL, ambos escalam → Cobertura permanece ✓
  //   gmroi         → RL×Margem/EstMed, tudo escala → GMROI permanece ✓
  //   mkdPct        → política comercial, não escala
  //   ticketMedio   → decisão de pricing
  //
  // MKD R$ = Receita × MKD% → calculado no Passo 9 (escala como consequência natural)
  const CAMPOS_PRINCIPAIS: FieldKey[] = [
    'pmv', 'pecasVendidas', 'margemBruta', 'custoMedio',
    'giro', 'cobertura', 'estoqueMediao', 'orcamento', 'producaoPecas', 'comprasPecas',
  ]
  const soAlterouReceita =
    touched.has('receitaBruta') &&
    CAMPOS_PRINCIPAIS.every(k => !touched.has(k))

  if (soAlterouReceita && v.receitaBruta && base.receitaBruta) {
    const fator = v.receitaBruta / base.receitaBruta

    // Campos que escalam proporcionalmente
    if (base.estoqueMediao   != null) { v.estoqueMediao   = base.estoqueMediao   * fator;                   s.estoqueMediao   = 'free' }
    if (base.orcamento       != null) { v.orcamento       = base.orcamento       * fator;                   s.orcamento       = 'free' }
    if (base.producaoPecas   != null) { v.producaoPecas   = Math.round(base.producaoPecas * fator);         s.producaoPecas   = 'free' }
    if (base.pecasVendidas   != null) { v.pecasVendidas   = Math.round((base.pecasVendidas ?? 0) * fator);  s.pecasVendidas   = 'free' }
    if (base.estoqueInicial  != null) { v.estoqueInicial  = base.estoqueInicial  * fator;                   s.estoqueInicial  = 'calculated' }
    // T4: comprasPecas escala junto (= Orcamento/Custo, ambos de base × fator / custo_fixo)
    if (base.comprasPecas    != null) { v.comprasPecas    = Math.round(base.comprasPecas * fator);          s.comprasPecas    = 'free' }

    // Campos que NÃO escalam — mantidos explicitamente no valor de base
    if (base.cobertura != null) { v.cobertura = base.cobertura; s.cobertura = 'free' }
    if (base.giro      != null) { v.giro      = base.giro;      s.giro      = 'free' }
    // pmv, margemBruta, custoMedio, mkdPct, ticketMedio: não tocados, permanecem em v[]
  }

  // ── PASSO 3: CLUSTER T1 — Receita ↔ PMV ↔ Peças Vendidas ────────────────
  // Hierarquia: PMV > Receita > Peças (campo de menor hierarquia absorve)
  //
  // Receita + PMV tocados → Peças absorve   (Peças = RL/PMV)
  // Receita + Peças tocadas → PMV absorve   (PMV = RL/Peças)
  // PMV + Peças tocados → Receita absorve   (Receita = PMV × Peças)
  // Só PMV tocado → Peças absorve silenciosamente
  // Só Peças tocadas → PMV absorve silenciosamente
  //
  // Usa receitaBruta como fallback de RL quando devolucoes não está disponível.
  if (!soAlterouReceita) {
    const hasRL  = touched.has('receitaBruta') || touched.has('receitaLiquida')
    const hasPMV = touched.has('pmv')
    const hasPec = touched.has('pecasVendidas')
    const t1     = [hasRL, hasPMV, hasPec].filter(Boolean).length

    // RL efetivo: preferir receitaLiquida calculada, cair em receitaBruta se necessário
    const rlEf = v.receitaLiquida ?? v.receitaBruta

    if (t1 >= 2) {
      if (hasRL && hasPMV && rlEf && v.pmv && v.pmv > 0) {
        v.pecasVendidas = rlEf / v.pmv
        s.pecasVendidas = 'calculated'
      } else if (hasRL && hasPec && rlEf && v.pecasVendidas && v.pecasVendidas > 0) {
        v.pmv           = rlEf / v.pecasVendidas
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
    } else if (hasPMV && v.pmv && v.pmv > 0 && rlEf) {
      // Apenas PMV tocado: deriva peças silenciosamente
      v.pecasVendidas = rlEf / v.pmv
      s.pecasVendidas = 'calculated'
    } else if (hasPec && v.pecasVendidas && v.pecasVendidas > 0 && rlEf) {
      // Apenas peças tocadas: deriva PMV silenciosamente
      v.pmv = rlEf / v.pecasVendidas
      s.pmv = 'calculated'
    }
  }

  // ── PASSO 4: CLUSTER T3 — Margem% ↔ CustoMédio ↔ MKD% ──────────────────
  // Hierarquia: CustoMédio > Margem% > MKD%  (MKD absorve por padrão)
  // Margem% = ((RL - CustoMédio × Peças) / RL) × 100
  //
  // Editar Margem%:
  //   nenhum tocado → MKD% absorve (remarcação reduz/aumenta para fechar)
  //   MKD% tocado   → CustoMédio absorve (Custo = RL×(1-Margem%)/Peças)
  //   Custo tocado  → MKD% absorve (Custo protegido)
  //   ambos tocados → MKD% absorve (Custo tem prioridade máxima)
  //
  // Editar MKD%:
  //   nenhum tocado  → Margem% ajusta (reflexo direto)
  //   Margem% tocada → CustoMédio absorve (margem protegida)
  //   Custo tocado   → Margem% absorve
  //   ambos tocados  → Margem% absorve (Custo máxima prioridade)
  //
  // Editar CustoMédio:
  //   nenhum tocado  → Margem% absorve (Custo↑ → Margem espreme; MKD mantido)
  //   Margem% tocada → MKD% absorve (MKD compensa para manter margem)
  //   MKD% tocado    → Margem% absorve
  //   ambos tocados  → MKD% absorve (Margem protegida sobre MKD)
  //
  // Selection-aware (activeKeys):
  //   • mkdPct E custoMedio ambos ativos → editar Margem: trava custo, deriva mkdPct
  //   • mkdPct editado E custoMedio ativo → mantém margem, recalcula custoMedio
  {
    const hasRL    = touched.has('receitaBruta') || touched.has('receitaLiquida')
    const hasMarg  = touched.has('margemBruta')
    const hasCusto = touched.has('custoMedio')
    const hasMkd   = touched.has('mkdPct')
    const t3       = [hasRL, hasMarg, hasCusto].filter(Boolean).length

    const rl  = v.receitaLiquida ?? v.receitaBruta  // fallback
    const pec = v.pecasVendidas ?? (rl && v.pmv && v.pmv > 0 ? rl / v.pmv : null)

    const hasMkdSelected   = activeKeys?.includes('mkdPct')    ?? false
    const hasCustoSelected = activeKeys?.includes('custoMedio') ?? false
    const ambosAtivos      = hasMkdSelected && hasCustoSelected

    // Helper: deriva mkdPct mantendo custo fixo
    const applyMkdFromMargem = () => {
      if (v.margemBruta === null || v.custoMedio === null || !rl || !pec || pec <= 0) return
      const targetCPV  = rl * (1 - v.margemBruta / 100)
      const currentCPV = v.custoMedio * pec
      const cpvDelta   = targetCPV - currentCPV
      const curMkdRS   = v.mkdRS ?? (v.receitaBruta ? v.receitaBruta * (v.mkdPct ?? 0) / 100 : 0)
      const newMkdRS   = Math.max(0, curMkdRS + cpvDelta)
      if (v.receitaBruta && v.receitaBruta > 0) {
        v.mkdPct = (newMkdRS / v.receitaBruta) * 100
        s.mkdPct = 'calculated'
        v.mkdRS  = newMkdRS
        s.mkdRS  = 'calculated'
      }
      s.margemBruta = 'locked'
    }

    if (t3 >= 2 && rl && pec && pec > 0) {
      if (hasMarg && hasCusto && v.margemBruta !== null && v.custoMedio) {
        // Margem + Custo → força Receita
        const cpv        = v.custoMedio * pec
        v.receitaLiquida = cpv / (1 - v.margemBruta / 100)
        v.receitaBruta   = v.receitaLiquida + (v.devolucoes ?? 0)
        s.receitaLiquida = 'calculated'
        s.receitaBruta   = 'calculated'
        s.margemBruta    = 'locked'
      } else if (hasRL && hasMarg && v.margemBruta !== null) {
        // RL + Margem → CustoMédio absorve (mkdPct só absorve se custoMedio TAMBÉM foi tocado)
        const cpv    = rl * (1 - v.margemBruta / 100)
        if (pec && pec > 0) { v.custoMedio = cpv / pec; s.custoMedio = 'locked' }
        s.margemBruta = 'locked'
      } else if (hasRL && hasCusto && v.custoMedio) {
        // RL + CustoMédio → Margem% absorve (derivada).
        // CustoMédio NÃO trava: hierarquia T3 é Custo > Margem > MKD%.
        // CustoMédio é sempre soberano — nunca deve ser bloqueado quando editado.
        const cpv     = v.custoMedio * pec
        v.margemBruta = ((rl - cpv) / rl) * 100
        s.margemBruta = 'calculated'
        // s.custoMedio permanece 'free' — editável após este passo
      }
    } else if (hasMarg && !hasCusto && !hasRL && v.margemBruta !== null && rl && pec && pec > 0) {
      // Só Margem tocada → CustoMédio absorve (mkdPct mantém-se livre)
      // mkdPct só vira 'calculated' quando usuário toca custo E remarcação juntos
      const cpv    = rl * (1 - v.margemBruta / 100)
      v.custoMedio = cpv / pec
      s.custoMedio = 'locked'
    } else if (hasCusto && !hasMarg && !hasRL && v.custoMedio && rl && pec && pec > 0) {
      const cpv     = v.custoMedio * pec
      v.margemBruta = ((rl - cpv) / rl) * 100
      s.margemBruta = 'calculated'
    }

    // mkdPct editado + custoMedio ativo → recalcula custo para manter margem
    if (hasMkd && !hasMarg && !hasCusto && hasCustoSelected && rl && pec && pec > 0) {
      const margem = v.margemBruta
      if (margem !== null) {
        const targetCPV = rl * (1 - margem / 100)
        v.custoMedio = Math.max(0, targetCPV / pec)
        s.custoMedio = 'locked'
      }
    }
  }

  // ── PASSO 5: CLUSTER T2 — Giro(R$) ↔ EstoqueMédio(R$) ↔ Cobertura ──────
  // Hierarquia: Giro > Cobertura > Estoque Médio (EstMed absorve por padrão)
  //
  // Editar Giro:
  //   nenhum tocado   → EstMed = RL/Giro; Cobertura = 365/Giro
  //   EstMed tocado   → Cobertura absorve (⚠ alerta divergência matemática)
  //   Cobertura tocada → EstMed absorve
  //   ambos tocados   → EstMed absorve (Giro soberano)
  //
  // Editar EstMed:
  //   nenhum tocado  → Giro = RL/EstMed; Cobertura segue
  //   Giro tocado    → Cobertura absorve (Giro protegido; ⚠ alerta divergência)
  //   Cobertura tocada → Giro absorve
  //   ambos tocados  → Cobertura absorve (Giro protegido)
  //
  // Editar Cobertura:
  //   nenhum tocado → EstMed = (RL/365)×Cob; Giro = 365/Cob
  //   EstMed tocado → Giro absorve (⚠ alerta divergência)
  //   Giro tocado   → EstMed absorve
  //   ambos tocados → EstMed absorve (Giro protegido)
  {
    const hasGiro   = touched.has('giro')
    const hasEstMed = touched.has('estoqueMediao')
    const hasCober  = touched.has('cobertura')
    const t2        = [hasGiro, hasEstMed, hasCober].filter(Boolean).length
    const rl        = v.receitaLiquida ?? v.receitaBruta

    if (t2 >= 2 && rl && rl > 0) {
      if (hasGiro && hasEstMed && v.giro && v.giro > 0 && v.estoqueMediao) {
        v.cobertura = (v.estoqueMediao / rl) * 365
        s.cobertura = 'calculated'
        s.giro      = 'locked'
      } else if (hasGiro && hasCober && v.giro && v.giro > 0 && v.cobertura) {
        v.estoqueMediao = rl / v.giro
        s.estoqueMediao = 'calculated'
        s.cobertura     = 'locked'
      } else if (hasEstMed && hasCober && v.estoqueMediao && v.estoqueMediao > 0 && v.cobertura) {
        v.giro          = rl / v.estoqueMediao
        s.giro          = 'calculated'
        s.estoqueMediao = 'locked'
      }
    } else if (!soAlterouReceita && rl && rl > 0) {
      if (hasGiro && v.giro && v.giro > 0) {
        v.estoqueMediao = rl / v.giro
        s.estoqueMediao = 'calculated'
        if (v.estoqueMediao > 0) {
          v.cobertura = (v.estoqueMediao / rl) * 365
          s.cobertura = 'locked'
        }
      } else if (hasEstMed && v.estoqueMediao && v.estoqueMediao > 0) {
        v.giro      = rl / v.estoqueMediao
        s.giro      = 'calculated'
        v.cobertura = (v.estoqueMediao / rl) * 365
        s.cobertura = 'calculated'
      } else if (hasCober && v.cobertura && v.cobertura > 0) {
        v.estoqueMediao = (rl / 365) * v.cobertura
        s.estoqueMediao = 'calculated'
        if (v.estoqueMediao > 0) {
          v.giro = rl / v.estoqueMediao
          s.giro = 'locked'
        }
      }
    }
  }

  // ── PASSO 6: CLUSTER T4 — Orçamento ↔ ComprasPeças [BIDIRECIONAL] ─────────
  // Hierarquia: BIDIRECIONAL — LIFO (último tocado = driver)
  // Bridge: CustoMédio (ComprasPeças = Orçamento / CustoMédio)
  // Soberania pós-commit: último campo definido vira âncora do cenário
  //
  // Regras (v4.1 — LIFO parcial via Set; LIFO completo requer touchOrder[] em v5):
  //   orcamento tocado + comprasPecas NÃO tocado → ComprasPeças = Orcamento/Custo
  //   comprasPecas tocado + orcamento NÃO tocado → Orcamento = ComprasPeças × Custo
  //   ambos tocados                               → orcamento prevalece (soberano)
  //   nenhum tocado                               → derivar orcamento por fórmula delta
  //
  // Efeito de CustoMédio (T3) em T4:
  //   CustoMédio mudou + orcamento foi o último tocado → ComprasPeças = Orcamento/novo_Custo
  //   CustoMédio mudou + comprasPecas foi o último tocado → Orcamento = ComprasPeças×novo_Custo
  //
  // Cascata para T2: ComprasPeças → EstMed → Giro/Cobertura
  //   ComprasPeças↓ → EstMed↓ → Giro↑, Cobertura↓ (eficiência)
  //   ComprasPeças↑ → EstMed↑ → Giro↓, Cobertura↑ (reserva de estoque)
  //
  // Gap intencional: PecasVendidas (T1) ≠ ComprasPeças (T4)
  //   diferença = variação de estoque no período — não é erro, exibir como alerta visual
  {
    const custo = v.custoMedio
    const hasOrc = touched.has('orcamento')
    const hasCmp = touched.has('comprasPecas')

    if (hasOrc && !hasCmp) {
      // Orcamento é o driver → ComprasPeças deriva
      if (v.orcamento !== null && custo && custo > 0) {
        v.comprasPecas = Math.round(v.orcamento / custo)
        s.comprasPecas = 'calculated'
      }
    } else if (hasCmp && !hasOrc) {
      // ComprasPeças é o driver → Orcamento deriva
      if (v.comprasPecas !== null && custo && custo > 0) {
        v.orcamento = v.comprasPecas * custo
        s.orcamento = 'calculated'
      }
    } else if (hasOrc && hasCmp) {
      // Ambos tocados → orcamento prevalece (soberano quando Set não preserva ordem)
      // TODO v5: usar touchOrder[] para determinar qual foi o último
      if (v.orcamento !== null && custo && custo > 0) {
        v.comprasPecas = Math.round(v.orcamento / custo)
        s.comprasPecas = 'calculated'
      }
    } else {
      // Nenhum tocado (nem orcamento nem comprasPecas) → fórmula delta
      // Orçamento deriva de: (PeçasVendidas × CustoMédio) + variação de estoque
      // s.orcamento permanece 'free' — campo primário de T4, sempre editável pelo usuário.
      // (Remover a flag 'calculated' condicional a producaoPecas que bloqueava o campo)
      const pec     = v.pecasVendidas
      const estPlan = v.estoqueMediao
      const estBase = base.estoqueMediao ?? 0

      if (pec !== null && custo !== null && custo > 0 && estPlan !== null) {
        const orcCalc = (pec * custo) + (estPlan - estBase)
        v.orcamento   = Math.max(0, orcCalc)
        // Orçamento fica 'free' — usuário pode sobrescrever editando diretamente
        // ComprasPeças deriva do orcamento calculado
        v.comprasPecas = Math.round(v.orcamento / custo)
        s.comprasPecas = 'calculated'
      }
    }
  }

  // ── PASSO 7: Produção em valor / Estoque Final / Orçamento Total ────────────
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
  if (v.orcamento !== null) {
    v.orcamentoTotal = v.orcamento + prodVal
    s.orcamentoTotal = 'calculated'
  }

  // ── PASSO 8: Total de Peças (derivado) ───────────────────────────────────
  // ComprasPeças já foi resolvido no Passo 6 (T4). Aqui apenas soma o total.
  v.totalPecas = (v.comprasPecas ?? 0) + (v.producaoPecas ?? 0)
  s.totalPecas = 'calculated'

  // ── PASSO 9: MKD R$ (derivado) ───────────────────────────────────────────
  // MKD R$ = Receita × MKD%  (ALWAYS_CALCULATED — nunca editável)
  // Comportamento na escala T1: MKD% fica fixo → MKD R$ escala junto com Receita ✓
  if (v.receitaBruta && v.mkdPct !== null) {
    v.mkdRS = v.receitaBruta * (v.mkdPct / 100)
    s.mkdRS = 'calculated'
  }

  // ── PASSO 10: GMROI ───────────────────────────────────────────────────────
  if (v.receitaLiquida && v.margemBruta !== null && v.estoqueMediao && v.estoqueMediao > 0) {
    const lucroBruto = v.receitaLiquida * (v.margemBruta / 100)
    v.gmroi          = lucroBruto / v.estoqueMediao
    s.gmroi          = 'calculated'
  }

  // ── PASSO 11: Estoque Médio (peças) + Giro (peças) + Idade Média de Estoque
  // Idade Média = Σ(dias_i × qty_i) / Σ(qty_i)
  // Equivalente agregado: (estoqueMedioPecas / pecasVendidas) × 365
  // Relação: idadeMedia = 365 / giroUnidades
  if (v.estoqueMediao !== null && custo !== null && custo > 0) {
    v.estoqueMedioPecas = v.estoqueMediao / custo
    s.estoqueMedioPecas = 'calculated'
  }
  if (v.pecasVendidas !== null && v.estoqueMedioPecas !== null && v.estoqueMedioPecas > 0) {
    v.giroUnidades = v.pecasVendidas / v.estoqueMedioPecas
    s.giroUnidades = 'calculated'
  }
  if (v.estoqueMedioPecas !== null && v.pecasVendidas !== null && v.pecasVendidas > 0) {
    v.idadeMediaEstoque = (v.estoqueMedioPecas / v.pecasVendidas) * 365
    s.idadeMediaEstoque = 'calculated'
  }

  // ── PASSO 12: Garante que always-calculated nunca sejam 'free' ───────────
  ALWAYS_CALCULATED.forEach(k => {
    if (s[k] === 'free') s[k] = 'calculated'
  })

  return { values: v, states: s, touched, baseline: state.baseline }
}

// ─── Reverte campo ao valor do baseline (clique no cadeado) ───────────────
export function unlockField(state: PlanningState, field: FieldKey, activeKeys?: string[]): PlanningState {
  const touched = new Set(state.touched)
  touched.delete(field)

  const baselineValue = state.baseline[field] ?? null
  const values: PlanningValues = { ...state.values, [field]: baselineValue }
  const states: Record<FieldKey, FieldState> = { ...state.states, [field]: 'free' as FieldState }

  // Ao desbloquear PMV, deriva peças imediatamente (RL / pmvBaseline)
  if (field === 'pmv' && baselineValue !== null && baselineValue > 0) {
    const rl = values.receitaLiquida ?? values.receitaBruta
    if (rl !== null && rl > 0) {
      values.pecasVendidas = rl / baselineValue
      states.pecasVendidas = 'calculated'
    }
  }

  return recalculate({ ...state, values, states, touched }, activeKeys)
}

// ─── Reseta tudo ao baseline ───────────────────────────────────────────────
export function resetToBaseline(baseline: Partial<PlanningValues>): PlanningState {
  return buildStateFromBaseline(baseline)
}

// ─── Commita o estado ao salvar cenário ────────────────────────────────────
// Ao fazer commit:
//   • Todos os campos LOCKED e CALCULATED (exceto ALWAYS_CALCULATED) voltam a FREE
//   • O mapa de `touched` é zerado
//   • O novo baseline = valores atuais (definido externamente ao salvar no banco)
//   • T4: o último campo editado (orcamento ou comprasPecas) vira âncora deste cenário
//         Para mudar a âncora, abrir novo cenário
//   ALWAYS_CALCULATED nunca viram FREE (mkdRS, totalPecas, gmroi, etc.)
export function commitScenarioState(state: PlanningState): PlanningState {
  const s: Record<FieldKey, FieldState> = { ...state.states }

  for (const key of Object.keys(s) as FieldKey[]) {
    if (!ALWAYS_CALCULATED.includes(key)) {
      if (s[key] === 'locked' || s[key] === 'calculated') {
        s[key] = 'free'
      }
    }
  }

  return { ...state, states: s, touched: new Set<FieldKey>() }
}

// ─── Gera nome do cenário ──────────────────────────────────────────────────
export function generateScenarioName(year: number, existingCount: number): string {
  return `${year}-V${existingCount + 1}`
}
