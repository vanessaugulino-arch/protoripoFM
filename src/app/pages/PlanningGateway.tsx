import { useEffect, useState, useMemo, useRef } from "react"
import { useNavigate } from "react-router"
import { supabase } from "../../lib/supabase"
import { getOfficialPlan, type OfficialMacro } from "../../services/supabase/officialPlanService"
import {
  ArrowLeft, LogOut, User, ChevronRight, RotateCcw,
  PlusCircle, Settings, TrendingUp, TrendingDown, Minus,
  Calendar, CheckCircle2, AlertCircle, Target, Info, HelpCircle, Layers,
} from "lucide-react"
import { isOnboardingComplete } from "../types/onboarding"
import { getPlanCycle, getPlannedYears } from "../types/planCycle"
import { ProductTour, type TourStep } from "../components/ProductTour"
import { useTour } from "../hooks/useTour"

const PLANNING_GATEWAY_TOUR: TourStep[] = [
  {
    targetId: "tour-pg-title",
    title: "Módulo 1 — Planejamento Estratégico",
    content: "Aqui você define a meta macro do ciclo: receita, margem e Orçamento Previsto. Os outros módulos partem desses números.",
  },
  {
    targetId: "tour-pg-acc",
    title: "Acompanhamento do Ano em Curso",
    content: "Compare os indicadores acumulados (ACC) com a referência histórica. Isso fundamenta a meta que você vai definir ou revisar.",
  },
  {
    targetId: "tour-pg-actions",
    title: "Ações do Ciclo",
    content: "Revise um plano existente ou inicie um novo ciclo. Em cada ação você simula cenários, salva e compara antes de aplicar formalmente.",
  },
]
import {
  computeCycleState, formatYearProgress, yearProgressRatio, prorated,
} from "../utils/cycleManager"
import {
  STRATEGIC_FOCUS_LABELS, STRATEGIC_FOCUS_COLORS, STRATEGIC_FOCUS_ICONS,
} from "../types/planCycle"

// Indica se o indicador é um valor de fluxo (precisa prorate) ou taxa/ratio
const IS_FLOW: Record<string, boolean> = {
  receitaBruta: true,
  orcamento:    true,
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
      <span className="absolute left-0 bottom-full mb-2 w-56 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed font-normal">
        {text}
        <span className="absolute top-full left-3 border-4 border-transparent border-t-[#28071C]" />
      </span>
    </span>
  )
}

