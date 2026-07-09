import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { getCycle, listScenarios as dbListScenarios } from "../../services/supabase/planningScenarioService";
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare, Check, FileDown, CheckCheck,
  AlertTriangle, TrendingUp, TrendingDown, X, Info,
  ChevronRight, BarChart3
} from "lucide-react";
import { exportToPDF } from "../../utils/exportPDF";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer, ReferenceLine, ComposedChart, Line
} from "recharts";
import { Badge } from "../components/ui/badge";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CurrentUser { name: string; email: string; profile: string; }

interface MonthRevenue {
  month: string;
  atacado: number;
  varejo: number;
  ecommerce: number;
}

interface EntryCurveRow {
  month: string;
  planned: number;
  original: number;
}

interface Scenario {
  id: string;
  name: string;
  timestamp: string;
  plannedRevenue: MonthRevenue[];
  entryCurve: EntryCurveRow[];
  totalPlanned: number;
  coverageDays: number;
}

type ChannelKey = "atacado" | "varejo" | "ecommerce";
type ChannelView = "Todos" | "Atacado" | "Varejo" | "E-commerce";

// ── Constants ──────────────────────────────────────────────────────────────────
const CYCLE_MONTHS = ["Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev"];

const CHANNELS: { key: ChannelKey; label: string; color: string; prevColor: string }[] = [
  { key: "atacado",  label: "Atacado",    color: "#7598CF", prevColor: "#7598CF55" },
  { key: "varejo",   label: "Varejo",     color: "#9B8CD8", prevColor: "#9B8CD855" },
  { key: "ecommerce",label: "E-commerce", color: "#F0C040", prevColor: "#F0C04055" },
];

const PREV_YEAR: MonthRevenue[] = [
  { month: "Ago", atacado: 280000, varejo: 200000, ecommerce: 130000 },
  { month: "Set", atacado: 290000, varejo: 210000, ecommerce: 120000 },
  { month: "Out", atacado: 310000, varejo: 220000, ecommerce: 130000 },
  { month: "Nov", atacado: 270000, varejo: 200000, ecommerce: 140000 },
  { month: "Dez", atacado: 230000, varejo: 190000, ecommerce: 150000 },
  { month: "Jan", atacado: 0,      varejo: 180000, ecommerce: 120000 },
  { month: "Fev", atacado: 0,      varejo: 120000, ecommerce: 90000  },
];

const INITIAL_PLANNED: MonthRevenue[] = [
  { month: "Ago", atacado: 295000, varejo: 210000, ecommerce: 135000 },
  { month: "Set", atacado: 305000, varejo: 220000, ecommerce: 125000 },
  { month: "Out", atacado: 325000, varejo: 230000, ecommerce: 135000 },
  { month: "Nov", atacado: 285000, varejo: 210000, ecommerce: 145000 },
  { month: "Dez", atacado: 242000, varejo: 200000, ecommerce: 155000 },
  { month: "Jan", atacado: 0,      varejo: 188000, ecommerce: 125000 },
  { month: "Fev", atacado: 0,      varejo: 125000, ecommerce: 95000  },
];

const INITIAL_ENTRY: EntryCurveRow[] = [
  { month: "Ago", planned: 3000, original: 3000 },
  { month: "Set", planned: 3150, original: 3150 },
  { month: "Out", planned: 3300, original: 3300 },
  { month: "Nov", planned: 3000, original: 3000 },
  { month: "Dez", planned: 2880, original: 2880 },
  { month: "Jan", planned: 2700, original: 2700 },
  { month: "Fev", planned: 1800, original: 1800 },
];

const BASE = {
  metaReceita:    3120000,
  margemMeta:     45.2,
  estoqueInicio:  2850,
  orcamento:      1140000,
  volumeProducao: 17830,
  avgPrice:       65,
};

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `R$ ${(v / 1_000).toFixed(0)}k`
  :                `R$ ${v.toFixed(0)}`;

