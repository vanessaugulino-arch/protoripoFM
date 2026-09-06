import type { IndicatorId } from './onboarding'
import { supabase } from '../../lib/supabase'

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
export const SUGGESTED_COUNTS: Record<StrategicFocus, number> = {
  caixa:       5,
  margem:      5,
  crescimento: 5,
  defensivo:   5,
  custom:      0,
}

export const DEFAULT_PRIORITIES: Record<StrategicFocus, string[]> = {
  caixa:       ['receitaBruta', 'giro', 'mkdPct', 'orcamento', 'ticketMedio',
                 'cobertura', 'margemBruta', 'producaoPecas', 'pmv', 'gmroi', 'custoMedio'],
  margem:      ['receitaBruta', 'margemBruta', 'mkdPct', 'gmroi', 'pmv',
                 'orcamento', 'giro', 'cobertura', 'producaoPecas', 'ticketMedio', 'custoMedio'],
  crescimento: ['receitaBruta', 'producaoPecas', 'orcamento', 'ticketMedio', 'giro',
                 'margemBruta', 'pmv', 'cobertura', 'mkdPct', 'gmroi', 'custoMedio'],
  defensivo:   ['receitaBruta', 'cobertura', 'margemBruta', 'orcamento', 'pmv',
                 'giro', 'mkdPct', 'producaoPecas', 'gmroi', 'ticketMedio', 'custoMedio'],
  custom:      ['receitaBruta', 'margemBruta', 'orcamento', 'giro', 'cobertura',
                 'producaoPecas', 'pmv', 'mkdPct', 'ticketMedio', 'gmroi', 'custoMedio'],
}

export interface IndicatorPriority {
  id: IndicatorId
  rank: number
  isPriority: boolean
}

export const MAX_UNLOCK = 2

export type FieldStatus = 'suggested' | 'unlocked' | 'inactive' | 'dismissed'

export interface PlanFieldPriority {
  key: string
  rank: number
  status: FieldStatus
  isReference: boolean
  isPriority: boolean
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
  customFocusName?: string
  fieldPriorities: PlanFieldPriority[]
  indicatorPriorities: IndicatorPriority[]
  versions: AnnualPlanVersion[]
  createdAt: string
  lastModifiedAt: string
}

// ─── Cache em memória — substitui localStorage ────────────────────────────────
// Populado via initPlanCycles(tenantId) na inicialização do app/módulo.
// Ciclos subsequentes são escritos via savePlanCycle (write-through → Supabase).

const _cycleCache = new Map<number, AnnualPlanCycle>()
let _currentTenantId: string | null = null

// Chave legada (mantida para compatibilidade com código que ainda usa PLAN_CYCLE_KEY)
export const PLAN_CYCLE_KEY = (year: number) => `fashionmind_cycle_${year}`
export const PLAN_CYCLE_INDEX_KEY = 'fashionmind_cycle_index'

// ─── Inicialização — carrega ciclos do Supabase para o cache em memória ───────
// Deve ser chamado uma vez após o login, passando o tenant_id do usuário.

export async function initPlanCycles(tenantId: string): Promise<void> {
  if (_currentTenantId === tenantId && _cycleCache.size > 0) return // já carregado
  _currentTenantId = tenantId
  _cycleCache.clear()

  const { data, error } = await supabase
    .from('annual_plan_cycles')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: true })

  if (error) {
    console.warn('[planCycle] initPlanCycles erro:', error.message)
    return
  }

  for (const row of data ?? []) {
    const cycle = _rowToCycle(row)
    _cycleCache.set(cycle.year, cycle)
  }
}

// ─── Leitura síncrona (do cache) ─────────────────────────────────────────────

export function getPlannedYears(): number[] {
  return Array.from(_cycleCache.keys()).sort((a, b) => a - b)
}

export function getPlanCycle(year: number): AnnualPlanCycle | null {
  return _cycleCache.get(year) ?? null
}

// ─── Escrita: cache + Supabase write-through ──────────────────────────────────
// Antes era fire-and-forget: se o upsert falhasse (RLS, rede, o que for), o
// erro só ia pro console — a tela mostrava "salvo" mesmo sem nada persistir.
// Agora devolve o resultado; quem chama pode (e deve) tratar a falha.

export interface SaveResult { ok: boolean; error?: string }

export async function savePlanCycle(cycle: AnnualPlanCycle): Promise<SaveResult> {
  cycle.lastModifiedAt = new Date().toISOString()
  _cycleCache.set(cycle.year, cycle)

  if (!_currentTenantId) {
    return { ok: false, error: 'Sem tenant identificado — não foi possível salvar.' }
  }
  const tenantId = _currentTenantId

  const { error } = await supabase
    .from('annual_plan_cycles')
    .upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        tenant_id:         tenantId,
        year:              cycle.year,
        mode:              cycle.mode,
        focus:             cycle.focus,
        custom_focus_name: cycle.customFocusName ?? null,
        field_priorities:  cycle.fieldPriorities,
        versions:          cycle.versions,
        updated_at:        cycle.lastModifiedAt,
      } as any,
      { onConflict: 'tenant_id,year' }
    )

  if (error) {
    console.warn('[planCycle] savePlanCycle erro:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function addVersionToCycle(
  year: number,
  scenarioName: string,
  values: Record<string, number | null>,
): Promise<SaveResult> {
  const cycle = getPlanCycle(year)
  if (!cycle) {
    return { ok: false, error: `Ciclo de ${year} não encontrado no cache — recarregue a página e tente de novo.` }
  }
  const version: AnnualPlanVersion = {
    versionId: `v${Date.now()}`,
    savedAt: new Date().toISOString(),
    scenarioName,
    values,
  }
  cycle.versions = [version, ...cycle.versions].slice(0, 20)
  return savePlanCycle(cycle)
}

// ─── Mapeamento DB row → AnnualPlanCycle ─────────────────────────────────────

function _rowToCycle(row: Record<string, unknown>): AnnualPlanCycle {
  // field_priorities pode chegar como LISTA (savePlanCycle) ou como OBJETO
  // keyed por indicador (PlanningSetup/saveCycle). Normaliza para lista — sem
  // isso, o objeto era lido como lista vazia e o Acompanhamento do M1 ficava
  // sem indicadores após um reload.
  const fpRaw = row.field_priorities
  const fp = Array.isArray(fpRaw)
    ? fpRaw
    : (fpRaw && typeof fpRaw === 'object' ? Object.values(fpRaw as Record<string, unknown>) : [])
  const vs = row.versions

  return {
    year:               row.year             as number,
    mode:               (row.mode            as PlanMode)         ?? 'new',
    focus:              (row.focus           as StrategicFocus)   ?? 'crescimento',
    customFocusName:    row.custom_focus_name as string | undefined,
    fieldPriorities:    fp                                       as PlanFieldPriority[],
    indicatorPriorities: [],
    versions:           (Array.isArray(vs) ? vs : [])            as AnnualPlanVersion[],
    createdAt:          (row.created_at      as string)           ?? new Date().toISOString(),
    lastModifiedAt:     (row.updated_at      as string)           ?? new Date().toISOString(),
  }
}
