// src/app/pages/Planning.tsx — v5 (3-column layout)
import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from '../../lib/supabase';
import { useNavigate, useLocation } from "react-router";
import { usePlanningEngine } from '../../hooks/usePlanningEngine'
import { PlanningField } from '../../components/PlanningField'
import {
  ArrowLeft, LogOut, User, Save, Download, CheckCircle,
  ArrowUp, ArrowDown, ChevronDown, Lock, TrendingUp, TrendingDown,
  Minus, Star, RotateCcw, Settings, GitCompare, CheckCheck, X, Info,
  ToggleLeft, ToggleRight, FileDown, HelpCircle,
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import { exportToPDF } from '../../utils/exportPDF';
import { getStoredProfile, isOnboardingComplete } from '../types/onboarding'
import { getActiveIndicators, INDICATOR_META } from '../utils/indicatorRules'
import {
  STRATEGIC_FOCUS_LABELS, STRATEGIC_FOCUS_ICONS, STRATEGIC_FOCUS_COLORS,
  addVersionToCycle, getPlanCycle,
} from '../types/planCycle'
import type { PlanFieldPriority, StrategicFocus, PlanMode } from '../types/planCycle'

const PLANNING_TOUR: TourStep[] = [
  {
    targetId: "tour-plan-indicators",
    title: "Coluna de Indicadores",
    content: "Aqui ficam as metas editáveis do ciclo. Altere qualquer valor e o painel central atualiza instantaneamente — você está em modo simulação, sem compromisso com nenhum número ainda.",
  },
  {
    targetId: "tour-plan-central",
    title: "Painel Central — Impacto em Tempo Real",
    content: "Cada ajuste nos indicadores reflete aqui de imediato. Compare o valor que você está construindo com o histórico selecionado e veja o delta de cada decisão antes de confirmar.",
  },
  {
    targetId: "tour-plan-scenarios",
    title: "Salve e Compare Cenários",
    content: "Clique em 'Salvar cenário' para registrar o momento atual. Crie quantos cenários quiser — conservador, moderado, agressivo — depois abra a comparação lado a lado e escolha o melhor antes de aplicar.",
  },
  {
    targetId: "tour-plan-compare",
    title: "Comparativo de Cenários",
    content: "O botão 'Comparar' exibe uma tabela com todos os cenários salvos. Analise as diferenças de receita, margem e Orçamento de uma vez e aplique o cenário vencedor com um clique.",
  },
  {
    targetId: "tour-plan-macro",
    title: "Contexto Macroeconômico",
    content: "A barra superior reúne indicadores setoriais (IPCA, Selic, PMC) e dados do seu segmento de moda. Use esses dados para calibrar o quanto você pode crescer acima do mercado.",
  },
];

interface UserData { id?: string; name: string; email: string; profile: string }
interface LocationState {
  year: number
  mode: PlanMode
  focus?: StrategicFocus
  customFocusName?: string
  fieldPriorities?: PlanFieldPriority[]
}

// ─── Historical database ──────────────────────────────────────────────────────
interface HistoricalData {
  year: string; receita: number; margemBruta: number; pmv: number;
  orcamento: number; estoqueMedioRS: number; estoqueMedioPecas: number;
  giro: number; cobertura: number; markdown: number; producao: number; gmroi: number;
  ticketMedio: number;
}

// Fallback (demo) — substituído por dados reais do Supabase após login
const HIST_FALLBACK: HistoricalData[] = [
  { year: "2023", receita: 2450000, margemBruta: 40.5, pmv: 145, orcamento: 1050000,
    estoqueMedioRS: 720000, estoqueMedioPecas: 4965, giro: 3.85, cobertura: 78,
    markdown: 165000, producao: 16890, gmroi: 1.55, ticketMedio: 290 },
  { year: "2024", receita: 2700000, margemBruta: 42.0, pmv: 158, orcamento: 1100000,
    estoqueMedioRS: 695000, estoqueMedioPecas: 4398, giro: 4.05, cobertura: 75,
    markdown: 148000, producao: 17850, gmroi: 1.70, ticketMedio: 315 },
  { year: "2025", receita: 2850000, margemBruta: 42.3, pmv: 155, orcamento: 1140000,
    estoqueMedioRS: 680000, estoqueMedioPecas: 4387, giro: 4.19, cobertura: 72,
    markdown: 142500, producao: 18387, gmroi: 1.77, ticketMedio: 320 },
]

const CUSTO_MEDIO_DEFAULT = 85 // fallback: custo estimado por peça

// ─── Field definitions ────────────────────────────────────────────────────────
type FieldFormat = "currency" | "percent" | "days" | "pieces" | "index"

interface FieldDef {
  key: string
  label: string
  format: FieldFormat
  getValue: (v: ReturnType<typeof usePlanningEngine>["current"]["values"]) => number | null
  getState: (s: ReturnType<typeof usePlanningEngine>["current"]["states"]) => string
  getHelp: (refYear: string, histRef: HistoricalData, baseline: { mkdPct: number }) => string
  isCalc?: boolean
}

const FIELD_DEFS: FieldDef[] = [
  {
    key: "receitaBruta", label: "Receita Bruta (R$)", format: "currency",
    getValue: v => v.receitaBruta, getState: s => s.receitaBruta,
    getHelp: (y, h) => `Base ${y}: R$ ${h.receita.toLocaleString("pt-BR")}`,
  },
  {
    key: "margemBruta", label: "Margem Bruta (%)", format: "percent",
    getValue: v => v.margemBruta, getState: s => s.margemBruta,
    getHelp: (y, h) => `Base ${y}: ${h.margemBruta}%`,
  },
  {
    key: "pmv", label: "PMV (R$)", format: "currency",
    getValue: v => v.pmv, getState: s => s.pmv,
    getHelp: (y, h) => `Base ${y}: R$ ${h.pmv}`,
  },
  {
    key: "orcamento", label: "Orçamento Previsto (R$)", format: "currency",
    getValue: v => v.orcamento, getState: s => s.orcamento,
    getHelp: (y, h) => `Base ${y}: R$ ${h.orcamento.toLocaleString("pt-BR")}`,
  },
  {
    key: "giro", label: "Giro (R$)", format: "index",
    getValue: v => v.giro, getState: s => s.giro,
    getHelp: (y, h) => `Base ${y}: ${h.giro}x — Receita Líquida ÷ Estoque Médio (R$)`,
  },
  {
    key: "cobertura", label: "Cobertura (dias)", format: "days",
    getValue: v => v.cobertura, getState: s => s.cobertura,
    getHelp: (y, h) => `Base ${y}: ${h.cobertura} dias`,
  },
  {
    key: "producaoPecas", label: "Produção (peças)", format: "pieces",
    getValue: v => v.producaoPecas, getState: s => s.producaoPecas,
    getHelp: (y, h) => `Base ${y}: ${h.producao.toLocaleString("pt-BR")} pç`,
  },
  {
    key: "mkdPct", label: "Markdown (%)", format: "percent",
    getValue: v => v.mkdPct, getState: s => s.mkdPct,
    getHelp: (y, _h, b) => `Base ${y}: ${b.mkdPct}%`,
  },
  {
    key: "custoMedio", label: "Custo Médio (R$)", format: "currency",
    getValue: v => v.custoMedio, getState: s => s.custoMedio,
    getHelp: () => "Custo médio por peça — base para Orçamento e GMROI",
  },
  {
    key: "ticketMedio", label: "Ticket Médio (R$)", format: "currency",
    getValue: v => v.ticketMedio, getState: s => s.ticketMedio,
    getHelp: (y, h) => `Base ${y}: R$ ${h.ticketMedio} — Receita Bruta ÷ nº de clientes`,
  },
  {
    key: "pecasVendidas", label: "Peças Vendidas", format: "pieces",
    getValue: v => v.pecasVendidas, getState: s => s.pecasVendidas,
    getHelp: (y, _h) => `Base ${y}: Receita Líquida ÷ PMV`,
  },
  {
    key: "mkdRS", label: "Markdown (R$)", format: "currency", isCalc: true,
    getValue: v => v.mkdRS, getState: () => "calculated",
    getHelp: (y, h) => `Base ${y}: R$ ${h.markdown.toLocaleString("pt-BR")}`,
  },
  {
    key: "totalPecas", label: "Total de Peças (Orçamento)", format: "pieces", isCalc: true,
    getValue: v => v.totalPecas, getState: () => "calculated",
    getHelp: (y, h) => `Base ${y}: ${h.producao.toLocaleString("pt-BR")} pç — Compras + Produção`,
  },
  {
    key: "gmroi", label: "GMROI", format: "index", isCalc: true,
    getValue: v => v.gmroi, getState: () => "calculated",
    getHelp: (y, h) => `Base ${y}: ${h.gmroi}`,
  },
  {
    key: "estoqueMedioPecas", label: "Estoque Médio (peças)", format: "pieces", isCalc: true,
    getValue: v => v.estoqueMedioPecas, getState: () => "calculated",
    getHelp: (y, h) => `Base ${y}: ${h.estoqueMedioPecas.toLocaleString("pt-BR")} pç — Estoque Médio R$ ÷ Custo Médio`,
  },
  {
    key: "giroUnidades", label: "Giro (peças)", format: "index", isCalc: true,
    getValue: v => v.giroUnidades, getState: () => "calculated",
    getHelp: (y, h) => `Base ${y}: ${h.giro}x — Peças Vendidas ÷ Estoque Médio (peças)`,
  },
  {
    key: "idadeMediaEstoque", label: "Idade Média de Estoque (dias)", format: "days", isCalc: true,
    getValue: v => v.idadeMediaEstoque, getState: () => "calculated",
    getHelp: (y, h) => `Base ${y}: ${Math.round(365 / h.giro)} dias — Σ(dias × qtd SKU) ÷ Qtd Total em Estoque`,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function Planning() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const routeState = (location.state ?? null) as LocationState | null
  const tour       = useTour("planning-main")

  const [user,               setUser]               = useState<UserData | null>(null)
  const [tenantId,           setTenantId]           = useState<string>("")
  const [isAccordionOpen,    setIsAccordionOpen]    = useState(false)
  const [selectedHistorical, setSelectedHistorical] = useState("2025")

  // ── Histórico real do Supabase (substitui HIST_FALLBACK após carga) ──────────
  const [historicalDatabase, setHistoricalDatabase] = useState<HistoricalData[]>(HIST_FALLBACK)
  const [histLoading,        setHistLoading]        = useState(false)
  const [histIsReal,         setHistIsReal]         = useState(false)  // true = dados reais carregados
  const histFetched = useRef(false)

  // Save dialog
  const [saveDialogOpen,   setSaveDialogOpen]   = useState(false)
  const [scenarioNameInput, setScenarioNameInput] = useState("")

  // Compare modal
  const [compareOpen, setCompareOpen] = useState(false)

  // Balloon de simulação — some quando o usuário começa a editar
  const [simBalloonVisible, setSimBalloonVisible] = useState(true)
  const [simBalloonFading,  setSimBalloonFading]  = useState(false)
  const dismissSimBalloon = () => {
    setSimBalloonFading(true)
    setTimeout(() => setSimBalloonVisible(false), 350)
  }

  // Receita toggle: input em valor absoluto (R$) ou percentual de crescimento (%)
  const [receitaMode, setReceitaMode] = useState<'value' | 'percent'>('value')
  const [receitaPctStr, setReceitaPctStr] = useState<string>('')

  // ── Derive from route state ──────────────────────────────────────────────
  const year          = routeState?.year ?? new Date().getFullYear() + 1
  const mode          = routeState?.mode ?? "new"
  const focus         = routeState?.focus ?? null
  const isCustomFocus = focus === 'custom'

  // customFocusName: prefer route state, fallback to localStorage
  const customFocusName = useMemo(() => {
    if (!isCustomFocus) return ''
    if (routeState?.customFocusName) return routeState.customFocusName
    const cycle = getPlanCycle(year)
    return cycle?.customFocusName ?? ''
  }, [isCustomFocus, routeState, year])

  const focusDisplayLabel = isCustomFocus
    ? (customFocusName || 'Foco Personalizado')
    : (focus ? STRATEGIC_FOCUS_LABELS[focus] : null)

  const fieldPriorities: PlanFieldPriority[] = routeState?.fieldPriorities ?? []

  const getHist = (yr: string) =>
    historicalDatabase.find(d => d.year === yr) ?? historicalDatabase[historicalDatabase.length - 1]

  const referenceYear = useMemo(() => {
    const y = String(year - 1)
    return historicalDatabase.find(d => d.year === y)
      ? y
      : (historicalDatabase[historicalDatabase.length - 1]?.year ?? "2025")
  }, [year, historicalDatabase])

  const histRef  = getHist(referenceYear)
  const histSel  = getHist(selectedHistorical)

  const baseline = useMemo(() => {
    const devolucoes     = Math.round(histRef.receita * 0.05)   // 5% de devoluções estimadas
    const receitaLiquida = histRef.receita - devolucoes
    const pecasVendidas  = Math.round(receitaLiquida / histRef.pmv)
    const custoMedio     = CUSTO_MEDIO_DEFAULT
    return {
      receitaBruta:      histRef.receita,
      devolucoes,
      receitaLiquida,
      margemBruta:       histRef.margemBruta,
      pmv:               histRef.pmv,
      pecasVendidas,
      giro:              histRef.giro,
      cobertura:         histRef.cobertura,
      orcamento:         histRef.orcamento,
      producaoPecas:     histRef.producao,
      mkdPct:            +((histRef.markdown / histRef.receita) * 100).toFixed(1),
      custoMedio,
      gmroi:             histRef.gmroi,
      ticketMedio:       histRef.ticketMedio,
      estoqueMediao:     histRef.estoqueMedioRS,
      estoqueMedioPecas: histRef.estoqueMedioPecas,
    }
  }, [histRef, referenceYear])

  // activeKeysList deve vir ANTES do hook (hook fecha sobre ela)
  const activeKeysList = useMemo(() => {
    if (fieldPriorities.length === 0) return undefined
    const isActiveFP = (fp: PlanFieldPriority) =>
      fp.status ? fp.status !== 'inactive' && fp.status !== 'dismissed' : fp.isPriority
    return fieldPriorities
      .filter(isActiveFP)
      .sort((a, b) => a.rank - b.rank)
      .map(fp => fp.key)
  }, [fieldPriorities])

  const {
    current, isDirty, activeScenario, scenarios,
    setField, unlock, saveScenario, loadScenario, reset,
  } = usePlanningEngine(year, baseline, activeKeysList, tenantId || undefined, user?.id)

  const v = current.values
  const s = current.states

  useEffect(() => {
    if (!isOnboardingComplete()) { navigate("/onboarding"); return }
    if (!routeState) { navigate("/planning-gateway"); return }
    const stored = sessionStorage.getItem("currentUser")
    if (stored) {
      const u = JSON.parse(stored)
      setUser(u)
      setTenantId(sessionStorage.getItem("activeTenantId") ?? u.tenant_id ?? "")
      const effectiveProfile =
        u.system_role === "support" || u.system_role === "client_admin"
          ? "CEO"
          : u.profile
      if (effectiveProfile !== "CEO") navigate("/dashboard")
    } else navigate("/")
  }, [navigate, routeState])

  // ── Auto-dismiss do balloon quando o usuário começa a editar ─────────────────
  useEffect(() => {
    if (isDirty && simBalloonVisible && !simBalloonFading) dismissSimBalloon()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty])

  // ── Buscar histórico real de vendas do Supabase ──────────────────────────────
  useEffect(() => {
    if (!tenantId || histFetched.current) return
    histFetched.current = true
    setHistLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = (supabase as any).rpc('get_sales_historical_summary', { p_tenant_id: tenantId })
    Promise.resolve(rpc)
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        const rows = Array.isArray(data) ? data : []
        if (error || rows.length === 0) return
        const MARGEM_BRUTA = 40.0 // % — estimativa padrão quando custo não disponível
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const built: HistoricalData[] = rows.map((row: any) => {
          const receita           = Number(row.receita)
          const pmv               = Number(row.pmv)
          const markdown          = Number(row.markdown)
          const producao          = Number(row.producao)
          const ticketMedio       = Math.round(Number(row.ticket_medio))
          const estoqueMedioPecas = Number(row.estoque_medio_pecas)
          // Estoque médio RS estimado via preço unitário médio de venda
          const estoqueMedioRS  = Math.round(estoqueMedioPecas * pmv)
          const giro            = estoqueMedioRS > 0
            ? +( receita / estoqueMedioRS ).toFixed(2)
            : 4.0
          const cobertura       = giro > 0 ? Math.round(365 / giro) : 90
          const gmroi           = +( (MARGEM_BRUTA / 100) * giro ).toFixed(2)
          return {
            year:              row.year,
            receita,
            margemBruta:       MARGEM_BRUTA,
            pmv,
            orcamento:         Math.round(receita * 0.40),
            estoqueMedioRS,
            estoqueMedioPecas,
            giro,
            cobertura,
            markdown,
            producao,
            gmroi,
            ticketMedio,
          }
        })
        setHistoricalDatabase(built)
        setHistIsReal(true)
        // Garante que o ano selecionado existe nos dados reais
        const years = built.map(d => d.year)
        setSelectedHistorical(prev =>
          years.includes(prev) ? prev : (years[years.length - 2] ?? years[years.length - 1] ?? prev)
        )
      })
      .catch(() => { /* mantém fallback */ })
      .finally(() => setHistLoading(false))
  }, [tenantId])

  // ── Field split by status ────────────────────────────────────────────────
  const { activeDefs, calcDefs } = useMemo(() => {
    if (!activeKeysList || activeKeysList.length === 0) {
      return {
        activeDefs: FIELD_DEFS.filter(f => !f.isCalc),
        calcDefs:   FIELD_DEFS.filter(f =>  f.isCalc),
      }
    }

    // Busca em TODOS os FIELD_DEFS (incluindo isCalc) — ex: gmroi pode ser selecionado
    const activeDefs = activeKeysList
      .map(k => FIELD_DEFS.find(d => d.key === k))
      .filter(Boolean) as FieldDef[]

    // calcDefs: apenas campos calculados que NÃO estão na seleção do usuário
    const calcDefs = FIELD_DEFS.filter(f => f.isCalc && !activeKeysList.includes(f.key))

    return { activeDefs, calcDefs }
  }, [activeKeysList])

  // ── Field meta helpers ───────────────────────────────────────────────────
  const getFieldPriority = (key: string) => fieldPriorities.find(fp => fp.key === key)

  // ── Helpers ──────────────────────────────────────────────────────────────
  const calcVar = (plan: number | null, hist: number) =>
    plan && hist ? ((plan - hist) / hist) * 100 : 0
  const fmtVar  = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
  const fmtPlan = (label: string, val: number | null): string => {
    if (val === null || val === undefined || isNaN(val)) return "—"
    // Giro (R$ ou peças) e GMROI são índices — checar antes de "R$" e "peças"
    const lc = label.toLowerCase()
    if (lc.includes("giro") || lc === "gmroi") return `${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
    if (label.includes("R$"))                  return `R$ ${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    if (label.includes("%"))                   return `${val.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    if (lc.includes("dias"))                   return `${Math.round(val).toLocaleString("pt-BR")} dias`
    if (lc.includes("peças") || lc.includes("produção") || lc.includes("total de"))
                                               return `${Math.round(val).toLocaleString("pt-BR")} pç`
    return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Col 2 + Col 3 rows — order follows activeDefs, then the rest
  const { allPlanRows, refRows, planSplitAt, refSplitAt } = useMemo(() => {
    const histMkdPct = +((histSel.markdown / histSel.receita) * 100).toFixed(1)
    const histCustoMedio = CUSTO_MEDIO_DEFAULT

    // Receita líquida histórica estimada (5% devoluções)
    const histSelRL         = histSel.receita * 0.95
    const histSelPecasVend  = Math.round(histSelRL / histSel.pmv)
    const histSelGiroRS     = histSel.estoqueMedioRS > 0 ? histSelRL / histSel.estoqueMedioRS : null
    const histSelGiroUnid   = histSel.estoqueMedioPecas > 0
      ? histSelPecasVend / histSel.estoqueMedioPecas
      : null

    // ── 16 indicadores do cenário consolidado (todos sempre visíveis) ──────
    const planBase = [
      { key: "receitaBruta",      label: "Receita (R$)",            plan: v.receitaBruta,      ref: histSel.receita              },
      { key: "margemBruta",       label: "Margem Bruta (%)",        plan: v.margemBruta,       ref: histSel.margemBruta          },
      { key: "mkdPct",            label: "Markdown (%)",            plan: v.mkdPct,            ref: histMkdPct                   },
      { key: "gmroi",             label: "GMROI",                   plan: v.gmroi,             ref: histSel.gmroi                },
      { key: "pmv",               label: "PMV (R$)",                plan: v.pmv,               ref: histSel.pmv                  },
      { key: "orcamento",         label: "Orçamento (R$)",          plan: v.orcamento,         ref: histSel.orcamento            },
      { key: "giroUnidades",      label: "Giro (peças)",            plan: v.giroUnidades,      ref: histSelGiroUnid              },
      { key: "giro",              label: "Giro (R$)",               plan: v.giro,              ref: histSelGiroRS                },
      { key: "cobertura",         label: "Cobertura (dias)",        plan: v.cobertura,         ref: histSel.cobertura            },
      { key: "producaoPecas",     label: "Produção (peças)",        plan: v.producaoPecas,     ref: histSel.producao             },
      { key: "ticketMedio",       label: "Ticket Médio (R$)",       plan: v.ticketMedio,       ref: histSel.ticketMedio          },
      { key: "estoqueMediao",     label: "Estoque Médio (R$)",      plan: v.estoqueMediao,     ref: histSel.estoqueMedioRS       },
      { key: "estoqueMedioPecas", label: "Estoque Médio (peças)",   plan: v.estoqueMedioPecas, ref: histSel.estoqueMedioPecas    },
      { key: "custoMedio",        label: "Custo Médio (R$)",        plan: v.custoMedio,        ref: histCustoMedio               },
      { key: "mkdRS",             label: "Markdown (R$)",               plan: v.mkdRS,             ref: histSel.markdown             },
      { key: "pecasVendidas",     label: "Total de Peças Vendidas",     plan: v.pecasVendidas,     ref: histSelPecasVend             },
      { key: "idadeMediaEstoque", label: "Idade Média de Estoque (dias)", plan: v.idadeMediaEstoque, ref: Math.round(365 / histSel.giro) },
    ]

    const refBase = [
      { key: "receitaBruta",      label: "Receita (R$)",            value: histSel.receita,              fmt: "currency"   },
      { key: "margemBruta",       label: "Margem Bruta (%)",        value: histSel.margemBruta,          fmt: "percent"    },
      { key: "mkdPct",            label: "Markdown (%)",            value: histMkdPct,                   fmt: "percent"    },
      { key: "gmroi",             label: "GMROI",                   value: histSel.gmroi,                fmt: "multiplier" },
      { key: "pmv",               label: "PMV (R$)",                value: histSel.pmv,                  fmt: "currency"   },
      { key: "orcamento",         label: "Orçamento (R$)",          value: histSel.orcamento,            fmt: "currency"   },
      { key: "giroUnidades",      label: "Giro (peças)",            value: histSel.giro,                 fmt: "multiplier" },
      { key: "giro",              label: "Giro (R$)",               value: histSelGiroRS ?? 0,           fmt: "multiplier" },
      { key: "cobertura",         label: "Cobertura (dias)",        value: histSel.cobertura,            fmt: "days"       },
      { key: "producaoPecas",     label: "Produção (peças)",        value: histSel.producao,             fmt: "number"     },
      { key: "ticketMedio",       label: "Ticket Médio (R$)",       value: histSel.ticketMedio,          fmt: "currency"   },
      { key: "estoqueMediao",     label: "Estoque Médio (R$)",      value: histSel.estoqueMedioRS,       fmt: "currency"   },
      { key: "estoqueMedioPecas", label: "Estoque Médio (peças)",   value: histSel.estoqueMedioPecas,    fmt: "number"     },
      { key: "custoMedio",        label: "Custo Médio (R$)",        value: histCustoMedio,               fmt: "currency"   },
      { key: "mkdRS",             label: "Markdown (R$)",               value: histSel.markdown,             fmt: "currency"   },
      { key: "pecasVendidas",     label: "Total de Peças Vendidas",     value: histSelPecasVend,             fmt: "number"     },
      { key: "idadeMediaEstoque", label: "Idade Média de Estoque (dias)", value: Math.round(365 / histSel.giro), fmt: "days"    },
    ]

    const activeKeys = activeDefs.map(d => d.key)

    const sort = <T extends { key: string }>(rows: T[]) => {
      const selected = activeKeys.flatMap(k => { const r = rows.find(r => r.key === k); return r ? [r] : [] })
      const others   = rows.filter(r => !activeKeys.includes(r.key))
      return { sorted: [...selected, ...others], splitAt: selected.length }
    }

    const { sorted: allPlanRows, splitAt: planSplitAt } = sort(planBase)
    const { sorted: refRows,     splitAt: refSplitAt   } = sort(refBase)

    return { allPlanRows, refRows, planSplitAt, refSplitAt }
  }, [v, histSel, activeDefs])

  const handleOpenSave = () => {
    setScenarioNameInput("")
    setSaveDialogOpen(true)
  }

  const handleConfirmSave = () => {
    const name = saveScenario(scenarioNameInput || undefined)
    const vals: Record<string, number | null> = {}
    FIELD_DEFS.forEach(f => { vals[f.key] = f.getValue(v) })
    addVersionToCycle(year, name, vals)
    setSaveDialogOpen(false)
    setScenarioNameInput("")
  }

  const [isExportingPDF, setIsExportingPDF] = useState(false)

  const handleExportPDF = async () => {
    setIsExportingPDF(true)
    await exportToPDF({
      elementId: "planning-scenarios-pdf",
      fileName:  `cenarios_planejamento_${year}`,
      title:     `Comparação de Cenários — Planejamento Estratégico ${year}`,
    })
    setIsExportingPDF(false)
  }

  const handleExportScenarios = () => {
    if (scenarios.length === 0) {
      alert("Nenhum cenário salvo para exportar. Salve ao menos um cenário primeiro.")
      return
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      year,
      focus,
      scenarios: scenarios.map(sc => ({
        name:    sc.name,
        savedAt: sc.savedAt,
        values:  sc.state.values,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `cenarios_${year}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleApplyMetas = () => {
    const target = activeScenario ?? (scenarios.length > 0 ? scenarios[scenarios.length - 1] : null)
    if (!target) {
      alert("Salve um cenário antes de aplicar as metas.")
      return
    }
    if (window.confirm(`Aplicar as metas do cenário "${target.name}" como plano oficial de ${year}?`)) {
      // Persiste o cenário aplicado no ciclo do localStorage
      const vals: Record<string, number | null> = {}
      FIELD_DEFS.forEach(f => { vals[f.key] = f.getValue(v) })
      addVersionToCycle(year, target.name, vals)
      alert(`Metas do cenário "${target.name}" aplicadas ao plano de ${year}.`)
    }
  }

  // ── Receita toggle handlers ──────────────────────────────────────────────
  const toggleReceitaMode = () => {
    if (receitaMode === 'value') {
      // Inicializa o % a partir do valor atual vs referência
      const cur = v.receitaBruta
      if (cur != null && histRef.receita > 0) {
        const pct = ((cur - histRef.receita) / histRef.receita) * 100
        setReceitaPctStr(pct.toFixed(1))
      } else {
        setReceitaPctStr('')
      }
      setReceitaMode('percent')
    } else {
      setReceitaMode('value')
      setReceitaPctStr('')
    }
  }

  const handleReceitaPctChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const str = e.target.value
    setReceitaPctStr(str)
    const pct = parseFloat(str)
    if (!isNaN(pct) && histRef.receita > 0) {
      setField('receitaBruta', Math.round(histRef.receita * (1 + pct / 100)))
    }
  }

  if (!user) return null

  // ── Macro indicators ─────────────────────────────────────────────────────
  const profile  = getStoredProfile()
  const activeIds = profile ? getActiveIndicators(profile) : []

  const focusColors = focus ? STRATEGIC_FOCUS_COLORS[focus] : null

  const fmtRef = (val: number, f: string) => {
    if (f === "currency")   return `R$ ${val.toLocaleString("pt-BR")}`
    if (f === "percent")    return `${val}%`
    if (f === "days")       return `${val} dias`
    if (f === "multiplier") return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return val.toLocaleString("pt-BR")
  }

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/planning-gateway")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Módulo 1</span>
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
              className="p-2 text-[#F6F3AA]/60 hover:text-[#F6F3AA] transition-colors"
              title="Ver tour de apresentação"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/") }}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── STICKY MACRO BAR ───────────────────────────────────────────────── */}
      <div id="tour-plan-macro" className="sticky top-0 z-30 bg-white/90 backdrop-blur-md shadow-sm border-b border-[#28071C]/8">
        <button
          onClick={() => setIsAccordionOpen(!isAccordionOpen)}
          className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-[#7598CF]/5 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#7598CF]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#B8A8E0]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#7598CF]/40" />
            </div>
            <span className="text-[#28071C] text-sm font-semibold">
              Cenário Macroeconômico — <span className="text-[#7598CF]">{year}</span>
            </span>
            {activeIds.length > 0 && (
              <span className="text-[10px] bg-[#7598CF]/12 text-[#7598CF] font-semibold px-2 py-0.5 rounded-full">
                {activeIds.length} indicadores do seu segmento
              </span>
            )}
            {isDirty && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 ml-2">
                <Lock className="w-2.5 h-2.5" /> Alterações não salvas
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#28071C]/40">
              Base histórica: <strong>{referenceYear}</strong>
              {activeScenario && (
                <> &nbsp;·&nbsp; Cenário: <strong className="text-[#7598CF]">{activeScenario.name}</strong></>
              )}
            </span>
            <ChevronDown className={`w-4 h-4 text-[#28071C]/50 transition-transform ${isAccordionOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {isAccordionOpen && (
          <div className="px-6 pb-4 pt-1">
            {activeIds.length === 0 ? (
              <p className="text-[#28071C]/40 text-sm text-center py-3">
                Perfil não configurado. <button onClick={() => navigate("/profile-adjust")} className="text-[#7598CF] underline">Ajustar perfil</button>
              </p>
            ) : (
              <>
                <p className="text-[9px] text-[#28071C]/35 uppercase tracking-widest font-semibold mb-2">
                  Conjuntura Geral — Projeções Focus/BCB
                </p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { l: "IPCA",       v: "3,8%",   f: "Focus" },
                    { l: "Selic",      v: "12,75%", f: "Focus" },
                    { l: "PIB",        v: "2,3%",   f: "Focus" },
                    { l: "PMC Varejo", v: "+4,5%",  f: "IBGE"  },
                  ].map(c => (
                    <div key={c.l} className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400">{c.l}</p>
                      <p className="text-sm text-[#28071C] font-bold">{c.v}</p>
                      <p className="text-[9px] text-gray-300">Fonte: {c.f}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-[#28071C]/35 uppercase tracking-widest font-semibold mb-2">
                  Indicadores do Seu Segmento
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {activeIds.map(id => {
                    const meta   = INDICATOR_META[id]
                    const hasVar = meta.variacao !== undefined
                    const isNeg  = hasVar && (
                      (meta.variacao!.startsWith('+') && !meta.positivo) ||
                      (meta.variacao!.startsWith('-') && meta.positivo)
                    )
                    const isPos  = hasVar && !isNeg
                    return (
                      <div key={id} className={`relative group bg-white border rounded-lg px-2.5 py-2 cursor-default ${isNeg ? 'border-red-100' : isPos ? 'border-emerald-100' : 'border-gray-100'}`}>
                        <p className="text-[9px] text-gray-400 leading-tight">{meta.label}</p>
                        <p className="text-xs text-[#28071C] font-bold mt-0.5">{meta.valor}</p>
                        {hasVar && (
                          <p className={`text-[9px] font-semibold flex items-center gap-0.5 mt-0.5 ${isNeg ? 'text-red-600' : isPos ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {isNeg ? <TrendingUp className="w-2.5 h-2.5" /> : isPos ? <TrendingDown className="w-2.5 h-2.5 rotate-180" /> : <Minus className="w-2.5 h-2.5" />}
                            {meta.variacao}
                          </p>
                        )}
                        {/* Tooltip 2s — aparece após 2 segundos de hover */}
                        <div className="absolute bottom-full left-0 mb-2 w-52 px-3 py-2 bg-[#28071C] text-white text-[10px] rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed font-normal">
                          <p className="font-semibold text-[#F6F3AA] mb-0.5">{meta.label}</p>
                          <p>{meta.desc}</p>
                          <p className="text-white/50 mt-1">Fonte: {meta.fonte}</p>
                          <span className="absolute top-full left-3 border-4 border-transparent border-t-[#28071C]" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 3-COLUMN LAYOUT ────────────────────────────────────────────────── */}
      <div id="planning-export-content" className="max-w-[1800px] mx-auto px-6 py-6 flex gap-5 items-start">

        {/* ═══════════════════════════════════════════════════════════════════
            COLUNA 1 — Indicadores Selecionados para Planejamento
            ═══════════════════════════════════════════════════════════════════ */}
        <div id="tour-plan-indicators" className="w-[340px] flex-shrink-0 sticky top-[52px] max-h-[calc(100vh-68px)] overflow-y-auto pb-4">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">

            <div className="px-4 py-3 border-b border-[#28071C]/8 bg-gradient-to-r from-[#28071C]/4 to-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">
                    Indicadores Selecionados
                  </h2>
                  <p className="text-[#28071C]/40 text-xs mt-0.5">Metas editáveis · Ano fiscal {year}</p>
                </div>
                <button
                  onClick={reset}
                  title="Resetar ao histórico"
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#28071C]/8 transition-colors text-[#28071C]/40 hover:text-[#28071C]/70"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {focus && focusColors && (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border mt-2 mb-1 ${focusColors.card} ${focusColors.badge}`}>
                  {STRATEGIC_FOCUS_ICONS[focus]}
                  {focusDisplayLabel}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-[#28071C]/40">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full border border-[#28071C]/30" />Editável
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <Lock className="w-2.5 h-2.5" />Travado (clique p/ rever)
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#28071C]/20" />Calculado
                </span>
              </div>
            </div>

            {/* Balloon de simulação — some ao primeiro edit */}
            {simBalloonVisible && (
              <div
                className={`relative mx-3 mt-2 mb-3 rounded-xl border shadow-sm transition-all duration-350 ${
                  simBalloonFading
                    ? 'opacity-0 -translate-y-1 pointer-events-none'
                    : 'opacity-100 translate-y-0'
                } bg-[#28071C] border-[#28071C]`}
                style={{ transition: 'opacity 350ms ease, transform 350ms ease' }}
              >
                <div className="px-3 py-2.5 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-[#F6F3AA] flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/75 leading-relaxed flex-1">
                    <strong className="text-[#F6F3AA]">Ambiente de simulação.</strong>{' '}
                    Ajuste os indicadores abaixo, salve cenários e compare impactos antes de definir as metas finais.
                  </p>
                  <button
                    onClick={dismissSimBalloon}
                    className="flex-shrink-0 text-white/30 hover:text-white/70 transition-colors -mt-0.5 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {/* Caret apontando para os campos abaixo */}
                <div className="absolute -bottom-[7px] left-6 w-3.5 h-3.5 bg-[#28071C] rotate-45 rounded-sm" />
              </div>
            )}

            <div className="p-3 space-y-2">
              {/* ACTIVE FIELDS only — indicators selected in setup */}
              {activeDefs.length > 0 && (
                <div className="space-y-1.5">
                  {activeDefs.map(f => {
                    const meta    = getFieldPriority(f.key)
                    const isRef   = meta?.isReference ?? false
                    const status  = meta?.status
                    const isReceita = f.key === 'receitaBruta'
                    const borderCls = status === 'unlocked'
                      ? "border-l-2 border-violet-400 pl-1"
                      : status === 'suggested'
                      ? "border-l-2 border-[#7598CF]/60 pl-1"
                      : isReceita
                      ? "border-l-2 border-[#28071C]/40 pl-1"
                      : ""
                    return (
                      <div key={f.key} className={`rounded-xl ${isRef ? "ring-1 ring-amber-300 bg-amber-50/30" : ""}`}>
                        {isReceita && (
                          <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
                            <div className="flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5 text-[#28071C]/40" />
                              <span className="text-[9px] text-[#28071C]/40 font-semibold uppercase tracking-widest">
                                Obrigatório — Receita
                              </span>
                            </div>
                            <button
                              onClick={toggleReceitaMode}
                              title={receitaMode === 'value' ? 'Alternar para % de crescimento' : 'Alternar para valor em R$'}
                              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
                                receitaMode === 'percent'
                                  ? 'bg-[#7598CF]/15 border-[#7598CF]/50 text-[#7598CF]'
                                  : 'bg-transparent border-[#28071C]/18 text-[#28071C]/40 hover:border-[#7598CF]/40 hover:text-[#7598CF]'
                              }`}
                            >
                              {receitaMode === 'value'
                                ? <><ToggleLeft className="w-3 h-3" /> % crescimento</>
                                : <><ToggleRight className="w-3 h-3" /> R$ valor</>
                              }
                            </button>
                          </div>
                        )}
                        {isRef && !isReceita && (
                          <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                            <span className="text-[9px] text-amber-600 font-semibold uppercase tracking-widest">
                              Indicador de Referência
                            </span>
                          </div>
                        )}
                        {isReceita && receitaMode === 'percent' ? (
                          /* ── MODO % — input de crescimento convertido automaticamente ── */
                          <div className="px-3 pb-3 pt-1">
                            <p className="text-[10px] text-[#28071C]/40 mb-1.5">
                              Crescimento sobre {referenceYear} (base R$ {histRef.receita.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})
                            </p>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.1"
                                value={receitaPctStr}
                                onChange={handleReceitaPctChange}
                                placeholder="ex: 15  ou  -5"
                                className="w-full pl-3 pr-8 py-2.5 border-2 border-[#7598CF]/40 rounded-xl text-sm text-[#28071C] placeholder-[#28071C]/25 focus:border-[#7598CF] focus:outline-none"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#28071C]/40 font-semibold">%</span>
                            </div>
                            <p className="text-[11px] text-[#28071C]/45 mt-1.5">
                              {receitaPctStr !== '' && !isNaN(parseFloat(receitaPctStr))
                                ? <>= <strong className="text-[#28071C]">R$ {v.receitaBruta?.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) ?? '—'}</strong>
                                    {' '}<span className={`font-semibold ${parseFloat(receitaPctStr) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      ({parseFloat(receitaPctStr) >= 0 ? '+' : ''}{parseFloat(receitaPctStr).toFixed(1)}%)
                                    </span>
                                  </>
                                : <span className="text-[#28071C]/30">Digite um número positivo (crescimento) ou negativo (queda)</span>
                              }
                            </p>
                          </div>
                        ) : (
                          <div className={borderCls}>
                            <PlanningField
                              label={f.label}
                              fieldKey={f.key as import("@/engine/planningEngine").FieldKey}
                              value={f.getValue(v)}
                              state={f.getState(s) as import("@/engine/planningEngine").FieldState}
                              format={f.format}
                              helpText={f.getHelp(referenceYear, histRef, baseline)}
                              onEdit={setField}
                              onUnlock={unlock}
                              highlightCalc={!!f.isCalc}
                            />
                          </div>
                        )}
                        {status === 'unlocked' && (
                          <div className="px-2 pb-1">
                            <span className="text-[9px] text-violet-500 font-medium">↑ Liberado manualmente</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* CALCULATED FIELDS */}
              <div>
                <div className="flex items-center gap-1.5 mb-1 mt-2">
                  <span className="text-[9px] text-[#28071C]/35 uppercase tracking-widest font-bold">
                    Derivados — calculados automaticamente
                  </span>
                </div>
                <div className="space-y-1.5 opacity-70">
                  {calcDefs.map(f => (
                    <PlanningField
                      key={f.key}
                      label={f.label}
                      fieldKey={f.key as import("@/engine/planningEngine").FieldKey}
                      value={f.getValue(v)}
                      state="calculated"
                      format={f.format}
                      helpText={f.getHelp(referenceYear, histRef, baseline)}
                      onEdit={setField}
                      onUnlock={unlock}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUNA 2 — Cenário Consolidado do Plano (todos os indicadores)
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">

          <div id="tour-plan-central" className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[#28071C]/8 flex items-center justify-between">
              <div>
                <h3 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">
                  Cenário Consolidado
                </h3>
                <p className="text-[#28071C]/40 text-xs mt-0.5">
                  Todos os indicadores · Ano fiscal {year}
                </p>
              </div>
              {activeScenario && (
                <span className="flex items-center gap-1.5 text-xs bg-[#7598CF]/10 text-[#7598CF] border border-[#7598CF]/20 rounded-full px-3 py-1 font-semibold">
                  <CheckCircle className="w-3 h-3" />{activeScenario.name}
                </span>
              )}
            </div>

            <div className="p-4">
              <div className="grid grid-cols-12 gap-2 mb-2 pb-1.5 border-b-2 border-[#28071C]/10">
                <span className="col-span-5 text-[#28071C]/50 text-[10px] uppercase tracking-widest font-semibold">Indicador</span>
                <span className="col-span-4 text-[#28071C]/50 text-[10px] uppercase tracking-widest font-semibold text-right">Plano {year}</span>
                <span className="col-span-3 text-[#28071C]/50 text-[10px] uppercase tracking-widest font-semibold text-right">vs Referência</span>
              </div>
              <div className="space-y-0.5">
                {allPlanRows.map((row, i) => {
                  const vRef = calcVar(row.plan, row.ref)
                  const isFirstOther = planSplitAt > 0 && i === planSplitAt
                  return (
                    <>
                      {isFirstOther && (
                        <div key={`sep-${i}`} className="flex items-center gap-2 pt-2 pb-0.5 px-1">
                          <div className="flex-1 h-px bg-[#28071C]/8" />
                          <span className="text-[9px] text-[#28071C]/30 uppercase tracking-widest font-semibold whitespace-nowrap">
                            Demais indicadores
                          </span>
                          <div className="flex-1 h-px bg-[#28071C]/8" />
                        </div>
                      )}
                      <div key={row.key} className="grid grid-cols-12 gap-2 items-center py-1.5 border-b border-[#28071C]/5 last:border-0 hover:bg-[#7598CF]/4 rounded-lg px-1 transition-colors">
                        <span className={`col-span-5 text-sm ${i < planSplitAt ? "text-[#28071C]/70" : "text-[#28071C]/40"}`}>{row.label}</span>
                        <span className={`col-span-4 text-right text-sm font-semibold ${i < planSplitAt ? "text-[#28071C]" : "text-[#28071C]/50"}`}>{fmtPlan(row.label, row.plan)}</span>
                        <div className="col-span-3 flex items-center justify-end gap-0.5">
                          {row.plan !== null && <>
                            <span className={`text-[11px] font-medium ${vRef >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtVar(vRef)}</span>
                            {vRef >= 0 ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-red-600" />}
                          </>}
                        </div>
                      </div>
                    </>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Cenários Salvos */}
          {scenarios.length > 0 && (
            <div id="tour-plan-scenarios" className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#28071C]/8">
                <h3 className="text-[#28071C] font-semibold text-base">Cenários Salvos</h3>
                <p className="text-[#28071C]/40 text-xs mt-0.5">Clique em um cenário para carregá-lo e depois aplicar as metas</p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {scenarios.map((sc, i) => {
                  const isActive = activeScenario?.name === sc.name
                  return (
                    <button
                      key={i}
                      onClick={() => loadScenario(sc)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border-2 transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#7598CF]/10 border-[#7598CF] text-[#28071C] font-semibold"
                          : "bg-white border-[#28071C]/10 text-[#28071C]/60 hover:border-[#7598CF]/40 hover:text-[#28071C] hover:bg-[#7598CF]/5"
                      }`}
                    >
                      {isActive
                        ? <CheckCircle className="w-3.5 h-3.5 text-[#7598CF]" />
                        : <Star className="w-3 h-3 opacity-30" />
                      }
                      {sc.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUNA 3 — Ano de Referência
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="w-[340px] flex-shrink-0 flex flex-col gap-5">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#28071C]/8 flex items-center justify-between">
              <div>
                <h3 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">
                  Ano de Referência
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[#28071C]/40 text-xs">Base de comparação do plano</p>
                  {histLoading && (
                    <span className="text-[10px] text-[#7598CF] animate-pulse">carregando…</span>
                  )}
                  {!histLoading && histIsReal && (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                      📊 dados reais
                    </span>
                  )}
                </div>
              </div>
              <select
                value={selectedHistorical}
                onChange={e => setSelectedHistorical(e.target.value)}
                className="bg-white rounded-lg px-2.5 py-1.5 text-[#28071C] border-2 border-[#7598CF]/30 focus:border-[#7598CF] focus:outline-none cursor-pointer text-sm"
              >
                {historicalDatabase.map(d => (
                  <option key={d.year} value={d.year}>{d.year}</option>
                ))}
              </select>
            </div>

            <div className="p-4">
              <div className="space-y-0">
                {refRows.map((item, i) => {
                  const planRow = allPlanRows.find(r => r.key === item.key)
                  const delta = planRow?.plan != null
                    ? ((planRow.plan - item.value) / item.value) * 100
                    : null
                  const isFirstOther = refSplitAt > 0 && i === refSplitAt

                  return (
                    <>
                      {isFirstOther && (
                        <div key={`sep-${i}`} className="flex items-center gap-2 pt-3 pb-1">
                          <div className="flex-1 h-px bg-[#28071C]/8" />
                          <span className="text-[9px] text-[#28071C]/30 uppercase tracking-widest font-semibold whitespace-nowrap">
                            Demais
                          </span>
                          <div className="flex-1 h-px bg-[#28071C]/8" />
                        </div>
                      )}
                      <div key={item.key} className="flex justify-between items-center py-2.5 border-b border-[#28071C]/6 last:border-0">
                        <div>
                          <span className={`text-sm ${i < refSplitAt ? "text-[#28071C]/70" : "text-[#28071C]/40"}`}>{item.label}</span>
                          {delta !== null && (
                            <div className={`flex items-center gap-0.5 text-[10px] font-semibold mt-0.5 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {delta >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                              Plano {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                            </div>
                          )}
                        </div>
                        <span className={`text-sm font-medium font-mono ${i < refSplitAt ? "text-[#28071C]" : "text-[#28071C]/50"}`}>{fmtRef(item.value, item.fmt)}</span>
                      </div>
                    </>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE AÇÕES ─────────────────────────────────────────────────── */}
      <div className="max-w-[1800px] mx-auto px-6 pb-8">
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Salvar cenário */}
              <button
                onClick={handleOpenSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
              >
                <Save className="w-4 h-4" />
                Salvar cenário
              </button>

              {/* Comparar cenários — habilitado a partir do 2º cenário */}
              <button
                id="tour-plan-compare"
                onClick={() => setCompareOpen(true)}
                disabled={scenarios.length < 2}
                title={scenarios.length < 2 ? "Salve ao menos 2 cenários para comparar" : "Comparar cenários salvos"}
                className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl text-sm font-semibold hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                <GitCompare className="w-4 h-4" />
                Comparar cenários
                {scenarios.length >= 2 && (
                  <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                    {scenarios.length}
                  </span>
                )}
              </button>

              {/* Exportar PDF */}
              <button
                onClick={handleExportPDF}
                disabled={isExportingPDF}
                title="Exportar visualização atual como PDF"
                className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <FileDown className="w-4 h-4" />
                {isExportingPDF ? "Gerando PDF…" : "Exportar PDF"}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Aplicar metas */}
              <button
                onClick={handleApplyMetas}
                disabled={!activeScenario && scenarios.length === 0}
                title={
                  !activeScenario && scenarios.length === 0
                    ? "Salve um cenário antes de aplicar"
                    : activeScenario
                      ? `Aplicar metas do cenário "${activeScenario.name}"`
                      : "Aplicar metas do último cenário salvo"
                }
                className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <CheckCheck className="w-4 h-4" />
                Aplicar metas
              </button>

              <button
                onClick={() => navigate("/planning-gateway")}
                className="flex items-center gap-2 px-5 py-2.5 text-[#28071C]/50 border border-[#28071C]/15 rounded-xl text-sm hover:bg-white/60 transition-colors"
              >
                Concluir planejamento
              </button>
            </div>
          </div>

          <p className="text-[9px] text-[#28071C]/30 mt-2">
            Nenhum cenário salvo altera dados oficiais até ser aplicado via "Aplicar metas".
          </p>
        </div>
      </div>

      {/* ── SAVE DIALOG ────────────────────────────────────────────────────── */}
      {saveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-6 py-5 w-[420px] mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-base">Nomear Cenário</h3>
              <button onClick={() => setSaveDialogOpen(false)} className="text-[#28071C]/40 hover:text-[#28071C] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[#28071C]/50 text-sm mb-4">
              Dê um nome para identificar este cenário. Deixe em branco para usar o nome automático.
            </p>
            <input
              type="text"
              value={scenarioNameInput}
              onChange={e => setScenarioNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirmSave()}
              placeholder={`Ex: Cenário Conservador ${year}`}
              className="w-full px-4 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm text-[#28071C] placeholder-[#28071C]/30 focus:border-[#7598CF] focus:outline-none"
              autoFocus
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setSaveDialogOpen(false)}
                className="flex-1 px-4 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-[#28071C]/4 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSave}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all"
              >
                <Save className="w-4 h-4" />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARE MODAL ──────────────────────────────────────────────────── */}
      {/* ── PRODUCT TOUR ───────────────────────────────────────────────────── */}
      {tour.isOpen && (
        <ProductTour steps={PLANNING_TOUR} onClose={tour.dismiss} />
      )}

      {compareOpen && scenarios.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[900px] max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/8">
              <h3 className="text-[#28071C] font-bold text-base">Comparação de Cenários</h3>
              <button onClick={() => setCompareOpen(false)} className="text-[#28071C]/40 hover:text-[#28071C] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold py-2 pr-4">Indicador</th>
                    {scenarios.map(sc => (
                      <th key={sc.name} className="text-right text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold py-2 px-3">
                        {sc.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPlanRows.map((row, i) => (
                    <tr key={i} className="border-t border-[#28071C]/5 hover:bg-[#7598CF]/4 transition-colors">
                      <td className="py-2.5 pr-4 text-[#28071C]/60">{row.label}</td>
                      {scenarios.map(sc => {
                        const val = sc.state.values[row.key as import("@/engine/planningEngine").FieldKey] ?? null
                        return (
                          <td key={sc.name} className={`py-2.5 px-3 text-right font-mono font-semibold ${activeScenario?.name === sc.name ? "text-[#7598CF]" : "text-[#28071C]"}`}>
                            {fmtPlan(row.label, val as number | null)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF: Comparação de Cenários (capturado pelo html2canvas) ─────────── */}
      <div
        id="planning-scenarios-pdf"
        style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, width: '1120px', padding: '28px', background: '#F2F2F2', fontFamily: 'system-ui, sans-serif' }}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#28071C', marginBottom: '4px' }}>
          Planejamento Estratégico {year}
        </p>
        <p style={{ fontSize: '11px', color: '#28071C', opacity: 0.4, marginBottom: '20px' }}>
          Comparação de Cenários
        </p>
        {scenarios.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#28071C', opacity: 0.5 }}>Nenhum cenário salvo.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            {scenarios.map(sc => (
              <div key={sc.name} style={{ flex: '1 1 200px', minWidth: '180px', maxWidth: '240px', background: 'white', borderRadius: '12px', padding: '14px', borderTop: `4px solid ${activeScenario?.name === sc.name ? '#7598CF' : '#28071C'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#28071C' }}>{sc.name}</span>
                  {activeScenario?.name === sc.name && <span style={{ fontSize: '9px', background: '#7598CF', color: 'white', borderRadius: '999px', padding: '2px 6px', fontWeight: 700 }}>ATIVO</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', padding: '4px 0', fontSize: '9px', fontWeight: 700, color: 'rgba(40,7,28,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #F2F2F2' }}>
                  <span>Indicador</span><span style={{ textAlign: 'center' }}>Plano</span><span style={{ textAlign: 'right' }}>vs Referência</span>
                </div>
                {allPlanRows.slice(0, 8).map((row, i) => {
                  const val = sc.state.values[row.key as import("@/engine/planningEngine").FieldKey] ?? null
                  const refVal = row.ref ?? null
                  const delta = (val != null && refVal != null && refVal !== 0) ? (((val as number) - (refVal as number)) / Math.abs(refVal as number) * 100).toFixed(1) : null
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', padding: '5px 0', borderBottom: '1px solid #F2F2F2', fontSize: '10px', color: '#28071C' }}>
                      <span style={{ opacity: 0.6 }}>{row.label}</span>
                      <span style={{ textAlign: 'center', fontWeight: 600 }}>{fmtPlan(row.label, val as number | null)}</span>
                      <span style={{ textAlign: 'right', opacity: 0.5 }}>{delta != null ? `${+delta > 0 ? '+' : ''}${delta}%` : '—'}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
