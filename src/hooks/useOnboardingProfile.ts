// src/hooks/useOnboardingProfile.ts
// Perfil de onboarding (segmentos, canais, origem) com o Supabase como fonte
// canônica. O localStorage só serve como semente para o primeiro paint —
// assim que loadOnboardingProfileFromDb responde, o perfil do banco prevalece,
// mesmo que já houvesse algo no cache local.

import { useEffect, useState } from 'react'
import { getStoredProfile } from '../app/types/onboarding'
import type { OnboardingProfile } from '../app/types/onboarding'
import { loadOnboardingProfileFromDb } from '../services/supabase/onboardingService'

export function useOnboardingProfile(tenantId?: string | null) {
  const [profile, setProfile] = useState<OnboardingProfile | null>(getStoredProfile)
  const [loadedFromDb, setLoadedFromDb] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    loadOnboardingProfileFromDb(tenantId)
      .then(dbProfile => {
        if (cancelled || !dbProfile) return
        setProfile(dbProfile)
        setLoadedFromDb(true)
      })
      .catch(() => { /* mantém o cache local como fallback */ })
    return () => { cancelled = true }
  }, [tenantId])

  return { profile, loadedFromDb }
}
