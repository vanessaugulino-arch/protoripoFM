import { getPlannedYears } from '../types/planCycle'

export interface CycleState {
  currentCalendarYear: number
  currentMonth: number       // 1–12
  monthsElapsed: number      // months fully completed
  plannedYears: number[]
  reviewableYears: number[]  // sorted most-recent first
  nextNewCycle: number       // lowest unplanned year after current
  canReview: boolean
  canStartNew: boolean
}

const MONTH_NAMES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTH_NAMES_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function computeCycleState(): CycleState {
  const now = new Date()
  const currentCalendarYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1  // 1-indexed
  const monthsElapsed = currentMonth - 1   // months fully completed

  const plannedYears = getPlannedYears()
  const reviewableYears = [...plannedYears].sort((a, b) => b - a)

  let nextNewCycle = currentCalendarYear + 1
  while (plannedYears.includes(nextNewCycle)) {
    nextNewCycle++
  }

  return {
    currentCalendarYear,
    currentMonth,
    monthsElapsed,
    plannedYears,
    reviewableYears,
    nextNewCycle,
    canReview: reviewableYears.length > 0,
    canStartNew: true,
  }
}

export function formatYearProgress(state: CycleState): string {
  const { monthsElapsed, currentCalendarYear } = state
  if (monthsElapsed <= 0) return `Início de ${currentCalendarYear}`
  const lastMonth = MONTH_NAMES_SHORT[monthsElapsed - 1]
  return `${monthsElapsed} ${monthsElapsed === 1 ? 'mês concluído' : 'meses concluídos'} de 12 — Jan a ${lastMonth}`
}

export function monthShort(zeroIndex: number): string {
  return MONTH_NAMES_SHORT[zeroIndex] ?? ''
}

export function monthFull(zeroIndex: number): string {
  return MONTH_NAMES_FULL[zeroIndex] ?? ''
}

export function yearProgressRatio(monthsElapsed: number): number {
  return Math.max(0, Math.min(1, monthsElapsed / 12))
}

/** Returns a prorated value for YTD comparison */
export function prorated(annual: number, monthsElapsed: number): number {
  return Math.round(annual * monthsElapsed / 12)
}
