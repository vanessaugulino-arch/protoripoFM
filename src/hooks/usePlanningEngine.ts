// src/hooks/usePlanningEngine.ts
// v4 — write-through Supabase (planning_scenarios) + sessionStorage como cache local

import { useState, useCallback, useEffect, useRef } from 'react'
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
import {
  getCycle,
  saveScenario as dbSaveScenario,
  deleteScenario as dbDeleteScenario,
  listScenarios,
} from '../services/supabase/planningScenarioService'

export interface SavedScenario {
  id?: string            // Supabase id (presente após sync)
  name: string           // ex: "2027-V1"
  year: number
  version: number
  savedAt: string
  state: Omit<PlanningState, 'touched'> & { touched: FieldKey[] }
}

function serializeState(state: PlanningState): SavedScenario['state'] {
  return { ...state, touched: Array.from(state.touched) }
}

function deserializeState(
  saved: SavedScenario['state'],
  baseline: Partial<PlanningValues>
): PlanningState {
  return {
    values:  saved.values as PlanningValues,
    states:  saved.states as Record<FieldKey, FieldState>,
    touched: new Set(saved.touched),
    baseline,
  }
}

export function usePlanningEngine(
  targetYear: number,
  externalBaseline?: Partial<PlanningValues>,
  activeKeys?: string[],
  tenantId?: string,
  userId?: string,
) {
  const storageKey = `fashionmind_planning_${targetYear}`
  const baseline: Partial<PlanningValues> = externalBaseline ?? MOCK_BASELINE

  const loadLocal = (): SavedScenario[] => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  const persistLocal = (list: SavedScenario[]) => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(list)) }
    catch { /* silent */ }
  }

  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadLocal)
  const [synced, setSynced] = useState(false)
  const cycleIdRef = useRef<string | null>(null)

  const buildInitial = (): PlanningState => {
    const saved = loadLocal()
    if (saved.length > 0) return deserializeState(saved[saved.length - 1].state, baseline)
    return buildStateFromBaseline(baseline)
  }

  const [current, setCurrent]       = useState<PlanningState>(buildInitial)
  const [activeScenario, setActive] = useState<SavedScenario | null>(
    scenarios.length > 0 ? scenarios[scenarios.length - 1] : null
  )
  const [isDirty, setIsDirty] = useState(false)

  // Sincronização inicial com Supabase
  useEffect(() => {
    if (!tenantId || synced) return
    setSynced(true)
    ;(async () => {
      try {
        const cycle = await getCycle(tenantId, targetYear)
        if (!cycle) return
        cycleIdRef.current = cycle.id

        const rows = await listScenarios(tenantId, targetYear)
        if (rows.length === 0) return

        const hydrated: SavedScenario[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          year: targetYear,
          version: r.version,
          savedAt: r.created_at,
          state: r.values as SavedScenario['state'],
        }))

        const local = loadLocal()
        if (local.length === 0) {
          setScenarios(hydrated)
          persistLocal(hydrated)
          const last = hydrated[hydrated.length - 1]
          setActive(last)
          // Só restaura o estado salvo se a receita do cenário é compatível com a baseline atual.
          // Se divergir >50%, o cenário foi salvo com dados de fallback (HIST_FALLBACK) —
          // deixamos o reset() do Planning.tsx (acionado por histIsReal) reconstruir current.
          const savedReceita = ((last.state.values ?? {}) as Record<string, number>).receitaBruta ?? 0
          const baseReceita  = baseline.receitaBruta ?? 0
          const isCompatible = baseReceita === 0 ||
            Math.abs(savedReceita - baseReceita) / Math.max(baseReceita, 1) < 0.5
          if (isCompatible) {
            setCurrent(deserializeState(last.state, baseline))
          }
        }
      } catch (err) {
        console.warn('[usePlanningEngine] Supabase sync:', err)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, targetYear])

  const setField = useCallback((field: FieldKey, value: number | null) => {
    setCurrent(prev => {
      const touched = new Set(prev.touched)
      if (value !== null) touched.add(field)
      else touched.delete(field)
      return recalculate({
        ...prev,
        values: { ...prev.values, [field]: value },
        states: { ...prev.states, [field]: 'free' },
        touched,
      }, activeKeys)
    })
    setIsDirty(true)
  }, [activeKeys])

  /**
   * Variante de setField que REINICIA o conjunto "touched" para apenas {field}.
   * Usar quando o campo deve ser tratado como ÚNICO driver (ex: modo % de receita).
   * Garante que soAlterouReceita = true na engine, ativando o scaling proporcional
   * mesmo que o usuário tenha tocado outros campos anteriormente.
   */
  const setFieldAsBase = useCallback((field: FieldKey, value: number | null) => {
    setCurrent(prev => {
      const touched = new Set<FieldKey>()
      if (value !== null) touched.add(field)
      return recalculate({
        ...prev,
        values: { ...prev.values, [field]: value },
        states: { ...prev.states, [field]: 'free' },
        touched,
      }, activeKeys)
    })
    setIsDirty(true)
  }, [activeKeys])

  const unlock = useCallback((field: FieldKey) => {
    setCurrent(prev => unlockField(prev, field, activeKeys))
    setIsDirty(true)
  }, [activeKeys])

  const reset = useCallback(() => {
    setCurrent(resetToBaseline(baseline))
    setIsDirty(false)
  }, [baseline])

  const saveScenario = useCallback((customName?: string): string => {
    const yearScenarios = scenarios.filter(s => s.year === targetYear)
    const name = customName?.trim() || generateScenarioName(targetYear, yearScenarios.length)
    const committed = commitScenarioState(current)

    const scenario: SavedScenario = {
      name,
      year: targetYear,
      version: yearScenarios.length + 1,
      savedAt: new Date().toISOString(),
      state: serializeState(committed),
    }

    const updated = [...scenarios, scenario]
    setScenarios(updated)
    setActive(scenario)
    setCurrent(committed)
    setIsDirty(false)
    persistLocal(updated)

    if (tenantId && cycleIdRef.current) {
      dbSaveScenario(
        tenantId,
        cycleIdRef.current,
        name,
        scenario.version,
        scenario.state as Record<string, unknown>,
        userId
      ).then(row => {
        scenario.id = row.id
        persistLocal(updated)
      }).catch(err => console.warn('[usePlanningEngine] Supabase save:', err))
    }

    return name
  }, [current, scenarios, targetYear, tenantId, userId])

  const loadScenario = useCallback((scenario: SavedScenario) => {
    setActive(scenario)
    setCurrent(deserializeState({ ...scenario.state, touched: [] }, baseline))
    setIsDirty(false)
  }, [baseline])

  const deleteScenario = useCallback((scenarioName: string) => {
    const target = scenarios.find(s => s.name === scenarioName)
    const updated = scenarios.filter(s => s.name !== scenarioName)
    setScenarios(updated)
    if (activeScenario?.name === scenarioName) {
      setActive(updated.length > 0 ? updated[updated.length - 1] : null)
    }
    persistLocal(updated)

    if (tenantId && target?.id) {
      dbDeleteScenario(tenantId, target.id)
        .catch(err => console.warn('[usePlanningEngine] Supabase delete:', err))
    }
  }, [scenarios, activeScenario, tenantId])

  return {
    current, scenarios, activeScenario, isDirty, baseline,
    setField, setFieldAsBase, unlock, reset, saveScenario, loadScenario, deleteScenario,
  }
}
