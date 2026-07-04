// src/app/components/ColorBankCard.tsx
// Card de Banco de Cores — aparece em OperationSettings
//
// Mostra as cores dos produtos do tenant que ainda não foram classificadas.
// Para cada cor: combobox de família + combobox de intensidade.
// Ao salvar, grava no banco global (color_bank) e retro-alimenta products.color_group.
//
// Combobox = input text com datalist → permite selecionar existente OU digitar novo.

import { useState, useEffect, useRef, useId } from 'react'
import {
  Palette, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  Save, RefreshCw, X, Info, Sparkles,
} from 'lucide-react'
import {
  getUnclassifiedColors,
  getColorFamilias,
  getColorIntensidades,
  classifyColors,
  getColorBankStats,
  type UnclassifiedColor,
  type ClassifyPayload,
  type ColorBankStats,
} from '../../services/supabase/colorBankService'

// ─── Famílias e intensidades padrão (fallback quando o banco está vazio) ───────
const DEFAULT_FAMILIAS = [
  'Azul', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Laranja',
  'Roxo', 'Branco', 'Preto', 'Cinza', 'Bege', 'Marrom',
  'Caramelo', 'Dourado', 'Prata', 'Estampado',
]
const DEFAULT_INTENSIDADES = [
  'Claro', 'Médio', 'Escuro', 'Pastel', 'Neon',
  'Mescla', 'Metálico', 'Marinho', 'Royal', 'Floral', 'Xadrez', 'Listrado',
  'Terra', 'Puro', 'Gelo', 'Cru', 'Jeans', 'Turquesa',
]

// ─── Combobox com datalist ────────────────────────────────────────────────────
interface ComboboxProps {
  value:       string
  onChange:    (v: string) => void
  options:     string[]
  placeholder: string
  listId:      string
}

