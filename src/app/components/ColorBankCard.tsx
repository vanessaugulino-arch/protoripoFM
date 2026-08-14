// src/app/components/ColorBankCard.tsx
// Banco Global de Cores — gerencia o dicionário compartilhado da plataforma.
//
// UX: adicionar cor (nome → família → intensidade) + visualizar banco agrupado.
// O banco NÃO filtra por tenant ou hierarquia — é um recurso global da empresa.

import { useState, useEffect, useId } from 'react'
import {
  Palette, ChevronDown, ChevronRight, CheckCircle2, AlertCircle,
  Plus, RefreshCw, X, Info, Search, Trash2,
} from 'lucide-react'
import {
  getColorBankGrouped,
  getColorFamilias,
  getColorIntensidades,
  addToColorBank,
  deleteFromColorBank,
  type ColorBankGroup,
  type ColorBankEntry,
} from '../../services/supabase/colorBankService'

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_FAMILIAS: string[] = [
  'Azul', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Laranja',
  'Roxo', 'Branco', 'Preto', 'Cinza', 'Bege', 'Marrom',
  'Caramelo', 'Dourado', 'Prata', 'Estampado',
]
const DEFAULT_INTENSIDADES: string[] = [
  'Claro', 'Médio', 'Escuro', 'Pastel', 'Neon', 'Mescla',
  'Metálico', 'Marinho', 'Royal', 'Floral', 'Xadrez', 'Listrado',
  'Terra', 'Puro', 'Gelo', 'Cru', 'Jeans', 'Turquesa',
]

// ─── Swatch por família ───────────────────────────────────────────────────────
const FAMILIA_SWATCH: Record<string, string> = {
  azul: '#3B82F6', vermelho: '#EF4444', verde: '#22C55E', amarelo: '#EAB308',
  rosa: '#EC4899', laranja: '#F97316', roxo: '#A855F7', branco: '#E5E7EB',
  preto: '#1C1C1C', cinza: '#9CA3AF', bege: '#F5F0E8', marrom: '#795548',
  caramelo: '#C68642', dourado: '#FFD700', prata: '#C0C0C0', estampado: '#D946EF',
}
function familySwatch(familia: string): string {
  const key = familia.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return FAMILIA_SWATCH[key] ?? '#94A3B8'
}

