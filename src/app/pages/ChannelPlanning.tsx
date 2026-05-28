import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare, Download, Lock,
  Check, X, AlertTriangle, CheckCircle2, Info, Clock,
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
  receita: number;           // computed: macroReceita × pct/100
  margemBrutaRS: number;     // computed: receita × margemBruta/100
  margemBruta: number;       // % — driver
  pmv: number;               // R$ — driver
  ticketMedio: number;       // R$ — driver
  custoMedio: number;        // R$ — driver
  giro: number;              // — driver
  cobertura: number;         // days — driver
  otb: number;               // computed: producao × custoMedio
  estoqueMedioRS: number;    // computed: receita / giro
  estoqueMedioPecas: number; // computed
  mkdPct: number;            // % — driver
  markdown: number;          // computed: receita × mkdPct/100
  producao: number;          // computed: receita / pmv
  totalPecas: number;        // computed: = producao
  gmroi: number;             // — driver
}

type ChannelId = "atacado" | "varejo" | "ecommerce";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_SALES_IDS: Record<ChannelId, SalesChannelId[]> = {
  atacado:   ["atacado"],
  varejo:    ["varejo_fisico", "franquia", "popup"],
  ecommerce: ["ecommerce_proprio", "marketplace", "social_commerce"],
};

const CHANNEL_LABELS: Record<ChannelId, string> = {
  atacado: "Atacado", varejo: "Varejo", ecommerce: "E-commerce",
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

const RATE_MACRO_FIELDS = new Set(["margemBruta", "mkdPct", "giro", "cobertura", "gmroi"]);

const DRIVER_FIELDS = new Set<keyof ChannelData>([
  "margemBruta", "pmv", "ticketMedio", "custoMedio", "giro", "cobertura", "mkdPct", "gmroi",
]);

// AJUSTE 4: macro key → corresponding channel ChannelData key (for ordering + impact)
const MACRO_TO_CHANNEL: Partial<Record<string, keyof ChannelData>> = {
  receitaBruta:  "receita",
  margemBruta:   "margemBruta",
  pmv:           "pmv",
  ticketMedio:   "ticketMedio",
  producaoPecas: "producao",
  otbCompra:     "otb",
  mkdPct:        "mkdPct",
  giro:          "giro",
  cobertura:     "cobertura",
  gmroi:         "gmroi",
  custoMedio:    "custoMedio",
};

// AJUSTE 2: for driver fields, is a HIGHER value better for the macro goal?
const HIGHER_IS_BETTER: Partial<Record<keyof ChannelData, boolean>> = {
  margemBruta: true, giro: true, gmroi: true, ticketMedio: true, pmv: true,
  cobertura:   false, // lower is safer (less stock risk)
  mkdPct:      false, // lower is better (less discount)
  custoMedio:  false, // lower is better
};

// AJUSTE 5: tooltip for computed (non-driver) fields explaining the relationship
const COMPUTED_TOOLTIP: Partial<Record<keyof ChannelData, string>> = {
  margemBrutaRS:     "Calculado: Receita × Margem Bruta %. Para alterar, edite a Margem Bruta (%).",
  otb:               "Calculado: Peças × Custo Médio. Para alterar, edite o Custo Médio.",
  estoqueMedioRS:    "Calculado: Receita ÷ Giro. Para alterar, edite o Giro.",
  estoqueMedioPecas: "Calculado: Estoque Médio (R$) ÷ PMV.",
  producao:          "Calculado: Receita ÷ PMV. Para alterar o volume, ajuste o PMV ou a participação.",
  totalPecas:        "Total de peças = Produção do canal (Receita ÷ PMV).",
  markdown:          "Calculado: Receita × MKD%. Para alterar o valor em R$, edite o MKD%.",
  receita:           "Controlado pela participação (%) × Receita Total do plano macro.",
};

// ─── Pure functions ────────────────────────────────────────────────────────────

function applyRevenue(data: ChannelData, newReceita: number): ChannelData {
  const otbRate        = data.receita > 0 ? data.otb / data.receita : (data.custoMedio > 0 && data.pmv > 0 ? data.custoMedio / data.pmv : 0.365);
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

  const profile      = getStoredProfile();
  const plannedYears = getPlannedYears();
  const defaultYear  = plannedYears.length > 0 ? Math.max(...plannedYears) : new Date().getFullYear() + 1;
  const [selectedYear, setSelectedYear]   = useState<number>(defaultYear);
  const [reviewedYears, setReviewedYears] = useState<number[]>(() => getChannelReviewedYears());

  const planCycle    = getPlanCycle(selectedYear);
  const macroValues: Record<string, unknown> | null = planCycle?.versions?.[0]?.values ?? null;
  const macroReceita: number = (macroValues?.receitaBruta as number | null) ?? 3_120_000;

  const activeMacroKeys = useMemo(() => {
    if (!planCycle?.fieldPriorities) return [];
    return planCycle.fieldPriorities
      .filter(fp => fp.status !== "inactive" && fp.status !== "dismissed")
      .map(fp => fp.key);
  }, [planCycle]);

  const visibleChannels = useMemo((): ChannelId[] => {
    const all: ChannelId[] = ["atacado", "varejo", "ecommerce"];
    if (!profile?.salesChannels?.length) return all;
    return all.filter(ch => CHANNEL_SALES_IDS[ch].some(id => profile!.salesChannels.includes(id)));
  }, [profile]);

  const [percents, setPercents]       = useState<Record<ChannelId, number>>(INIT_PERCENTS);
  const [channelData, setChannelData] = useState<Record<ChannelId, ChannelData>>(() => initChannelData(macroReceita));

  useEffect(() => {
    const plan      = getPlanCycle(selectedYear);
    const newMacroR = (plan?.versions?.[0]?.values?.receitaBruta as number | null) ?? 3_120_000;
    setChannelData(initChannelData(newMacroR));
    setPercents(INIT_PERCENTS);
    setSavedScenarios(listChannelScenarios(selectedYear));
  }, [selectedYear]);

  // Scenarios
  const [savedScenarios, setSavedScenarios]         = useState<ChannelScenario[]>(() => listChannelScenarios(selectedYear));
  const [showSaveDialog, setShowSaveDialog]         = useState(false);
  const [saveNameInput, setSaveNameInput]           = useState("");
  const [toast, setToast]                           = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal]     = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Handlers
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
    const sc = saveChannelScenario(selectedYear, saveNameInput,
      { percents, channelData: channelData as unknown as Record<string, Record<string, number>> });
    setSavedScenarios(listChannelScenarios(selectedYear));
    setShowSaveDialog(false); setSaveNameInput("");
    showToast(`Cenário "${sc.name}" salvo.`);
  };

  const handleExport = () => {
    if (!savedScenarios.length) { showToast("Salve ao menos um cenário antes de exportar."); return; }
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
      const totalR = visibleChannels.reduce((s, ch) => s + ((sc.data.channelData[ch] as { receita?: number })?.receita ?? 0), 0);
      const wM = visibleChannels.reduce((s, ch) => s + ((sc.data.channelData[ch] as { receita?: number; margemBruta?: number })?.receita ?? 0) * ((sc.data.channelData[ch] as { margemBruta?: number })?.margemBruta ?? 0), 0);
      return { name: sc.name, receita: totalR, margem: totalR > 0 ? wM / totalR : 0 };
    });
    alert(`Comparação:\n\n${summary.map(s => `${s.name}\nReceita: R$ ${Math.round(s.receita).toLocaleString("pt-BR")} | Margem: ${s.margem.toFixed(1)}%`).join("\n\n")}`);
    setShowCompareModal(false); setSelectedForCompare([]);
  };

  // ── Consolidated ──────────────────────────────────────────────────────────────
  const consolidated = useMemo(() => {
    const chs = visibleChannels.map(ch => channelData[ch]);
    const totalR = chs.reduce((s, c) => s + c.receita, 0);
    const w = (fn: (c: ChannelData) => number) => totalR > 0 ? chs.reduce((s, c) => s + c.receita * fn(c), 0) / totalR : 0;
    const totalMkd = chs.reduce((s, c) => s + c.markdown, 0);
    const totalProd = chs.reduce((s, c) => s + c.producao, 0);
    return {
      receita:           totalR,
      margemBrutaRS:     Math.round(totalR * w(c => c.margemBruta) / 100),
      margemBruta:       +w(c => c.margemBruta).toFixed(1),
      pmv:               +w(c => c.pmv).toFixed(0),
      ticketMedio:       +w(c => c.ticketMedio).toFixed(0),
      custoMedio:        +w(c => c.custoMedio).toFixed(0),
      giro:              +w(c => c.giro).toFixed(2),
      cobertura:         +w(c => c.cobertura).toFixed(0),
      otb:               chs.reduce((s, c) => s + c.otb, 0),
      estoqueMedioRS:    chs.reduce((s, c) => s + c.estoqueMedioRS, 0),
      estoqueMedioPecas: chs.reduce((s, c) => s + c.estoqueMedioPecas, 0),
      mkdPct:            +(totalR > 0 ? (totalMkd / totalR) * 100 : 0).toFixed(1),
      markdown:          totalMkd,
      producao:          totalProd,
      totalPecas:        totalProd,
      gmroi:             +w(c => c.gmroi).toFixed(2),
    };
  }, [channelData, visibleChannels]);

  // ── Macro impact (AJUSTE 1/2/6) ───────────────────────────────────────────────
  const visibleTotalPct = visibleChannels.reduce((s, ch) => s + percents[ch], 0);

  const impactedMacro = useMemo(() => {
    if (!macroValues || visibleTotalPct !== 100 || !activeMacroKeys.length) return [];
    const projected: Record<string, number> = {
      receitaBruta: consolidated.receita, margemBruta: consolidated.margemBruta,
      pmv: consolidated.pmv, ticketMedio: consolidated.ticketMedio,
      producaoPecas: consolidated.producao, otbCompra: consolidated.otb,
      mkdPct: consolidated.mkdPct, giro: consolidated.giro,
      cobertura: consolidated.cobertura, gmroi: consolidated.gmroi,
      custoMedio: consolidated.custoMedio,
    };
    return activeMacroKeys.filter(key => {
      const planned = macroValues[key] as number | null;
      const proj    = projected[key];
      if (planned == null || proj == null) return false;
      return Math.abs((proj - planned) / Math.abs(planned)) * 100 > (RATE_MACRO_FIELDS.has(key) ? 0.5 : 2.0);
    }).map(key => ({
      key, label: MACRO_FIELD_LABELS[key] ?? key,
      planned: macroValues[key] as number,
      projected: projected[key],
      gap: projected[key] - (macroValues[key] as number),
      isRate: RATE_MACRO_FIELDS.has(key),
    }));
  }, [activeMacroKeys, macroValues, consolidated, visibleTotalPct]);

  // AJUSTE 2: per-channel impact — is this channel's value for this field pulling the avg the wrong way?
  const isChannelDragging = (ch: ChannelId, fieldKey: keyof ChannelData): boolean => {
    const macroKey = Object.entries(MACRO_TO_CHANNEL).find(([, ck]) => ck === fieldKey)?.[0];
    if (!macroKey) return false;
    const item = impactedMacro.find(i => i.key === macroKey);
    if (!item) return false;
    const chVal = channelData[ch][fieldKey] as number;
    const higherBetter = HIGHER_IS_BETTER[fieldKey];
    if (higherBetter === undefined) return false;
    return higherBetter ? chVal < item.planned : chVal > item.planned;
  };

  // ── KPI field definitions — must be before early return (hooks rule) ──────────
  const kpiFieldsBase: Array<{
    label: string; key: keyof ChannelData; format: string;
    isDriver: boolean; macroKey?: string;
  }> = [
    { label: "Receita Bruta (R$)",   key: "receita",       format: "currency",   isDriver: false, macroKey: "receitaBruta"  },
    { label: "Margem Bruta (R$)",    key: "margemBrutaRS", format: "currency",   isDriver: false, macroKey: "margemBruta"   },
    { label: "Margem Bruta (%)",     key: "margemBruta",   format: "percent",    isDriver: true,  macroKey: "margemBruta"   },
    { label: "PMV (R$)",             key: "pmv",           format: "currency",   isDriver: true,  macroKey: "pmv"           },
    { label: "Ticket Médio (R$)",    key: "ticketMedio",   format: "currency",   isDriver: true,  macroKey: "ticketMedio"   },
    { label: "Giro",                 key: "giro",          format: "multiplier", isDriver: true,  macroKey: "giro"          },
    { label: "Cobertura (dias)",     key: "cobertura",     format: "days",       isDriver: true,  macroKey: "cobertura"     },
    { label: "OTB (custo) (R$)",     key: "otb",           format: "currency",   isDriver: false, macroKey: "otbCompra"     },
    { label: "Produção (peças)",     key: "producao",      format: "number",     isDriver: false, macroKey: "producaoPecas" },
    { label: "MKD (%)",              key: "mkdPct",        format: "percent",    isDriver: true,  macroKey: "mkdPct"        },
    { label: "MKD (R$)",             key: "markdown",      format: "currency",   isDriver: false                           },
    { label: "Total Peças",          key: "totalPecas",    format: "number",     isDriver: false                           },
    { label: "GMROI",                key: "gmroi",         format: "multiplier", isDriver: true,  macroKey: "gmroi"         },
    { label: "Custo Médio (R$)",     key: "custoMedio",    format: "currency",   isDriver: true,  macroKey: "custoMedio"    },
  ];

  // AJUSTE 4: Sort — macro focus indicators first (in activeMacroKeys order), then secondary
  const macroKeyOrder = new Map<string, number>(activeMacroKeys.map((k, i) => [k, i]));

  // useMemo MUST be before `if (!user) return null` — React rules of hooks
  const kpiFields = useMemo(() => {
    return [...kpiFieldsBase].sort((a, b) => {
      const ra = a.macroKey != null && macroKeyOrder.has(a.macroKey) ? macroKeyOrder.get(a.macroKey)! * 2 : 999;
      const rb = b.macroKey != null && macroKeyOrder.has(b.macroKey) ? macroKeyOrder.get(b.macroKey)! * 2 : 999;
      const ra2 = a.key === "margemBrutaRS" && macroKeyOrder.has("margemBruta") ? macroKeyOrder.get("margemBruta")! * 2 + 1 : ra;
      const rb2 = b.key === "margemBrutaRS" && macroKeyOrder.has("margemBruta") ? macroKeyOrder.get("margemBruta")! * 2 + 1 : rb;
      return ra2 - rb2;
    });
  }, [activeMacroKeys]);

  if (!user) return null;

  const totalPercent  = visibleChannels.reduce((s, ch) => s + percents[ch], 0);
  const macroOk       = impactedMacro.length === 0 && visibleTotalPct === 100;
  const hasMacroCheck = activeMacroKeys.length > 0 && macroValues != null;
  const isPending     = plannedYears.includes(selectedYear) && !reviewedYears.includes(selectedYear);

  const fmt = (value: number, format: string) => {
    switch (format) {
      case "currency":   return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
      case "percent":    return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      case "days":       return `${Math.round(value)} dias`;
      case "multiplier": return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      default:           return Math.round(value).toLocaleString("pt-BR");
    }
  };

  const consolidatedKpi = (key: keyof ChannelData): number =>
    ({ receita: consolidated.receita, margemBrutaRS: consolidated.margemBrutaRS,
       margemBruta: consolidated.margemBruta, pmv: consolidated.pmv,
       ticketMedio: consolidated.ticketMedio, custoMedio: consolidated.custoMedio,
       giro: consolidated.giro, cobertura: consolidated.cobertura,
       otb: consolidated.otb, estoqueMedioRS: consolidated.estoqueMedioRS,
       estoqueMedioPecas: consolidated.estoqueMedioPecas, mkdPct: consolidated.mkdPct,
       markdown: consolidated.markdown, producao: consolidated.producao,
       totalPecas: consolidated.totalPecas, gmroi: consolidated.gmroi,
    } as Record<keyof ChannelData, number>)[key] ?? 0;

  // Is this consolidated field off-target?
  const CHANNEL_TO_MACRO: Partial<Record<keyof ChannelData, string>> = {
    otb: "otbCompra", producao: "producaoPecas", totalPecas: "producaoPecas", margemBrutaRS: "margemBruta",
  };
  const isConsolidatedImpacted = (key: keyof ChannelData) => {
    const mk = CHANNEL_TO_MACRO[key] ?? (key as string);
    return impactedMacro.some(i => i.key === mk);
  };

  const gridStyle = { gridTemplateColumns: `155px repeat(${visibleChannels.length + 1}, 1fr)` };

  // AJUSTE 5: conflict tooltip for non-driver fields
  const getFieldTooltip = (key: keyof ChannelData, isDriver: boolean): string | undefined => {
    if (!isDriver) return COMPUTED_TOOLTIP[key];
    return undefined;
  };

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

      {/* ── TOAST ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-[#28071C] text-white px-5 py-3 rounded-xl shadow-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />{toast}
        </div>
      )}

      {/* ── HEADER (sticky) ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
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

      <main className="max-w-[1600px] mx-auto px-6 py-5">

        {/* ── Orientation + year selector ───────────────────────────────────── */}
        <div className="bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-2xl px-5 py-4 mb-4">
          <div className="flex items-start gap-3 mb-3">
            <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#28071C]/70 leading-relaxed">
              <strong className="text-[#28071C]/80">Simule a distribuição de receita pelos canais de venda e compare os cenários.</strong>
              {" "}Ajuste participação e drivers por canal, salve versões alternativas e aplique as metas quando estiver seguro.
            </p>
          </div>
          <div className="flex items-center gap-3 pl-7 flex-wrap">
            <label className="text-xs text-[#28071C]/50 font-semibold uppercase tracking-widest whitespace-nowrap">Ciclo:</label>
            {plannedYears.length > 0 ? (
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-white border-2 border-[#7598CF]/30 text-[#28071C] font-semibold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#7598CF] cursor-pointer">
                {plannedYears.map(y => (
                  <option key={y} value={y}>{y}{!reviewedYears.includes(y) ? " — revisão pendente" : " ✓"}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold text-[#28071C]/60">{selectedYear} — nenhum plano macro encontrado</span>
            )}
            {macroValues && (
              <span className="text-xs text-[#7598CF] bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-full px-3 py-1 font-medium">
                Meta macro: R$ {macroReceita.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>

        {/* ── STICKY: Participation + Banner (AJUSTE 3) ─────────────────────── */}
        <div className="sticky top-[72px] z-30 space-y-3 mb-5">

          {/* Participation cards */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-md border-t-4 border-[#7598CF] overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[#28071C]/8 flex items-center justify-between">
              <div>
                <span className="text-[#28071C] font-bold text-xs uppercase tracking-wide">Distribuição por Canal</span>
                <span className="text-[#28071C]/40 text-xs ml-3">Receita Total: R$ {macroReceita.toLocaleString("pt-BR")}</span>
              </div>
              {totalPercent === 100
                ? <span className="flex items-center gap-1 text-emerald-700 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />100% ✓</span>
                : <span className="flex items-center gap-1 text-red-600 text-xs"><X className="w-3.5 h-3.5" />{totalPercent}% — deve somar 100%</span>
              }
            </div>
            <div className="px-5 py-3">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${visibleChannels.length}, 1fr)` }}>
                {visibleChannels.map(ch => (
                  <div key={ch} className="bg-[#7598CF]/5 border border-[#7598CF]/20 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#28071C]/55 text-xs font-semibold uppercase tracking-widest">{CHANNEL_LABELS[ch]}</span>
                      <span className="text-[10px] text-[#28071C]/35 font-mono">R$ {Math.round(macroReceita * percents[ch] / 100).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={100} value={percents[ch]}
                        onChange={e => handlePercentChange(ch, Number(e.target.value))}
                        className="flex-1 text-center text-[#28071C] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 rounded-lg px-2 py-1 border-2 border-[#7598CF]/15 bg-white"
                      />
                      <span className="text-[#28071C]/40 font-bold">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AJUSTE 1: Compact impact banner — names only, no values */}
          {hasMacroCheck && totalPercent === 100 && (
            <div className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${macroOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-300"}`}>
              {macroOk ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-emerald-800 text-sm font-medium">
                    Todos os indicadores macro do plano estão sendo atingidos com a distribuição atual.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 text-sm font-medium">
                      A distribuição por canal impacta indicadores macro do plano.
                      Ajuste os indicadores destacados abaixo para recuperar a meta.
                    </p>
                    {/* AJUSTE 1: just names, no values */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {impactedMacro.map(item => (
                        <span key={item.key} className="text-[11px] bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-semibold">
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Aviso: sem plano macro ────────────────────────────────────────── */}
        {!macroValues && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Nenhum cenário salvo no Módulo 1 para <strong>{selectedYear}</strong>.
              A sinalização de impacto ficará disponível após salvar um cenário no Módulo 1.
            </p>
          </div>
        )}

        {/* ── Simulator grid (AJUSTE 2: per-row highlighting) ──────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#F6F3AA] mb-5">
          <div className="px-5 py-3 border-b border-[#28071C]/8 flex items-center justify-between">
            <div>
              <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Indicadores por Canal</h2>
              <p className="text-[#28071C]/40 text-xs mt-0.5">
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF] inline-block" />driver editável
                </span>
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#28071C]/20 inline-block" />calculado
                </span>
                {!macroOk && <span className="inline-flex items-center gap-1 text-red-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />canal contribuindo negativamente
                </span>}
              </p>
            </div>
            {activeMacroKeys.length > 0 && (
              <span className="text-[10px] bg-[#7598CF]/10 text-[#7598CF] border border-[#7598CF]/20 rounded-full px-2 py-0.5 font-semibold">
                Indicadores foco no topo
              </span>
            )}
          </div>

          <div className="p-4 overflow-x-auto">
            <div className="grid gap-1.5 min-w-[520px]" style={gridStyle}>

              {/* Header */}
              <div className="flex items-center px-2.5 bg-[#28071C]/5 rounded-lg h-9">
                <span className="text-[#28071C]/50 text-[10px] uppercase tracking-widest font-semibold">Indicador</span>
              </div>
              {visibleChannels.map(ch => (
                <div key={ch} className="flex items-center justify-center bg-[#7598CF] rounded-lg h-9">
                  <span className="text-white text-xs font-semibold uppercase tracking-wide">{CHANNEL_LABELS[ch]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center bg-[#28071C] rounded-lg h-9">
                <span className="text-white text-[10px] font-semibold uppercase tracking-widest">Consolidado</span>
              </div>

              {/* KPI rows — AJUSTE 4: sorted by macro priority, AJUSTE 2: highlighted */}
              {kpiFields.map((field, idx) => {
                const isMacroFocus = field.macroKey != null && macroKeyOrder.has(field.macroKey);
                const isLastFocus  = isMacroFocus && (idx === kpiFields.length - 1 || !macroKeyOrder.has(kpiFields[idx + 1]?.macroKey ?? ""));
                const fieldTooltip = getFieldTooltip(field.key, field.isDriver);
                const consImpacted = isConsolidatedImpacted(field.key);

                return (
                  <>
                    {/* Divider after last macro-focus row */}
                    {isLastFocus && (
                      <div key={`div-${field.key}`} className="col-span-full my-0.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-[#28071C]/10" />
                          <span className="text-[9px] text-[#28071C]/30 uppercase tracking-widest font-semibold whitespace-nowrap">Indicadores secundários</span>
                          <div className="flex-1 h-px bg-[#28071C]/10" />
                        </div>
                      </div>
                    )}

                    {/* Label */}
                    <div key={`lbl-${field.key}`} className={`relative flex items-center gap-1.5 px-2.5 rounded-lg h-10 ${isMacroFocus ? "bg-[#7598CF]/6" : "bg-white/50"}`}>
                      {field.isDriver
                        ? <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF] flex-shrink-0" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-[#28071C]/20 flex-shrink-0" />
                      }
                      <span className="text-[#28071C]/65 text-xs leading-tight">{field.label}</span>
                      {/* AJUSTE 5: tooltip for non-driver fields */}
                      {fieldTooltip && (
                        <span className="relative group ml-auto flex-shrink-0">
                          <Info className="w-3 h-3 text-[#28071C]/20 group-hover:text-[#7598CF] transition-colors cursor-help" />
                          <span className="absolute left-0 bottom-full mb-2 w-52 px-3 py-2 bg-[#28071C] text-white text-[10px] rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed font-normal">
                            {fieldTooltip}
                            <span className="absolute top-full left-3 border-4 border-transparent border-t-[#28071C]" />
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Channel cells */}
                    {visibleChannels.map(ch => {
                      const dragging = field.isDriver && isChannelDragging(ch, field.key);
                      return (
                        <div key={`${ch}-${field.key}`}
                          className={`flex items-center px-2.5 rounded-lg h-10 border transition-colors ${
                            dragging
                              ? "bg-red-50 border-red-300 ring-1 ring-red-200"
                              : field.isDriver
                                ? "bg-white border-[#7598CF]/35 ring-1 ring-[#7598CF]/10"
                                : "bg-[#28071C]/3 border-[#28071C]/8"
                          }`}
                        >
                          {field.isDriver ? (
                            <input type="text"
                              value={fmt(channelData[ch][field.key], field.format)}
                              onChange={e => handleDriverChange(ch, field.key, e.target.value)}
                              className={`w-full bg-transparent text-xs font-medium focus:outline-none rounded px-0.5 ${dragging ? "text-red-700" : "text-[#28071C]"}`}
                            />
                          ) : (
                            <span className="text-[#28071C]/55 text-xs font-mono">{fmt(channelData[ch][field.key], field.format)}</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Consolidated cell */}
                    <div key={`cons-${field.key}`}
                      className={`flex items-center px-2.5 rounded-lg h-10 border ${consImpacted ? "bg-red-50 border-red-200" : "bg-[#28071C]/4 border-[#28071C]/10"}`}
                    >
                      <span className={`text-xs font-semibold font-mono ${consImpacted ? "text-red-700" : "text-[#28071C]"}`}>
                        {fmt(consolidatedKpi(field.key), field.format)}
                      </span>
                    </div>
                  </>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Cenários salvos ───────────────────────────────────────────────── */}
        {savedScenarios.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-[#28071C]/8">
              <h3 className="text-[#28071C] font-semibold text-sm">Cenários Salvos — {selectedYear}</h3>
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-2">
              {savedScenarios.map(sc => (
                <div key={sc.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border-2 bg-white border-[#28071C]/10 text-[#28071C]/65">
                  <Check className="w-3 h-3 text-[#7598CF]" />
                  <span className="font-medium">{sc.name}</span>
                  <span className="text-[10px] text-[#28071C]/30">{new Date(sc.savedAt).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Barra de ações ────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button onClick={() => { setSaveNameInput(""); setShowSaveDialog(true); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl font-semibold text-sm hover:opacity-90 shadow-sm">
                <Save className="w-4 h-4" />Salvar cenário
              </button>
              <button onClick={() => { setSelectedForCompare([]); setShowCompareModal(true); }}
                disabled={savedScenarios.length < 2}
                className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl font-semibold text-sm hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed">
                <GitCompare className="w-4 h-4" />Comparar
                {savedScenarios.length >= 2 && <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{savedScenarios.length}</span>}
              </button>
              <button onClick={handleExport} disabled={!savedScenarios.length}
                className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed">
                <Download className="w-4 h-4" />Exportar
              </button>
            </div>
            <button onClick={handleApplyMetas}
              disabled={totalPercent !== 100 || !macroOk}
              title={totalPercent !== 100 ? "Participação deve somar 100%" : !macroOk ? "Indicadores macro fora da meta" : "Aplicar metas e concluir revisão"}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm ${
                totalPercent === 100 && macroOk ? "bg-emerald-600 text-white hover:opacity-90" : "bg-[#28071C]/15 text-[#28071C]/35 cursor-not-allowed"
              }`}>
              <Lock className="w-4 h-4" />Aplicar Metas
            </button>
          </div>
          <p className="text-[9px] text-[#28071C]/25 mt-2">
            Cenários não alteram dados oficiais até "Aplicar Metas" ser acionado.
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

      {/* ── COMPARE MODAL ────────────────────────────────────────────────────── */}
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
                      onChange={e => setSelectedForCompare(prev => e.target.checked ? [...prev, sc.id] : prev.filter(id => id !== sc.id))} />
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
