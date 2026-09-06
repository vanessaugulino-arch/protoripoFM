import { useEffect, useState, useMemo, useRef } from "react"
import { useNavigate, useLocation } from "react-router"
import {
  ArrowLeft, ArrowRight, Check, Star, Lock, Unlock, ChevronUp, ChevronDown, Info,
  AlertTriangle, RotateCcw, User, LogOut, Pencil, X as XIcon,
} from "lucide-react"
import { isOnboardingComplete, getStoredProfile, ORIGEM_LABELS } from "../types/onboarding"
import type { OrigemPecas } from "../types/onboarding"
import {
  STRATEGIC_FOCUS_LABELS, STRATEGIC_FOCUS_DESC, STRATEGIC_FOCUS_ICONS,
  STRATEGIC_FOCUS_COLORS, PLAN_INDICATORS, DEFAULT_PRIORITIES,
  SUGGESTED_COUNTS, MAX_UNLOCK, savePlanCycle,
  getPlanCycle, initPlanCycles,
} from "../types/planCycle"
import { autoGenerateForYear } from "../../services/temporadaService"
import { saveCycle } from "../../services/supabase/planningScenarioService"
import type { PlanMode } from "../types/planCycle"
import type {
  StrategicFocus, PlanFieldPriority, AnnualPlanCycle, FieldStatus,
} from "../types/planCycle"

const ALL_FOCUSES: StrategicFocus[] = ["caixa", "margem", "crescimento", "defensivo"]
// 'custom' não está na grade de cards — é ativado via link/input inline

// Receita é o único indicador macro obrigatório — presente em todos os planos
const RECEITA_KEY = 'receitaBruta'
const MAX_DISMISS  = 2

// ─── Classificação do modelo produtivo a partir do onboarding ─────────────────
function classifyOrigem(origem: OrigemPecas | undefined): 'produtor' | 'comprador' | 'hibrido' | 'unknown' {
  if (!origem) return 'unknown'
  if (origem === 'propria' || origem === 'white_label' || origem === 'private_label') return 'produtor'
  if (origem === 'multimarca') return 'comprador'
  return 'hibrido' // 'hibrido'
}

/**
 * Adapta a lista de prioridades default conforme o modelo produtivo do cliente.
 *
 * Produtor (própria/white/private label):
 *   - NÃO usa Orçamento de Compra (não compra de terceiros como principal alavanca)
 *   - Substitui orcamento → producaoPecas nos indicadores sugeridos
 *
 * Comprador (multimarca/revenda):
 *   - NÃO usa indicadores de produção
 *   - Substitui producaoPecas → orcamento nos indicadores sugeridos
 *
 * Híbrido: mantém ambos, sem troca.
 */
function adaptPrioritiesForOrigem(
  defaults: string[],
  suggestedCount: number,
  origem: OrigemPecas | undefined,
): { priorities: string[]; count: number } {
  const tipo = classifyOrigem(origem)
  if (tipo === 'hibrido' || tipo === 'unknown') return { priorities: defaults, count: suggestedCount }

  const suggested = [...defaults.slice(0, suggestedCount)]
  const rest      = [...defaults.slice(suggestedCount)]

  if (tipo === 'produtor') {
    const orcIdx  = suggested.indexOf('orcamento')
    const prodIdx = suggested.indexOf('producaoPecas')
    if (orcIdx >= 0 && prodIdx < 0) {
      suggested[orcIdx] = 'producaoPecas'
      const prodRestIdx = rest.indexOf('producaoPecas')
      if (prodRestIdx >= 0) rest.splice(prodRestIdx, 1)
      rest.unshift('orcamento')
    }
  } else {
    // comprador
    const prodIdx = suggested.indexOf('producaoPecas')
    const orcIdx  = suggested.indexOf('orcamento')
    if (prodIdx >= 0 && orcIdx < 0) {
      suggested[prodIdx] = 'orcamento'
      const orcRestIdx = rest.indexOf('orcamento')
      if (orcRestIdx >= 0) rest.splice(orcRestIdx, 1)
      rest.unshift('producaoPecas')
    }
  }

  return { priorities: [...suggested, ...rest], count: suggestedCount }
}

