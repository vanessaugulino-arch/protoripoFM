// src/engine/channelDefaultScenario.ts
// ─── Motor puro do Canal (M2) ───────────────────────────────────────────────
// Extraído de ChannelPlanning.tsx (Fase 4/Cascata Automática) para virar fonte
// única de verdade: tanto o botão manual "Aplicar" da tela quanto o
// orquestrador da Cascata Automática (cascadeOrchestrator.ts) chamam as MESMAS
// funções — nunca duas implementações da mesma conta que podem divergir.
//
// Nada aqui depende de React/estado de componente: tudo é função pura ou lê
// direto do Supabase (nunca do cache em memória de página, que só existe
// depois de initPlanCycles ter rodado num componente montado).

import { supabase } from '../lib/supabase'
import { loadOnboardingProfileFromDb } from '../services/supabase/onboardingService'
import { getHistoricalProfiles, normalizeChannelPcts } from '../services/supabase/historicalProfileService'
import type { SalesChannelId } from '../app/types/onboarding'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChannelId = 'atacado' | 'varejo' | 'ecommerce'

export interface ChannelData {
  receita: number
  margemBrutaRS: number
  margemBruta: number
  pmv: number
  ticketMedio: number
  custoMedio: number
  giro: number
  cobertura: number
  orcamento: number
  estoqueMedioRS: number
  estoqueMedioPecas: number
  mkdPct: number
  markdown: number
  producao: number
  totalPecas: number
  gmroi: number
}

export type MacroRates = Partial<Pick<ChannelData,
  'margemBruta' | 'pmv' | 'ticketMedio' | 'custoMedio' | 'giro' | 'cobertura' | 'mkdPct' | 'gmroi'
>>

export const RATE_KEYS_FOR_DELTA: Array<keyof MacroRates> = [
  'giro', 'margemBruta', 'mkdPct', 'pmv', 'cobertura', 'gmroi', 'custoMedio', 'ticketMedio',
]

export const CHANNEL_SALES_IDS: Record<ChannelId, SalesChannelId[]> = {
  atacado:   ['atacado'],
  varejo:    ['varejo_fisico', 'franquia', 'popup'],
  ecommerce: ['ecommerce_proprio', 'marketplace', 'social_commerce'],
}

// Taxas fallback usadas apenas quando o M1 não tem o indicador planejado.
export const CHANNEL_FALLBACK_RATES: Record<ChannelId, Pick<ChannelData,
  'margemBruta' | 'pmv' | 'ticketMedio' | 'custoMedio' | 'giro' | 'cobertura' | 'mkdPct' | 'gmroi'
>> = {
  atacado:   { margemBruta: 38.5, pmv: 165, ticketMedio: 320, custoMedio: 60, giro: 4.5, cobertura: 80, mkdPct: 4.0, gmroi: 1.85 },
  varejo:    { margemBruta: 48.0, pmv: 185, ticketMedio: 290, custoMedio: 72, giro: 4.6, cobertura: 75, mkdPct: 4.0, gmroi: 2.35 },
  ecommerce: { margemBruta: 52.0, pmv: 195, ticketMedio: 340, custoMedio: 75, giro: 4.8, cobertura: 70, mkdPct: 4.0, gmroi: 2.65 },
}

