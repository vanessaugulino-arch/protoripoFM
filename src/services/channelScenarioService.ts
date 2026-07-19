// src/services/channelScenarioService.ts
// Re-exporta tudo do serviço Supabase canônico.
// Mantido por compatibilidade de import em ChannelPlanning.tsx (exportChannelScenarios).
//
// NÃO usa localStorage.

export type { ChannelScenarioData, ChannelScenario } from './supabase/channelScenarioService'
export {
  listChannelScenarios,
  saveChannelScenario,
  deleteChannelScenario,
  applyChannelScenario,
  getReviewedYears,
} from './supabase/channelScenarioService'

// ─── Export de cenários para download (não precisa de DB) ─────────────────────

export interface ChannelScenarioExport {
  id: string
  name: string
  year: number
  saved_at: string
  percents: Record<string, number>
  channel_data: Record<string, Record<string, number>>
}

export function exportChannelScenarios(year: number, scenarios: ChannelScenarioExport[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    year,
    scenarios,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `plano_canais_${year}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Compatibilidade: anos revisados ─────────────────────────────────────────
// Antes lia do localStorage. Agora é alias de getReviewedYears do serviço Supabase.
// Dashboard deve chamar getReviewedYears(tenantId) diretamente — mantido só para
// evitar quebrar imports existentes.

export function getChannelReviewedYears(): number[] {
  // Retorna vazio — chamadores devem migrar para getReviewedYears(tenantId) async
  return []
}