// ─── AJUSTE 4: Tooltips explicativos dos indicadores (orientados a negócio) ──
const INDICATOR_TOOLTIPS: Record<string, string> = {
  receitaBruta:  'Volume total de vendas no período. Ponto de partida obrigatório — define o tamanho do mercado que você quer capturar.',
  margemBruta:   'Percentual que sobra da receita após deduzir o custo dos produtos. Indica a eficiência do mix e da precificação.',
  pmv:           'Preço médio pelo qual suas peças são vendidas. Impacta diretamente a margem e o posicionamento da marca.',
  orcamento:     'Estimativa de investimento previsto para comprar ou produzir mercadoria neste ciclo. Previsão inicial — refina-se conforme o plano de coleção avança.',
  giro:          'Quantas vezes o estoque é renovado no período. Giro alto = menos capital parado, mais liquidez.',
  cobertura:     'Quantos dias de estoque você tem disponível com base na velocidade de vendas atual. Cobertura alta pode indicar risco de estoque parado.',
  producaoPecas: 'Volume total de peças planejadas para produção ou compra no período. Alimenta a projeção de orçamento e o calendário de demanda financeira do ciclo.',
  mkdPct:        'Percentual de desconto aplicado sobre o preço original. Controla o impacto do markdown na margem bruta.',
  custoMedio:    'Custo médio por peça produzida ou comprada. Base para calcular o Orçamento e a margem bruta do período.',
  gmroi:         'Mostra quanto de lucro bruto a empresa gera para cada real investido em produtos. GMROI > 1 significa retorno positivo sobre o estoque.',
  mkdRS:         'Valor absoluto de desconto aplicado em reais. Complementa o percentual de markdown para entender o impacto financeiro real.',
  totalPecas:    'Total de peças considerando produção própria e compras externas. Visão consolidada do volume do período.',
  ticketMedio:   'Valor médio gasto por cliente em cada venda (Receita Bruta ÷ nº de clientes). Crescer o ticket médio significa vender mais itens por atendimento (PA) ou produtos de maior valor — sem necessariamente aumentar o número de clientes.',
}

// ─── Componente tooltip inline ─────────────────────────────────────────────────
function IndicatorTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1">
      <Info className="w-3 h-3 text-[#28071C]/20 group-hover:text-[#7598CF] cursor-help transition-colors" />
      <span className="absolute left-0 bottom-full mb-2 w-60 p-2.5 bg-[#28071C] text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed font-normal">
        {text}
        <span className="absolute top-full left-3 border-4 border-transparent border-t-[#28071C]" />
      </span>
    </span>
  )
}

interface LocationState { year: number; mode?: 'new' | 'review' }

// ─── Status visual config ─────────────────────────────────────────────────────
const STATUS_BADGE: Record<Exclude<FieldStatus, 'inactive'>, { label: string; cls: string }> = {
  suggested:  { label: "Sugerido",         cls: "bg-[#7598CF]/15 text-[#7598CF] border border-[#7598CF]/30" },
  unlocked:   { label: "Liberado",          cls: "bg-violet-100 text-violet-700 border border-violet-300" },
  dismissed:  { label: "Removido",          cls: "bg-red-50 text-red-500 border border-red-200" },
}

