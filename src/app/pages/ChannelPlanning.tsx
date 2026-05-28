import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare, Download, Lock, Check, X,
  AlertTriangle, CheckCircle2, Info, TrendingDown, TrendingUp,
} from "lucide-react";
import { getStoredProfile } from "../types/onboarding";
import type { SalesChannelId } from "../types/onboarding";
import { getPlanCycle, getPlannedYears } from "../types/planCycle";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserData { name: string; email: string; profile: string }

interface ChannelData {
  receita: number;
  margemBruta: number;   // % — driver (stays constant when revenue scales)
  pmv: number;            // R$ — driver
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

// ─── Macro plan fields that can be impacted ────────────────────────────────────
const MACRO_FIELD_LABELS: Record<string, string> = {
  receitaBruta:  "Receita Bruta (R$)",
  margemBruta:   "Margem Bruta (%)",
  pmv:           "PMV (R$)",
  producaoPecas: "Produção / Peças",
  otbCompra:     "OTB de Compra (R$)",
  mkdPct:        "Markdown (%)",
  giro:          "Giro de Estoque",
  cobertura:     "Cobertura (dias)",
  gmroi:         "GMROI",
};

// Rate-based macro fields (tolerance in percentage points, not %)
const RATE_MACRO_FIELDS = new Set(["margemBruta", "mkdPct", "giro", "cobertura", "gmroi"]);

// Rate-based channel driver fields (constant when revenue scales)
const DRIVER_FIELDS = new Set<keyof ChannelData>(["margemBruta", "pmv", "giro", "cobertura", "gmroi"]);

// ─── Recompute derived channel fields when revenue changes ────────────────────
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

// Build initial channel data from macro revenue + baseline rates
function buildChannel(receita: number, rates: Pick<ChannelData, "margemBruta" | "pmv" | "giro" | "cobertura" | "gmroi">): ChannelData {
  const otbRate = 0.365;
  const mkdRate = 0.04;
  const estoqueMedioRS = rates.giro > 0 ? Math.round(receita / rates.giro) : 0;
  return {
    receita,
    ...rates,
    otb: Math.round(receita * otbRate),
    estoqueMedioRS,
    estoqueMedioPecas: rates.pmv > 0 ? Math.round(estoqueMedioRS / rates.pmv) : 0,
    producao: rates.pmv > 0 ? Math.round(receita / rates.pmv) : 0,
    markdown: Math.round(receita * mkdRate),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChannelPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // ── Read onboarding profile ──────────────────────────────────────────────
  const profile = getStoredProfile();

  // ── Read macro plan (Module 1) ───────────────────────────────────────────
  const plannedYears = getPlannedYears();
  const latestYear = plannedYears.length > 0 ? Math.max(...plannedYears) : new Date().getFullYear() + 1;
  const planCycle = getPlanCycle(latestYear);
  const macroValues = planCycle?.versions?.[0]?.values ?? null;
  const macroReceita: number = (macroValues?.receitaBruta as number | null) ?? 3_120_000;

  // Indicators selected in Module 1 (active plan field priorities)
  const activeMacroKeys = useMemo(() => {
    if (!planCycle?.fieldPriorities) return [];
    return planCycle.fieldPriorities
      .filter(fp => fp.status !== "inactive" && fp.status !== "dismissed")
      .map(fp => fp.key);
  }, [planCycle]);

  // ── Channels visible for this client (from onboarding) ───────────────────
  const visibleChannels = useMemo((): ChannelId[] => {
    const all: ChannelId[] = ["atacado", "varejo", "ecommerce"];
    if (!profile?.salesChannels || profile.salesChannels.length === 0) return all;
    return all.filter(ch =>
      CHANNEL_SALES_IDS[ch].some(id => profile!.salesChannels.includes(id))
    );
  }, [profile]);

  // ── Participation % per channel ──────────────────────────────────────────
  const [percents, setPercents] = useState<Record<ChannelId, number>>({
    atacado: 40,
    varejo: 35,
    ecommerce: 25,
  });

  // ── Channel KPI data (drivers + derived) ─────────────────────────────────
  const [channelData, setChannelData] = useState<Record<ChannelId, ChannelData>>(() => ({
    atacado:   buildChannel(Math.round(macroReceita * 0.40), { margemBruta: 38.5, pmv: 165, giro: 4.5, cobertura: 80, gmroi: 1.85 }),
    varejo:    buildChannel(Math.round(macroReceita * 0.35), { margemBruta: 48.0, pmv: 185, giro: 4.6, cobertura: 75, gmroi: 2.35 }),
    ecommerce: buildChannel(Math.round(macroReceita * 0.25), { margemBruta: 52.0, pmv: 195, giro: 4.8, cobertura: 70, gmroi: 2.65 }),
  }));

  // ── Handlers ─────────────────────────────────────────────────────────────

  // When % changes: update participation and recompute channel revenue + derived fields
  const handlePercentChange = (ch: ChannelId, newPct: number) => {
    setPercents(prev => ({ ...prev, [ch]: newPct }));
    const newReceita = Math.round(macroReceita * newPct / 100);
    setChannelData(prev => ({ ...prev, [ch]: applyRevenue(prev[ch], newReceita) }));
  };

  // When a driver field changes: update driver and recompute derived fields
  const handleDriverChange = (ch: ChannelId, field: keyof ChannelData, raw: string) => {
    const value = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    if (isNaN(value)) return;
    setChannelData(prev => {
      const updated: ChannelData = { ...prev[ch], [field]: value };
      // If it's a driver (rate), recompute derived absolutes from the new rate
      if (DRIVER_FIELDS.has(field)) {
        return { ...prev, [ch]: applyRevenue(updated, updated.receita) };
      }
      return { ...prev, [ch]: updated };
    });
  };

  // ── Consolidated (ponderado por receita) ──────────────────────────────────
  const consolidated = useMemo(() => {
    const channels = visibleChannels.map(ch => channelData[ch]);
    const totalReceita = channels.reduce((s, c) => s + c.receita, 0);
    const w = (fn: (c: ChannelData) => number) =>
      totalReceita > 0 ? channels.reduce((s, c) => s + c.receita * fn(c), 0) / totalReceita : 0;

    const totalMarkdown = channels.reduce((s, c) => s + c.markdown, 0);
    const mkdPct = totalReceita > 0 ? (totalMarkdown / totalReceita) * 100 : 0;

    return {
      receita:           totalReceita,
      margemBruta:       +w(c => c.margemBruta).toFixed(1),
      pmv:               +w(c => c.pmv).toFixed(0),
      otb:               channels.reduce((s, c) => s + c.otb, 0),
      estoqueMedioRS:    channels.reduce((s, c) => s + c.estoqueMedioRS, 0),
      estoqueMedioPecas: channels.reduce((s, c) => s + c.estoqueMedioPecas, 0),
      giro:              +w(c => c.giro).toFixed(2),
      cobertura:         +w(c => c.cobertura).toFixed(0),
      markdown:          totalMarkdown,
      producao:          channels.reduce((s, c) => s + c.producao, 0),
      mkdPct:            +mkdPct.toFixed(1),
      gmroi:             +w(c => c.gmroi).toFixed(2),
    };
  }, [channelData, visibleChannels]);

  // ── Macro impact check ────────────────────────────────────────────────────
  const visibleTotalPct = visibleChannels.reduce((s, ch) => s + percents[ch], 0);

  const impactedMacro = useMemo(() => {
    if (!macroValues || visibleTotalPct !== 100 || activeMacroKeys.length === 0) return [];

    const projected: Record<string, number> = {
      receitaBruta:  consolidated.receita,
      margemBruta:   consolidated.margemBruta,
      pmv:           consolidated.pmv,
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
        const proj = projected[key];
        if (planned == null || proj == null) return false;
        const gapPct = Math.abs((proj - planned) / Math.abs(planned)) * 100;
        const tolerance = RATE_MACRO_FIELDS.has(key) ? 0.5 : 2.0;
        return gapPct > tolerance;
      })
      .map(key => ({
        key,
        label: MACRO_FIELD_LABELS[key] ?? key,
        planned: macroValues[key] as number,
        projected: projected[key],
        gap: projected[key] - (macroValues[key] as number),
        isRate: RATE_MACRO_FIELDS.has(key),
      }));
  }, [activeMacroKeys, macroValues, consolidated, visibleTotalPct]);

  // Main driver of negative margin: channel with lowest margin × highest revenue contribution
  const mainImpactChannel = useMemo(() => {
    if (impactedMacro.length === 0) return null;
    const hasMarginImpact = impactedMacro.some(i => i.key === "margemBruta" && i.gap < 0);
    if (!hasMarginImpact) return null;
    const worst = visibleChannels.reduce<{ ch: ChannelId; score: number } | null>((acc, ch) => {
      const d = channelData[ch];
      const score = d.receita * (consolidated.margemBruta - d.margemBruta); // negative = pulling margin down
      if (!acc || score < acc.score) return { ch, score };
      return acc;
    }, null);
    return worst && worst.score < 0 ? CHANNEL_LABELS[worst.ch] : null;
  }, [impactedMacro, visibleChannels, channelData, consolidated.margemBruta]);

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      if (u.profile !== "CEO") navigate("/dashboard");
    } else {
      navigate("/");
    }
  }, [navigate]);

  if (!user) return null;

  // ── Total participation ───────────────────────────────────────────────────
  const totalPercent = visibleChannels.reduce((s, ch) => s + percents[ch], 0);

  const macroOk = impactedMacro.length === 0 && visibleTotalPct === 100;
  const hasMacroCheck = activeMacroKeys.length > 0 && macroValues != null;

  // ── KPI field definitions ─────────────────────────────────────────────────
  const kpiFields: Array<{ label: string; key: keyof ChannelData; format: string; isDriver: boolean }> = [
    { label: "Receita (R$)",         key: "receita",           format: "currency",   isDriver: false },
    { label: "Margem Bruta (%)",      key: "margemBruta",       format: "percent",    isDriver: true  },
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

  const formatValue = (value: number, format: string): string => {
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
    if (["margemBruta", "mkdPct"].includes(key)) return `${val.toFixed(1)}%`;
    if (["giro", "gmroi"].includes(key)) return val.toFixed(2);
    if (["cobertura"].includes(key)) return `${Math.round(val)} dias`;
    return `R$ ${Math.round(val).toLocaleString("pt-BR")}`;
  };

  // Grid columns: label col + 1 per visible channel + consolidated col
  const colCount = 1 + visibleChannels.length + 1;
  const gridStyle = { gridTemplateColumns: `180px repeat(${visibleChannels.length + 1}, 1fr)` };

  const consolidatedKpi = (key: keyof ChannelData): number => {
    const map: Partial<Record<keyof ChannelData, number>> = {
      receita: consolidated.receita,
      margemBruta: consolidated.margemBruta,
      pmv: consolidated.pmv,
      otb: consolidated.otb,
      estoqueMedioRS: consolidated.estoqueMedioRS,
      estoqueMedioPecas: consolidated.estoqueMedioPecas,
      giro: consolidated.giro,
      cobertura: consolidated.cobertura,
      markdown: consolidated.markdown,
      producao: consolidated.producao,
      gmroi: consolidated.gmroi,
    };
    return map[key] ?? 0;
  };

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
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
            {planCycle && (
              <span className="text-[11px] bg-white/20 text-[#F6F3AA] rounded-full px-3 py-1">
                Referência: plano {latestYear}
              </span>
            )}
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" /><span>{user.name}</span>
            </div>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }}
              className="text-[#F6F3AA] hover:opacity-80"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-5">

        {/* ── AVISO: sem plano macro ──────────────────────────────────────── */}
        {!macroValues && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Nenhum cenário salvo encontrado no plano macro (Módulo 1). Os valores de referência
              usam dados históricos como base. Para ativar a sinalização de impacto, salve um cenário no Módulo 1 primeiro.
            </p>
          </div>
        )}

        {/* ── SEÇÃO 1: PARTICIPAÇÃO POR CANAL ────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#7598CF]">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Desdobramento por Canal</h2>
            <p className="text-[#28071C]/45 text-xs mt-0.5">
              Ajuste a participação (%) de cada canal na receita total.
              A distribuição recalcula automaticamente os indicadores e sinaliza impactos no plano macro.
            </p>
          </div>

          <div className="p-6">
            <div className={`grid gap-6 mb-5`} style={{ gridTemplateColumns: `repeat(${visibleChannels.length}, 1fr)` }}>
              {visibleChannels.map(ch => (
                <div key={ch} className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#7598CF]/25">
                  <label className="block text-[#28071C]/60 text-xs uppercase tracking-widest font-semibold mb-2">
                    {CHANNEL_LABELS[ch]} — Participação (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={percents[ch]}
                    onChange={e => handlePercentChange(ch, Number(e.target.value))}
                    className="w-full text-center text-[#28071C] text-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 rounded-lg px-3 py-2 border-2 border-[#7598CF]/20 bg-[#7598CF]/4"
                  />
                  <p className="text-[10px] text-[#28071C]/35 mt-2 text-center">
                    R$ {Math.round(macroReceita * percents[ch] / 100).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>

            {/* Total % indicator */}
            <div className="flex items-center justify-center gap-2">
              {totalPercent === 100 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 text-sm font-semibold">Total: {totalPercent}% ✓</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4 text-red-500" />
                  <span className="text-red-600 text-sm">Total: {totalPercent}% — deve somar 100%</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 2: BANNER DE IMPACTO MACRO ───────────────────────────── */}
        {hasMacroCheck && totalPercent === 100 && (
          <div className={`rounded-2xl p-5 border-2 transition-colors ${
            macroOk
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-300"
          }`}>
            {macroOk ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-emerald-800 font-semibold text-sm">Plano macro em dia</p>
                  <p className="text-emerald-700/70 text-xs mt-0.5">
                    Todos os indicadores selecionados no plano macro estão dentro da meta com a distribuição atual de canais.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 font-semibold text-sm">
                      A distribuição por canal impactou a entrega do plano macro.
                    </p>
                    <p className="text-red-700/70 text-xs mt-0.5">
                      Ajuste os drivers de cada canal (margem, PMV, giro) para recuperar as metas.
                      {mainImpactChannel && (
                        <span className="ml-1 font-medium">
                          Impacto principal vindo do canal {mainImpactChannel}.
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* List of impacted macro indicators */}
                <div className="space-y-2">
                  {impactedMacro.map(item => (
                    <div key={item.key} className="bg-white/70 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span className="text-[#28071C] text-sm font-medium truncate">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-shrink-0 font-mono">
                        <span className="text-[#28071C]/60">
                          Projetado: <strong className="text-[#28071C]">{fmtMacroVal(item.projected, item.key)}</strong>
                        </span>
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

        {/* ── SEÇÃO 3: SIMULADOR DE CANAIS ────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#F6F3AA]">
          <div className="px-6 py-4 border-b border-[#28071C]/8 flex items-start justify-between">
            <div>
              <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Simulador de Canais</h2>
              <p className="text-[#28071C]/45 text-xs mt-0.5">
                <span className="text-[#7598CF] font-semibold">Drivers editáveis</span>{" "}
                (Margem %, PMV, Giro, Cobertura, GMROI) recalculam os demais campos automaticamente.
                Campos derivados são calculados a partir dos drivers.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#28071C]/40 mt-1">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#7598CF]/60 inline-block" />Driver editável
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#28071C]/15 inline-block" />Calculado
              </span>
            </div>
          </div>

          <div className="p-6 overflow-x-auto">
            <div className="grid gap-3 min-w-[600px]" style={gridStyle}>

              {/* Header row */}
              <div className="flex items-center justify-center bg-[#28071C]/5 rounded-lg h-12">
                <span className="text-[#28071C]/55 text-xs uppercase tracking-widest font-semibold">KPI</span>
              </div>
              {visibleChannels.map(ch => (
                <div key={ch} className="flex items-center justify-center bg-[#7598CF] rounded-lg h-12">
                  <span className="text-white text-sm font-semibold uppercase tracking-wide">{CHANNEL_LABELS[ch]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center bg-[#28071C] rounded-lg h-12">
                <span className="text-white text-xs font-semibold uppercase tracking-widest">Consolidado</span>
              </div>

              {/* KPI rows */}
              {kpiFields.map(field => (
                <>
                  {/* Label */}
                  <div key={`lbl-${field.key}`} className="flex items-center px-3 bg-white/50 rounded-lg h-14">
                    <span className="text-[#28071C]/65 text-xs leading-tight">{field.label}</span>
                    {field.isDriver && (
                      <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#7598CF]/70 flex-shrink-0" />
                    )}
                  </div>

                  {/* Channel cells */}
                  {visibleChannels.map(ch => (
                    <div key={`${ch}-${field.key}`} className={`flex items-center px-3 rounded-lg h-14 border ${
                      field.isDriver
                        ? "bg-white border-[#7598CF]/30 ring-1 ring-[#7598CF]/10"
                        : "bg-[#28071C]/3 border-[#28071C]/8"
                    }`}>
                      {field.isDriver ? (
                        <input
                          type="text"
                          value={formatValue(channelData[ch][field.key], field.format)}
                          onChange={e => handleDriverChange(ch, field.key, e.target.value)}
                          className="w-full bg-transparent text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 rounded px-1 py-0.5"
                        />
                      ) : (
                        <span className="text-[#28071C]/60 text-sm font-mono">
                          {formatValue(channelData[ch][field.key], field.format)}
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Consolidated cell */}
                  <div key={`cons-${field.key}`} className={`flex items-center px-3 rounded-lg h-14 border ${
                    hasMacroCheck && impactedMacro.some(i => {
                      const map: Record<string, keyof typeof consolidated> = {
                        receitaBruta: "receita", margemBruta: "margemBruta", pmv: "pmv",
                        producaoPecas: "producao", otbCompra: "otb",
                      };
                      return map[i.key] === field.key;
                    })
                      ? "bg-red-50 border-red-200"
                      : "bg-[#28071C]/4 border-[#28071C]/10"
                  }`}>
                    <span className="text-[#28071C] text-sm font-semibold font-mono">
                      {formatValue(consolidatedKpi(field.key), field.format)}
                    </span>
                  </div>
                </>
              ))}
            </div>
          </div>
        </div>

        {/* ── SEÇÃO 4: BARRA DE AÇÕES ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <button className="flex items-center px-6 py-3 bg-[#7598CF] text-white rounded-xl hover:opacity-90 transition-all shadow-sm font-semibold text-sm">
              <Save className="w-4 h-4 mr-2" />Salvar Cenário
            </button>
            <button
              onClick={() => setShowCompareModal(true)}
              className="flex items-center px-6 py-3 bg-white text-[#7598CF] border-2 border-[#7598CF] rounded-xl hover:bg-[#7598CF]/8 transition-all font-semibold text-sm"
            >
              <GitCompare className="w-4 h-4 mr-2" />Comparar Cenários
            </button>
            <button className="flex items-center px-6 py-3 bg-white text-[#28071C]/60 border border-[#28071C]/15 rounded-xl hover:bg-white/80 transition-all text-sm">
              <Download className="w-4 h-4 mr-2" />Exportar
            </button>
          </div>

          <button
            disabled={totalPercent !== 100 || !macroOk}
            title={totalPercent !== 100 ? "Ajuste a participação para somar 100%" : !macroOk ? "Indicadores macro fora da meta" : "Aplicar metas do canal"}
            className={`flex items-center px-6 py-3 rounded-xl transition-all shadow-sm font-semibold text-sm ${
              totalPercent === 100 && macroOk
                ? "bg-emerald-600 text-white hover:opacity-90"
                : "bg-[#28071C]/20 text-[#28071C]/40 cursor-not-allowed"
            }`}
          >
            <Lock className="w-4 h-4 mr-2" />
            Aplicar Metas
          </button>
        </div>
      </main>

      {/* ── MODAL DE COMPARAÇÃO ─────────────────────────────────────────────── */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-[#28071C] text-xl font-bold mb-5">Selecionar cenários para comparar</h3>
            <div className="space-y-3 mb-6">
              {(["A — Conservador", "B — Moderado", "C — Agressivo"] as const).map(s => (
                <label key={s} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-3 rounded-xl transition-colors">
                  <input type="checkbox" className="w-4 h-4 accent-[#7598CF]" />
                  <span className="text-[#28071C] text-sm">Cenário {s}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCompareModal(false)}
                className="flex-1 px-5 py-2.5 bg-white text-[#28071C] border-2 border-[#28071C]/20 rounded-xl hover:bg-gray-50 text-sm font-semibold transition-all">
                Cancelar
              </button>
              <button onClick={() => setShowCompareModal(false)}
                className="flex-1 px-5 py-2.5 bg-[#28071C] text-white rounded-xl hover:opacity-90 text-sm font-semibold transition-all">
                Gerar Visão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