const fmtN = (v: number) => v.toLocaleString("pt-BR");

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, money = true }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#28071C]/20 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-[#28071C] mb-2">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: e.color ?? e.stroke }} className="text-xs">
          {e.name}: {money ? fmtR(e.value) : fmtN(e.value)}
        </p>
      ))}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CycleValidation() {
  const navigate = useNavigate();

  // Auth
  const [user, setUser] = useState<CurrentUser | null>(null);

  const [tenantId, setTenantId] = useState<string>("");

  // Cycle selector
  const [selectedCycle, setSelectedCycle] = useState("");

  // Channel view
  const [channelView, setChannelView] = useState<ChannelView>("Todos");
  const [showConsolidated, setShowConsolidated] = useState(false);

  // Entry curve
  const [clientProduces, setClientProduces] = useState(true);

  // Data
  const [plannedRevenue, setPlannedRevenue] = useState<MonthRevenue[]>(
    INITIAL_PLANNED.map(r => ({ ...r }))
  );
  const [entryCurve, setEntryCurve] = useState<EntryCurveRow[]>(
    INITIAL_ENTRY.map(r => ({ ...r }))
  );

  // Scenarios
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [appliedScenarioId, setAppliedScenarioId] = useState<string | null>(null);
  const [compareModal, setCompareModal] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [savingName, setSavingName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (!stored) { navigate("/"); return; }
    const userData = JSON.parse(stored);
    setUser(userData);
    const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
    setTenantId(tid);

    if (!tid) return;

    // Carrega cenários de validação do Supabase (planning_scenarios para o ano atual)
    const year = new Date().getFullYear();
    getCycle(tid, year)
      .then((cycle) => {
        if (!cycle) return;
        return dbListScenarios(tid, year).then((rows) => {
          if (!rows.length) return;
          const mapped: Scenario[] = rows.map((r) => {
            const vals = r.values as any;
            return {
              id: r.id,
              name: r.name,
              timestamp: new Date(r.created_at).toLocaleString("pt-BR"),
              plannedRevenue: (vals?.plannedRevenue as MonthRevenue[]) ?? INITIAL_PLANNED.map(x => ({ ...x })),
              entryCurve: (vals?.entryCurve as EntryCurveRow[]) ?? INITIAL_ENTRY.map(x => ({ ...x })),
              totalPlanned: vals?.totalPlanned ?? 0,
              coverageDays: vals?.coverageDays ?? 0,
            };
          });
          setScenarios(mapped);
          // Se houver cenário aplicado, carrega seus dados
          const applied = rows.find((r) => r.is_applied);
          if (applied) {
            setAppliedScenarioId(applied.id);
            const vals = applied.values as any;
            if (vals?.plannedRevenue) setPlannedRevenue(vals.plannedRevenue);
            if (vals?.entryCurve) setEntryCurve(vals.entryCurve);
          }
        });
      })
      .catch(() => {/* usa defaults */});
  }, [navigate]);

  // ── Derived / computed ────────────────────────────────────────────────────────
  const totalPlanned = useMemo(() =>
    plannedRevenue.reduce((s, m) => s + m.atacado + m.varejo + m.ecommerce, 0),
    [plannedRevenue]);

  const divergence = totalPlanned - BASE.metaReceita;
  const divergencePct = (divergence / BASE.metaReceita) * 100;
  const hasDivergence = Math.abs(divergence) > 500;

  const totalEntryPlanned = useMemo(() =>
    entryCurve.reduce((s, r) => s + r.planned, 0), [entryCurve]);

  const totalEntryOriginal = useMemo(() =>
    entryCurve.reduce((s, r) => s + r.original, 0), [entryCurve]);

  const entryDistortionPct = totalEntryOriginal > 0
    ? ((totalEntryPlanned - totalEntryOriginal) / totalEntryOriginal) * 100
    : 0;

  // Consumo do Orçamento
  const entryValueTotal = clientProduces
    ? totalEntryPlanned * BASE.avgPrice
    : totalEntryPlanned;

  const orcamentoRestante = BASE.orcamento - entryValueTotal;
  const orcamentoUsoPct = (entryValueTotal / BASE.orcamento) * 100;

  // Coverage (days) = (starting stock value + total entry value) / avg daily revenue
  const coverageDays = useMemo(() => {
    const stockValue = BASE.estoqueInicio * BASE.avgPrice;
    const totalValue = clientProduces
      ? totalEntryPlanned * BASE.avgPrice
      : totalEntryPlanned;
    const avgDailyRevenue = totalPlanned / (CYCLE_MONTHS.length * 30);
    if (avgDailyRevenue === 0) return 0;
    return (stockValue + totalValue) / avgDailyRevenue;
  }, [totalEntryPlanned, totalPlanned, clientProduces]);

  // Per-month coverage in days
  const monthlyCoverage = useMemo(() => {
    let cumStock = BASE.estoqueInicio * BASE.avgPrice;
    return CYCLE_MONTHS.map((month, i) => {
      const entryRow = entryCurve[i];
      const entryVal = clientProduces
        ? (entryRow?.planned ?? 0) * BASE.avgPrice
        : (entryRow?.planned ?? 0);
      cumStock += entryVal;
      const rev = plannedRevenue[i];
      const monthRev = rev ? rev.atacado + rev.varejo + rev.ecommerce : 1;
      const avgDailyRev = (monthRev || 1) / 30;
      const covDays = cumStock / avgDailyRev;
      return { month, coverage: parseFloat(covDays.toFixed(0)) };
    });
  }, [entryCurve, plannedRevenue, clientProduces]);

  // Chart data for "Todos" planned view
  const todosChartData = useMemo(() =>
    plannedRevenue.map(r => ({
      month: r.month,
      Atacado: r.atacado,
      Varejo: r.varejo,
      "E-commerce": r.ecommerce,
    })), [plannedRevenue]);

  // Chart data for "Todos" consolidated (planned + prev year)
  const consolidatedChartData = useMemo(() =>
    plannedRevenue.map((r, i) => {
      const p = PREV_YEAR[i];
      return {
        month: r.month,
        "Planejado Atacado": r.atacado,
        "Planejado Varejo": r.varejo,
        "Planejado E-commerce": r.ecommerce,
        "Ano Ant. Atacado": p.atacado,
        "Ano Ant. Varejo": p.varejo,
        "Ano Ant. E-commerce": p.ecommerce,
      };
    }), [plannedRevenue]);

  // Individual channel data
  const channelChartData = useCallback((chKey: ChannelKey) =>
    plannedRevenue.map((r, i) => ({
      month: r.month,
      Planejado: r[chKey],
      "Ano Anterior": PREV_YEAR[i][chKey],
      percentPlanned: totalPlanned > 0
        ? parseFloat(((r[chKey] / totalPlanned) * 100).toFixed(1))
        : 0,
    })), [plannedRevenue, totalPlanned]);

  // Entry curve chart data
  const entryChartData = useMemo(() =>
    entryCurve.map(r => ({
      month: r.month,
      Planejado: r.planned,
      Original: r.original,
    })), [entryCurve]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleRevenueChange = (month: string, chKey: ChannelKey, raw: string) => {
    const val = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
    setPlannedRevenue(prev => prev.map(r =>
      r.month === month ? { ...r, [chKey]: val } : r
    ));
  };

  const handleEntryChange = (month: string, raw: string) => {
    const val = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
    setEntryCurve(prev => prev.map(r =>
      r.month === month ? { ...r, planned: val } : r
    ));
  };

  const handleSaveScenario = () => {
    if (!savingName.trim()) return;
    const localId = `s-${Date.now()}`;
    const s: Scenario = {
      id: localId,
      name: savingName.trim(),
      timestamp: new Date().toLocaleString("pt-BR"),
      plannedRevenue: plannedRevenue.map(r => ({ ...r })),
      entryCurve: entryCurve.map(r => ({ ...r })),
      totalPlanned,
      coverageDays,
    };
    setScenarios(prev => [...prev, s]);
    setSavingName("");
    setShowSaveForm(false);

    // Write-through para Supabase
    if (tenantId) {
      const year = new Date().getFullYear();
      getCycle(tenantId, year)
        .then((cycle) => {
          if (!cycle) return;
          return supabase
            .from("planning_scenarios")
            .insert({
              tenant_id: tenantId,
              cycle_id: cycle.id,
              name: s.name,
              version: scenarios.length + 1,
              values: {
                plannedRevenue: s.plannedRevenue,
                entryCurve: s.entryCurve,
                totalPlanned: s.totalPlanned,
                coverageDays: s.coverageDays,
              } as unknown as import("../../lib/database.types").Json,
              is_applied: false,
            })
            .select()
            .single()
            .then(({ data }) => {
              if (data?.id) {
                // Atualiza id local com o id do banco
                setScenarios(prev => prev.map(sc =>
                  sc.id === localId ? { ...sc, id: data.id } : sc
                ));
              }
            });
        })
        .catch(() => {/* fire-and-forget */});
    }
  };

  const handleApplyScenario = (id: string) => {
    const s = scenarios.find(sc => sc.id === id);
    if (!s) return;
    setPlannedRevenue(s.plannedRevenue.map(r => ({ ...r })));
    setEntryCurve(s.entryCurve.map(r => ({ ...r })));
    setAppliedScenarioId(id);
  };

  const handleCompare = () => {
    if (scenarios.length < 2) return;
    setCompareIds([scenarios[0].id, scenarios[scenarios.length - 1].id]);
    setCompareModal(true);
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    await exportToPDF({
      elementId: "cycle-scenarios-pdf",
      fileName:  "cenarios_validacao_ciclo",
      title:     "Comparação de Cenários — Validação de Ciclo",
    });
    setIsExportingPDF(false);
  };

  const handleApplyMetas = () => {
    if (appliedScenarioId) return; // já aplicado
    const latest = scenarios.length > 0 ? scenarios[scenarios.length - 1] : null;
    if (latest) handleApplyScenario(latest.id);
  };

  const activeChannelKey: ChannelKey | null =
    channelView === "Atacado" ? "atacado"
    : channelView === "Varejo" ? "varejo"
    : channelView === "E-commerce" ? "ecommerce"
    : null;

  const activeCh = activeChannelKey
    ? CHANNELS.find(c => c.key === activeChannelKey)!
    : null;

  if (!user) return null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Módulo 4</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Validação de Sazonalidade</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content (offset for fixed topbar) ── */}
      <main className="max-w-[1600px] mx-auto px-6 pt-8 pb-12 space-y-5">

        {/* ── Cycle Selector ── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-sm">
          <div className="max-w-xs">
            <label className="block text-[#28071C]/60 text-xs uppercase tracking-widest mb-2">
              Ciclo Alvo
            </label>
            <select
              value={selectedCycle}
              onChange={e => setSelectedCycle(e.target.value)}
              className="w-full bg-white rounded-xl px-4 py-2.5 text-[#28071C] text-sm border-2 border-[#7598CF] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 cursor-pointer"
            >
              <option value="">Selecione um ciclo</option>
              <option value="verao2026">Verão 2026 (Ago/25 → Fev/26)</option>
              <option value="inverno2026">Inverno 2026</option>
              <option value="verao2027">Verão 2027</option>
            </select>
          </div>
        </div>

        {selectedCycle && (
          <>
            {/* ── STICKY INDICATORS CARD ── */}
            <div className="sticky top-16 z-40">
              <div className="bg-[#28071C] rounded-2xl px-6 py-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white/80 text-xs uppercase tracking-widest">
                    Indicadores Base do Ciclo · Verão 2026
                  </h3>
                  <Badge className="text-xs bg-[#7598CF]/30 text-[#7598CF] border-[#7598CF]/40">
                    Plano Macro Aprovado
                  </Badge>
                </div>
                <div className="grid grid-cols-5 gap-4 divide-x divide-white/10">
                  {/* Receita — always shown */}
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#F6F3AA]">
                      {fmtR(BASE.metaReceita)}
                    </div>
                    <div className="text-xs text-white/60 mt-1">Meta de Receita do Ciclo</div>
                    <div className={`text-xs mt-1 font-medium ${
                      hasDivergence
                        ? divergence > 0 ? "text-green-400" : "text-red-400"
                        : "text-green-400"
                    }`}>
                      {hasDivergence
                        ? `Ajustado: ${divergence > 0 ? "+" : ""}${fmtR(divergence)}`
                        : "✓ Alinhado"}
                    </div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{BASE.margemMeta}%</div>
                    <div className="text-xs text-white/60 mt-1">Margem Meta</div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{fmtN(BASE.estoqueInicio)}</div>
                    <div className="text-xs text-white/60 mt-1">Estoque Início (pçs)</div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{fmtR(BASE.orcamento)}</div>
                    <div className="text-xs text-white/60 mt-1">Orçamento Aprovado</div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Uso: {orcamentoUsoPct.toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">
                      {Math.round(coverageDays)}
                    </div>
                    <div className="text-xs text-white/60 mt-1">Cobertura Estimada (dias)</div>
                    <div className={`text-xs mt-0.5 ${
                      coverageDays < 60 ? "text-red-400"
                      : coverageDays > 120 ? "text-yellow-400"
                      : "text-green-400"
                    }`}>
                      {coverageDays < 60 ? "⚠ Baixa" : coverageDays > 120 ? "⚠ Elevada" : "✓ Adequada"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION: CURVA DE VENDAS POR CANAL ── */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
              <div className="border-t-4 border-[#7598CF] px-6 pt-5 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[#28071C] font-semibold text-base">
                    Curva de Vendas por Canal
                  </h3>
                  {/* Channel Tabs */}
                  <div className="flex items-center gap-2">
                    {(["Todos", "Atacado", "Varejo", "E-commerce"] as ChannelView[]).map(v => (
                      <button
                        key={v}
                        onClick={() => { setChannelView(v); setShowConsolidated(false); }}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                          channelView === v
                            ? "bg-[#28071C] text-white shadow"
                            : "bg-white text-[#28071C] hover:bg-[#28071C]/10 border border-[#28071C]/20"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── VIEW: TODOS ── */}
                {channelView === "Todos" && (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-sm text-[#28071C]/60">
                        Curva planejada consolidada por canal
                      </p>
                      <button
                        onClick={() => setShowConsolidated(v => !v)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                          showConsolidated
                            ? "bg-[#7598CF] text-white border-[#7598CF]"
                            : "bg-white text-[#7598CF] border-[#7598CF]/40 hover:bg-[#7598CF]/10"
                        }`}
                      >
                        <BarChart3 className="w-3 h-3 inline mr-1" />
                        Consolidado vs Ano Anterior
                      </button>
                    </div>

                    {/* Chart */}
                    <div className="bg-white rounded-xl p-4">
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={showConsolidated ? consolidatedChartData : todosChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                          <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 12 }} />
                          <YAxis tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                          <ReTooltip content={<ChartTooltip />} />
                          <Legend />
                          <ReferenceLine y={BASE.metaReceita / CYCLE_MONTHS.length} stroke="#28071C" strokeDasharray="5 5" label={{ value: "Média Meta", position: "right", fill: "#28071C", fontSize: 10 }} />
                          {showConsolidated ? (
                            <>
                              <Bar dataKey="Planejado Atacado" fill="#7598CF" stackId="planned" />
                              <Bar dataKey="Planejado Varejo" fill="#9B8CD8" stackId="planned" />
                              <Bar dataKey="Planejado E-commerce" fill="#F0C040" stackId="planned" />
                              <Bar dataKey="Ano Ant. Atacado" fill="#7598CF55" stackId="prev" />
                              <Bar dataKey="Ano Ant. Varejo" fill="#9B8CD855" stackId="prev" />
                              <Bar dataKey="Ano Ant. E-commerce" fill="#F0C04055" stackId="prev" />
                            </>
                          ) : (
                            <>
                              <Bar dataKey="Atacado" fill="#7598CF" />
                              <Bar dataKey="Varejo" fill="#9B8CD8" />
                              <Bar dataKey="E-commerce" fill="#F0C040" />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Monthly totals row */}
                    <div className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-1">
                      {plannedRevenue.map(r => {
                        const total = r.atacado + r.varejo + r.ecommerce;
                        const prevTotal = (PREV_YEAR.find(p => p.month === r.month) ?? { atacado: 0, varejo: 0, ecommerce: 0 });
                        const prevSum = prevTotal.atacado + prevTotal.varejo + prevTotal.ecommerce;
                        const diff = total - prevSum;
                        return (
                          <div key={r.month} className="flex-1 min-w-[80px] text-center bg-[#28071C]/5 rounded-lg p-2">
                            <div className="text-xs text-[#28071C]/50 font-medium">{r.month}</div>
                            <div className="text-sm font-bold text-[#28071C] mt-0.5">{fmtR(total)}</div>
                            {prevSum > 0 && (
                              <div className={`text-xs mt-0.5 ${diff >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {diff >= 0 ? "+" : ""}{fmtR(diff)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="min-w-[90px] text-center bg-[#28071C] rounded-lg p-2">
                        <div className="text-xs text-white/60">Total Ciclo</div>
                        <div className="text-sm font-bold text-[#F6F3AA] mt-0.5">{fmtR(totalPlanned)}</div>
                        <div className={`text-xs mt-0.5 font-medium ${hasDivergence ? divergence > 0 ? "text-green-400" : "text-red-400" : "text-green-400"}`}>
                          {hasDivergence ? `${divergence > 0 ? "+" : ""}${fmtR(divergence)}` : "✓ Meta"}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── VIEW: INDIVIDUAL CHANNEL ── */}
                {activeChannelKey && activeCh && (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeCh.color }} />
                      <p className="text-sm font-medium text-[#28071C]">
                        Canal {activeCh.label} — edite os valores mensais planejados
                      </p>
                    </div>

                    {/* Chart: original vs planned */}
                    <div className="bg-white rounded-xl p-4 mb-4">
                      <div className="flex gap-4 text-xs text-[#28071C]/60 mb-3">
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: activeCh.color }} /> Planejado
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-3 h-0.5 rounded border-dashed" style={{ borderTop: `2px dashed ${activeCh.prevColor}`, display: "block" }} /> Ano Anterior
                        </span>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={channelChartData(activeChannelKey)} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                          <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 12 }} />
                          <YAxis yAxisId="abs" tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                          <YAxis yAxisId="pct" orientation="right" tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => `${v}%`} unit="%" />
                          <ReTooltip content={<ChartTooltip />} />
                          <Bar yAxisId="abs" dataKey="Planejado" fill={activeCh.color} radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="abs" dataKey="Ano Anterior" fill={activeCh.prevColor} radius={[4, 4, 0, 0]} />
                          <Line yAxisId="pct" type="monotone" dataKey="percentPlanned" stroke="#28071C" strokeDasharray="4 2" dot={false} name="% do Total" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Editable table for individual channel */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-[#28071C]/20">
                            <th className="text-left py-2 px-3 text-[#28071C]/60 font-medium text-xs w-32">Métrica</th>
                            {CYCLE_MONTHS.map(m => (
                              <th key={m} className="text-center py-2 px-2 text-[#28071C]/60 font-medium text-xs">{m}</th>
                            ))}
                            <th className="text-center py-2 px-3 text-[#28071C]/60 font-medium text-xs">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Planejado row — editable */}
                          <tr className="border-b border-[#28071C]/10">
                            <td className="py-2 px-3 text-[#28071C] font-medium text-xs">Planejado (R$)</td>
                            {plannedRevenue.map(r => (
                              <td key={r.month} className="py-2 px-1 text-center">
                                <input
                                  type="text"
                                  value={(r[activeChannelKey] / 1000).toFixed(0)}
                                  onChange={e => handleRevenueChange(r.month, activeChannelKey, `${e.target.value}000`)}
                                  className="w-full text-center text-xs border border-[#7598CF]/40 rounded-lg py-1.5 px-1 bg-[#7598CF]/5 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 text-[#28071C] font-medium"
                                  style={{ maxWidth: 70 }}
                                />
                                <div className="text-[10px] text-[#28071C]/40 mt-0.5">mil R$</div>
                              </td>
                            ))}
                            <td className="py-2 px-3 text-center font-bold text-[#28071C] text-xs">
                              {fmtR(plannedRevenue.reduce((s, r) => s + r[activeChannelKey], 0))}
                            </td>
                          </tr>
                          {/* % do total */}
                          <tr className="border-b border-[#28071C]/10 bg-[#28071C]/3">
                            <td className="py-2 px-3 text-[#28071C]/60 text-xs">% do Total Mês</td>
                            {plannedRevenue.map(r => {
                              const monthTotal = r.atacado + r.varejo + r.ecommerce;
                              const pct = monthTotal > 0 ? (r[activeChannelKey] / monthTotal) * 100 : 0;
                              return (
                                <td key={r.month} className="py-2 px-2 text-center text-xs text-[#28071C]/60">
                                  {pct.toFixed(1)}%
                                </td>
                              );
                            })}
                            <td className="py-2 px-3 text-center text-xs text-[#28071C]/60">
                              {totalPlanned > 0
                                ? `${((plannedRevenue.reduce((s, r) => s + r[activeChannelKey], 0) / totalPlanned) * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                          </tr>
                          {/* Ano Anterior row — read-only */}
                          <tr className="bg-[#28071C]/3">
                            <td className="py-2 px-3 text-[#28071C]/50 text-xs italic">Ano Anterior</td>
                            {PREV_YEAR.map(r => (
                              <td key={r.month} className="py-2 px-2 text-center text-xs text-[#28071C]/50 italic">
                                {r[activeChannelKey] > 0 ? fmtR(r[activeChannelKey]) : "—"}
                              </td>
                            ))}
                            <td className="py-2 px-3 text-center text-xs text-[#28071C]/50 italic">
                              {fmtR(PREV_YEAR.reduce((s, r) => s + r[activeChannelKey], 0))}
                            </td>
                          </tr>
                          {/* Diferença vs ano anterior */}
                          <tr>
                            <td className="py-2 px-3 text-[#28071C]/50 text-xs">Δ vs Ant.</td>
                            {plannedRevenue.map((r, i) => {
                              const prev = PREV_YEAR[i][activeChannelKey];
                              const diff = r[activeChannelKey] - prev;
                              return (
                                <td key={r.month} className={`py-2 px-2 text-center text-xs font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-[#28071C]/40"}`}>
                                  {diff !== 0 ? `${diff > 0 ? "+" : ""}${(diff / 1000).toFixed(0)}k` : "—"}
                                </td>
                              );
                            })}
                            <td className="py-2 px-3" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── SECTION: CURVA DE ENTRADA DE PRODUTOS ── */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
              <div className="border-t-4 border-[#9B8CD8] px-6 pt-5 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[#28071C] font-semibold text-base">
                      Curva de Entrada de Produtos
                    </h3>
                    <p className="text-sm text-[#28071C]/60 mt-0.5">
                      {clientProduces
                        ? "Peças a produzir conforme cobertura estimada"
                        : "Verba mensal requerida conforme cobertura estimada"}
                    </p>
                  </div>
                  {/* Toggle: cliente produz */}
                  <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-2 border border-[#28071C]/10 shadow-sm">
                    <span className="text-xs text-[#28071C]/60">Cliente produz?</span>
                    <button
                      onClick={() => setClientProduces(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${clientProduces ? "bg-[#9B8CD8]" : "bg-[#28071C]/20"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${clientProduces ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <span className={`text-xs font-medium ${clientProduces ? "text-[#9B8CD8]" : "text-[#28071C]/40"}`}>
                      {clientProduces ? "Sim" : "Não"}
                    </span>
                  </div>
                </div>

                {/* Alerta de uso do Orçamento */}
                <div className={`flex items-center gap-3 rounded-xl p-3 mb-4 text-sm ${
                  orcamentoUsoPct > 105 ? "bg-red-50 border border-red-200"
                  : orcamentoUsoPct > 95 ? "bg-yellow-50 border border-yellow-200"
                  : orcamentoUsoPct < 85 ? "bg-blue-50 border border-blue-200"
                  : "bg-green-50 border border-green-200"
                }`}>
                  {orcamentoUsoPct > 100
                    ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    : orcamentoUsoPct > 95
                    ? <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    : <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  }
                  <span className={`${
                    orcamentoUsoPct > 105 ? "text-red-800"
                    : orcamentoUsoPct > 95 ? "text-yellow-800"
                    : orcamentoUsoPct < 85 ? "text-blue-800"
                    : "text-green-800"
                  }`}>
                    Uso do Orçamento: <strong>{orcamentoUsoPct.toFixed(1)}%</strong> &nbsp;·&nbsp;
                    {clientProduces
                      ? `${fmtN(totalEntryPlanned)} pçs planejadas × R$ ${BASE.avgPrice}/pç = ${fmtR(entryValueTotal)}`
                      : `${fmtR(entryValueTotal)} total planejado`
                    }
                    &nbsp;·&nbsp;
                    {orcamentoRestante >= 0
                      ? `Saldo: ${fmtR(orcamentoRestante)}`
                      : `Excesso: ${fmtR(Math.abs(orcamentoRestante))}`
                    }
                  </span>
                </div>

                {/* Chart */}
                <div className="bg-white rounded-xl p-4 mb-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={entryChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                      <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => clientProduces ? fmtN(v) : `${(v/1000).toFixed(0)}k`} />
                      <ReTooltip content={<ChartTooltip money={!clientProduces} />} />
                      <Legend />
                      <Bar dataKey="Planejado" fill="#9B8CD8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Original" fill="#9B8CD855" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Editable table */}
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[#28071C]/20">
                        <th className="text-left py-2 px-3 text-[#28071C]/60 font-medium text-xs w-36">Linha</th>
                        {CYCLE_MONTHS.map(m => (
                          <th key={m} className="text-center py-2 px-2 text-[#28071C]/60 font-medium text-xs">{m}</th>
                        ))}
                        <th className="text-center py-2 px-3 text-[#28071C]/60 font-medium text-xs">Total</th>
                        <th className="text-center py-2 px-3 text-[#28071C]/60 font-medium text-xs">vs Plano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Planejado — editable */}
                      <tr className="border-b border-[#28071C]/10">
                        <td className="py-2 px-3 text-[#28071C] font-medium text-xs">
                          {clientProduces ? "Peças Planejadas" : "Verba Planejada (R$)"}
                        </td>
                        {entryCurve.map(r => (
                          <td key={r.month} className="py-1.5 px-1">
                            <input
                              type="text"
                              value={r.planned}
                              onChange={e => handleEntryChange(r.month, e.target.value)}
                              className="w-full text-center text-xs border border-[#9B8CD8]/40 rounded-lg py-1.5 px-1 bg-[#9B8CD8]/5 focus:outline-none focus:ring-2 focus:ring-[#9B8CD8]/40 text-[#28071C] font-medium"
                              style={{ maxWidth: 70 }}
                            />
                          </td>
                        ))}
                        <td className={`py-2 px-3 text-center font-bold text-xs ${
                          orcamentoUsoPct > 105 ? "text-red-600" : orcamentoUsoPct > 95 ? "text-yellow-600" : "text-[#28071C]"
                        }`}>
                          {clientProduces ? fmtN(totalEntryPlanned) : fmtR(totalEntryPlanned)}
                        </td>
                        <td className={`py-2 px-3 text-center text-xs font-medium ${
                          entryDistortionPct > 5 ? "text-red-500"
                          : entryDistortionPct < -5 ? "text-yellow-500"
                          : "text-green-600"
                        }`}>
                          {entryDistortionPct >= 0 ? "+" : ""}{entryDistortionPct.toFixed(1)}%
                        </td>
                      </tr>
                      {/* Original — read-only */}
                      <tr className="bg-[#28071C]/3">
                        <td className="py-2 px-3 text-[#28071C]/50 text-xs italic">Plano Original</td>
                        {entryCurve.map(r => (
                          <td key={r.month} className="py-2 px-2 text-center text-xs text-[#28071C]/50 italic">
                            {r.original > 0 ? (clientProduces ? fmtN(r.original) : fmtR(r.original)) : "—"}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-center text-xs text-[#28071C]/50 italic">
                          {clientProduces ? fmtN(totalEntryOriginal) : fmtR(totalEntryOriginal)}
                        </td>
                        <td />
                      </tr>
                      {/* Distortion per month */}
                      <tr>
                        <td className="py-2 px-3 text-[#28071C]/50 text-xs">Δ vs Original</td>
                        {entryCurve.map(r => {
                          const diff = r.planned - r.original;
                          const pct = r.original > 0 ? (diff / r.original) * 100 : 0;
                          return (
                            <td key={r.month} className={`py-2 px-2 text-center text-xs font-medium ${
                              Math.abs(pct) > 10 ? "text-red-500"
                              : Math.abs(pct) > 5 ? "text-yellow-600"
                              : "text-green-600"
                            }`}>
                              {diff !== 0 ? `${diff > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                            </td>
                          );
                        })}
                        <td />
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Coverage commentary */}
                {Math.abs(entryDistortionPct) > 5 && (
                  <div className={`flex items-start gap-3 rounded-xl p-3 text-sm border ${
                    entryDistortionPct > 5 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                  }`}>
                    <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${entryDistortionPct > 5 ? "text-red-500" : "text-yellow-600"}`} />
                    <div className={`text-xs ${entryDistortionPct > 5 ? "text-red-800" : "text-yellow-800"}`}>
                      <strong>Atenção:</strong> O ajuste da curva de entrada representa uma variação de{" "}
                      <strong>{entryDistortionPct > 0 ? "+" : ""}{entryDistortionPct.toFixed(1)}%</strong> em relação ao plano original.
                      {entryDistortionPct > 5 && " Isso pode pressionar a verba de compras além do aprovado."}
                      {entryDistortionPct < -5 && " Isso pode resultar em cobertura inferior à necessária para atingir a meta de receita."}
                      {" "}Cobertura estimada resultante: <strong>{Math.round(coverageDays)} dias</strong>.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── SECTION: COBERTURA (read-only) ── */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
              <div className="border-t-4 border-[#F6F3AA] px-6 pt-5 pb-6">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[#28071C] font-semibold text-base">Cobertura de Estoque</h3>
                  <span className="text-xs bg-[#28071C]/10 text-[#28071C]/60 px-2 py-0.5 rounded-full">Somente leitura</span>
                </div>
                <p className="text-sm text-[#28071C]/60 mb-4">
                  A cobertura é uma consequência da verba disponível e da curva ajustada — não é editável.
                </p>
                <div className="grid grid-cols-7 gap-3">
                  {monthlyCoverage.map(mc => (
                    <div key={mc.month} className={`rounded-xl p-3 text-center border ${
                      mc.coverage < 45 ? "bg-red-50 border-red-200"
                      : mc.coverage > 120 ? "bg-yellow-50 border-yellow-200"
                      : "bg-green-50 border-green-200"
                    }`}>
                      <div className="text-xs text-[#28071C]/60 font-medium">{mc.month}</div>
                      <div className={`text-2xl font-bold mt-1 ${
                        mc.coverage < 45 ? "text-red-600"
                        : mc.coverage > 120 ? "text-yellow-600"
                        : "text-green-700"
                      }`}>
                        {mc.coverage}
                      </div>
                      <div className="text-xs text-[#28071C]/50 mt-0.5">dias</div>
                      {mc.coverage < 45 && <div className="text-[10px] text-red-500 mt-1">⚠ Baixa</div>}
                      {mc.coverage > 120 && <div className="text-[10px] text-yellow-600 mt-1">⚠ Elevada</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── SECTION: CENÁRIOS ── */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
              <div className="border-t-4 border-[#28071C]/30 px-6 pt-5 pb-6">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-[#28071C] font-semibold text-base">Cenários</h3>
                  {scenarios.length > 0 && (
                    <span className="text-xs text-[#28071C]/40 bg-[#28071C]/5 px-2 py-0.5 rounded-full">
                      {scenarios.length} {scenarios.length === 1 ? "salvo" : "salvos"}
                    </span>
                  )}
                </div>

                {/* Save form */}
                {showSaveForm && (
                  <div className="flex items-center gap-3 mb-4 p-3 bg-[#7598CF]/10 rounded-xl border border-[#7598CF]/30">
                    <input
                      type="text"
                      value={savingName}
                      onChange={e => setSavingName(e.target.value)}
                      placeholder="Nome do cenário (ex: Otimista, Conservador...)"
                      className="flex-1 px-4 py-2 rounded-lg border border-[#7598CF]/40 text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                    />
                    <button
                      onClick={handleSaveScenario}
                      disabled={!savingName.trim()}
                      className="px-4 py-2 bg-[#28071C] text-white rounded-lg text-sm font-medium hover:bg-[#28071C]/90 disabled:opacity-40"
                    >
                      Confirmar
                    </button>
                    <button onClick={() => setShowSaveForm(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Scenario list */}
                {scenarios.length === 0 ? (
                  <div className="text-center py-8 text-[#28071C]/40 text-sm">
                    Nenhum cenário salvo ainda. Faça ajustes e salve um cenário para comparar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scenarios.map(s => {
                      const isApplied = s.id === appliedScenarioId;
                      const scenDivergence = s.totalPlanned - BASE.metaReceita;
                      return (
                        <div key={s.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                          isApplied
                            ? "bg-[#28071C] border-[#28071C]"
                            : "bg-white border-[#28071C]/10 hover:border-[#7598CF]/40"
                        }`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-sm ${isApplied ? "text-[#F6F3AA]" : "text-[#28071C]"}`}>
                                {s.name}
                              </span>
                              {isApplied && (
                                <Badge className="text-xs bg-[#F6F3AA]/20 text-[#F6F3AA] border-[#F6F3AA]/30">
                                  Aplicado
                                </Badge>
                              )}
                            </div>
                            <div className={`text-xs mt-1 ${isApplied ? "text-white/60" : "text-[#28071C]/50"}`}>
                              Salvo em {s.timestamp}
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-center">
                            <div>
                              <div className={`text-sm font-bold ${isApplied ? "text-white" : "text-[#28071C]"}`}>
                                {fmtR(s.totalPlanned)}
                              </div>
                              <div className={`text-xs ${isApplied ? "text-white/50" : "text-[#28071C]/50"}`}>Receita</div>
                            </div>
                            <div>
                              <div className={`text-sm font-bold ${isApplied ? "text-white" : "text-[#28071C]"}`}>
                                {Math.round(s.coverageDays)} dias
                              </div>
                              <div className={`text-xs ${isApplied ? "text-white/50" : "text-[#28071C]/50"}`}>Cobertura</div>
                            </div>
                            <div>
                              <div className={`text-sm font-medium ${
                                Math.abs(scenDivergence) < 500 ? "text-green-500"
                                : scenDivergence > 0 ? "text-green-600"
                                : "text-red-500"
                              }`}>
                                {Math.abs(scenDivergence) < 500 ? "✓" : scenDivergence > 0 ? "+" : ""}{fmtR(scenDivergence)}
                              </div>
                              <div className={`text-xs ${isApplied ? "text-white/50" : "text-[#28071C]/50"}`}>vs Meta</div>
                            </div>
                          </div>
                          {!isApplied && (
                            <button
                              onClick={() => handleApplyScenario(s.id)}
                              className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-lg text-xs font-medium hover:bg-[#28071C]/80 transition-all"
                            >
                              <Check className="w-3 h-3" />
                              Aplicar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Apply notice */}
                {appliedScenarioId && (
                  <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                    <Check className="w-4 h-4 text-green-600" />
                    Cenário aplicado com sucesso. Os valores do ciclo foram atualizados. Ajustes adicionais serão feitos com base neste cenário.
                  </div>
                )}

                {/* Divergence warning before applying */}
                {hasDivergence && !appliedScenarioId && (
                  <div className="mt-4 flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Divergência de {fmtR(Math.abs(divergence))} ({Math.abs(divergencePct).toFixed(1)}%)</strong> entre a receita planejada e a meta macro.
                      {" "}Você pode aplicar o cenário mesmo assim, mas o sistema registrará a divergência.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── BARRA DE AÇÕES ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 bg-[#F2F2F2]/80 backdrop-blur-sm border-t border-[#28071C]/8 px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSaveForm(v => !v)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
            >
              <Save className="w-4 h-4" />
              Salvar cenário
            </button>
            <button
              onClick={handleCompare}
              disabled={scenarios.length < 2}
              title={scenarios.length < 2 ? "Salve ao menos 2 cenários para comparar" : "Comparar cenários salvos"}
              className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl text-sm font-semibold hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
            >
              <GitCompare className="w-4 h-4" />
              Comparar
              {scenarios.length >= 2 && (
                <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                  {scenarios.length}
                </span>
              )}
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <FileDown className="w-4 h-4" />
              {isExportingPDF ? "Gerando PDF…" : "Exportar PDF"}
            </button>
          </div>
          <button
            onClick={handleApplyMetas}
            disabled={scenarios.length === 0 || !!appliedScenarioId}
            title={
              appliedScenarioId ? "Cenário já aplicado ao ciclo" :
              scenarios.length === 0 ? "Salve um cenário antes de aplicar" :
              "Aplicar o cenário mais recente ao ciclo"
            }
            className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <CheckCheck className="w-4 h-4" />
            {appliedScenarioId ? "Metas aplicadas ✓" : "Aplicar metas"}
          </button>
        </div>
        <p className="text-center text-[9px] text-[#28071C]/25 mt-1">
          Cenários não alteram dados oficiais até "Aplicar metas" ser acionado.
        </p>
      </div>

      {/* ── COMPARE MODAL ── */}
      {compareModal && compareIds && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/10">
              <h2 className="text-[#28071C] font-semibold text-lg">Comparação de Cenários</h2>
              <button onClick={() => setCompareModal(false)} className="text-[#28071C]/40 hover:text-[#28071C] transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-6">
                {compareIds.map(id => {
                  const s = scenarios.find(sc => sc.id === id);
                  if (!s) return null;
                  const scenDivergence = s.totalPlanned - BASE.metaReceita;
                  return (
                    <div key={id} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#28071C]">{s.name}</h3>
                        {s.id === appliedScenarioId && (
                          <Badge className="text-xs bg-[#28071C] text-white">Aplicado</Badge>
                        )}
                      </div>
                      <div className="text-xs text-[#28071C]/50">Salvo em {s.timestamp}</div>

                      {/* Key indicators */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#28071C]/5 rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-[#28071C]">{fmtR(s.totalPlanned)}</div>
                          <div className="text-xs text-[#28071C]/60">Receita Total</div>
                          <div className={`text-xs mt-1 font-medium ${Math.abs(scenDivergence) < 500 ? "text-green-600" : scenDivergence > 0 ? "text-green-600" : "text-red-500"}`}>
                            {Math.abs(scenDivergence) < 500 ? "✓ Alinhado" : `${scenDivergence > 0 ? "+" : ""}${fmtR(scenDivergence)} vs Meta`}
                          </div>
                        </div>
                        <div className={`rounded-xl p-3 text-center ${
                          s.coverageDays < 60 ? "bg-red-50" : s.coverageDays > 120 ? "bg-yellow-50" : "bg-green-50"
                        }`}>
                          <div className={`text-lg font-bold ${s.coverageDays < 60 ? "text-red-600" : s.coverageDays > 120 ? "text-yellow-600" : "text-green-700"}`}>
                            {Math.round(s.coverageDays)}
                          </div>
                          <div className="text-xs text-[#28071C]/60">Cobertura (dias)</div>
                        </div>
                      </div>

                      {/* Revenue by channel */}
                      <div className="bg-[#28071C]/3 rounded-xl p-3">
                        <div className="text-xs font-medium text-[#28071C]/60 mb-2">Receita por Canal</div>
                        {CHANNELS.map(ch => {
                          const chTotal = s.plannedRevenue.reduce((acc, r) => acc + r[ch.key], 0);
                          return (
                            <div key={ch.key} className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ch.color }} />
                              <span className="text-xs text-[#28071C]/60 w-20">{ch.label}</span>
                              <span className="text-xs font-medium text-[#28071C]">{fmtR(chTotal)}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Entry curve mini */}
                      <div className="bg-[#28071C]/3 rounded-xl p-3">
                        <div className="text-xs font-medium text-[#28071C]/60 mb-2">Curva de Entrada</div>
                        <div className="flex gap-1">
                          {s.entryCurve.map(r => (
                            <div key={r.month} className="flex-1 text-center">
                              <div className="text-[9px] text-[#28071C]/40">{r.month}</div>
                              <div className="text-[10px] font-medium text-[#28071C]">{fmtN(r.planned)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Side-by-side chart */}
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-[#28071C] mb-3">Comparação de Cobertura por Mês (dias)</h4>
                <div className="bg-white border border-[#28071C]/10 rounded-xl p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={CYCLE_MONTHS.map((m, i) => {
                        const row: any = { month: m };
                        compareIds.forEach(id => {
                          const s = scenarios.find(sc => sc.id === id);
                          if (!s) return;
                          let cumStock = BASE.estoqueInicio * BASE.avgPrice;
                          for (let j = 0; j <= i; j++) {
                            const entry = s.entryCurve[j];
                            cumStock += entry ? entry.planned * BASE.avgPrice : 0;
                          }
                          const rev = s.plannedRevenue[i];
                          const monthRev = rev ? rev.atacado + rev.varejo + rev.ecommerce : 1;
                          const avgDailyRev = (monthRev || 1) / 30;
                          row[s.name] = Math.round(cumStock / avgDailyRev);
                        });
                        return row;
                      })}
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                      <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#28071C", fontSize: 11 }} unit=" d" />
                      <ReTooltip />
                      <Legend />
                      <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Mín 60d", fill: "#ef4444", fontSize: 9 }} />
                      {compareIds.map((id, idx) => {
                        const s = scenarios.find(sc => sc.id === id);
                        return s ? (
                          <Bar key={id} dataKey={s.name} fill={idx === 0 ? "#7598CF" : "#9B8CD8"} radius={[3, 3, 0, 0]} />
                        ) : null;
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#28071C]/10 flex justify-between">
              <div className="flex gap-3">
                {compareIds.map(id => {
                  const s = scenarios.find(sc => sc.id === id);
                  return s ? (
                    <button
                      key={id}
                      onClick={() => { handleApplyScenario(id); setCompareModal(false); }}
                      disabled={id === appliedScenarioId}
                      className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-medium hover:bg-[#28071C]/80 transition-all disabled:opacity-40"
                    >
                      <Check className="w-4 h-4" />
                      Aplicar "{s.name}"
                    </button>
                  ) : null;
                })}
              </div>
              <button
                onClick={() => setCompareModal(false)}
                className="px-4 py-2 bg-white border border-[#28071C]/20 text-[#28071C] rounded-xl text-sm hover:bg-[#28071C]/5 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF: Comparação de Cenários (capturado pelo html2canvas) ─────────── */}
      <div
        id="cycle-scenarios-pdf"
        style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, width: '1120px', padding: '28px', background: '#F2F2F2', fontFamily: 'system-ui, sans-serif' }}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#28071C', marginBottom: '4px' }}>Validação de Ciclo</p>
        <p style={{ fontSize: '11px', color: '#28071C', opacity: 0.4, marginBottom: '20px' }}>Comparação de Cenários</p>
        {scenarios.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#28071C', opacity: 0.5 }}>Nenhum cenário salvo.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            {scenarios.map(s => {
              const isApplied = s.id === appliedScenarioId;
              const delta = s.totalPlanned - BASE.metaReceita;
              const deltaPct = BASE.metaReceita ? ((delta / BASE.metaReceita) * 100).toFixed(1) : '—';
              return (
                <div key={s.id} style={{ flex: '1 1 220px', minWidth: '200px', maxWidth: '260px', background: 'white', borderRadius: '12px', padding: '16px', borderTop: `4px solid ${isApplied ? '#7598CF' : '#28071C'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#28071C' }}>{s.name}</span>
                    {isApplied && <span style={{ fontSize: '9px', background: '#7598CF', color: 'white', borderRadius: '999px', padding: '2px 6px', fontWeight: 700 }}>APLICADO</span>}
                  </div>
                  {[
                    { label: 'Indicador', plan: 'Plano', ref: 'vs Referência', isHeader: true },
                    { label: 'Receita Total', plan: fmtR(s.totalPlanned), ref: `${delta >= 0 ? '+' : ''}${deltaPct}%` },
                    { label: 'Meta Receita', plan: fmtR(BASE.metaReceita), ref: '—' },
                    { label: 'Cobertura', plan: `${Math.round(s.coverageDays)} dias`, ref: s.coverageDays < 60 ? '⚠ Baixa' : s.coverageDays > 120 ? '⚠ Alta' : '✓ OK' },
                    { label: 'Salvo em', plan: s.timestamp, ref: '' },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', padding: '5px 0', borderBottom: '1px solid #F2F2F2', fontSize: row.isHeader ? '9px' : '11px', fontWeight: row.isHeader ? 700 : 400, color: row.isHeader ? 'rgba(40,7,28,0.4)' : '#28071C', textTransform: row.isHeader ? 'uppercase' : 'none', letterSpacing: row.isHeader ? '0.05em' : 0 }}>
                      <span>{row.label}</span>
                      <span style={{ textAlign: 'center', fontWeight: row.isHeader ? 700 : 600 }}>{row.plan}</span>
                      <span style={{ textAlign: 'right', color: row.isHeader ? 'rgba(40,7,28,0.4)' : 'rgba(40,7,28,0.6)' }}>{row.ref}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