// ─── Combobox com datalist ────────────────────────────────────────────────────
interface ComboboxProps {
  value:       string
  onChange:    (v: string) => void
  options:     string[]
  placeholder: string
  disabled?:   boolean
}
function Combobox({ value, onChange, options, placeholder, disabled }: ComboboxProps) {
  const id = useId()
  return (
    <>
      <input
        type="text"
        list={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="
          w-full px-3 py-2 text-sm border border-[#28071C]/15 rounded-xl
          text-[#28071C] placeholder-[#28071C]/30 bg-white transition-colors
          focus:outline-none focus:border-[#7598CF]/60 focus:ring-1 focus:ring-[#7598CF]/20
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      />
      <datalist id={id}>
        {options.map(opt => <option key={opt} value={opt} />)}
      </datalist>
    </>
  )
}

// ─── Chip de cor ──────────────────────────────────────────────────────────────
function ColorChip({ entry, onDelete }: { entry: ColorBankEntry; onDelete: () => void }) {
  const swatch = familySwatch(entry.familia)
  return (
    <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 bg-white border border-[#28071C]/10 rounded-full text-xs text-[#28071C] group/chip hover:border-[#28071C]/20 transition-colors">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: swatch }} />
      {entry.cor_display}
      <button
        onClick={onDelete}
        className="w-4 h-4 flex items-center justify-center rounded-full text-[#28071C]/30 opacity-0 group-hover/chip:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
        title="Remover"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface ColorBankCardProps {
  tenantId?: string  // reservado para futuro: propagação de cores ao classificar produtos
}

export function ColorBankCard({ tenantId: _tenantId }: ColorBankCardProps) {
  // ── Dados ────────────────────────────────────────────────────────────────────
  const [groups,      setGroups]      = useState<ColorBankGroup[]>([])
  const [familias,    setFamilias]    = useState<string[]>(DEFAULT_FAMILIAS)
  const [intensidades,setIntensidades]= useState<string[]>(DEFAULT_INTENSIDADES)
  const [loading,     setLoading]     = useState(true)

  // ── Formulário de adição ─────────────────────────────────────────────────────
  const [newCor,       setNewCor]       = useState('')
  const [newFamilia,   setNewFamilia]   = useState('')
  const [newIntens,    setNewIntens]    = useState('')
  const [adding,       setAdding]       = useState(false)
  const [addFeedback,  setAddFeedback]  = useState<'ok' | 'err' | null>(null)
  const [addErrMsg,    setAddErrMsg]    = useState('')

  // ── Visualização ─────────────────────────────────────────────────────────────
  const [search,     setSearch]    = useState('')
  const [expanded,   setExpanded]  = useState<Set<string>>(new Set())
  const [deleting,   setDeleting]  = useState<string | null>(null)

  // ── Carrega dados ─────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    try {
      const [grouped, fams] = await Promise.all([
        getColorBankGrouped(),
        getColorFamilias(),
      ])
      setGroups(grouped)
      if (fams.length > 0) setFamilias([...new Set([...DEFAULT_FAMILIAS, ...fams])])
      // Expande todas as famílias por padrão
      setExpanded(new Set(grouped.map(g => g.familia)))
    } catch (err) {
      console.error('[ColorBankCard] Erro ao carregar:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Ao mudar a família no form, atualiza intensidades disponíveis
  useEffect(() => {
    if (!newFamilia.trim()) { setIntensidades(DEFAULT_INTENSIDADES); return }
    getColorIntensidades(newFamilia.trim())
      .then(ints => setIntensidades(
        ints.length > 0 ? [...new Set([...DEFAULT_INTENSIDADES, ...ints])] : DEFAULT_INTENSIDADES
      ))
      .catch(() => {})
  }, [newFamilia])

  // ── Adicionar cor ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const cor = newCor.trim()
    const fam = newFamilia.trim()
    const int = newIntens.trim()
    if (!cor || !fam || !int) {
      setAddErrMsg('Preencha nome da cor, família e intensidade.')
      setAddFeedback('err')
      setTimeout(() => setAddFeedback(null), 3000)
      return
    }
    setAdding(true)
    setAddFeedback(null)
    try {
      await addToColorBank({ cor_display: cor, familia: fam, intensidade: int })
      setNewCor('')
      // Mantém família e intensidade para facilitar adição em série
      setAddFeedback('ok')
      setTimeout(() => setAddFeedback(null), 2000)
      await loadData()
    } catch (err) {
      setAddErrMsg(String(err))
      setAddFeedback('err')
      setTimeout(() => setAddFeedback(null), 3000)
    } finally {
      setAdding(false)
    }
  }

  // ── Remover cor ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await deleteFromColorBank(id)
      await loadData()
    } catch (err) {
      console.error('[ColorBankCard] Erro ao remover:', err)
    } finally {
      setDeleting(null)
    }
  }

  const toggleFamily = (fam: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(fam) ? next.delete(fam) : next.add(fam)
      return next
    })

  // ── Filtro por busca ──────────────────────────────────────────────────────────
  const filteredGroups: ColorBankGroup[] = search.trim()
    ? groups
        .map(g => ({
          ...g,
          intensidades: g.intensidades
            .map(i => ({
              ...i,
              cores: i.cores.filter(c =>
                c.cor_display.toLowerCase().includes(search.toLowerCase()) ||
                c.intensidade.toLowerCase().includes(search.toLowerCase())
              ),
            }))
            .filter(i => i.cores.length > 0),
        }))
        .filter(g => g.intensidades.length > 0)
    : groups

  const totalCores    = groups.reduce((s, g) => s + g.totalCores, 0)
  const totalFamilias = groups.length

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Conceito ────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/18 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
        <p className="text-[#28071C]/65 text-sm leading-relaxed">
          O <strong>Banco de Cores</strong> agrupa os nomes de cores da sua marca em{' '}
          <strong>família</strong> (ex: Azul) e <strong>intensidade</strong> (ex: Royal, Marinho, Claro).
        </p>
      </div>

      {/* ── Formulário: adicionar nova cor ──────────────────────────────────── */}
      <div className="bg-[#28071C]/3 border border-[#28071C]/8 rounded-xl p-4">
        <p className="text-xs font-semibold text-[#28071C]/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar cor ao banco
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          {/* Nome da cor */}
          <div>
            <label className="text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest block mb-1">
              Nome da cor
            </label>
            <Combobox
              value={newCor}
              onChange={setNewCor}
              options={[]}
              placeholder="ex: Azul Royal, Marinho…"
            />
          </div>

          {/* Família */}
          <div>
            <label className="text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest block mb-1">
              Família
            </label>
            <Combobox
              value={newFamilia}
              onChange={v => { setNewFamilia(v); setNewIntens('') }}
              options={familias}
              placeholder="Selecione ou crie…"
            />
          </div>

          {/* Intensidade (filtrada pela família) */}
          <div>
            <label className="text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest block mb-1">
              Intensidade
            </label>
            <Combobox
              value={newIntens}
              onChange={setNewIntens}
              options={intensidades}
              placeholder="Selecione ou crie…"
              disabled={!newFamilia.trim()}
            />
          </div>

          {/* Botão */}
          <button
            onClick={handleAdd}
            disabled={adding || !newCor.trim() || !newFamilia.trim() || !newIntens.trim()}
            className="
              flex items-center gap-2 px-4 py-2 bg-[#7598CF] text-white rounded-xl text-sm font-semibold
              hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all whitespace-nowrap
            "
          >
            {adding
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando…</>
              : <><Plus className="w-4 h-4" /> Adicionar</>}
          </button>
        </div>

        {/* Feedback */}
        {addFeedback === 'ok' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" /> Cor adicionada ao banco global.
          </div>
        )}
        {addFeedback === 'err' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="w-3.5 h-3.5" /> {addErrMsg || 'Erro ao salvar. Tente novamente.'}
          </div>
        )}
      </div>

      {/* ── Banco de cores ───────────────────────────────────────────────────── */}
      <div>
        {/* Header com busca e stats */}
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 flex-1 bg-white border border-[#28071C]/15 rounded-xl px-3 py-2 focus-within:border-[#7598CF]/50 transition-colors">
            <Search className="w-4 h-4 text-[#28071C]/30 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cor, intensidade…"
              className="flex-1 bg-transparent text-[#28071C] text-sm focus:outline-none placeholder:text-[#28071C]/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-[#28071C]/30 hover:text-[#28071C] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-xs text-[#28071C]/40 whitespace-nowrap">
            {loading ? '…' : `${totalCores} cores · ${totalFamilias} famílias`}
          </div>

          <button
            onClick={loadData}
            className="p-2 text-[#28071C]/30 hover:text-[#28071C] hover:bg-[#28071C]/6 rounded-lg transition-colors"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Lista agrupada */}
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-[#28071C]/40">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando banco de cores…</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-10 text-[#28071C]/30 text-sm">
            {search ? 'Nenhuma cor encontrada para essa busca.' : 'Banco ainda sem cores. Use o formulário acima para adicionar.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map(group => {
              const isOpen = expanded.has(group.familia)
              const dot    = familySwatch(group.familia)

              return (
                <div key={group.familia} className="border border-[#28071C]/8 rounded-xl overflow-hidden bg-white">
                  {/* Cabeçalho da família */}
                  <button
                    onClick={() => toggleFamily(group.familia)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#28071C]/3 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-[#28071C]/30 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-[#28071C]/30 shrink-0" />}
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                    <span className="text-[#28071C] font-semibold text-sm flex-1">{group.familia}</span>
                    <span className="text-[#28071C]/35 text-xs">
                      {group.totalCores} cor{group.totalCores !== 1 ? 'es' : ''}
                    </span>
                  </button>

                  {/* Intensidades + chips de cores */}
                  {isOpen && (
                    <div className="border-t border-[#28071C]/6 divide-y divide-[#28071C]/5">
                      {group.intensidades.map(intGroup => (
                        <div key={intGroup.intensidade} className="px-4 py-3 flex items-start gap-3">
                          <span className="text-xs text-[#28071C]/40 font-semibold w-28 shrink-0 pt-1">
                            {intGroup.intensidade}
                          </span>
                          <div className="flex flex-wrap gap-1.5 flex-1">
                            {intGroup.cores.map(cor => (
                              <span
                                key={cor.id}
                                className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 border rounded-full text-xs text-[#28071C] group/chip transition-colors ${
                                  deleting === cor.id
                                    ? 'bg-red-50 border-red-200 opacity-50'
                                    : 'bg-[#28071C]/3 border-[#28071C]/10 hover:border-[#28071C]/20'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                                {cor.cor_display}
                                <button
                                  onClick={() => handleDelete(cor.id)}
                                  disabled={!!deleting}
                                  className="w-4 h-4 flex items-center justify-center rounded-full text-[#28071C]/20 opacity-0 group-hover/chip:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all disabled:cursor-not-allowed"
                                  title="Remover"
                                >
                                  {deleting === cor.id
                                    ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                    : <Trash2 className="w-2.5 h-2.5" />}
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export { Palette }
