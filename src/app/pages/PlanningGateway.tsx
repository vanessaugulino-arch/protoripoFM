import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router"
import {
  ArrowLeft, LogOut, User, ChevronRight, RotateCcw,
  PlusCircle, Settings, TrendingUp, TrendingDown, Minus,
  Calendar, CheckCircle2, AlertCircle, Target, Info,
} from "lucide-react"
import { isOnboardingComplete } from "../types/onboarding"
import { getPlanCycle, getPlannedYears } from "../types/planCycle"
import {
  computeCycleState, formatYearProgress, yearProgressRatio, prorated,
} from "../utils/cycleManager"
import {
  STRATEGIC_FOCUS_LABELS, STRATEGIC_FOCUS_COLORS, STRATEGIC_FOCUS_ICONS,
} from "../types/planCycle"

// Indica se o indicador é um valor de fluxo (precisa prorate) ou taxa/ratio
const IS_FLOW: Record<string, boolean> = {
  receitaBruta: true,
  otbCompra:    true,
  margemBruta:  false,
  pmv:          false,
  giro:         false,
  gmroi:        false,
}

interface UserData { name: string; email: string; profile: string }

function AccTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1.5 flex-shrink-0">
      <Info className="w-3 h-3 text-[#28071C]/20 group-hover:text-[#7598CF] transition-colors cursor-help" />
      <span className="absolute left-0 bottom-full mb-2 w-56 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed font-normal">
        {text}
        <span className="absolute top-full left-3 border-4 border-transparent border-t-[#28071C]" />
      </span>
    </span>
  )
}

// ─── Mock ACC data for current year (May 2026) ────────────────────────────────
// Reference = prorated 2025 historical; ACC = realistic Jan-Mai 2026 actuals
const HIST_2025 = { receita: 2_850_000, margemBruta: 42.3, pmv: 155, otb: 1_140_000, gmroi: 1.77, giro: 4.19 }
const ACC_ACTUAL = { receita: 1_243_750, margemBruta: 41.8, pmv: 162, otb: 498_000, gmroi: 1.82, giro: 1.72 }

function delta(actual: number, ref: number, higherIsBetter = true) {
  const pct = ((actual - ref) / Math.abs(ref)) * 100
  const positive = higherIsBetter ? pct >= 0 : pct <= 0
  return { pct, positive }
}

function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
}