function Combobox({ value, onChange, options, placeholder, listId }: ComboboxProps) {
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          w-full px-2.5 py-1.5 text-sm border border-[#28071C]/15 rounded-lg
          text-[#28071C] placeholder-[#28071C]/30
          focus:outline-none focus:border-[#7598CF] focus:ring-1 focus:ring-[#7598CF]/20
          bg-white transition-colors
        "
      />
      <datalist id={listId}>
        {options.map(opt => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  )
}

// ─── Linha de cor ─────────────────────────────────────────────────────────────
interface ColorRowProps {
  item:          UnclassifiedColor
  familia:       string
  intensidade:   string
  onFamilia:     (v: string) => void
  onIntensidade: (v: string) => void
  familias:      string[]
  intensidades:  string[]
  index:         number
}

function ColorRow({
  item, familia, intensidade, onFamilia, onIntensidade,
  familias, intensidades, index,
}: ColorRowProps) {
  const uid = useId()

  const swatch = getSwatchColor(item.cor_norm)
  const colorGroup = familia && intensidade ? `${familia} ${intensidade}` : ''

  return (
    <div className={`
      grid grid-cols-[28px_1fr_200px_200px_140px] gap-3 items-center
      px-4 py-2.5 border-b border-[#28071C]/6 last:border-0
      ${index % 2 === 0 ? '' : 'bg-[#28071C]/1.5'}
      hover:bg-[#7598CF]/4 transition-colors
    `}>
      {/* Swatch */}
      <div
        className="w-6 h-6 rounded-md border border-[#28071C]/12 flex-shrink-0"
        style={{ backgroundColor: swatch }}
        title={item.cor_bruta}
      />

      {/* Cor bruta + badge de frequência */}
      <div className="min-w-0">
        <span className="text-[#28071C] text-sm font-medium truncate block">{item.cor_bruta}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-[#28071C]/40">
            {item.count} produto{item.count !== 1 ? 's' : ''}
          </span>
          {item.already_in_bank && (
            <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              no banco global
            </span>
          )}
        </div>
      </div>

      {/* Família */}
      <Combobox
        value={familia}
        onChange={onFamilia}
        options={familias}
        placeholder="Família de cor…"
        listId={`${uid}-familia`}
      />

      {/* Intensidade */}
      <Combobox
        value={intensidade}
        onChange={onIntensidade}
        options={intensidades}
        placeholder="Intensidade…"
        listId={`${uid}-intensidade`}
      />

      {/* Preview do color_group */}
      <div className="text-[11px]">
        {colorGroup ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#7598CF]/10 text-[#7598CF] rounded-lg font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            {colorGroup}
          </span>
        ) : (
          <span className="text-[#28071C]/25 italic">aguardando…</span>
        )}
      </div>
    </div>
  )
}

// ─── Mapeamento de swatches aproximados por cor_norm ─────────────────────────
function getSwatchColor(corNorm: string): string {
  const map: Record<string, string> = {
    azul: '#3B82F6', marinho: '#1E3A5F', royal: '#4169E1', jeans: '#6B8BAE',
    turquesa: '#40E0D0', serenity: '#B0C4DE',
    vermelho: '#EF4444', vinho: '#722F37', bordo: '#800020', coral: '#FF7F7F',
    terracota: '#C0632D', ferrugem: '#B7410E', telha: '#B04020',
    verde: '#22C55E', militar: '#4B5320', menta: '#98FF98', musgo: '#8A9A5B', lima: '#BFFF00',
    amarelo: '#EAB308', mostarda: '#DFBE00', champagne: '#F7E7CE',
    rosa: '#EC4899', rose: '#FFC0CB', pink: '#FF69B4', blush: '#DE5D83', fuchsia: '#FF00FF',
    laranja: '#F97316', salmao: '#FA8072', peach: '#FFDAB9',
    roxo: '#A855F7', lilas: '#D8BFD8', uva: '#800080', lavanda: '#E6E6FA',
    branco: '#F8F8F8', 'off-white': '#FAF0E6', cru: '#FDF5E6',
    preto: '#1C1C1C', cinza: '#9CA3AF', grafite: '#4B5563', mescla: '#B0B0B0', prata: '#C0C0C0',
    bege: '#F5F0E8', areia: '#F4A460', caramelo: '#C68642', marrom: '#795548',
    chocolate: '#3C2005', dourado: '#FFD700', ouro: '#FFD700', bronze: '#CD7F32',
  }
  // Tenta match exato, senão busca prefixo
  if (map[corNorm]) return map[corNorm]
  for (const [key, val] of Object.entries(map)) {
    if (corNorm.startsWith(key) || key.startsWith(corNorm)) return val
  }
  return '#E5E7EB'
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface ColorBankCardProps {
  tenantId: string
}

export function ColorBankCard({ tenantId }: ColorBankCardProps) {
  const [isExpanded,  setIsExpanded]  = useState(false)
  const [isLoading,   setIsLoading]   = useState(false)
  const [isSaving,    setIsSaving]    = useState(false)

  const [items,       setItems]       = useState<UnclassifiedColor[]>([])
  const [stats,       setStats]       = useState<ColorBankStats | null>(null)
  const [familias,    setFamilias]    = useState<string[]>(DEFAULT_FAMILIAS)
  const [intensidades,setIntensidades]= useState<string[]>(DEFAULT_INTENSIDADES)

  // Mapa de classificações em andamento: cor_norm → { familia, intensidade }
  const [draft, setDraft] = useState<Map<string, { familia: string; intensidade: string }>>(new Map())

  const [saveResult, setSaveResult] = useState<{
    classified: number; errors?: string[]
  } | null>(null)

  const firstLoad = useRef(false)

  // ── Carrega dados quando expande ────────────────────────────────────────────
  const loadData = async () => {
    setIsLoading(true)
    setSaveResult(null)
    try {
      const [unclassified, stats, fams, ints] = await Promise.all([
        getUnclassifiedColors(tenantId),
        getColorBankStats(tenantId),
        getColorFamilias(),
        getColorIntensidades(),
      ])

      setItems(unclassified)
      setStats(stats)
      if (fams.length > 0) setFamilias([...new Set([...fams, ...DEFAULT_FAMILIAS])])
      if (ints.length > 0) setIntensidades([...new Set([...ints, ...DEFAULT_INTENSIDADES])])

      // Pré-preenche o draft com classificações já existentes no banco global
      const newDraft = new Map<string, { familia: string; intensidade: string }>()
      for (const item of unclassified) {
        if (item.existing_entry) {
          newDraft.set(item.cor_norm, {
            familia:     item.existing_entry.familia,
            intensidade: item.existing_entry.intensidade,
          })
        }
      }
      setDraft(newDraft)
    } catch (err) {
      console.error('[ColorBankCard] Erro ao carregar:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Carrega stats mesmo sem expandir para mostrar o badge
  useEffect(() => {
    if (firstLoad.current) return
    firstLoad.current = true
    getColorBankStats(tenantId)
      .then(setStats)
      .catch(() => {})
  }, [tenantId])

  const handleExpand = () => {
    const next = !isExpanded
    setIsExpanded(next)
    if (next) loadData()
  }

  // ── Atualiza o draft ────────────────────────────────────────────────────────
  const setDraftField = (corNorm: string, field: 'familia' | 'intensidade', value: string) => {
    setDraft(prev => {
      const next = new Map(prev)
      const cur  = next.get(corNorm) ?? { familia: '', intensidade: '' }
      next.set(corNorm, { ...cur, [field]: value })
      return next
    })
  }

  // ── Salva ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const payload: ClassifyPayload[] = []
    for (const item of items) {
      const d = draft.get(item.cor_norm)
      if (d?.familia && d?.intensidade) {
        payload.push({
          cor_norm:    item.cor_norm,
          cor_display: item.cor_bruta,
          familia:     d.familia,
          intensidade: d.intensidade,
        })
      }
    }
    if (payload.length === 0) return

    setIsSaving(true)
    try {
      const result = await classifyColors(tenantId, payload)
      setSaveResult(result)
      if (result.classified > 0) {
        // Atualiza lista (remove classificadas com sucesso)
        await loadData()
      }
    } catch (err) {
      setSaveResult({ classified: 0, errors: [String(err)] })
    } finally {
      setIsSaving(false)
    }
  }

  // ── Contagem de rascunho preenchido ─────────────────────────────────────────
  const readyCount = [...draft.values()].filter(d => d.familia && d.intensidade).length
  const totalPending = items.length

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-sm border-t-4 border-[#7598CF]">
      {/* ── Header (sempre visível) ──────────────────────────────────────────── */}
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-[#7598CF]/4 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#7598CF]/12 rounded-xl flex items-center justify-center flex-shrink-0">
            <Palette className="w-5 h-5 text-[#7598CF]" />
          </div>
          <div className="text-left">
            <h2 className="text-[#28071C] text-lg font-bold leading-tight">Banco de Cores</h2>
            <p className="text-[#28071C]/50 text-sm mt-0.5">
              Classifique as cores dos produtos por família e intensidade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Badges de status */}
          {stats && (
            <div className="flex items-center gap-2">
              {stats.naoClassificadas > 0 ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  <AlertCircle className="w-3 h-3" />
                  {stats.naoClassificadas} pendente{stats.naoClassificadas !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                  <CheckCircle2 className="w-3 h-3" />
                  100% classificado
                </span>
              )}
              <span className="text-[11px] text-[#28071C]/40">
                {stats.coberturaPct}% cobertura
              </span>
            </div>
          )}
          {isExpanded
            ? <ChevronUp className="w-5 h-5 text-[#28071C]/40" />
            : <ChevronDown className="w-5 h-5 text-[#28071C]/40" />}
        </div>
      </button>

      {/* ── Conteúdo expandido ───────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-[#28071C]/8">

          {/* Explicação */}
          <div className="mx-6 mt-4 mb-3 flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/18 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#28071C]/60 leading-relaxed">
              <strong className="text-[#28071C]/75">Como funciona:</strong>{' '}
              As cores abaixo são as cores brutas dos seus produtos sem classificação.
              Para cada uma, selecione ou digite a <strong>Família</strong> (ex: Azul, Verde) e a <strong>Intensidade</strong> (ex: Marinho, Claro, Pastel).
              O sistema guarda no banco global — todos os clientes futuros com as mesmas cores já encontrarão a classificação pronta.
            </div>
          </div>

          {/* Barra de progresso */}
          {stats && stats.totalCores > 0 && (
            <div className="mx-6 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-[#28071C]/40">Cobertura do banco de cores</span>
                <span className="text-[11px] font-semibold text-[#7598CF]">
                  {stats.classificadas}/{stats.totalCores} cores
                </span>
              </div>
              <div className="h-2 bg-[#28071C]/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#7598CF] to-[#9B8CD8] rounded-full transition-all duration-500"
                  style={{ width: `${stats.coberturaPct}%` }}
                />
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-[#28071C]/40">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando cores não classificadas…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-[#28071C] font-semibold text-sm">Todas as cores classificadas!</p>
              <p className="text-[#28071C]/40 text-xs mt-1">
                Nenhuma cor dos seus produtos está pendente de classificação.
              </p>
              <button
                onClick={loadData}
                className="mt-4 flex items-center gap-1.5 mx-auto text-xs text-[#7598CF] hover:underline"
              >
                <RefreshCw className="w-3 h-3" /> Atualizar lista
              </button>
            </div>
          ) : (
            <>
              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-[28px_1fr_200px_200px_140px] gap-3 items-center px-4 py-2.5 bg-[#28071C]/3 border-b border-[#28071C]/8 mx-0">
                <div />
                <span className="text-[9px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Cor do produto</span>
                <span className="text-[9px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Família de cor</span>
                <span className="text-[9px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Intensidade</span>
                <span className="text-[9px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Grupo gerado</span>
              </div>

              {/* Linhas */}
              <div className="max-h-[480px] overflow-y-auto">
                {items.map((item, i) => {
                  const d = draft.get(item.cor_norm) ?? { familia: '', intensidade: '' }
                  return (
                    <ColorRow
                      key={item.cor_norm}
                      item={item}
                      familia={d.familia}
                      intensidade={d.intensidade}
                      onFamilia={v  => setDraftField(item.cor_norm, 'familia', v)}
                      onIntensidade={v => setDraftField(item.cor_norm, 'intensidade', v)}
                      familias={familias}
                      intensidades={intensidades}
                      index={i}
                    />
                  )
                })}
              </div>

              {/* Footer com salvar */}
              <div className="px-6 py-4 border-t border-[#28071C]/8 bg-[#F2F2F2]/50 flex items-center justify-between gap-4">
                <div className="text-xs text-[#28071C]/50">
                  {readyCount > 0 ? (
                    <span className="flex items-center gap-1.5 text-[#7598CF] font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      {readyCount} de {totalPending} cor{totalPending !== 1 ? 'es' : ''} pronta{readyCount !== 1 ? 's' : ''} para salvar
                    </span>
                  ) : (
                    <span>Preencha família e intensidade para cada cor.</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={loadData}
                    className="flex items-center gap-1.5 text-xs text-[#28071C]/50 hover:text-[#28071C] transition-colors px-3 py-2 rounded-lg hover:bg-[#28071C]/6"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={readyCount === 0 || isSaving}
                    className="
                      flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl
                      text-sm font-semibold hover:opacity-90 disabled:opacity-35
                      disabled:cursor-not-allowed transition-all shadow-sm
                    "
                  >
                    {isSaving ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando…</>
                    ) : (
                      <><Save className="w-4 h-4" /> Salvar {readyCount > 0 ? readyCount : ''} classificaç{readyCount === 1 ? 'ão' : 'ões'}</>
                    )}
                  </button>
                </div>
              </div>

              {/* Feedback de resultado */}
              {saveResult && (
                <div className={`mx-6 mb-4 px-4 py-3 rounded-xl text-sm flex items-start gap-2 ${
                  (saveResult.errors?.length ?? 0) > 0
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                }`}>
                  {(saveResult.errors?.length ?? 0) > 0 ? (
                    <>
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>{saveResult.classified} classificaç{saveResult.classified === 1 ? 'ão' : 'ões'} salva{saveResult.classified === 1 ? '' : 's'}.</strong>
                        {(saveResult.errors?.length ?? 0) > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {saveResult.errors!.map((e, i) => (
                              <li key={i} className="text-xs">{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>{saveResult.classified} cor{saveResult.classified !== 1 ? 'es' : ''} classificada{saveResult.classified !== 1 ? 's' : ''}</strong>
                        {' '}e propagada{saveResult.classified !== 1 ? 's' : ''} para o banco global e para os seus produtos.
                      </span>
                    </>
                  )}
                  <button onClick={() => setSaveResult(null)} className="ml-auto flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
