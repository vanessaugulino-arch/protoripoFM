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
  // Revenue
  receita: number;           // computed: macroReceita × pct/100
  margemBrutaRS: number;     // computed: receita × margemBruta/100
  margemBruta: number;       // % — driver
  // Pricing / volume
  pmv: number;               // R$ — driver
  ticketMedio: number;       // R$ — driver
  custoMedio: number;        // R$ — driver
  // Stock
  giro: number;              // — driver
  cobertura: number;         // days — driver
  otb: number;               // computed: producao × custoMedio
  estoqueMedioRS: number;    // computed: receita / giro (kept for internal calc)
  estoqueMedioPecas: number; // computed (kept for internal calc)
  // Markdown
  mkdPct: number;            // % — driver
  markdown: number;          // computed: receita × mkdPct/100
  // Production
  producao: number;          // computed: receita / pmv
  totalPecas: number;        // computed: same as producao in channel context
  // Performance
  gmroi: number;             // — driver
}

type ChannelId = "atacado" | "varejo" | "ecommerce";

// ─── Mappings ─────────────────────────────────────────────────────────────────

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
  custoMedio:    "Custo Médio (R$)",
};

// Rate-based macro fields: tolerance in percentage points, not %
const RATE_MACRO_FIELDS = new Set(["margemBruta", "mkdPct", "giro", "cobertura", "gmroi"]);

// Driver fields: constant when revenue scales; trigger applyRevenue on edit
const DRIVER_FIELDS = new Set<keyof ChannelData>([
  "margemBruta", "pmv", "ticketMedio", "custoMedio", "giro", "cobertura", "mkdPct", "gmroi",
]);

// ─── Utilities ────────────────────────────────────────────────────────────────

function applyRevenue(data: ChannelData, newReceita: number): ChannelData {
  const otbRate        = data.receita > 0 ? data.otb / data.receita : data.custoMedio > 0 && data.pmv > 0 ? data.custoMedio / data.pmv : 0.365;
  const estoqueMedioRS = data.giro > 0 ? Math.round(newReceita / data.giro) : 0;
  const producao       = data.pmv > 0 ? Math.round(newReceita / data.pmv) : 0;
  return {
    ...data,
    receita:           newReceita,
    margemBrutaRS:     Math.round(newReceita * data.margemBruta / 100),
    otb:               Math.round(newReceita * otbRate),
    estoqueMedioRS,
    estoqueMedioPecas: data.pmv > 0 ? Math.round(estoqueMedioRS / data.pmv) : 0,
    producao,
    totalPecas:        producao,
    markdown:          Math.round(newReceita * data.mkdPct / 100),
  };
}

function buildChannel(
  receita: number,
  rates: Pick<ChannelData, "margemBruta" | "pmv" | "ticketMedio" | "custoMedio" | "giro" | "cobertura" | "mkdPct" | "gmroi">
): ChannelData {
  const estoqueMedioRS = rates.giro > 0 ? Math.round(receita / rates.giro) : 0;
  const producao       = rates.pmv > 0 ? Math.round(receita / rates.pmv) : 0;
  const otbRate        = rates.custoMedio > 0 && rates.pmv > 0 ? rates.custoMedio / rates.pmv : 0.365;
  return {
    receita,
    margemBrutaRS:     Math.round(receita * rates.margemBruta / 100),
    ...rates,
    otb:               Math.round(receita * otbRate),
    estoqueMedioRS,
    estoqueMedioPecas: rates.pmv > 0 ? Math.round(estoqueMedioRS / rates.pmv) : 0,
    producao,
    totalPecas:        producao,
    markdown:          Math.round(receita * rates.mkdPct / 100),
  };
}

function initChannelData(macroReceita: number): Record<ChannelId, ChannelData> {
  return {
    atacado:   buildChannel(Math.round(macroReceita * 0.40), { margemBruta: 38.5, pmv: 165, ticketMedio: 320, custoMedio: 60, giro: 4.5, cobertura: 80, mkdPct: 4.0, gmroi: 1.85 }),
    varejo:    buildChannel(Math.round(macroReceita * 0.35), { margemBruta: 48.0, pmv: 185, ticketMedio: 290, custoMedio: 72, giro: 4.6, cobertura: 75, mkdPct: 4.0, gmroi: 2.35 }),
    ecommerce: buildChannel(Math.round(macroReceita * 0.25), { margemBruta: 52.0, pmv: 195, ticketMedio: 340, custoMedio: 75, giro: 4.8, cobertura: 70, mkdPct: 4.0, gmroi: 2.65 }),
  };
}

