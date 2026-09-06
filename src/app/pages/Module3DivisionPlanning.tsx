/**
 * Módulo 3 - Planejamento por Divisão de Negócio (Temporada de Coleção)
 *
 * Ambiente oficial de planejamento por divisão orientado a temporadas.
 * O consolidado da temporada deve obrigatoriamente atingir as metas
 * macro da organização definidas no Módulo 1.
 *
 * Partes:
 * A — Seleção de Temporada e Referência
 * B — Mensagem de Orientação
 * C — Card Fixo: Distribuição de Participação por Divisão
 * D — Blocos de Planejamento por Divisão (4 blocos cada)
 * E — Consolidado com Validação de Metas Macro
 * F — Sistema de Cenários
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
// Helper único de meses da temporada (aceita número "07" ou nome "Agosto" e
// trata a temporada que cruza o ano). Substitui as funções locais que só
// entendiam nomes de mês — a tabela seasons guarda números.
import {
  seasonMonthCount as countSeasonMonths,
  seasonFiscalLabel,
} from "../../engine/seasonMonths";
import {
  ArrowLeft,
  LogOut,
  User,
  Save,
  Download,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Eye,
  Copy,
  Layers,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Info,
  Check,
  X,
  Play,
  FileDown,
  GitCompare,
  CheckCheck,
  HelpCircle,
  ArrowRight,
  SendHorizonal,
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import {
  createApprovalRequest,
  getPendingApprovalsForUser,
  resolveApproval,
  hasPendingRequest,
  type ImpactedIndicator,
  type PlanApprovalRequest,
} from "../../services/supabase/planApprovalService";

const MODULE3_TOUR: TourStep[] = [
  {
    targetId: "tour-m3-season",
    title: "Selecione a Temporada",
    content: "Escolha a temporada que deseja planejar e uma referência histórica para comparação. O sistema carrega automaticamente as metas macro do Módulo 1 como base para esta divisão.",
  },
  {
    targetId: "tour-m3-participation",
    title: "Distribuição de Participação",
    content: "Defina quanto cada divisão representa do total de receita. A soma deve chegar a 100% — o sistema valida em tempo real e mostra o valor em R$ de cada fatia assim que a meta macro estiver definida.",
  },
  {
    targetId: "tour-m3-divisions",
    title: "Bloco por Divisão",
    content: "Cada divisão tem seu próprio planejamento: indicadores comerciais (margem, sell-through, giro), mix de preço, cobertura de estoque e matriz de risco. Expanda cada bloco para detalhar.",
  },
  {
    targetId: "tour-m3-consolidated",
    title: "Consolidado de Metas Macro",
    content: "O painel consolidado compara o que você definiu nas divisões com as metas macro do Módulo 1. Verde = meta atingida; vermelho = reajuste necessário antes de fechar o plano.",
  },
  {
    targetId: "tour-m3-scenarios",
    title: "Simule, Salve e Compare Cenários",
    content: "Ajuste as participações e indicadores por divisão, salve como cenário e crie quantas versões quiser — conservadora, moderada, agressiva. Compare lado a lado e aplique o cenário que melhor equilibra risco e meta antes de confirmar o plano.",
  },
];
import { exportToPDF } from "../../utils/exportPDF";
import {
  BusinessDivisionId,
  DivisionPlanBlock,
  MacroTarget,
  CommercialIndicators,
  PriceRange,
  RiskMatrix,
  VolumeAndCoverage,
  DEFAULT_DIVISIONS,
  isValidRiskMatrix,
  isValidPriceRange,
} from "../types/module3";
import { getPlanCycle, getPlannedYears } from "../types/planCycle";
import {
  applyModule3Scenario,
  cloneModule3Scenario,
  deleteModule3Scenario,
  listModule3Scenarios,
  saveModule3Scenario,
  initModule3Scenarios,
} from "../../services/module3ScenarioService";
import {
  listDivisionScenarios,
  saveDivisionScenario,
  deleteDivisionScenario,
  applyDivisionScenario,
} from "../../services/supabase/divisionScenarioService";
import { recomputeMacroFromDivisions, advanceDetailLevel } from "../../services/supabase/officialPlanService";
import { useModule3 } from "../../hooks/useModule3";
import {
  fetchHistoricalTierAvgs,
  loadAllDivisionGlobalRanges,
  type TierHistoricalAvg,
  type TierRange,
} from "../../services/supabase/pricePyramidService";
import {
  getHistoricalProfiles,
  normalizeDivisionPcts,
} from "../../services/supabase/historicalProfileService";
import type { PriceTierId } from "../types/pricePyramid";

// Fallback hardcoded — usado quando operation_settings ainda não tem faixas configuradas
const M3_TIER_RANGES_FALLBACK: Record<PriceTierId, TierRange> = {
  p1: { min: 89,  max: 169 },
  p2: { min: 179, max: 259 },
  p3: { min: 269, max: 389 },
};

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface UserData {
  id?: string;
  name: string;
  email: string;
  profile: string;
}

interface Temporada {
  id: string | number;
  nome: string;
  mesInicio: string;
  mesFim: string;
  anoFiscal?: number;
}


// ─── Bandas bilaterais de aprovação — M3 ─────────────────────────────────────
// Mesmas diretrizes do M2; aplicadas sobre os indicadores foco ativos do M1.
const APPROVAL_BANDS_M3: Record<string, {
  higherIsBetter: boolean | null; badNeg: number; badPos: number; mode: "pct" | "abs";
}> = {
  receitaBruta: { higherIsBetter: true,  badNeg: 2,   badPos: 2,   mode: "pct" },
  margemBruta:  { higherIsBetter: true,  badNeg: 0.5, badPos: 2,   mode: "abs" },
  giro:         { higherIsBetter: true,  badNeg: 0.5, badPos: 0.5, mode: "abs" },
  pmv:          { higherIsBetter: true,  badNeg: 5,   badPos: 7,   mode: "pct" },
  gmroi:        { higherIsBetter: true,  badNeg: 0.3, badPos: 0.5, mode: "abs" },
  mkdPct:       { higherIsBetter: false, badNeg: 2,   badPos: 0.5, mode: "abs" },
  cobertura:    { higherIsBetter: null,  badNeg: 8,   badPos: 8,   mode: "abs" },
};

function isOutsideBandM3(key: string, planned: number, projected: number): boolean {
  const band = APPROVAL_BANDS_M3[key];
  if (!band || planned === 0) return false;
  const gap    = projected - planned;
  const absP   = Math.abs(planned);
  const negMag = band.mode === "pct" ? (-gap / absP) * 100 : -gap;
  const posMag = band.mode === "pct" ? ( gap / absP) * 100 :  gap;
  if (band.higherIsBetter === null) return Math.abs(gap) > band.badNeg;
  if (band.higherIsBetter)         return negMag > band.badNeg || posMag > band.badPos;
  /* lower is better */             return posMag > band.badPos || negMag > band.badNeg;
}

// Mapeamento macro key → label e campo do consolidado M3
const M3_INDICATOR_LABELS: Record<string, string> = {
  receitaBruta: "Receita Total",
  margemBruta:  "Margem Bruta %",
  gmroi:        "GMROI",
  giro:         "Giro",
  cobertura:    "Cobertura (dias)",
  pmv:          "PMV (R$)",
  mkdPct:       "MKD %",
  sellThrough:  "Sell-Through %",
};

function getM3ConsolidatedValue(key: string, c: import("../types/module3").SeasonConsolidated | null): number {
  if (!c) return 0;
  switch (key) {
    case "receitaBruta": return c.totalRevenue    ?? 0;
    case "margemBruta":  return c.avgMargin        ?? 0;
    case "gmroi":        return c.avgGmroi         ?? 0;
    case "giro":         return c.avgGiro          ?? 0;
    case "cobertura":    return c.avgCobertura     ?? 0;
    case "pmv":          return c.avgPmv           ?? 0;
    case "mkdPct":       return c.avgMkd           ?? 0;
    case "sellThrough":  return c.avgSellThrough   ?? 0;
    default:             return 0;
  }
}

// ─── Utilitário: derivar meta macro da temporada a partir do Módulo 1 ─────────

