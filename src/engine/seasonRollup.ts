// ─── seasonRollup.ts ─────────────────────────────────────────────────────────
// Rollup bottom-up: temporada → mês → macro anual (F5 da fundação).
//
// Cada temporada tem seus absolutos totais (vindos do M3, primazia dos absolutos).
// Distribui esses absolutos pelos MESES da temporada (peso da curva), atribui cada
// mês ao seu ano-calendário (tratando a temporada que cruza o ano, ex. Ago–Fev) e
// consolida no macro do ano fiscal pedido. É a "conta inversa" subindo: o macro
// anual é sempre a soma dos meses que caem naquele ano.
//
// As taxas (PMV, margem, giro, GMROI, cobertura) são preservadas na distribuição
// porque numerador e denominador escalam pela mesma fração do mês.
// ─────────────────────────────────────────────────────────────────────────────

import { consolidateCells, type MacroCell, type ConsolidatedMacro } from './cellConsolidation'
import { expandSeasonMonths } from './seasonMonths'

/** Absolutos totais de uma temporada (o que o M3 consolida). */
export interface SeasonTotals {
  receita:        number
  pecas:          number
  lucroBruto:     number
  estoqueMedioRS: number
  markdownRS:     number
  orcamento:      number
}

/** Uma temporada a consolidar: período + ano fiscal + totais + curva mensal. */
export interface SeasonRollupInput {
  monthStart:       string | number
  monthEnd:         string | number
  seasonFiscalYear: number
  totals:           SeasonTotals
  /** Peso por mês (1..12). Se ausente/incompleto, distribui uniformemente. */
  monthlyWeights?:  Record<number, number>
}

/**
 * Consolida o macro do ano fiscal `targetYear` a partir das temporadas.
 * Soma apenas as parcelas mensais cujo ano-calendário == targetYear.
 * Retorna null quando nenhum mês cai no ano pedido.
 */
export function rollupSeasonsToMacro(
  seasons:    SeasonRollupInput[],
  targetYear: number,
): ConsolidatedMacro | null {
  const cells: MacroCell[] = []

  for (const s of seasons) {
    const months = expandSeasonMonths(s.monthStart, s.monthEnd, s.seasonFiscalYear)
    if (months.length === 0) continue

    // Peso de cada mês da temporada; normaliza para somar 1 sobre os meses.
    const weightOf = (m: number) =>
      s.monthlyWeights && s.monthlyWeights[m] != null ? s.monthlyWeights[m] : 1 / months.length
    const totalW = months.reduce((acc, mm) => acc + weightOf(mm.month), 0) || 1

    for (const mm of months) {
      if (mm.year !== targetYear) continue
      const frac = weightOf(mm.month) / totalW
      cells.push({
        receita:        s.totals.receita        * frac,
        pecas:          s.totals.pecas          * frac,
        lucroBruto:     s.totals.lucroBruto     * frac,
        estoqueMedioRS: s.totals.estoqueMedioRS * frac,
        markdownRS:     s.totals.markdownRS     * frac,
        orcamento:      s.totals.orcamento      * frac,
        month:          mm.month,
        fiscalYear:     mm.year,
      })
    }
  }

  return consolidateCells(cells)
}