// ── Bandas bilaterais de aprovação ────────────────────────────────────────────
// higherIsBetter: true = ↑ melhor | false = ↓ melhor | null = bilateral (cobertura)
// badNeg: magnitude do gap NEGATIVO que dispara | badPos: magnitude do gap POSITIVO que dispara
// mode 'pct' = % relativo ao planejado | 'abs' = unidades absolutas
export const APPROVAL_BANDS: Record<string, {
  higherIsBetter: boolean | null
  badNeg: number
  badPos: number
  mode: 'pct' | 'abs'
}> = {
  receitaBruta:  { higherIsBetter: true,  badNeg: 2,   badPos: 2,   mode: 'pct' },
  margemBruta:   { higherIsBetter: true,  badNeg: 0.5, badPos: 2,   mode: 'abs' },
  giro:          { higherIsBetter: true,  badNeg: 0.5, badPos: 0.5, mode: 'abs' },
  pmv:           { higherIsBetter: true,  badNeg: 5,   badPos: 7,   mode: 'pct' },
  ticketMedio:   { higherIsBetter: true,  badNeg: 5,   badPos: 7,   mode: 'pct' },
  gmroi:         { higherIsBetter: true,  badNeg: 0.3, badPos: 0.5, mode: 'abs' },
  custoMedio:    { higherIsBetter: false, badNeg: 5,   badPos: 2,   mode: 'pct' },
  mkdPct:        { higherIsBetter: false, badNeg: 2,   badPos: 0.5, mode: 'abs' },
  cobertura:     { higherIsBetter: null,  badNeg: 8,   badPos: 8,   mode: 'abs' },
  producaoPecas: { higherIsBetter: true,  badNeg: 2,   badPos: 2,   mode: 'pct' },
  orcamento:     { higherIsBetter: false, badNeg: 5,   badPos: 2,   mode: 'pct' },
}

export function isOutsideBand(key: string, planned: number, projected: number): boolean {
  const band = APPROVAL_BANDS[key]
  if (!band || !planned) return false
  const gap        = projected - planned
  const absPlanned = Math.abs(planned)
  const negMag     = band.mode === 'pct' ? (-gap / absPlanned) * 100 : -gap
  const posMag     = band.mode === 'pct' ? (gap  / absPlanned) * 100 :  gap
  if (band.higherIsBetter === null) return Math.abs(gap) > band.badNeg // bilateral
  if (band.higherIsBetter)          return negMag > band.badNeg || posMag > band.badPos
  /* lower is better */             return posMag > band.badPos || negMag > band.badNeg
}

// ─── Funções puras de cálculo ─────────────────────────────────────────────────

/**
 * GMROI e cobertura do canal saem do mesmo estoque e do mesmo lucro do
 * consolidado (Σlucro ÷ Σestoque). Antes eram metas soltas: o canal mostrava
 * o GMROI do M1 (3,23) e o consolidado, calculado dos absolutos, outro (2,92).
 * Estoque em peças converte pelo custo médio, como no M1 (planningEngine).
 */
function derivados(receita: number, margemBrutaRS: number, estoqueMedioRS: number, custoMedio: number, pmv: number) {
  return {
    gmroi:             estoqueMedioRS > 0 ? margemBrutaRS / estoqueMedioRS : 0,
    cobertura:         receita > 0 ? (estoqueMedioRS / receita) * 365 : 0,
    estoqueMedioPecas: custoMedio > 0 ? estoqueMedioRS / custoMedio : (pmv > 0 ? estoqueMedioRS / pmv : 0),
  }
}

/**
 * Editar GMROI ou cobertura move o giro (o único driver de estoque); o resto
 * se recalcula em applyRevenue. GMROI = margem × giro; cobertura = 365 ÷ giro.
 */
export function giroFromEdit(data: ChannelData, field: 'gmroi' | 'cobertura', value: number): number {
  if (field === 'gmroi') return data.margemBruta > 0 && value > 0 ? value / (data.margemBruta / 100) : data.giro
  return value > 0 ? 365 / value : data.giro
}

export function applyRevenue(data: ChannelData, newReceita: number): ChannelData {
  const orcRate        = data.receita > 0 ? data.orcamento / data.receita : (data.custoMedio > 0 && data.pmv > 0 ? data.custoMedio / data.pmv : 0.365)
  const estoqueMedioRS = data.giro > 0 ? newReceita / data.giro : 0
  const producao       = data.pmv > 0 ? newReceita / data.pmv : 0
  const margemBrutaRS  = newReceita * data.margemBruta / 100
  return {
    ...data,
    receita:           newReceita,
    margemBrutaRS,
    orcamento:         newReceita * orcRate,
    estoqueMedioRS,
    ...derivados(newReceita, margemBrutaRS, estoqueMedioRS, data.custoMedio, data.pmv),
    producao,
    totalPecas:        producao,
    markdown:          newReceita * data.mkdPct / 100,
  }
}

