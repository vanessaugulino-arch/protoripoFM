// ─── officialPlanService.ts ─────────────────────────────────────────────────────
// Plano Oficial único (Fase 1 da arquitetura bottom-up).
//
// O Plano Oficial é uma linha única por ciclo, ancorada em annual_plan_cycles
// (chave tenant_id + year). Ele NÃO duplica os dados detalhados — estes
// permanecem nas tabelas de cenário de cada módulo (channel_scenarios,
// division_scenarios, planning_scenarios). O que o Plano Oficial guarda é:
//
//   • detail_level        — até onde o plano avançou (1=Macro … 5=Sortimento)
//   • official_macro      — o macro canônico, SEMPRE derivado da base pela
//                           primazia dos absolutos (função recompute_official_macro)
//   • applied_*_scenario_id — ponteiros para o cenário aplicado em cada nível
//
// Regra de ouro: o macro nunca é editado à mão — é recalculado da base. Assim o
// Plano Oficial é matematicamente consistente por construção (livre de divergência).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'
import { consolidateCells, type MacroCell } from '../../engine/cellConsolidation'
import { rollupSeasonsToMacro, type SeasonRollupInput } from '../../engine/seasonRollup'

// Colunas/-RPC adicionadas após a geração dos tipos → cast pontual.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/** Macro canônico derivado da base. Todos os valores em unidades reais. */
export interface OfficialMacro {
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
  source:        string   // ex: 'channel_rollup'
  recomputed_at: string
}

export interface OfficialPlan {
  year:                       number
  detailLevel:                number   // 1..5
  macro:                      OfficialMacro | null
  appliedChannelScenarioId:   string | null
  appliedDivisionScenarioId:  string | null
  appliedMonthScenarioId:     string | null
  appliedSortimentScenarioId: string | null
}

// ── Paridade de cálculo (TS ↔ SQL) ──────────────────────────────────────────────
// Espelho EXATO da função Postgres recompute_official_macro: mesma primazia dos
// absolutos, mesmo tratamento de markdown (custoMedio = (Receita − Lucro − Markdown)
// ÷ Peças, consistente com o T3). Usado para exibir o macro "ao vivo" na tela sem
// depender de round-trip ao banco — e para o teste de paridade numérica.

/** Absolutos por canal que entram no rollup do macro. */
export interface ChannelAbsolutes {
  receita?:        number
  producao?:       number   // peças
  margemBrutaRS?:  number   // lucro bruto R$
  estoqueMedioRS?: number
  markdown?:       number
  orcamento?:      number
}

/**
 * Recalcula o macro a partir dos absolutos dos canais (primazia dos absolutos).
 * Retorna null quando não há canais. DEVE bater 1:1 com recompute_official_macro (SQL).
 */
export function macroFromChannels(
  channelData: Record<string, ChannelAbsolutes> | null | undefined,
): OfficialMacro | null {
  const entries = Object.entries(channelData ?? {})
  if (entries.length === 0) return null

  // Cada canal vira uma célula (grão de canal); a matemática vive em consolidateCells.
  const cells: MacroCell[] = entries.map(([id, c]) => ({
    receita:        c.receita        ?? 0,
    pecas:          c.producao       ?? 0,
    lucroBruto:     c.margemBrutaRS  ?? 0,
    estoqueMedioRS: c.estoqueMedioRS ?? 0,
    markdownRS:     c.markdown       ?? 0,
    orcamento:      c.orcamento      ?? 0,
    dimension:      id,
  }))

  const macro = consolidateCells(cells)
  if (!macro) return null
  return { ...macro, source: 'channel_rollup', recomputed_at: new Date().toISOString() }
}

// ── Leitura ───────────────────────────────────────────────────────────────────

/** Lê o Plano Oficial do ciclo (macro + nível + ponteiros). */
export async function getOfficialPlan(
  tenantId: string,
  year:     number,
): Promise<OfficialPlan | null> {
  if (!tenantId) return null
  const { data, error } = await db
    .from('annual_plan_cycles')
    .select(
      'year, detail_level, official_macro, applied_channel_scenario_id, ' +
      'applied_division_scenario_id, applied_month_scenario_id, applied_sortiment_scenario_id',
    )
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .maybeSingle()

  if (error || !data) return null

  return {
    year:                       data.year,
    detailLevel:                data.detail_level ?? 1,
    macro:                      (data.official_macro ?? null) as OfficialMacro | null,
    appliedChannelScenarioId:   data.applied_channel_scenario_id ?? null,
    appliedDivisionScenarioId:  data.applied_division_scenario_id ?? null,
    appliedMonthScenarioId:     data.applied_month_scenario_id ?? null,
    appliedSortimentScenarioId: data.applied_sortiment_scenario_id ?? null,
  }
}

// ── Recompute bottom-up ─────────────────────────────────────────────────────────

