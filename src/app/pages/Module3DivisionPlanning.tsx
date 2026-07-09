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
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";

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
} from "../../services/module3ScenarioService";
import {
  listDivisionScenarios,
  saveDivisionScenario,
  deleteDivisionScenario,
} from "../../services/supabase/divisionScenarioService";
import { useModule3 } from "../../hooks/useModule3";

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

const FALLBACK_TEMPORADAS: Temporada[] = [
  { id: 1, nome: "Verão 2027",   mesInicio: "Outubro", mesFim: "Março" },
  { id: 2, nome: "Inverno 2027", mesInicio: "Abril",   mesFim: "Setembro" },
];

// ─── Utilitário: derivar meta macro da temporada a partir do Módulo 1 ─────────

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function countSeasonMonths(mesInicio: string, mesFim: string): number {
  const startIdx = MONTHS_PT.indexOf(mesInicio);
  const endIdx = MONTHS_PT.indexOf(mesFim);
  if (startIdx < 0 || endIdx < 0) return 6;
  return endIdx >= startIdx ? endIdx - startIdx + 1 : (12 - startIdx) + endIdx + 1;
}

function seasonFiscalLabel(mesInicio: string, mesFim: string): string {
  const si = MONTHS_PT.indexOf(mesInicio);
  const ei = MONTHS_PT.indexOf(mesFim);
  const months = countSeasonMonths(mesInicio, mesFim);
  const start = si >= 0 ? MONTHS_SHORT[si] : mesInicio;
  const end = ei >= 0 ? MONTHS_SHORT[ei] : mesFim;
  return `${start} → ${end} · ${months} meses fiscais`;
}

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
  const [expandedDivision, setExpandedDivision] = useState<BusinessDivisionId | null>(null);
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioListVersion, setScenarioListVersion] = useState(0);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);

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

      // Carregar temporadas do Supabase
      if (tid) {
        import("../../services/temporadaService").then(({ getTemporadas }) =>
          getTemporadas(tid).then(seasons => {
            if (seasons.length > 0) {
              setTemporadas(seasons);
              setSelectedSeasonId(String(seasons[0].id));
              if (seasons.length > 1) setReferenceSeasonId(String(seasons[1].id));
            } else {
              setTemporadas(FALLBACK_TEMPORADAS);
              setSelectedSeasonId(String(FALLBACK_TEMPORADAS[0].id));
              setReferenceSeasonId(String(FALLBACK_TEMPORADAS[1].id));
            }
          })
        ).catch(() => {
          // Fallback para localStorage
          try {
            const stored = localStorage.getItem("fashionmind_temporadas");
            if (stored) {
              const parsed: Temporada[] = JSON.parse(stored);
              setTemporadas(parsed);
              if (parsed.length > 0) {
                setSelectedSeasonId(String(parsed[0].id));
                if (parsed.length > 1) setReferenceSeasonId(String(parsed[1].id));
              }
            }
          } catch { /* ignore */ }
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

  const handleApplyMetas = () => {
    const active = scenarios.find(s => s.isActive);
    if (active) {
      applyModule3Scenario(selectedSeasonId, active.id);
      setScenarioListVersion(v => v + 1);
    } else if (scenarios.length > 0) {
      // aplica o primeiro cenário se nenhum estiver ativo
      applyModule3Scenario(selectedSeasonId, scenarios[0].id);
      setScenarioListVersion(v => v + 1);
    }
    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 2500);
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

          {temporadas.length === 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 mt-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                Nenhuma temporada configurada. Configure as temporadas em{" "}
                <button
                  onClick={() => navigate("/operation-settings")}
                  className="underline font-semibold"
                >
                  Configurações de Operação
                </button>
                .
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

              {/* E — Consolidado de Metas Macro (sticky, compacto) */}
              <div id="tour-m3-consolidated" className={`rounded-xl px-4 py-2.5 shadow-sm border-t-4 ${
                meetsTarget ? "bg-green-50 border-green-500" : "bg-red-50 border-red-500"
              }`}>
                <div className="flex items-center gap-3">
                  {meetsTarget
                    ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                  <span className={`text-[11px] font-bold shrink-0 ${meetsTarget ? "text-green-800" : "text-red-800"}`}>
                    {meetsTarget ? "Metas atingidas" : "Metas NÃO atingidas"}
                  </span>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    {[
                      {
                        label: "Receita",
                        value: fmtCurrency(state.consolidated.totalRevenue),
                        target: macroTargets.revenue > 0 ? fmtCurrency(macroTargets.revenue) : "—",
                        gap: macroTargets.revenue > 0 ? fmtCurrency(state.consolidated.totalRevenue - macroTargets.revenue) : null,
                        meets: macroTargets.revenue === 0 || state.consolidated.totalRevenue >= macroTargets.revenue * 0.95,
                      },
                      {
                        label: "Margem",
                        value: fmtPct(state.consolidated.avgMargin),
                        target: fmtPct(macroTargets.margin),
                        gap: fmtPct(state.consolidated.avgMargin - macroTargets.margin),
                        meets: state.consolidated.avgMargin >= macroTargets.margin * 0.95,
                      },
                      {
                        label: "Sell-Through",
                        value: fmtPct(state.consolidated.avgSellThrough),
                        target: fmtPct(macroTargets.sellThrough),
                        gap: fmtPct(state.consolidated.avgSellThrough - macroTargets.sellThrough),
                        meets: state.consolidated.avgSellThrough >= macroTargets.sellThrough * 0.95,
                      },
                      {
                        label: "GMROI",
                        value: `${state.consolidated.avgGmroi.toFixed(2)}x`,
                        target: `${macroTargets.gmroi.toFixed(2)}x`,
                        gap: `${(state.consolidated.avgGmroi - macroTargets.gmroi).toFixed(2)}x`,
                        meets: state.consolidated.avgGmroi >= macroTargets.gmroi * 0.95,
                      },
                    ].map((item, i) => (
                      <div key={i} className={`rounded-lg px-2.5 py-1.5 border bg-white/80 ${
                        item.meets ? "border-green-200" : "border-red-200"
                      }`}>
                        <div className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">{item.label}</div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className={`text-[13px] font-bold ${item.meets ? "text-green-700" : "text-red-700"}`}>
                            {item.value}
                          </span>
                          <span className="text-[10px] text-[#28071C]/40">/ {item.target}</span>
                        </div>
                        {item.gap !== null && (
                          <div className={`text-[10px] font-semibold ${item.meets ? "text-green-600" : "text-red-600"}`}>
                            Δ {item.gap}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

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
            <button
              onClick={handleApplyMetas}
              disabled={scenarios.length === 0}
              title={scenarios.length === 0 ? "Salve um cenário antes de aplicar" : activeScenario ? `Aplicar metas do cenário "${activeScenario.name}"` : "Aplicar metas do último cenário salvo"}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <CheckCheck className="w-4 h-4" />
              Aplicar metas
            </button>
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
}

function DivisionBlockCard({
  divId,
  block,
  onUpdateIndicators,
  onUpdateRiskMatrix,
  onUpdateVolume,
}: DivisionBlockCardProps) {
  const navigate = useNavigate();
  const [isProducer, setIsProducer] = useState(true);

  const riskValid = isValidRiskMatrix(block.riskMatrix);
  const riskTotal = block.riskMatrix.sustentadorMargem + block.riskMatrix.motorGiro + block.riskMatrix.iconeMarca;

  return (
    <div className="space-y-2">

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
            onClick={() => navigate(`/module3-price-pyramid/${divId}`, { state: { plannedAvgPrice: block.indicators.avgPrice } })}
            className="flex items-center gap-0.5 text-[10px] font-semibold text-[#7598CF] hover:text-[#28071C] transition-colors"
          >
            Revisão <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-1.5">
          {[
            { label: "P1 Entrada", range: block.priceRange.entry,   pct: block.priceRange.entryPercent,   color: "bg-blue-500" },
            { label: "P2 Médio",   range: block.priceRange.middle,  pct: block.priceRange.middlePercent,  color: "bg-amber-500" },
            { label: "P3 Premium", range: block.priceRange.premium, pct: block.priceRange.premiumPercent, color: "bg-[#28071C]" },
          ].map((item) => {
            const mid = parsePriceMidpoint(item.range);
            return (
              <div key={item.label} className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.color}`} />
                  <span className="text-[10px] text-[#28071C]/60 font-semibold truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-[#28071C]/40">{item.range || "—"}</span>
                  <span className="text-[11px] font-bold text-[#28071C]">{item.pct.toFixed(0)}%</span>
                  {mid != null && <span className="text-[10px] text-[#28071C]/50">R${mid.toFixed(0)}</span>}
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
              tooltip="Open-To-Buy — orçamento disponível para comprar mercadoria desta divisão. Controla o nível de investimento em estoque."
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