export default function PlanningSetup() {
  const navigate = useNavigate()
  const location = useLocation()
  const state    = location.state as LocationState | null
  const year     = state?.year ?? new Date().getFullYear() + 1
  const isReview = state?.mode === 'review'

  // Ciclo existente carregado do Supabase (via cache em memória) para modo revisão
  // Inicializa como null; é populado no useEffect de carregamento do usuário.
  const [existingCycle, setExistingCycle] = useState<AnnualPlanCycle | null>(null)
  /** Guard: garante que o pré-preenchimento do step 2 ocorre apenas uma vez */
  const hasPrefilledRef = useRef(false)

  // ── Perfil do onboarding (lido uma vez — não muda durante a sessão) ────────
  const profile      = getStoredProfile()
  const origemPerfil = profile?.origem
  const tipoPerfil   = classifyOrigem(origemPerfil)

  // ── Wizard step ────────────────────────────────────────────────────────────
  const [user, setUser] = useState<{ name: string; email: string; profile: string; tenant_id?: string } | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [focus, setFocus] = useState<StrategicFocus | null>(null)

  // ── Custom focus name ──────────────────────────────────────────────────────
  const [customFocusName,   setCustomFocusName]   = useState<string>('')
  const [customEditOpen,    setCustomEditOpen]    = useState(false)
  const [customDraft,       setCustomDraft]       = useState('')

  // ── Step 2 state ───────────────────────────────────────────────────────────
  const [statuses,      setStatuses]      = useState<Record<string, FieldStatus>>({})
  const [references,    setReferences]    = useState<Set<string>>(new Set())
  const [activeOrder,   setActiveOrder]   = useState<string[]>([])
  const [dismissCount,  setDismissCount]  = useState(0)

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser")
    navigate("/")
  }

  useEffect(() => {
    if (!isOnboardingComplete()) { navigate("/onboarding"); return }
    const stored = sessionStorage.getItem("currentUser")
    if (!stored) { navigate("/"); return }
    const u = JSON.parse(stored)
    setUser(u)
    const effectiveProfile =
      u.system_role === "support" || u.system_role === "client_admin"
        ? "CEO"
        : u.profile
    if (effectiveProfile !== "CEO") navigate("/dashboard")

    // Carrega o ciclo existente do Supabase (via cache em memória) para modo revisão
    if (isReview) {
      const tenantId = sessionStorage.getItem("activeTenantId") ?? u?.tenant_id ?? ""
      if (tenantId) {
        initPlanCycles(tenantId).then(() => {
          const cycle = getPlanCycle(year)
          if (cycle) setExistingCycle(cycle)
        }).catch(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // Quando o ciclo existente chega do Supabase, pré-preenche o step 2 (modo revisão)
  // hasPrefilledRef evita re-execução caso o state de existingCycle seja atualizado novamente
  useEffect(() => {
    if (!isReview || !existingCycle?.focus || hasPrefilledRef.current) return
    hasPrefilledRef.current = true

    const f = existingCycle.focus
    const fps = existingCycle.fieldPriorities as PlanFieldPriority[]
    setFocus(f)
    if (existingCycle.customFocusName) setCustomFocusName(existingCycle.customFocusName)

    if (fps?.length) {
      // Filtra chaves que existem no PLAN_INDICATORS atual (previne crash com dados obsoletos)
      const knownKeys = new Set(PLAN_INDICATORS.map(i => i.key))
      const initStatuses: Record<string, FieldStatus> = {}
      const order: string[] = []
      const refs = new Set<string>()
      let dismissed = 0
      for (const fp of fps) {
        if (!knownKeys.has(fp.key)) continue
        initStatuses[fp.key] = fp.status as FieldStatus
        if (fp.isPriority) order.push(fp.key)
        if (fp.isReference) refs.add(fp.key)
        if (fp.status === 'dismissed') dismissed++
      }
      // Garante que Receita Bruta está sempre presente
      if (!order.includes(RECEITA_KEY)) order.unshift(RECEITA_KEY)
      setStatuses(initStatuses)
      setActiveOrder(order)
      setReferences(refs)
      setDismissCount(dismissed)
      setStep(2)
    } else {
      applyFocusDefaults(f)
      setStep(2)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCycle])

  // ── Apply focus defaults (profile-aware) ──────────────────────────────────
  const applyFocusDefaults = (f: StrategicFocus) => {
    setFocus(f)

    if (f === 'custom') {
      // Custom: apenas receita ativa por padrão; todo o resto fica inativo (livre para adicionar)
      const ordered = DEFAULT_PRIORITIES['custom']
      const initStatuses: Record<string, FieldStatus> = {}
      for (const k of ordered) {
        initStatuses[k] = k === RECEITA_KEY ? "suggested" : "inactive"
      }
      setStatuses(initStatuses)
      setActiveOrder([RECEITA_KEY])
      setReferences(new Set())
      setDismissCount(0)
      return
    }

    const { priorities: ordered, count } = adaptPrioritiesForOrigem(
      DEFAULT_PRIORITIES[f],
      SUGGESTED_COUNTS[f],
      origemPerfil,
    )
    let suggested = ordered.slice(0, count)
    // Receita é sempre obrigatória — garante presença na lista ativa
    if (!suggested.includes(RECEITA_KEY)) {
      suggested = [RECEITA_KEY, ...suggested.slice(0, count - 1)]
    }
    const initStatuses: Record<string, FieldStatus> = {}
    for (const k of ordered) {
      initStatuses[k] = suggested.includes(k) ? "suggested" : "inactive"
    }
    setStatuses(initStatuses)
    setActiveOrder([...suggested])
    setReferences(new Set())
    setDismissCount(0)
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const isCustomFocus = focus === 'custom'

  const unlockedCount = useMemo(
    () => Object.values(statuses).filter(s => s === "unlocked").length,
    [statuses],
  )
  // No modo custom: sem limite de liberar indicadores
  const canUnlock  = isCustomFocus ? true : unlockedCount < MAX_UNLOCK
  const canDismiss = dismissCount < MAX_DISMISS

  // Inclui tanto 'inactive' quanto 'dismissed' na seção somente-leitura
  const inactiveKeys = useMemo(
    () => PLAN_INDICATORS.map(i => i.key).filter(k =>
      statuses[k] === "inactive" || statuses[k] === "dismissed"
    ),
    [statuses],
  )

  const systemSuggested = (focus && !isCustomFocus) ? DEFAULT_PRIORITIES[focus].slice(0, SUGGESTED_COUNTS[focus]) : []
  const isDiverged = useMemo(() => {
    if (isCustomFocus) return false
    if (activeOrder.length !== systemSuggested.length) return true
    return activeOrder.some((k, i) => k !== systemSuggested[i])
  }, [activeOrder, systemSuggested, isCustomFocus])

  // ── Actions ────────────────────────────────────────────────────────────────
  const unlock = (key: string) => {
    if (!canUnlock) return
    setStatuses(prev => ({ ...prev, [key]: "unlocked" }))
    setActiveOrder(prev => [...prev, key])
  }

  const lockBack = (key: string) => {
    setStatuses(prev => ({ ...prev, [key]: "inactive" }))
    setActiveOrder(prev => prev.filter(k => k !== key))
    setReferences(prev => { const n = new Set(prev); n.delete(key); return n })
  }

  // Remove conscientemente um indicador sugerido (exceto receita, máx. 2)
  const dismiss = (key: string) => {
    if (key === RECEITA_KEY || !canDismiss) return
    setStatuses(prev => ({ ...prev, [key]: "dismissed" as FieldStatus }))
    setActiveOrder(prev => prev.filter(k => k !== key))
    setReferences(prev => { const n = new Set(prev); n.delete(key); return n })
    setDismissCount(prev => prev + 1)
  }

  // Reinsere um indicador descartado de volta aos ativos
  const reinstate = (key: string) => {
    setStatuses(prev => ({ ...prev, [key]: "suggested" as FieldStatus }))
    setActiveOrder(prev => [...prev, key])
    setDismissCount(prev => Math.max(0, prev - 1))
  }

  const toggleRef = (key: string) => {
    setReferences(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const moveUp = (idx: number) => {
    if (idx === 0) return
    setActiveOrder(prev => {
      const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n
    })
  }

  const moveDown = (idx: number) => {
    if (idx === activeOrder.length - 1) return
    setActiveOrder(prev => {
      const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n
    })
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!focus) return
    const fieldPriorities: PlanFieldPriority[] = [
      // Active indicators in order
      ...activeOrder.map((key, idx) => ({
        key,
        rank: idx + 1,
        status: statuses[key] as FieldStatus,
        isReference: references.has(key),
        isPriority: true,
      })),
      // Inactive / dismissed indicators — preserva o status real
      ...inactiveKeys.map((key, idx) => ({
        key,
        rank: activeOrder.length + idx + 1,
        status: statuses[key] as FieldStatus,
        isReference: false,
        isPriority: false,
      })),
    ]

    const cycle: AnnualPlanCycle = {
      year,
      mode: isReview ? "review" : "new",
      focus,
      ...(focus === 'custom' && customFocusName.trim()
        ? { customFocusName: customFocusName.trim() }
        : {}),
      fieldPriorities,
      indicatorPriorities: [],
      versions: existingCycle?.versions ?? [],
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    }
    const saveResult = await savePlanCycle(cycle)
    if (!saveResult.ok) {
      alert(`O ciclo não foi salvo no banco: ${saveResult.error}\n\nTente novamente — se persistir, avise o suporte.`)
      return
    }
    // Gera automaticamente as 2 temporadas padrão para o ano fiscal, se ainda não existirem
    const tenantId = sessionStorage.getItem("activeTenantId") ?? user?.tenant_id ?? ""
    if (tenantId) {
      const [seasonResult, cycleResult] = await Promise.allSettled([
        autoGenerateForYear(tenantId, year),
        saveCycle(tenantId, year, {
          focus,
          mode: (isReview ? "review" : "new") as PlanMode,
          field_priorities: Object.fromEntries(fieldPriorities.map(fp => [fp.key, fp])),
        }),
      ])
      if (seasonResult.status === "rejected") {
        console.warn("Erro ao gerar temporadas automáticas:", seasonResult.reason)
        alert(`As temporadas de ${year} não foram criadas automaticamente: ${seasonResult.reason instanceof Error ? seasonResult.reason.message : seasonResult.reason}\n\nVocê pode criá-las manualmente em Configurações de Operação → Temporadas.`)
      }
      if (cycleResult.status === "rejected") {
        console.warn("Erro ao salvar ciclo no Supabase:", cycleResult.reason)
      }
    }
    navigate("/planning", { state: {
      year,
      mode: isReview ? "review" : "new",
      focus,
      ...(focus === 'custom' && customFocusName.trim() ? { customFocusName: customFocusName.trim() } : {}),
      fieldPriorities,
    } })
  }

  const focusColors = focus ? STRATEGIC_FOCUS_COLORS[focus] : null

  // ── Indicator lookup ───────────────────────────────────────────────────────
  const indMeta = (key: string) => PLAN_INDICATORS.find(i => i.key === key)!

  return (
    <div className="min-h-screen bg-[#F2F2F2] flex flex-col">

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (step === 1 ? navigate("/planning-gateway") : setStep(1))}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Módulo 1</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Configuração de Ciclo</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user?.name}</span>
            </div>
            <button onClick={handleLogout} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="h-1 bg-white/20">
        <div className="h-full bg-[#F6F3AA] transition-all duration-500" style={{ width: `${(step / 2) * 100}%` }} />
      </div>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-[900px]">

          {/* ═══════════════════ STEP 1: FOCUS ════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Premissa obrigatória do sistema */}
              <div className="flex items-start gap-3 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 mb-2">
                <div className="w-5 h-5 rounded-full bg-[#7598CF] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[10px] font-bold">i</span>
                </div>
                <div>
                  <p className="text-[#28071C] text-sm font-semibold">O plano sempre parte da receita</p>
                  <p className="text-[#28071C]/55 text-xs mt-0.5 leading-relaxed">
                    Todo ciclo começa por <strong>quanto queremos vender</strong>, depois define o <em>como</em> (indicadores de suporte)
                    e por fim o <em>porquê</em> (objetivo macro abaixo). A <strong>Receita Bruta</strong> é o único indicador
                    obrigatório e estará presente em todos os planos e cenários.
                  </p>
                </div>
              </div>
              <p className="text-center text-[#28071C]/50 text-sm mb-4">
                Qual é o foco central do planejamento de <strong className="text-[#28071C]">{year}</strong>?
                A escolha pré-seleciona os indicadores de suporte prioritários.
              </p>
              {/* Aviso de adaptação por perfil produtivo */}
              {origemPerfil && tipoPerfil !== 'unknown' && tipoPerfil !== 'hibrido' && (
                <div className="flex items-start gap-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl px-4 py-3 mb-2 text-sm">
                  <span className="flex-shrink-0 mt-0.5">⚙️</span>
                  <p className="text-amber-800/80 leading-snug">
                    <strong>Perfil detectado:</strong> {ORIGEM_LABELS[origemPerfil]}.{' '}
                    {tipoPerfil === 'produtor'
                      ? 'Os indicadores sugeridos vão priorizar Produção de Peças em vez de Orçamento Previsto.'
                      : 'Os indicadores vão priorizar Orçamento Previsto e não incluir indicadores de produção própria.'}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {ALL_FOCUSES.map(f => {
                  const selected = focus === f
                  const colors = STRATEGIC_FOCUS_COLORS[f]
                  return (
                    <button
                      key={f}
                      onClick={() => applyFocusDefaults(f)}
                      className={`text-left p-5 rounded-2xl border-2 transition-all ${
                        selected ? `${colors.card} shadow-md` : "bg-white/60 border-[#28071C]/10 hover:border-[#7598CF]/40 hover:bg-white/80"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-3xl">{STRATEGIC_FOCUS_ICONS[f]}</span>
                        {selected && (
                          <div className="w-5 h-5 rounded-full bg-[#7598CF] flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-[#28071C] font-bold text-base mb-1">{STRATEGIC_FOCUS_LABELS[f]}</p>
                      <p className="text-[#28071C]/50 text-sm leading-snug">{STRATEGIC_FOCUS_DESC[f]}</p>
                    </button>
                  )
                })}
              </div>

              {/* ── Custom focus ──────────────────────────────────────────── */}
              <div className="mt-3">
                {!customEditOpen && focus !== 'custom' && (
                  <button
                    onClick={() => { setCustomEditOpen(true); setCustomDraft(customFocusName) }}
                    className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#7598CF] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Criar nome de foco personalizado para este ciclo
                  </button>
                )}

                {customEditOpen && (
                  <div className="flex items-center gap-2 p-3 bg-pink-50 border border-pink-200 rounded-xl">
                    <Pencil className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                    <input
                      autoFocus
                      value={customDraft}
                      onChange={e => setCustomDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customDraft.trim()) {
                          setCustomFocusName(customDraft.trim())
                          applyFocusDefaults('custom')
                          setCustomEditOpen(false)
                        }
                        if (e.key === 'Escape') {
                          setCustomEditOpen(false)
                          setCustomDraft('')
                        }
                      }}
                      placeholder="Ex: Eficiência Operacional, Expansão Digital…"
                      className="flex-1 bg-transparent text-sm text-[#28071C] placeholder-[#28071C]/30 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (customDraft.trim()) {
                          setCustomFocusName(customDraft.trim())
                          applyFocusDefaults('custom')
                        }
                        setCustomEditOpen(false)
                      }}
                      className="flex-shrink-0 px-3 py-1 text-xs font-semibold bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => { setCustomEditOpen(false); setCustomDraft('') }}
                      className="flex-shrink-0 p-1 text-[#28071C]/30 hover:text-[#28071C]/60 transition-colors"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {focus === 'custom' && !customEditOpen && (
                  <div className="flex items-center gap-2 p-3 bg-pink-50 border-2 border-pink-300 rounded-xl">
                    <span className="text-lg">✏️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-pink-700">Foco Personalizado</p>
                      <p className="text-sm text-[#28071C] font-bold truncate">
                        {customFocusName || 'Sem nome definido'}
                      </p>
                    </div>
                    <div className="w-5 h-5 rounded-full bg-pink-600 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <button
                      onClick={() => { setCustomEditOpen(true); setCustomDraft(customFocusName) }}
                      className="flex-shrink-0 p-1.5 rounded-lg text-pink-400 hover:text-pink-700 hover:bg-pink-100 transition-colors"
                      title="Editar nome"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setFocus(null); setCustomFocusName(''); setCustomDraft('') }}
                      className="flex-shrink-0 p-1.5 rounded-lg text-[#28071C]/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remover foco personalizado"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setStep(2)}
                  disabled={!focus}
                  className="flex items-center gap-2 px-8 py-3 bg-[#7598CF] text-white rounded-xl font-semibold disabled:opacity-40 hover:opacity-90 transition-all shadow-sm"
                >
                  Definir indicadores <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 2: INDICATORS ═══════════════════════════ */}
          {step === 2 && focus && (
            <div className="space-y-4">

              {/* AJUSTE 5: Contextual guidance banner */}
              <div className="flex items-start gap-3 p-3.5 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl">
                <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[#28071C]/70 leading-relaxed">
                  <strong className="text-[#28071C]">Defina aqui os indicadores que irão guiar o ano fiscal.</strong>{' '}
                  Você pode testar configurações diferentes, comparar alternativas e só confirmar quando estiver seguro da decisão.
                </p>
              </div>

              {/* Perfil produtivo — nota contextual */}
              {tipoPerfil !== 'unknown' && tipoPerfil !== 'hibrido' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#28071C]/4 rounded-xl text-xs text-[#28071C]/55">
                  <span>{tipoPerfil === 'produtor' ? '🏭' : '🛒'}</span>
                  <span>
                    {tipoPerfil === 'produtor'
                      ? 'Modelo produtivo: Produção de Peças priorizado em vez de Orçamento Previsto.'
                      : 'Modelo de revenda: Orçamento Previsto priorizado — indicadores de produção em somente leitura.'}
                  </span>
                </div>
              )}

              {/* Focus badge + instructions */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border mb-2 ${focusColors!.card} ${focusColors!.badge}`}>
                    {STRATEGIC_FOCUS_ICONS[focus]}
                    {isCustomFocus
                      ? (customFocusName || 'Foco Personalizado')
                      : STRATEGIC_FOCUS_LABELS[focus]}
                  </div>
                  {isCustomFocus ? (
                    <p className="text-[#28071C]/55 text-sm leading-relaxed">
                      Modo personalizado — apenas <strong className="text-[#28071C]">Receita Bruta</strong> é obrigatória.
                      Selecione livremente os demais indicadores que deseja planejar neste ciclo,
                      sem limite de quantidade.
                    </p>
                  ) : (
                    <p className="text-[#28071C]/55 text-sm leading-relaxed">
                      O sistema selecionou <strong className="text-[#28071C]">{focus ? SUGGESTED_COUNTS[focus] : 0} indicadores</strong> com base no foco escolhido.
                      Você pode <strong className="text-violet-700">liberar até {MAX_UNLOCK} adicionais</strong>,{" "}
                      <strong className="text-red-600">remover até {MAX_DISMISS} sugeridos</strong> que não deseja planejar neste ciclo
                      (exceto receita) e marcar qualquer indicador ativo como <strong className="text-amber-600">⭐ Referência</strong>.
                    </p>
                  )}
                </div>
                {isDiverged && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
                    <Info className="w-3.5 h-3.5" />
                    Configuração personalizada
                  </div>
                )}
              </div>

              {/* ── TWO-COLUMN LAYOUT: ACTIVE  |  READ-ONLY ── */}
              <div className="grid grid-cols-2 gap-4 items-start">

                {/* ── COLUNA ESQUERDA: ATIVOS ── */}
                <div className="bg-white/75 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 border-b border-[#28071C]/8 flex items-center justify-between bg-[#7598CF]/6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#7598CF]" />
                      <span className="text-[11px] text-[#7598CF] uppercase tracking-widest font-bold">
                        Ativos — metas editáveis
                      </span>
                    </div>
                    <span className="text-[11px] text-[#28071C]/40 font-medium">
                      {activeOrder.length}
                      {!isCustomFocus && unlockedCount > 0 && (
                        <span className="ml-1.5 text-violet-600">
                          ({unlockedCount}/{MAX_UNLOCK} lib.)
                        </span>
                      )}
                      {isCustomFocus && unlockedCount > 0 && (
                        <span className="ml-1.5 text-pink-500">
                          +{unlockedCount} adicionados
                        </span>
                      )}
                    </span>
                  </div>

                  {activeOrder.length === 0 && (
                    <p className="text-center text-[#28071C]/35 text-sm py-6">
                      Nenhum indicador ativo.
                    </p>
                  )}

                  {activeOrder.map((key, idx) => {
                    const ind = indMeta(key)
                    if (!ind) return null   // guard: ignora chave sem metadado (dados stale)

                    const status    = statuses[key] as Exclude<FieldStatus, 'inactive'>
                    const isRef     = references.has(key)
                    const isFirst   = idx === 0
                    const isLast    = idx === activeOrder.length - 1
                    const badge     = STATUS_BADGE[status]
                    const isReceita = key === RECEITA_KEY

                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-2 px-4 py-2.5 border-b border-[#28071C]/5 last:border-0 ${
                          isReceita ? "bg-[#7598CF]/5" : isRef ? "bg-amber-50/40" : "bg-white"
                        }`}
                      >
                        {/* Rank */}
                        <div className={`w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                          isReceita ? "bg-[#28071C]" : "bg-[#7598CF]"
                        }`}>
                          {idx + 1}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-[#28071C]">{ind.label}</span>
                            {INDICATOR_TOOLTIPS[key] && <IndicatorTooltip text={INDICATOR_TOOLTIPS[key]} />}
                            {isReceita ? (
                              <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-[#28071C]/10 text-[#28071C]/70 border border-[#28071C]/20 flex items-center gap-0.5">
                                <Lock className="w-2 h-2" /> Obrigatório
                              </span>
                            ) : (
                              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            )}
                            {isRef && (
                              <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-amber-100 text-amber-700 border border-amber-300 flex items-center gap-0.5">
                                <Star className="w-2 h-2 fill-amber-500 text-amber-500" />Ref.
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#28071C]/40 mt-0.5 truncate">{ind.description}</p>
                        </div>

                        {/* Reference toggle */}
                        <button
                          onClick={() => toggleRef(key)}
                          title={isRef ? "Remover referência" : "Marcar como referência"}
                          className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all ${
                            isRef ? "bg-amber-100 text-amber-600 hover:bg-amber-200" : "text-[#28071C]/20 hover:text-amber-500 hover:bg-amber-50"
                          }`}
                        >
                          <Star className={`w-3 h-3 ${isRef ? "fill-amber-500" : ""}`} />
                        </button>

                        {/* Lock back (unlocked only) */}
                        {status === "unlocked" && (
                          <button onClick={() => lockBack(key)} title="Remover do plano ativo"
                            className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[#28071C]/25 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Lock className="w-3 h-3" />
                          </button>
                        )}

                        {/* Dismiss (suggested, not receita) */}
                        {status === "suggested" && !isReceita && (
                          <button onClick={() => dismiss(key)} disabled={!canDismiss}
                            title={canDismiss ? "Remover do plano" : `Máx. ${MAX_DISMISS} remoções`}
                            className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all ${
                              canDismiss ? "text-[#28071C]/20 hover:text-red-500 hover:bg-red-50" : "text-[#28071C]/10 cursor-not-allowed"
                            }`}>
                            <AlertTriangle className="w-3 h-3" />
                          </button>
                        )}

                        {/* Receita lock (non-interactive) */}
                        {isReceita && (
                          <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[#28071C]/20">
                            <Lock className="w-3 h-3" />
                          </div>
                        )}

                        {/* Up/Down */}
                        <div className="flex flex-col gap-0 flex-shrink-0">
                          <button onClick={() => moveUp(idx)} disabled={isFirst}
                            className="w-5 h-4 flex items-center justify-center rounded hover:bg-[#7598CF]/12 disabled:opacity-15 transition-colors">
                            <ChevronUp className="w-3 h-3 text-[#28071C]/50" />
                          </button>
                          <button onClick={() => moveDown(idx)} disabled={isLast}
                            className="w-5 h-4 flex items-center justify-center rounded hover:bg-[#7598CF]/12 disabled:opacity-15 transition-colors">
                            <ChevronDown className="w-3 h-3 text-[#28071C]/50" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── COLUNA DIREITA: SOMENTE LEITURA ── */}
                <div className="bg-white/50 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 border-b border-[#28071C]/6 flex items-center justify-between bg-[#28071C]/3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#28071C]/25" />
                      <span className="text-[11px] text-[#28071C]/40 uppercase tracking-widest font-bold">
                        Somente leitura
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {dismissCount > 0 && (
                        <span className="text-[9px] text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5 font-semibold">
                          {dismissCount}/{MAX_DISMISS} removidos
                        </span>
                      )}
                      {!isCustomFocus && !canUnlock && (
                        <span className="text-[9px] text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 font-semibold">
                          Máx. {MAX_UNLOCK} lib.
                        </span>
                      )}
                      {!isCustomFocus && canUnlock && (
                        <span className="text-[9px] text-[#28071C]/35">
                          {MAX_UNLOCK - unlockedCount} disp.
                        </span>
                      )}
                      {isCustomFocus && (
                        <span className="text-[9px] text-pink-500 bg-pink-50 border border-pink-200 rounded-full px-1.5 py-0.5 font-semibold">
                          Livre
                        </span>
                      )}
                    </div>
                  </div>

                  {inactiveKeys.length === 0 && (
                    <p className="text-center text-[#28071C]/25 text-xs py-6">
                      Todos os indicadores estão ativos.
                    </p>
                  )}

                  {inactiveKeys.map(key => {
                    const ind           = indMeta(key)
                    if (!ind) return null   // guard: chave obsoleta
                    const isDismissed   = statuses[key] === "dismissed"
                    const canUnlockThis = canUnlock && !isDismissed
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-2 px-4 py-2.5 border-b border-[#28071C]/5 last:border-0 ${
                          isDismissed ? "bg-red-50/30" : "opacity-55"
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                          isDismissed ? "bg-red-100 text-red-400" : "bg-[#28071C]/10 text-[#28071C]/35"
                        }`}>
                          {isDismissed ? "✕" : "—"}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`text-xs font-medium ${isDismissed ? "text-[#28071C]/60" : "text-[#28071C]/50"}`}>
                              {ind.label}
                            </p>
                            {INDICATOR_TOOLTIPS[key] && <IndicatorTooltip text={INDICATOR_TOOLTIPS[key]} />}
                            {isDismissed && (
                              <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-red-50 text-red-500 border border-red-200">
                                Removido
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#28071C]/30 truncate">{ind.description}</p>
                        </div>

                        {/* Reinstate (dismissed) */}
                        {isDismissed && (
                          <button onClick={() => reinstate(key)} title="Reinserir nos ativos"
                            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-[#7598CF]/40 text-[#7598CF] bg-[#7598CF]/8 hover:bg-[#7598CF]/15 transition-all">
                            <RotateCcw className="w-2.5 h-2.5" />
                            Reinserir
                          </button>
                        )}

                        {/* Unlock (inactive) */}
                        {!isDismissed && (
                          <button
                            onClick={() => canUnlockThis && unlock(key)}
                            disabled={!canUnlockThis}
                            title={canUnlockThis ? "Adicionar ao plano" : `Máx. ${MAX_UNLOCK} liberados`}
                            className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                              canUnlockThis
                                ? isCustomFocus
                                  ? "border-pink-300 text-pink-700 bg-pink-50 hover:bg-pink-100 opacity-100"
                                  : "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 opacity-100"
                                : "border-[#28071C]/10 text-[#28071C]/25 cursor-not-allowed"
                            }`}
                          >
                            <Unlock className="w-2.5 h-2.5" />
                            {canUnlockThis ? (isCustomFocus ? "Adicionar" : "Liberar") : "Máx."}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>{/* end grid */}

              {/* Legend */}
              <div className="flex flex-wrap gap-4 text-xs text-[#28071C]/45 px-1">
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#28071C]" />Receita — obrigatório
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#7598CF]" />Sugerido pelo sistema
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-violet-400" />Liberado manualmente
                </span>
                <span className="flex items-center gap-1.5">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />Indicador de referência
                </span>
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-red-400" />Removível conscientemente
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#28071C]/20" />Somente leitura
                </span>
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 text-sm text-[#28071C]/60 border border-[#28071C]/20 rounded-xl hover:bg-white/60 transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  onClick={handleStart}
                  disabled={activeOrder.length === 0}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] text-white rounded-xl font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-md"
                >
                  {isReview ? `Revisar plano ${year}` : `Iniciar planejamento ${year}`}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
