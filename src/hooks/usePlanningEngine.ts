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
  const [syncError, setSyncError] = useState<string | null>(null)
  const cycleIdRef = useRef<string | null>(null)
  const isDirtyRef = useRef(false)

  const buildInitial = (): PlanningState => {
    const saved = loadLocal()
    if (saved.length > 0) return deserializeState(saved[saved.length - 1].state, baseline)
    return buildStateFromBaseline(baseline)
  }

  const [current, setCurrent]       = useState<PlanningState>(buildInitial)
  const [activeScenario, setActive] = useState<SavedScenario | null>(
    scenarios.length > 0 ? scenarios[scenarios.length - 1] : null
  )
  const [isDirty, setIsDirtyState] = useState(false)
  const setIsDirty = useCallback((v: boolean) => {
    isDirtyRef.current = v
    setIsDirtyState(v)
  }, [])

  // Sincronização inicial com Supabase — o banco é a fonte de verdade.
  // O cache em sessionStorage serve só para o primeiro paint (antes da resposta do banco);
  // assim que o banco responde, ele SEMPRE prevalece, mesmo que o cache local já tivesse algo.
  useEffect(() => {
    if (!tenantId || synced) return
    setSynced(true)
    ;(async () => {
      try {
        const cycle = await getCycle(tenantId, targetYear)
        if (!cycle) {
          // Sem ciclo ainda no banco: não há nada oficial para refletir — mantém o cache
          // local (pode ser um rascunho ainda não vinculado a um ciclo).
          return
        }
        cycleIdRef.current = cycle.id

        const rows = await listScenarios(tenantId, targetYear)
        const hydrated: SavedScenario[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          year: targetYear,
          version: r.version,
          savedAt: r.created_at,
          state: r.values as SavedScenario['state'],
        }))

        setSyncError(null)
        setScenarios(hydrated)
        persistLocal(hydrated)

        if (hydrated.length === 0) {
          // Banco confirma que não há cenário salvo — o cache local não representa
          // nada real, então não deixamos a tela continuar mostrando um cenário "salvo".
          if (!isDirtyRef.current) {
            setActive(null)
            setCurrent(buildStateFromBaseline(baseline))
          }
          return
        }

        const last = hydrated[hydrated.length - 1]
        if (isDirtyRef.current) {
          // Usuário já está editando algo não salvo: não descarta a edição em andamento,
          // só atualiza a lista de cenários salvos.
          setActive(prev => prev ?? last)
          return
        }
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
      } catch (err) {
        console.warn('[usePlanningEngine] Supabase sync:', err)
        setSyncError('Não foi possível confirmar os cenários salvos com o banco de dados. Mostrando a última versão em cache neste navegador — ela pode estar desatualizada.')
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

  const [saveError, setSaveError] = useState<string | null>(null)

  // Retorna { name, dbSaved }: dbSaved=false significa que o cenário está visível na tela
  // (e no cache local) mas NÃO foi confirmado no banco — o chamador deve avisar o usuário
  // em vez de deixar a tela dizer "salvo" silenciosamente sobre uma gravação que falhou.
  const saveScenario = useCallback(async (customName?: string): Promise<{ name: string; dbSaved: boolean }> => {
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

    if (!tenantId || !cycleIdRef.current) {
      setSaveError('Cenário salvo apenas neste navegador — ainda não há um ciclo de planejamento criado no banco para vincular a ele.')
      return { name, dbSaved: false }
    }

    try {
      const row = await dbSaveScenario(
        tenantId,
        cycleIdRef.current,
        name,
        scenario.version,
        scenario.state as Record<string, unknown>,
        userId
      )
      scenario.id = row.id
      persistLocal(updated)
      setSaveError(null)
      return { name, dbSaved: true }
    } catch (err) {
      console.warn('[usePlanningEngine] Supabase save:', err)
      setSaveError('O cenário ficou visível na tela, mas não foi possível confirmar a gravação no banco de dados. Tente salvar novamente.')
      return { name, dbSaved: false }
    }
  }, [current, scenarios, targetYear, tenantId, userId])

  const loadScenario = useCallback((scenario: SavedScenario) => {
    setActive(scenario)
    setCurrent(deserializeState({ ...scenario.state, touched: [] }, baseline))
    setIsDirty(false)
  }, [baseline])

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteScenario = useCallback(async (scenarioName: string): Promise<boolean> => {
    const target = scenarios.find(s => s.name === scenarioName)
    const updated = scenarios.filter(s => s.name !== scenarioName)
    setScenarios(updated)
    if (activeScenario?.name === scenarioName) {
      setActive(updated.length > 0 ? updated[updated.length - 1] : null)
    }
    persistLocal(updated)

    if (!tenantId || !target?.id) return true

    try {
      await dbDeleteScenario(tenantId, target.id)
      setDeleteError(null)
      return true
    } catch (err) {
      console.warn('[usePlanningEngine] Supabase delete:', err)
      setDeleteError('O cenário foi removido da tela, mas não foi possível confirmar a exclusão no banco de dados — ele pode reaparecer em um novo acesso.')
      return false
    }
  }, [scenarios, activeScenario, tenantId])

  return {
    current, scenarios, activeScenario, isDirty, baseline,
    setField, setFieldAsBase, unlock, reset, saveScenario, loadScenario, deleteScenario,
    syncError, saveError, deleteError,
  }
}