function deriveSeasonMacroTarget(temporada: Temporada): MacroTarget {
  const monthCount = countSeasonMonths(temporada.mesInicio, temporada.mesFim);
  const plannedYears = getPlannedYears();

  let annualRevenue = 0;
  let margin = 48;
  let gmroi = 3.5;

  if (plannedYears.length > 0) {
    // Tenta o ano fiscal da temporada primeiro; se não houver, usa o mais recente
    const candidateYears = temporada.anoFiscal
      ? [temporada.anoFiscal, ...plannedYears.filter(y => y !== temporada.anoFiscal)]
      : [...plannedYears];

    for (const year of candidateYears) {
      const cycle = getPlanCycle(year);
      // Procura em todas as versões, não só a [0]
      const version = cycle?.versions?.find(v =>
        (v.values?.receitaBruta as number | undefined) != null &&
        (v.values.receitaBruta as number) > 0
      );
      if (version) {
        const values = version.values;
        annualRevenue = (values.receitaBruta as number) ?? 0;
        margin        = (values.margemBruta  as number) ?? 48;
        gmroi         = (values.gmroi        as number) ?? 3.5;
        break;
      }
    }
  }

  return {
    seasonId: String(temporada.id),
    revenue: annualRevenue > 0 ? (monthCount / 12) * annualRevenue : 0,
    margin,
    sellThrough: 75,
    gmroi,
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Module3DivisionPlanning() {
  const navigate = useNavigate();
  const tour     = useTour("module3-division");
  const [user, setUser] = useState<UserData | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [referenceSeasonId, setReferenceSeasonId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedDivision, setExpandedDivision] = useState<BusinessDivisionId | null>(null);
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioListVersion, setScenarioListVersion] = useState(0);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [applySuccess, setApplySuccess]                       = useState(false);
  const [showPostApplyModal, setShowPostApplyModal]           = useState(false);
  const [showSubmitApprovalDialog, setShowSubmitApprovalDialog] = useState(false);
  const [approvalJustification, setApprovalJustification]    = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval]      = useState(false);
  const [alreadyPending, setAlreadyPending]                  = useState(false);

  // ── Aprovações recebidas do M5 (Sortimento → Divisão) ──────────────────────
  const [incomingApprovals, setIncomingApprovals]           = useState<PlanApprovalRequest[]>([]);
  const [showIncomingApproval, setShowIncomingApproval]     = useState(false);
  const [activeIncoming, setActiveIncoming]                 = useState<PlanApprovalRequest | null>(null);
  const [isResolvingApproval, setIsResolvingApproval]       = useState(false);

  // Médias históricas por divisão — carregadas quando a temporada de referência é selecionada
  const [historicalAvgs, setHistoricalAvgs] = useState<Partial<Record<BusinessDivisionId, TierHistoricalAvg>>>({});

  // ─── Inicialização ───────────────────────────────────────────────────────
  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
      setTenantId(tid);
      const hasAccess = userData.profile === "CEO" || userData.system_role === "support" || userData.system_role === "client_admin";
      if (!hasAccess) navigate("/dashboard");

      // Pedidos de aprovação direcionados ao M3 (vindos do M5 — Sortimento)
      if (tid) {
        const isCeoOrAdmin = userData.profile === "CEO" || userData.system_role === "support" || userData.system_role === "client_admin";
        getPendingApprovalsForUser(tid, 3, userData.email, isCeoOrAdmin)
          .then(reqs => {
            setIncomingApprovals(reqs);
            if (reqs.length > 0) {
              setActiveIncoming(reqs[0]);
              setShowIncomingApproval(true);
            }
          })
          .catch(() => {});
      }

      // Carregar temporadas do Supabase
      if (tid) {
        import("../../services/temporadaService").then(({ getTemporadas }) =>
          getTemporadas(tid).then(seasons => {
            if (seasons.length > 0) {
              setTemporadas(seasons);
              setSelectedSeasonId(String(seasons[0].id));
              if (seasons.length > 1) setReferenceSeasonId(String(seasons[1].id));
            } else {
              setLoadError("Nenhuma temporada cadastrada. Configure as temporadas em Configurações de Operação antes de usar este módulo.");
            }
          })
        ).catch(() => {
          setLoadError("Não foi possível carregar as temporadas do banco de dados. Verifique sua conexão ou contate o suporte.");
        });
      }
    } else {
      navigate("/");
    }

    setIsLoading(false);
  }, [navigate]);

  // ─── Metas macro derivadas do Módulo 1 ───────────────────────────────────
  const selectedTemporada = temporadas.find((t) => String(t.id) === selectedSeasonId);
  const referenceTemporada = temporadas.find((t) => String(t.id) === referenceSeasonId);

  const macroTargets: MacroTarget = useMemo(() => {
    if (!selectedTemporada) {
      return { seasonId: "", revenue: 0, margin: 48, sellThrough: 75, gmroi: 3.5 };
    }
    return deriveSeasonMacroTarget(selectedTemporada);
  }, [selectedTemporada]);

  // Lê os indicadores foco ativos do M1 (todos os 6 potenciais) e os valores macro
  // correspondentes para alimentar o banner dinâmico e as bandas de aprovação do M3.
  const macroM1Extras = useMemo(() => {
    if (!selectedTemporada) return { activeMacroKeys: [] as string[], values: {} as Record<string, number> };
    const candidateYears = selectedTemporada.anoFiscal
      ? [selectedTemporada.anoFiscal, ...getPlannedYears().filter(y => y !== selectedTemporada.anoFiscal)]
      : getPlannedYears();
    for (const year of candidateYears) {
      const cycle   = getPlanCycle(year);
      const version = cycle?.versions?.find(v =>
        (v.values?.receitaBruta as number | undefined) != null && (v.values.receitaBruta as number) > 0
      );
      if (version) {
        const vals = version.values as Record<string, unknown>;
        return {
          activeMacroKeys: (cycle?.fieldPriorities ?? [])
            .filter(fp => fp.status !== "inactive" && fp.status !== "dismissed")
            .map(fp => fp.key),
          values: {
            // Receita: pro-rata à temporada (já calculado em macroTargets)
            receitaBruta: macroTargets.revenue,
            // Taxas: não têm pro-rata — valem para toda a temporada
            margemBruta:  macroTargets.margin,
            gmroi:        macroTargets.gmroi,
            sellThrough:  macroTargets.sellThrough,
            pmv:          (vals.pmv         as number) ?? 0,
            mkdPct:       (vals.mkdPct      as number) ?? 0,
            giro:         (vals.giro        as number) ?? 0,
            cobertura:    (vals.cobertura   as number) ?? 0,
            custoMedio:   (vals.custoMedio  as number) ?? 0,
            ticketMedio:  (vals.ticketMedio as number) ?? 0,
          },
        };
      }
    }
    return { activeMacroKeys: [] as string[], values: {} as Record<string, number> };
  }, [selectedTemporada, macroTargets]);

  // ─── Hook do Módulo 3 ─────────────────────────────────────────────────────
  const {
    state,
    updateDivisionParticipation,
    updateIndicators,
    updatePriceRange,
    updateRiskMatrix,
    updateVolumeCoverage,
    saveScenario,
    reloadScenarios,
    validateAgainstMacro,
  } = useModule3({
    seasonId: selectedSeasonId,
    referenceSeasonId,
    macroTargets,
  });

  const meetsTarget = validateAgainstMacro();

  // Carrega cenários do Supabase para o cache em memória quando temporada/tenant mudam.
  // Se não houver cenários salvos, inicializa participações com proporções históricas reais.
  useEffect(() => {
    if (!tenantId || !selectedSeasonId) return;

    Promise.all([
      initModule3Scenarios(tenantId, selectedSeasonId),
      getHistoricalProfiles(tenantId),
    ]).then(([_, profiles]) => {
      reloadScenarios();
      setScenarioListVersion(v => v + 1);

      // Aplica proporções históricas somente quando não há cenário salvo para a temporada
      const existingScenarios = listModule3Scenarios(selectedSeasonId);
      if (existingScenarios.length === 0 && profiles.hasData) {
        const validDivisions: BusinessDivisionId[] = ["feminino", "masculino", "acessorios", "infantil"];
        const histPcts = normalizeDivisionPcts(profiles.divisions, validDivisions);
        validDivisions.forEach(divId => {
          if ((histPcts[divId] ?? 0) > 0) {
            updateDivisionParticipation(divId, histPcts[divId]);
          }
        });
      }
    }).catch(() => {});
  }, [tenantId, selectedSeasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca médias históricas por faixa para todas as divisões — usadas na compact card view.
  // Carrega os ranges dinâmicos do OperationSettings antes de filtrar os produtos;
  // cai no fallback hardcoded se o tenant ainda não configurou as faixas.
  useEffect(() => {
    if (!tenantId) return;
    const divisions: BusinessDivisionId[] = ["feminino", "masculino", "acessorios", "infantil"];

    loadAllDivisionGlobalRanges(tenantId).then(divRanges => {
      Promise.all(
        divisions.map(divId => {
          const ranges = divRanges?.[divId] ?? M3_TIER_RANGES_FALLBACK;
          return fetchHistoricalTierAvgs(tenantId, divId, ranges)
            .then(avgs => [divId, avgs] as [BusinessDivisionId, TierHistoricalAvg])
            .catch(() => [divId, { p1: null, p2: null, p3: null }] as [BusinessDivisionId, TierHistoricalAvg]);
        }),
      ).then(results => {
        setHistoricalAvgs(Object.fromEntries(results) as Record<BusinessDivisionId, TierHistoricalAvg>);
      });
    });
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalParticipation = Object.values(state.divisions).reduce(
    (sum, d) => sum + d.participation,
    0
  );
  const participationValid = Math.abs(totalParticipation - 100) < 0.01;

  // ─── Cenários (carregados diretamente para refletir estado atual) ─────────
  const scenarios = useMemo(
    () => (selectedSeasonId ? listModule3Scenarios(selectedSeasonId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSeasonId, scenarioListVersion]
  );

  if (!user || isLoading) return null;

  // Derivadas simples (não são hooks — podem vir depois do early return)
  const activeScenario = scenarios.find(s => s.isActive) ?? null;

  // Verifica todos os indicadores foco ativos do M1 contra as bandas bilaterais.
  // Quando M1 não tem prioridades configuradas, usa fallback para receita e margem.
  const impactedMacroM3: ImpactedIndicator[] = (() => {
    if (!state.consolidated) return [];
    const keysToCheck = macroM1Extras.activeMacroKeys.length > 0
      ? macroM1Extras.activeMacroKeys
      : ["receitaBruta", "margemBruta"];  // fallback mínimo
    return keysToCheck.flatMap(key => {
      if (!(key in M3_INDICATOR_LABELS)) return [];
      const planned   = macroM1Extras.values[key] ?? 0;
      const projected = getM3ConsolidatedValue(key, state.consolidated);
      if (planned <= 0 || projected === 0) return [];
      if (!isOutsideBandM3(key, planned, projected)) return [];
      return [{
        key,
        label:     M3_INDICATOR_LABELS[key],
        planned,
        projected,
        gap:       projected - planned,
        isRate:    key !== "receitaBruta",
      }] as ImpactedIndicator[];
    });
  })();

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveScenario = () => {
    if (!scenarioName.trim()) {
      alert("Nome do cenário é obrigatório");
      return;
    }
    saveScenario(scenarioName, scenarioDescription);
    setScenarioName("");
    setScenarioDescription("");
    setShowScenarioModal(false);
    setScenarioListVersion((v) => v + 1);

    // Write-through → Supabase (fire-and-forget)
    if (tenantId && selectedSeasonId) {
      const yearNum = Number(selectedSeasonId.split("-")[0]) || new Date().getFullYear();
      saveDivisionScenario(
        tenantId, selectedSeasonId, yearNum,
        scenarioName, scenarioDescription || null,
        state.divisions as Record<string, unknown>,
        state.consolidated as unknown as Record<string, unknown>,
        undefined
      ).catch(err => console.warn("[Module3] Supabase save:", err));
    }
  };

  const handleApplyScenario = (scenarioId: string) => {
    applyModule3Scenario(selectedSeasonId, scenarioId);
    setScenarioListVersion((v) => v + 1);
  };

  const handleCopyScenario = (scenarioId: string) => {
    const all = listModule3Scenarios(selectedSeasonId);
    const original = all.find((s) => s.id === scenarioId);
    if (!original) return;
    const cloned = cloneModule3Scenario(original, `${original.name} (cópia)`);
    saveModule3Scenario(selectedSeasonId, cloned);
    setScenarioListVersion((v) => v + 1);
    reloadScenarios();
  };

  const handleDeleteScenario = (scenarioId: string) => {
    if (!confirm("Excluir este cenário? Esta ação não pode ser desfeita.")) return;
    deleteModule3Scenario(selectedSeasonId, scenarioId);
    setScenarioListVersion((v) => v + 1);
    reloadScenarios();
    // Write-through → Supabase
    if (tenantId) {
      deleteDivisionScenario(tenantId, scenarioId)
        .catch(err => console.warn("[Module3] Supabase delete:", err));
    }
  };

  const handleApplyMetas = async () => {
    const chosen = scenarios.find(s => s.isActive) ?? scenarios[0];
    if (chosen) {
      applyModule3Scenario(selectedSeasonId, chosen.id);
      setScenarioListVersion(v => v + 1);
      // Plano Oficial: aguarda a gravação do is_applied e recalcula o macro
      // bottom-up (divisão → mês → ano fiscal), avançando o nível para 3.
      const year = selectedTemporada?.anoFiscal ?? new Date().getFullYear();
      if (tenantId) {
        try {
          await applyDivisionScenario(tenantId, selectedSeasonId, chosen.id);
          await recomputeMacroFromDivisions(tenantId, year);
          await advanceDetailLevel(tenantId, year, 3);
        } catch {
          // recompute não bloqueia a aplicação do cenário
        }
      }
    }
    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 2500);
    setShowPostApplyModal(true);
  };

  const handleSubmitApprovalM3 = async () => {
    if (!tenantId || !user) return;
    setIsSubmittingApproval(true);
    try {
      const scenarioForApproval = scenarios.find(s => s.isActive) ?? scenarios[scenarios.length - 1] ?? null;
      await createApprovalRequest({
        tenantId,
        year:               selectedTemporada?.anoFiscal ?? new Date().getFullYear(),
        fromModule:         3,
        toModule:           1,
        requesterEmail:     user.email,
        justification:      approvalJustification,
        proposedData:       (state.consolidated ?? {}) as Record<string, unknown>,
        originalData:       macroTargets as unknown as Record<string, unknown>,
        impactedIndicators: impactedMacroM3,
        scenarioId:         scenarioForApproval?.id,
      });
      setAlreadyPending(true);
      setShowSubmitApprovalDialog(false);
      setApprovalJustification("");
    } catch { /* silent */ }
    setIsSubmittingApproval(false);
  };

  // ── Resolver pedido de aprovação recebido do M5 ────────────────────────────
  const handleResolveIncoming = async (
    req: PlanApprovalRequest,
    decision: "approved" | "denied",
  ) => {
    if (!user) return;
    setIsResolvingApproval(true);
    try {
      await resolveApproval(req.id, decision, user.email);
      // Se aprovado, reafirma o Plano Oficial a partir das divisões aplicadas —
      // mesma chamada que o próprio M3 já faz ao aplicar sem desvio. Sem isso,
      // o pedido do M5 (Sortimento) ficava "aprovado" só no banco, sem nunca
      // refletir no plano — e quem submeteu não conseguia avançar.
      if (decision === "approved" && tenantId) {
        try {
          await recomputeMacroFromDivisions(tenantId, req.year);
          await advanceDetailLevel(tenantId, req.year, 5);
        } catch {
          // recompute não bloqueia a resolução do pedido
        }
      }
      setIncomingApprovals(prev => prev.filter(r => r.id !== req.id));
      const next = incomingApprovals.find(r => r.id !== req.id) ?? null;
      setActiveIncoming(next);
      if (!next) setShowIncomingApproval(false);
    } catch { /* silent */ }
    setIsResolvingApproval(false);
  };

  const handleExport = () => {
    const data = {
      season: selectedTemporada,
      scenarios,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modulo3_${selectedSeasonId}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    await exportToPDF({
      elementId: "module3-scenarios-pdf",
      fileName:  `cenarios_divisao_${selectedSeasonId}`,
      title:     `Comparação de Cenários — ${selectedTemporada?.nome ?? selectedSeasonId}`,
    });
    setIsExportingPDF(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  // ─── Helpers de formatação ────────────────────────────────────────────────

  const fmtCurrency = (v: number) =>
    v === 0 ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

  const fmtRevenueLabel = (v: number) =>
    v === 0 ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">

      {/* ─── HEADER ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-base font-semibold">
                Fashion Mind · Módulo 3
              </span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">
                Planejamento por Divisão de Negócio
              </span>
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
            <button
              onClick={handleLogout}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PARTE A — SELEÇÃO DE TEMPORADA E REFERÊNCIA                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div id="tour-m3-season" className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border-t-4 border-[#7598CF]">
          <h2 className="text-[#28071C] text-lg font-bold mb-3">Temporada de Planejamento</h2>

          <div className="grid grid-cols-2 gap-4 mb-3">
            {/* Temporada a planejar */}
            <div>
              <label className="block text-[#28071C]/70 text-xs uppercase tracking-wide font-semibold mb-2">
                Temporada a Planejar
              </label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full bg-white rounded-xl px-3 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 font-medium cursor-pointer"
              >
                <option value="">Selecione a temporada...</option>
                {temporadas.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              {selectedTemporada && (
                <p className="text-xs text-[#28071C]/50 mt-1 pl-1">
                  {seasonFiscalLabel(selectedTemporada.mesInicio, selectedTemporada.mesFim)}
                </p>
              )}
            </div>

            {/* Temporada de referência */}
            <div>
              <label className="block text-[#28071C]/70 text-xs uppercase tracking-wide font-semibold mb-2">
                Temporada de Referência (histórico)
              </label>
              <select
                value={referenceSeasonId}
                onChange={(e) => setReferenceSeasonId(e.target.value)}
                className="w-full bg-white rounded-xl px-3 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 font-medium cursor-pointer"
              >
                <option value="">Selecione a referência...</option>
                {temporadas.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              {referenceTemporada && (
                <p className="text-xs text-[#28071C]/50 mt-1 pl-1">
                  {seasonFiscalLabel(referenceTemporada.mesInicio, referenceTemporada.mesFim)}
                </p>
              )}
            </div>
          </div>

          {selectedSeasonId && referenceSeasonId && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Planejando <strong>{selectedTemporada?.nome}</strong> com referência em{" "}
                <strong>{referenceTemporada?.nome}</strong>
              </span>
            </div>
          )}

          {loadError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mt-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {loadError}{" "}
                {loadError.includes("cadastrada") && (
                  <button
                    onClick={() => navigate("/operation-settings")}
                    className="underline font-semibold"
                  >
                    Ir para Configurações de Operação
                  </button>
                )}
              </span>
            </div>
          )}
        </div>

        {selectedSeasonId && (
          <>
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PARTE B — MENSAGEM DE ORIENTAÇÃO                              */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl px-6 py-4">
              <p className="text-[#28071C] text-sm leading-relaxed">
                Planeje aqui os indicadores de cada divisão para a temporada desejada.
                O plano consolidado da temporada deve atingir as{" "}
                <strong>metas macro da organização</strong>.
              </p>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ZONA STICKY — Participação (C) + Consolidado (E)              */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className="sticky top-[72px] z-30 space-y-1.5">

              {/* C — Distribuição de Participação */}
              <div id="tour-m3-participation" className="bg-white/95 backdrop-blur-md rounded-xl px-4 py-2.5 shadow-md border-t-4 border-[#7598CF]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#28071C]" />
                    <h2 className="text-[12px] font-bold text-[#28071C]">Distribuição de Participação por Divisão</h2>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                    participationValid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {participationValid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    Total: {totalParticipation.toFixed(1)}%
                    {macroTargets.revenue > 0 && (
                      <span className="ml-1 pl-1.5 border-l border-current/30 font-semibold">
                        {fmtRevenueLabel(macroTargets.revenue)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).map((divId) => {
                    const block = state.divisions[divId];
                    if (!block) return null;
                    return (
                      <div key={divId} className="bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-[#28071C]/60 mb-1 font-semibold">
                          {DEFAULT_DIVISIONS[divId]}
                        </div>
                        <div className="flex items-center gap-1 mb-1">
                          <input
                            type="number"
                            value={block.participation}
                            onChange={(e) => updateDivisionParticipation(divId, Number(e.target.value))}
                            min={0} max={100}
                            className="w-full bg-white rounded-md px-2 py-1 text-[#28071C] text-[12px] font-bold border border-[#28071C]/15 focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50 text-center"
                          />
                          <span className="text-[11px] text-[#28071C]/50 font-semibold">%</span>
                        </div>
                        <div className="h-1 bg-[#28071C]/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#7598CF] to-[#28071C] rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(block.participation, 100)}%` }}
                          />
                        </div>
                        {macroTargets.revenue > 0 ? (
                          <div className="text-[10px] font-bold text-[#28071C]/70 mt-1">
                            {fmtRevenueLabel((block.participation / 100) * macroTargets.revenue)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#28071C]/30 mt-1 italic">
                            Meta não definida
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* E — Consolidado de Metas Macro (sticky, dinâmico) */}
              {/* Exibe TODOS os indicadores foco ativos do M1 para esta temporada.  */}
              {/* Fallback para receita+margem+sellThrough+gmroi quando M1 não tem prioridades. */}
              {(() => {
                const allOk = impactedMacroM3.length === 0;
                const fmtV  = (key: string, v: number) => {
                  if (key === "receitaBruta" || key === "pmv" || key === "custoMedio" || key === "ticketMedio") return fmtCurrency(v);
                  if (key === "giro" || key === "gmroi") return `${v.toFixed(2)}x`;
                  if (key === "cobertura") return `${Math.round(v)}d`;
                  return fmtPct(v);
                };

                // Indicadores a exibir: foco do M1 (filtrado para os que M3 consegue calcular)
                // ou fallback padrão quando M1 não tem prioridades configuradas.
                const focusKeys = macroM1Extras.activeMacroKeys.length > 0
                  ? macroM1Extras.activeMacroKeys.filter(k => k in M3_INDICATOR_LABELS)
                  : ["receitaBruta", "margemBruta", "sellThrough", "gmroi"];

                const cols = focusKeys.length <= 4 ? "grid-cols-4"
                  : focusKeys.length <= 6 ? "grid-cols-6"
                  : "grid-cols-4 flex-wrap";

                return (
                  <div id="tour-m3-consolidated" className={`rounded-xl px-4 py-2.5 shadow-sm border-t-4 ${
                    allOk ? "bg-green-50 border-green-500" : "bg-red-50 border-red-500"
                  }`}>
                    <div className="flex items-center gap-3">
                      {allOk
                        ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                      <span className={`text-[11px] font-bold shrink-0 ${allOk ? "text-green-800" : "text-red-800"}`}>
                        {allOk ? "Metas atingidas" : "Metas NÃO atingidas"}
                      </span>
                      <div className={`flex-1 grid ${cols} gap-2`}>
                        {focusKeys.map(key => {
                          const planned   = macroM1Extras.values[key] ?? 0;
                          const projected = getM3ConsolidatedValue(key, state.consolidated);
                          const gap       = projected - planned;
                          const band      = APPROVAL_BANDS_M3[key];
                          // "meets" usa threshold de 95% para indicadores ↑ melhor,
                          // e banda positiva para indicadores ↓ melhor
                          const meets     = planned === 0 || (
                            band?.higherIsBetter === false
                              ? gap <= band.badPos
                              : projected >= planned * 0.95
                          );
                          return (
                            <div key={key} className={`rounded-lg px-2.5 py-1.5 border bg-white/80 ${
                              meets ? "border-green-200" : "border-red-200"
                            }`}>
                              <div className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">
                                {M3_INDICATOR_LABELS[key]}
                              </div>
                              <div className="flex items-baseline gap-1 mt-0.5">
                                <span className={`text-[13px] font-bold ${meets ? "text-green-700" : "text-red-700"}`}>
                                  {fmtV(key, projected)}
                                </span>
                                {planned > 0 && (
                                  <span className="text-[10px] text-[#28071C]/40">/ {fmtV(key, planned)}</span>
                                )}
                              </div>
                              {planned > 0 && (
                                <div className={`text-[10px] font-semibold ${meets ? "text-green-600" : "text-red-600"}`}>
                                  Δ {fmtV(key, gap)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PARTE D — BLOCOS POR DIVISÃO (4 colunas, cards empilhados)    */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div id="tour-m3-divisions" className="grid grid-cols-4 gap-3">
              {(["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).map((divId) => (
                <DivisionBlockCard
                  key={divId}
                  divId={divId}
                  block={state.divisions[divId]}
                  expanded={true}
                  onExpand={() => {}}
                  onUpdateIndicators={(ind) => updateIndicators(divId, ind)}
                  onUpdateRiskMatrix={(matrix) => updateRiskMatrix(divId, matrix)}
                  onUpdateVolume={(vol) => updateVolumeCoverage(divId, vol)}
                  seasonId={selectedSeasonId}
                  referenceSeasonId={referenceSeasonId}
                  tenantId={tenantId}
                  historicalAvgs={historicalAvgs}
                />
              ))}
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PARTE F — CENÁRIOS                                            */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div id="tour-m3-scenarios" className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border-t-4 border-[#F6F3AA]">
              <div className="flex items-center gap-3 mb-5">
                <BarChart3 className="w-5 h-5 text-[#28071C]" />
                <h2 className="text-[#28071C] font-bold text-lg">Cenários</h2>
                {scenarios.length > 0 && (
                  <span className="text-xs text-[#28071C]/40 bg-[#28071C]/5 px-2 py-0.5 rounded-full">
                    {scenarios.length} {scenarios.length === 1 ? "salvo" : "salvos"}
                  </span>
                )}
              </div>

              {scenarios.length === 0 ? (
                <div className="text-center py-10 text-[#28071C]/50">
                  <Save className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum cenário salvo. Crie o primeiro para começar.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                        scenario.isActive
                          ? "bg-[#28071C]/5 border-[#28071C]/30"
                          : "bg-white border-[#28071C]/10 hover:bg-[#28071C]/5"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#28071C] truncate">
                            {scenario.name}
                          </span>
                          {scenario.isActive && (
                            <span className="text-xs bg-[#28071C] text-[#F6F3AA] px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                              Ativo
                            </span>
                          )}
                        </div>
                        {scenario.description && (
                          <p className="text-sm text-[#28071C]/60 truncate">{scenario.description}</p>
                        )}
                        <div className="text-xs text-[#28071C]/40 mt-0.5">
                          {new Date(scenario.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                          Receita: {fmtCurrency(scenario.consolidated.totalRevenue)} ·{" "}
                          Margem: {scenario.consolidated.avgMargin.toFixed(1)}%
                        </div>
                      </div>
                      <div className="flex gap-1 ml-3">
                        <button
                          onClick={() => handleApplyScenario(scenario.id)}
                          title="Aplicar cenário"
                          className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCopyScenario(scenario.id)}
                          title="Duplicar cenário"
                          className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteScenario(scenario.id)}
                          title="Excluir cenário"
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── BARRA DE AÇÕES ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 bg-[#F2F2F2]/80 backdrop-blur-sm border-t border-[#28071C]/8 px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScenarioModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
            >
              <Save className="w-4 h-4" />
              Salvar cenário
            </button>
            <button
              onClick={() => setCompareOpen(true)}
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
          <div className="flex items-center gap-3">
            {applySuccess && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl font-medium">
                ✓ Metas aplicadas ao plano
              </span>
            )}
            {impactedMacroM3.length === 0 ? (
              <button
                onClick={handleApplyMetas}
                disabled={scenarios.length === 0}
                title={scenarios.length === 0 ? "Salve um cenário antes de aplicar" : activeScenario ? `Aplicar metas do cenário "${activeScenario.name}"` : "Aplicar metas do último cenário salvo"}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <CheckCheck className="w-4 h-4" />
                Aplicar metas
              </button>
            ) : impactedMacroM3.length <= 2 ? (
              <button
                onClick={() => { if (!alreadyPending) setShowSubmitApprovalDialog(true); }}
                disabled={scenarios.length === 0}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                  alreadyPending
                    ? "bg-amber-100 text-amber-700 border border-amber-300 cursor-default"
                    : "bg-[#7598CF] text-white hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
                }`}
              >
                <SendHorizonal className="w-4 h-4" />
                {alreadyPending ? "Aguardando aprovação…" : "Submeter para Aprovação"}
              </button>
            ) : (
              <button
                disabled
                title="Corrija os indicadores macro antes de aplicar (3 ou mais desvios)"
                className="flex items-center gap-2 px-5 py-2.5 bg-red-100 text-red-400 border border-red-200 rounded-xl text-sm font-semibold cursor-not-allowed shadow-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                Aplicar metas
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[9px] text-[#28071C]/25 mt-1">
          Cenários não alteram dados oficiais até "Aplicar metas" ser acionado.
        </p>
      </div>

      {/* ─── MODAL: Salvar Cenário ────────────────────────────────────────── */}
      {showScenarioModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#28071C] mb-4">Salvar Cenário</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#28071C]/70 mb-1.5 font-medium">
                  Nome do Cenário *
                </label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="Ex: Cenário Conservador"
                  className="w-full px-4 py-2.5 border-2 border-[#28071C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
                />
              </div>

              <div>
                <label className="block text-sm text-[#28071C]/70 mb-1.5 font-medium">
                  Descrição (opcional)
                </label>
                <textarea
                  value={scenarioDescription}
                  onChange={(e) => setScenarioDescription(e.target.value)}
                  placeholder="Descreva o objetivo deste cenário..."
                  rows={3}
                  className="w-full px-4 py-2.5 border-2 border-[#28071C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#28071C]/40 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowScenarioModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-[#28071C]/20 text-[#28071C] rounded-xl hover:bg-[#28071C]/5 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveScenario}
                className="flex-1 px-4 py-2.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 transition-colors font-semibold"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Comparar Cenários ────────────────────────────────────── */}
      {compareOpen && scenarios.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[860px] max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/8">
              <h3 className="text-[#28071C] font-bold text-base">Comparação de Cenários — Módulo 3</h3>
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
                      <th key={sc.id} className={`text-right text-[10px] uppercase tracking-widest font-semibold py-2 px-3 ${sc.isActive ? "text-[#7598CF]" : "text-[#28071C]/40"}`}>
                        {sc.name}
                        {sc.isActive && <span className="ml-1 normal-case text-[9px] bg-[#7598CF]/15 px-1.5 py-0.5 rounded-full">ativo</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Receita Total", fmt: (v: number) => fmtCurrency(v), key: "totalRevenue" },
                    { label: "Margem Média", fmt: (v: number) => `${v.toFixed(1)}%`, key: "avgMargin" },
                  ].map((row, i) => (
                    <tr key={i} className="border-t border-[#28071C]/5 hover:bg-[#7598CF]/4 transition-colors">
                      <td className="py-2.5 pr-4 text-[#28071C]/60">{row.label}</td>
                      {scenarios.map(sc => (
                        <td key={sc.id} className={`py-2.5 px-3 text-right font-mono font-semibold ${sc.isActive ? "text-[#7598CF]" : "text-[#28071C]"}`}>
                          {row.fmt((sc.consolidated as any)[row.key] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-[#28071C]/5">
                    <td className="py-2.5 pr-4 text-[#28071C]/60">Criado em</td>
                    {scenarios.map(sc => (
                      <td key={sc.id} className="py-2.5 px-3 text-right text-[#28071C]/40 text-xs">
                        {new Date(sc.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-[#28071C]/5">
                    <td className="py-3 pr-4" />
                    {scenarios.map(sc => (
                      <td key={sc.id} className="py-3 px-3 text-right">
                        <button
                          onClick={() => { handleApplyScenario(sc.id); setCompareOpen(false); }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${sc.isActive ? "bg-[#7598CF]/15 text-[#7598CF]" : "bg-[#28071C]/8 text-[#28071C]/60 hover:bg-[#7598CF]/10 hover:text-[#7598CF]"}`}
                        >
                          {sc.isActive ? "Ativo" : "Aplicar"}
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCT TOUR ─────────────────────────────────────────────────── */}
      {tour.isOpen && (
        <ProductTour steps={MODULE3_TOUR} onClose={tour.dismiss} />
      )}

      {/* ── PDF: Comparação de Cenários (fora da tela, capturado pelo html2canvas) ── */}
      <div
        id="module3-scenarios-pdf"
        style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, width: '1120px', padding: '28px', background: '#F2F2F2', fontFamily: 'system-ui, sans-serif' }}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#28071C', marginBottom: '4px' }}>
          Planejamento por Divisão — {selectedTemporada?.nome ?? selectedSeasonId}
        </p>
        <p style={{ fontSize: '11px', color: '#28071C', opacity: 0.4, marginBottom: '20px' }}>
          Comparação de Cenários
        </p>
        {scenarios.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#28071C', opacity: 0.5 }}>Nenhum cenário salvo.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            {scenarios.map(sc => (
              <div key={sc.id} style={{ flex: '1 1 220px', minWidth: '200px', maxWidth: '260px', background: 'white', borderRadius: '12px', padding: '16px', borderTop: `4px solid ${sc.isActive ? '#7598CF' : '#28071C'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#28071C' }}>{sc.name}</span>
                  {sc.isActive && (
                    <span style={{ fontSize: '9px', background: '#7598CF', color: 'white', borderRadius: '999px', padding: '2px 6px', fontWeight: 700 }}>ATIVO</span>
                  )}
                </div>
                {[
                  { label: 'Indicador', plan: 'Plano', ref: 'vs Referência', isHeader: true },
                  { label: 'Receita Total', plan: fmtCurrency(sc.consolidated.totalRevenue), ref: state.consolidated ? `${((sc.consolidated.totalRevenue / (state.consolidated.totalRevenue || 1) - 1) * 100).toFixed(1)}%` : '—' },
                  { label: 'Margem Média', plan: `${sc.consolidated.avgMargin.toFixed(1)}%`, ref: state.consolidated ? `${(sc.consolidated.avgMargin - state.consolidated.avgMargin).toFixed(1)} p.p.` : '—' },
                  { label: 'Criado em', plan: new Date(sc.createdAt).toLocaleDateString('pt-BR'), ref: '' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', padding: '6px 0', borderBottom: '1px solid #F2F2F2', fontSize: row.isHeader ? '9px' : '11px', fontWeight: row.isHeader ? 700 : 400, color: row.isHeader ? 'rgba(40,7,28,0.4)' : '#28071C', textTransform: row.isHeader ? 'uppercase' : 'none', letterSpacing: row.isHeader ? '0.05em' : 0 }}>
                    <span>{row.label}</span>
                    <span style={{ textAlign: 'center', fontWeight: row.isHeader ? 700 : 600 }}>{row.plan}</span>
                    <span style={{ textAlign: 'right', color: row.isHeader ? 'rgba(40,7,28,0.4)' : 'rgba(40,7,28,0.6)' }}>{row.ref}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL: Pós-Aplicação ─────────────────────────────────────────── */}
      {showPostApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-[#28071C] font-bold text-lg mb-1">Metas aplicadas!</h2>
              <p className="text-[#28071C]/60 text-sm">O plano por divisão foi confirmado. Continue para o próximo módulo.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => { setShowPostApplyModal(false); navigate("/cycle-validation"); }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 transition-all"
              >
                Ir para Módulo 4 — Validação de Ciclo
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowPostApplyModal(false); navigate("/dashboard"); }}
                className="w-full px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-[#F2F2F2] transition-colors"
              >
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Submeter para Aprovação (M3→M2) ──────────────────────── */}
      {showSubmitApprovalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7 flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[#28071C] font-bold text-base">Submeter para Aprovação</h2>
                <p className="text-[#28071C]/50 text-xs mt-0.5">
                  {impactedMacroM3.length} indicador{impactedMacroM3.length > 1 ? "es" : ""} fora das metas macro estratégicas (Módulo 1).
                </p>
              </div>
              <button onClick={() => setShowSubmitApprovalDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabela de indicadores impactados */}
            <div className="rounded-xl overflow-hidden border border-[#28071C]/8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F2F2F2]">
                    <th className="text-left text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold px-4 py-2">Indicador</th>
                    <th className="text-right text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold px-4 py-2">Meta M1</th>
                    <th className="text-right text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold px-4 py-2">Projetado M3</th>
                    <th className="text-right text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold px-4 py-2">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {impactedMacroM3.map((ind) => (
                    <tr key={ind.key} className="border-t border-[#28071C]/5">
                      <td className="px-4 py-2.5 text-[#28071C]/70">{ind.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#28071C]">
                        {ind.isRate ? `${ind.planned.toFixed(1)}%` : `R$ ${Math.round(ind.planned).toLocaleString("pt-BR")}`}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-600">
                        {ind.isRate ? `${ind.projected.toFixed(1)}%` : `R$ ${Math.round(ind.projected).toLocaleString("pt-BR")}`}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-500 font-semibold">
                        {ind.isRate ? `${ind.gap.toFixed(1)} p.p.` : `R$ ${Math.round(ind.gap).toLocaleString("pt-BR")}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Justificativa */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Justificativa</label>
              <textarea
                value={approvalJustification}
                onChange={e => setApprovalJustification(e.target.value)}
                placeholder="Explique por que o plano por divisão diverge das metas do canal e como isso impacta os objetivos da coleção…"
                rows={3}
                className="w-full border border-[#28071C]/15 rounded-xl px-4 py-3 text-sm text-[#28071C] placeholder-[#28071C]/30 resize-none focus:outline-none focus:border-[#7598CF]"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitApprovalDialog(false)}
                className="flex-1 px-4 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-[#F2F2F2] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitApprovalM3}
                disabled={isSubmittingApproval || !approvalJustification.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <SendHorizonal className="w-4 h-4" />
                {isSubmittingApproval ? "Enviando…" : "Enviar para Aprovação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Pedido recebido do M5 (Sortimento → Divisão) ─────────────── */}
      {showIncomingApproval && activeIncoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-[#F6F3AA] font-bold text-base">
                  Pedido de Ajuste — Módulo {activeIncoming.from_module} (Sortimento)
                </p>
                <p className="text-[#F6F3AA]/60 text-xs mt-0.5">
                  Solicitado por {activeIncoming.requester_email} · {new Date(activeIncoming.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {incomingApprovals.length > 1 && (
                <span className="text-[10px] bg-white/20 text-[#F6F3AA] rounded-full px-2 py-0.5 font-semibold">
                  {incomingApprovals.length} pendentes
                </span>
              )}
            </div>

            <div className="overflow-y-auto p-6 flex-1">
              <h4 className="text-[#28071C] font-semibold text-sm mb-3 uppercase tracking-wide">
                Ajustes propostos por divisão
              </h4>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 bg-[#28071C]/5 text-[#28071C]/50 font-semibold uppercase tracking-widest rounded-tl-lg">Indicador</th>
                      <th className="text-right px-3 py-2 bg-[#28071C]/5 text-[#28071C]/50 font-semibold uppercase tracking-widest">Plano Atual (M3)</th>
                      <th className="text-right px-3 py-2 bg-[#7598CF]/10 text-[#7598CF] font-semibold uppercase tracking-widest rounded-tr-lg">Proposto (M{activeIncoming.from_module})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#28071C]/6">
                    {(activeIncoming.impacted_indicators as ImpactedIndicator[]).map(item => (
                      <tr key={item.key} className="hover:bg-[#28071C]/2">
                        <td className="px-3 py-2 text-[#28071C]/70 font-medium">{item.label}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#28071C]">
                          {item.isRate ? `${item.planned.toFixed(1)}%` : `R$ ${Math.round(item.planned).toLocaleString("pt-BR")}`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-[#7598CF]">
                          {item.isRate ? `${item.projected.toFixed(1)}%` : `R$ ${Math.round(item.projected).toLocaleString("pt-BR")}`}
                          <span className={`ml-1.5 text-[9px] font-normal ${item.gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {item.gap >= 0 ? "+" : ""}{item.isRate ? `${item.gap.toFixed(1)}pp` : `R$${Math.round(item.gap).toLocaleString("pt-BR")}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {activeIncoming.justification && (
                <div className="mb-2">
                  <h4 className="text-[#28071C] font-semibold text-sm mb-2 uppercase tracking-wide">Justificativa</h4>
                  <div className="bg-[#7598CF]/6 border border-[#7598CF]/20 rounded-xl px-4 py-3 text-sm text-[#28071C]/80 leading-relaxed italic">
                    "{activeIncoming.justification}"
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#28071C]/40 mt-4 leading-relaxed">
                Ao aceitar, revise as metas por divisão e ajuste os indicadores conforme a proposta do Sortimento antes de reaplicar o plano.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-[#28071C]/8 flex gap-3 flex-shrink-0">
              <button
                onClick={() => handleResolveIncoming(activeIncoming, "denied")}
                disabled={isResolvingApproval}
                className="flex-1 py-2.5 border-2 border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-40">
                Negar pedido
              </button>
              <button
                onClick={() => handleResolveIncoming(activeIncoming, "approved")}
                disabled={isResolvingApproval}
                className="flex-1 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40">
                {isResolvingApproval ? "Processando…" : "Aceitar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE: DivisionBlockCard
// ═════════════════════════════════════════════════════════════════════════════

interface DivisionBlockCardProps {
  divId: BusinessDivisionId;
  block: DivisionPlanBlock;
  expanded: boolean;
  onExpand: () => void;
  onUpdateIndicators: (ind: Partial<CommercialIndicators>) => void;
  onUpdateRiskMatrix: (matrix: Partial<RiskMatrix>) => void;
  onUpdateVolume: (vol: Partial<VolumeAndCoverage>) => void;
  seasonId: string;
  referenceSeasonId: string;
  tenantId: string;
  historicalAvgs: Partial<Record<BusinessDivisionId, TierHistoricalAvg>>;
}

function DivisionBlockCard({
  divId,
  block,
  onUpdateIndicators,
  onUpdateRiskMatrix,
  onUpdateVolume,
  seasonId,
  referenceSeasonId,
  tenantId,
  historicalAvgs,
}: DivisionBlockCardProps) {
  const navigate = useNavigate();
  const [isProducer, setIsProducer] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const riskValid = isValidRiskMatrix(block.riskMatrix);
  const riskTotal = block.riskMatrix.sustentadorMargem + block.riskMatrix.motorGiro + block.riskMatrix.iconeMarca;

  const divisionName = DEFAULT_DIVISIONS[divId];

  return (
    <div className="space-y-2">

      {/* ── MODAL: Revisão de Faixas de Preço ─────────────────────────────── */}
      {showReviewModal && (
        <div className="fixed inset-0 z-[9200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowReviewModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

            {/* Cabeçalho */}
            <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-sm">Revisão de Faixas de Preço</p>
                <p className="text-white/70 text-xs mt-0.5">{divisionName}</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="text-white/60 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo */}
            <div className="px-6 py-5 space-y-3">
              <p className="text-[#28071C]/60 text-xs">O que deseja revisar?</p>

              {/* Opção 1 — Ajuste de Ciclo */}
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  navigate(`/module3-price-pyramid/${divId}`, {
                    state: {
                      plannedAvgPrice: block.indicators.avgPrice,
                      seasonId,
                      referenceSeasonId,
                      tenantId,
                    },
                  });
                }}
                className="w-full text-left flex items-start gap-4 px-4 py-4 border-2 border-[#7598CF]/30 rounded-xl hover:border-[#7598CF] hover:bg-[#7598CF]/4 transition-all group"
              >
                <div className="mt-0.5 w-8 h-8 rounded-full bg-[#7598CF]/15 flex items-center justify-center flex-shrink-0 group-hover:bg-[#7598CF]/25 transition-colors">
                  <BarChart3 className="w-4 h-4 text-[#7598CF]" />
                </div>
                <div>
                  <p className="text-[#28071C] font-semibold text-sm">
                    Ajustar Média de Preço
                    <span className="ml-2 text-[10px] font-normal text-[#7598CF] bg-[#7598CF]/10 px-2 py-0.5 rounded-full">Ajuste de Ciclo</span>
                  </p>
                  <p className="text-[#28071C]/55 text-xs mt-1 leading-relaxed">
                    Altera a média de preço que se estima atingir na faixa de preço dentro da categoria. Ideal para corrigir distorções do histórico do ano anterior ou alinhar a média aos produtos específicos que irão compor o estoque deste ciclo.
                  </p>
                  <p className="text-[#7598CF] text-[10px] font-semibold mt-2">
                    Não altera as configurações estruturais do sistema.
                  </p>
                </div>
              </button>

              {/* Opção 2 — Ajuste Estrutural */}
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  navigate("/operation-settings", {
                    state: { openCard: "faixas-preco" },
                  });
                }}
                className="w-full text-left flex items-start gap-4 px-4 py-4 border-2 border-[#28071C]/15 rounded-xl hover:border-[#28071C]/40 hover:bg-[#28071C]/3 transition-all group"
              >
                <div className="mt-0.5 w-8 h-8 rounded-full bg-[#28071C]/8 flex items-center justify-center flex-shrink-0 group-hover:bg-[#28071C]/15 transition-colors">
                  <Layers className="w-4 h-4 text-[#28071C]/70" />
                </div>
                <div>
                  <p className="text-[#28071C] font-semibold text-sm">
                    Redefinir Limites da Faixa
                    <span className="ml-2 text-[10px] font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Ajuste Estrutural</span>
                  </p>
                  <p className="text-[#28071C]/55 text-xs mt-1 leading-relaxed">
                    Altera os valores de início e fim da faixa de preço de forma permanente nas configurações da divisão. Ideal para repasses de inflação, aumento de custos de matéria-prima ou reposicionamento da categoria.
                  </p>
                  <p className="text-amber-700 text-[10px] font-semibold mt-2">
                    Atenção: Os novos limites passarão a valer para este e para todos os planejamentos futuros.
                  </p>
                </div>
              </button>
            </div>

            {/* Rodapé */}
            <div className="px-6 pb-5">
              <button
                onClick={() => setShowReviewModal(false)}
                className="w-full text-center text-xs text-[#28071C]/40 hover:text-[#28071C]/70 transition-colors py-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Cabeçalho do segmento */}
      <div className="bg-[#28071C] rounded-xl px-3 py-2">
        <div className="text-[#F6F3AA] text-[11px] font-bold uppercase tracking-wide">
          {DEFAULT_DIVISIONS[divId]}
        </div>
        <div className="text-[#F6F3AA]/55 text-[10px] mt-0.5">
          {block.participation}% · PMV R${block.indicators.avgPrice.toFixed(0)} · M {block.indicators.margin.toFixed(0)}% · ST {block.indicators.sellThrough.toFixed(0)}%
        </div>
      </div>

      {/* Bloco 1 — Indicadores Comerciais */}
      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border-l-2 border-[#7598CF] shadow-sm">
        <div className="text-[10px] uppercase font-bold text-[#28071C]/50 mb-2 tracking-wide">
          Indicadores Comerciais
        </div>
        <div className="space-y-1.5">
          <CompactField
            label="PMV (R$)"
            value={block.indicators.avgPrice}
            onChange={(v) => onUpdateIndicators({ avgPrice: v })}
            tooltip="Preço Médio de Venda — valor médio por peça desta divisão. Determina o volume de peças necessário para atingir a receita da divisão."
          />
          <CompactField
            label="MKD"
            value={block.indicators.mkd}
            onChange={(v) => onUpdateIndicators({ mkd: v })}
            suffix="%"
            min={0}
            max={100}
            tooltip="Percentual de desconto médio aplicado sobre a receita bruta. Markdown alto corrói a margem da divisão."
          />
          <CompactField
            label="Margem"
            value={block.indicators.margin}
            onChange={(v) => onUpdateIndicators({ margin: v })}
            suffix="%"
            min={0}
            max={100}
            tooltip="Margem Bruta — percentual que sobra da receita após o custo dos produtos desta divisão."
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-0.5">
              <label className="text-[10px] text-[#28071C]/60 font-semibold uppercase tracking-wide">ST</label>
              <div className="group relative ml-0.5">
                <Info className="w-3 h-3 text-[#28071C]/30 cursor-help" />
                <div className="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 w-48 bg-[#28071C] text-white text-[10px] rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  ST = Vendas ÷ (Est. inicial + Reposições)
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <input
                type="number"
                value={block.indicators.sellThrough}
                onChange={(e) => onUpdateIndicators({ sellThrough: Number(e.target.value) })}
                min={0} max={100}
                className="w-16 px-1.5 py-1 border border-[#28071C]/15 rounded-md text-[11px] font-semibold text-right text-[#28071C] bg-white focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50"
              />
              <span className="text-[10px] text-[#28071C]/50 w-4">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco 2 — Pirâmide de Preço */}
      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border-l-2 border-[#7598CF] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase font-bold text-[#28071C]/50 tracking-wide">Pirâmide de Preço</div>
          <button
            onClick={() => setShowReviewModal(true)}
            className="flex items-center gap-0.5 text-[10px] font-semibold text-[#7598CF] hover:text-[#28071C] transition-colors"
          >
            Revisão <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-1.5">
          {([
            { label: "P1 Entrada", range: block.priceRange.entry,   pct: block.priceRange.entryPercent,   color: "bg-blue-500",  tierId: "p1" as PriceTierId },
            { label: "P2 Médio",   range: block.priceRange.middle,  pct: block.priceRange.middlePercent,  color: "bg-amber-500", tierId: "p2" as PriceTierId },
            { label: "P3 Premium", range: block.priceRange.premium, pct: block.priceRange.premiumPercent, color: "bg-[#28071C]", tierId: "p3" as PriceTierId },
          ]).map((item) => {
            // Usa média histórica real quando disponível; caso contrário usa ponto médio do range
            const histAvg = historicalAvgs[divId]?.[item.tierId];
            const mid = histAvg ?? parsePriceMidpoint(item.range);
            return (
              <div key={item.label} className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.color}`} />
                  <span className="text-[10px] text-[#28071C]/60 font-semibold truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-[#28071C]/40">{item.range || "—"}</span>
                  <span className="text-[11px] font-bold text-[#28071C]">{item.pct.toFixed(0)}%</span>
                  {mid != null && (
                    <span className={`text-[10px] ${histAvg != null ? "text-[#7598CF] font-semibold" : "text-[#28071C]/50"}`}>
                      R${Math.round(mid)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bloco 3 — Matriz de Risco */}
      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border-l-2 border-[#7598CF] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase font-bold text-[#28071C]/50 tracking-wide">Matriz de Risco</div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
            riskValid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}>
            {riskValid ? "100%" : `${riskTotal.toFixed(0)}%`}
          </span>
        </div>
        <div className="space-y-1.5">
          <CompactRiskField label="Sustentador de Margem" value={block.riskMatrix.sustentadorMargem} onChange={(v) => onUpdateRiskMatrix({ sustentadorMargem: v })} color="bg-blue-500" />
          <CompactRiskField label="Motor de Giro"        value={block.riskMatrix.motorGiro}        onChange={(v) => onUpdateRiskMatrix({ motorGiro: v })}        color="bg-amber-500" />
          <CompactRiskField label="Ícone de Marca"       value={block.riskMatrix.iconeMarca}       onChange={(v) => onUpdateRiskMatrix({ iconeMarca: v })}       color="bg-red-500" />
        </div>
        <div className="mt-2 h-1 rounded-full overflow-hidden flex">
          <div className="bg-blue-500  transition-all duration-300" style={{ width: `${block.riskMatrix.sustentadorMargem}%` }} />
          <div className="bg-amber-500 transition-all duration-300" style={{ width: `${block.riskMatrix.motorGiro}%` }} />
          <div className="bg-red-500   transition-all duration-300" style={{ width: `${block.riskMatrix.iconeMarca}%` }} />
        </div>
      </div>

      {/* Bloco 4 — Volume / Orçamento + Cobertura */}
      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border-l-2 border-[#7598CF] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase font-bold text-[#28071C]/50 tracking-wide">Volume / Orçamento</div>
          <div className="flex bg-[#28071C]/10 rounded p-0.5">
            <button
              onClick={() => setIsProducer(true)}
              className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-all ${isProducer ? "bg-[#28071C] text-white" : "text-[#28071C]/60"}`}
            >Prod</button>
            <button
              onClick={() => setIsProducer(false)}
              className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-all ${!isProducer ? "bg-[#28071C] text-white" : "text-[#28071C]/60"}`}
            >Rev</button>
          </div>
        </div>
        <div className="space-y-1.5">
          {isProducer ? (
            <CompactField
              label="Volume (pçs)"
              value={block.volumeCoverage.productionVolume ?? 0}
              onChange={(v) => onUpdateVolume({ productionVolume: v })}
              tooltip="Total de peças a produzir nesta divisão para a temporada. Determina o investimento total em produção."
            />
          ) : (
            <CompactField
              label="Orçamento (R$)"
              value={block.volumeCoverage.orcamento ?? 0}
              onChange={(v) => onUpdateVolume({ orcamento: v })}
              tooltip="Estimativa de orçamento previsto para comprar ou produzir mercadoria desta divisão. Calculado a partir da receita alvo e margem definidas — previsão inicial, a confirmar com o desenvolvimento da coleção."
            />
          )}
          <CompactField
            label="Cobertura (d)"
            value={block.volumeCoverage.coverage}
            onChange={(v) => onUpdateVolume({ coverage: v })}
            tooltip="Quantos dias o estoque disponível cobre as vendas planejadas. Cobertura alta aumenta risco de sobrestoque e capital parado."
          />
          <CompactField
            label="Est. Inicial"
            value={block.volumeCoverage.initialStock}
            onChange={(v) => onUpdateVolume({ initialStock: v })}
            tooltip="Quantidade de peças em estoque no início da temporada para esta divisão."
          />
          <CompactField
            label="Reposições"
            value={block.volumeCoverage.replenishments}
            onChange={(v) => onUpdateVolume({ replenishments: v })}
            tooltip="Quantidade de peças de reposição previstas para recebimento ao longo da temporada."
          />
          <CompactField label="Vendas Esp."     value={block.volumeCoverage.unitsExpectedSold} onChange={(v) => onUpdateVolume({ unitsExpectedSold: v })} />
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#28071C]/10">
            <label className="text-[10px] text-[#28071C]/60 font-semibold uppercase tracking-wide shrink-0">ST Calc.</label>
            <div className="px-2 py-1 bg-[#28071C]/5 border border-[#28071C]/10 rounded-md text-[11px] font-bold text-[#28071C]">
              {block.volumeCoverage.initialStock + block.volumeCoverage.replenishments > 0
                ? `${((block.volumeCoverage.unitsExpectedSold / (block.volumeCoverage.initialStock + block.volumeCoverage.replenishments)) * 100).toFixed(1)}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Helpers de campos ────────────────────────────────────────────────────────

function parsePriceMidpoint(range: string): number | null {
  if (!range) return null;
  const parts = range.split("-").map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] + parts[1]) / 2;
  }
  return null;
}

function CompactField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-0.5 shrink-0">
        <label className="text-[10px] text-[#28071C]/60 font-semibold uppercase tracking-wide leading-tight">
          {label}
        </label>
        {tooltip && (
          <div className="group relative ml-0.5">
            <Info className="w-3 h-3 text-[#28071C]/25 cursor-help group-hover:text-[#7598CF] transition-colors" />
            <div className="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 w-52 bg-[#28071C] text-white text-[10px] rounded-lg p-2.5 opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-30 leading-relaxed">
              {tooltip}
              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#28071C]" />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="w-16 px-1.5 py-1 border border-[#28071C]/15 rounded-md text-[11px] font-semibold text-right text-[#28071C] bg-white focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50"
        />
        {suffix && <span className="text-[10px] text-[#28071C]/50 w-4">{suffix}</span>}
      </div>
    </div>
  );
}

function CompactRiskField({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
        <label className="text-[10px] text-[#28071C]/60 font-semibold uppercase tracking-wide truncate">{label}</label>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={0}
          max={100}
          className="w-16 px-1.5 py-1 border border-[#28071C]/15 rounded-md text-[11px] font-semibold text-right text-[#28071C] bg-white focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50"
        />
        <span className="text-[10px] text-[#28071C]/50 w-4">%</span>
      </div>
    </div>
  );
}
