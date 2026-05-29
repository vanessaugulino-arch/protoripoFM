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
} from "lucide-react";
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
import { useModule3 } from "../../hooks/useModule3";

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface UserData {
  name: string;
  email: string;
  profile: string;
}

interface Temporada {
  id: number;
  nome: string;
  mesInicio: string;
  mesFim: string;
}

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
    const latestYear = Math.max(...plannedYears);
    const cycle = getPlanCycle(latestYear);
    const values = cycle?.versions?.[0]?.values ?? {};
    annualRevenue = (values.receitaBruta as number) ?? 0;
    margin = (values.margemBruta as number) ?? 48;
    gmroi = (values.gmroi as number) ?? 3.5;
  }

  return {
    seasonId: String(temporada.id),
    revenue: (monthCount / 12) * annualRevenue,
    margin,
    sellThrough: 75,
    gmroi,
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Module3DivisionPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [referenceSeasonId, setReferenceSeasonId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDivision, setExpandedDivision] = useState<BusinessDivisionId | null>(null);
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioListVersion, setScenarioListVersion] = useState(0);

  // ─── Inicialização ───────────────────────────────────────────────────────
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
    } catch {
      // temporadas não configuradas ainda
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

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  // ─── Helpers de formatação ────────────────────────────────────────────────

  const fmtCurrency = (v: number) =>
    v === 0 ? "—" : `R$ ${(v / 1_000_000).toFixed(2)}M`;

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">

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
              <span className="text-[#F6F3AA] text-xl font-semibold">
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
              onClick={handleLogout}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PARTE A — SELEÇÃO DE TEMPORADA E REFERÊNCIA                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF]">
          <h2 className="text-[#28071C] text-lg font-bold mb-4">Temporada de Planejamento</h2>

          <div className="grid grid-cols-2 gap-6 mb-4">
            {/* Temporada a planejar */}
            <div>
              <label className="block text-[#28071C]/70 text-xs uppercase tracking-wide font-semibold mb-2">
                Temporada a Planejar
              </label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full bg-white rounded-xl px-4 py-3 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 font-medium cursor-pointer"
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
                className="w-full bg-white rounded-xl px-4 py-3 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 font-medium cursor-pointer"
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
            {/* PARTE C — CARD FIXO: DISTRIBUIÇÃO DE PARTICIPAÇÃO             */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className="sticky top-[72px] z-30 bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-md border-t-4 border-[#7598CF]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#28071C]" />
                  <h2 className="text-[#28071C] font-bold">Distribuição de Participação por Divisão</h2>
                </div>
                <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${
                  participationValid
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}>
                  {participationValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  Total: {totalParticipation.toFixed(1)}%
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {(["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).map((divId) => {
                  const block = state.divisions[divId];
                  if (!block) return null;
                  return (
                    <div
                      key={divId}
                      className="bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3"
                    >
                      <div className="text-xs uppercase tracking-wide text-[#28071C]/60 mb-2 font-semibold">
                        {DEFAULT_DIVISIONS[divId]}
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <input
                          type="number"
                          value={block.participation}
                          onChange={(e) => updateDivisionParticipation(divId, Number(e.target.value))}
                          min={0}
                          max={100}
                          className="w-full bg-white rounded-lg px-2 py-1.5 text-[#28071C] text-xl font-bold border-2 border-[#28071C]/15 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 text-center"
                        />
                        <span className="text-[#28071C]/50 font-semibold">%</span>
                      </div>
                      <div className="h-1.5 bg-[#28071C]/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#7598CF] to-[#28071C] rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(block.participation, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PARTE D — BLOCOS DE PLANEJAMENTO POR DIVISÃO                  */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className="space-y-4">
              {(["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).map((divId) => (
                <DivisionBlockCard
                  key={divId}
                  divId={divId}
                  block={state.divisions[divId]}
                  expanded={expandedDivision === divId}
                  onExpand={() =>
                    setExpandedDivision(expandedDivision === divId ? null : divId)
                  }
                  onUpdateIndicators={(ind) => updateIndicators(divId, ind)}
                  onUpdatePriceRange={(range) => updatePriceRange(divId, range)}
                  onUpdateRiskMatrix={(matrix) => updateRiskMatrix(divId, matrix)}
                  onUpdateVolume={(vol) => updateVolumeCoverage(divId, vol)}
                />
              ))}
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PARTE E — CONSOLIDADO COM VALIDAÇÃO DE METAS MACRO            */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className={`rounded-2xl p-6 shadow-sm border-t-4 ${
              meetsTarget ? "bg-green-50 border-green-500" : "bg-red-50 border-red-500"
            }`}>
              <div className="flex items-center gap-3 mb-5">
                {meetsTarget ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                )}
                <div>
                  <h2 className={`text-lg font-bold ${meetsTarget ? "text-green-900" : "text-red-900"}`}>
                    {meetsTarget
                      ? "Consolidado atinge as metas macro"
                      : "Consolidado NÃO atinge as metas macro"}
                  </h2>
                  {!meetsTarget && (
                    <p className="text-sm text-red-700 mt-0.5">
                      Ajuste as proporções ou indicadores das divisões para convergir ao plano macro.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {[
                  {
                    label: "Receita Total",
                    value: fmtCurrency(state.consolidated.totalRevenue),
                    target: macroTargets.revenue > 0 ? fmtCurrency(macroTargets.revenue) : "—",
                    gap: macroTargets.revenue > 0
                      ? fmtCurrency(state.consolidated.totalRevenue - macroTargets.revenue)
                      : null,
                    meets:
                      macroTargets.revenue === 0 ||
                      state.consolidated.totalRevenue >= macroTargets.revenue * 0.95,
                  },
                  {
                    label: "Margem Média",
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
                  <div
                    key={i}
                    className={`rounded-xl p-4 border-2 bg-white ${
                      item.meets ? "border-green-300" : "border-red-300"
                    }`}
                  >
                    <div className="text-xs text-[#28071C]/60 uppercase tracking-wide mb-2 font-semibold">
                      {item.label}
                    </div>
                    <div className={`text-2xl font-bold mb-1 ${item.meets ? "text-green-700" : "text-red-700"}`}>
                      {item.value}
                    </div>
                    <div className="text-xs text-[#28071C]/50">
                      Meta equivalente: <span className="font-semibold text-[#28071C]/70">{item.target}</span>
                    </div>
                    {item.gap !== null && (
                      <div className={`text-xs mt-1 font-semibold ${item.meets ? "text-green-600" : "text-red-600"}`}>
                        Gap: {item.gap}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PARTE F — CENÁRIOS                                            */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-[#28071C]" />
                  <h2 className="text-[#28071C] font-bold text-lg">Cenários</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowScenarioModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 transition-all text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    Salvar Cenário
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C] rounded-xl hover:bg-[#28071C]/5 transition-all text-sm font-semibold"
                  >
                    <Download className="w-4 h-4" />
                    Exportar
                  </button>
                </div>
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
  onUpdatePriceRange: (range: Partial<PriceRange>) => void;
  onUpdateRiskMatrix: (matrix: Partial<RiskMatrix>) => void;
  onUpdateVolume: (vol: Partial<VolumeAndCoverage>) => void;
}

function DivisionBlockCard({
  divId,
  block,
  expanded,
  onExpand,
  onUpdateIndicators,
  onUpdatePriceRange,
  onUpdateRiskMatrix,
  onUpdateVolume,
}: DivisionBlockCardProps) {
  const [isProducer, setIsProducer] = useState(true);

  const riskValid = isValidRiskMatrix(block.riskMatrix);
  const priceValid = isValidPriceRange(block.priceRange);
  const riskTotal = block.riskMatrix.basics + block.riskMatrix.fashion + block.riskMatrix.highFashion;
  const priceTotal = block.priceRange.entryPercent + block.priceRange.middlePercent + block.priceRange.premiumPercent;

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm border-l-4 border-[#28071C]">
      {/* Header colapsível */}
      <button
        onClick={onExpand}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#28071C]/5 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#28071C] flex items-center justify-center text-[#F6F3AA] font-bold text-sm">
            {DEFAULT_DIVISIONS[divId][0]}
          </div>
          <div className="text-left">
            <div className="font-bold text-[#28071C]">{DEFAULT_DIVISIONS[divId]}</div>
            <div className="text-sm text-[#28071C]/60">
              {block.participation}% participação · PMV R$ {block.indicators.avgPrice.toFixed(0)} ·
              Margem {block.indicators.margin.toFixed(1)}% · ST {block.indicators.sellThrough.toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="text-[#28071C]/50">
          {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t border-[#28071C]/10 space-y-8 pt-6">

          {/* ── BLOCO 1: Indicadores Comerciais ──────────────────────────── */}
          <section>
            <h4 className="text-xs uppercase tracking-wide font-bold text-[#28071C]/70 mb-4">
              Bloco 1 — Indicadores Comerciais e de Rentabilidade
            </h4>
            <div className="grid grid-cols-4 gap-4">
              <FieldInput
                label="Preço Médio de Venda (R$)"
                value={block.indicators.avgPrice}
                onChange={(v) => onUpdateIndicators({ avgPrice: v })}
              />
              <FieldInput
                label="MKD %"
                value={block.indicators.mkd}
                onChange={(v) => onUpdateIndicators({ mkd: v })}
                suffix="%"
                min={0}
                max={100}
              />
              <FieldInput
                label="Margem %"
                value={block.indicators.margin}
                onChange={(v) => onUpdateIndicators({ margin: v })}
                suffix="%"
                min={0}
                max={100}
              />
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <label className="text-xs text-[#28071C]/60 font-semibold uppercase tracking-wide">
                    Sell-Through %
                  </label>
                  <div className="group relative">
                    <Info className="w-3.5 h-3.5 text-[#28071C]/40 cursor-help" />
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-64 bg-[#28071C] text-white text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <p className="font-semibold mb-1">Sell-Through</p>
                      <p>Mede o % de produtos vendidos ao longo da vida da coleção.</p>
                      <p className="mt-1 font-mono text-[10px] bg-white/10 rounded px-2 py-1">
                        ST = Vendas ÷ (Est. inicial + Reposições)
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={block.indicators.sellThrough}
                    onChange={(e) => onUpdateIndicators({ sellThrough: Number(e.target.value) })}
                    min={0}
                    max={100}
                    className="flex-1 px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
                  />
                  <span className="text-xs text-[#28071C]/50">%</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── BLOCO 2: Faixa de Preço ──────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs uppercase tracking-wide font-bold text-[#28071C]/70">
                Bloco 2 — Planejamento / Revisão da Faixa de Preço
              </h4>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                priceValid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}>
                {priceValid ? "Soma 100%" : `Soma: ${priceTotal.toFixed(0)}%`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "Entrada (faixa R$)", field: "entry" as keyof PriceRange },
                { label: "Médio (faixa R$)", field: "middle" as keyof PriceRange },
                { label: "Premium (faixa R$)", field: "premium" as keyof PriceRange },
              ].map((item) => (
                <div key={item.field}>
                  <label className="text-xs text-[#28071C]/60 mb-1.5 block font-semibold uppercase tracking-wide">
                    {item.label}
                  </label>
                  <input
                    type="text"
                    value={block.priceRange[item.field] as string}
                    onChange={(e) => onUpdatePriceRange({ [item.field]: e.target.value })}
                    placeholder="Ex: 119-169"
                    className="w-full px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#28071C]/10">
              {[
                { label: "% Entrada", field: "entryPercent" as keyof PriceRange },
                { label: "% Médio", field: "middlePercent" as keyof PriceRange },
                { label: "% Premium", field: "premiumPercent" as keyof PriceRange },
              ].map((item) => (
                <FieldInput
                  key={item.field}
                  label={item.label}
                  value={block.priceRange[item.field] as number}
                  onChange={(v) => onUpdatePriceRange({ [item.field]: v })}
                  suffix="%"
                  min={0}
                  max={100}
                />
              ))}
            </div>
          </section>

          {/* ── BLOCO 3: Matriz de Risco ─────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs uppercase tracking-wide font-bold text-[#28071C]/70">
                Bloco 3 — Planejamento de Risco por Divisão
              </h4>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                riskValid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}>
                {riskValid ? "Soma 100%" : `Soma: ${riskTotal.toFixed(0)}%`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <RiskFieldInput
                label="Básicos"
                description="Produtos recorrentes / baixo risco"
                value={block.riskMatrix.basics}
                onChange={(v) => onUpdateRiskMatrix({ basics: v })}
                color="bg-blue-500"
              />
              <RiskFieldInput
                label="Moda"
                description="Produtos de tendência / risco médio"
                value={block.riskMatrix.fashion}
                onChange={(v) => onUpdateRiskMatrix({ fashion: v })}
                color="bg-amber-500"
              />
              <RiskFieldInput
                label="Alta Moda"
                description="Produtos de imagem / alto risco"
                value={block.riskMatrix.highFashion}
                onChange={(v) => onUpdateRiskMatrix({ highFashion: v })}
                color="bg-red-500"
              />
            </div>
            {/* Barra visual da matriz */}
            <div className="mt-3 h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-500 transition-all duration-300"
                style={{ width: `${block.riskMatrix.basics}%` }}
              />
              <div
                className="bg-amber-500 transition-all duration-300"
                style={{ width: `${block.riskMatrix.fashion}%` }}
              />
              <div
                className="bg-red-500 transition-all duration-300"
                style={{ width: `${block.riskMatrix.highFashion}%` }}
              />
            </div>
          </section>

          {/* ── BLOCO 4: Volume / OTB + Cobertura ───────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs uppercase tracking-wide font-bold text-[#28071C]/70">
                Bloco 4 — Volume / OTB + Cobertura
              </h4>
              <div className="flex bg-[#28071C]/10 rounded-lg p-0.5">
                <button
                  onClick={() => setIsProducer(true)}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-all ${
                    isProducer ? "bg-[#28071C] text-white" : "text-[#28071C]/60"
                  }`}
                >
                  Produtor
                </button>
                <button
                  onClick={() => setIsProducer(false)}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-all ${
                    !isProducer ? "bg-[#28071C] text-white" : "text-[#28071C]/60"
                  }`}
                >
                  Revenda
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {isProducer ? (
                <FieldInput
                  label="Volume de Produção (peças)"
                  value={block.volumeCoverage.productionVolume ?? 0}
                  onChange={(v) => onUpdateVolume({ productionVolume: v })}
                />
              ) : (
                <FieldInput
                  label="OTB — Orçamento de Compra (R$)"
                  value={block.volumeCoverage.otbBudget ?? 0}
                  onChange={(v) => onUpdateVolume({ otbBudget: v })}
                />
              )}
              <FieldInput
                label="Cobertura (dias)"
                value={block.volumeCoverage.coverage}
                onChange={(v) => onUpdateVolume({ coverage: v })}
              />
              <FieldInput
                label="Estoque Inicial (peças)"
                value={block.volumeCoverage.initialStock}
                onChange={(v) => onUpdateVolume({ initialStock: v })}
              />
              <FieldInput
                label="Reposições no Período"
                value={block.volumeCoverage.replenishments}
                onChange={(v) => onUpdateVolume({ replenishments: v })}
              />
              <FieldInput
                label="Peças Esperadas Vendidas"
                value={block.volumeCoverage.unitsExpectedSold}
                onChange={(v) => onUpdateVolume({ unitsExpectedSold: v })}
              />
              {/* Sell-Through calculado */}
              <div>
                <label className="text-xs text-[#28071C]/60 mb-1.5 block font-semibold uppercase tracking-wide">
                  Sell-Through Calculado
                </label>
                <div className="px-3 py-2 bg-[#28071C]/5 border-2 border-[#28071C]/10 rounded-lg text-sm font-bold text-[#28071C]">
                  {block.volumeCoverage.initialStock + block.volumeCoverage.replenishments > 0
                    ? `${((block.volumeCoverage.unitsExpectedSold / (block.volumeCoverage.initialStock + block.volumeCoverage.replenishments)) * 100).toFixed(1)}%`
                    : "—"}
                </div>
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}

// ─── Helpers de campos ────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="text-xs text-[#28071C]/60 mb-1.5 block font-semibold uppercase tracking-wide">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="flex-1 px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
        />
        {suffix && <span className="text-xs text-[#28071C]/50 font-medium">{suffix}</span>}
      </div>
    </div>
  );
}

function RiskFieldInput({
  label,
  description,
  value,
  onChange,
  color,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <label className="text-xs text-[#28071C]/60 font-semibold uppercase tracking-wide">
          {label}
        </label>
      </div>
      <p className="text-xs text-[#28071C]/40 mb-2">{description}</p>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={0}
          max={100}
          className="flex-1 px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
        />
        <span className="text-xs text-[#28071C]/50">%</span>
      </div>
    </div>
  );
}
