// src/services/channelScenarioService.ts
// Persists and manages channel planning scenarios for Module 2.
// Storage: localStorage (same pattern as planning engine in Module 1).

export interface ChannelScenarioData {
  percents: Record<string, number>
  channelData: Record<string, Record<string, number>>
}

export interface ChannelScenario {
  id: string
  name: string
  year: number
  savedAt: string
  data: ChannelScenarioData
}

const scenariosKey  = (year: number) => `fashionmind_channel_scenarios_${year}`
const REVIEWED_KEY  = 'fashionmind_channel_reviewed_years'

// ─── Save ─────────────────────────────────────────────────────────────────────

export function saveChannelScenario(
  year: number,
  name: string,
  data: ChannelScenarioData,
): ChannelScenario {
  const scenario: ChannelScenario = {
    id:      `ch_${Date.now()}`,
    name:    name.trim() || `Cenário ${new Date().toLocaleDateString('pt-BR')}`,
    year,
    savedAt: new Date().toISOString(),
    data,
  }
  const existing = listChannelScenarios(year)
  // Cap at 20 scenarios, newest last
  const updated = [...existing, scenario].slice(-20)
  try {
    localStorage.setItem(scenariosKey(year), JSON.stringify(updated))
  } catch {
    console.warn('localStorage unavailable — scenario saved in memory only')
  }
  return scenario
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function listChannelScenarios(year: number): ChannelScenario[] {
  try {
    const raw = localStorage.getItem(scenariosKey(year))
    return raw ? (JSON.parse(raw) as ChannelScenario[]) : []
  } catch {
    return []
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function exportChannelScenarios(year: number, scenarios: ChannelScenario[]): void {
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

// ─── Channel review tracking ──────────────────────────────────────────────────

export function getChannelReviewedYears(): number[] {
  try {
    const raw = localStorage.getItem(REVIEWED_KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export function markYearAsChannelReviewed(year: number): void {
  const reviewed = getChannelReviewedYears()
  if (!reviewed.includes(year)) {
    reviewed.push(year)
    reviewed.sort((a, b) => a - b)
    try {
      localStorage.setItem(REVIEWED_KEY, JSON.stringify(reviewed))
    } catch { /* silent */ }
  }
}
