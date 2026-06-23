import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export interface TourStep {
  targetId: string
  title: string
  content: string
}

interface Props {
  steps: TourStep[]
  onClose: (permanent: boolean) => void
}

const CARD_W = 292
const MARGIN = 12

export function ProductTour({ steps, onClose }: Props) {
  const [current, setCurrent] = useState(0)
  const [noShow, setNoShow] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const step = steps[current]

  const refreshRect = useCallback(() => {
    const el = document.getElementById(step.targetId)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step.targetId])

  useEffect(() => {
    const el = document.getElementById(step.targetId)
    if (el) {
      // Centraliza o elemento no viewport para garantir espaço acima e abaixo
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const t = setTimeout(refreshRect, 350)
      return () => clearTimeout(t)
    }
    refreshRect()
  }, [step.targetId, refreshRect])

  useEffect(() => {
    window.addEventListener('resize', refreshRect)
    window.addEventListener('scroll', refreshRect, true)
    return () => {
      window.removeEventListener('resize', refreshRect)
      window.removeEventListener('scroll', refreshRect, true)
    }
  }, [refreshRect])

  const vw = window.innerWidth
  const vh = window.innerHeight

  // Mede a altura real do balão após render; usa fallback conservador enquanto não existe
  const cardH = cardRef.current?.offsetHeight ?? 270

  let top = vh / 2 - cardH / 2
  let left = vw / 2 - CARD_W / 2

  if (rect) {
    const belowSpace = vh - rect.bottom
    const aboveSpace = rect.top

    if (belowSpace >= cardH + MARGIN) {
      top = rect.bottom + MARGIN
    } else if (aboveSpace >= cardH + MARGIN) {
      top = rect.top - cardH - MARGIN
    } else {
      top = vh / 2 - cardH / 2
    }

    left = rect.left + rect.width / 2 - CARD_W / 2
    left = Math.max(MARGIN, Math.min(left, vw - CARD_W - MARGIN))
  }

  // Garante que o balão nunca sai do viewport verticalmente
  top = Math.max(MARGIN, Math.min(top, vh - cardH - MARGIN))

  return createPortal(
    <div className="fixed inset-0 z-[9000]" style={{ pointerEvents: 'none' }}>
      {/* Backdrop visual — clicks passam para a página */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Anel de destaque no elemento-alvo */}
      {rect && (
        <div
          className="absolute rounded-xl"
          style={{
            top: rect.top - 5,
            left: rect.left - 5,
            width: rect.width + 10,
            height: rect.height + 10,
            border: '2px solid #7598CF',
            boxShadow: '0 0 0 4px rgba(117,152,207,0.25), 0 0 24px rgba(117,152,207,0.15)',
            transition: 'top .25s, left .25s, width .25s, height .25s',
          }}
        />
      )}

      {/* Balão do tour */}
      <div
        ref={cardRef}
        className="absolute bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          top,
          left,
          width: CARD_W,
          pointerEvents: 'auto',
          transition: 'top .25s, left .25s',
        }}
      >
        {/* Tira do topo */}
        <div className="bg-gradient-to-r from-[#7598CF] to-[#9B8CD8] px-4 py-2.5 flex items-center justify-between">
          <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest">
            {current + 1} de {steps.length}
          </span>
          <button
            onClick={() => onClose(noShow)}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Fechar tour"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[#28071C] font-semibold text-sm mb-2">{step.title}</p>
          <p className="text-[#28071C]/60 text-xs leading-relaxed">{step.content}</p>
        </div>

        {/* Dots de progresso */}
        <div className="flex items-center justify-center gap-1.5 py-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-200 ${
                i === current ? 'w-5 h-1.5 bg-[#7598CF]' : 'w-1.5 h-1.5 bg-[#28071C]/15'
              }`}
            />
          ))}
        </div>

        {/* Rodapé */}
        <div className="px-4 pt-2 pb-4 border-t border-[#28071C]/8">
          <label className="flex items-center gap-2 mt-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={noShow}
              onChange={e => setNoShow(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#7598CF] cursor-pointer"
            />
            <span className="text-[11px] text-[#28071C]/45 select-none">Não mostrar novamente</span>
          </label>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrent(s => s - 1)}
              disabled={current === 0}
              className="flex items-center gap-0.5 text-xs text-[#28071C]/40 hover:text-[#28071C] disabled:opacity-0 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Voltar
            </button>
            <button
              onClick={() => {
                if (current < steps.length - 1) {
                  setCurrent(s => s + 1)
                } else {
                  onClose(noShow)
                }
              }}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#28071C] text-white rounded-lg text-xs font-semibold hover:bg-[#28071C]/85 transition-colors"
            >
              {current === steps.length - 1 ? 'Concluir' : 'Próximo'}
              {current < steps.length - 1 && <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
