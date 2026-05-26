// src/components/PlanningField.tsx
// Componente de input com 3 estados visuais:
// free (editável) | locked (cadeado laranja) | calculated (cinza read-only)

import { Lock } from 'lucide-react'
import { FieldKey, FieldState } from '../engine/planningEngine'

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────
export type FieldFormat = 'currency' | 'percent' | 'number' | 'pieces' | 'days' | 'index'

interface PlanningFieldProps {
  label:      string
  fieldKey:   FieldKey
  value:      number | null
  state:      FieldState
  format?:    FieldFormat
  helpText?:  string          // texto de apoio abaixo do valor (ex: "Base histórica: R$ 175")
  onEdit:     (field: FieldKey, value: number | null) => void
  onUnlock:   (field: FieldKey) => void
}

// ─────────────────────────────────────────────────────────────────
// FORMATAÇÃO DE VALORES
// ─────────────────────────────────────────────────────────────────
function formatDisplay(value: number | null, format: FieldFormat): string {
  if (value === null || isNaN(value)) return '—'

  const locale = 'pt-BR'

  switch (format) {
    case 'currency':
      return `R$ ${value.toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`

    case 'percent':
      return `${value.toLocaleString(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`

    case 'pieces':
      return `${value.toLocaleString(locale, {
        maximumFractionDigits: 0,
      })} pç`

    case 'days':
      return `${value.toLocaleString(locale, {
        maximumFractionDigits: 0,
      })} dias`

    case 'index':
      return value.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

    default:
      return value.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  }
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────
export function PlanningField({
  label,
  fieldKey,
  value,
  state,
  format = 'number',
  helpText,
  onEdit,
  onUnlock,
}: PlanningFieldProps) {
  const isFree       = state === 'free'
  const isLocked     = state === 'locked'
  const isCalculated = state === 'calculated'

  return (
    <div
      className={[
        'rounded-xl p-4 border-2 transition-all duration-200',
        isFree       ? 'bg-white border-transparent shadow-sm'        : '',
        isLocked     ? 'bg-amber-50 border-amber-400 shadow-sm'       : '',
        isCalculated ? 'bg-[#E7E7E6] border-transparent'              : '',
      ].join(' ')}
    >
      {/* Cabeçalho: label + ícone de estado */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={[
            'text-xs uppercase tracking-wide font-medium',
            isCalculated ? 'text-[#28071C]/50' : 'text-[#28071C]/70',
          ].join(' ')}
        >
          {label}
        </span>

        {/* Ícone de estado */}
        {isLocked && (
          <button
            onClick={() => onUnlock(fieldKey)}
            title="Bloqueio automático — clique para reverter"
            className="text-amber-500 hover:text-amber-700 transition-colors"
            aria-label={`Desbloquear ${label}`}
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        {isFree && (
          <div
            className="w-3 h-3 rounded-full border-2 border-[#28071C]/30"
            title="Campo livre — editável"
          />
        )}

        {isCalculated && (
          <div
            className="w-3 h-3 rounded-full bg-[#28071C]/20"
            title="Calculado — derivado das metas"
          />
        )}
      </div>

      {/* Valor: input se free, texto se locked/calculated */}
      {isFree ? (
        <input
          type="number"
          value={value ?? ''}
          onChange={e => {
            const raw = e.target.value
            onEdit(fieldKey, raw === '' ? null : parseFloat(raw))
          }}
          className={[
            'w-full bg-transparent text-[#28071C] text-xl font-semibold',
            'focus:outline-none focus:ring-0',
            'placeholder:text-[#28071C]/25',
            '[appearance:textfield]',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
          ].join(' ')}
          placeholder="0"
          aria-label={label}
        />
      ) : (
        <p
          className={[
            'text-xl font-semibold',
            isLocked     ? 'text-amber-700' : '',
            isCalculated ? 'text-[#28071C]/60' : '',
          ].join(' ')}
        >
          {formatDisplay(value, format)}
        </p>
      )}

      {/* Texto de apoio (base histórica, fonte etc.) */}
      {helpText && (
        <p className="mt-1 text-xs text-[#28071C]/50">
          {helpText}
        </p>
      )}

      {/* Badge de bloqueio */}
      {isLocked && (
        <p className="mt-1 text-xs text-amber-600 font-medium">
          Calculado automaticamente — clique no 🔒 para reverter
        </p>
      )}
    </div>
  )
}
