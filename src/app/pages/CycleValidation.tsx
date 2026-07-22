import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { getCycle, listScenarios as dbListScenarios } from "../../services/supabase/planningScenarioService";
import { getPlanCycle, getPlannedYears } from "../types/planCycle";
import {
  listSupplyFornecedores, calcBudgetProjection, aggregateReceita,
  type SupplyFornecedor, type TipoFornecedorV2,
} from "../../services/supabase/supplyService";
import {
  getDivisionSeasonality,
  buildDivisionMonthRevenue,
  applyBiproportional,
  type DivisionMonthProfile,
} from "../../services/supabase/divisionSeasonalityService";
import {
  listModule3Scenarios,
  initModule3Scenarios,
} from "../../services/module3ScenarioService";
import {
  listSeasonsDb,
  listCanalConfigDb,
  type CanalConfig,
} from "../../services/supabase/seasonService";
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare, Check, FileDown, CheckCheck,
  X, HelpCircle, ArrowRight, SendHorizonal, CheckCircle, Loader2,
} from "lucide-react";
import {
  createApprovalRequest,
  hasPendingRequest,
  type ImpactedIndicator,
} from "../../services/supabase/planApprovalService";
import type { Temporada } from "../../services/temporadaService";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import { exportToPDF } from "../../utils/exportPDF";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer, ReferenceLine, ComposedChart,
} from "recharts";
import { Badge } from "../components/ui/badge";

// ── Tour steps ─────────────────────────────────────────────────────────────────
const CYCLE_VALIDATION_TOUR: TourStep[] = [
  {
    targetId: "tour-cv-header",
    title: "Sazonalidade — Módulo 4",
    content: "Valide o ritmo mensal da coleção por canal. A curva de entrada é calculada automaticamente para garantir a cobertura de estoque que você definir.",
  },
  {
    targetId: "tour-cv-indicators",
    title: "Indicadores do Ciclo",
    content: "Referências do plano macro. Use a meta de receita para calibrar a distribuição mensal.",
  },
  {
    targetId: "tour-cv-revenue",
    title: "Curva de Receita por Canal",
    content: "Edite a receita mês a mês por canal. O sistema calcula quantas peças precisam entrar no estoque para garantir a cobertura definida.",
  },
  {
    targetId: "tour-cv-entry",
    title: "Curva de Entrada (calculada)",
    content: "Resultado automático do motor bottom-up: receita ÷ PMV → peças → cobertura → entrada necessária. Você não edita a entrada — edita a cobertura meta.",
  },
];

// ── Month constants ─────────────────────────────────────────────────────────────
const MONTHS_FULL = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const SHORT_MONTH: Record<string, string> = {
  Janeiro:"Jan", Fevereiro:"Fev", Março:"Mar", Abril:"Abr",
  Maio:"Mai", Junho:"Jun", Julho:"Jul", Agosto:"Ago",
  Setembro:"Set", Outubro:"Out", Novembro:"Nov", Dezembro:"Dez",
};

// ── Canal definitions ───────────────────────────────────────────────────────────
const TODOS_CANAIS: { id: string; name: string; color: string; prevColor: string }[] = [
  { id: "varejo",          name: "Varejo Físico",   color: "#9B8CD8", prevColor: "#9B8CD855" },
  { id: "ecommerce",       name: "E-commerce",      color: "#F0C040", prevColor: "#F0C04055" },
  { id: "atacado",         name: "Atacado",         color: "#7598CF", prevColor: "#7598CF55" },
  { id: "multimarca",      name: "Multimarca",      color: "#6BAE75", prevColor: "#6BAE7555" },
  { id: "franquia",        name: "Franquia",        color: "#E07B54", prevColor: "#E07B5455" },
  { id: "popup",           name: "Pop-up",          color: "#C86DD7", prevColor: "#C86DD755" },
  { id: "marketplace",     name: "Marketplace",     color: "#5BB8C4", prevColor: "#5BB8C455" },
  { id: "social_commerce", name: "Social Commerce", color: "#E8A0BF", prevColor: "#E8A0BF55" },
];

const ONBOARDING_TO_CANAL_ID: Record<string, string> = {
  varejo_fisico: "varejo", ecommerce_proprio: "ecommerce",
  marketplace: "marketplace", atacado: "atacado",
  franquia: "franquia", multimarca_canal: "multimarca",
  popup: "popup", social_commerce: "social_commerce",
};

// ── Helper functions ────────────────────────────────────────────────────────────
function generateMonthRange(mesInicio: string, mesFim: string): string[] {
  const start = MONTHS_FULL.indexOf(mesInicio);
  const end   = MONTHS_FULL.indexOf(mesFim);
  if (start < 0 || end < 0) return [];
  const result: string[] = [];
  let i = start, safety = 0;
  while (safety < 24) {
    result.push(MONTHS_FULL[i]);
    if (i === end) break;
    i = (i + 1) % 12;
    safety++;
  }
  return result;
}

function matchChannelToCanal(channel: string): string {
  const ch = (channel || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ch.includes("varejo") || ch.includes("fisico") || ch.includes("loja")) return "varejo";
  if (ch.includes("ecommerce") || ch.includes("online") || ch.includes("site")) return "ecommerce";
  if (ch.includes("atacado") || ch.includes("distrib")) return "atacado";
  if (ch.includes("franquia")) return "franquia";
  if (ch.includes("multimarca") || ch.includes("revend")) return "multimarca";
  if (ch.includes("marketplace")) return "marketplace";
  if (ch.includes("popup") || ch.includes("evento")) return "popup";
  if (ch.includes("social")) return "social_commerce";
  return ch;
}

function getSeasonDateRange(season: Temporada): { start: string; end: string } {
  const si  = MONTHS_FULL.indexOf(season.mesInicio);
  const ei  = MONTHS_FULL.indexOf(season.mesFim);
  const ano = season.anoFiscal ?? new Date().getFullYear();
  const crossYear = si > ei || season.tipo === "verao";
  const startYear = crossYear ? ano - 1 : ano;
  const endYear   = ano;
  const startDate = `${startYear}-${String(si + 1).padStart(2,"0")}-01`;
  const endDays   = new Date(endYear, ei + 1, 0).getDate();
  const endDate   = `${endYear}-${String(ei + 1).padStart(2,"0")}-${endDays}`;
  return { start: startDate, end: endDate };
}

// ── Types ───────────────────────────────────────────────────────────────────────
interface CurrentUser { name: string; email: string; profile: string; }

interface CanalMonthCalc {
  month: string; shortMonth: string;
  receita: number; prevReceita: number;
  pecasVender: number;
  coberturaTarget: number;
  pecasCobertura: number;
  estoqueInicio: number;
  entrada: number;
  estoqueFim: number;
  coberturaReal: number;
  custoEntrada: number;
}

interface CanalCalcResult {
  canalId: string; canalName: string; color: string; prevColor: string;
  months: CanalMonthCalc[];
  totalReceita: number; totalEntrada: number; totalCustoEntrada: number;
  pmv: number;
}

interface Scenario {
  id: string; name: string; timestamp: string;
  seasonId: string;
  plannedRevenue: Record<string, Record<string, number>>;
  coverageTarget: Record<string, number>;
  estoqueColeçãoPassada: number;
  totalPlanned: number; avgCoverage: number;
  /** Plano mensal por divisão — Tab 3 do M4 */
  divisionMonthPlan?: Record<string, Record<string, number>>;
}

// ── Formatters ──────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `R$ ${(v / 1_000).toFixed(0)}k`
  :                `R$ ${v.toFixed(0)}`;

const fmtN = (v: number) => v.toLocaleString("pt-BR");

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

