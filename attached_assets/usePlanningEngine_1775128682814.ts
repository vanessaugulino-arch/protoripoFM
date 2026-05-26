// src/hooks/usePlanningEngine.ts  — v2
// Carrega histórico como estado inicial
// Cenário salvo = snapshot; unlock restaura ao histórico

import { useState, useCallback } from 'react'
import {
  PlanningState, FieldKey, HistoricalBaseline,
  buildStateFromHistorical, recalculate, unlockField, generateScenarioName,
} from '../engine/planningEngine'

export interface SavedScenario {
  name:    string
  year:    number
  version: number
  savedAt: string
  state:   PlanningState
}

export interface UsePlanningEngineReturn {
  current:        PlanningState
  scenarios:      SavedScenario[]
  activeScenario: SavedScenario | null
  isDirty:        boolean
  setField:       (field: FieldKey, value: number | null) => void
  unlock:         (field: FieldKey) => void
  saveScenario:   () => string
  loadScenario:   (s: SavedScenario) => void
  resetToBaseline: () => void
}

export function usePlanningEngine(
  targetYear: number,
  baseline: HistoricalBaseline
): UsePlanningEngineReturn {
  const storageKey = `fashionmind_planning_${targetYear}`

  function loadScenarios(): SavedScenario[] {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') }
    catch { return [] }
  }

  const [scenarios,       setScenarios]      = useState<SavedScenario[]>(loadScenarios)
  const [activeScenario,  setActiveScenario]  = useState<SavedScenario | null>(() => {
    const list = loadScenarios()
    return list.length > 0 ? list[list.length - 1] : null
  })

  // Estado inicial: último cenário salvo (com touched zerado) OU histórico puro
  const [current, setCurrent] = useState<PlanningState>(() => {
    const list = loadScenarios()
    if (list.length > 0) {
      return { ...list[list.length - 1].state, touched: [], baseline }
    }
    return buildStateFromHistorical(baseline)
  })

  const [isDirty, setIsDirty] = useState(false)

  // ── Editar campo ──────────────────────────────────────────
  const setField = useCallback((field: FieldKey, value: number | null) => {
    setCurrent(prev => {
      const touched = value !== null
        ? [...new Set([...prev.touched, field])]
        : prev.touched.filter(f => f !== field)

      return recalculate({
        ...prev,
        values:  { ...prev.values,  [field]: value },
        states:  { ...prev.states,  [field]: 'free' },
        touched,
      })
    })
    setIsDirty(true)
  }, [])

  // ── Desbloquear campo (clique no cadeado) ─────────────────
  const unlock = useCallback((field: FieldKey) => {
    setCurrent(prev => unlockField(prev, field))
    setIsDirty(true)
  }, [])

  // ── Salvar cenário ────────────────────────────────────────
  const saveScenario = useCallback((): string => {
    const count = scenarios.filter(s => s.year === targetYear).length
    const name  = generateScenarioName(targetYear, count)
    const scenario: SavedScenario = {
      name, year: targetYear, version: count + 1,
      savedAt: new Date().toISOString(),
      state:   current,
    }
    const updated = [...scenarios, scenario]
    setScenarios(updated)
    setActiveScenario(scenario)
    setIsDirty(false)
    try { sessionStorage.setItem(storageKey, JSON.stringify(updated)) }
    catch { console.warn('sessionStorage cheio') }
    return name
  }, [current, scenarios, targetYear, storageKey])

  // ── Carregar cenário salvo ────────────────────────────────
  const loadScenario = useCallback((s: SavedScenario) => {
    setActiveScenario(s)
    setCurrent({ ...s.state, touched: [], baseline })
    setIsDirty(false)
  }, [baseline])

  // ── Resetar ao histórico puro ─────────────────────────────
  const resetToBaseline = useCallback(() => {
    setCurrent(buildStateFromHistorical(baseline))
    setActiveScenario(null)
    setIsDirty(false)
  }, [baseline])

  return {
    current, scenarios, activeScenario, isDirty,
    setField, unlock, saveScenario, loadScenario, resetToBaseline,
  }
}
