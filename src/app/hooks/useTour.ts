import { useState } from 'react'

function permanentKey(tourId: string): string {
  try {
    const raw = sessionStorage.getItem('currentUser')
    const user = raw ? JSON.parse(raw) : {}
    const uid = user.id ?? user.email ?? 'anon'
    return `fashionmind_tour_${uid}_${tourId}`
  } catch {
    return `fashionmind_tour_anon_${tourId}`
  }
}

function sessionKey(tourId: string): string {
  return `fashionmind_tour_session_${tourId}`
}

export function useTour(tourId: string) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      // Se dispensado permanentemente → nunca abre
      if (localStorage.getItem(permanentKey(tourId)) === 'dismissed') return false
      // Se já foi exibido nesta sessão → não reabre automaticamente
      if (sessionStorage.getItem(sessionKey(tourId)) === 'seen') return false
      // Primeira exibição da sessão: marca imediatamente para não reabrir
      // ao navegar para outro módulo e voltar
      sessionStorage.setItem(sessionKey(tourId), 'seen')
      return true
    } catch {
      return true
    }
  })

  function dismiss(permanent: boolean) {
    if (permanent) {
      try { localStorage.setItem(permanentKey(tourId), 'dismissed') } catch {}
    }
    setIsOpen(false)
  }

  function reopen() {
    // Reabertura manual (botão ?) limpa o flag de sessão para que o tour
    // apareça mesmo que já tenha sido visto nesta sessão
    try { sessionStorage.removeItem(sessionKey(tourId)) } catch {}
    setIsOpen(true)
  }

  return { isOpen, dismiss, reopen }
}
