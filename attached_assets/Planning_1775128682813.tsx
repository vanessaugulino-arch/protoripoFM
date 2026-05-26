// src/app/pages/Planning.tsx  — v2
import { useEffect, useState, useMemo } from "react";
import { usePlanningEngine } from '../../hooks/usePlanningEngine'
import { PlanningField } from '../../components/PlanningField'
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare,
  Download, CheckCircle, ArrowUp, ArrowDown, ChevronDown, Lock,
} from "lucide-react";
import logoTFO from "figma:asset/518a2b0fbf767e7d53e8db6869b3fce6e2473ef2.png";

interface UserData { name: string; email: string; profile: string }

interface HistoricalData {
  year: string; receita: number; margemBruta: number; pmv: number;
  otb: number; estoqueMedioRS: number; estoqueMedioPecas: number;
  giro: number; cobertura: number; markdown: number; producao: number; gmroi: number;
}

const historicalDatabase: HistoricalData[] = [
  { year: "2023", receita: 2450000, margemBruta: 40.5, pmv: 145, otb: 1050000,
    estoqueMedioRS: 720000, estoqueMedioPecas: 4965, giro: 3.85, cobertura: 78,
    markdown: 165000, producao: 16890, gmroi: 1.55 },
  { year: "2024", receita: 2700000, margemBruta: 42.0, pmv: 158, otb: 1100000,
    estoqueMedioRS: 695000, estoqueMedioPecas: 4398, giro: 4.05, cobertura: 75,
    markdown: 148000, producao: 17850, gmroi: 1.70 },
  { year: "2025", receita: 2850000, margemBruta: 42.3, pmv: 155, otb: 1140000,
    estoqueMedioRS: 680000, estoqueMedioPecas: 4387, giro: 4.19, cobertura: 72,
    markdown: 142500, producao: 18387, gmroi: 1.77 },
]

const custoMedioPorAno: Record<string, number> = {
  "2023": 72, "2024": 80, "2025": 87,
}

