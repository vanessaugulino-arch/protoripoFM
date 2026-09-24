// src/engine/monthDefaultScenario.ts
// ─── Motor puro da Sazonalidade (M3) ────────────────────────────────────────
// Extraído de CycleValidation.tsx (Fase 4/Cascata Automática) — fonte única
// de verdade tanto para a semente inicial que a tela sugere ao abrir quanto
// para o orquestrador da Cascata Automática (cascadeOrchestrator.ts).
//
// Confirmado ao extrair: activeCanals nesta tela SEMPRE cobre os 12 meses do
// ano fiscal (Jan-Dez) para todo canal do tenant — não há recorte por
// temporada aqui, o que simplifica a semente: não existe "meses por canal"
// para replicar, só a curva de sazonalidade histórica normalizada.

import { supabase } from '../lib/supabase'
import { getAppliedChannelScenario } from '../services/supabase/channelScenarioService'
import { getChannelSeasonality } from '../services/supabase/historicalProfileService'
import { MONTHS } from '../services/temporadaService'

export const ONBOARDING_TO_CANAL_ID: Record<string, string> = {
  varejo_fisico: 'varejo', ecommerce_proprio: 'ecommerce',
  marketplace: 'marketplace', atacado: 'atacado',
  franquia: 'franquia', multimarca_canal: 'multimarca',
  popup: 'popup', social_commerce: 'social_commerce',
}

const DEFAULT_CANAL_IDS = ['varejo', 'ecommerce', 'atacado']

export interface DefaultMonthScenario {
  plannedRevenue: Record<string, Record<string, number>> // canalId -> mês -> receita
  coverageTarget: Record<string, number> // mês -> dias (sempre 90, sem histórico próprio pra isso)
  estoqueColecaoPassada: number
  totalPlanned: number
  /** Linhagem M2→M3: channel_scenarios.id usado para semear os alvos por canal. */
  sourceChannelScenarioId: string
}

/**
 * Calcula a curva mensal padrão de Sazonalidade a partir do canal (M2)
 * aplicado + sazonalidade histórica real por canal. Retorna null quando não
 * há M2 aplicado pra este ano fiscal — nada a semear ainda.
 */
export async function computeDefaultMonthScenario(
  tenantId: string,
  year: number,
): Promise<DefaultMonthScenario | null> {
  const appliedChannel = await getAppliedChannelScenario(tenantId, year)
  if (!appliedChannel) return null

  const channelYearTarget: Record<string, number> = {}
  for (const [cid, data] of Object.entries(appliedChannel.channel_data ?? {})) {
    channelYearTarget[cid] = (data as Record<string, number>)?.receita ?? 0
  }

  const db = supabase as any
  const { data: profileRow } = await db
    .from('onboarding_profiles')
    .select('sales_channels')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const canalIds: string[] = profileRow?.sales_channels?.length
    ? (profileRow.sales_channels as string[]).map((sc: string) => ONBOARDING_TO_CANAL_ID[sc] ?? sc).filter(Boolean)
    : DEFAULT_CANAL_IDS

  const channelSeasonality = await getChannelSeasonality(tenantId).catch(() => ({} as Record<string, Record<string, number>>))

  const plannedRevenue: Record<string, Record<string, number>> = {}
  const coverageTarget: Record<string, number> = {}
  for (const month of MONTHS) coverageTarget[month] = 90

  let totalPlanned = 0
  for (const cid of canalIds) {
    const target  = channelYearTarget[cid] ?? 0
    const profile = channelSeasonality[cid] ?? {}
    const weights = MONTHS.map(m => profile[m] ?? 0)
    const sumW    = weights.reduce((s, w) => s + w, 0)
    const norm    = sumW > 0 ? weights.map(w => w / sumW) : MONTHS.map(() => 1 / MONTHS.length)
    plannedRevenue[cid] = {}
    MONTHS.forEach((m, i) => {
      const v = Math.round(target * norm[i])
      plannedRevenue[cid][m] = v
      totalPlanned += v
    })
  }

  return {
    plannedRevenue, coverageTarget,
    estoqueColecaoPassada: 500, // mesmo fallback hoje usado na tela — não existe semente real pra este campo ainda
    totalPlanned,
    sourceChannelScenarioId: appliedChannel.id,
  }
}

/** Mesma checagem usada em "Solicitar aprovação" na tela — R$500 de tolerância fixa. */
export function computeMonthDivergence(
  metaReceita: number,
  totalPlanned: number,
): { divergence: number; divergencePct: number; hasDivergence: boolean } {
  const divergence    = totalPlanned - metaReceita
  const divergencePct = metaReceita > 0 ? (divergence / metaReceita) * 100 : 0
  const hasDivergence = metaReceita > 0 && Math.abs(divergence) > 500
  return { divergence, divergencePct, hasDivergence }
}