export default function PlanningGateway() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserData | null>(null)
  const [reviewYear, setReviewYear] = useState<number | null>(null)

  const cycleState = useMemo(() => computeCycleState(), [])
  const progressRatio = yearProgressRatio(cycleState.monthsElapsed)
  const progressLabel = formatYearProgress(cycleState)

  useEffect(() => {
    if (!isOnboardingComplete()) { navigate("/onboarding"); return }
    const stored = sessionStorage.getItem("currentUser")
    if (stored) {
      const u = JSON.parse(stored)
      setUser(u)
      if (u.profile !== "CEO") navigate("/dashboard")
    } else navigate("/")
  }, [navigate])

  useEffect(() => {
    if (cycleState.reviewableYears.length > 0) {
      setReviewYear(cycleState.reviewableYears[0])
    }
  }, [cycleState])

  const handleReview = () => {
    if (!reviewYear) return
    const cycle = getPlanCycle(reviewYear)
    navigate("/planning", {
      state: {
        year: reviewYear,
        mode: "review",
        focus: cycle?.focus ?? "margem",
        fieldPriorities: cycle?.fieldPriorities ?? [],
      },
    })
  }

  const handleNewCycle = () => {
    navigate("/planning-setup", {
      state: { year: cycleState.nextNewCycle },
    })
  }

  const handleUseProjectionAsPlan = () => {
    navigate("/planning-setup", {
      state: {
        year: cycleState.currentCalendarYear,
        fromProjection: true,
      },
    })
  }

  const refProrated = {
    receita:     prorated(HIST_2025.receita, cycleState.monthsElapsed),
    margemBruta: HIST_2025.margemBruta,
    pmv:         HIST_2025.pmv,
    otb:         prorated(HIST_2025.otb, cycleState.monthsElapsed),
    gmroi:       HIST_2025.gmroi,
  }

  // All possible ACC rows with their fieldKey for filtering
  const allAccRows = [
    {
      fieldKey: "receitaBruta",
      label: "Receita",
      tooltip: "Total faturado no período. Ponto de partida de todo o planejamento — quanto foi vendido em valor absoluto.",
      ref: fmtBRL(refProrated.receita),
      acc: fmtBRL(ACC_ACTUAL.receita),
      ...delta(ACC_ACTUAL.receita, refProrated.receita),
      unit: "%",
    },
    {
      fieldKey: "margemBruta",
      label: "Margem Bruta",
      tooltip: "Percentual que sobra da receita após o custo dos produtos. Mede a eficiência do mix e da precificação.",
      ref: `${HIST_2025.margemBruta}%`,
      acc: `${ACC_ACTUAL.margemBruta}%`,
      ...delta(ACC_ACTUAL.margemBruta, HIST_2025.margemBruta),
      unit: "pp",
    },
    {
      fieldKey: "pmv",
      label: "PMV",
      tooltip: "Preço Médio de Venda — valor médio por peça vendida. Impacta diretamente a margem e o volume necessário para atingir a receita.",
      ref: fmtBRL(HIST_2025.pmv),
      acc: fmtBRL(ACC_ACTUAL.pmv),
      ...delta(ACC_ACTUAL.pmv, HIST_2025.pmv),
      unit: "%",
    },
    {
      fieldKey: "otbCompra",
      label: "OTB de Compra",
      tooltip: "Orçamento disponível para comprar ou produzir mercadoria no período. Controla o nível de investimento em estoque e o risco financeiro.",
      ref: fmtBRL(refProrated.otb),
      acc: fmtBRL(ACC_ACTUAL.otb),
      ...delta(ACC_ACTUAL.otb, refProrated.otb),
      unit: "%",
    },
    {
      fieldKey: "giro",
      label: "Giro de Estoque",
      tooltip: "Quantas vezes o estoque se renova no período. Giro alto significa menos capital parado e mais liquidez — desejável para moda.",
      ref: HIST_2025.giro.toFixed(2),
      acc: ACC_ACTUAL.giro.toFixed(2),
      ...delta(ACC_ACTUAL.giro, HIST_2025.giro),
      unit: "%",
    },
    {
      fieldKey: "gmroi",
      label: "GMROI",
      tooltip: "Lucro bruto gerado para cada R$ investido em estoque. GMROI > 1 significa retorno positivo sobre o investimento em produtos.",
      ref: HIST_2025.gmroi.toFixed(2),
      acc: ACC_ACTUAL.gmroi.toFixed(2),
      ...delta(ACC_ACTUAL.gmroi, HIST_2025.gmroi),
      unit: "%",
    },
  ]

  // Filter ACC rows by the saved plan's active indicators (if plan exists for current year)
  const currentYearPlan = getPlanCycle(cycleState.currentCalendarYear)
  const activeFieldKeys: Set<string> | null = currentYearPlan
    ? new Set(
        currentYearPlan.fieldPriorities
          .filter(fp => (fp.status ? fp.status !== 'inactive' : fp.isPriority))
          .map(fp => fp.key),
      )
    : null

  const accRows = activeFieldKeys
    ? allAccRows.filter(row => activeFieldKeys.has(row.fieldKey))
    : allAccRows

  const accIsFiltered = activeFieldKeys !== null && accRows.length < allAccRows.length

  // ─── Plan-vs-actual mode: ativo quando há cenário salvo para o ano corrente ──
  const hasSavedPlan = Boolean(currentYearPlan?.versions?.length)
  const planValues   = hasSavedPlan ? currentYearPlan!.versions[0].values : null

  const getPlanProrated = (fieldKey: string): number | null => {
    if (!planValues) return null
    const annual = planValues[fieldKey]
    if (typeof annual !== 'number') return null
    return IS_FLOW[fieldKey] ? prorated(annual, cycleState.monthsElapsed) : annual
  }

  const getProjection = (accVal: number, fieldKey: string): number | null => {
    if (cycleState.monthsElapsed <= 0) return null
    return IS_FLOW[fieldKey]
      ? Math.round(accVal * 12 / cycleState.monthsElapsed)
      : accVal
  }

  const plannedYears = getPlannedYears()

  const lastMonthLabel = cycleState.monthsElapsed > 0
    ? ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][cycleState.monthsElapsed - 1]
    : 'Jan'

  const getAccRaw = (fieldKey: string): number => {
    switch (fieldKey) {
      case 'receitaBruta': return ACC_ACTUAL.receita
      case 'margemBruta':  return ACC_ACTUAL.margemBruta
      case 'pmv':          return ACC_ACTUAL.pmv
      case 'otbCompra':    return ACC_ACTUAL.otb
      case 'giro':         return ACC_ACTUAL.giro
      default:             return ACC_ACTUAL.gmroi
    }
  }

  const fmtVal = (val: number, fieldKey: string): string => {
    if (fieldKey === 'margemBruta') return `${val.toFixed(1)}%`
    if (fieldKey === 'receitaBruta' || fieldKey === 'otbCompra' || fieldKey === 'pmv') return fmtBRL(val)
    return val.toFixed(2)
  }

  if (!user) return null

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <p className="text-[#F6F3AA]/70 text-xs uppercase tracking-widest">Módulo 1</p>
              <p className="text-[#F6F3AA] font-semibold text-lg leading-tight">Planejamento Estratégico — Ano Fiscal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/profile-adjust")}
              className="flex items-center gap-1.5 text-[#F6F3AA]/80 hover:text-[#F6F3AA] text-sm transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Ajustar Perfil</span>
            </button>
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" /><span className="text-sm">{user.name}</span>
            </div>
            <button
              onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/") }}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">

        {/* ─── ACC SECTION ─────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#7598CF]/15 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-[#7598CF]" />
                </div>
                <div>
                  <p className="text-[#28071C] font-semibold text-base">
                    Acompanhamento {cycleState.currentCalendarYear} — Ano em Curso
                  </p>
                  <p className="text-[#28071C]/50 text-xs mt-0.5">{progressLabel}</p>
                </div>
              </div>
              {plannedYears.includes(cycleState.currentCalendarYear) ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />Plano formal registrado
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                  <AlertCircle className="w-3.5 h-3.5" />Usando histórico 2025 como referência
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] text-[#28071C]/40 mb-1.5">
                <span>Jan</span>
                <span>Dez</span>
              </div>
              <div className="h-2 bg-[#28071C]/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] rounded-full transition-all"
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-[#28071C]/40 mt-1 text-right">
                {Math.round(progressRatio * 100)}% do ano transcorrido
              </p>
            </div>
          </div>

          <div className="p-6">
            {hasSavedPlan ? (
              /* ── MODO: HÁ PLANO SALVO → realizado vs plano + projeção (3 colunas) ── */
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px] text-emerald-700 font-semibold uppercase tracking-widest">
                    Performance vs Plano {cycleState.currentCalendarYear}
                  </span>
                  {accIsFiltered && (
                    <span className="ml-auto text-[9px] text-[#7598CF]/70 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF]/60 inline-block" />
                      {accRows.length} indicadores do plano
                    </span>
                  )}
                </div>

                {/* 3 data columns: ACC realizado | vs Plano | Projeção */}
                <div className="grid grid-cols-4 gap-4 mb-2 px-2">
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Indicador</span>
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold text-right">
                    Realizado Jan–{lastMonthLabel}
                  </span>
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold text-right">vs Plano</span>
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold text-right">Projeção Ano</span>
                </div>

                <div className="space-y-1">
                  {accRows.map((row) => {
                    const accRaw     = getAccRaw(row.fieldKey)
                    const planVal    = getPlanProrated(row.fieldKey)
                    const vsPlan     = planVal != null
                      ? ((accRaw - planVal) / Math.abs(planVal)) * 100
                      : null
                    const projection = getProjection(accRaw, row.fieldKey)
                    const isGood     = vsPlan != null && vsPlan >= 0

                    return (
                      <div
                        key={row.label}
                        className="grid grid-cols-4 gap-4 items-center py-2.5 px-2 rounded-lg hover:bg-[#28071C]/4 transition-colors"
                      >
                        <span className="text-[#28071C]/70 text-sm flex items-center">
                          {row.label}
                          {row.tooltip && <AccTooltip text={row.tooltip} />}
                        </span>
                        <span className="text-[#28071C] text-sm text-right font-mono font-semibold">{row.acc}</span>
                        <div className="flex items-center justify-end gap-1">
                          {vsPlan != null ? (
                            <>
                              {isGood
                                ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                              <span className={`text-xs font-semibold ${isGood ? "text-emerald-600" : "text-red-600"}`}>
                                {vsPlan >= 0 ? "+" : ""}{vsPlan.toFixed(1)}%
                              </span>
                            </>
                          ) : <Minus className="w-3.5 h-3.5 text-gray-300" />}
                        </div>
                        <span className="text-[#28071C]/60 text-sm text-right font-mono">
                          {projection != null ? fmtVal(projection, row.fieldKey) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-[#28071C]/8">
                  <p className="text-[9px] text-[#28071C]/30">
                    vs Plano = desvio % sobre meta prorat. ({cycleState.monthsElapsed}/12 do anual para fluxos; valor absoluto para taxas).
                    Projeção = ACC extrapolado para 12 meses.
                  </p>
                </div>
              </>
            ) : (
              /* ── MODO: SEM PLANO → realizado vs ano anterior + projeção (3 colunas) ── */
              <>
                {/* AJUSTE 4 – Aviso claro de ausência de plano */}
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-amber-800 font-semibold">
                        Você ainda não possui um plano salvo para este período.
                      </p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        A projeção apresentada pode ser utilizada como plano inicial,
                        permitindo revisar e ajustar os indicadores do ano corrente.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3 data columns: ACC realizado | vs Ano Anterior | Projeção */}
                <div className="grid grid-cols-4 gap-4 mb-2 px-2">
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Indicador</span>
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold text-right">
                    Realizado Jan–{lastMonthLabel}
                  </span>
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold text-right">
                    vs {cycleState.currentCalendarYear - 1}
                  </span>
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold text-right">Projeção Ano</span>
                </div>

                <div className="space-y-1">
                  {accRows.map((row) => {
                    const accRaw     = getAccRaw(row.fieldKey)
                    const projection = getProjection(accRaw, row.fieldKey)

                    return (
                      <div
                        key={row.label}
                        className="grid grid-cols-4 gap-4 items-center py-2.5 px-2 rounded-lg hover:bg-[#28071C]/4 transition-colors"
                      >
                        <span className="text-[#28071C]/70 text-sm flex items-center">
                          {row.label}
                          {row.tooltip && <AccTooltip text={row.tooltip} />}
                        </span>
                        <span className="text-[#28071C] text-sm text-right font-mono font-semibold">{row.acc}</span>
                        <div className="flex items-center justify-end gap-1">
                          {row.positive
                            ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                            : Math.abs(row.pct) < 0.1
                              ? <Minus className="w-3.5 h-3.5 text-gray-400" />
                              : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                          <span className={`text-xs font-semibold ${row.positive ? "text-emerald-600" : "text-red-600"}`}>
                            {row.pct >= 0 ? "+" : ""}{row.pct.toFixed(1)}{row.unit}
                          </span>
                        </div>
                        <span className="text-[#28071C]/60 text-sm text-right font-mono">
                          {projection != null ? fmtVal(projection, row.fieldKey) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-[#28071C]/8 space-y-1">
                  <p className="text-[9px] text-[#28071C]/30">
                    Referência = {cycleState.monthsElapsed}/12 do fechamento anual {cycleState.currentCalendarYear - 1} (histórico).
                    Projeção = ACC extrapolado para 12 meses com base na performance atual.
                  </p>
                </div>

              </>
            )}
          </div>
        </div>

        {/* ─── ACTION CARDS ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-6">

          {/* REVISAR PLANO EXISTENTE OU PROJEÇÃO */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-[#28071C]/8">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[#7598CF]/15 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4 text-[#7598CF]" />
                </div>
                <h2 className="text-[#28071C] font-semibold text-base">Revisar Plano Existente ou Projeção</h2>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {hasSavedPlan ? (
                /* ── Há plano salvo para o ano corrente ── */
                <>
                  <div className="space-y-2">
                    <p className="text-[#28071C] text-sm font-semibold">Seu plano está em andamento</p>
                    <p className="text-[#28071C]/60 text-sm leading-relaxed">
                      A projeção de fechamento considera sua performance atual e ajuda a identificar ajustes necessários nos indicadores para melhorar o resultado até o fim do período.
                    </p>
                    <p className="text-[#28071C]/70 text-sm">
                      👉 Revise seu plano para capturar oportunidades, corrigir desvios e impulsionar o resultado até o fim do período.
                    </p>
                  </div>

                  <button
                    onClick={handleReview}
                    disabled={!reviewYear}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#7598CF] text-white rounded-xl font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Revisar plano</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Seletor de ano caso haja múltiplos anos revisáveis */}
                  {cycleState.reviewableYears.length > 1 && (
                    <div>
                      <label className="block text-xs text-[#28071C]/50 uppercase tracking-widest font-semibold mb-2">
                        Selecionar ano para revisão
                      </label>
                      <div className="space-y-2">
                        {cycleState.reviewableYears.map((yr) => {
                          const cycle = getPlanCycle(yr)
                          const focus = cycle?.focus
                          return (
                            <button
                              key={yr}
                              onClick={() => setReviewYear(yr)}
                              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                                reviewYear === yr
                                  ? "border-[#7598CF] bg-[#7598CF]/8"
                                  : "border-[#28071C]/10 hover:border-[#7598CF]/40"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[#28071C] font-bold text-lg">{yr}</span>
                                {focus && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${STRATEGIC_FOCUS_COLORS[focus].badge}`}>
                                    {STRATEGIC_FOCUS_ICONS[focus]} {STRATEGIC_FOCUS_LABELS[focus]}
                                  </span>
                                )}
                              </div>
                              {reviewYear === yr && <CheckCircle2 className="w-4 h-4 text-[#7598CF]" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── Sem plano para o ano corrente ── */
                <>
                  <div className="space-y-2">
                    <p className="text-[#28071C] text-sm font-semibold">
                      Você ainda não possui um plano para este período
                    </p>
                    <p className="text-[#28071C]/60 text-sm leading-relaxed">
                      Com base na sua performance atual, geramos uma projeção de fechamento que pode servir como referência para ajuste das suas decisões ao longo deste período.
                    </p>
                    <p className="text-[#28071C]/70 text-sm">
                      👉 Revise os indicadores e adapte os direcionadores para aproveitar oportunidades e melhorar seus resultados ainda neste ciclo.
                    </p>
                  </div>

                  <button
                    onClick={handleUseProjectionAsPlan}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] text-white rounded-xl font-semibold hover:opacity-90 transition-all shadow-sm"
                  >
                    <Target className="w-4 h-4" />
                    <span>Revisar projeção e criar plano</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Seletor de anos passados, se houver */}
                  {cycleState.canReview && (
                    <div>
                      <label className="block text-xs text-[#28071C]/50 uppercase tracking-widest font-semibold mb-2">
                        Ou revisar ano anterior
                      </label>
                      <div className="space-y-2">
                        {cycleState.reviewableYears.map((yr) => {
                          const cycle = getPlanCycle(yr)
                          const focus = cycle?.focus
                          return (
                            <button
                              key={yr}
                              onClick={() => setReviewYear(yr)}
                              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                                reviewYear === yr
                                  ? "border-[#7598CF] bg-[#7598CF]/8"
                                  : "border-[#28071C]/10 hover:border-[#7598CF]/40"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[#28071C] font-bold text-lg">{yr}</span>
                                {focus && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${STRATEGIC_FOCUS_COLORS[focus].badge}`}>
                                    {STRATEGIC_FOCUS_ICONS[focus]} {STRATEGIC_FOCUS_LABELS[focus]}
                                  </span>
                                )}
                              </div>
                              {reviewYear === yr && <CheckCircle2 className="w-4 h-4 text-[#7598CF]" />}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        onClick={handleReview}
                        disabled={!reviewYear}
                        className="w-full mt-3 flex items-center justify-center gap-2 px-6 py-3 bg-[#7598CF]/15 text-[#7598CF] rounded-xl font-semibold hover:bg-[#7598CF]/25 disabled:opacity-40 transition-all"
                      >
                        <span>Abrir revisão {reviewYear}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* NOVO CICLO */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-2 border-[#7598CF]/20">
            <div className="px-6 pt-6 pb-4 border-b border-[#28071C]/8">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[#7598CF] flex items-center justify-center">
                  <PlusCircle className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-[#28071C] font-semibold text-base">Iniciar Novo Ciclo de Planejamento</h2>
              </div>
              <p className="text-[#28071C]/50 text-sm ml-11">
                Defina prioridades estratégicas e inicie o planejamento do próximo ano fiscal.
              </p>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {/* Next cycle info */}
              <div className="bg-[#7598CF]/8 rounded-xl px-5 py-4">
                <p className="text-[10px] text-[#7598CF] uppercase tracking-widest font-semibold mb-1">
                  Próximo ciclo disponível
                </p>
                <p className="text-[#28071C] font-black text-4xl">{cycleState.nextNewCycle}</p>
                <p className="text-[#28071C]/50 text-xs mt-1">
                  {cycleState.plannedYears.length === 0
                    ? "Nenhum plano anterior registrado"
                    : `Após plano de ${cycleState.reviewableYears[0]}`}
                </p>
              </div>

              {/* Steps preview */}
              <div className="space-y-2">
                {[
                  { n: "1", label: "Escolher foco estratégico do ano" },
                  { n: "2", label: "Definir prioridade dos indicadores" },
                  { n: "3", label: "Lançar metas e cenários" },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-3 text-sm text-[#28071C]/60">
                    <span className="w-5 h-5 rounded-full bg-[#7598CF]/20 text-[#7598CF] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {step.n}
                    </span>
                    {step.label}
                  </div>
                ))}
              </div>

              <button
                onClick={handleNewCycle}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] text-white rounded-xl font-semibold hover:opacity-90 transition-all shadow-md mt-auto"
              >
                <TrendingUp className="w-4 h-4" />
                <span>Configurar e iniciar {cycleState.nextNewCycle}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ─── CYCLE INDEX ─────────────────────────────────────────────────── */}
        {plannedYears.length > 0 && (
          <div className="bg-white/50 backdrop-blur-sm rounded-xl px-6 py-4 shadow-sm">
            <p className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold mb-3">
              Histórico de ciclos planejados
            </p>
            <div className="flex gap-3 flex-wrap">
              {plannedYears.map((yr) => {
                const cycle = getPlanCycle(yr)
                const focus = cycle?.focus
                return (
                  <div
                    key={yr}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-[#28071C]/10 text-sm"
                  >
                    <span className="font-semibold text-[#28071C]">{yr}</span>
                    {focus && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STRATEGIC_FOCUS_COLORS[focus].badge}`}>
                        {STRATEGIC_FOCUS_ICONS[focus]}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
