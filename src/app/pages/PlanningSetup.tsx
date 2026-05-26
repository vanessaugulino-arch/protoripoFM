import { useEffect, useState, useMemo } from "react"
import { useNavigate, useLocation } from "react-router"
import {
  ArrowLeft, ArrowRight, Check, Star, Lock, Unlock, ChevronUp, ChevronDown, Info,
  AlertTriangle, RotateCcw,
} from "lucide-react"
import { isOnboardingComplete } from "../types/onboarding"
import {
  STRATEGIC_FOCUS_LABELS, STRATEGIC_FOCUS_DESC, STRATEGIC_FOCUS_ICONS,
  STRATEGIC_FOCUS_COLORS, PLAN_INDICATORS, DEFAULT_PRIORITIES,
  SUGGESTED_COUNT, MAX_UNLOCK, savePlanCycle,
} from "../types/planCycle"
import type {
  StrategicFocus, PlanFieldPriority, AnnualPlanCycle, FieldStatus,
} from "../types/planCycle"

const ALL_FOCUSES: StrategicFocus[] = ["caixa", "margem", "crescimento", "defensivo"]

// Receita é o único indicador macro obrigatório — presente em todos os planos
const RECEITA_KEY = 'receitaBruta'
const MAX_DISMISS  = 2

interface LocationState { year: number }

// ─── Status visual config ─────────────────────────────────────────────────────
const STATUS_BADGE: Record<Exclude<FieldStatus, 'inactive'>, { label: string; cls: string }> = {
  suggested:  { label: "Sugerido",         cls: "bg-[#7598CF]/15 text-[#7598CF] border border-[#7598CF]/30" },
  unlocked:   { label: "Liberado",          cls: "bg-violet-100 text-violet-700 border border-violet-300" },
  dismissed:  { label: "Removido",          cls: "bg-red-50 text-red-500 border border-red-200" },
}

