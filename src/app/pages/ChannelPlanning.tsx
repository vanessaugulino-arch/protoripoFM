import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare, Download, Lock,
  Check, X, AlertTriangle, CheckCircle2, Info, TrendingDown, Clock,
} from "lucide-react";
import { getStoredProfile } from "../types/onboarding";
import type { SalesChannelId } from "../types/onboarding";
import { getPlanCycle, getPlannedYears } from "../types/planCycle";
import {
  saveChannelScenario, listChannelScenarios, exportChannelScenarios,
  markYearAsChannelReviewed, getChannelReviewedYears,
} from "../../services/channelScenarioService";
import type { ChannelScenario } from "../../services/channelScenarioService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserData { name: string; email: string; profile: string }

interface ChannelData {
  receita: number;
  margemBruta: number;   // % — driver
  pmv: number;            // R$ — driver
  ticketMedio: number;    // R$ — driver (receita / nClientes)
  otb: number;            // computed: receita × otbRate
  estoqueMedioRS: number; // computed: receita / giro
  estoqueMedioPecas: number;
  giro: number;           // — driver
  cobertura: number;      // days — driver
  markdown: number;       // computed: receita × mkdRate
  producao: number;       // computed: receita / pmv
  gmroi: number;          // — driver
}

type ChannelId = "atacado" | "varejo" | "ecommerce";

// ─── Channel → onboarding SalesChannel mapping ────────────────────────────────
const CHANNEL_SALES_IDS: Record<ChannelId, SalesChannelId[]> = {
  atacado:   ["atacado"],
  varejo:    ["varejo_fisico", "franquia", "popup"],
  ecommerce: ["ecommerce_proprio", "marketplace", "social_commerce"],
};

const CHANNEL_LABELS: Record<ChannelId, string> = {
  atacado:   "Atacado",
  varejo:    "Varejo",
  ecommerce: "E-commerce",
};

// ─── Macro plan field labels (impact banner) ──────────────────────────────────
const MACRO_FIELD_LABELS: Record<string, string> = {
  receitaBruta:  "Receita Bruta (R$)",
  margemBruta:   "Margem Bruta (%)",
  pmv:           "PMV (R$)",
  ticketMedio:   "Ticket Médio (R$)",
  producaoPecas: "Produção / Peças",
  otbCompra:     "OTB de Compra (R$)",
  mkdPct:        "Markdown (%)",
  giro:          "Giro de Estoque",
  cobertura:     "Cobertura (dias)",
  gmroi:         "GMROI",
};

const RATE_MACRO_FIELDS = new Set(["margemBruta", "mkdPct", "giro", "cobertura", "gmroi"]);
const DRIVER_FIELDS = new Set<keyof ChannelData>(["margemBruta", "pmv", "ticketMedio", "giro", "cobertura", "gmroi"]);

// ─── Utilities ────────────────────────────────────────────────────────────────

function applyRevenue(data: ChannelData, newReceita: number): ChannelData {
  const otbRate = data.receita > 0 ? data.otb / data.receita : 0.365;
  const mkdRate = data.receita > 0 ? data.markdown / data.receita : 0.04;
  const estoqueMedioRS = data.giro > 0 ? Math.round(newReceita / data.giro) : 0;
  return {
    ...data,
    receita: newReceita,
    otb: Math.round(newReceita * otbRate),
    estoqueMedioRS,
    estoqueMedioPecas: data.pmv > 0 ? Math.round(estoqueMedioRS / data.pmv) : 0,
    producao: data.pmv > 0 ? Math.round(newReceita / data.pmv) : 0,
    markdown: Math.round(newReceita * mkdRate),
  };
}

function buildChannel(
  receita: number,
  rates: Pick<ChannelData, "margemBruta" | "pmv" | "ticketMedio" | "giro" | "cobertura" | "gmroi">
): ChannelData {
  const estoqueMedioRS = rates.giro > 0 ? Math.round(receita / rates.giro) : 0;
  return {
    receita,
    ...rates,
    otb: Math.round(receita * 0.365),
    estoqueMedioRS,
    estoqueMedioPecas: rates.pmv > 0 ? Math.round(estoqueMedioRS / rates.pmv) : 0,
    producao: rates.pmv > 0 ? Math.round(receita / rates.pmv) : 0,
    markdown: Math.round(receita * 0.04),
  };
}

