// src/components/PlanningField.tsx
// v3 — 3 estados visuais (livre / cadeado laranja / calculado cinza)
//      suporte a campos de orçamento separados (compra vs produção)

import { Lock, RotateCcw } from 'lucide-react'
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
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    case 'percent':
      return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
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

// ─── Variação percentual em relação ao baseline ───────────────────────────
function calcVariation(current: number | null, base: number | null): string | null {
  if (current === null || base === null || base === 0) return null
  const pct = ((current - base) / Math.abs(base)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
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
  const isFree       = state === 'free'
  const isLocked     = state === 'locked'
  const isCalculated = state === 'calculated'

  // Campo calculado selecionado como indicador chave: visual proeminente (branco)
  const isHighlight  = isCalculated && highlightCalc

  const variation = calcVariation(value, baseValue ?? null)

  // Cor da variação
  const varColor = variation
    ? variation.startsWith('+')
      ? 'text-emerald-600'
      : 'text-red-500'
    : ''

  return (
    <div
      className={`
        relative rounded-xl p-3 border-2 transition-all duration-200
        ${isFree       ? 'bg-white border-transparent shadow-sm'                  : ''}
        ${isLocked     ? 'bg-amber-50 border-amber-400 shadow-amber-100'          : ''}
        ${isHighlight  ? 'bg-white border-[#7598CF]/25 shadow-sm'                 : ''}
        ${isCalculated && !isHighlight ? 'bg-[#F2F2F2] border-transparent'        : ''}
        ${className}
      `}
    >
      {/* Header: label + ícone de estado */}
      <div className="flex items-center justify-between mb-1 gap-2">
        <span
          className={`
            text-xs uppercase tracking-wide font-semibold leading-tight
            ${isCalculated && !isHighlight ? 'text-[#28071C]/40' : 'text-[#28071C]/60'}
          `}
        >
          {label}
        </span>

        {/* Ícone de estado */}
        {isLocked && (
          <button
            onClick={() => onUnlock(fieldKey)}
            title="Bloqueio automático — clique para restaurar ao histórico"
            className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}
        {isFree && (
          <div className="flex-shrink-0 w-3 h-3 rounded-full border-2 border-[#28071C]/25" />
        )}
        {isCalculated && (
          <div className={`flex-shrink-0 w-3 h-3 rounded-full ${isHighlight ? 'bg-[#7598CF]/40' : 'bg-[#28071C]/20'}`} />
        )}
      </div>

      {/* Input (free) ou valor exibido (locked / calculated) */}
      {isFree ? (
        <input
          type="number"
          value={value ?? ''}
          onChange={e =>
            onEdit(fieldKey, e.target.value !== '' ? parseFloat(e.target.value) : null)
          }
          className="
            w-full bg-transparent text-[#28071C] text-lg font-bold
            focus:outline-none focus:ring-0
            placeholder:text-[#28071C]/25
            [appearance:textfield]
            [&::-webkit-outer-spin-button]:appearance-none
            [&::-webkit-inner-spin-button]:appearance-none
          "
          placeholder="0"
        />
      ) : (
        <p
          className={`
            text-lg font-bold
            ${isLocked                    ? 'text-amber-700'   : ''}
            ${isHighlight                 ? 'text-[#28071C]/80': ''}
            ${isCalculated && !isHighlight? 'text-[#28071C]/50': ''}
          `}
        >
          {formatValue(value, format)}
        </p>
      )}

      {/* Variação em relação ao histórico */}
      {variation && (
        <span className={`text-xs font-medium mt-1 block ${varColor}`}>
          {variation} vs histórico
        </span>
      )}

      {/* Valor histórico de referência (rodapé discreto) */}
      {baseValue !== null && baseValue !== undefined && (
        <span className="text-xs text-[#28071C]/30 mt-0.5 block">
          Base: {formatValue(baseValue, format)}
        </span>
      )}

      {/* Badge "Bloqueio automático" no cadeado */}
      {isLocked && (
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