export default function PlanningSetup() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const year = state?.year ?? new Date().getFullYear() + 1

  // ── Wizard step ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1)
  const [focus, setFocus] = useState<StrategicFocus | null>(null)

  // ── Step 2 state ───────────────────────────────────────────────────────────
  const [statuses,      setStatuses]      = useState<Record<string, FieldStatus>>({})
  const [references,    setReferences]    = useState<Set<string>>(new Set())
  const [activeOrder,   setActiveOrder]   = useState<string[]>([])
  const [dismissCount,  setDismissCount]  = useState(0)

  useEffect(() => {
    if (!isOnboardingComplete()) { navigate("/onboarding"); return }
    const stored = sessionStorage.getItem("currentUser")
    if (!stored) { navigate("/"); return }
    const u = JSON.parse(stored)
    if (u.profile !== "CEO") navigate("/dashboard")
  }, [navigate])

  // ── Apply focus defaults ───────────────────────────────────────────────────
  const applyFocusDefaults = (f: StrategicFocus) => {
    setFocus(f)
    const allKeys = PLAN_INDICATORS.map(i => i.key)
    const ordered = DEFAULT_PRIORITIES[f]
    let suggested = ordered.slice(0, SUGGESTED_COUNT)
    // Receita é sempre obrigatória — garante presença na lista ativa
    if (!suggested.includes(RECEITA_KEY)) {
      suggested = [RECEITA_KEY, ...suggested.slice(0, SUGGESTED_COUNT - 1)]
    }
    const initStatuses: Record<string, FieldStatus> = {}
    for (const k of allKeys) {
      initStatuses[k] = suggested.includes(k) ? "suggested" : "inactive"
    }
    setStatuses(initStatuses)
    setActiveOrder([...suggested])
    setReferences(new Set())
    setDismissCount(0)
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const unlockedCount = useMemo(
    () => Object.values(statuses).filter(s => s === "unlocked").length,
    [statuses],
  )
  const canUnlock  = unlockedCount < MAX_UNLOCK
  const canDismiss = dismissCount < MAX_DISMISS

  // Inclui tanto 'inactive' quanto 'dismissed' na seção somente-leitura
  const inactiveKeys = useMemo(
    () => PLAN_INDICATORS.map(i => i.key).filter(k =>
      statuses[k] === "inactive" || statuses[k] === "dismissed"
    ),
    [statuses],
  )

  const systemSuggested = focus ? DEFAULT_PRIORITIES[focus].slice(0, SUGGESTED_COUNT) : []
  const isDiverged = useMemo(() => {
    if (activeOrder.length !== systemSuggested.length) return true
    return activeOrder.some((k, i) => k !== systemSuggested[i])
  }, [activeOrder, systemSuggested])

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
  const handleStart = () => {
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
      mode: "new",
      focus,
      fieldPriorities,
      indicatorPriorities: [],
      versions: [],
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    }
    savePlanCycle(cycle)
    navigate("/planning", { state: { year, mode: "new", focus, fieldPriorities } })
  }

  const focusColors = focus ? STRATEGIC_FOCUS_COLORS[focus] : null

  // ── Indicator lookup ───────────────────────────────────────────────────────
  const indMeta = (key: string) => PLAN_INDICATORS.find(i => i.key === key)!

  return (
    <div className="min-h-screen bg-[#E7E7E6] flex flex-col">

      {/* HEADER */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg flex-shrink-0">
        <div className="max-w-[900px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (step === 1 ? navigate("/planning-gateway") : setStep(1))}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <p className="text-[#F6F3AA]/70 text-xs uppercase tracking-widest">Novo Ciclo — {year}</p>
              <p className="text-[#F6F3AA] font-semibold text-lg leading-tight">
                {step === 1 ? "Foco Estratégico do Ano" : "Indicadores do Plano"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2].map(s => (
              <div key={s} className={`rounded-full transition-all ${
                s === step ? "w-6 h-2 bg-[#F6F3AA]" : s < step ? "w-2 h-2 bg-[#F6F3AA]/80" : "w-2 h-2 bg-[#F6F3AA]/30"
              }`} />
            ))}
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

              {/* Focus badge + instructions */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border mb-2 ${focusColors!.card} ${focusColors!.badge}`}>
                    {STRATEGIC_FOCUS_ICONS[focus]} {STRATEGIC_FOCUS_LABELS[focus]}
                  </div>
                  <p className="text-[#28071C]/55 text-sm leading-relaxed">
                    O sistema selecionou <strong className="text-[#28071C]">{SUGGESTED_COUNT} indicadores</strong> com base no foco escolhido.
                    Você pode <strong className="text-violet-700">liberar até {MAX_UNLOCK} adicionais</strong>,{" "}
                    <strong className="text-red-600">remover até {MAX_DISMISS} sugeridos</strong> que não deseja planejar neste ciclo
                    (exceto receita) e marcar qualquer indicador ativo como <strong className="text-amber-600">⭐ Referência</strong>.
                  </p>
                </div>
                {isDiverged && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
                    <Info className="w-3.5 h-3.5" />
                    Configuração personalizada
                  </div>
                )}
              </div>

              {/* ── ACTIVE INDICATORS ── */}
              <div className="bg-white/75 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[#28071C]/8 flex items-center justify-between bg-[#7598CF]/6">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#7598CF]" />
                    <span className="text-xs text-[#7598CF] uppercase tracking-widest font-bold">
                      Indicadores Ativos — metas editáveis no plano
                    </span>
                  </div>
                  <span className="text-xs text-[#28071C]/40 font-medium">
                    {activeOrder.length} indicadores
                    {unlockedCount > 0 && (
                      <span className="ml-2 text-violet-600">
                        ({unlockedCount}/{MAX_UNLOCK} liberados)
                      </span>
                    )}
                  </span>
                </div>

                {activeOrder.length === 0 && (
                  <p className="text-center text-[#28071C]/35 text-sm py-8">
                    Nenhum indicador ativo.
                  </p>
                )}

                {activeOrder.map((key, idx) => {
                  const ind       = indMeta(key)
                  const status    = statuses[key] as Exclude<FieldStatus, 'inactive'>
                  const isRef     = references.has(key)
                  const isFirst   = idx === 0
                  const isLast    = idx === activeOrder.length - 1
                  const badge     = STATUS_BADGE[status]
                  const isReceita = key === RECEITA_KEY

                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-3 px-5 py-3.5 border-b border-[#28071C]/5 last:border-0 ${
                        isReceita ? "bg-[#7598CF]/5" : isRef ? "bg-amber-50/40" : "bg-white"
                      }`}
                    >
                      {/* Rank */}
                      <div className={`w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                        isReceita ? "bg-[#28071C]" : "bg-[#7598CF]"
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#28071C]">{ind.label}</span>
                          {isReceita ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#28071C]/10 text-[#28071C]/70 border border-[#28071C]/20 flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> Obrigatório
                            </span>
                          ) : (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                          {isRef && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-700 border border-amber-300 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />Referência
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#28071C]/40 mt-0.5">{ind.description}</p>
                      </div>

                      {/* Reference toggle (receita também pode ser referência) */}
                      <button
                        onClick={() => toggleRef(key)}
                        title={isRef ? "Remover indicador de referência" : "Marcar como indicador de referência"}
                        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          isRef
                            ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                            : "text-[#28071C]/20 hover:text-amber-500 hover:bg-amber-50"
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isRef ? "fill-amber-500" : ""}`} />
                      </button>

                      {/* Lock back (only for unlocked) */}
                      {status === "unlocked" && (
                        <button
                          onClick={() => lockBack(key)}
                          title="Remover do plano ativo"
                          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#28071C]/25 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Dismiss (suggested only, not receita, max MAX_DISMISS) */}
                      {status === "suggested" && !isReceita && (
                        <button
                          onClick={() => dismiss(key)}
                          disabled={!canDismiss}
                          title={canDismiss ? "Remover conscientemente este indicador do plano" : `Máximo de ${MAX_DISMISS} remoções atingido`}
                          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                            canDismiss
                              ? "text-[#28071C]/20 hover:text-red-500 hover:bg-red-50"
                              : "text-[#28071C]/10 cursor-not-allowed"
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Receita lock icon (non-interactive) */}
                      {isReceita && (
                        <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#28071C]/20" title="Receita não pode ser removida">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Up/Down */}
                      <div className="flex flex-col gap-0 flex-shrink-0">
                        <button
                          onClick={() => moveUp(idx)}
                          disabled={isFirst}
                          className="w-6 h-5 flex items-center justify-center rounded hover:bg-[#7598CF]/12 disabled:opacity-15 transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5 text-[#28071C]/50" />
                        </button>
                        <button
                          onClick={() => moveDown(idx)}
                          disabled={isLast}
                          className="w-6 h-5 flex items-center justify-center rounded hover:bg-[#7598CF]/12 disabled:opacity-15 transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5 text-[#28071C]/50" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── INACTIVE / DISMISSED INDICATORS ── */}
              {inactiveKeys.length > 0 && (
                <div className="bg-white/50 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-[#28071C]/6 flex items-center justify-between bg-[#28071C]/3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#28071C]/25" />
                      <span className="text-xs text-[#28071C]/40 uppercase tracking-widest font-bold">
                        Somente Leitura — não editáveis no plano
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dismissCount > 0 && (
                        <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 font-semibold">
                          {dismissCount}/{MAX_DISMISS} removidos conscientemente
                        </span>
                      )}
                      {!canUnlock && (
                        <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 font-semibold">
                          Máximo {MAX_UNLOCK} liberados atingido
                        </span>
                      )}
                      {canUnlock && (
                        <span className="text-[10px] text-[#28071C]/35">
                          {MAX_UNLOCK - unlockedCount} liberação{MAX_UNLOCK - unlockedCount !== 1 ? "ões" : ""} disponível{MAX_UNLOCK - unlockedCount !== 1 ? "is" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {inactiveKeys.map(key => {
                    const ind          = indMeta(key)
                    const isDismissed  = statuses[key] === "dismissed"
                    const canUnlockThis = canUnlock && !isDismissed
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-3 px-5 py-3 border-b border-[#28071C]/5 last:border-0 ${
                          isDismissed ? "bg-red-50/30" : "opacity-55"
                        }`}
                      >
                        {/* Rank icon */}
                        <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                          isDismissed
                            ? "bg-red-100 text-red-400"
                            : "bg-[#28071C]/10 text-[#28071C]/35"
                        }`}>
                          {isDismissed ? "✕" : "—"}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${isDismissed ? "text-[#28071C]/60" : "text-[#28071C]/50"}`}>
                              {ind.label}
                            </p>
                            {isDismissed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-500 border border-red-200">
                                Removido conscientemente
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#28071C]/30">{ind.description}</p>
                        </div>

                        {/* Reinstate button (dismissed only) */}
                        {isDismissed && (
                          <button
                            onClick={() => reinstate(key)}
                            title="Reinserir este indicador nos ativos"
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#7598CF]/40 text-[#7598CF] bg-[#7598CF]/8 hover:bg-[#7598CF]/15 transition-all"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reinserir
                          </button>
                        )}

                        {/* Unlock button (inactive only) */}
                        {!isDismissed && (
                          <button
                            onClick={() => canUnlockThis && unlock(key)}
                            disabled={!canUnlockThis}
                            title={canUnlockThis ? "Liberar para edição no plano" : `Máximo de ${MAX_UNLOCK} indicadores liberados`}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              canUnlockThis
                                ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 opacity-100"
                                : "border-[#28071C]/10 text-[#28071C]/25 cursor-not-allowed"
                            }`}
                          >
                            <Unlock className="w-3 h-3" />
                            {canUnlockThis ? "Liberar" : "Máx. atingido"}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

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
                  Iniciar planejamento {year}
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