/**
 * Recalcula o macro oficial a partir do nível inferior aplicado (hoje: canal/M2),
 * pela primazia dos absolutos. Retorna o macro recalculado, ou null se ainda não
 * há nível inferior aplicado (nesse caso o macro permanece como está).
 *
 * A gravação no banco acontece dentro da função Postgres — esta chamada apenas a
 * dispara. Deve ser chamada ao APLICAR um cenário de nível inferior (não a cada
 * tecla): a atualização "ao vivo" na tela é feita em memória pelo próprio módulo.
 */
export async function recomputeOfficialMacro(
  tenantId: string,
  year:     number,
): Promise<OfficialMacro | null> {
  if (!tenantId) return null
  const { data, error } = await db.rpc('recompute_official_macro', {
    p_tenant: tenantId,
    p_year:   year,
  })
  if (error) {
    console.warn('[officialPlan] recompute falhou:', error.message)
    return null
  }
  return (data ?? null) as OfficialMacro | null
}

// ── Rollup do M3 (divisão → mês → macro anual) ──────────────────────────────────

/** Pesos mensais da temporada a partir do histórico (RPC agregada). undefined = uniforme. */
async function getSeasonMonthlyWeights(
  tenantId: string,
  colecao:  string,
): Promise<Record<number, number> | undefined> {
  if (!colecao) return undefined
  try {
    const { data, error } = await db.rpc('get_season_monthly_curve', {
      p_tenant:  tenantId,
      p_colecao: colecao,
    })
    if (error || !Array.isArray(data) || data.length === 0) return undefined
    const out: Record<number, number> = {}
    for (const row of data as { month: number; revenue: number }[]) {
      out[Number(row.month)] = Number(row.revenue) || 0
    }
    return out
  } catch {
    return undefined
  }
}

/**
 * Recalcula o macro oficial do ano a partir dos cenários de DIVISÃO (M3) aplicados,
 * pelo grão mensal: distribui os absolutos de cada temporada nos seus meses (curva
 * histórica), atribui cada mês ao ano fiscal e consolida. É a conta inversa subindo
 * do M3 para o M1. Retorna null quando não há divisão aplicada que caia no ano.
 */
export async function recomputeMacroFromDivisions(
  tenantId: string,
  year:     number,
): Promise<OfficialMacro | null> {
  if (!tenantId) return null

  // 1. Cenários de divisão aplicados
  const { data: scen } = await db
    .from('division_scenarios')
    .select('id, season_id, consolidated')
    .eq('tenant_id', tenantId)
    .eq('is_applied', true)
  if (!scen || scen.length === 0) return null

  // 2. Temporadas do tenant (para os meses / ano fiscal)
  const { data: seasonsRows } = await db
    .from('seasons')
    .select('id, name, month_start, month_end, fiscal_year')
    .eq('tenant_id', tenantId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seasonById = new Map<string, any>((seasonsRows ?? []).map((s: any) => [s.id, s]))

  // 3. Monta as entradas do rollup
  const inputs: SeasonRollupInput[] = []
  for (const sc of scen as { id: string; season_id: string; consolidated: Record<string, unknown> }[]) {
    const se = seasonById.get(sc.season_id)
    if (!se) continue
    const c = sc.consolidated ?? {}
    const totals = {
      receita:        Number(c.totalRevenue    ?? 0),
      pecas:          Number(c.totalPecas      ?? 0),
      lucroBruto:     Number(c.totalLucroBruto ?? 0),
      estoqueMedioRS: Number(c.totalEstMedioRS ?? 0),
      markdownRS:     Number(c.totalMarkdownRS ?? 0),
      orcamento:      Number(c.totalOrcamento  ?? 0),
    }
    if (totals.receita <= 0) continue
    const weights = await getSeasonMonthlyWeights(tenantId, se.name as string)
    inputs.push({
      monthStart:       se.month_start,
      monthEnd:         se.month_end,
      seasonFiscalYear: (se.fiscal_year ?? year) as number,
      totals,
      monthlyWeights:   weights,
    })
  }
  if (inputs.length === 0) return null

  const macro = rollupSeasonsToMacro(inputs, year)
  if (!macro) return null

  const full: OfficialMacro = { ...macro, source: 'division_rollup', recomputed_at: new Date().toISOString() }
  await db
    .from('annual_plan_cycles')
    .update({ official_macro: full, detail_level: 3, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('year', year)

  return full
}

// ── Avanço de nível de detalhe ──────────────────────────────────────────────────

/**
 * Marca até que nível o Plano Oficial avançou. Só avança (nunca retrocede
 * automaticamente). 1=Macro 2=Canal 3=Divisão 4=Mensal 5=Sortimento.
 */
export async function advanceDetailLevel(
  tenantId: string,
  year:     number,
  level:    number,
): Promise<void> {
  if (!tenantId) return
  // Lê o nível atual para não retroceder
  const { data } = await db
    .from('annual_plan_cycles')
    .select('detail_level')
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .maybeSingle()

  const current = (data?.detail_level ?? 1) as number
  if (level <= current) return

  await db
    .from('annual_plan_cycles')
    .update({ detail_level: level, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('year', year)
}
