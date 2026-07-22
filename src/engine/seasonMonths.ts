// ─── seasonMonths.ts ─────────────────────────────────────────────────────────
// Helper puro de meses da temporada — fonte única para interpretar o período de
// uma temporada, independente do formato (número "07" ou nome "Agosto") e
// tratando a temporada que CRUZA o ano fiscal (ex.: Verão Ago–Fev).
//
// Base do grão mensal: expandSeasonMonths devolve a lista de (mês, ano-calendário)
// que a temporada absorve — cada mês já rotulado com o ano fiscal a que pertence.
// É o que permite somar "os meses proporcionais de cada ciclo macro" (D1).
// ─────────────────────────────────────────────────────────────────────────────

const NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const SHORT_CAP = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const NAMES_NORM = NAMES.map(stripAccents)

/**
 * Converte um mês em índice 1..12. Aceita:
 *  - número: 7 ou "07" ou "7"
 *  - nome:   "Agosto", "agosto", "AGO", "ago"
 * Retorna 0 quando não reconhece.
 */
export function parseMonth(v: string | number | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v >= 1 && v <= 12 ? Math.trunc(v) : 0
  const s = String(v).trim().toLowerCase()
  if (s === '') return 0
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 1 && n <= 12 ? n : 0
  }
  const norm = stripAccents(s)
  let i = NAMES_NORM.indexOf(norm)
  if (i >= 0) return i + 1
  i = NAMES_NORM.findIndex(n => n.startsWith(norm.slice(0, 3)))
  return i >= 0 ? i + 1 : 0
}

/** Quantidade de meses fiscais que a temporada absorve (trata cruzamento de ano). */
export function seasonMonthCount(monthStart: string | number, monthEnd: string | number): number {
  const a = parseMonth(monthStart)
  const b = parseMonth(monthEnd)
  if (!a || !b) return 0
  return b >= a ? b - a + 1 : (12 - a) + b + 1
}

export interface SeasonMonth {
  /** 1..12 */
  month: number
  /** ano-calendário a que este mês pertence */
  year: number
}

/**
 * Expande a temporada na lista de (mês, ano-calendário). Trata o cruzamento:
 * quando monthStart > monthEnd, os meses de monthStart..12 ficam em fiscalYear e
 * os de 1..monthEnd caem em fiscalYear + 1.
 *
 * Ex.: Verão Ago–Fev / fiscalYear 2026 →
 *   {8..12, 2026} + {1..2, 2027}
 */
export function expandSeasonMonths(
  monthStart: string | number,
  monthEnd:   string | number,
  fiscalYear: number,
): SeasonMonth[] {
  const a = parseMonth(monthStart)
  const b = parseMonth(monthEnd)
  if (!a || !b) return []
  const out: SeasonMonth[] = []
  if (b >= a) {
    for (let m = a; m <= b; m++) out.push({ month: m, year: fiscalYear })
  } else {
    for (let m = a; m <= 12; m++) out.push({ month: m, year: fiscalYear })
    for (let m = 1; m <= b; m++) out.push({ month: m, year: fiscalYear + 1 })
  }
  return out
}

/** Rótulo curto do período fiscal, robusto a número ou nome. */
export function seasonFiscalLabel(monthStart: string | number, monthEnd: string | number): string {
  const a = parseMonth(monthStart)
  const b = parseMonth(monthEnd)
  const n = seasonMonthCount(monthStart, monthEnd)
  const s = a ? SHORT_CAP[a - 1] : String(monthStart)
  const e = b ? SHORT_CAP[b - 1] : String(monthEnd)
  return `${s} → ${e} · ${n} ${n === 1 ? 'mês fiscal' : 'meses fiscais'}`
}