function initChannelData(macroReceita: number): Record<ChannelId, ChannelData> {
  return {
    atacado:   buildChannel(Math.round(macroReceita * 0.40), { margemBruta: 38.5, pmv: 165, ticketMedio: 320, giro: 4.5, cobertura: 80, gmroi: 1.85 }),
    varejo:    buildChannel(Math.round(macroReceita * 0.35), { margemBruta: 48.0, pmv: 185, ticketMedio: 290, giro: 4.6, cobertura: 75, gmroi: 2.35 }),
    ecommerce: buildChannel(Math.round(macroReceita * 0.25), { margemBruta: 52.0, pmv: 195, ticketMedio: 340, giro: 4.8, cobertura: 70, gmroi: 2.65 }),
  };
}

const INIT_PERCENTS: Record<ChannelId, number> = { atacado: 40, varejo: 35, ecommerce: 25 };

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChannelPlanning() {
  const navigate = useNavigate();

  // ── User ────────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      if (u.profile !== "CEO") navigate("/dashboard");
    } else navigate("/");
  }, [navigate]);

  // ── Profile ─────────────────────────────────────────────────────────────────
  const profile = getStoredProfile();

  // ── Year / cycle selection (PARTE B) ────────────────────────────────────────
  const plannedYears = getPlannedYears();
  const defaultYear  = plannedYears.length > 0 ? Math.max(...plannedYears) : new Date().getFullYear() + 1;
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);

  // Reviewed years tracking (PARTE C)
  const [reviewedYears, setReviewedYears] = useState<number[]>(() => getChannelReviewedYears());

  // ── Macro plan for selected year ────────────────────────────────────────────
  const planCycle  = getPlanCycle(selectedYear);
  const macroValues: Record<string, unknown> | null = planCycle?.versions?.[0]?.values ?? null;
  const macroReceita: number = (macroValues?.receitaBruta as number | null) ?? 3_120_000;

  const activeMacroKeys = useMemo(() => {
    if (!planCycle?.fieldPriorities) return [];
    return planCycle.fieldPriorities
      .filter(fp => fp.status !== "inactive" && fp.status !== "dismissed")
      .map(fp => fp.key);
  }, [planCycle]);

  // ── Visible channels ─────────────────────────────────────────────────────────
  const visibleChannels = useMemo((): ChannelId[] => {
    const all: ChannelId[] = ["atacado", "varejo", "ecommerce"];
    if (!profile?.salesChannels?.length) return all;
    return all.filter(ch => CHANNEL_SALES_IDS[ch].some(id => profile!.salesChannels.includes(id)));
  }, [profile]);

  // ── Channel state ────────────────────────────────────────────────────────────
  const [percents, setPercents]     = useState<Record<ChannelId, number>>(INIT_PERCENTS);
  const [channelData, setChannelData] = useState<Record<ChannelId, ChannelData>>(() => initChannelData(macroReceita));

  // Re-init when year changes (PARTE B behaviour)
  useEffect(() => {
    const newPlan    = getPlanCycle(selectedYear);
    const newMacroR  = (newPlan?.versions?.[0]?.values?.receitaBruta as number | null) ?? 3_120_000;
    setChannelData(initChannelData(newMacroR));
    setPercents(INIT_PERCENTS);
    setSavedScenarios(listChannelScenarios(selectedYear));
  }, [selectedYear]);

  // ── Scenario state (PARTE E) ─────────────────────────────────────────────────
  const [savedScenarios, setSavedScenarios] = useState<ChannelScenario[]>(() => listChannelScenarios(selectedYear));
  const [showSaveDialog,  setShowSaveDialog]  = useState(false);
  const [saveNameInput,   setSaveNameInput]   = useState("");
  const [toast,           setToast]           = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePercentChange = (ch: ChannelId, newPct: number) => {
    setPercents(prev => ({ ...prev, [ch]: newPct }));
    setChannelData(prev => ({ ...prev, [ch]: applyRevenue(prev[ch], Math.round(macroReceita * newPct / 100)) }));
  };

  const handleDriverChange = (ch: ChannelId, field: keyof ChannelData, raw: string) => {
    const value = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    if (isNaN(value)) return;
    setChannelData(prev => {
      const updated: ChannelData = { ...prev[ch], [field]: value };
      return { ...prev, [ch]: DRIVER_FIELDS.has(field) ? applyRevenue(updated, updated.receita) : updated };
    });
  };

  // Salvar cenário (PARTE E)
  const handleConfirmSave = () => {
    const scenario = saveChannelScenario(
      selectedYear,
      saveNameInput,
      { percents, channelData: channelData as unknown as Record<string, Record<string, number>> }
    );
    const updated = listChannelScenarios(selectedYear);
    setSavedScenarios(updated);
    setShowSaveDialog(false);
    setSaveNameInput("");
    showToast(`Cenário "${scenario.name}" salvo com sucesso.`);
  };

  // Exportar (PARTE E)
  const handleExport = () => {
    if (savedScenarios.length === 0) {
      showToast("Nenhum cenário salvo para exportar. Salve ao menos um cenário primeiro.");
      return;
    }
    exportChannelScenarios(selectedYear, savedScenarios);
    showToast("Exportação iniciada.");
  };

  // Aplicar metas (PARTE E + PARTE C)
  const handleApplyMetas = () => {
    markYearAsChannelReviewed(selectedYear);
    setReviewedYears(getChannelReviewedYears());
    showToast(`Metas por canal do ciclo ${selectedYear} aplicadas. Ciclo marcado como revisado.`);
  };

  // Comparar (PARTE E)
  const handleCompare = () => {
    if (selectedForCompare.length < 2) return;
    const selected = savedScenarios.filter(sc => selectedForCompare.includes(sc.id));
    const summary = selected.map(sc => {
      const totalR = visibleChannels.reduce((s, ch) => {
        const d = sc.data.channelData[ch] as { receita?: number } | undefined;
        return s + (d?.receita ?? 0);
      }, 0);
      const wMargem = visibleChannels.reduce((s, ch) => {
        const d = sc.data.channelData[ch] as { receita?: number; margemBruta?: number } | undefined;
        return s + (d?.receita ?? 0) * (d?.margemBruta ?? 0);
      }, 0);
      return { name: sc.name, receita: totalR, margemBruta: totalR > 0 ? wMargem / totalR : 0 };
    });
    const msg = summary.map(s =>
      `${s.name}: R$ ${Math.round(s.receita).toLocaleString("pt-BR")} — Margem ${s.margemBruta.toFixed(1)}%`
    ).join("\n");
    alert(`Comparação de cenários:\n\n${msg}`);
    setShowCompareModal(false);
    setSelectedForCompare([]);
  };

  // ── Consolidated ──────────────────────────────────────────────────────────────
  const consolidated = useMemo(() => {
    const channels = visibleChannels.map(ch => channelData[ch]);
    const totalReceita = channels.reduce((s, c) => s + c.receita, 0);
    const w = (fn: (c: ChannelData) => number) =>
      totalReceita > 0 ? channels.reduce((s, c) => s + c.receita * fn(c), 0) / totalReceita : 0;
    const totalMarkdown = channels.reduce((s, c) => s + c.markdown, 0);
    return {
      receita:           totalReceita,
      margemBruta:       +w(c => c.margemBruta).toFixed(1),
      pmv:               +w(c => c.pmv).toFixed(0),
      ticketMedio:       +w(c => c.ticketMedio).toFixed(0),
      otb:               channels.reduce((s, c) => s + c.otb, 0),
      estoqueMedioRS:    channels.reduce((s, c) => s + c.estoqueMedioRS, 0),
      estoqueMedioPecas: channels.reduce((s, c) => s + c.estoqueMedioPecas, 0),
      giro:              +w(c => c.giro).toFixed(2),
      cobertura:         +w(c => c.cobertura).toFixed(0),
      markdown:          totalMarkdown,
      producao:          channels.reduce((s, c) => s + c.producao, 0),
      mkdPct:            +(totalReceita > 0 ? (totalMarkdown / totalReceita) * 100 : 0).toFixed(1),
      gmroi:             +w(c => c.gmroi).toFixed(2),
    };
  }, [channelData, visibleChannels]);

  // ── Macro impact (PARTE D) ────────────────────────────────────────────────────
  const visibleTotalPct = visibleChannels.reduce((s, ch) => s + percents[ch], 0);

  const impactedMacro = useMemo(() => {
    if (!macroValues || visibleTotalPct !== 100 || activeMacroKeys.length === 0) return [];
    const projected: Record<string, number> = {
      receitaBruta:  consolidated.receita,
      margemBruta:   consolidated.margemBruta,
      pmv:           consolidated.pmv,
      ticketMedio:   consolidated.ticketMedio,
      producaoPecas: consolidated.producao,
      otbCompra:     consolidated.otb,
      mkdPct:        consolidated.mkdPct,
      giro:          consolidated.giro,
      cobertura:     consolidated.cobertura,
      gmroi:         consolidated.gmroi,
    };
    return activeMacroKeys
      .filter(key => {
        const planned = macroValues[key] as number | null;
        const proj    = projected[key];
        if (planned == null || proj == null) return false;
        const gapPct = Math.abs((proj - planned) / Math.abs(planned)) * 100;
        return gapPct > (RATE_MACRO_FIELDS.has(key) ? 0.5 : 2.0);
      })
      .map(key => ({
        key,
        label:     MACRO_FIELD_LABELS[key] ?? key,
        planned:   macroValues[key] as number,
        projected: projected[key],
        gap:       projected[key] - (macroValues[key] as number),
        isRate:    RATE_MACRO_FIELDS.has(key),
      }));
  }, [activeMacroKeys, macroValues, consolidated, visibleTotalPct]);

  const mainImpactChannel = useMemo(() => {
    if (!impactedMacro.some(i => i.key === "margemBruta" && i.gap < 0)) return null;
    const worst = visibleChannels.reduce<{ ch: ChannelId; score: number } | null>((acc, ch) => {
      const score = channelData[ch].receita * (consolidated.margemBruta - channelData[ch].margemBruta);
      return !acc || score < acc.score ? { ch, score } : acc;
    }, null);
    return worst && worst.score < 0 ? CHANNEL_LABELS[worst.ch] : null;
  }, [impactedMacro, visibleChannels, channelData, consolidated.margemBruta]);

  if (!user) return null;

  // ── Derived UI state ──────────────────────────────────────────────────────────
  const totalPercent  = visibleChannels.reduce((s, ch) => s + percents[ch], 0);
  const macroOk       = impactedMacro.length === 0 && visibleTotalPct === 100;
  const hasMacroCheck = activeMacroKeys.length > 0 && macroValues != null;
  const isPendingReview = plannedYears.includes(selectedYear) && !reviewedYears.includes(selectedYear);

  // ── KPI fields ────────────────────────────────────────────────────────────────
  const kpiFields: Array<{ label: string; key: keyof ChannelData; format: string; isDriver: boolean }> = [
    { label: "Receita (R$)",         key: "receita",           format: "currency",   isDriver: false },
    { label: "Margem Bruta (%)",      key: "margemBruta",       format: "percent",    isDriver: true  },
    { label: "Ticket Médio (R$)",     key: "ticketMedio",       format: "currency",   isDriver: true  },
    { label: "PMV (R$)",              key: "pmv",               format: "currency",   isDriver: true  },
    { label: "OTB (R$)",              key: "otb",               format: "currency",   isDriver: false },
    { label: "Estoque Médio (R$)",    key: "estoqueMedioRS",    format: "currency",   isDriver: false },
    { label: "Estoque Médio (peças)", key: "estoqueMedioPecas", format: "number",     isDriver: false },
    { label: "Giro",                  key: "giro",              format: "multiplier", isDriver: true  },
    { label: "Cobertura (dias)",      key: "cobertura",         format: "days",       isDriver: true  },
    { label: "Markdown (R$)",         key: "markdown",          format: "currency",   isDriver: false },
    { label: "Produção (peças)",      key: "producao",          format: "number",     isDriver: false },
    { label: "GMROI",                 key: "gmroi",             format: "multiplier", isDriver: true  },
  ];

  const fmt = (value: number, format: string) => {
    switch (format) {
      case "currency":   return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
      case "percent":    return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      case "days":       return `${Math.round(value)} dias`;
      case "multiplier": return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      default:           return Math.round(value).toLocaleString("pt-BR");
    }
  };

  const fmtMacroGap = (item: typeof impactedMacro[0]) => {
    if (item.isRate) return `${item.gap > 0 ? "+" : ""}${item.gap.toFixed(1)} p.p.`;
    const pct = (item.gap / Math.abs(item.planned)) * 100;
    return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  const fmtMacroVal = (val: number, key: string) => {
    if (["margemBruta", "mkdPct"].includes(key))   return `${val.toFixed(1)}%`;
    if (["giro", "gmroi"].includes(key))            return val.toFixed(2);
    if (key === "cobertura")                        return `${Math.round(val)} dias`;
    if (key === "producaoPecas")                    return `${Math.round(val).toLocaleString("pt-BR")} pç`;
    return `R$ ${Math.round(val).toLocaleString("pt-BR")}`;
  };

  const consolidatedKpi = (key: keyof ChannelData): number =>
    ({ receita: consolidated.receita, margemBruta: consolidated.margemBruta,
       pmv: consolidated.pmv, ticketMedio: consolidated.ticketMedio,
       otb: consolidated.otb, estoqueMedioRS: consolidated.estoqueMedioRS,
       estoqueMedioPecas: consolidated.estoqueMedioPecas, giro: consolidated.giro,
       cobertura: consolidated.cobertura, markdown: consolidated.markdown,
       producao: consolidated.producao, gmroi: consolidated.gmroi,
    } as Record<keyof ChannelData, number>)[key] ?? 0;

  // Impact check: is this kpi field's consolidated value off-target?
  const isKpiImpacted = (key: keyof ChannelData) => {
    const macroKey = key === "otb" ? "otbCompra" : key === "producao" ? "producaoPecas" : key as string;
    return impactedMacro.some(i => i.key === macroKey);
  };

  const gridStyle = { gridTemplateColumns: `180px repeat(${visibleChannels.length + 1}, 1fr)` };

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

      {/* ── TOAST ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-[#28071C] text-white px-5 py-3 rounded-xl shadow-xl text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* ── HEADER ────────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <p className="text-[#F6F3AA]/70 text-xs uppercase tracking-widest">Módulo 2</p>
              <p className="text-[#F6F3AA] font-semibold text-lg">Planejamento de Metas por Canal</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* PARTE B — Year / cycle selector */}
            <div className="flex flex-col items-end">
              <label className="text-[#F6F3AA]/60 text-[10px] uppercase tracking-widest mb-1">Ano Fiscal</label>
              {plannedYears.length > 0 ? (
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-white/20 text-[#F6F3AA] font-bold text-base border border-[#F6F3AA]/30 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-[#F6F3AA]/40 cursor-pointer"
                >
                  {plannedYears.map(y => (
                    <option key={y} value={y} className="bg-[#7598CF] text-white">
                      {y}{!reviewedYears.includes(y) ? " ●" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[#F6F3AA] font-bold text-base">{selectedYear}</span>
              )}
            </div>

            {/* PARTE C — Pending badge */}
            {isPendingReview && (
              <span className="flex items-center gap-1.5 text-[11px] bg-amber-400/25 text-[#F6F3AA] border border-amber-400/40 rounded-full px-3 py-1 font-semibold">
                <Clock className="w-3 h-3" />Revisão pendente
              </span>
            )}

            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" /><span className="text-sm">{user.name}</span>
            </div>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }}
              className="text-[#F6F3AA] hover:opacity-80"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-5">

        {/* ── PARTE A: Orientation message ──────────────────────────────────── */}
        <div className="flex items-center gap-3 bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-2xl px-5 py-3">
          <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0" />
          <p className="text-sm text-[#28071C]/70">
            <strong className="text-[#28071C]/80">Simule a distribuição de receita pelos canais de venda e compare os cenários.</strong>
            {" "}Ajuste participação e drivers por canal, salve versões alternativas e aplique as metas quando estiver seguro.
          </p>
        </div>

        {/* ── Aviso: sem plano macro ──────────────────────────────────────────── */}
        {!macroValues && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Nenhum cenário salvo encontrado no plano macro (Módulo 1) para <strong>{selectedYear}</strong>.
              A sinalização de impacto ficará disponível após salvar um cenário no Módulo 1.
            </p>
          </div>
        )}

        {/* ── SEÇÃO 1: Distribuição por Canal ────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#7598CF]">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Distribuição por Canal</h2>
            <p className="text-[#28071C]/45 text-xs mt-0.5">
              Ajuste a participação (%) de cada canal na Receita Total planejada de
              <strong className="text-[#28071C]/70"> R$ {macroReceita.toLocaleString("pt-BR")}</strong>.
              O sistema recalcula automaticamente ao alterar.
            </p>
          </div>

          <div className="p-6">
            <div className="grid gap-6 mb-5" style={{ gridTemplateColumns: `repeat(${visibleChannels.length}, 1fr)` }}>
              {visibleChannels.map(ch => (
                <div key={ch} className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#7598CF]/25">
                  <label className="block text-[#28071C]/55 text-xs uppercase tracking-widest font-semibold mb-2">
                    {CHANNEL_LABELS[ch]} — %
                  </label>
                  <input
                    type="number" min={0} max={100} value={percents[ch]}
                    onChange={e => handlePercentChange(ch, Number(e.target.value))}
                    className="w-full text-center text-[#28071C] text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 rounded-lg px-3 py-2 border-2 border-[#7598CF]/20 bg-[#7598CF]/4"
                  />
                  <p className="text-[10px] text-[#28071C]/35 mt-2 text-center">
                    = R$ {Math.round(macroReceita * percents[ch] / 100).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              {totalPercent === 100
                ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700 text-sm font-semibold">Total: 100% ✓</span></>
                : <><X className="w-4 h-4 text-red-500" /><span className="text-red-600 text-sm">Total: {totalPercent}% — deve somar 100%</span></>
              }
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 2: PARTE D — Impact banner ────────────────────────────────── */}
        {hasMacroCheck && totalPercent === 100 && (
          <div className={`rounded-2xl p-5 border-2 transition-all ${macroOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-300"}`}>
            {macroOk ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-emerald-800 font-semibold text-sm">Plano macro em dia</p>
                  <p className="text-emerald-700/70 text-xs mt-0.5">Todos os indicadores selecionados no plano macro estão dentro da meta com a distribuição atual.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 font-semibold text-sm">A distribuição por canal impactou a entrega do plano macro.</p>
                    <p className="text-red-700/70 text-xs mt-0.5">
                      Ajuste os drivers por canal (margem, ticket médio, PMV) para recuperar as metas.
                      {mainImpactChannel && <span className="ml-1 font-medium">Impacto principal vindo do canal {mainImpactChannel}.</span>}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {impactedMacro.map(item => (
                    <div key={item.key} className="bg-white/70 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span className="text-[#28071C] text-sm font-medium truncate">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-shrink-0 font-mono">
                        <span className="text-[#28071C]/60">Projetado: <strong className="text-[#28071C]">{fmtMacroVal(item.projected, item.key)}</strong></span>
                        <span className="text-[#28071C]/40">vs meta</span>
                        <span className="text-[#28071C]/80 font-semibold">{fmtMacroVal(item.planned, item.key)}</span>
                        <span className={`font-bold px-1.5 py-0.5 rounded ${item.gap < 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {fmtMacroGap(item)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SEÇÃO 3: Simulador por Canal ─────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#F6F3AA]">
          <div className="px-6 py-4 border-b border-[#28071C]/8 flex items-start justify-between">
            <div>
              <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Simulador de Canais</h2>
              <p className="text-[#28071C]/45 text-xs mt-0.5">
                <span className="text-[#7598CF] font-semibold">Campos com borda azul</span> são drivers editáveis — alterar um driver recalcula os demais automaticamente.
              </p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-[#28071C]/40 mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7598CF]/60 inline-block" />Driver editável</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#28071C]/15 inline-block" />Calculado</span>
            </div>
          </div>

          <div className="p-6 overflow-x-auto">
            <div className="grid gap-3 min-w-[600px]" style={gridStyle}>

              {/* Header */}
              <div className="flex items-center justify-center bg-[#28071C]/5 rounded-lg h-12">
                <span className="text-[#28071C]/55 text-xs uppercase tracking-widest font-semibold">KPI</span>
              </div>
              {visibleChannels.map(ch => (
                <div key={ch} className="flex items-center justify-center bg-[#7598CF] rounded-lg h-12">
                  <span className="text-white text-sm font-semibold uppercase">{CHANNEL_LABELS[ch]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center bg-[#28071C] rounded-lg h-12">
                <span className="text-white text-xs font-semibold uppercase tracking-widest">Consolidado</span>
              </div>

              {/* KPI rows */}
              {kpiFields.map(field => (
                <>
                  <div key={`lbl-${field.key}`} className="flex items-center px-3 bg-white/50 rounded-lg h-14">
                    <span className="text-[#28071C]/65 text-xs leading-tight">{field.label}</span>
                    {field.isDriver && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[#7598CF]/60 flex-shrink-0" />}
                  </div>
                  {visibleChannels.map(ch => (
                    <div key={`${ch}-${field.key}`}
                      className={`flex items-center px-3 rounded-lg h-14 border ${field.isDriver ? "bg-white border-[#7598CF]/35 ring-1 ring-[#7598CF]/10" : "bg-[#28071C]/3 border-[#28071C]/8"}`}
                    >
                      {field.isDriver ? (
                        <input type="text"
                          value={fmt(channelData[ch][field.key], field.format)}
                          onChange={e => handleDriverChange(ch, field.key, e.target.value)}
                          className="w-full bg-transparent text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 rounded px-1 py-0.5"
                        />
                      ) : (
                        <span className="text-[#28071C]/60 text-sm font-mono">{fmt(channelData[ch][field.key], field.format)}</span>
                      )}
                    </div>
                  ))}
                  <div key={`cons-${field.key}`}
                    className={`flex items-center px-3 rounded-lg h-14 border ${hasMacroCheck && isKpiImpacted(field.key) ? "bg-red-50 border-red-200" : "bg-[#28071C]/4 border-[#28071C]/10"}`}
                  >
                    <span className="text-[#28071C] text-sm font-semibold font-mono">{fmt(consolidatedKpi(field.key), field.format)}</span>
                  </div>
                </>
              ))}
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 4: Cenários salvos ────────────────────────────────────────── */}
        {savedScenarios.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#28071C]/8">
              <h3 className="text-[#28071C] font-semibold text-sm">Cenários Salvos — {selectedYear}</h3>
              <p className="text-[#28071C]/40 text-xs mt-0.5">Clique em um cenário para carregá-lo e continuar simulando.</p>
            </div>
            <div className="p-5 flex flex-wrap gap-3">
              {savedScenarios.map(sc => (
                <div key={sc.id} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border-2 bg-white border-[#28071C]/10 text-[#28071C]/70 hover:border-[#7598CF]/40">
                  <Check className="w-3 h-3 text-[#7598CF]" />
                  <span className="font-medium">{sc.name}</span>
                  <span className="text-[10px] text-[#28071C]/35">{new Date(sc.savedAt).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SEÇÃO 5: Ações ──────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              {/* Salvar cenário */}
              <button
                onClick={() => { setSaveNameInput(""); setShowSaveDialog(true); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-sm"
              >
                <Save className="w-4 h-4" />Salvar cenário
              </button>

              {/* Comparar cenários */}
              <button
                onClick={() => { setSelectedForCompare([]); setShowCompareModal(true); }}
                disabled={savedScenarios.length < 2}
                title={savedScenarios.length < 2 ? "Salve ao menos 2 cenários para comparar" : "Comparar cenários salvos"}
                className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl font-semibold text-sm hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                <GitCompare className="w-4 h-4" />
                Comparar cenários
                {savedScenarios.length >= 2 && (
                  <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{savedScenarios.length}</span>
                )}
              </button>

              {/* Exportar */}
              <button
                onClick={handleExport}
                disabled={savedScenarios.length === 0}
                title={savedScenarios.length === 0 ? "Salve ao menos um cenário primeiro" : "Exportar cenários como JSON"}
                className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                <Download className="w-4 h-4" />Exportar
              </button>
            </div>

            {/* Aplicar metas */}
            <button
              onClick={handleApplyMetas}
              disabled={totalPercent !== 100 || !macroOk}
              title={totalPercent !== 100 ? "Ajuste a participação para somar 100%" : !macroOk ? "Indicadores macro fora da meta" : "Aplicar metas e concluir revisão por canal"}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                totalPercent === 100 && macroOk ? "bg-emerald-600 text-white hover:opacity-90" : "bg-[#28071C]/20 text-[#28071C]/40 cursor-not-allowed"
              }`}
            >
              <Lock className="w-4 h-4" />Aplicar Metas
            </button>
          </div>
          <p className="text-[9px] text-[#28071C]/30 mt-2">
            Nenhum cenário altera dados oficiais até ser aplicado. O botão "Aplicar Metas" marca o ciclo como revisado por canal.
          </p>
        </div>
      </main>

      {/* ── SAVE DIALOG ──────────────────────────────────────────────────────── */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 w-[420px] mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-base">Nomear Cenário</h3>
              <button onClick={() => setShowSaveDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[#28071C]/50 text-sm mb-4">Dê um nome para identificar este cenário de canal. Deixe em branco para usar o nome automático.</p>
            <input
              type="text" autoFocus
              value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirmSave()}
              placeholder={`Ex: Mix Atacado 45% — ${selectedYear}`}
              className="w-full px-4 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm text-[#28071C] placeholder-[#28071C]/30 focus:border-[#7598CF] focus:outline-none"
            />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm font-semibold text-[#28071C]/60 hover:bg-gray-50 transition-all">
                Cancelar
              </button>
              <button onClick={handleConfirmSave}
                className="flex-1 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all">
                Salvar cenário
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARE MODAL ────────────────────────────────────────────────────── */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full mx-4">
            <h3 className="text-[#28071C] font-bold text-base mb-1">Comparar Cenários</h3>
            <p className="text-[#28071C]/50 text-sm mb-5">Selecione ao menos 2 cenários para comparar os resultados consolidados.</p>

            {savedScenarios.length === 0 ? (
              <p className="text-center text-[#28071C]/35 text-sm py-6">Nenhum cenário salvo ainda.</p>
            ) : (
              <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                {savedScenarios.map(sc => {
                  const isSelected = selectedForCompare.includes(sc.id);
                  return (
                    <label key={sc.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-colors border-2 ${isSelected ? "border-[#7598CF] bg-[#7598CF]/6" : "border-transparent hover:bg-gray-50"}`}>
                      <input type="checkbox" className="w-4 h-4 accent-[#7598CF]"
                        checked={isSelected}
                        onChange={e => setSelectedForCompare(prev => e.target.checked ? [...prev, sc.id] : prev.filter(id => id !== sc.id))}
                      />
                      <div className="flex-1">
                        <p className="text-[#28071C] text-sm font-semibold">{sc.name}</p>
                        <p className="text-[#28071C]/40 text-xs">{new Date(sc.savedAt).toLocaleString("pt-BR")}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowCompareModal(false); setSelectedForCompare([]); }}
                className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/20 rounded-xl text-sm font-semibold text-[#28071C] hover:bg-gray-50 transition-all">
                Cancelar
              </button>
              <button onClick={handleCompare}
                disabled={selectedForCompare.length < 2}
                className="flex-1 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-all">
                Comparar ({selectedForCompare.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
