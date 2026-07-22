// ─── cellConsolidation.ts ────────────────────────────────────────────────────
// Camada de consolidação bottom-up (U1 da unificação do motor de cálculo).
//
// Princípio: o mês é a CÉLULA atômica de verdade do plano. Todo módulo é uma
// coleção de células (canal×mês, divisão×mês, categoria×mês) e o macro de
// qualquer agrupamento (temporada, ano fiscal, canal, divisão) é obtido pela
// PRIMAZIA DOS ABSOLUTOS: as taxas (PMV, margem, giro, GMROI…) nunca são média
// de médias — são sempre Σ(absoluto) ÷ Σ(absoluto).
//
// Esta biblioteca é PURA (sem dependências de rede/Supabase) para ser testável
// isoladamente e servir de fonte única da matemática — o mesmo cálculo roda no
// front (ao vivo) e é espelhado pela função Postgres recompute_official_macro.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Célula de indicadores no grão mensal. Guarda apenas ABSOLUTOS — as taxas são
 * sempre derivadas na consolidação. `month`/`fiscalYear`/`dimension` são rótulos
 * opcionais usados para agrupar (por ano fiscal, temporada, canal, divisão…).
 */
export interface MacroCell {
  receita:         number   // R$
  pecas:           number   // peças (produção / peças vendidas)
  lucroBruto:      number   // R$ (margem bruta em valor)
  estoqueMedioRS:  number   // R$
  markdownRS:      number   // R$
  orcamento:       number   // R$
  // rótulos de agrupamento (opcionais)
  month?:          number   // 1..12
  fiscalYear?:     number
  dimension?:      string   // ex.: id do canal / divisão / categoria
}

/** Macro consolidado (12 indicadores). Espelha recompute_official_macro (SQL). */
export interface ConsolidatedMacro {
  receitaBruta:  number
  pecasVendidas: number
  pmv:           number
  margemBruta:   number   // %
  custoMedio:    number
  estoqueMediao: number
  giro:          number
  cobertura:     number   // dias
  gmroi:         number
  mkdRS:         number
  mkdPct:        number   // %
  orcamento:     number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Célula zerada — útil como acumulador. */
export function emptyCell(labels: Partial<Pick<MacroCell, 'month' | 'fiscalYear' | 'dimension'>> = {}): MacroCell {
  return { receita: 0, pecas: 0, lucroBruto: 0, estoqueMedioRS: 0, markdownRS: 0, orcamento: 0, ...labels }
}

/** Soma os absolutos de duas células (rótulos vêm da primeira). */
export function addCells(a: MacroCell, b: MacroCell): MacroCell {
  return {
    receita:        a.receita        + b.receita,
    pecas:          a.pecas          + b.pecas,
    lucroBruto:     a.lucroBruto     + b.lucroBruto,
    estoqueMedioRS: a.estoqueMedioRS + b.estoqueMedioRS,
    markdownRS:     a.markdownRS     + b.markdownRS,
    orcamento:      a.orcamento      + b.orcamento,
    month:          a.month,
    fiscalYear:     a.fiscalYear,
    dimension:      a.dimension,
  }
}

/**
 * Consolida N células no macro, pela primazia dos absolutos.
 * Retorna null quando não há células. Fórmulas idênticas à função Postgres:
 * custoMedio exclui markdown (consistente com o T3: markdown corrói a margem).
 */
export function consolidateCells(cells: MacroCell[]): ConsolidatedMacro | null {
  if (!cells || cells.length === 0) return null

  let sReceita = 0, sPecas = 0, sLucro = 0, sEstoque = 0, sMkd = 0, sOrc = 0
  for (const c of cells) {
    sReceita += c.receita        ?? 0
    sPecas   += c.pecas          ?? 0
    sLucro   += c.lucroBruto     ?? 0
    sEstoque += c.estoqueMedioRS ?? 0
    sMkd     += c.markdownRS     ?? 0
    sOrc     += c.orcamento      ?? 0
  }

  return {
    receitaBruta:  r2(sReceita),
    pecasVendidas: Math.round(sPecas),
    pmv:           sPecas   > 0 ? r2(sReceita / sPecas)                    : 0,
    margemBruta:   sReceita > 0 ? r2((sLucro / sReceita) * 100)           : 0,
    custoMedio:    sPecas   > 0 ? r2((sReceita - sLucro - sMkd) / sPecas) : 0,
    estoqueMediao: r2(sEstoque),
    giro:          sEstoque > 0 ? r2(sReceita / sEstoque)                 : 0,
    cobertura:     sReceita > 0 ? Math.round((sEstoque / sReceita) * 365) : 0,
    gmroi:         sEstoque > 0 ? r2(sLucro / sEstoque)                   : 0,
    mkdRS:         r2(sMkd),
    mkdPct:        sReceita > 0 ? r2((sMkd / sReceita) * 100)             : 0,
    orcamento:     r2(sOrc),
  }
}

/**
 * Agrupa células por uma chave (ex.: ano fiscal, temporada, canal) e consolida
 * cada grupo. É o "gerar indicadores macro por mês e depois agrupar": passe as
 * células mensais e uma keyFn (ex.: c => c.fiscalYear) para obter o macro de
 * cada ano/temporada.
 */
export function groupConsolidate<K extends string | number>(
  cells: MacroCell[],
  keyFn: (cell: MacroCell) => K,
): Record<string, ConsolidatedMacro> {
  const buckets = new Map<K, MacroCell[]>()
  for (const c of cells) {
    const k = keyFn(c)
    const arr = buckets.get(k)
    if (arr) arr.push(c)
    else buckets.set(k, [c])
  }
  const out: Record<string, ConsolidatedMacro> = {}
  for (const [k, arr] of buckets.entries()) {
    const macro = consolidateCells(arr)
    if (macro) out[String(k)] = macro
  }
  return out
}