const INIT_PERCENTS: Record<ChannelId, number> = { atacado: 40, varejo: 35, ecommerce: 25 };

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChannelPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      if (u.profile !== "CEO") navigate("/dashboard");
    } else navigate("/");
  }, [navigate]);

  const profile = getStoredProfile();

  // ── Year / cycle ─────────────────────────────────────────────────────────────
  const plannedYears = getPlannedYears();
  const defaultYear  = plannedYears.length > 0 ? Math.max(...plannedYears) : new Date().getFullYear() + 1;
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [reviewedYears, setReviewedYears] = useState<number[]>(() => getChannelReviewedYears());

  // ── Macro plan ────────────────────────────────────────────────────────────────
  const planCycle    = getPlanCycle(selectedYear);
  const macroValues: Record<string, unknown> | null = planCycle?.versions?.[0]?.values ?? null;
  const macroReceita: number = (macroValues?.receitaBruta as number | null) ?? 3_120_000;

  const activeMacroKeys = useMemo(() => {
    if (!planCycle?.fieldPriorities) return [];
    return planCycle.fieldPriorities
      .filter(fp => fp.status !== "inactive" && fp.status !== "dismissed")
      .map(fp => fp.key);
  }, [planCycle]);

  // ── Visible channels ──────────────────────────────────────────────────────────
  const visibleChannels = useMemo((): ChannelId[] => {
    const all: ChannelId[] = ["atacado", "varejo", "ecommerce"];
    if (!profile?.salesChannels?.length) return all;
    return all.filter(ch => CHANNEL_SALES_IDS[ch].some(id => profile!.salesChannels.includes(id)));
  }, [profile]);

  // ── Channel state ─────────────────────────────────────────────────────────────
  const [percents, setPercents]       = useState<Record<ChannelId, number>>(INIT_PERCENTS);
  const [channelData, setChannelData] = useState<Record<ChannelId, ChannelData>>(() => initChannelData(macroReceita));

  useEffect(() => {
    const plan     = getPlanCycle(selectedYear);
    const newMacroR = (plan?.versions?.[0]?.values?.receitaBruta as number | null) ?? 3_120_000;
    setChannelData(initChannelData(newMacroR));
    setPercents(INIT_PERCENTS);
    setSavedScenarios(listChannelScenarios(selectedYear));
  }, [selectedYear]);

  // ── Scenario state ────────────────────────────────────────────────────────────
  const [savedScenarios, setSavedScenarios]       = useState<ChannelScenario[]>(() => listChannelScenarios(selectedYear));
  const [showSaveDialog, setShowSaveDialog]       = useState(false);
  const [saveNameInput, setSaveNameInput]         = useState("");
  const [toast, setToast]                         = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal]   = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Handlers ──────────────────────────────────────────────────────────────────

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

  const handleConfirmSave = () => {
    const sc = saveChannelScenario(
      selectedYear, saveNameInput,
      { percents, channelData: channelData as unknown as Record<string, Record<string, number>> }
    );
    setSavedScenarios(listChannelScenarios(selectedYear));
    setShowSaveDialog(false);
    setSaveNameInput("");
    showToast(`Cenário "${sc.name}" salvo.`);
  };

  const handleExport = () => {
    if (savedScenarios.length === 0) { showToast("Salve ao menos um cenário antes de exportar."); return; }
    exportChannelScenarios(selectedYear, savedScenarios);
    showToast("Exportação iniciada.");
  };

  const handleApplyMetas = () => {
    markYearAsChannelReviewed(selectedYear);
    setReviewedYears(getChannelReviewedYears());
    showToast(`Metas do ciclo ${selectedYear} aplicadas. Ciclo marcado como revisado.`);
  };

  const handleCompare = () => {
    const sel = savedScenarios.filter(sc => selectedForCompare.includes(sc.id));
    const summary = sel.map(sc => {
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
    alert(`Comparação:\n\n${summary.map(s => `${s.name}\nReceita: R$ ${Math.round(s.receita).toLocaleString("pt-BR")} | Margem: ${s.margemBruta.toFixed(1)}%`).join("\n\n")}`);
    setShowCompareModal(false);
    setSelectedForCompare([]);
  };

  // ── Consolidated ──────────────────────────────────────────────────────────────
  const consolidated = useMemo(() => {
    const channels    = visibleChannels.map(ch => channelData[ch]);
    const totalReceita = channels.reduce((s, c) => s + c.receita, 0);
    const w = (fn: (c: ChannelData) => number) =>
      totalReceita > 0 ? channels.reduce((s, c) => s + c.receita * fn(c), 0) / totalReceita : 0;
    const totalMarkdown  = channels.reduce((s, c) => s + c.markdown, 0);
    const totalProducao  = channels.reduce((s, c) => s + c.producao, 0);
    return {
      receita:           totalReceita,
      margemBrutaRS:     Math.round(totalReceita * w(c => c.margemBruta) / 100),
      margemBruta:       +w(c => c.margemBruta).toFixed(1),
      pmv:               +w(c => c.pmv).toFixed(0),
      ticketMedio:       +w(c => c.ticketMedio).toFixed(0),
      custoMedio:        +w(c => c.custoMedio).toFixed(0),
      giro:              +w(c => c.giro).toFixed(2),
      cobertura:         +w(c => c.cobertura).toFixed(0),
      otb:               channels.reduce((s, c) => s + c.otb, 0),
      estoqueMedioRS:    channels.reduce((s, c) => s + c.estoqueMedioRS, 0),
      estoqueMedioPecas: channels.reduce((s, c) => s + c.estoqueMedioPecas, 0),
      mkdPct:            +(totalReceita > 0 ? (totalMarkdown / totalReceita) * 100 : 0).toFixed(1),
      markdown:          totalMarkdown,
      producao:          totalProducao,
      totalPecas:        totalProducao,
      gmroi:             +w(c => c.gmroi).toFixed(2),
    };
  }, [channelData, visibleChannels]);

  // ── Macro impact ──────────────────────────────────────────────────────────────
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
      custoMedio:    consolidated.custoMedio,
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

  const totalPercent  = visibleChannels.reduce((s, ch) => s + percents[ch], 0);
  const macroOk       = impactedMacro.length === 0 && visibleTotalPct === 100;
  const hasMacroCheck = activeMacroKeys.length > 0 && macroValues != null;
  const isPending     = plannedYears.includes(selectedYear) && !reviewedYears.includes(selectedYear);

  // ── KPI fields — exact list per spec ─────────────────────────────────────────
  const kpiFields: Array<{ label: string; key: keyof ChannelData; format: string; isDriver: boolean }> = [
    { label: "Receita Bruta (R$)",   key: "receita",       format: "currency",   isDriver: false },
    { label: "Margem Bruta (R$)",    key: "margemBrutaRS", format: "currency",   isDriver: false },
    { label: "Margem Bruta (%)",     key: "margemBruta",   format: "percent",    isDriver: true  },
    { label: "PMV (R$)",             key: "pmv",           format: "currency",   isDriver: true  },
    { label: "Ticket Médio (R$)",    key: "ticketMedio",   format: "currency",   isDriver: true  },
    { label: "Giro",                 key: "giro",          format: "multiplier", isDriver: true  },
    { label: "Cobertura (dias)",     key: "cobertura",     format: "days",       isDriver: true  },
    { label: "OTB (custo) (R$)",     key: "otb",           format: "currency",   isDriver: false },
    { label: "Produção (peças)",     key: "producao",      format: "number",     isDriver: false },
    { label: "MKD (%)",              key: "mkdPct",        format: "percent",    isDriver: true  },
    { label: "MKD (R$)",             key: "markdown",      format: "currency",   isDriver: false },
    { label: "Total Peças",          key: "totalPecas",    format: "number",     isDriver: false },
    { label: "GMROI",                key: "gmroi",         format: "multiplier", isDriver: true  },
    { label: "Custo Médio (R$)",     key: "custoMedio",    format: "currency",   isDriver: true  },
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
    return `${((item.gap / Math.abs(item.planned)) * 100) > 0 ? "+" : ""}${((item.gap / Math.abs(item.planned)) * 100).toFixed(1)}%`;
  };

  const fmtMacroVal = (val: number, key: string) => {
    if (["margemBruta", "mkdPct"].includes(key)) return `${val.toFixed(1)}%`;
    if (["giro", "gmroi"].includes(key))         return val.toFixed(2);
    if (key === "cobertura")                     return `${Math.round(val)} dias`;
    if (key === "producaoPecas")                 return `${Math.round(val).toLocaleString("pt-BR")} pç`;
    return `R$ ${Math.round(val).toLocaleString("pt-BR")}`;
  };

  const consolidatedKpi = (key: keyof ChannelData): number => ({
    receita: consolidated.receita,           margemBrutaRS: consolidated.margemBrutaRS,
    margemBruta: consolidated.margemBruta,   pmv: consolidated.pmv,
    ticketMedio: consolidated.ticketMedio,   custoMedio: consolidated.custoMedio,
    giro: consolidated.giro,                 cobertura: consolidated.cobertura,
    otb: consolidated.otb,                   estoqueMedioRS: consolidated.estoqueMedioRS,
    estoqueMedioPecas: consolidated.estoqueMedioPecas,
    mkdPct: consolidated.mkdPct,             markdown: consolidated.markdown,
    producao: consolidated.producao,         totalPecas: consolidated.totalPecas,
    gmroi: consolidated.gmroi,
  } as Record<keyof ChannelData, number>)[key] ?? 0;

  // Maps channel KPI key → macro plan key for impact highlighting
  const CHANNEL_TO_MACRO: Partial<Record<keyof ChannelData, string>> = {
    otb:          "otbCompra",
    producao:     "producaoPecas",
    totalPecas:   "producaoPecas",
    margemBrutaRS:"margemBruta",
  };
  const isKpiImpacted = (key: keyof ChannelData) => {
    const mk = CHANNEL_TO_MACRO[key] ?? (key as string);
    return impactedMacro.some(i => i.key === mk);
  };

  const gridStyle = { gridTemplateColumns: `160px repeat(${visibleChannels.length + 1}, 1fr)` };

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

      {/* ── TOAST ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-[#28071C] text-white px-5 py-3 rounded-xl shadow-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />{toast}
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
            {isPending && (
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

        {/* ── Orientation message + year selector (PARTE A + B) ────────────── */}
        <div className="bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3 mb-3">
            <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#28071C]/70 leading-relaxed">
              <strong className="text-[#28071C]/80">Simule a distribuição de receita pelos canais de venda e compare os cenários.</strong>
              {" "}Ajuste participação e drivers por canal, salve versões alternativas e aplique as metas quando estiver seguro.
            </p>
          </div>

          {/* Year / cycle selector — immediately below the orientation text */}
          <div className="flex items-center gap-3 pl-7">
            <label className="text-xs text-[#28071C]/50 font-semibold uppercase tracking-widest whitespace-nowrap">
              Ciclo de Planejamento:
            </label>
            {plannedYears.length > 0 ? (
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-white border-2 border-[#7598CF]/30 text-[#28071C] font-semibold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#7598CF] cursor-pointer"
              >
                {plannedYears.map(y => (
                  <option key={y} value={y}>
                    {y}{!reviewedYears.includes(y) ? " — revisão pendente" : " ✓"}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold text-[#28071C]/60">
                {selectedYear} — nenhum plano macro encontrado
              </span>
            )}
            {macroValues && (
              <span className="text-xs text-[#7598CF] bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-full px-3 py-1 font-medium">
                Meta macro: R$ {macroReceita.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>

        {/* ── Aviso: sem plano macro ──────────────────────────────────────────── */}
        {!macroValues && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Nenhum cenário salvo no Módulo 1 para <strong>{selectedYear}</strong>.
              A sinalização de impacto ficará disponível após salvar um cenário no Módulo 1.
            </p>
          </div>
        )}

        {/* ── SEÇÃO 1: Distribuição por Canal ──────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#7598CF]">
          <div className="px-5 py-3 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Distribuição por Canal</h2>
            <p className="text-[#28071C]/40 text-xs mt-0.5">
              Participação na Receita Total de R$ {macroReceita.toLocaleString("pt-BR")} · ajuste recalcula tudo automaticamente
            </p>
          </div>

          <div className="px-5 py-4">
            {/* Compact participation cards */}
            <div className="grid gap-4 mb-3" style={{ gridTemplateColumns: `repeat(${visibleChannels.length}, 1fr)` }}>
              {visibleChannels.map(ch => (
                <div key={ch} className="bg-white rounded-xl px-4 py-3 shadow-sm border border-[#7598CF]/20">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[#28071C]/55 text-xs font-semibold uppercase tracking-widest">{CHANNEL_LABELS[ch]}</span>
                    <span className="text-[10px] text-[#28071C]/35 font-mono">
                      R$ {Math.round(macroReceita * percents[ch] / 100).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={100} value={percents[ch]}
                      onChange={e => handlePercentChange(ch, Number(e.target.value))}
                      className="flex-1 text-center text-[#28071C] text-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 rounded-lg px-2 py-1.5 border-2 border-[#7598CF]/15 bg-[#7598CF]/4"
                    />
                    <span className="text-[#28071C]/50 font-bold text-lg">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              {totalPercent === 100
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700 text-xs font-semibold">Total: 100% ✓</span></>
                : <><X className="w-3.5 h-3.5 text-red-500" /><span className="text-red-600 text-xs">Total: {totalPercent}% — deve somar 100%</span></>
              }
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 2: Impact banner (PARTE D) ─────────────────────────────── */}
        {hasMacroCheck && totalPercent === 100 && (
          <div className={`rounded-2xl p-5 border-2 ${macroOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-300"}`}>
            {macroOk ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-emerald-800 font-semibold text-sm">Plano macro em dia</p>
                  <p className="text-emerald-700/70 text-xs mt-0.5">Todos os indicadores selecionados estão dentro da meta com a distribuição atual.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 font-semibold text-sm">A distribuição por canal impactou a entrega do plano macro.</p>
                    <p className="text-red-700/70 text-xs mt-0.5">
                      Ajuste os drivers por canal (MKD%, margem, ticket médio, PMV) para recuperar as metas.
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
                        <span className={`font-bold px-1.5 py-0.5 rounded text-xs ${item.gap < 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
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

        {/* ── SEÇÃO 3: Simulador de Canais ─────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#F6F3AA]">
          <div className="px-5 py-3 border-b border-[#28071C]/8 flex items-start justify-between">
            <div>
              <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Indicadores por Canal</h2>
              <p className="text-[#28071C]/40 text-xs mt-0.5">
                <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#7598CF]/60 inline-block" />borda azul</span>
                {" "}= driver editável — altera o valor e recalcula os demais automaticamente.
                {" "}Campos calculados são atualizados em tempo real.
              </p>
            </div>
          </div>

          <div className="p-5 overflow-x-auto">
            <div className="grid gap-2 min-w-[560px]" style={gridStyle}>

              {/* Header row */}
              <div className="flex items-center px-3 bg-[#28071C]/5 rounded-lg h-10">
                <span className="text-[#28071C]/50 text-[10px] uppercase tracking-widest font-semibold">Indicador</span>
              </div>
              {visibleChannels.map(ch => (
                <div key={ch} className="flex items-center justify-center bg-[#7598CF] rounded-lg h-10">
                  <span className="text-white text-xs font-semibold uppercase tracking-wide">{CHANNEL_LABELS[ch]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center bg-[#28071C] rounded-lg h-10">
                <span className="text-white text-[10px] font-semibold uppercase tracking-widest">Consolidado</span>
              </div>

              {/* KPI rows */}
              {kpiFields.map(field => (
                <>
                  {/* Label */}
                  <div key={`lbl-${field.key}`} className="flex items-center gap-1.5 px-3 bg-white/50 rounded-lg h-11">
                    {field.isDriver && <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF]/60 flex-shrink-0" />}
                    <span className="text-[#28071C]/60 text-xs leading-tight">{field.label}</span>
                  </div>

                  {/* Channel cells */}
                  {visibleChannels.map(ch => (
                    <div key={`${ch}-${field.key}`}
                      className={`flex items-center px-2.5 rounded-lg h-11 border ${
                        field.isDriver
                          ? "bg-white border-[#7598CF]/40 ring-1 ring-[#7598CF]/10"
                          : "bg-[#28071C]/3 border-[#28071C]/8"
                      } ${isKpiImpacted(field.key) && !field.isDriver ? "border-red-200 bg-red-50/40" : ""}`}
                    >
                      {field.isDriver ? (
                        <input type="text"
                          value={fmt(channelData[ch][field.key], field.format)}
                          onChange={e => handleDriverChange(ch, field.key, e.target.value)}
                          className="w-full bg-transparent text-[#28071C] text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#7598CF]/40 rounded px-0.5"
                        />
                      ) : (
                        <span className="text-[#28071C]/55 text-xs font-mono">{fmt(channelData[ch][field.key], field.format)}</span>
                      )}
                    </div>
                  ))}

                  {/* Consolidated cell */}
                  <div key={`cons-${field.key}`}
                    className={`flex items-center px-2.5 rounded-lg h-11 border ${
                      hasMacroCheck && isKpiImpacted(field.key) ? "bg-red-50 border-red-200" : "bg-[#28071C]/4 border-[#28071C]/10"
                    }`}
                  >
                    <span className="text-[#28071C] text-xs font-semibold font-mono">{fmt(consolidatedKpi(field.key), field.format)}</span>
                  </div>
                </>
              ))}
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 4: Cenários salvos ──────────────────────────────────────── */}
        {savedScenarios.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[#28071C]/8">
              <h3 className="text-[#28071C] font-semibold text-sm">Cenários Salvos — {selectedYear}</h3>
            </div>
            <div className="px-5 py-4 flex flex-wrap gap-2">
              {savedScenarios.map(sc => (
                <div key={sc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border-2 bg-white border-[#28071C]/10 text-[#28071C]/65">
                  <Check className="w-3 h-3 text-[#7598CF]" />
                  <span className="font-medium">{sc.name}</span>
                  <span className="text-[10px] text-[#28071C]/30">{new Date(sc.savedAt).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SEÇÃO 5: Barra de ações ────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button onClick={() => { setSaveNameInput(""); setShowSaveDialog(true); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-sm">
                <Save className="w-4 h-4" />Salvar cenário
              </button>
              <button onClick={() => { setSelectedForCompare([]); setShowCompareModal(true); }}
                disabled={savedScenarios.length < 2}
                title={savedScenarios.length < 2 ? "Salve ao menos 2 cenários para comparar" : ""}
                className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl font-semibold text-sm hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed transition-all">
                <GitCompare className="w-4 h-4" />Comparar
                {savedScenarios.length >= 2 && <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{savedScenarios.length}</span>}
              </button>
              <button onClick={handleExport} disabled={savedScenarios.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed transition-all">
                <Download className="w-4 h-4" />Exportar
              </button>
            </div>
            <button onClick={handleApplyMetas}
              disabled={totalPercent !== 100 || !macroOk}
              title={totalPercent !== 100 ? "Participação deve somar 100%" : !macroOk ? "Indicadores macro fora da meta" : "Aplicar metas e concluir revisão"}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                totalPercent === 100 && macroOk ? "bg-emerald-600 text-white hover:opacity-90" : "bg-[#28071C]/15 text-[#28071C]/35 cursor-not-allowed"
              }`}>
              <Lock className="w-4 h-4" />Aplicar Metas
            </button>
          </div>
          <p className="text-[9px] text-[#28071C]/25 mt-2">
            Cenários não alteram dados oficiais até "Aplicar Metas" ser acionado. Metas aplicadas marcam o ciclo como revisado por canal.
          </p>
        </div>
      </main>

      {/* ── SAVE DIALOG ────────────────────────────────────────────────────── */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 w-[420px] mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-base">Nomear Cenário</h3>
              <button onClick={() => setShowSaveDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]"><X className="w-5 h-5" /></button>
            </div>
            <input type="text" autoFocus value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirmSave()}
              placeholder={`Ex: Mix Atacado 45% — ${selectedYear}`}
              className="w-full px-4 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm text-[#28071C] placeholder-[#28071C]/30 focus:border-[#7598CF] focus:outline-none mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm font-semibold text-[#28071C]/60 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleConfirmSave}
                className="flex-1 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90">Salvar cenário</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARE MODAL ──────────────────────────────────────────────────── */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
            <h3 className="text-[#28071C] font-bold text-base mb-1">Comparar Cenários</h3>
            <p className="text-[#28071C]/50 text-sm mb-5">Selecione ao menos 2 cenários.</p>
            <div className="space-y-2 mb-6 max-h-52 overflow-y-auto">
              {savedScenarios.map(sc => {
                const isSel = selectedForCompare.includes(sc.id);
                return (
                  <label key={sc.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 transition-colors ${isSel ? "border-[#7598CF] bg-[#7598CF]/6" : "border-transparent hover:bg-gray-50"}`}>
                    <input type="checkbox" className="w-4 h-4 accent-[#7598CF]" checked={isSel}
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
            <div className="flex gap-3">
              <button onClick={() => { setShowCompareModal(false); setSelectedForCompare([]); }}
                className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/20 rounded-xl text-sm font-semibold text-[#28071C] hover:bg-gray-50">Cancelar</button>
              <button onClick={handleCompare} disabled={selectedForCompare.length < 2}
                className="flex-1 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:opacity-90">
                Comparar ({selectedForCompare.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