export function buildChannel(
  receita: number,
  rates: Pick<ChannelData, 'margemBruta' | 'pmv' | 'ticketMedio' | 'custoMedio' | 'giro' | 'cobertura' | 'mkdPct' | 'gmroi'>
): ChannelData {
  const estoqueMedioRS = rates.giro > 0 ? receita / rates.giro : 0
  const producao       = rates.pmv > 0 ? receita / rates.pmv : 0
  const orcRate2       = rates.custoMedio > 0 && rates.pmv > 0 ? rates.custoMedio / rates.pmv : 0.365
  const margemBrutaRS  = receita * rates.margemBruta / 100
  return {
    receita,
    margemBrutaRS,
    ...rates,
    orcamento:         receita * orcRate2,
    estoqueMedioRS,
    ...derivados(receita, margemBrutaRS, estoqueMedioRS, rates.custoMedio, rates.pmv),
    producao,
    totalPecas:        producao,
    markdown:          receita * rates.mkdPct / 100,
  }
}

export function initChannelData(
  macroReceita: number,
  macroRates?: MacroRates,
): Record<ChannelId, ChannelData> {
  const ratesFor = (ch: ChannelId) => ({
    margemBruta: macroRates?.margemBruta ?? CHANNEL_FALLBACK_RATES[ch].margemBruta,
    pmv:         macroRates?.pmv         ?? CHANNEL_FALLBACK_RATES[ch].pmv,
    ticketMedio: macroRates?.ticketMedio ?? CHANNEL_FALLBACK_RATES[ch].ticketMedio,
    custoMedio:  macroRates?.custoMedio  ?? CHANNEL_FALLBACK_RATES[ch].custoMedio,
    giro:        macroRates?.giro        ?? CHANNEL_FALLBACK_RATES[ch].giro,
    cobertura:   macroRates?.cobertura   ?? CHANNEL_FALLBACK_RATES[ch].cobertura,
    mkdPct:      macroRates?.mkdPct      ?? CHANNEL_FALLBACK_RATES[ch].mkdPct,
    gmroi:       macroRates?.gmroi       ?? CHANNEL_FALLBACK_RATES[ch].gmroi,
  })
  return {
    atacado:   buildChannel(macroReceita * 0.40, ratesFor('atacado')),
    varejo:    buildChannel(macroReceita * 0.35, ratesFor('varejo')),
    ecommerce: buildChannel(macroReceita * 0.25, ratesFor('ecommerce')),
  }
}

/**
 * Calcula taxas consolidadas a partir de dados de canais salvos — sempre dos
 * absolutos acumulados, nunca média ponderada de taxas.
 */
export function computeConsolidatedFromRaw(
  chData: Record<string, Record<string, number>>,
  channels: ChannelId[]
): MacroRates {
  const totalR        = channels.reduce((s, ch) => s + (chData[ch]?.receita        ?? 0), 0)
  const totalEstMedio = channels.reduce((s, ch) => s + (chData[ch]?.estoqueMedioRS ?? 0), 0)
  const totalLucro    = channels.reduce((s, ch) => s + (chData[ch]?.margemBrutaRS  ?? 0), 0)
  const totalOrc      = channels.reduce((s, ch) => s + (chData[ch]?.orcamento      ?? 0), 0)
  const totalMkd      = channels.reduce((s, ch) => s + (chData[ch]?.markdown       ?? 0), 0)
  const totalProd     = channels.reduce((s, ch) => s + (chData[ch]?.producao       ?? 0), 0)
  const wAvg = (key: string) => totalR > 0
    ? channels.reduce((s, ch) => s + (chData[ch]?.receita ?? 0) * (chData[ch]?.[key] ?? 0), 0) / totalR
    : undefined
  return {
    giro:        totalEstMedio > 0 ? totalR / totalEstMedio        : undefined,
    cobertura:   totalR > 0        ? (totalEstMedio / totalR) * 365 : undefined,
    gmroi:       totalEstMedio > 0 ? totalLucro / totalEstMedio    : undefined,
    margemBruta: totalR > 0        ? (totalLucro / totalR) * 100   : undefined,
    mkdPct:      totalR > 0        ? (totalMkd / totalR) * 100     : undefined,
    pmv:         totalProd > 0     ? totalR / totalProd            : undefined,
    custoMedio:  totalProd > 0     ? totalOrc / totalProd          : undefined,
    ticketMedio: wAvg('ticketMedio'),
  }
}

