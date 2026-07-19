// src/components/PlanningField.tsx
// v4 — input com estado local (evita bloqueio na digitação de múltiplos dígitos)
//      estado externo (free/locked/calculated) só é aplicado APÓS onBlur

import { useState, useEffect, useRef } from 'react'
import { Lock } from 'lucide-react'
import { FieldKey, FieldState } from '../engine/planningEngine'

export type FieldFormat =
  | 'currency'   // R$ 1.234.567
  | 'percent'    // 52,0%
  | 'number'     // 4,37
  | 'pieces'     // 14.327 pç
  | 'days'       // 83 dias
  | 'index'      // 4,37x

interface PlanningFieldProps {
  label:          string
  fieldKey:       FieldKey
  value:          number | null
  state:          FieldState
  format?:        FieldFormat
  baseValue?:     number | null   // valor histórico — exibido como referência
  helpText?:      string          // texto de ajuda contextual (tooltip/descrição)
  onEdit:         (field: FieldKey, value: number | null) => void
  onUnlock:       (field: FieldKey) => void
  className?:     string
  highlightCalc?: boolean         // campo calculado selecionado como indicador chave → visual proeminente
}

// ─── Formatação de valores ─────────────────────────────────────────────────
export function formatValue(value: number | null, format: FieldFormat = 'number'): string {
  if (value === null || value === undefined) return '—'
  switch (format) {
    case 'currency':
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'percent':
      return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    case 'pieces':
      return `${Math.round(value).toLocaleString('pt-BR')} pç`
    case 'days':
      return `${Math.round(value).toLocaleString('pt-BR')} dias`
    case 'index':
      return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
    default:
      return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

// ─── Parseador de número no formato pt-BR ou en-US ───────────────────────
function parseInputValue(str: string): number | null {
  if (str.trim() === '') return null
  // Substitui vírgula decimal por ponto (pt-BR → en)
  // Remove separadores de milhar (ponto antes de 3 dígitos é milhar em pt-BR)
  const normalized = str
    .replace(/\./g, '')   // remove pontos (separador de milhar)
    .replace(',', '.')    // troca vírgula decimal por ponto
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

// ─── Variação percentual em relação ao baseline ───────────────────────────
function calcVariation(current: number | null, base: number | null): string | null {
  if (current === null || base === null || base === 0) return null
  const pct     = ((current - base) / Math.abs(base)) * 100
  const sign    = pct >= 0 ? '+' : '-'
  const abs     = Math.abs(pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${sign}${abs}%`
}

// ─── Componente ───────────────────────────────────────────────────────────
export function PlanningField({
  label,
  fieldKey,
  value,
  state,
  format = 'number',
  baseValue,
  onEdit,
  onUnlock,
  className = '',
  highlightCalc = false,
}: PlanningFieldProps) {
  // ── Estado local do input ─────────────────────────────────────────────
  // Enquanto o usuário está digitando (hasFocus=true), exibimos localStr e
  // NÃO chamamos onEdit. Isso evita que o engine trave o campo mid-digitação.
  // Só chamamos onEdit no blur ou ao pressionar Enter/Tab E somente se o valor mudou.
  const [localStr,   setLocalStr]   = useState<string>('')
  const [hasFocus,   setHasFocus]   = useState(false)
  const [hasChanged, setHasChanged] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Helper: converte número para string pt-BR sem separador de milhar (para edição)
  const toEditStr = (n: number): string =>
    n.toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 6 })

  // Sincroniza localStr quando value muda externamente (reset, loadScenario…)
  // mas NUNCA enquanto o usuário está com foco no campo.
  useEffect(() => {
    if (!hasFocus) {
      setLocalStr(value !== null ? toEditStr(value) : '')
    }
  }, [value, hasFocus])

  const handleFocus = () => {
    // Campos 'calculated' não são editáveis diretamente — ignorar foco
    if (state === 'calculated') return
    setHasFocus(true)
    setHasChanged(false)
    // Mostra o número em formato pt-BR sem separador de milhar (facilita edição)
    setLocalStr(value !== null ? toEditStr(value) : '')
    // Seleciona tudo para facilitar substituição
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalStr(e.target.value)
    setHasChanged(true)
  }

  const commitValue = () => {
    const parsed = parseInputValue(localStr)
    onEdit(fieldKey, parsed)
  }

  const handleBlur = () => {
    setHasFocus(false)
    // Só chama onEdit se o usuário realmente alterou algo (evita recálculos desnecessários)
    if (hasChanged) {
      commitValue()
      setHasChanged(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Tab já vai causar blur; Enter commitamos e tiramos foco
      if (e.key === 'Enter') {
        e.preventDefault()
        if (hasChanged) commitValue()
        setHasChanged(false)
        inputRef.current?.blur()
      }
    } else if (e.key === 'Escape') {
      // Cancela a edição e restaura o valor anterior
      setLocalStr(value !== null ? toEditStr(value) : '')
      setHasChanged(false)
      inputRef.current?.blur()
    }
  }

  const isFree       = state === 'free'
  const isLocked     = state === 'locked'
  const isCalculated = state === 'calculated'
  const isHighlight  = isCalculated && highlightCalc

  // Campos 'calculated' nunca mostram input (não editáveis diretamente).
  // Campos 'locked' e 'free' mostram input quando com foco (evita bloqueio mid-digitação).
  const showInput = isFree || (hasFocus && !isCalculated)

  const variation = calcVariation(value, baseValue ?? null)
  const varColor  = variation
    ? variation.startsWith('+') ? 'text-emerald-600' : 'text-red-500'
    : ''

  return (
    <div
      className={`
        relative rounded-xl p-3 border-2 transition-all duration-200
        ${(isFree || hasFocus)   ? 'bg-white border-transparent shadow-sm'                  : ''}
        ${isLocked && !hasFocus  ? 'bg-amber-50 border-amber-400 shadow-amber-100'          : ''}
        ${isHighlight            ? 'bg-white border-[#7598CF]/25 shadow-sm'                 : ''}
        ${isCalculated && !isHighlight && !hasFocus ? 'bg-[#F2F2F2] border-transparent'    : ''}
        ${className}
      `}
    >
      {/* Header: label + ícone de estado */}
      <div className="flex items-center justify-between mb-1 gap-2">
        <span
          className={`
            text-xs uppercase tracking-wide font-semibold leading-tight
            ${isCalculated && !isHighlight && !hasFocus ? 'text-[#28071C]/40' : 'text-[#28071C]/60'}
          `}
        >
          {label}
        </span>

        {/* Ícone de estado */}
        {isLocked && !hasFocus && (
          <button
            onClick={() => onUnlock(fieldKey)}
            title="Bloqueio automático — clique para restaurar ao histórico"
            className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}
        {(isFree || hasFocus) && (
          <div className="flex-shrink-0 w-3 h-3 rounded-full border-2 border-[#28071C]/25" />
        )}
        {isCalculated && !hasFocus && (
          <div className={`flex-shrink-0 w-3 h-3 rounded-full ${isHighlight ? 'bg-[#7598CF]/40' : 'bg-[#28071C]/20'}`} />
        )}
      </div>

      {/* Input ou valor formatado */}
      {showInput ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={localStr}
          placeholder="0"
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="
            w-full bg-transparent text-[#28071C] text-lg font-bold
            focus:outline-none focus:ring-0
            placeholder:text-[#28071C]/25
          "
        />
      ) : (
        <p
          onClick={() => {
            // Clicar num campo locked/calculated que esteja em modo "livre"
            // após unlock exibe o input — só precisa de onUnlock.
            // Para calculated puro: não editável via clique.
            if (isLocked) onUnlock(fieldKey)
          }}
          className={`
            text-lg font-bold cursor-default
            ${isLocked                     ? 'text-amber-700 cursor-pointer'   : ''}
            ${isHighlight                  ? 'text-[#28071C]/80'               : ''}
            ${isCalculated && !isHighlight ? 'text-[#28071C]/50'               : ''}
          `}
        >
          {formatValue(value, format)}
        </p>
      )}

      {/* Variação em relação ao histórico */}
      {variation && !hasFocus && (
        <span className={`text-xs font-medium mt-1 block ${varColor}`}>
          {variation} vs histórico
        </span>
      )}

      {/* Valor histórico de referência (rodapé discreto) */}
      {baseValue !== null && baseValue !== undefined && !hasFocus && (
        <span className="text-xs text-[#28071C]/30 mt-0.5 block">
          Base: {formatValue(baseValue, format)}
        </span>
      )}

      {/* Badge "Bloqueio automático" no cadeado */}
      {isLocked && !hasFocus && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
          <Lock className="w-3 h-3" />
          Bloqueio automático
        </span>
      )}
    </div>
  )
}

// ─── Legenda dos 3 estados (para exibir na tela) ──────────────────────────
export function PlanningLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-[#28071C]/50">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full border-2 border-[#28071C]/25 inline-block" />
        Editável
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-amber-400" />
        Bloqueio automático
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-[#28071C]/20 inline-block" />
        Calculado
      </span>
    </div>
  )
}