export default function Planning() {
  const navigate = useNavigate()
  const [user,               setUser]               = useState<UserData | null>(null)
  const [selectedFiscalYear, setSelectedFiscalYear] = useState("2027")
  const [selectedHistorical, setSelectedHistorical] = useState("2025")
  const [isAccordionOpen,    setIsAccordionOpen]    = useState(false)

  const getHist = (year: string) =>
    historicalDatabase.find(d => d.year === year) ?? historicalDatabase[2]

  // Ano de referência = ano imediatamente anterior ao fiscal alvo
  const referenceYear = useMemo(() => {
    const y = String(parseInt(selectedFiscalYear) - 1)
    return historicalDatabase.find(d => d.year === y) ? y : "2025"
  }, [selectedFiscalYear])

  const histRef  = getHist(referenceYear)
  const histSel  = getHist(selectedHistorical)
  const histPrev = getHist(String(parseInt(selectedHistorical) - 1))

  // Baseline passado para o engine — muda quando muda o ano alvo
  const baseline = useMemo(() => ({
    receitaBruta:  histRef.receita,
    margemBruta:   histRef.margemBruta,
    pmv:           histRef.pmv,
    giro:          histRef.giro,
    cobertura:     histRef.cobertura,
    otb:           histRef.otb,
    producaoPecas: histRef.producao,
    mkdPct:        +((histRef.markdown / histRef.receita) * 100).toFixed(1),
    custoMedio:    custoMedioPorAno[referenceYear] ?? 87,
    totalPecas:    histRef.producao,
    gmroi:         histRef.gmroi,
  }), [histRef, referenceYear])

  const {
    current, isDirty, activeScenario, scenarios,
    setField, unlock, saveScenario, resetToBaseline,
  } = usePlanningEngine(parseInt(selectedFiscalYear), baseline)

  const v = current.values
  const s = current.states

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser")
    if (stored) {
      const u = JSON.parse(stored)
      setUser(u)
      if (u.profile !== "CEO") navigate("/dashboard")
    } else navigate("/")
  }, [navigate])

  const calcVar = (plan: number | null, hist: number) =>
    plan && hist ? ((plan - hist) / hist) * 100 : 0
  const fmtVar  = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
  const fmtPlan = (label: string, val: number | null): string => {
    if (val === null || isNaN(val)) return "—"
    if (label.includes("R$"))    return `R$ ${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    if (label.includes("%"))     return `${val.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    if (label.includes("dias"))  return `${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} dias`
    if (label.includes("peças")) return `${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} pç`
    return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const planRows = [
    { label: "Receita (R$)",          plan: v.receitaBruta,  aa: histSel.receita,           aa1: histPrev.receita },
    { label: "Margem Bruta (%)",      plan: v.margemBruta,   aa: histSel.margemBruta,        aa1: histPrev.margemBruta },
    { label: "PMV (R$)",              plan: v.pmv,           aa: histSel.pmv,                aa1: histPrev.pmv },
    { label: "OTB (R$)",              plan: v.otb,           aa: histSel.otb,                aa1: histPrev.otb },
    { label: "Estoque Médio (R$)",    plan: v.estoqueMedio,  aa: histSel.estoqueMedioRS,     aa1: histPrev.estoqueMedioRS },
    { label: "Estoque Médio (peças)", plan: v.pecasVendidas, aa: histSel.estoqueMedioPecas,  aa1: histPrev.estoqueMedioPecas },
    { label: "Giro",                  plan: v.giro,          aa: histSel.giro,               aa1: histPrev.giro },
    { label: "Cobertura (dias)",      plan: v.cobertura,     aa: histSel.cobertura,          aa1: histPrev.cobertura },
    { label: "Markdown (R$)",         plan: v.mkdRS,         aa: histSel.markdown,           aa1: histPrev.markdown },
    { label: "Produção (peças)",      plan: v.producaoPecas, aa: histSel.producao,           aa1: histPrev.producao },
    { label: "GMROI",                 plan: v.gmroi,         aa: histSel.gmroi,              aa1: histPrev.gmroi },
  ]

  if (!user) return null

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

      {/* TOPBAR */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <span className="text-[#F6F3AA] text-xl">Fashion Mind | Planejamento Estratégico - Ano Fiscal</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-[#F6F3AA]">
              <User className="w-5 h-5" /><span>{user.name}</span>
            </div>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/") }}
              className="text-[#F6F3AA] hover:opacity-80"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">

        {/* SELETOR DE ANO */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">Ano Fiscal Alvo</label>
              <select value={selectedFiscalYear} onChange={e => setSelectedFiscalYear(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] text-sm border-2 border-[#7598CF] focus:outline-none cursor-pointer">
                <option>2026</option><option>2027</option><option>2028</option><option>2029</option><option>2030</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <p className="text-[#28071C]/50 text-sm">
                Base histórica: <strong>{referenceYear}</strong> &nbsp;|&nbsp;
                Cenário ativo: <span className="font-semibold text-[#7598CF]">{activeScenario?.name ?? "Nenhum salvo"}</span>
              </p>
            </div>
          </div>
        </div>

        {/* ACCORDION MACRO */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl mb-6 shadow-sm overflow-hidden">
          <button onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/40 transition-colors">
            <span className="text-[#28071C] font-semibold text-base">
              Cenário Macroeconômico Projetado — <span className="text-[#7598CF] font-extrabold">{selectedFiscalYear}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-[#28071C] transition-transform ${isAccordionOpen ? "rotate-180" : ""}`} />
          </button>
          {isAccordionOpen && (
            <div className="flex flex-col gap-3 p-3">
              <div className="grid grid-cols-4 gap-2">
                {[{ l: "Projeção IPCA", v: "3,8%", f: "Focus" }, { l: "Projeção Selic", v: "12,75%", f: "Focus" },
                  { l: "Projeção Câmbio", v: "R$ 5,85", f: "Focus" }, { l: "Projeção PIB", v: "2,3%", f: "Focus" }]
                  .map(c => (
                    <div key={c.l} className="bg-white border border-gray-100 rounded-md p-2">
                      <p className="text-[10px] text-gray-500">{c.l}</p>
                      <p className="text-sm text-[#28071C] font-bold">{c.v}</p>
                      <p className="text-[9px] text-gray-400">Fonte: {c.f}</p>
                    </div>
                  ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[{ l: "Inflação Vestuário", v: "+2,1%", c: "text-green-700", f: "IBGE/PMC" },
                  { l: "Vendas PMC Setorial", v: "+4,5%", c: "text-green-700", f: "IBGE/PMC" },
                  { l: "Custo Algodão (SGS)", v: "+8,2%", c: "text-red-700", f: "BACEN/SGS" }]
                  .map(c => (
                    <div key={c.l} className="bg-white border border-gray-100 rounded-md p-2">
                      <p className="text-[10px] text-gray-500">{c.l}</p>
                      <p className={`text-sm font-bold ${c.c}`}>{c.v}</p>
                      <p className="text-[9px] text-gray-400">Fonte: {c.f}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* METAS DO ANO FISCAL */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-black">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#28071C] text-base">
              Metas do Ano Fiscal <span className="font-bold text-[#7598CF]">{selectedFiscalYear}</span>
            </h2>
            <div className="flex items-center gap-3">
              {isDirty && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-400 rounded-lg text-amber-600 text-sm">
                  <Lock className="w-4 h-4" /><span>Alterações não salvas</span>
                </div>
              )}
              <button onClick={resetToBaseline}
                className="px-3 py-1 text-xs text-[#28071C]/60 border border-[#28071C]/20 rounded-lg hover:bg-white transition-colors">
                ↺ Resetar ao histórico
              </button>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-6 mb-5 text-xs text-[#28071C]/60">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-[#28071C]/30" />Campo livre — editável
            </div>
            <div className="flex items-center gap-2 text-amber-500">
              <Lock className="w-3 h-3" />Bloqueio automático — clique para reverter ao histórico
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#28071C]/20" />Calculado — derivado das metas
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-2">
              <PlanningField label="Receita Bruta (R$)" fieldKey="receitaBruta" value={v.receitaBruta} state={s.receitaBruta} format="currency"
                helpText={`Base ${referenceYear}: R$ ${histRef.receita.toLocaleString("pt-BR")}`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="Margem Bruta (%)" fieldKey="margemBruta" value={v.margemBruta} state={s.margemBruta} format="percent"
                helpText={`Base ${referenceYear}: ${histRef.margemBruta}%`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="PMV (R$)" fieldKey="pmv" value={v.pmv} state={s.pmv} format="currency"
                helpText={`Base ${referenceYear}: R$ ${histRef.pmv}`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="Giro (valor)" fieldKey="giro" value={v.giro} state={s.giro} format="index"
                helpText={`Base ${referenceYear}: ${histRef.giro}`} onEdit={setField} onUnlock={unlock} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PlanningField label="Cobertura (dias)" fieldKey="cobertura" value={v.cobertura} state={s.cobertura} format="days"
                helpText={`Base ${referenceYear}: ${histRef.cobertura} dias`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="OTB (R$)" fieldKey="otb" value={v.otb} state={s.otb} format="currency"
                helpText={`Base ${referenceYear}: R$ ${histRef.otb.toLocaleString("pt-BR")}`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="Produção (peças)" fieldKey="producaoPecas" value={v.producaoPecas} state={s.producaoPecas} format="pieces"
                helpText={`Base ${referenceYear}: ${histRef.producao.toLocaleString("pt-BR")} pç`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="MKD (%)" fieldKey="mkdPct" value={v.mkdPct} state={s.mkdPct} format="percent"
                helpText={`Base ${referenceYear}: ${baseline.mkdPct}%`} onEdit={setField} onUnlock={unlock} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PlanningField label="MKD (R$)" fieldKey="mkdRS" value={v.mkdRS} state="calculated" format="currency"
                helpText={`Base ${referenceYear}: R$ ${histRef.markdown.toLocaleString("pt-BR")}`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="Total de Peças" fieldKey="totalPecas" value={v.totalPecas} state="calculated" format="pieces"
                helpText={`Base ${referenceYear}: ${histRef.producao.toLocaleString("pt-BR")} pç`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="GMROI" fieldKey="gmroi" value={v.gmroi} state="calculated" format="index"
                helpText={`Base ${referenceYear}: ${histRef.gmroi}`} onEdit={setField} onUnlock={unlock} />
              <PlanningField label="Custo Médio (R$)" fieldKey="custoMedio" value={v.custoMedio} state={s.custoMedio} format="currency"
                helpText="Custo médio por peça — base para OTB e GMROI" onEdit={setField} onUnlock={unlock} />
            </div>
          </div>
        </div>

        {/* PLANO CENÁRIO + HISTÓRICO */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
            <h3 className="text-[#28071C] mb-6 text-base">
              Plano Cenário <span className="font-extrabold text-[#7598CF]">{selectedFiscalYear}</span>
            </h3>
            <div className="grid grid-cols-12 gap-2 mb-4 pb-3 border-b-2 border-[#28071C]/20">
              <span className="col-span-4 text-[#28071C]/70 text-xs uppercase tracking-wide">Indicador</span>
              <span className="col-span-3 text-[#28071C]/70 text-xs uppercase tracking-wide text-right">Plano</span>
              <span className="col-span-2 text-[#28071C]/70 text-xs uppercase tracking-wide text-right">% AA</span>
              <span className="col-span-3 text-[#28071C]/70 text-xs uppercase tracking-wide text-right">% AA-1</span>
            </div>
            <div className="space-y-2">
              {planRows.map((row, i) => {
                const vAA = calcVar(row.plan, row.aa)
                const vAA1 = calcVar(row.plan, row.aa1)
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-[#28071C]/10">
                    <span className="col-span-4 text-[#28071C]/70 text-[13px]">{row.label}</span>
                    <span className="col-span-3 text-[#28071C] text-right text-[13px]">{fmtPlan(row.label, row.plan)}</span>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      {row.plan !== null && <>
                        <span className={`text-[11px] ${vAA >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtVar(vAA)}</span>
                        {vAA >= 0 ? <ArrowUp className="w-3 h-3 text-green-600" /> : <ArrowDown className="w-3 h-3 text-red-600" />}
                      </>}
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-1">
                      {row.plan !== null && <>
                        <span className={`text-[11px] ${vAA1 >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtVar(vAA1)}</span>
                        {vAA1 >= 0 ? <ArrowUp className="w-3 h-3 text-green-600" /> : <ArrowDown className="w-3 h-3 text-red-600" />}
                      </>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-gray-400">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[#28071C] text-base">Dados Históricos</h3>
              <select value={selectedHistorical} onChange={e => setSelectedHistorical(e.target.value)}
                className="bg-white rounded-lg px-3 py-2 text-[#28071C] border-2 border-[#7598CF] focus:outline-none cursor-pointer text-sm">
                <option>2023</option><option>2024</option><option>2025</option>
              </select>
            </div>
            <div className="space-y-2">
              {[
                { label: "Receita (R$)",           value: histSel.receita,           fmt: "currency"   },
                { label: "Margem Bruta (%)",        value: histSel.margemBruta,       fmt: "percent"    },
                { label: "PMV (R$)",                value: histSel.pmv,               fmt: "currency"   },
                { label: "OTB (R$)",                value: histSel.otb,               fmt: "currency"   },
                { label: "Estoque Médio (R$)",      value: histSel.estoqueMedioRS,    fmt: "currency"   },
                { label: "Estoque Médio (peças)",   value: histSel.estoqueMedioPecas, fmt: "number"     },
                { label: "Giro",                    value: histSel.giro,              fmt: "multiplier" },
                { label: "Cobertura (dias)",        value: histSel.cobertura,         fmt: "days"       },
                { label: "Markdown (R$)",           value: histSel.markdown,          fmt: "currency"   },
                { label: "Produção (peças)",        value: histSel.producao,          fmt: "number"     },
                { label: "GMROI",                   value: histSel.gmroi,             fmt: "multiplier" },
              ].map((item, i) => {
                const fmt = (val: number, f: string) => {
                  if (f === "currency")   return `R$ ${val.toLocaleString("pt-BR")}`
                  if (f === "percent")    return `${val}%`
                  if (f === "days")       return `${val} dias`
                  if (f === "multiplier") return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  return val.toLocaleString("pt-BR")
                }
                return (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-[#28071C]/10">
                    <span className="text-[#28071C]/70 text-sm">{item.label}</span>
                    <span className="text-[#28071C] text-sm">{fmt(item.value, item.fmt)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* BOTÕES */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button onClick={() => { const n = saveScenario(); alert(`Cenário ${n} salvo!`) }}
              className="flex items-center px-6 py-3 bg-[#7598cf] text-white rounded-lg hover:opacity-90 shadow-sm">
              <Save className="w-5 h-5 mr-2" />
              Salvar Cenário{activeScenario ? ` (atual: ${activeScenario.name})` : ""}
            </button>
            <button disabled={scenarios.length < 2}
              className={`flex items-center px-6 py-3 border-2 rounded-lg ${scenarios.length >= 2 ? "bg-white text-[#7598CF] border-[#7598CF] hover:bg-[#7598CF]/5" : "opacity-50 cursor-not-allowed bg-white text-[#7598CF] border-[#7598CF]"}`}>
              <GitCompare className="w-5 h-5 mr-2" />
              Comparar Cenários{scenarios.length >= 2 ? ` (${scenarios.length})` : ""}
            </button>
          </div>
          <div className="flex space-x-4">
            <button className="flex items-center px-6 py-3 bg-white text-gray-600 border-2 border-gray-300 rounded-lg hover:bg-gray-50">
              <Download className="w-5 h-5 mr-2" />Exportar
            </button>
            <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 shadow-md">
              <CheckCircle className="w-5 h-5 mr-2" />Aplicar Metas
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}