// ─── Semente padrão (Cascata Automática) ─────────────────────────────────────

export interface DefaultChannelScenario {
  percents: Record<ChannelId, number>
  channelData: Record<ChannelId, ChannelData>
  macroReceita: number
  /** Taxas do M1 usadas — para o gate de aprovação comparar contra o consolidado calculado. */
  macroRates: MacroRates
}

const ALL_CHANNELS: ChannelId[] = ['atacado', 'varejo', 'ecommerce']

/**
 * Calcula o cenário padrão de Canal a partir do M1 aplicado (lido direto do
 * banco, nunca do cache em memória de página) + proporções históricas reais
 * por canal. Retorna null quando não há M1 salvo pra este ano — nada a
 * semear ainda.
 */
export async function computeDefaultChannelScenario(
  tenantId: string,
  year: number,
): Promise<DefaultChannelScenario | null> {
  const { data: cycle } = await (supabase as any)
    .from('annual_plan_cycles')
    .select('versions')
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .maybeSingle()

  const versions = (cycle?.versions as { values?: Record<string, number | null> }[] | null) ?? []
  if (versions.length === 0) return null

  const vals = versions[0]?.values ?? {}
  const macroReceita = (vals.receitaBruta as number | null) ?? 0
  const macroRates: MacroRates = {
    margemBruta: vals.margemBruta ?? undefined,
    pmv:         vals.pmv         ?? undefined,
    ticketMedio: vals.ticketMedio ?? undefined,
    custoMedio:  vals.custoMedio  ?? undefined,
    giro:        vals.giro        ?? undefined,
    cobertura:   vals.cobertura   ?? undefined,
    mkdPct:      vals.mkdPct      ?? undefined,
    gmroi:       vals.gmroi       ?? undefined,
  }

  const profile = await loadOnboardingProfileFromDb(tenantId).catch(() => null)
  const channels = profile?.salesChannels?.length
    ? ALL_CHANNELS.filter(ch => CHANNEL_SALES_IDS[ch].some(id => profile.salesChannels.includes(id)))
    : ALL_CHANNELS

  const histProfiles = await getHistoricalProfiles(tenantId).catch(() => ({ channels: [] as any[] }))
  const histPcts = normalizeChannelPcts(histProfiles.channels, channels)
  const percents = { atacado: 0, varejo: 0, ecommerce: 0, ...histPcts } as Record<ChannelId, number>

  const channelData = {} as Record<ChannelId, ChannelData>
  for (const ch of channels) {
    const pct = percents[ch] ?? 0
    channelData[ch] = buildChannel(Math.round(macroReceita * pct / 100), {
      margemBruta: macroRates.margemBruta ?? CHANNEL_FALLBACK_RATES[ch].margemBruta,
      pmv:         macroRates.pmv         ?? CHANNEL_FALLBACK_RATES[ch].pmv,
      ticketMedio: macroRates.ticketMedio ?? CHANNEL_FALLBACK_RATES[ch].ticketMedio,
      custoMedio:  macroRates.custoMedio  ?? CHANNEL_FALLBACK_RATES[ch].custoMedio,
      giro:        macroRates.giro        ?? CHANNEL_FALLBACK_RATES[ch].giro,
      cobertura:   macroRates.cobertura   ?? CHANNEL_FALLBACK_RATES[ch].cobertura,
      mkdPct:      macroRates.mkdPct      ?? CHANNEL_FALLBACK_RATES[ch].mkdPct,
      gmroi:       macroRates.gmroi       ?? CHANNEL_FALLBACK_RATES[ch].gmroi,
    })
  }

  return { percents, channelData, macroReceita, macroRates }
}
