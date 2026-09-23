// ─── planObservationService.ts ─────────────────────────────────────────────
// Campo de observação (texto livre, sem limite de caracteres) — uma nota
// única por tela (M1-M5) e por temporada/ciclo em edição. O "porquê" das
// decisões do plano, não só os números.
//
// M6 (Engenharia de Sortimento) já tem sua própria tabela por categoria
// (sortiment_category_notes) — não usa este serviço.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export type PlanObservationModule =
  | 'm1_estrategico'
  | 'm2_canal'
  | 'm3_sazonalidade'
  | 'm4_divisao'
  | 'm5_colecao'

export interface PlanObservation {
  note: string
  updatedAt: string | null
  updatedBy: string | null
}

const empty: PlanObservation = { note: '', updatedAt: null, updatedBy: null }

export async function getPlanObservation(
  tenantId: string,
  module: PlanObservationModule,
  seasonKey: string,
): Promise<PlanObservation> {
  if (!tenantId || !seasonKey) return empty
  const { data, error } = await db
    .from('plan_observations')
    .select('note, updated_at, updated_by')
    .eq('tenant_id', tenantId)
    .eq('module', module)
    .eq('season_key', seasonKey)
    .maybeSingle()

  if (error || !data) return empty
  return {
    note: data.note ?? '',
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  }
}

export async function savePlanObservation(
  tenantId: string,
  module: PlanObservationModule,
  seasonKey: string,
  note: string,
  userEmail?: string,
): Promise<void> {
  if (!tenantId || !seasonKey) return
  const { error } = await db
    .from('plan_observations')
    .upsert(
      {
        tenant_id: tenantId,
        module,
        season_key: seasonKey,
        note,
        updated_at: new Date().toISOString(),
        updated_by: userEmail ?? null,
      },
      { onConflict: 'tenant_id,module,season_key' },
    )
  if (error) console.warn('[planObservation] savePlanObservation:', error.message)
}
