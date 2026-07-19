// ─── SystemPresentation.tsx — redirect shim ────────────────────────────────
// O conteúdo desta tela foi migrado para Onboarding.tsx (fluxo unificado).
// Esta rota existe apenas para compatibilidade com o Login.tsx que ainda
// roteia para /presentation em alguns casos.
// Comportamento: marca o flag fashionmind_presentation_seen e redireciona
// imediatamente para /onboarding (que agora contém todas as telas).
// ────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { useNavigate } from 'react-router'

export default function SystemPresentation() {
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.setItem('fashionmind_presentation_seen', 'true')
    navigate('/onboarding', { replace: true })
  }, [navigate])

  return null
}
