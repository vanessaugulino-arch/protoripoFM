import type { IndicatorId } from './onboarding'

export type PlanMode = 'new' | 'review'

export type StrategicFocus = 'caixa' | 'margem' | 'crescimento' | 'defensivo' | 'custom'

export const STRATEGIC_FOCUS_LABELS: Record<StrategicFocus, string> = {
  caixa:       'Foco em Caixa',
  margem:      'Foco em Margem',
  crescimento: 'Foco em Crescimento',
  defensivo:   'Ano Defensivo',
  custom:      'Foco Personalizado',
}

export const STRATEGIC_FOCUS_DESC: Record<StrategicFocus, string> = {
  caixa:       'Prioriza liquidez, redução de estoque e eficiência de Orçamento.',
  margem:      'Prioriza mix de produto com maior valor agregado e redução de markdown.',
  crescimento: 'Prioriza volume de receita, expansão de canal e produção.',
  defensivo:   'Preservação de margens mínimas, contenção de risco macro e Orçamento conservador.',
  custom:      'Foco estratégico definido pelo usuário. Apenas receita bruta é obrigatória.',
}

export const STRATEGIC_FOCUS_ICONS: Record<StrategicFocus, string> = {
  caixa:       '💧',
  margem:      '💎',
  crescimento: '🚀',
  defensivo:   '🛡️',
  custom:      '✏️',
}