// ── Bottom-up engine ────────────────────────────────────────────────────────────
function computeCanalCalc(
  months: string[],
  plannedRevenue: Record<string, number>,
  prevYearRevenue: Record<string, number>,
  pmv: number,
  avgCost: number,
  coverageTarget: Record<string, number>,
  estoqueInicial: number,
): CanalMonthCalc[] {
  if (months.length === 0) return [];
  const effectivePmv = pmv > 0 ? pmv : 65;

  const pecasVenderArr = months.map(m => {
    const rev = plannedRevenue[m] || 0;
    return effectivePmv > 0 ? rev / effectivePmv : 0;
  });

  const result: CanalMonthCalc[] = [];
  let prevEstoqueInicio = estoqueInicial;
  let prevEntrada = 0;
  let prevPecasVender = 0;

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const receita = plannedRevenue[month] || 0;
    const pv = pecasVenderArr[i];

    const estoqueInicio = i === 0
      ? estoqueInicial
      : Math.max(0, prevEstoqueInicio + prevEntrada - prevPecasVender);

    const covDays = coverageTarget[month] ?? 90;
    const covMonths = Math.ceil(covDays / 30);

    let pecasCobertura = 0;
    for (let j = i; j < Math.min(i + covMonths, months.length); j++) {
      pecasCobertura += pecasVenderArr[j];
    }

    const entrada = Math.max(0, pecasCobertura - estoqueInicio);
    const estoqueFim = Math.max(0, estoqueInicio + entrada - pv);
    const avgDailyPv = pv / 30;
    const coberturaReal = avgDailyPv > 0 ? Math.round((estoqueInicio + entrada) / avgDailyPv) : 0;

    result.push({
      month,
      shortMonth: SHORT_MONTH[month] || month.slice(0, 3),
      receita,
      prevReceita: prevYearRevenue[month] || 0,
      pecasVender: Math.round(pv),
      coberturaTarget: covDays,
      pecasCobertura: Math.round(pecasCobertura),
      estoqueInicio: Math.round(estoqueInicio),
      entrada: Math.round(entrada),
      estoqueFim: Math.round(estoqueFim),
      coberturaReal,
      custoEntrada: Math.round(entrada * (avgCost > 0 ? avgCost : 30)),
    });

    prevEstoqueInicio = estoqueInicio;
    prevEntrada = entrada;
    prevPecasVender = pv;
  }
  return result;
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function CycleValidation() {
  const navigate = useNavigate();
  const tour = useTour("cycle-validation");

  const [user, setUser]           = useState<CurrentUser | null>(null);
  const [tenantId, setTenantId]   = useState<string>("");

  // Seasons
  const [seasons, setSeasons]                     = useState<Temporada[]>([]);
  const [selectedSeasonId, setSelectedSeasonId]   = useState("");
  const [canalConfigs, setCanalConfigs]             = useState<CanalConfig[]>([]);
  const [tenantCanalIds, setTenantCanalIds]         = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData]           = useState(false);

  // Metrics from DB
  const [avgPmv, setAvgPmv]   = useState<Record<string, number>>({});
  const [avgCost, setAvgCost] = useState<number>(30);
  const [prevYearRevenue, setPrevYearRevenue] = useState<Record<string, Record<string, number>>>({});

  // Planning inputs
  const [plannedRevenue, setPlannedRevenue]                   = useState<Record<string, Record<string, number>>>({});
  const [coverageTarget, setCoverageTarget]                   = useState<Record<string, number>>({});
  const [estoqueColeçãoPassada, setEstoqueColeçãoPassada]     = useState<number>(500);

  // Macro reference
  const [macroMeta, setMacroMeta] = useState({ metaReceita: 0, margemMeta: 45, orcamento: 0 });

  // Module view
  const [activeModuleView, setActiveModuleView] = useState<"curva" | "orcamento" | "divisao">("curva");
  const [channelView, setChannelView]           = useState<string>("Consolidado");
  const [showDetails, setShowDetails]           = useState(false);

  // ── Tab 3: Plano por Divisão ──────────────────────────────────────────────
  const [divSeasonality, setDivSeasonality]         = useState<DivisionMonthProfile[]>([]);
  const [divRevenue, setDivRevenue]                 = useState<Record<string, Record<string, number>>>({});
  const [divPmv, setDivPmv]                         = useState<Record<string, number>>({});
  const [divM3Pcts, setDivM3Pcts]                   = useState<Record<string, number>>({});
  const [divLoadingSeasonality, setDivLoadingSeasonality] = useState(false);
  const [divInitializedFor, setDivInitializedFor]   = useState<string>(""); // seasonId que já foi inicializado

  // Supply
  const [supplyFornecedores, setSupplyFornecedores] = useState<SupplyFornecedor[]>([]);
  const [margemOrc, setMargemOrc]                   = useState(45);

  // Scenarios
  const [scenarios, setScenarios]                 = useState<Scenario[]>([]);
  const [appliedScenarioId, setAppliedScenarioId] = useState<string | null>(null);
  const [compareModal, setCompareModal]           = useState(false);
  const [compareIds, setCompareIds]               = useState<[string, string] | null>(null);
  const [savingName, setSavingName]               = useState("");
  const [showSaveForm, setShowSaveForm]           = useState(false);
  const [isExportingPDF, setIsExportingPDF]       = useState(false);

  // Approval
  const [showPostApplyModal, setShowPostApplyModal]             = useState(false);
  const [showSubmitApprovalDialog, setShowSubmitApprovalDialog] = useState(false);
  const [approvalJustification, setApprovalJustification]       = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval]         = useState(false);
  const [alreadyPending, setAlreadyPending]                     = useState(false);

  // ── Initial load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (!stored) { navigate("/"); return; }
    const userData = JSON.parse(stored);
    setUser(userData);
    const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
    setTenantId(tid);
    if (!tid) return;

    const db = supabase as any;

    hasPendingRequest(tid, 4, new Date().getFullYear())
      .then(has => setAlreadyPending(has)).catch(() => {});

    listSupplyFornecedores(tid).then(setSupplyFornecedores).catch(() => {});

    listSeasonsDb(tid).then(setSeasons).catch(() => {});

    // Tenant channels from onboarding_profiles
    db.from("onboarding_profiles")
      .select("sales_channels")
      .eq("tenant_id", tid)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.sales_channels?.length) {
          const canalIds = (data.sales_channels as string[])
            .map((sc: string) => ONBOARDING_TO_CANAL_ID[sc] ?? sc)
            .filter(Boolean);
          setTenantCanalIds(canalIds);
        } else {
          setTenantCanalIds(["varejo", "ecommerce", "atacado"]);
        }
      }).catch(() => setTenantCanalIds(["varejo", "ecommerce", "atacado"]));

    // Avg PMV per channel from sales_history
    db.from("sales_history")
      .select("channel, price_realized")
      .eq("tenant_id", tid)
      .not("price_realized", "is", null)
      .gt("price_realized", 0)
      .limit(5000)
      .then(({ data: rows }: any) => {
        const map: Record<string, { sum: number; count: number }> = {};
        for (const r of rows ?? []) {
          const cid = matchChannelToCanal(r.channel);
          if (!map[cid]) map[cid] = { sum: 0, count: 0 };
          map[cid].sum += r.price_realized;
          map[cid].count++;
        }
        const pmvResult: Record<string, number> = {};
        for (const [ch, { sum, count }] of Object.entries(map)) {
          pmvResult[ch] = count > 0 ? Math.round(sum / count) : 0;
        }
        if (Object.keys(pmvResult).length) setAvgPmv(pmvResult);
      }).catch(() => {});

    // Custo médio — prioridade: (1) Módulo 1 planejado, (2) média do catálogo importado
    const year = new Date().getFullYear();
    const plannedYears = getPlannedYears();
    const cycleYear = plannedYears.length > 0 ? Math.max(...plannedYears) : year;
    const m1Cycle = getPlanCycle(cycleYear);
    const m1Values = (m1Cycle?.versions?.[0]?.values ?? {}) as Record<string, number | null>;
    const m1CustoMedio = m1Values.custoMedio;
    const m1Pmv        = m1Values.pmv;

    if (m1CustoMedio && m1CustoMedio > 0) {
      // M1 tem custo médio planejado → usa diretamente
      setAvgCost(Math.round(m1CustoMedio));
    } else {
      // Fallback: média simples do catálogo importado
      db.from("products")
        .select("price_cost")
        .eq("tenant_id", tid)
        .not("price_cost", "is", null)
        .gt("price_cost", 0)
        .limit(1000)
        .then(({ data: rows }: any) => {
          const vals = (rows ?? []).map((r: any) => r.price_cost as number);
          if (vals.length) setAvgCost(Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length));
        }).catch(() => {});
    }

    // PMV global do M1 usado como fallback para canais sem histórico
    if (m1Pmv && m1Pmv > 0) {
      setAvgPmv(prev => {
        // Só preenche canais que ainda não têm PMV histórico
        const updated = { ...prev };
        if (!updated["varejo"])    updated["varejo"]    = Math.round(m1Pmv);
        if (!updated["ecommerce"]) updated["ecommerce"] = Math.round(m1Pmv);
        if (!updated["atacado"])   updated["atacado"]   = Math.round(m1Pmv * 0.65); // atacado pratica ~65% do PMV varejo
        return updated;
      });
    }

    // Macro meta do M1 → alimenta macroMeta state (receita, margem, orçamento)
    if (m1Values) {
      setMacroMeta({
        metaReceita: (m1Values.receitaBruta ?? 0) as number,
        margemMeta:  (m1Values.margemBruta  ?? 45) as number,
        orcamento:   (m1Values.orcamento    ?? 0)  as number,
      });
    }

    // Scenarios
    getCycle(tid, cycleYear).then(cycle => {
      if (!cycle) return;
      return dbListScenarios(tid, cycleYear).then(rows => {
        if (!rows.length) return;
        const mapped: Scenario[] = rows.map(r => {
          const v = r.values as any;
          return {
            id: r.id, name: r.name,
            timestamp: new Date(r.created_at).toLocaleString("pt-BR"),
            seasonId: v?.seasonId ?? "",
            plannedRevenue: v?.plannedRevenue ?? {},
            coverageTarget: v?.coverageTarget ?? {},
            estoqueColeçãoPassada: v?.estoqueColeçãoPassada ?? 500,
            totalPlanned: v?.totalPlanned ?? 0,
            avgCoverage: v?.avgCoverage ?? 0,
            divisionMonthPlan: v?.divisionMonthPlan ?? undefined,
          };
        });
        setScenarios(mapped);
        const applied = rows.find(r => r.is_applied);
        if (applied) {
          setAppliedScenarioId(applied.id);
          const v = applied.values as any;
          if (v?.plannedRevenue) setPlannedRevenue(v.plannedRevenue);
          if (v?.coverageTarget) setCoverageTarget(v.coverageTarget);
          if (v?.estoqueColeçãoPassada) setEstoqueColeçãoPassada(v.estoqueColeçãoPassada);
          if (v?.seasonId) setSelectedSeasonId(v.seasonId);
          // Restaura o plano mensal por divisão do M4 Tab 3
          if (v?.divisionMonthPlan && Object.keys(v.divisionMonthPlan).length > 0) {
            setDivRevenue(v.divisionMonthPlan);
            // Marca como já inicializado para não sobrescrever com cálculo histórico
            if (v?.seasonId) setDivInitializedFor(v.seasonId);
          }
        }
      });
    }).catch(() => {});
  }, [navigate]);

  // ── Carrega perfil histórico de sazonalidade por divisão ─────────────────────
  useEffect(() => {
    if (!tenantId) return;
    setDivLoadingSeasonality(true);
    getDivisionSeasonality(tenantId)
      .then(res => { if (res.hasData) setDivSeasonality(res.consolidated); })
      .catch(() => {})
      .finally(() => setDivLoadingSeasonality(false));
  }, [tenantId]);

  // ── Load canal configs + prev year when season changes ──────────────────────
  useEffect(() => {
    if (!tenantId || !selectedSeasonId) return;
    setIsLoadingData(true);

    const db = supabase as any;
    const season = seasons.find(s => s.id === selectedSeasonId);

    listCanalConfigDb(tenantId, selectedSeasonId)
      .then(configs => {
        if (configs.length > 0) {
          setCanalConfigs(configs);
        } else if (season) {
          // Fallback: unified period for all tenant canals
          const fallback: CanalConfig[] = tenantCanalIds.map(cid => ({
            id: `fallback-${cid}`, canal_id: cid,
            mes_inicio: season.mesInicio, mes_fim: season.mesFim,
          }));
          setCanalConfigs(fallback);
        }
      }).catch(() => {});

    // Prev year revenue
    if (season) {
      const { start, end } = getSeasonDateRange(season);
      const prevStart = new Date(start); prevStart.setFullYear(prevStart.getFullYear() - 1);
      const prevEnd   = new Date(end);   prevEnd.setFullYear(prevEnd.getFullYear() - 1);

      db.from("sales_history")
        .select("channel, sale_date, revenue_net")
        .eq("tenant_id", tenantId)
        .gte("sale_date", prevStart.toISOString().split("T")[0])
        .lte("sale_date", prevEnd.toISOString().split("T")[0])
        .limit(100000)
        .then(({ data: rows }: any) => {
          const map: Record<string, Record<string, number>> = {};
          for (const r of rows ?? []) {
            const cid   = matchChannelToCanal(r.channel);
            const month = MONTHS_FULL[new Date(r.sale_date + "T00:00:00").getMonth()];
            if (!map[cid]) map[cid] = {};
            map[cid][month] = (map[cid][month] || 0) + (r.revenue_net || 0);
          }
          setPrevYearRevenue(map);
        }).catch(() => {})
        .finally(() => setIsLoadingData(false));
    } else {
      setIsLoadingData(false);
    }
  }, [tenantId, selectedSeasonId, seasons, tenantCanalIds]);

  // ── Derived: active canals with months ─────────────────────────────────────
  const selectedSeason = useMemo(
    () => seasons.find(s => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );

  const activeCanals = useMemo(() => {
    const activeCids = new Set(tenantCanalIds);
    return canalConfigs
      .filter(cc => activeCids.has(cc.canal_id))
      .map(cc => {
        const def    = TODOS_CANAIS.find(c => c.id === cc.canal_id);
        const mesFim = cc.mes_fim ?? selectedSeason?.mesFim ?? "";
        const months = generateMonthRange(cc.mes_inicio, mesFim);
        return {
          id: cc.canal_id,
          name: def?.name ?? cc.canal_id,
          color: def?.color ?? "#7598CF",
          prevColor: def?.prevColor ?? "#7598CF55",
          months,
        };
      });
  }, [canalConfigs, tenantCanalIds, selectedSeason]);

  const consolidatedMonths = useMemo(() => {
    if (!activeCanals.length) return [];
    const allMonths = new Set(activeCanals.flatMap(c => c.months));
    const anchor    = activeCanals[0].months[0] ?? "Janeiro";
    const startIdx  = MONTHS_FULL.indexOf(anchor);
    const ordered   = [
      ...MONTHS_FULL.slice(startIdx),
      ...MONTHS_FULL.slice(0, startIdx),
    ];
    return ordered.filter(m => allMonths.has(m));
  }, [activeCanals]);

  // ── Inicializa matrix Divisão × Mês quando temporada ou dados históricos mudam ──
  // Roda somente uma vez por temporada (divInitializedFor garante idempotência).
  useEffect(() => {
    if (!tenantId || !selectedSeasonId || !consolidatedMonths.length) return;
    if (divInitializedFor === selectedSeasonId) return; // já inicializado para esta temporada

    initModule3Scenarios(tenantId, selectedSeasonId)
      .then(() => {
        const m3Scenarios = listModule3Scenarios(selectedSeasonId);
        const active = m3Scenarios.find(s => s.isActive) ?? m3Scenarios[0] ?? null;

        // Participações M3 por divisão
        const pcts: Record<string, number> = {};
        const pmvByDiv: Record<string, number> = {};
        if (active?.divisions) {
          for (const [divId, block] of Object.entries(active.divisions)) {
            pcts[divId]    = (block as any).participation ?? 0;
            pmvByDiv[divId] = (block as any).indicators?.avgPrice ?? 0;
          }
        }

        // Fallback: proporções históricas se M3 não configurado
        if (!Object.keys(pcts).length && divSeasonality.length) {
          const totalHist = divSeasonality.reduce((s, d) => s + d.totalRevenue, 0);
          for (const d of divSeasonality) {
            pcts[d.division]    = totalHist > 0 ? (d.totalRevenue / totalHist) * 100 : 0;
            pmvByDiv[d.division] = d.pmv;
          }
        }

        if (!Object.keys(pcts).length) return; // sem dados — aguarda M3

        // Total de referência: M1 ou soma do plano Tab 1
        const totalRef = macroMeta.metaReceita > 0
          ? macroMeta.metaReceita
          : activeCanals.reduce((s, c) =>
              s + consolidatedMonths.reduce((ms, m) => ms + ((plannedRevenue[c.id] ?? {})[m] ?? 0), 0), 0);

        // Receita mensal consolidada (de Tab 1) como base de distribuição
        const consolidatedMRev: Record<string, number> = {};
        for (const month of consolidatedMonths) {
          consolidatedMRev[month] = activeCanals.reduce((s, c) =>
            s + ((plannedRevenue[c.id] ?? {})[month] ?? 0), 0);
        }

        // Se não há plano mensal ainda, distribui igualmente
        const sumMRev = Object.values(consolidatedMRev).reduce((s, v) => s + v, 0);
        if (sumMRev === 0) {
          const each = totalRef / Math.max(consolidatedMonths.length, 1);
          for (const m of consolidatedMonths) consolidatedMRev[m] = each;
        }

        setDivM3Pcts(pcts);
        setDivPmv(pmvByDiv);

        const matrix = buildDivisionMonthRevenue(
          consolidatedMRev,
          divSeasonality.length ? divSeasonality : [],
          pcts,
          consolidatedMonths,
        );
        setDivRevenue(matrix);
        setDivInitializedFor(selectedSeasonId);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedSeasonId, consolidatedMonths, divSeasonality, macroMeta.metaReceita]);

  // ── Initialize planned revenue when canal config loads ─────────────────────
  useEffect(() => {
    if (!activeCanals.length) return;
    setPlannedRevenue(prev => {
      const next = { ...prev };
      for (const c of activeCanals) {
        if (!next[c.id]) next[c.id] = {};
        for (const m of c.months) {
          if (next[c.id][m] === undefined) next[c.id][m] = 0;
        }
      }
      return next;
    });
    setCoverageTarget(prev => {
      const next = { ...prev };
      for (const m of consolidatedMonths) {
        if (next[m] === undefined) next[m] = 90;
      }
      return next;
    });
  }, [activeCanals, consolidatedMonths]);

  // ── Bottom-up engine ────────────────────────────────────────────────────────
  const canalCalcResults = useMemo((): CanalCalcResult[] => {
    return activeCanals.map(canal => {
      const pmv     = avgPmv[canal.id] || 65;
      const cRevMap = plannedRevenue[canal.id] || {};
      const prevMap = prevYearRevenue[canal.id] || {};
      const months  = computeCanalCalc(
        canal.months, cRevMap, prevMap,
        pmv, avgCost, coverageTarget, estoqueColeçãoPassada,
      );
      return {
        canalId: canal.id, canalName: canal.name,
        color: canal.color, prevColor: canal.prevColor,
        months, pmv,
        totalReceita:      months.reduce((s, m) => s + m.receita, 0),
        totalEntrada:      months.reduce((s, m) => s + m.entrada, 0),
        totalCustoEntrada: months.reduce((s, m) => s + m.custoEntrada, 0),
      };
    });
  }, [activeCanals, plannedRevenue, prevYearRevenue, avgPmv, avgCost, coverageTarget, estoqueColeçãoPassada]);

  const totalPlanned = useMemo(
    () => canalCalcResults.reduce((s, c) => s + c.totalReceita, 0),
    [canalCalcResults],
  );
  const totalEntradaGeral = useMemo(
    () => canalCalcResults.reduce((s, c) => s + c.totalEntrada, 0),
    [canalCalcResults],
  );
  const totalCustoGeral = useMemo(
    () => canalCalcResults.reduce((s, c) => s + c.totalCustoEntrada, 0),
    [canalCalcResults],
  );

  const divergence    = totalPlanned - macroMeta.metaReceita;
  const divergencePct = macroMeta.metaReceita > 0 ? (divergence / macroMeta.metaReceita) * 100 : 0;
  const hasDivergence = macroMeta.metaReceita > 0 && Math.abs(divergence) > 500;

  const avgCoverage = useMemo(() => {
    const all = canalCalcResults.flatMap(c => c.months.map(m => m.coberturaReal)).filter(v => v > 0);
    return all.length ? Math.round(all.reduce((s, v) => s + v, 0) / all.length) : 0;
  }, [canalCalcResults]);

  const consolidatedChartData = useMemo(() =>
    consolidatedMonths.map(month => {
      const row: any = { month: SHORT_MONTH[month] || month.slice(0,3) };
      for (const c of canalCalcResults) {
        const m = c.months.find(x => x.month === month);
        row[c.canalName] = m?.receita ?? 0;
      }
      return row;
    }),
    [consolidatedMonths, canalCalcResults],
  );

  const activeCanalResult = useMemo(
    () => canalCalcResults.find(c => c.canalId === channelView) ?? null,
    [canalCalcResults, channelView],
  );

  // ── Tab 3: peças por divisão × mês ───────────────────────────────────────────
  const divPieces = useMemo<Record<string, Record<string, number>>>(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const [divId, monthMap] of Object.entries(divRevenue)) {
      result[divId] = {};
      const pmv = divPmv[divId] ?? 0;
      for (const [month, rev] of Object.entries(monthMap)) {
        result[divId][month] = pmv > 0 ? Math.round(rev / pmv) : 0;
      }
    }
    return result;
  }, [divRevenue, divPmv]);

  // Totais por divisão (soma de todos os meses)
  const divTotals = useMemo<Record<string, { revenue: number; pieces: number }>>(() => {
    const result: Record<string, { revenue: number; pieces: number }> = {};
    for (const divId of Object.keys(divRevenue)) {
      const rev = Object.values(divRevenue[divId] ?? {}).reduce((s, v) => s + v, 0);
      const pcs = Object.values(divPieces[divId] ?? {}).reduce((s, v) => s + v, 0);
      result[divId] = { revenue: rev, pieces: pcs };
    }
    return result;
  }, [divRevenue, divPieces]);

  // Handler de edição bi-proporcional: mantém total da divisão inalterado
  const handleDivRevenueChange = useCallback((divId: string, month: string, raw: string) => {
    const newValue = Math.max(0, parseFloat(raw.replace(/[^\d.]/g, "")) || 0);
    const profile  = divSeasonality.find(p => p.division === divId);
    const histWeights = profile?.monthlyPcts ?? {};
    setDivRevenue(prev => applyBiproportional(prev, divId, month, newValue, histWeights));
  }, [divSeasonality]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRevenueChange = useCallback((canalId: string, month: string, raw: string) => {
    const val = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
    setPlannedRevenue(prev => ({
      ...prev,
      [canalId]: { ...(prev[canalId] ?? {}), [month]: val },
    }));
  }, []);

  const handleCoverageChange = useCallback((month: string, raw: string) => {
    const val = Math.max(1, parseInt(raw.replace(/[^\d]/g, "")) || 90);
    setCoverageTarget(prev => ({ ...prev, [month]: val }));
  }, []);

  const handleSaveScenario = () => {
    if (!savingName.trim()) return;
    const localId = `s-${Date.now()}`;
    const s: Scenario = {
      id: localId, name: savingName.trim(),
      timestamp: new Date().toLocaleString("pt-BR"),
      seasonId: selectedSeasonId,
      plannedRevenue: JSON.parse(JSON.stringify(plannedRevenue)),
      coverageTarget: { ...coverageTarget },
      estoqueColeçãoPassada,
      totalPlanned,
      avgCoverage,
      divisionMonthPlan: Object.keys(divRevenue).length > 0
        ? JSON.parse(JSON.stringify(divRevenue))
        : undefined,
    };
    setScenarios(prev => [...prev, s]);
    setSavingName(""); setShowSaveForm(false);

    if (tenantId) {
      const year = new Date().getFullYear();
      getCycle(tenantId, year).then(cycle => {
        if (!cycle) return;
        return (supabase as any)
          .from("planning_scenarios")
          .insert({
            tenant_id: tenantId, cycle_id: cycle.id,
            name: s.name, version: scenarios.length + 1,
            values: {
              seasonId: s.seasonId,
              plannedRevenue: s.plannedRevenue,
              coverageTarget: s.coverageTarget,
              estoqueColeçãoPassada: s.estoqueColeçãoPassada,
              totalPlanned: s.totalPlanned,
              avgCoverage: s.avgCoverage,
              divisionMonthPlan: s.divisionMonthPlan ?? null,
            },
            is_applied: false,
          })
          .select().single()
          .then(({ data }: any) => {
            if (data?.id) {
              setScenarios(prev => prev.map(sc => sc.id === localId ? { ...sc, id: data.id } : sc));
            }
          });
      }).catch(() => {});
    }
  };

  const handleApplyScenario = (id: string) => {
    const s = scenarios.find(sc => sc.id === id);
    if (!s) return;
    setPlannedRevenue(JSON.parse(JSON.stringify(s.plannedRevenue)));
    setCoverageTarget({ ...s.coverageTarget });
    setEstoqueColeçãoPassada(s.estoqueColeçãoPassada);
    if (s.seasonId) setSelectedSeasonId(s.seasonId);
    setAppliedScenarioId(id);
    // Restaura plano de divisão mensal do M4 Tab 3 (se existir no cenário)
    if (s.divisionMonthPlan && Object.keys(s.divisionMonthPlan).length > 0) {
      setDivRevenue(s.divisionMonthPlan);
      if (s.seasonId) setDivInitializedFor(s.seasonId);
    }
  };

  const handleCompare = () => {
    if (scenarios.length < 2) return;
    setCompareIds([scenarios[0].id, scenarios[scenarios.length - 1].id]);
    setCompareModal(true);
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    await exportToPDF({ elementId: "cycle-scenarios-pdf", fileName: "cenarios_validacao_ciclo", title: "Cenários — Sazonalidade" });
    setIsExportingPDF(false);
  };

  const handleApplyMetas = () => {
    if (appliedScenarioId) return;
    const latest = scenarios.length > 0 ? scenarios[scenarios.length - 1] : null;
    if (latest) handleApplyScenario(latest.id);
    setShowPostApplyModal(true);
  };

  const impactedMacroCV: ImpactedIndicator[] = (() => {
    if (!macroMeta.metaReceita || !hasDivergence) return [];
    return [{
      key: "receitaTotal", label: "Receita Total (ciclo)",
      planned: macroMeta.metaReceita, projected: totalPlanned,
      gap: totalPlanned - macroMeta.metaReceita, isRate: false,
    }];
  })();

  const handleSubmitApprovalCV = async () => {
    if (!tenantId || !user) return;
    setIsSubmittingApproval(true);
    try {
      const appliedSc = scenarios.find(s => s.id === appliedScenarioId) ?? scenarios[scenarios.length - 1] ?? null;
      await createApprovalRequest({
        tenantId, year: new Date().getFullYear(),
        fromModule: 4, toModule: 2,
        requesterEmail: user.email,
        justification: approvalJustification,
        proposedData: { totalPlanned, divergence, divergencePct, avgCoverage },
        originalData: { metaReceita: macroMeta.metaReceita, margemMeta: macroMeta.margemMeta },
        impactedIndicators: impactedMacroCV,
        scenarioId: appliedSc?.id,
      });
      setAlreadyPending(true);
      setShowSubmitApprovalDialog(false);
      setApprovalJustification("");
    } catch { /* silent */ }
    setIsSubmittingApproval(false);
  };

  if (!user) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {tour.isOpen && <ProductTour steps={CYCLE_VALIDATION_TOUR} onClose={tour.dismiss} />}

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div id="tour-cv-header">
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Módulo 4</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Validação de Sazonalidade</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button onClick={tour.reopen} className="p-2 text-[#F6F3AA]/50 hover:text-[#F6F3AA] transition-colors" title="Ver tour">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }} className="text-[#F6F3AA] hover:opacity-80">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 pt-8 pb-12 space-y-5">

        {/* ── Cycle selector ── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="max-w-xs flex-1">
              <label className="block text-[#28071C]/60 text-xs uppercase tracking-widest mb-2">Temporada Alvo</label>
              <select
                value={selectedSeasonId}
                onChange={e => setSelectedSeasonId(e.target.value)}
                className="w-full bg-white rounded-xl px-4 py-2.5 text-[#28071C] text-sm border-2 border-[#7598CF] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 cursor-pointer"
              >
                <option value="">Selecione uma temporada</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nome} {s.mesInicio && s.mesFim ? `(${SHORT_MONTH[s.mesInicio]} → ${SHORT_MONTH[s.mesFim]})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedSeason && (
              <div className="flex items-center gap-4 text-xs text-[#28071C]/60">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#7598CF]" />
                  {activeCanals.length} {activeCanals.length === 1 ? "canal" : "canais"}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#9B8CD8]" />
                  {consolidatedMonths.length} meses no ciclo consolidado
                </span>
                {isLoadingData && (
                  <span className="flex items-center gap-1.5 text-[#7598CF]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Carregando dados…
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedSeasonId && activeCanals.length > 0 && (
          <>
            {/* ── Sticky Indicators ── */}
            <div id="tour-cv-indicators" className="sticky top-16 z-40">
              <div className="bg-[#28071C] rounded-2xl px-6 py-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white/80 text-xs uppercase tracking-widest">
                    Indicadores do Ciclo · {selectedSeason?.nome}
                  </h3>
                  <Badge className="text-xs bg-[#7598CF]/30 text-[#7598CF] border-[#7598CF]/40">
                    {macroMeta.metaReceita > 0 ? "Plano Macro" : "Sem plano macro"}
                  </Badge>
                </div>
                <div className="grid grid-cols-5 gap-4 divide-x divide-white/10">
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#F6F3AA]">{fmtR(totalPlanned)}</div>
                    <div className="text-xs text-white/60 mt-1">Receita Planejada</div>
                    {macroMeta.metaReceita > 0 && (
                      <div className={`text-xs mt-1 font-medium ${hasDivergence ? divergence > 0 ? "text-green-400" : "text-red-400" : "text-green-400"}`}>
                        {hasDivergence ? `${divergence > 0 ? "+" : ""}${fmtR(divergence)} vs meta` : "✓ Alinhado"}
                      </div>
                    )}
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{fmtN(totalEntradaGeral)}</div>
                    <div className="text-xs text-white/60 mt-1">Total Entrada (pçs)</div>
                    <div className="text-xs text-white/40 mt-0.5">{fmtR(totalCustoGeral)} em custo</div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{avgCoverage}</div>
                    <div className="text-xs text-white/60 mt-1">Cobertura Média (dias)</div>
                    <div className={`text-xs mt-0.5 ${avgCoverage < 60 ? "text-red-400" : avgCoverage > 150 ? "text-yellow-400" : "text-green-400"}`}>
                      {avgCoverage < 60 ? "⚠ Baixa" : avgCoverage > 150 ? "⚠ Elevada" : "✓ Adequada"}
                    </div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{estoqueColeçãoPassada.toLocaleString("pt-BR")}</div>
                    <div className="text-xs text-white/60 mt-1">Est. Coleção Passada (pçs)</div>
                  </div>
                  <div className="text-center pl-4">
                    <div className="text-xl font-bold text-white">{activeCanals.length}</div>
                    <div className="text-xs text-white/60 mt-1">Canais no Ciclo</div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {activeCanals.map(c => c.name.split(" ")[0]).join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Module tab bar ── */}
            <div className="flex items-center gap-1 bg-white/60 backdrop-blur-sm rounded-2xl p-1.5 shadow-sm">
              {(
                [
                  { key: "curva"    as const, label: "1 · Curva de Receita" },
                  { key: "orcamento" as const, label: "2 · Orçamento de Abastecimento" },
                  { key: "divisao"  as const, label: "3 · Plano por Divisão" },
                ]
              ).map(tab => (
                <button key={tab.key} onClick={() => setActiveModuleView(tab.key)}
                  className={`flex-1 py-2 px-5 rounded-xl text-sm font-semibold transition-all ${activeModuleView === tab.key ? "bg-[#28071C] text-white shadow" : "text-[#28071C]/50 hover:text-[#28071C] hover:bg-[#28071C]/5"}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── VIEW: CURVA DE RECEITA ── */}
            {activeModuleView === "curva" && (<>

              {/* Config: estoque passado + PMV info */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-[#28071C]/8">
                <div className="flex items-center gap-6 flex-wrap">
                  <div>
                    <label className="block text-[#28071C]/60 text-xs uppercase tracking-widest mb-1.5">
                      Estoque Coleção Passada no Início do Ciclo (pçs)
                    </label>
                    <input
                      type="number" min={0}
                      value={estoqueColeçãoPassada}
                      onChange={e => setEstoqueColeçãoPassada(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-36 border-2 border-[#7598CF]/40 rounded-xl px-3 py-2 text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]"
                    />
                  </div>
                  <div className="text-xs text-[#28071C]/50 flex flex-col gap-1">
                    <span className="font-medium text-[#28071C]/70 uppercase tracking-widest text-[10px]">PMV por Canal</span>
                    <div className="flex flex-wrap gap-3">
                      {activeCanals.map(c => (
                        <span key={c.id} className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name.split(" ")[0]}: <strong className="text-[#28071C]/80">{fmtR(avgPmv[c.id] || 65)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-[#28071C]/50 flex flex-col gap-1">
                    <span className="font-medium text-[#28071C]/70 uppercase tracking-widest text-[10px]">Custo Médio / Pç</span>
                    <strong className="text-[#28071C]/80 text-sm">{fmtR(avgCost)}</strong>
                  </div>
                </div>
              </div>

              {/* ── Canal tabs ── */}
              <div id="tour-cv-revenue" className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
                <div className="border-t-4 border-[#7598CF] px-6 pt-5 pb-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <h3 className="text-[#28071C] font-semibold text-base">Curva de Vendas por Canal</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setChannelView("Consolidado")}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${channelView === "Consolidado" ? "bg-[#28071C] text-white shadow" : "bg-white text-[#28071C] hover:bg-[#28071C]/10 border border-[#28071C]/20"}`}
                      >
                        Consolidado
                      </button>
                      {activeCanals.map(c => (
                        <button key={c.id} onClick={() => setChannelView(c.id)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${channelView === c.id ? "text-white shadow" : "bg-white text-[#28071C] hover:bg-[#28071C]/10 border border-[#28071C]/20"}`}
                          style={channelView === c.id ? { backgroundColor: c.color } : {}}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Consolidado ── */}
                  {channelView === "Consolidado" && (
                    <>
                      <div className="bg-white rounded-xl p-4 mb-4">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={consolidatedChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                            <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 12 }} />
                            <YAxis tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                            <ReTooltip content={<ChartTooltip />} />
                            <Legend />
                            {macroMeta.metaReceita > 0 && (
                              <ReferenceLine y={macroMeta.metaReceita / consolidatedMonths.length} stroke="#28071C" strokeDasharray="5 5"
                                label={{ value: "Média Meta", position: "right", fill: "#28071C", fontSize: 10 }} />
                            )}
                            {canalCalcResults.map(c => (
                              <Bar key={c.canalId} dataKey={c.canalName} fill={c.color} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                        {consolidatedMonths.map(month => {
                          const total     = canalCalcResults.reduce((s, c) => s + (c.months.find(m => m.month === month)?.receita ?? 0), 0);
                          const prevTotal = canalCalcResults.reduce((s, c) => s + (c.months.find(m => m.month === month)?.prevReceita ?? 0), 0);
                          const diff = total - prevTotal;
                          return (
                            <div key={month} className="flex-1 min-w-[80px] text-center bg-[#28071C]/5 rounded-lg p-2">
                              <div className="text-xs text-[#28071C]/50 font-medium">{SHORT_MONTH[month]}</div>
                              <div className="text-sm font-bold text-[#28071C] mt-0.5">{fmtR(total)}</div>
                              {prevTotal > 0 && (
                                <div className={`text-xs mt-0.5 ${diff >= 0 ? "text-green-600" : "text-red-500"}`}>
                                  {diff >= 0 ? "+" : ""}{fmtR(diff)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="min-w-[90px] text-center bg-[#28071C] rounded-lg p-2">
                          <div className="text-xs text-white/60">Total</div>
                          <div className="text-sm font-bold text-[#F6F3AA] mt-0.5">{fmtR(totalPlanned)}</div>
                          {macroMeta.metaReceita > 0 && (
                            <div className={`text-xs mt-0.5 font-medium ${hasDivergence ? divergence > 0 ? "text-green-400" : "text-red-400" : "text-green-400"}`}>
                              {hasDivergence ? `${divergence > 0 ? "+" : ""}${fmtR(divergence)}` : "✓ Meta"}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Individual canal ── */}
                  {activeCanalResult && channelView !== "Consolidado" && (
                    <>
                      <div className="bg-white rounded-xl p-4 mb-4">
                        <ResponsiveContainer width="100%" height={260}>
                          <ComposedChart
                            data={activeCanalResult.months.map(m => ({
                              month: m.shortMonth,
                              Planejado: m.receita,
                              "Ano Anterior": m.prevReceita,
                            }))}
                            margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                            <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 12 }} />
                            <YAxis tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                            <ReTooltip content={<ChartTooltip />} />
                            <Legend />
                            <Bar dataKey="Planejado" fill={activeCanalResult.color} radius={[4,4,0,0]} />
                            <Bar dataKey="Ano Anterior" fill={activeCanalResult.prevColor} radius={[4,4,0,0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-[#28071C]/20">
                              <th className="text-left py-2 px-3 text-[#28071C]/60 font-medium text-xs w-40">Métrica</th>
                              {activeCanalResult.months.map(m => (
                                <th key={m.month} className="text-center py-2 px-2 text-[#28071C]/60 font-medium text-xs">{m.shortMonth}</th>
                              ))}
                              <th className="text-center py-2 px-3 text-[#28071C]/60 font-medium text-xs">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Receita — editable */}
                            <tr className="border-b border-[#28071C]/10">
                              <td className="py-2 px-3 text-[#28071C] font-medium text-xs">Receita (R$)</td>
                              {activeCanalResult.months.map(m => (
                                <td key={m.month} className="py-1.5 px-1 text-center">
                                  <input
                                    type="text"
                                    value={(m.receita / 1000).toFixed(0)}
                                    onChange={e => handleRevenueChange(channelView, m.month, `${e.target.value}000`)}
                                    className="w-full text-center text-xs border border-[#7598CF]/40 rounded-lg py-1.5 px-1 bg-[#7598CF]/5 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 text-[#28071C] font-medium"
                                    style={{ maxWidth: 70 }}
                                  />
                                  <div className="text-[10px] text-[#28071C]/40 mt-0.5">mil R$</div>
                                </td>
                              ))}
                              <td className="py-2 px-3 text-center font-bold text-[#28071C] text-xs">{fmtR(activeCanalResult.totalReceita)}</td>
                            </tr>
                            {/* Ano anterior — read-only */}
                            <tr className="border-b border-[#28071C]/10 bg-[#28071C]/3">
                              <td className="py-2 px-3 text-[#28071C]/50 text-xs italic">Ano Anterior</td>
                              {activeCanalResult.months.map(m => (
                                <td key={m.month} className="py-2 px-2 text-center text-xs text-[#28071C]/50 italic">
                                  {m.prevReceita > 0 ? fmtR(m.prevReceita) : "—"}
                                </td>
                              ))}
                              <td className="py-2 px-3 text-center text-xs text-[#28071C]/50 italic">
                                {fmtR(activeCanalResult.months.reduce((s, m) => s + m.prevReceita, 0))}
                              </td>
                            </tr>
                            {/* Delta */}
                            <tr className="border-b-2 border-[#28071C]/20">
                              <td className="py-2 px-3 text-[#28071C]/50 text-xs">Δ vs Ant.</td>
                              {activeCanalResult.months.map(m => {
                                const diff = m.receita - m.prevReceita;
                                return (
                                  <td key={m.month} className={`py-2 px-2 text-center text-xs font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-[#28071C]/40"}`}>
                                    {m.prevReceita > 0 && diff !== 0 ? `${diff > 0 ? "+" : ""}${(diff / 1000).toFixed(0)}k` : "—"}
                                  </td>
                                );
                              })}
                              <td />
                            </tr>

                            {/* Motor bottom-up section header */}
                            <tr className="border-b border-[#28071C]/10 bg-[#7598CF]/5">
                              <td className="py-2 px-3 text-[#28071C]/60 text-xs font-semibold" colSpan={activeCanalResult.months.length + 2}>
                                ↓ Motor Bottom-up · PMV {fmtR(activeCanalResult.pmv)}
                              </td>
                            </tr>
                            {/* Peças a vender */}
                            <tr className="border-b border-[#28071C]/10">
                              <td className="py-2 px-3 text-[#28071C]/70 text-xs">Peças a Vender</td>
                              {activeCanalResult.months.map(m => (
                                <td key={m.month} className="py-2 px-2 text-center text-xs text-[#28071C]/70">{fmtN(m.pecasVender)}</td>
                              ))}
                              <td className="py-2 px-3 text-center text-xs text-[#28071C]/70 font-medium">
                                {fmtN(activeCanalResult.months.reduce((s, m) => s + m.pecasVender, 0))}
                              </td>
                            </tr>
                            {/* Coverage target — editable */}
                            <tr className="border-b border-[#28071C]/10 bg-[#F6F3AA]/20">
                              <td className="py-2 px-3 text-[#28071C] font-medium text-xs">Meta Cobertura (dias)</td>
                              {activeCanalResult.months.map(m => (
                                <td key={m.month} className="py-1.5 px-1 text-center">
                                  <input
                                    type="text"
                                    value={m.coberturaTarget}
                                    onChange={e => handleCoverageChange(m.month, e.target.value)}
                                    className="w-full text-center text-xs border border-[#F6F3AA] rounded-lg py-1.5 px-1 bg-[#F6F3AA]/40 focus:outline-none focus:ring-2 focus:ring-[#F6F3AA] text-[#28071C] font-medium"
                                    style={{ maxWidth: 70 }}
                                  />
                                </td>
                              ))}
                              <td className="py-2 px-3 text-center text-xs text-[#28071C]/60">—</td>
                            </tr>
                            {/* Entrada — calculated, read-only */}
                            <tr className="border-b border-[#28071C]/10 bg-[#9B8CD8]/8">
                              <td className="py-2 px-3 text-[#28071C] font-semibold text-xs">Entrada (pçs) ⚡</td>
                              {activeCanalResult.months.map(m => (
                                <td key={m.month} className="py-2 px-2 text-center text-xs font-bold" style={{ color: "#9B8CD8" }}>
                                  {m.entrada > 0 ? fmtN(m.entrada) : "—"}
                                </td>
                              ))}
                              <td className="py-2 px-3 text-center text-xs font-bold" style={{ color: "#9B8CD8" }}>
                                {fmtN(activeCanalResult.totalEntrada)}
                              </td>
                            </tr>
                            {/* Custo entrada */}
                            <tr className="border-b border-[#28071C]/10">
                              <td className="py-2 px-3 text-[#28071C]/70 text-xs">Custo Entrada (R$)</td>
                              {activeCanalResult.months.map(m => (
                                <td key={m.month} className="py-2 px-2 text-center text-xs text-[#28071C]/70">
                                  {m.custoEntrada > 0 ? fmtR(m.custoEntrada) : "—"}
                                </td>
                              ))}
                              <td className="py-2 px-3 text-center text-xs text-[#28071C]/70 font-medium">
                                {fmtR(activeCanalResult.totalCustoEntrada)}
                              </td>
                            </tr>

                            {/* Toggle details */}
                            <tr>
                              <td colSpan={activeCanalResult.months.length + 2} className="py-2 px-3">
                                <button onClick={() => setShowDetails(v => !v)}
                                  className="text-xs text-[#7598CF] hover:underline flex items-center gap-1">
                                  {showDetails ? "▲ Ocultar detalhes de estoque" : "▼ Ver detalhes de estoque"}
                                </button>
                              </td>
                            </tr>

                            {showDetails && (<>
                              <tr className="border-b border-[#28071C]/10 bg-[#28071C]/3">
                                <td className="py-2 px-3 text-[#28071C]/50 text-xs italic">Estoque Início</td>
                                {activeCanalResult.months.map(m => (
                                  <td key={m.month} className="py-2 px-2 text-center text-xs text-[#28071C]/50 italic">{fmtN(m.estoqueInicio)}</td>
                                ))}
                                <td />
                              </tr>
                              <tr className="border-b border-[#28071C]/10 bg-[#28071C]/3">
                                <td className="py-2 px-3 text-[#28071C]/50 text-xs italic">Estoque Fim</td>
                                {activeCanalResult.months.map(m => (
                                  <td key={m.month} className="py-2 px-2 text-center text-xs text-[#28071C]/50 italic">{fmtN(m.estoqueFim)}</td>
                                ))}
                                <td />
                              </tr>
                              <tr className="bg-[#28071C]/3">
                                <td className="py-2 px-3 text-[#28071C]/50 text-xs italic">Cobertura Real (dias)</td>
                                {activeCanalResult.months.map(m => (
                                  <td key={m.month} className={`py-2 px-2 text-center text-xs font-medium italic ${m.coberturaReal < 45 ? "text-red-500" : m.coberturaReal > 180 ? "text-yellow-600" : "text-green-600"}`}>
                                    {m.coberturaReal}d
                                  </td>
                                ))}
                                <td />
                              </tr>
                            </>)}
                          </tbody>
                        </table>
                      </div>

                      {/* Coverage mini-cards */}
                      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${activeCanalResult.months.length}, 1fr)` }}>
                        {activeCanalResult.months.map(m => (
                          <div key={m.month} className={`rounded-xl p-2 text-center border ${m.coberturaReal < 45 ? "bg-red-50 border-red-200" : m.coberturaReal > 180 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
                            <div className="text-[10px] text-[#28071C]/60">{m.shortMonth}</div>
                            <div className={`text-lg font-bold ${m.coberturaReal < 45 ? "text-red-600" : m.coberturaReal > 180 ? "text-yellow-600" : "text-green-700"}`}>
                              {m.coberturaReal}
                            </div>
                            <div className="text-[10px] text-[#28071C]/40">dias</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Entry curve summary ── */}
              <div id="tour-cv-entry" className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
                <div className="border-t-4 border-[#9B8CD8] px-6 pt-5 pb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-[#28071C] font-semibold text-base">Curva de Entrada de Mercadoria</h3>
                    <span className="text-xs bg-[#9B8CD8]/15 text-[#9B8CD8] px-2 py-0.5 rounded-full font-medium">Calculada automaticamente</span>
                  </div>
                  <p className="text-sm text-[#28071C]/60 mb-4">
                    Resultado do motor bottom-up. Para ajustar a entrada, altere a <strong>Meta de Cobertura</strong> na aba do canal ou o <strong>Estoque de Coleção Passada</strong>.
                  </p>

                  <div className="bg-white rounded-xl p-4 mb-4">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={consolidatedMonths.map(month => {
                          const row: any = { month: SHORT_MONTH[month] || month.slice(0,3) };
                          for (const c of canalCalcResults) {
                            const m = c.months.find(x => x.month === month);
                            row[c.canalName] = m?.entrada ?? 0;
                          }
                          return row;
                        })}
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#28071C15" />
                        <XAxis dataKey="month" tick={{ fill: "#28071C", fontSize: 12 }} />
                        <YAxis tick={{ fill: "#28071C", fontSize: 11 }} tickFormatter={v => fmtN(v)} />
                        <ReTooltip content={<ChartTooltip money={false} />} />
                        <Legend />
                        {canalCalcResults.map(c => (
                          <Bar key={c.canalId} dataKey={c.canalName} fill={c.color} stackId="entrada" radius={[2,2,0,0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-[#28071C]/20">
                          <th className="text-left py-2 px-3 text-[#28071C]/60 font-medium text-xs w-36">Canal</th>
                          {consolidatedMonths.map(m => (
                            <th key={m} className="text-center py-2 px-2 text-[#28071C]/60 font-medium text-xs">{SHORT_MONTH[m]}</th>
                          ))}
                          <th className="text-center py-2 px-3 text-[#28071C]/60 font-medium text-xs">Total pçs</th>
                          <th className="text-center py-2 px-3 text-[#28071C]/60 font-medium text-xs">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {canalCalcResults.map(c => (
                          <tr key={c.canalId} className="border-b border-[#28071C]/10 hover:bg-[#28071C]/3">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                                <span className="text-xs font-medium text-[#28071C]">{c.canalName}</span>
                              </div>
                            </td>
                            {consolidatedMonths.map(month => {
                              const m = c.months.find(x => x.month === month);
                              return (
                                <td key={month} className="py-2 px-2 text-center text-xs font-medium" style={{ color: m?.entrada ? c.color : "#28071C30" }}>
                                  {m?.entrada ? fmtN(m.entrada) : "—"}
                                </td>
                              );
                            })}
                            <td className="py-2 px-3 text-center text-xs font-bold text-[#28071C]">{fmtN(c.totalEntrada)}</td>
                            <td className="py-2 px-3 text-center text-xs text-[#28071C]/70">{fmtR(c.totalCustoEntrada)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-[#28071C]/20 bg-[#28071C]/5">
                          <td className="py-2.5 px-3 text-xs font-bold text-[#28071C] uppercase tracking-wider">Total</td>
                          {consolidatedMonths.map(month => {
                            const total = canalCalcResults.reduce((s, c) => s + (c.months.find(m => m.month === month)?.entrada ?? 0), 0);
                            return (
                              <td key={month} className="py-2.5 px-2 text-center text-xs font-bold text-[#28071C]">
                                {total > 0 ? fmtN(total) : "—"}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-center text-xs font-bold text-[#28071C]">{fmtN(totalEntradaGeral)}</td>
                          <td className="py-2.5 px-3 text-center text-xs font-bold text-[#28071C]">{fmtR(totalCustoGeral)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── Scenarios ── */}
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

                  {showSaveForm && (
                    <div className="flex items-center gap-3 mb-4 p-3 bg-[#7598CF]/10 rounded-xl border border-[#7598CF]/30">
                      <input
                        type="text" value={savingName}
                        onChange={e => setSavingName(e.target.value)}
                        placeholder="Nome do cenário (ex: Otimista, Conservador…)"
                        className="flex-1 px-4 py-2 rounded-lg border border-[#7598CF]/40 text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                      />
                      <button onClick={handleSaveScenario} disabled={!savingName.trim()}
                        className="px-4 py-2 bg-[#28071C] text-white rounded-lg text-sm font-medium hover:bg-[#28071C]/90 disabled:opacity-40">
                        Confirmar
                      </button>
                      <button onClick={() => setShowSaveForm(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}

                  {scenarios.length === 0 ? (
                    <div className="text-center py-8 text-[#28071C]/40 text-sm">
                      Nenhum cenário salvo. Faça ajustes e salve um cenário para comparar.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scenarios.map(s => {
                        const isApplied = s.id === appliedScenarioId;
                        const scenDiff  = s.totalPlanned - macroMeta.metaReceita;
                        return (
                          <div key={s.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${isApplied ? "bg-[#28071C] border-[#28071C]" : "bg-white border-[#28071C]/10 hover:border-[#7598CF]/40"}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold text-sm ${isApplied ? "text-[#F6F3AA]" : "text-[#28071C]"}`}>{s.name}</span>
                                {isApplied && <Badge className="text-xs bg-[#F6F3AA]/20 text-[#F6F3AA] border-[#F6F3AA]/30">Aplicado</Badge>}
                              </div>
                              <div className={`text-xs mt-1 ${isApplied ? "text-white/60" : "text-[#28071C]/50"}`}>Salvo em {s.timestamp}</div>
                            </div>
                            <div className="flex items-center gap-6 text-center">
                              <div>
                                <div className={`text-sm font-bold ${isApplied ? "text-white" : "text-[#28071C]"}`}>{fmtR(s.totalPlanned)}</div>
                                <div className={`text-xs ${isApplied ? "text-white/50" : "text-[#28071C]/50"}`}>Receita</div>
                              </div>
                              <div>
                                <div className={`text-sm font-bold ${isApplied ? "text-white" : "text-[#28071C]"}`}>{Math.round(s.avgCoverage)} dias</div>
                                <div className={`text-xs ${isApplied ? "text-white/50" : "text-[#28071C]/50"}`}>Cobertura</div>
                              </div>
                              {macroMeta.metaReceita > 0 && (
                                <div>
                                  <div className={`text-sm font-medium ${Math.abs(scenDiff) < 500 ? "text-green-500" : scenDiff > 0 ? "text-green-600" : "text-red-500"}`}>
                                    {Math.abs(scenDiff) < 500 ? "✓" : scenDiff > 0 ? "+" : ""}{fmtR(scenDiff)}
                                  </div>
                                  <div className={`text-xs ${isApplied ? "text-white/50" : "text-[#28071C]/50"}`}>vs Meta</div>
                                </div>
                              )}
                            </div>
                            {!isApplied && (
                              <button onClick={() => handleApplyScenario(s.id)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-lg text-xs font-medium hover:bg-[#28071C]/80 transition-all">
                                <Check className="w-3 h-3" />Aplicar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {appliedScenarioId && (
                    <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                      <Check className="w-4 h-4 text-green-600" />
                      Cenário aplicado com sucesso.
                    </div>
                  )}
                </div>
              </div>

            </>)}

            {/* ── Orçamento view ── */}
            {activeModuleView === "orcamento" && (
              <OrcamentoAbastecimentoView
                plannedRevenue={canalCalcResults.map(c => ({
                  month: c.canalId,
                  atacado:   c.canalId === "atacado"   ? c.totalReceita : 0,
                  varejo:    c.canalId === "varejo"    ? c.totalReceita : 0,
                  ecommerce: c.canalId === "ecommerce" ? c.totalReceita : 0,
                }))}
                supplyFornecedores={supplyFornecedores}
                margemPct={margemOrc}
                onMargemChange={setMargemOrc}
              />
            )}
      {/* ──────────────────────────────────────────────────────────────────────
          VIEW 3: PLANO POR DIVISÃO
          Matrix Division × Mês com calibração bi-proporcional.
          Fonte: M1 (total da coleção) × M3 (participação por divisão) × histórico (sazonalidade mensal)
      ─────────────────────────────────────────────────────────────────────── */}
      {activeModuleView === "divisao" && (() => {
        const divIds    = Object.keys(divRevenue);
        const months    = consolidatedMonths;
        const hasDivs   = divIds.length > 0 && months.length > 0;

        // Rótulos legíveis por divisão
        const DIV_LABELS: Record<string, string> = {
          feminino:  "Feminino",
          masculino: "Masculino",
          acessorios: "Acessórios",
          infantil:  "Infantil",
        };
        const DIV_COLORS: Record<string, string> = {
          feminino:  "#9B8CD8",
          masculino: "#7598CF",
          acessorios: "#F0C040",
          infantil:  "#6BAE75",
        };

        // Total consolidado por mês (soma de todas as divisões)
        const monthTotalsRev: Record<string, number> = {};
        const monthTotalsPcs: Record<string, number> = {};
        for (const m of months) {
          monthTotalsRev[m] = divIds.reduce((s, d) => s + ((divRevenue[d] ?? {})[m] ?? 0), 0);
          monthTotalsPcs[m] = divIds.reduce((s, d) => s + ((divPieces[d] ?? {})[m] ?? 0), 0);
        }
        const grandTotalRev = divIds.reduce((s, d) => s + (divTotals[d]?.revenue ?? 0), 0);
        const grandTotalPcs = divIds.reduce((s, d) => s + (divTotals[d]?.pieces ?? 0), 0);

        return (
          <div className="space-y-5">
            {/* Cabeçalho informativo */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-[#28071C]/8">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#28071C]">Plano por Divisão × Mês</h3>
                  <p className="text-xs text-[#28071C]/50 mt-0.5">
                    Distribuição da coleção por divisão com sazonalidade histórica · calibração bi-proporcional
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {divLoadingSeasonality && (
                    <span className="flex items-center gap-1.5 text-xs text-[#7598CF]">
                      <Loader2 className="w-3 h-3 animate-spin" />Calculando perfis históricos…
                    </span>
                  )}
                  <div className="text-xs text-[#28071C]/50">
                    <span className="font-medium text-[#28071C]/70">Total coleção: </span>
                    <span className="font-bold text-[#28071C]">{fmtR(grandTotalRev)}</span>
                    <span className="ml-3 font-medium text-[#28071C]/70"> · </span>
                    <span className="font-bold text-[#28071C]">{grandTotalPcs.toLocaleString("pt-BR")} peças</span>
                  </div>
                </div>
              </div>
            </div>

            {!hasDivs && (
              <div className="bg-white/60 rounded-2xl p-8 text-center text-[#28071C]/40">
                {divLoadingSeasonality
                  ? "Calculando perfis históricos de sazonalidade…"
                  : "Configure as divisões no Módulo 3 e salve um cenário para visualizar o plano por divisão."
                }
              </div>
            )}

            {hasDivs && (
              <>
                {/* Cards de resumo por divisão */}
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${divIds.length}, 1fr)` }}>
                  {divIds.map(divId => {
                    const color  = DIV_COLORS[divId] ?? "#7598CF";
                    const label  = DIV_LABELS[divId] ?? divSeasonality.find(p => p.division === divId)?.label ?? divId;
                    const totRev = divTotals[divId]?.revenue ?? 0;
                    const totPcs = divTotals[divId]?.pieces ?? 0;
                    const pct    = grandTotalRev > 0 ? (totRev / grandTotalRev) * 100 : 0;
                    const m3Pct  = divM3Pcts[divId] ?? 0;
                    const pmv    = divPmv[divId] ?? 0;
                    return (
                      <div key={divId} className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-sm" style={{ borderTop: `3px solid ${color}` }}>
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-sm font-semibold text-[#28071C]">{label}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: color }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xl font-bold text-[#28071C]">{fmtR(totRev)}</div>
                        <div className="text-xs text-[#28071C]/50 mt-0.5">{totPcs.toLocaleString("pt-BR")} peças</div>
                        <div className="mt-2 pt-2 border-t border-[#28071C]/8 grid grid-cols-2 gap-1 text-[10px] text-[#28071C]/50">
                          <span>M3 target: <strong className="text-[#28071C]/70">{m3Pct.toFixed(1)}%</strong></span>
                          <span>PMV: <strong className="text-[#28071C]/70">{pmv > 0 ? fmtR(pmv) : "—"}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Matriz Division × Mês */}
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
                  <div className="border-t-4 border-[#28071C] px-6 pt-5 pb-4">
                    <h4 className="text-sm font-semibold text-[#28071C] mb-1">Receita por Divisão (R$) · edição com calibração bi-proporcional</h4>
                    <p className="text-xs text-[#28071C]/40 mb-4">Ao editar um mês, o sistema redistribui o delta entre os demais meses da mesma divisão proporcionalmente ao peso histórico.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-[#28071C]/10">
                            <th className="text-left py-2 pr-4 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider sticky left-0 bg-white/90 w-28">Divisão</th>
                            {months.map(m => (
                              <th key={m} className="text-right py-2 px-2 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider min-w-[5.5rem]">
                                {SHORT_MONTH[m] ?? m.slice(0,3)}
                              </th>
                            ))}
                            <th className="text-right py-2 pl-4 text-xs font-semibold text-[#28071C] uppercase tracking-wider border-l border-[#28071C]/10">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {divIds.map((divId, di) => {
                            const color = DIV_COLORS[divId] ?? "#7598CF";
                            const label = DIV_LABELS[divId] ?? divSeasonality.find(p => p.division === divId)?.label ?? divId;
                            const bg    = di % 2 === 0 ? "bg-transparent" : "bg-[#28071C]/2";
                            return (
                              <tr key={divId} className={`border-b border-[#28071C]/5 ${bg}`}>
                                <td className={`py-2.5 pr-4 font-semibold text-xs sticky left-0 ${bg} bg-white/80`}>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                    {label}
                                  </span>
                                </td>
                                {months.map(m => {
                                  const val = (divRevenue[divId] ?? {})[m] ?? 0;
                                  return (
                                    <td key={m} className="py-1.5 px-2 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={Math.round(val)}
                                        onChange={e => handleDivRevenueChange(divId, m, e.target.value)}
                                        className="w-20 text-right text-xs text-[#28071C] bg-transparent border border-transparent focus:border-[#7598CF] focus:outline-none focus:bg-white rounded-lg px-1.5 py-1 transition-all"
                                      />
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 pl-4 text-right font-bold text-sm text-[#28071C] border-l border-[#28071C]/10">
                                  {fmtR(divTotals[divId]?.revenue ?? 0)}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Totais por mês */}
                          <tr className="border-t-2 border-[#28071C]/20 bg-[#28071C]/4">
                            <td className="py-3 pr-4 font-bold text-xs text-[#28071C] uppercase tracking-wider sticky left-0 bg-[#28071C]/4">Total</td>
                            {months.map(m => (
                              <td key={m} className="py-3 px-2 text-right text-xs font-bold text-[#28071C]">
                                {fmtR(monthTotalsRev[m] ?? 0)}
                              </td>
                            ))}
                            <td className="py-3 pl-4 text-right font-bold text-sm text-[#28071C] border-l border-[#28071C]/10">
                              {fmtR(grandTotalRev)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Matriz de Peças por Divisão × Mês */}
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
                  <div className="border-t-4 border-[#7598CF] px-6 pt-5 pb-4">
                    <h4 className="text-sm font-semibold text-[#28071C] mb-1">Volume de Peças por Divisão</h4>
                    <p className="text-xs text-[#28071C]/40 mb-4">Cálculo reverso: Peças = Receita ÷ PMV da divisão. Concentrar faturamento em meses de PMV alto reduz o volume total de peças.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-[#28071C]/10">
                            <th className="text-left py-2 pr-4 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider sticky left-0 bg-white/90 w-28">Divisão</th>
                            {months.map(m => (
                              <th key={m} className="text-right py-2 px-2 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider min-w-[5rem]">
                                {SHORT_MONTH[m] ?? m.slice(0,3)}
                              </th>
                            ))}
                            <th className="text-right py-2 pl-4 text-xs font-semibold text-[#28071C] uppercase tracking-wider border-l border-[#28071C]/10">Total pçs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {divIds.map((divId, di) => {
                            const color = DIV_COLORS[divId] ?? "#7598CF";
                            const label = DIV_LABELS[divId] ?? divSeasonality.find(p => p.division === divId)?.label ?? divId;
                            const bg    = di % 2 === 0 ? "bg-transparent" : "bg-[#28071C]/2";
                            return (
                              <tr key={divId} className={`border-b border-[#28071C]/5 ${bg}`}>
                                <td className={`py-2.5 pr-4 font-semibold text-xs sticky left-0 ${bg} bg-white/80`}>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                    {label}
                                  </span>
                                </td>
                                {months.map(m => {
                                  const pcs = (divPieces[divId] ?? {})[m] ?? 0;
                                  return (
                                    <td key={m} className="py-2.5 px-2 text-right text-xs text-[#28071C] font-medium">
                                      {pcs > 0 ? pcs.toLocaleString("pt-BR") : <span className="text-[#28071C]/20">—</span>}
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 pl-4 text-right font-bold text-sm text-[#28071C] border-l border-[#28071C]/10">
                                  {(divTotals[divId]?.pieces ?? 0).toLocaleString("pt-BR")}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Totais */}
                          <tr className="border-t-2 border-[#28071C]/20 bg-[#28071C]/4">
                            <td className="py-3 pr-4 font-bold text-xs text-[#28071C] uppercase tracking-wider sticky left-0 bg-[#28071C]/4">Total</td>
                            {months.map(m => (
                              <td key={m} className="py-3 px-2 text-right text-xs font-bold text-[#28071C]">
                                {(monthTotalsPcs[m] ?? 0).toLocaleString("pt-BR")}
                              </td>
                            ))}
                            <td className="py-3 pl-4 text-right font-bold text-sm text-[#28071C] border-l border-[#28071C]/10">
                              {grandTotalPcs.toLocaleString("pt-BR")}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Mini bar chart — distribuição mensal consolidada */}
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm p-5">
                  <h4 className="text-sm font-semibold text-[#28071C] mb-4">Distribuição Mensal por Divisão</h4>
                  <div className="flex items-end gap-2 h-48">
                    {months.map(month => {
                      const maxMonthlTotal = Math.max(...months.map(m => monthTotalsRev[m] ?? 0), 1);
                      const monthTotal     = monthTotalsRev[month] ?? 0;
                      const barH           = (monthTotal / maxMonthlTotal) * 100;
                      return (
                        <div key={month} className="flex-1 flex flex-col items-center gap-0.5">
                          <span className="text-[9px] text-[#28071C]/40">{monthTotal > 0 ? fmtR(monthTotal) : ""}</span>
                          <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${Math.max(barH, 2)}%`, minHeight: 4 }}>
                            {divIds.map(divId => {
                              const rev   = (divRevenue[divId] ?? {})[month] ?? 0;
                              const share = monthTotal > 0 ? (rev / monthTotal) * 100 : 0;
                              const color = DIV_COLORS[divId] ?? "#7598CF";
                              return share > 0 ? (
                                <div key={divId} style={{ height: `${share}%`, background: color }} title={`${DIV_LABELS[divId] ?? divId}: ${fmtR(rev)}`} />
                              ) : null;
                            })}
                          </div>
                          <span className="text-[9px] font-semibold text-[#28071C]/60">{SHORT_MONTH[month] ?? month.slice(0,3)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Legenda */}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    {divIds.map(divId => (
                      <span key={divId} className="flex items-center gap-1.5 text-xs text-[#28071C]/60">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DIV_COLORS[divId] ?? "#7598CF" }} />
                        {DIV_LABELS[divId] ?? divId}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}
          </>
        )}

        {selectedSeasonId && activeCanals.length === 0 && !isLoadingData && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 text-center shadow-sm">
            <div className="text-4xl mb-3">⚙️</div>
            <p className="text-sm text-[#28071C]/60 mb-2 font-medium">Nenhum canal configurado para esta temporada.</p>
            <p className="text-xs text-[#28071C]/40">
              Acesse <strong>Configurações de Operação → Temporadas</strong> e configure os canais de venda para esta temporada.
            </p>
          </div>
        )}
      </main>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-30 bg-[#F2F2F2]/80 backdrop-blur-sm border-t border-[#28071C]/8 px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSaveForm(v => !v)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-sm">
              <Save className="w-4 h-4" />Salvar cenário
            </button>
            <button onClick={handleCompare} disabled={scenarios.length < 2}
              className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl text-sm font-semibold hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed transition-all">
              <GitCompare className="w-4 h-4" />Comparar
              {scenarios.length >= 2 && <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{scenarios.length}</span>}
            </button>
            <button onClick={handleExportPDF} disabled={isExportingPDF}
              className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
              <FileDown className="w-4 h-4" />{isExportingPDF ? "Gerando PDF…" : "Exportar PDF"}
            </button>
          </div>
          {impactedMacroCV.length === 0 ? (
            <button onClick={handleApplyMetas}
              disabled={scenarios.length === 0 || !!appliedScenarioId}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm">
              <CheckCheck className="w-4 h-4" />
              {appliedScenarioId ? "Metas aplicadas ✓" : "Aplicar metas"}
            </button>
          ) : (
            <button onClick={() => { if (!alreadyPending) setShowSubmitApprovalDialog(true); }}
              disabled={scenarios.length === 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${alreadyPending ? "bg-amber-100 text-amber-700 border border-amber-300 cursor-default" : "bg-[#7598CF] text-white hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"}`}>
              <SendHorizonal className="w-4 h-4" />
              {alreadyPending ? "Aguardando aprovação…" : "Submeter para Aprovação"}
            </button>
          )}
        </div>
        <p className="text-center text-[9px] text-[#28071C]/25 mt-1">
          Cenários não alteram dados oficiais até "Aplicar metas" ser acionado.
        </p>
      </div>

      {/* ── Compare modal ── */}
      {compareModal && compareIds && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/10">
              <h2 className="text-[#28071C] font-semibold text-lg">Comparação de Cenários</h2>
              <button onClick={() => setCompareModal(false)} className="text-[#28071C]/40 hover:text-[#28071C]"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-6">
                {compareIds.map(id => {
                  const s = scenarios.find(sc => sc.id === id);
                  if (!s) return null;
                  const diff = s.totalPlanned - macroMeta.metaReceita;
                  return (
                    <div key={id} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#28071C]">{s.name}</h3>
                        {s.id === appliedScenarioId && <Badge className="text-xs bg-[#28071C] text-white">Aplicado</Badge>}
                      </div>
                      <div className="text-xs text-[#28071C]/50">{s.timestamp}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#28071C]/5 rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-[#28071C]">{fmtR(s.totalPlanned)}</div>
                          <div className="text-xs text-[#28071C]/60">Receita Total</div>
                          {macroMeta.metaReceita > 0 && (
                            <div className={`text-xs mt-1 font-medium ${Math.abs(diff) < 500 ? "text-green-600" : diff > 0 ? "text-green-600" : "text-red-500"}`}>
                              {Math.abs(diff) < 500 ? "✓ Alinhado" : `${diff > 0 ? "+" : ""}${fmtR(diff)} vs Meta`}
                            </div>
                          )}
                        </div>
                        <div className={`rounded-xl p-3 text-center ${s.avgCoverage < 60 ? "bg-red-50" : s.avgCoverage > 150 ? "bg-yellow-50" : "bg-green-50"}`}>
                          <div className={`text-lg font-bold ${s.avgCoverage < 60 ? "text-red-600" : s.avgCoverage > 150 ? "text-yellow-600" : "text-green-700"}`}>
                            {Math.round(s.avgCoverage)}
                          </div>
                          <div className="text-xs text-[#28071C]/60">Cobertura Média (dias)</div>
                        </div>
                      </div>
                      <div className="bg-[#28071C]/3 rounded-xl p-3">
                        <div className="text-xs font-medium text-[#28071C]/60 mb-2">Receita por Canal</div>
                        {Object.entries(s.plannedRevenue).map(([cid, months]) => {
                          const def   = TODOS_CANAIS.find(c => c.id === cid);
                          const total = Object.values(months).reduce((a, b) => a + b, 0);
                          if (total === 0) return null;
                          return (
                            <div key={cid} className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: def?.color ?? "#7598CF" }} />
                              <span className="text-xs text-[#28071C]/60 w-24">{def?.name ?? cid}</span>
                              <span className="text-xs font-medium text-[#28071C]">{fmtR(total)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#28071C]/10 flex justify-between">
              <div className="flex gap-3">
                {compareIds.map(id => {
                  const s = scenarios.find(sc => sc.id === id);
                  return s ? (
                    <button key={id} onClick={() => { handleApplyScenario(id); setCompareModal(false); }}
                      disabled={id === appliedScenarioId}
                      className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-medium hover:bg-[#28071C]/80 disabled:opacity-40">
                      <Check className="w-4 h-4" />Aplicar "{s.name}"
                    </button>
                  ) : null;
                })}
              </div>
              <button onClick={() => setCompareModal(false)}
                className="px-4 py-2 bg-white border border-[#28071C]/20 text-[#28071C] rounded-xl text-sm hover:bg-[#28071C]/5">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF capture ── */}
      <div id="cycle-scenarios-pdf" style={{ position:"fixed", left:"-9999px", top:0, zIndex:-1, width:"1120px", padding:"28px", background:"#F2F2F2", fontFamily:"system-ui, sans-serif" }}>
        <p style={{ fontSize:"13px", fontWeight:700, color:"#28071C", marginBottom:"4px" }}>Sazonalidade</p>
        <p style={{ fontSize:"11px", color:"#28071C", opacity:0.4, marginBottom:"20px" }}>Comparação de Cenários</p>
        {scenarios.length === 0 ? (
          <p style={{ fontSize:"12px", color:"#28071C", opacity:0.5 }}>Nenhum cenário salvo.</p>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:"14px" }}>
            {scenarios.map(s => {
              const isApplied = s.id === appliedScenarioId;
              const delta     = macroMeta.metaReceita ? s.totalPlanned - macroMeta.metaReceita : 0;
              const deltaPct  = macroMeta.metaReceita ? ((delta / macroMeta.metaReceita) * 100).toFixed(1) : "—";
              return (
                <div key={s.id} style={{ flex:"1 1 220px", minWidth:"200px", maxWidth:"260px", background:"white", borderRadius:"12px", padding:"16px", borderTop:`4px solid ${isApplied ? "#7598CF" : "#28071C"}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"12px" }}>
                    <span style={{ fontSize:"13px", fontWeight:700, color:"#28071C" }}>{s.name}</span>
                    {isApplied && <span style={{ fontSize:"9px", background:"#7598CF", color:"white", borderRadius:"999px", padding:"2px 6px", fontWeight:700 }}>APLICADO</span>}
                  </div>
                  {[
                    { label:"Receita Total",   val: fmtR(s.totalPlanned) },
                    { label:"Cobertura Média", val: `${Math.round(s.avgCoverage)} dias` },
                    { label:"vs Meta",         val: macroMeta.metaReceita ? `${delta >= 0 ? "+" : ""}${deltaPct}%` : "—" },
                    { label:"Salvo em",        val: s.timestamp },
                  ].map((row, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px", padding:"5px 0", borderBottom:"1px solid #F2F2F2", fontSize:"11px", color:"#28071C" }}>
                      <span style={{ opacity:0.5 }}>{row.label}</span>
                      <span style={{ textAlign:"right", fontWeight:600 }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Post-apply modal ── */}
      {showPostApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-[#28071C] font-bold text-lg mb-1">Ciclo validado!</h2>
              <p className="text-[#28071C]/60 text-sm">A distribuição mensal foi aplicada ao plano.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={() => { setShowPostApplyModal(false); navigate("/channel-planning"); }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90">
                Voltar ao Plano por Canal (M2) <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => { setShowPostApplyModal(false); navigate("/dashboard"); }}
                className="w-full px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-[#F2F2F2]">
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approval modal ── */}
      {showSubmitApprovalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7 flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[#28071C] font-bold text-base">Submeter para Aprovação</h2>
                <p className="text-[#28071C]/50 text-xs mt-0.5">Divergência de {fmtR(Math.abs(divergence))} ({Math.abs(divergencePct).toFixed(1)}%) vs meta macro.</p>
              </div>
              <button onClick={() => setShowSubmitApprovalDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Justificativa</label>
              <textarea
                value={approvalJustification}
                onChange={e => setApprovalJustification(e.target.value)}
                placeholder="Explique por que a distribuição diverge da meta e quais ações compensarão o gap…"
                rows={3}
                className="w-full border border-[#28071C]/15 rounded-xl px-4 py-3 text-sm text-[#28071C] placeholder-[#28071C]/30 resize-none focus:outline-none focus:border-[#7598CF]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmitApprovalDialog(false)}
                className="flex-1 px-4 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-[#F2F2F2]">
                Cancelar
              </button>
              <button onClick={handleSubmitApprovalCV}
                disabled={isSubmittingApproval || !approvalJustification.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                <SendHorizonal className="w-4 h-4" />
                {isSubmittingApproval ? "Enviando…" : "Enviar para Aprovação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Orçamento de Abastecimento sub-component
// ══════════════════════════════════════════════════════════════════════════════

const TIPO_LABEL: Record<TipoFornecedorV2, string> = {
  materia_prima: "Matéria Prima", servico: "Serviço / Facção", produto_acabado: "Produto Acabado",
};
const TIPO_COLOR: Record<TipoFornecedorV2, string> = {
  materia_prima: "#7598CF", servico: "#9B8CD8", produto_acabado: "#F0C040",
};
const fmtM = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `R$ ${(v / 1_000).toFixed(0)}k`
  : v > 0        ? `R$ ${v.toFixed(0)}`
  : "—";

interface MonthRevenueLegacy { month: string; atacado: number; varejo: number; ecommerce: number; }

function OrcamentoAbastecimentoView({
  plannedRevenue, supplyFornecedores, margemPct, onMargemChange,
}: {
  plannedRevenue: MonthRevenueLegacy[];
  supplyFornecedores: SupplyFornecedor[];
  margemPct: number;
  onMargemChange: (v: number) => void;
}) {
  const { months, receita } = aggregateReceita(plannedRevenue);
  const projection   = useMemo(() => calcBudgetProjection(months, receita, margemPct, supplyFornecedores), [months, receita, margemPct, supplyFornecedores]);
  const totalOrc     = projection.reduce((s, p) => s + p.valor, 0);
  const totalReceita = receita.reduce((s, v) => s + v, 0);
  const custoPrevisto = totalReceita * (1 - margemPct / 100);

  const byTipo = useMemo(() => {
    const map: Record<TipoFornecedorV2, number> = { materia_prima: 0, servico: 0, produto_acabado: 0 };
    for (const p of projection) for (const f of p.fornecedores) { map[f.tipo] = (map[f.tipo] ?? 0) + f.valor; }
    return map;
  }, [projection]);

  const hasFornecedores = supplyFornecedores.length > 0;
  const hasScope        = supplyFornecedores.some(f => (f.categorias ?? []).length > 0);

  return (
    <div className="space-y-5">
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-[#28071C] font-semibold text-base mb-0.5">Orçamento de Abastecimento</h3>
            <p className="text-xs text-[#28071C]/50">Projeção de quando o caixa precisará de verba, cruzando receita e matriz de fornecedores.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#28071C]/50 font-medium">Margem bruta do ciclo:</label>
            <div className="flex items-center gap-1.5">
              <input type="number" min="0" max="100" step="0.1" value={margemPct}
                onChange={e => onMargemChange(parseFloat(e.target.value) || 0)}
                className="w-20 border border-[#28071C]/20 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40" />
              <span className="text-xs text-[#28071C]/50">%</span>
            </div>
          </div>
        </div>
      </div>

      {!hasFornecedores && (
        <div className="bg-white/70 rounded-2xl shadow-sm p-16 text-center">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-sm text-[#28071C]/50 mb-2">Nenhum fornecedor cadastrado na Matriz de Abastecimento.</p>
        </div>
      )}
      {hasFornecedores && !hasScope && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-800">Nenhum fornecedor com escopo de categorias definido.</p>
            <p className="text-xs text-amber-600 mt-1">Cadastre o % de custo médio na seção "Escopo de Categorias" de cada fornecedor.</p>
          </div>
        </div>
      )}

      {hasFornecedores && hasScope && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#28071C] rounded-2xl p-4 text-center">
            <p className="text-[10px] text-white/50 font-medium uppercase tracking-wider mb-1">Receita Total Planejada</p>
            <p className="text-xl font-bold text-[#F6F3AA]">{fmtM(totalReceita)}</p>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 text-center border border-[#28071C]/8">
            <p className="text-[10px] text-[#28071C]/50 font-medium uppercase tracking-wider mb-1">Custo Previsto ({(100 - margemPct).toFixed(0)}%)</p>
            <p className="text-xl font-bold text-[#28071C]">{fmtM(custoPrevisto)}</p>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 text-center border border-[#28071C]/8">
            <p className="text-[10px] text-[#28071C]/50 font-medium uppercase tracking-wider mb-1">Orçamento Mapeado</p>
            <p className="text-xl font-bold text-[#28071C]">{fmtM(totalOrc)}</p>
            <p className="text-[10px] text-[#28071C]/40 mt-0.5">{custoPrevisto > 0 ? `${((totalOrc / custoPrevisto) * 100).toFixed(0)}% do custo` : "—"}</p>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 text-center border border-[#28071C]/8">
            <p className="text-[10px] text-[#28071C]/50 font-medium uppercase tracking-wider mb-1">Fornecedores Ativos</p>
            <p className="text-xl font-bold text-[#28071C]">{supplyFornecedores.filter(f => (f.categorias ?? []).length > 0).length}</p>
            <p className="text-[10px] text-[#28071C]/40 mt-0.5">de {supplyFornecedores.length} cadastrados</p>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm p-5">
          <h4 className="text-sm font-semibold text-[#28071C] mb-4">Total por Tipo de Insumo</h4>
          <div className="grid grid-cols-3 gap-4">
            {(["materia_prima","servico","produto_acabado"] as TipoFornecedorV2[]).map(tipo => (
              <div key={tipo} className="rounded-xl p-4 text-center" style={{ background: TIPO_COLOR[tipo] + "18", border: `1px solid ${TIPO_COLOR[tipo]}33` }}>
                <p className="text-xs font-medium mb-1" style={{ color: TIPO_COLOR[tipo] }}>{TIPO_LABEL[tipo]}</p>
                <p className="text-lg font-bold text-[#28071C]">{fmtM(byTipo[tipo])}</p>
                {totalOrc > 0 && <p className="text-[10px] text-[#28071C]/40 mt-0.5">{((byTipo[tipo] / totalOrc) * 100).toFixed(0)}% do total</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
          <div className="border-t-4 px-6 pt-5 pb-3" style={{ borderColor: "#7598CF" }}>
            <h4 className="text-sm font-semibold text-[#28071C] mb-1">Calendário de Pagamentos</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#28071C]/10">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider w-40">Fornecedor</th>
                    <th className="text-left py-2 pr-3 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider w-28">Tipo</th>
                    {months.map(m => <th key={m} className="text-right py-2 px-2 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider">{m}</th>)}
                    <th className="text-right py-2 pl-3 text-xs font-semibold text-[#28071C]/50 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {supplyFornecedores.filter(f => (f.categorias ?? []).length > 0).map(forn => {
                    const rowVals = projection.map(p => p.fornecedores.find(pf => pf.nome === forn.nome)?.valor ?? 0);
                    const rowTotal = rowVals.reduce((s, v) => s + v, 0);
                    if (rowTotal === 0) return null;
                    return (
                      <tr key={forn.id} className="border-b border-[#28071C]/5 hover:bg-[#28071C]/3">
                        <td className="py-2.5 pr-4 font-medium text-[#28071C] text-xs">{forn.nome}</td>
                        <td className="py-2.5 pr-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: TIPO_COLOR[forn.tipo_fornecedor] + "20", color: TIPO_COLOR[forn.tipo_fornecedor] }}>
                            {TIPO_LABEL[forn.tipo_fornecedor]}
                          </span>
                        </td>
                        {rowVals.map((v, i) => <td key={i} className={`py-2.5 px-2 text-right text-xs ${v > 0 ? "font-medium text-[#28071C]" : "text-[#28071C]/20"}`}>{v > 0 ? fmtM(v) : "—"}</td>)}
                        <td className="py-2.5 pl-3 text-right font-bold text-sm text-[#28071C]">{fmtM(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[#28071C]/20 bg-[#28071C]/3">
                    <td className="py-3 pr-4 font-bold text-xs text-[#28071C] uppercase tracking-wider">Total Mensal</td>
                    <td className="py-3 pr-3" />
                    {projection.map((p, i) => <td key={i} className={`py-3 px-2 text-right text-sm font-bold ${p.valor > 0 ? "text-[#28071C]" : "text-[#28071C]/20"}`}>{p.valor > 0 ? fmtM(p.valor) : "—"}</td>)}
                    <td className="py-3 pl-3 text-right font-bold text-sm text-[#28071C]">{fmtM(totalOrc)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm p-5">
          <h4 className="text-sm font-semibold text-[#28071C] mb-4">Distribuição Mensal do Orçamento</h4>
          <div className="flex items-end gap-3 h-40">
            {projection.map((p, i) => {
              const maxVal    = Math.max(...projection.map(x => x.valor), 1);
              const heightPct = (p.valor / maxVal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-[#28071C]/50 font-medium">{p.valor > 0 ? fmtM(p.valor) : ""}</span>
                  <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(heightPct, 2)}%`, background: p.valor > 0 ? "#7598CF" : "#28071C10", minHeight: "4px" }} />
                  <span className="text-[10px] font-semibold text-[#28071C]/60">{p.mes}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>)}


    </div>
  );
}
