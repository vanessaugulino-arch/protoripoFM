import { useEffect, useState } from "react";
import { usePlanningEngine } from '../../hooks/usePlanningEngine'
import { PlanningField } from '../../components/PlanningField'
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Save,
  GitCompare,
  Download,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Lock
} from "lucide-react";
import logoTFO from "figma:asset/518a2b0fbf767e7d53e8db6869b3fce6e2473ef2.png";

interface UserData {
  name: string;
  email: string;
  profile: string;
}

interface HistoricalData {
  year: string;
  receita: number;
  margemBruta: number;
  pmv: number;
  otb: number;
  estoqueMedioRS: number;
  estoqueMedioPecas: number;
  giro: number;
  cobertura: number;
  markdown: number;
  producao: number;
  gmroi: number;
}

const historicalDatabase: HistoricalData[] = [
  {
    year: "2023",
    receita: 2450000,
    margemBruta: 40.5,
    pmv: 145,
    otb: 1050000,
    estoqueMedioRS: 720000,
    estoqueMedioPecas: 4965,
    giro: 3.85,
    cobertura: 78,
    markdown: 165000,
    producao: 16890,
    gmroi: 1.55,
  },
  {
    year: "2024",
    receita: 2700000,
    margemBruta: 42.0,
    pmv: 158,
    otb: 1100000,
    estoqueMedioRS: 695000,
    estoqueMedioPecas: 4398,
    giro: 4.05,
    cobertura: 75,
    markdown: 148000,
    producao: 17850,
    gmroi: 1.70,
  },
  {
    year: "2025",
    receita: 2850000,
    margemBruta: 42.3,
    pmv: 155,
    otb: 1140000,
    estoqueMedioRS: 680000,
    estoqueMedioPecas: 4387,
    giro: 4.19,
    cobertura: 72,
    markdown: 142500,
    producao: 18387,
    gmroi: 1.77,
  },
];

