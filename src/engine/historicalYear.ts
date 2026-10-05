// ─── historicalYear.ts ────────────────────────────────────────────────────────
// Monta o ano histórico (base do M1 e da tela de entrada do planejamento) a
// partir de uma linha de get_sales_historical_summary.
//
// Antes: margem bruta fixa em 40%, orçamento = 40% da receita, GMROI tirado
// dessa margem, giro 4 e cobertura 90 dias quando faltava estoque. Tudo
// aparecia como dado real.
//
// Agora: cada indicador usa o dado real quando existe. Quando falta dado, o
// valor padrão continua existindo (o planejamento precisa de um número para
// começar), mas o nome do indicador entra em `estimados` e a tela avisa.
// ─────────────────────────────────────────────────────────────────────────────

/** Linha de get_sales_historical_summary. Campos novos (0043) são opcionais
 *  para o app continuar funcionando com o banco antigo. */
export interface HistoricalSummaryRow {
  year: string | number
  receita: number | string
  producao: number | string
  pmv: number | string
  markdown: number | string
  ticket_medio: number | string
  estoque_medio_pecas: number | string
  margem_bruta?: number | string | null
  receita_com_custo_pct?: number | string | null
  estoque_medio_custo?: number | string | null
  estoque_medio_venda?: number | string | null
}

export type IndicadorHistorico =
  | 'margemBruta' | 'orcamento' | 'estoqueMedioRS' | 'giro' | 'cobertura' | 'gmroi' | 'ticketMedio'

export interface HistoricalYear {
  year: string
  receita: number
  margemBruta: number
  pmv: number
  orcamento: number
  estoqueMedioRS: number
  estoqueMedioPecas: number
  giro: number
  cobertura: number
  markdown: number
  producao: number
  gmroi: number
  ticketMedio: number
  /** Indicadores que NÃO vieram de dado real. Vazio = ano todo real. */
  estimados: IndicadorHistorico[]
  /** % da receita com custo cadastrado (base da margem). null = banco antigo. */
  receitaComCustoPct: number | null
}

/** Valores usados só quando falta dado. Mantidos iguais aos de antes. */
export const PADROES_SEM_DADO = {
  margemBruta: 40,   // %
  giro: 4,
  cobertura: 90,     // dias
} as const

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const r2 = (n: number) => Math.round(n * 100) / 100

export function historicalYearFromSummary(row: HistoricalSummaryRow): HistoricalYear {
  const estimados: IndicadorHistorico[] = []
  const receita  = num(row.receita) ?? 0
  const producao = num(row.producao) ?? 0
  const pmv      = num(row.pmv) ?? 0
  const markdown = num(row.markdown) ?? 0
  const estoqueMedioPecas = num(row.estoque_medio_pecas) ?? 0

  // Margem: real quando alguma venda tem produto com custo.
  const margemReal = num(row.margem_bruta)
  const margemBruta = margemReal ?? PADROES_SEM_DADO.margemBruta
  if (margemReal === null) estimados.push('margemBruta')
  const lucroBruto = receita * (margemBruta / 100)

  // Orçamento de referência = custo do que foi vendido (receita − lucro bruto).
  // Herda a confiança da margem.
  const orcamento = Math.round(receita - lucroBruto)
  if (margemReal === null) estimados.push('orcamento')

  // Estoque em R$ a preço de venda (mesma base da receita, para o giro).
  // Sem valor no estoque, usa peças × PMV, como antes.
  const estoqueVenda = num(row.estoque_medio_venda)
  const estoqueMedioRS = estoqueVenda && estoqueVenda > 0
    ? Math.round(estoqueVenda)
    : Math.round(estoqueMedioPecas * pmv)
  if (!(estoqueVenda && estoqueVenda > 0) && !(estoqueMedioPecas > 0)) estimados.push('estoqueMedioRS')

  // Giro e cobertura: só com estoque.
  const temEstoque = estoqueMedioRS > 0
  const giro = temEstoque ? r2(receita / estoqueMedioRS) : PADROES_SEM_DADO.giro
  const cobertura = giro > 0 && temEstoque ? Math.round(365 / giro) : PADROES_SEM_DADO.cobertura
  if (!temEstoque) estimados.push('giro', 'cobertura')

  // GMROI = lucro bruto ÷ estoque médio a custo. Sem estoque a custo, cai na
  // aproximação antiga (margem × giro), marcada como estimada.
  const estoqueCusto = num(row.estoque_medio_custo)
  let gmroi: number
  if (estoqueCusto && estoqueCusto > 0 && margemReal !== null) {
    gmroi = r2(lucroBruto / estoqueCusto)
  } else {
    gmroi = r2((margemBruta / 100) * giro)
    estimados.push('gmroi')
  }

  const ticketMedio = Math.round(num(row.ticket_medio) ?? 0)
  if (!(ticketMedio > 0)) estimados.push('ticketMedio')

  return {
    year: String(row.year),
    receita, margemBruta, pmv, orcamento, estoqueMedioRS, estoqueMedioPecas,
    giro, cobertura, markdown, producao, gmroi, ticketMedio,
    estimados,
    receitaComCustoPct: num(row.receita_com_custo_pct),
  }
}

/** Texto curto para a tela explicar de onde veio o número. */
export function notaEstimado(ano: HistoricalYear, indicador: IndicadorHistorico): string | null {
  if (!ano.estimados.includes(indicador)) return null
  switch (indicador) {
    case 'margemBruta':
    case 'orcamento':
      return 'estimado: nenhuma venda do ano tem produto com custo cadastrado'
    case 'gmroi':
      return 'estimado: falta custo dos produtos ou valor do estoque a custo'
    case 'estoqueMedioRS':
    case 'giro':
    case 'cobertura':
      return 'estimado: sem posição de estoque importada para o ano'
    case 'ticketMedio':
      return 'sem dado: vendas sem número de cupom/pedido'
  }
}
