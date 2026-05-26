// src/hooks/useMacroData.ts
// Cache de 4h no sessionStorage — Focus atualiza 1x por dia
import { useEffect, useState } from 'react'
import { getAllMacroData, MacroData } from '../services/macroData'

const CACHE_KEY    = 'fashionmind_macroData'
const CACHE_AT_KEY = 'fashionmind_macroDataAt'
const CACHE_TTL    = 4 * 60 * 60 * 1000 // 4 horas em ms

interface UseMacroDataReturn {
  data:        MacroData | null
  loading:     boolean
  error:       string | null
  lastUpdate:  string | null
  refetch:     () => void
}

export function useMacroData(): UseMacroDataReturn {
  const [data,       setData]       = useState<MacroData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [trigger,    setTrigger]    = useState(0)

  const refetch = () => {
    sessionStorage.removeItem(CACHE_KEY)
    sessionStorage.removeItem(CACHE_AT_KEY)
    setTrigger(t => t + 1)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    // Verifica cache
    const cached   = sessionStorage.getItem(CACHE_KEY)
    const cachedAt = sessionStorage.getItem(CACHE_AT_KEY)

    if (cached && cachedAt) {
      const age = Date.now() - parseInt(cachedAt)
      if (age < CACHE_TTL) {
        setData(JSON.parse(cached))
        setLastUpdate(new Date(parseInt(cachedAt)).toLocaleString('pt-BR'))
        setLoading(false)
        return
      }
    }

    // Busca dados frescos
    getAllMacroData()
      .then(result => {
        if (cancelled) return
        setData(result)
        const now = Date.now()
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(result))
        sessionStorage.setItem(CACHE_AT_KEY, now.toString())
        setLastUpdate(new Date(now).toLocaleString('pt-BR'))
      })
      .catch(() => {
        if (cancelled) return
        setError('Não foi possível buscar os dados macroeconômicos. Tente novamente.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [trigger])

  return { data, loading, error, lastUpdate, refetch }
}
