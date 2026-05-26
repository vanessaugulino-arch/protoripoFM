// src/hooks/usePlanningEngine.ts
// Hook React que conecta o motor de cálculo à tela do Módulo 1
// Gerencia estado, cenários salvos e cache no sessionStorage

import { useState, useCallback } from 'react'
import {
  PlanningState,
  PlanningValues,
  PlanningFieldStates,
  FieldKey,
  INITIAL_VALUES,
  INITIAL_STATES,
  recalculate,
  unlockField,
  generateScenarioName,
} from '../engine/planningEngine'

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────
export interface SavedScenario {
  name:    string   // ex: "2027-V1"
  year:    number
  version: number
  savedAt: string   // ISO string
  state:   PlanningState
}

export interface UsePlanningEngineReturn {
  current:        PlanningState
  scenarios:      SavedScenario[]
  activeScenario: SavedScenario | null
  isDirty:        boolean
  setField:       (field: FieldKey, value: number | null) => void
  unlock:         (field: FieldKey) => void
  saveScenario:   () => string   // retorna o nome gerado ex: "2027-V1"
  loadScenario:   (scenario: SavedScenario) => void
  resetCurrent:   () => void
}

// ─────────────────────────────────────────────────────────────────
// ESTADO INICIAL LIMPO
// ─────────────────────────────────────────────────────────────────
function buildInitialState(): PlanningState {
  return {
    values:  { ...INITIAL_VALUES },
    states:  { ...INITIAL_STATES },
    touched: [],
  }
}

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────
export function usePlanningEngine(targetYear: number): UsePlanningEngineReturn {
  const storageKey = `fashionmind_planning_${targetYear}`

  // Carrega cenários salvos do sessionStorage
  function loadScenarios(): SavedScenario[] {
    try {
      const raw = sessionStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  const [scenarios,      setScenarios]     = useState<SavedScenario[]>(loadScenarios)
  const [activeScenario, setActiveScenario] = useState<SavedScenario | null>(() => {
    const list = loadScenarios()
    return list.length > 0 ? list[list.length - 1] : null
  })
  const [current, setCurrent] = useState<PlanningState>(() => {
    const list = loadScenarios()
    if (list.length > 0) {
      // Carrega o último cenário salvo mas zera o touched
      // para que o usuário comece uma nova edição em cima dele
      return {
        ...list[list.length - 1].state,
        touched: [],
      }
    }
    return buildInitialState()
  })
  const [isDirty, setIsDirty] = useState(false)

  // ── Edição de campo ─────────────────────────────────────────
  const setField = useCallback((field: FieldKey, value: number | null) => {
    setCurrent(prev => {
      // Adiciona ao touched se tem valor, remove se null
      const touched = value !== null
        ? [...new Set([...prev.touched, field])]
        : prev.touched.filter(f => f !== field)

      const next = recalculate({
        ...prev,
        values:  { ...prev.values,  [field]: value },
        states:  { ...prev.states,  [field]: 'free' },
        touched,
      })
      return next
    })
    setIsDirty(true)
  }, [])

  // ── Desbloquear campo (clique no cadeado) ───────────────────
  const unlock = useCallback((field: FieldKey) => {
    setCurrent(prev => unlockField(prev, field))
    setIsDirty(true)
  }, [])

  // ── Salvar cenário ──────────────────────────────────────────
  const saveScenario = useCallback((): string => {
    const versionCount = scenarios.filter(s => s.year === targetYear).length
    const name = generateScenarioName(targetYear, versionCount)

    const newScenario: SavedScenario = {
      name,
      year:    targetYear,
      version: versionCount + 1,
      savedAt: new Date().toISOString(),
      state:   current,
    }

    const updated = [...scenarios, newScenario]
    setScenarios(updated)
    setActiveScenario(newScenario)
    setIsDirty(false)

    // Persiste no sessionStorage
    // TROCAR por supabase.from('scenarios').insert(...) ao integrar banco
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(updated))
    } catch {
      console.warn('sessionStorage cheio — cenário não persistido localmente')
    }

    return name
  }, [current, scenarios, targetYear, storageKey])

  // ── Carregar cenário salvo para edição ──────────────────────
  const loadScenario = useCallback((scenario: SavedScenario) => {
    setActiveScenario(scenario)
    setCurrent({
      ...scenario.state,
      touched: [], // zera touched para nova sessão de edição
    })
    setIsDirty(false)
  }, [])

  // ── Resetar tela para estado limpo ──────────────────────────
  const resetCurrent = useCallback(() => {
    setCurrent(buildInitialState())
    setActiveScenario(null)
    setIsDirty(false)
  }, [])

  return {
    current,
    scenarios,
    activeScenario,
    isDirty,
    setField,
    unlock,
    saveScenario,
    loadScenario,
    resetCurrent,
  }
}