export default function Planning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [selectedHistoricalYear, setSelectedHistoricalYear] = useState("2025");
  const [selectedFiscalYear, setSelectedFiscalYear] = useState("2027");
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  // ── ENGINE DE CÁLCULO ────────────────────────────────────────
  const {
    current,
    isDirty,
    activeScenario,
    setField,
    unlock,
    saveScenario,
  } = usePlanningEngine(
    selectedFiscalYear ? parseInt(selectedFiscalYear) : new Date().getFullYear() + 1
  );

  // Atalhos para os valores e estados do engine
  const v = current.values;
  const s = current.states;

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      if (userData.profile !== "CEO") {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  const getHistoricalData = (year: string): HistoricalData => {
    return historicalDatabase.find((d) => d.year === year) || historicalDatabase[2];
  };

  const calculateVariation = (planValue: number | null, historicalValue: number): number => {
    if (!planValue || historicalValue === 0) return 0;
    return ((planValue - historicalValue) / historicalValue) * 100;
  };

  const formatVariation = (variation: number): string => {
    const sign = variation >= 0 ? "+" : "";
    return `${sign}${variation.toFixed(1)}%`;
  };

  // Ano anterior ao histórico selecionado
  const currentYearData  = getHistoricalData(selectedHistoricalYear);
  const previousYearData = getHistoricalData(
    (parseInt(selectedHistoricalYear) - 1).toString()
  );

  // Linhas do Plano Cenário — lidas do engine
  const planRows = [
    { label: "Receita (R$)",          planValue: v.receitaBruta,   aaValue: currentYearData.receita,          aa1Value: previousYearData.receita },
    { label: "Margem Bruta (%)",       planValue: v.margemBruta,    aaValue: currentYearData.margemBruta,      aa1Value: previousYearData.margemBruta },
    { label: "PMV (R$)",               planValue: v.pmv,            aaValue: currentYearData.pmv,              aa1Value: previousYearData.pmv },
    { label: "OTB (R$)",               planValue: v.otb,            aaValue: currentYearData.otb,              aa1Value: previousYearData.otb },
    { label: "Estoque Médio (R$)",     planValue: v.estoqueMedio,   aaValue: currentYearData.estoqueMedioRS,   aa1Value: previousYearData.estoqueMedioRS },
    { label: "Estoque Médio (peças)",  planValue: v.pecasVendidas,  aaValue: currentYearData.estoqueMedioPecas,aa1Value: previousYearData.estoqueMedioPecas },
    { label: "Giro",                   planValue: v.giro,           aaValue: currentYearData.giro,             aa1Value: previousYearData.giro },
    { label: "Cobertura (dias)",       planValue: v.cobertura,      aaValue: currentYearData.cobertura,        aa1Value: previousYearData.cobertura },
    { label: "Markdown (R$)",          planValue: v.mkdRS,          aaValue: currentYearData.markdown,         aa1Value: previousYearData.markdown },
    { label: "Produção (peças)",       planValue: v.producaoPecas,  aaValue: currentYearData.producao,         aa1Value: previousYearData.producao },
    { label: "GMROI",                  planValue: v.gmroi,          aaValue: currentYearData.gmroi,            aa1Value: previousYearData.gmroi },
  ];

  const formatPlanValue = (label: string, value: number | null): string => {
    if (value === null || isNaN(value)) return "—";
    if (label.includes("R$"))          return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
    if (label === "Margem Bruta (%)")  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    if (label.includes("dias"))        return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} dias`;
    if (label.includes("peças"))       return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} pç`;
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

      {/* ── TOPBAR ─────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={handleBack} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <span className="text-[#F6F3AA] text-xl">
              Fashion Mind | Planejamento Estratégico - Ano Fiscal
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span>{user.name}</span>
            </div>
            <button onClick={handleLogout} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">

        {/* ── SELETOR DE ANO ─────────────────────────────────────── */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                Ano Fiscal Alvo
              </label>
              <select
                value={selectedFiscalYear}
                onChange={(e) => setSelectedFiscalYear(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] text-[14px] border-2 border-[#7598CF] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
                <option value="2030">2030</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── ACCORDION MACROECONÔMICO ────────────────────────────── */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl mb-6 shadow-sm overflow-hidden">
          <button
            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/40 transition-colors"
          >
            <span className="text-[#28071C] font-semibold text-[16px]">
              Cenário Macroeconômico Projetado -{" "}
              <span className="font-extrabold text-[#7598CF]">{selectedFiscalYear}</span>
            </span>
            <ChevronDown className={`w-[14px] h-[14px] text-[#28071C] transition-transform duration-200 ${isAccordionOpen ? "rotate-180" : ""}`} />
          </button>
          {isAccordionOpen && (
            <div className="flex flex-col gap-3 p-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Projeção IPCA",   value: "3,8%",    fonte: "Focus" },
                  { label: "Projeção Selic",  value: "12,75%",  fonte: "Focus" },
                  { label: "Projeção Câmbio", value: "R$ 5,85", fonte: "Focus" },
                  { label: "Projeção PIB",    value: "2,3%",    fonte: "Focus" },
                ].map((card) => (
                  <div key={card.label} className="bg-white border border-gray-100 rounded-md flex flex-col gap-1 p-2">
                    <span className="text-[10px] text-gray-500">{card.label}</span>
                    <span className="text-[14px] text-[#28071C] font-bold">{card.value}</span>
                    <span className="text-[9px] text-gray-400">Fonte: {card.fonte}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Inflação Vestuário",  value: "+2,1%", color: "text-green-700", fonte: "IBGE / PMC" },
                  { label: "Vendas PMC Setorial",  value: "+4,5%", color: "text-green-700", fonte: "IBGE / PMC" },
                  { label: "Custo Algodão (SGS)",  value: "+8,2%", color: "text-red-700",   fonte: "BACEN / SGS" },
                ].map((card) => (
                  <div key={card.label} className="bg-white border border-gray-100 rounded-md flex flex-col gap-1 p-2">
                    <span className="text-[10px] text-gray-500">{card.label}</span>
                    <span className={`text-[14px] font-bold ${card.color}`}>{card.value}</span>
                    <span className="text-[9px] text-gray-400">Fonte: {card.fonte}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── METAS DO ANO FISCAL ─────────────────────────────────── */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-black">

          {/* Título + badge isDirty + legenda */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[#28071C] text-[16px]">
              Metas do Ano Fiscal{" "}
              <span className="font-bold text-[#7598CF]">{selectedFiscalYear}</span>
            </h2>
            {isDirty && (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-400 rounded-lg text-amber-600 text-sm">
                <Lock className="w-4 h-4" />
                <span>Alterações não salvas — salve o cenário para preservar</span>
              </div>
            )}
          </div>

          {/* Legenda de estados */}
          <div className="flex items-center gap-6 mb-6 text-xs text-[#28071C]/60">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-[#28071C]/30" />
              <span>Campo livre — editável</span>
            </div>
            <div className="flex items-center gap-2 text-amber-500">
              <Lock className="w-3 h-3" />
              <span>Bloqueio automático — clique para reverter</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#28071C]/20" />
              <span>Calculado — derivado das metas</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">

            {/* LINHA 1 */}
            <div className="grid grid-cols-4 gap-2">
              <PlanningField
                label="Receita Bruta (R$)"
                fieldKey="receitaBruta"
                value={v.receitaBruta}
                state={s.receitaBruta}
                format="currency"
                helpText={`Histórico ${selectedHistoricalYear}: R$ ${currentYearData.receita.toLocaleString("pt-BR")}`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="Margem Bruta (%)"
                fieldKey="margemBruta"
                value={v.margemBruta}
                state={s.margemBruta}
                format="percent"
                helpText={`Histórico ${selectedHistoricalYear}: ${currentYearData.margemBruta}%`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="PMV (R$)"
                fieldKey="pmv"
                value={v.pmv}
                state={s.pmv}
                format="currency"
                helpText={`Histórico ${selectedHistoricalYear}: R$ ${currentYearData.pmv}`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="Giro (valor)"
                fieldKey="giro"
                value={v.giro}
                state={s.giro}
                format="index"
                helpText={`Histórico ${selectedHistoricalYear}: ${currentYearData.giro}`}
                onEdit={setField}
                onUnlock={unlock}
              />
            </div>

            {/* LINHA 2 */}
            <div className="grid grid-cols-4 gap-2">
              <PlanningField
                label="Cobertura (dias)"
                fieldKey="cobertura"
                value={v.cobertura}
                state={s.cobertura}
                format="days"
                helpText={`Histórico ${selectedHistoricalYear}: ${currentYearData.cobertura} dias`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="OTB (R$)"
                fieldKey="otb"
                value={v.otb}
                state={s.otb}
                format="currency"
                helpText={`Histórico ${selectedHistoricalYear}: R$ ${currentYearData.otb.toLocaleString("pt-BR")}`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="Produção (peças)"
                fieldKey="producaoPecas"
                value={v.producaoPecas}
                state={s.producaoPecas}
                format="pieces"
                helpText={`Histórico ${selectedHistoricalYear}: ${currentYearData.producao.toLocaleString("pt-BR")} pç`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="MKD (%)"
                fieldKey="mkdPct"
                value={v.mkdPct}
                state={s.mkdPct}
                format="percent"
                helpText={`Histórico ${selectedHistoricalYear}: ${((currentYearData.markdown / currentYearData.receita) * 100).toFixed(1)}%`}
                onEdit={setField}
                onUnlock={unlock}
              />
            </div>

            {/* LINHA 3 — sempre calculados */}
            <div className="grid grid-cols-4 gap-2">
              <PlanningField
                label="MKD (R$)"
                fieldKey="mkdRS"
                value={v.mkdRS}
                state="calculated"
                format="currency"
                helpText={`Histórico ${selectedHistoricalYear}: R$ ${currentYearData.markdown.toLocaleString("pt-BR")}`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="Total de Peças"
                fieldKey="totalPecas"
                value={v.totalPecas}
                state="calculated"
                format="pieces"
                helpText={`Histórico ${selectedHistoricalYear}: ${currentYearData.producao.toLocaleString("pt-BR")} pç`}
                onEdit={setField}
                onUnlock={unlock}
              />
              <PlanningField
                label="GMROI"
                fieldKey="gmroi"
                value={v.gmroi}
                state="calculated"
                format="index"
                helpText={`Histórico ${selectedHistoricalYear}: ${currentYearData.gmroi}`}
                onEdit={setField}
                onUnlock={unlock}
              />
              {/* Custo Médio — campo de suporte ao engine, não visível antes */}
              <PlanningField
                label="Custo Médio (R$)"
                fieldKey="custoMedio"
                value={v.custoMedio}
                state={s.custoMedio}
                format="currency"
                helpText="Custo médio por peça — base para OTB e GMROI"
                onEdit={setField}
                onUnlock={unlock}
              />
            </div>

          </div>
        </div>

        {/* ── PLANO CENÁRIO + HISTÓRICO ───────────────────────────── */}
        <div className="grid grid-cols-2 gap-6 mb-8">

          {/* Plano Cenário — alimentado pelo engine */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
            <h3 className="text-[#28071C] mb-6 text-[16px]">
              Plano Cenário{" "}
              <span className="font-extrabold text-[#7598CF]">{selectedFiscalYear}</span>
            </h3>
            <div className="grid grid-cols-12 gap-2 mb-4 pb-3 border-b-2 border-[#28071C]/20">
              <span className="col-span-4 text-[#28071C]/70 text-xs uppercase tracking-wide">Indicador</span>
              <span className="col-span-3 text-[#28071C]/70 text-xs uppercase tracking-wide text-right">Plano</span>
              <span className="col-span-2 text-[#28071C]/70 text-xs uppercase tracking-wide text-right">% AA</span>
              <span className="col-span-3 text-[#28071C]/70 text-xs uppercase tracking-wide text-right">% AA-1</span>
            </div>
            <div className="space-y-3">
              {planRows.map((item, index) => {
                const variationAA  = calculateVariation(item.planValue, item.aaValue);
                const variationAA1 = calculateVariation(item.planValue, item.aa1Value);
                return (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-[#28071C]/10">
                    <span className="col-span-4 text-[#28071C]/70 text-[13px]">{item.label}</span>
                    <span className="col-span-3 text-[#28071C] text-right text-[13px]">
                      {formatPlanValue(item.label, item.planValue)}
                    </span>
                    <div className="col-span-2 flex items-center justify-end space-x-1">
                      <span className={`${variationAA >= 0 ? "text-green-600" : "text-red-600"} text-[11px]`}>
                        {item.planValue !== null ? formatVariation(variationAA) : "—"}
                      </span>
                      {item.planValue !== null && (
                        variationAA >= 0
                          ? <ArrowUp   className="w-3 h-3 text-green-600" />
                          : <ArrowDown className="w-3 h-3 text-red-600"   />
                      )}
                    </div>
                    <div className="col-span-3 flex items-center justify-end space-x-1">
                      <span className={`${variationAA1 >= 0 ? "text-green-600" : "text-red-600"} text-[11px]`}>
                        {item.planValue !== null ? formatVariation(variationAA1) : "—"}
                      </span>
                      {item.planValue !== null && (
                        variationAA1 >= 0
                          ? <ArrowUp   className="w-3 h-3 text-green-600" />
                          : <ArrowDown className="w-3 h-3 text-red-600"   />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Histórico */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-gray-400">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[#28071C] text-[16px]">Dados Históricos</h3>
              <div className="flex items-center space-x-2">
                <label className="text-[#28071C]/70 text-sm">Ano de Referência:</label>
                <select
                  value={selectedHistoricalYear}
                  onChange={(e) => setSelectedHistoricalYear(e.target.value)}
                  className="bg-white rounded-lg px-3 py-2 text-[#28071C] border-2 border-[#7598CF] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                >
                  <option value="2023">2023</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Receita (R$)",          value: currentYearData.receita,          format: "currency"    },
                { label: "Margem Bruta (%)",       value: currentYearData.margemBruta,      format: "percent"     },
                { label: "PMV (R$)",               value: currentYearData.pmv,              format: "currency"    },
                { label: "OTB (R$)",               value: currentYearData.otb,              format: "currency"    },
                { label: "Estoque Médio (R$)",     value: currentYearData.estoqueMedioRS,   format: "currency"    },
                { label: "Estoque Médio (peças)",  value: currentYearData.estoqueMedioPecas,format: "number"      },
                { label: "Giro",                   value: currentYearData.giro,             format: "multiplier"  },
                { label: "Cobertura (dias)",       value: currentYearData.cobertura,        format: "days"        },
                { label: "Markdown (R$)",          value: currentYearData.markdown,         format: "currency"    },
                { label: "Produção (peças)",       value: currentYearData.producao,         format: "number"      },
                { label: "GMROI",                  value: currentYearData.gmroi,            format: "multiplier"  },
              ].map((item, index) => {
                const fmt = (value: number, format: string) => {
                  switch (format) {
                    case "currency":   return `R$ ${value.toLocaleString("pt-BR")}`;
                    case "percent":    return `${value}%`;
                    case "days":       return `${value} dias`;
                    case "multiplier": return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    default:           return value.toLocaleString("pt-BR");
                  }
                };
                return (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-[#28071C]/10">
                    <span className="text-[#28071C]/70 text-sm">{item.label}</span>
                    <span className="text-[#28071C] text-[14px]">{fmt(item.value, item.format)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BOTÕES DE AÇÃO ──────────────────────────────────────── */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              onClick={() => {
                const name = saveScenario();
                alert(`Cenário ${name} salvo com sucesso!`);
              }}
              className="flex items-center px-6 py-3 bg-[#7598cf] text-white rounded-lg hover:opacity-90 transition-all shadow-sm"
            >
              <Save className="w-5 h-5 mr-2" />
              Salvar Cenário{activeScenario ? ` (atual: ${activeScenario.name})` : ""}
            </button>
            <button
              disabled
              className="flex items-center px-6 py-3 bg-white text-[#7598CF] border-2 border-[#7598CF] rounded-lg opacity-50 cursor-not-allowed"
            >
              <GitCompare className="w-5 h-5 mr-2" />
              Comparar Cenários
            </button>
          </div>
          <div className="flex space-x-4">
            <button className="flex items-center px-6 py-3 bg-white text-gray-600 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
              <Download className="w-5 h-5 mr-2" />
              Exportar
            </button>
            <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
              <CheckCircle className="w-5 h-5 mr-2" />
              Aplicar Metas
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