// Estimativa de margem bruta quando custo não está disponível no banco
const MARGEM_EST = 40.0

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
  const tour = useTour("planning-gateway")

  const cycleState = useMemo(() => computeCycleState(), [])
  const progressRatio = yearProgressRatio(cycleState.monthsElapsed)
  const progressLabel = formatYearProgress(cycleState)

  // ── Dados históricos reais do Supabase (substituem constantes mock) ──────────
  interface RawHistRow { receita: number; pmv: number; estoque_medio_pecas: number }
  interface HistMetrics { receita: number; margemBruta: number; pmv: number; orcamento: number; giro: number; gmroi: number }
  const [histData, setHistData] = useState<{
    cy: RawHistRow | null
    py: RawHistRow | null
    loaded: boolean
  }>({ cy: null, py: null, loaded: false })
  const histFetched = useRef(false)

  // ── Plano Oficial: macro projetado bottom-up (dos níveis inferiores aplicados) ─
  const [officialMacro, setOfficialMacro] = useState<OfficialMacro | null>(null)
  const [officialLevel, setOfficialLevel] = useState<number>(1)
  const officialFetched = useRef(false)

  useEffect(() => {
    if (histFetched.current) return
    histFetched.current = true
    const tenantId =
      sessionStorage.getItem("activeTenantId") ??
      (() => { try { return JSON.parse(sessionStorage.getItem("currentUser") ?? "{}").tenant_id } catch { return null } })()
    if (!tenantId) { setHistData(d => ({ ...d, loaded: true })); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Promise.resolve((supabase as any).rpc("get_sales_historical_summary", { p_tenant_id: tenantId }))
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (error || !Array.isArray(data) || data.length === 0) {
          setHistData(d => ({ ...d, loaded: true })); return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const find = (yr: number) => (data as any[]).find(r => Number(r.year) === yr) ?? null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapRow = (r: any): RawHistRow | null => r ? {
          receita:              Number(r.receita),
          pmv:                  Number(r.pmv),
          estoque_medio_pecas:  Number(r.estoque_medio_pecas),
        } : null
        setHistData({
          cy:     mapRow(find(cycleState.currentCalendarYear)),
          py:     mapRow(find(cycleState.currentCalendarYear - 1)),
          loaded: true,
        })
      })
      .catch(() => setHistData(d => ({ ...d, loaded: true })))
  }, [cycleState.currentCalendarYear])

  // Carrega o Plano Oficial do ciclo corrente: se um nível inferior (canal, M2+)
  // já foi aplicado, exibimos o macro PROJETADO bottom-up ao lado da meta do M1.
  useEffect(() => {
    if (officialFetched.current) return
    officialFetched.current = true
    const tenantId =
      sessionStorage.getItem("activeTenantId") ??
      (() => { try { return JSON.parse(sessionStorage.getItem("currentUser") ?? "{}").tenant_id } catch { return null } })()
    if (!tenantId) return
    getOfficialPlan(tenantId, cycleState.currentCalendarYear)
      .then(plan => {
        if (!plan) return
        setOfficialLevel(plan.detailLevel)
        setOfficialMacro(plan.macro)
      })
      .catch(() => { /* silencioso — o gateway funciona sem o plano oficial */ })
  }, [cycleState.currentCalendarYear])

  const buildMetrics = (row: RawHistRow | null): HistMetrics | null => {
    if (!row) return null
    const { receita, pmv, estoque_medio_pecas } = row
    const estRS  = estoque_medio_pecas * pmv
    const giro   = estRS > 0 ? +( receita / estRS ).toFixed(2) : 0
    const gmroi  = +( (MARGEM_EST / 100) * giro ).toFixed(2)
    return {
      receita,
      margemBruta: MARGEM_EST,
      pmv,
      orcamento:   Math.round(receita * 0.40),
      giro,
      gmroi,
    }
  }

  // histPY = referência (ano anterior completo); accCY = realizado do ano corrente
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const histPY = useMemo(() => buildMetrics(histData.py), [histData.py])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const accCY  = useMemo(() => buildMetrics(histData.cy), [histData.cy])

  const hasAccData = histData.loaded && (accCY !== null || histPY !== null)

  useEffect(() => {
    if (!isOnboardingComplete()) { navigate("/onboarding"); return }
    const stored = sessionStorage.getItem("currentUser")
    if (stored) {
      const u = JSON.parse(stored)
      setUser(u)
      const hasAccess = u.profile === "CEO" || u.system_role === "support" || u.system_role === "client_admin"
      if (!hasAccess) navigate("/dashboard")
    } else navigate("/")
  }, [navigate])

  useEffect(() => {
    if (cycleState.reviewableYears.length > 0) {
      setReviewYear(cycleState.reviewableYears[0])
    }
  }, [cycleState])

  const handleReview = () => {
    if (!reviewYear) return
    // Revisão de meio de ciclo NÃO redefine o foco (isso descaracterizaria o plano
    // vigente). Vai direto à tela de indicadores, herdando foco e prioridades já
    // definidos no ciclo. Só cai no setup se, por algum motivo, o ciclo não existir.
    const cycle = getPlanCycle(reviewYear)
    if (cycle) {
      // Projeção de fim de ano por indicador (ACC realizado extrapolado para 12
      // meses nos fluxos; taxas mantidas). Alimenta a coluna "Projeção" da tela de
      // indicadores para orientar a revisão de meio de ciclo.
      const projection = accCY ? {
        receitaBruta: getProjection(accCY.receita,   "receitaBruta"),
        margemBruta:  accCY.margemBruta,
        pmv:          accCY.pmv,
        orcamento:    getProjection(accCY.orcamento, "orcamento"),
        giro:         accCY.giro,
        gmroi:        accCY.gmroi,
      } : null
      navigate("/planning", {
        state: {
          year: reviewYear,
          mode: "review",
          focus: cycle.focus,
          ...(cycle.customFocusName ? { customFocusName: cycle.customFocusName } : {}),
          fieldPriorities: cycle.fieldPriorities,
          ...(projection ? { projection } : {}),
        },
      })
    } else {
      navigate("/planning-setup", { state: { year: reviewYear, mode: "review" } })
    }
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
    receita:     prorated(histPY?.receita ?? 0, cycleState.monthsElapsed),
    margemBruta: histPY?.margemBruta ?? MARGEM_EST,
    pmv:         histPY?.pmv ?? 0,
    orcamento:   prorated(histPY?.orcamento ?? 0, cycleState.monthsElapsed),
    gmroi:       histPY?.gmroi ?? 0,
  }

  // Helpers para exibição segura de nulos
  const fmtSafe = (v: number | null | undefined, fmt: (n: number) => string) =>
    v != null && v !== 0 ? fmt(v) : "—"
  const deltaSafe = (actual: number | null | undefined, ref: number | null | undefined, higherIsBetter = true) =>
    actual != null && ref != null && ref !== 0
      ? delta(actual, ref, higherIsBetter)
      : { pct: 0, positive: true }

  // All possible ACC rows with their fieldKey for filtering
  const allAccRows = [
    {
      fieldKey: "receitaBruta",
      label: "Receita",
      tooltip: "Total faturado no período. Ponto de partida de todo o planejamento — quanto foi vendido em valor absoluto.",
      ref: fmtSafe(refProrated.receita, fmtBRL),
      acc: fmtSafe(accCY?.receita, fmtBRL),
      ...deltaSafe(accCY?.receita, refProrated.receita),
      unit: "%",
    },
    {
      fieldKey: "margemBruta",
      label: "Margem Bruta",
      tooltip: "Percentual que sobra da receita após o custo dos produtos. Mede a eficiência do mix e da precificação. Estimativa: custo não disponível nas vendas importadas.",
      ref: `${refProrated.margemBruta.toFixed(1)}%`,
      acc: accCY ? `${accCY.margemBruta.toFixed(1)}% *` : "—",
      ...deltaSafe(accCY?.margemBruta, histPY?.margemBruta),
      unit: "pp",
    },
    {
      fieldKey: "pmv",
      label: "PMV",
      tooltip: "Preço Médio de Venda — valor médio por peça vendida. Impacta diretamente a margem e o volume necessário para atingir a receita.",
      ref: fmtSafe(refProrated.pmv, fmtBRL),
      acc: fmtSafe(accCY?.pmv, fmtBRL),
      ...deltaSafe(accCY?.pmv, histPY?.pmv),
      unit: "%",
    },
    {
      fieldKey: "orcamento",
      label: "Orçamento Previsto",
      tooltip: "Estimativa de investimento previsto (40% da receita — aproximação quando custo não está disponível).",
      ref: fmtSafe(refProrated.orcamento, fmtBRL),
      acc: accCY ? `${fmtBRL(accCY.orcamento)} *` : "—",
      ...deltaSafe(accCY?.orcamento, refProrated.orcamento),
      unit: "%",
    },
    {
      fieldKey: "giro",
      label: "Giro de Estoque",
      tooltip: "Quantas vezes o estoque se renova no período. Estimado via estoque médio em peças e PMV.",
      ref: fmtSafe(histPY?.giro, v => v.toFixed(2)),
      acc: fmtSafe(accCY?.giro, v => v.toFixed(2)),
      ...deltaSafe(accCY?.giro, histPY?.giro),
      unit: "%",
    },
    {
      fieldKey: "gmroi",
      label: "GMROI",
      tooltip: "Lucro bruto gerado para cada R$ investido em estoque. GMROI > 1 significa retorno positivo sobre o investimento em produtos.",
      ref: fmtSafe(refProrated.gmroi, v => v.toFixed(2)),
      acc: fmtSafe(accCY?.gmroi, v => v.toFixed(2)),
      ...deltaSafe(accCY?.gmroi, histPY?.gmroi),
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

  // Só filtra pelos indicadores priorizados quando existe um plano SALVO (com
  // versões). Sem plano salvo, o acompanhamento mostra TODOS os indicadores
  // comparados ao ano anterior — evita tabela vazia quando há apenas um ciclo-stub
  // (foco/prioridades definidos no setup, mas nenhuma meta salva ainda).
  const hasSavedPlan = Boolean(currentYearPlan?.versions?.length)
  const accRows = (activeFieldKeys && hasSavedPlan)
    ? allAccRows.filter(row => activeFieldKeys.has(row.fieldKey))
    : allAccRows

  const accIsFiltered = activeFieldKeys !== null && hasSavedPlan && accRows.length < allAccRows.length

  // ─── Plan-vs-actual mode: ativo quando há cenário salvo para o ano corrente ──
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
    if (!accCY) return 0
    switch (fieldKey) {
      case 'receitaBruta': return accCY.receita
      case 'margemBruta':  return accCY.margemBruta
      case 'pmv':          return accCY.pmv
      case 'orcamento':    return accCY.orcamento
      case 'giro':         return accCY.giro
      default:             return accCY.gmroi
    }
  }

  const fmtVal = (val: number, fieldKey: string): string => {
    if (fieldKey === 'margemBruta') return `${val.toFixed(1)}%`
    if (fieldKey === 'receitaBruta' || fieldKey === 'orcamento' || fieldKey === 'pmv') return fmtBRL(val)
    return val.toFixed(2)
  }

  if (!user) return null

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div id="tour-pg-title">
              <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Módulo 1</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Planejamento Estratégico</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button
              onClick={tour.reopen}
              className="text-[#F6F3AA]/60 hover:text-[#F6F3AA] transition-opacity"
              title="Ver tour de apresentação"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/") }}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">

        {/* ─── FRASE DE CONTEXTO ───────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-[#28071C]/5 to-[#7598CF]/10 border border-[#7598CF]/20 rounded-2xl px-6 py-4 text-center">
          <p className="text-[#28071C] font-semibold text-base leading-snug">
            Defina a <span className="text-[#7598CF]">meta macro do ciclo</span> — receita, margem e Orçamento Previsto — e inicie o fluxo do macro ao sortimento. Todos os módulos seguintes partem destes números.
          </p>
        </div>

        {/* ─── ACC SECTION ─────────────────────────────────────────────────── */}
        <div id="tour-pg-acc" className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
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
              {hasSavedPlan ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />Plano formal registrado
                </span>
              ) : hasAccData ? (
                <span className="flex items-center gap-1.5 text-xs text-[#7598CF] bg-[#7598CF]/10 border border-[#7598CF]/30 rounded-full px-3 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />Dados reais importados
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                  <AlertCircle className="w-3.5 h-3.5" />Sem histórico de vendas importado
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
            {/* Loading state */}
            {!histData.loaded && (
              <div className="flex items-center justify-center py-8 gap-3 text-[#28071C]/40">
                <div className="w-4 h-4 border-2 border-[#7598CF]/40 border-t-[#7598CF] rounded-full animate-spin" />
                <span className="text-sm">Carregando histórico de vendas…</span>
              </div>
            )}

            {/* Sem dados importados */}
            {histData.loaded && !hasAccData && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p className="text-[#28071C] font-semibold text-sm">Nenhum histórico de vendas encontrado</p>
                <p className="text-[#28071C]/55 text-xs max-w-sm leading-relaxed">
                  Importe o histórico de vendas em <strong>Configurações → Importar dados → Histórico de Vendas</strong> para visualizar os indicadores reais de acompanhamento.
                </p>
              </div>
            )}

            {histData.loaded && hasAccData && (hasSavedPlan ? (
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
              /* (só renderiza quando histData.loaded && hasAccData, ver condição externa) */
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
                    Referência = {cycleState.monthsElapsed}/12 do fechamento anual {cycleState.currentCalendarYear - 1} (histórico real importado).
                    Projeção = ACC extrapolado para 12 meses com base na performance atual.
                    * Margem e Orçamento estimados (40% da receita) — importe custo de produtos para cálculo preciso.
                  </p>
                </div>

              </>
            ))}
          </div>
        </div>

        {/* ─── PROJEÇÃO BOTTOM-UP (Plano Oficial) ──────────────────────────── */}
        {officialMacro && officialLevel >= 2 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border border-[#7598CF]/20">
            <div className="px-6 py-4 border-b border-[#28071C]/8 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#7598CF]/15 flex items-center justify-center">
                <Layers className="w-4 h-4 text-[#7598CF]" />
              </div>
              <div>
                <p className="text-[#28071C] font-semibold text-base">Projeção bottom-up (canais aplicados)</p>
                <p className="text-[#28071C]/50 text-xs mt-0.5">
                  Macro recalculado a partir do Módulo 2 pela soma dos absolutos. É a projeção — não substitui a meta que você definir no plano.
                </p>
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Receita Bruta", val: fmtBRL(officialMacro.receitaBruta) },
                { label: "Margem Bruta",  val: `${officialMacro.margemBruta.toFixed(1)}%` },
                { label: "PMV",           val: fmtBRL(officialMacro.pmv) },
                { label: "Giro",          val: `${officialMacro.giro.toFixed(2)}x` },
                { label: "GMROI",         val: `${officialMacro.gmroi.toFixed(2)}x` },
                { label: "Cobertura",     val: `${Math.round(officialMacro.cobertura)} dias` },
                { label: "MKD %",         val: `${officialMacro.mkdPct.toFixed(1)}%` },
                { label: "Orçamento",     val: fmtBRL(officialMacro.orcamento) },
              ].map(({ label, val }) => (
                <div key={label} className="bg-[#7598CF]/5 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold">{label}</p>
                  <p className="text-[#28071C] font-bold text-sm mt-0.5 font-mono">{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── ACTION CARDS ────────────────────────────────────────────────── */}
        <div id="tour-pg-actions" className="grid grid-cols-2 gap-6">

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
                <p className="text-[#28071C] font-black text-3xl">{cycleState.nextNewCycle}</p>
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

      {tour.isOpen && (
        <ProductTour steps={PLANNING_GATEWAY_TOUR} onClose={tour.dismiss} />
      )}
    </div>
  )
}