export const STRATEGIC_FOCUS_COLORS: Record<StrategicFocus, { card: string; badge: string }> = {
  caixa:       { card: 'border-sky-300 bg-sky-50',        badge: 'bg-sky-100 text-sky-700'       },
  margem:      { card: 'border-emerald-300 bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
  crescimento: { card: 'border-violet-300 bg-violet-50',   badge: 'bg-violet-100 text-violet-700'  },
  defensivo:   { card: 'border-amber-300 bg-amber-50',     badge: 'bg-amber-100 text-amber-700'   },
  custom:      { card: 'border-pink-300 bg-pink-50',       badge: 'bg-pink-100 text-pink-700'     },
}

// Planning field indicator definitions (used in priority setup)
export interface PlanIndicator {
  key: string
  label: string
  description: string
}

export const PLAN_INDICATORS: PlanIndicator[] = [
  { key: 'receitaBruta',  label: 'Receita Bruta',    description: 'Volume total de vendas' },
  { key: 'margemBruta',   label: 'Margem Bruta (%)', description: 'Resultado após custo de produtos' },
  { key: 'gmroi',         label: 'GMROI',            description: 'Retorno bruto sobre investimento em estoque' },
  { key: 'pmv',           label: 'PMV (R$)',          description: 'Preço médio de venda' },
  { key: 'orcamento',     label: 'Orçamento (custo)', description: 'Orçamento disponível para compras' },
  { key: 'giro',          label: 'Giro de Estoque',  description: 'Velocidade de renovação do estoque' },
  { key: 'cobertura',     label: 'Cobertura (dias)', description: 'Dias de estoque disponível' },
  { key: 'producaoPecas', label: 'Produção (peças)', description: 'Volume total de peças produzidas' },
  { key: 'mkdPct',        label: 'MKD %',            description: 'Percentual de desconto aplicado' },
  { key: 'custoMedio',    label: 'Custo Médio',      description: 'Custo médio por peça' },
  { key: 'ticketMedio',   label: 'Ticket Médio (R$)', description: 'Valor médio gasto por cliente em cada venda' },
]

// Número de indicadores sugeridos por foco (inclui Receita Bruta)
// CAIXA:       receita + giro, mkdPct, otbCompra, ticketMedio            = 5
// MARGEM:      receita + margemBruta, mkdPct, gmroi, pmv                 = 5
// CRESCIMENTO: receita + producaoPecas, otbCompra, ticketMedio, giro     = 5
// DEFENSIVO:   receita + cobertura, margemBruta, otbCompra, pmv          = 5
export const SUGGESTED_COUNTS: Record<StrategicFocus, number> = {
  caixa:       5,
  margem:      5,
  crescimento: 5,
  defensivo:   5,
  custom:      0,   // custom: nenhum indicador pré-sugerido
}

// Ordem de prioridade por foco — os primeiros N (SUGGESTED_COUNTS[foco]) são os sugeridos.
// O restante fica disponível para liberação manual pelo usuário (máx. 2 adicionais).
export const DEFAULT_PRIORITIES: Record<StrategicFocus, string[]> = {
  // Foco em Caixa: acelerar conversão de estoque → liquidez
  caixa:       ['receitaBruta', 'giro', 'mkdPct', 'otbCompra', 'ticketMedio',
                 'cobertura', 'margemBruta', 'producaoPecas', 'pmv', 'gmroi', 'custoMedio'],
  // Foco em Margem: maximizar rentabilidade preservando markup
  margem:      ['receitaBruta', 'margemBruta', 'mkdPct', 'gmroi', 'pmv',
                 'otbCompra', 'giro', 'cobertura', 'producaoPecas', 'ticketMedio', 'custoMedio'],
  // Foco em Crescimento: expandir volume e participação de mercado
  crescimento: ['receitaBruta', 'producaoPecas', 'otbCompra', 'ticketMedio', 'giro',
                 'margemBruta', 'pmv', 'cobertura', 'mkdPct', 'gmroi', 'custoMedio'],
  // Ano Defensivo: preservar caixa e reduzir risco
  defensivo:   ['receitaBruta', 'cobertura', 'margemBruta', 'otbCompra', 'pmv',
                 'giro', 'mkdPct', 'producaoPecas', 'gmroi', 'ticketMedio', 'custoMedio'],
  // Personalizado: apenas receita obrigatória; usuário seleciona livremente o resto
  custom:      ['receitaBruta', 'margemBruta', 'otbCompra', 'giro', 'cobertura',
                 'producaoPecas', 'pmv', 'mkdPct', 'ticketMedio', 'gmroi', 'custoMedio'],
}

export interface IndicatorPriority {
  id: IndicatorId
  rank: number
  isPriority: boolean
}

export const MAX_UNLOCK = 2   // user can unlock this many additional indicators

// 'dismissed' = sugerido pelo sistema mas conscientemente removido pelo usuário
export type FieldStatus = 'suggested' | 'unlocked' | 'inactive' | 'dismissed'

export interface PlanFieldPriority {
  key: string
  rank: number
  status: FieldStatus       // 'suggested' | 'unlocked' | 'inactive'
  isReference: boolean      // highlighted as reference indicator
  isPriority: boolean       // backward-compat: status !== 'inactive'
}

export interface AnnualPlanVersion {
  versionId: string
  savedAt: string
  scenarioName: string
  values: Record<string, number | null>
}

export interface AnnualPlanCycle {
  year: number
  mode: PlanMode
  focus: StrategicFocus
  customFocusName?: string          // usado somente quando focus === 'custom'
  fieldPriorities: PlanFieldPriority[]
  indicatorPriorities: IndicatorPriority[]
  versions: AnnualPlanVersion[]
  createdAt: string
  lastModifiedAt: string
}

export const PLAN_CYCLE_KEY = (year: number) => `fashionmind_cycle_${year}`
export const PLAN_CYCLE_INDEX_KEY = 'fashionmind_cycle_index'

export function getPlannedYears(): number[] {
  try {
    const raw = localStorage.getItem(PLAN_CYCLE_INDEX_KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export function getPlanCycle(year: number): AnnualPlanCycle | null {
  try {
    const raw = localStorage.getItem(PLAN_CYCLE_KEY(year))
    return raw ? (JSON.parse(raw) as AnnualPlanCycle) : null
  } catch {
    return null
  }
}

export function savePlanCycle(cycle: AnnualPlanCycle): void {
  cycle.lastModifiedAt = new Date().toISOString()
  localStorage.setItem(PLAN_CYCLE_KEY(cycle.year), JSON.stringify(cycle))
  const years = getPlannedYears()
  if (!years.includes(cycle.year)) {
    years.push(cycle.year)
    years.sort((a, b) => a - b)
    localStorage.setItem(PLAN_CYCLE_INDEX_KEY, JSON.stringify(years))
  }
}

export function addVersionToCycle(
  year: number,
  scenarioName: string,
  values: Record<string, number | null>,
): void {
  const cycle = getPlanCycle(year)
  if (!cycle) return
  const version: AnnualPlanVersion = {
    versionId: `v${Date.now()}`,
    savedAt: new Date().toISOString(),
    scenarioName,
    values,
  }
  cycle.versions = [version, ...cycle.versions].slice(0, 20)
  savePlanCycle(cycle)
}
