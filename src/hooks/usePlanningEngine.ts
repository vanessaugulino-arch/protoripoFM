// src/hooks/usePlanningEngine.ts
// v3 — baseline histórico, unlock restaura ao histórico, cenários com versão

import { useState, useCallback } from 'react'
import {
  PlanningState,
  PlanningValues,
  FieldKey,
  FieldState,
  recalculate,
  unlockField,
  resetToBaseline,
  commitScenarioState,
  generateScenarioName,
  buildStateFromBaseline,
  MOCK_BASELINE,
} from '../engine/planningEngine'

export interface SavedScenario {
  name: string        // ex: "2027-V1"
  year: number
  version: number
  savedAt: string
  state: Omit<PlanningState, 'touched'> & { touched: FieldKey[] }
}

// ─── Serializa/desserializa o Set de touched para JSON ────────────────────
function serializeState(state: PlanningState): SavedScenario['state'] {
  return {
    ...state,
    touched: Array.from(state.touched),
  }
}

function deserializeState(
  saved: SavedScenario['state'],
  baseline: Partial<PlanningValues>
): PlanningState {
  return {
    values:   saved.values as PlanningValues,
    states:   saved.states as Record<FieldKey, FieldState>,
    touched:  new Set(saved.touched),
    baseline,
  }
}

// ─── Hook principal ────────────────────────────────────────────────────────
export function usePlanningEngine(
  targetYear: number,
  externalBaseline?: Partial<PlanningValues>,  // quando vier do banco real, passa aqui
  activeKeys?: string[]                         // indicadores ativos (para engine selection-aware)
) {
  const storageKey = `fashionmind_planning_${targetYear}`

  // Baseline: usa externo (banco real) ou mock hipotético para validação
  const baseline: Partial<PlanningValues> = externalBaseline ?? MOCK_BASELINE

  // Carrega cenários salvos
  const loadScenarios = (): SavedScenario[] => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadScenarios)

  // Estado atual: último cenário salvo ou baseline limpo
  const buildInitial = (): PlanningState => {
    const saved = loadScenarios()
    if (saved.length > 0) {
      const last = saved[saved.length - 1]
      return deserializeState(last.state, baseline)
    }
    return buildStateFromBaseline(baseline)
  }

  const [current, setCurrent]       = useState<PlanningState>(buildInitial)
  const [activeScenario, setActive] = useState<SavedScenario | null>(
    scenarios.length > 0 ? scenarios[scenarios.length - 1] : null
  )
  const [isDirty, setIsDirty] = useState(false)

  // ── Usuário edita um campo ───────────────────────────────────────────────
  const setField = useCallback((field: FieldKey, value: number | null) => {
    setCurrent(prev => {
      const touched = new Set(prev.touched)
      if (value !== null) {
        touched.add(field)
      } else {
        touched.delete(field)
      }
      return recalculate({
        ...prev,
        values: { ...prev.values, [field]: value },
        states: { ...prev.states, [field]: 'free' },
        touched,
      }, activeKeys)
    })
    setIsDirty(true)
  }, [activeKeys])

  // ── Usuário clica no cadeado: restaura ao valor histórico ────────────────
  const unlock = useCallback((field: FieldKey) => {
    setCurrent(prev => unlockField(prev, field, activeKeys))
    setIsDirty(true)
  }, [activeKeys])

  // ── Reseta tudo ao baseline ──────────────────────────────────────────────
  const reset = useCallback(() => {
    setCurrent(resetToBaseline(baseline))
    setIsDirty(false)
  }, [baseline])

  // ── Salva cenário ────────────────────────────────────────────────────────
  const saveScenario = useCallback((customName?: string): string => {
    const yearScenarios = scenarios.filter(s => s.year === targetYear)
    const name = customName?.trim() || generateScenarioName(targetYear, yearScenarios.length)

    // Commita o estado atual: locked/calculated → free, touched zerado.
    // O snapshot salvo já reflete os valores da simulação com campos livres —
    // ao recarregar, o usuário retoma editando a partir de um slate limpo.
    const committed = commitScenarioState(current)

    const scenario: SavedScenario = {
      name,
      year:    targetYear,
      version: yearScenarios.length + 1,
      savedAt: new Date().toISOString(),
      state:   serializeState(committed),
    }

    const updated = [...scenarios, scenario]
    setScenarios(updated)
    setActive(scenario)
    setCurrent(committed)   // painel: todos os campos voltam a free com valores atualizados
    setIsDirty(false)

    // Persiste — troque sessionStorage por supabase.from('scenarios').insert(...)
    // quando o banco estiver pronto. Não muda nada no engine.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(updated))
    } catch {
      console.warn('sessionStorage indisponível — cenário salvo apenas em memória')
    }

    return name
  }, [current, scenarios, targetYear, storageKey])

  // ── Carrega um cenário salvo para edição ─────────────────────────────────
  const loadScenario = useCallback((scenario: SavedScenario) => {
    setActive(scenario)
    // Restaura com touched zerado — nenhum campo travado ao reabrir
    const restored = deserializeState(
      { ...scenario.state, touched: [] },
      baseline
    )
    setCurrent(restored)
    setIsDirty(false)
  }, [baseline])

  // ── Deleta um cenário salvo ───────────────────────────────────────────────
  const deleteScenario = useCallback((scenarioName: string) => {
    const updated = scenarios.filter(s => s.name !== scenarioName)
    setScenarios(updated)
    if (activeScenario?.name === scenarioName) {
      setActive(updated.length > 0 ? updated[updated.length - 1] : null)
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(updated))
    } catch { /* silent */ }
  }, [scenarios, activeScenario, storageKey])

  return {
    // Estado
    current,
    scenarios,
    activeScenario,
    isDirty,
    baseline,

    // Ações
    setField,
    unlock,
    reset,
    saveScenario,
    loadScenario,
    deleteScenario,
  }
}
