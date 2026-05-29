/**
 * Módulo 3 - Planejamento por Divisão de Negócio (Temporada de Coleção)
 * 
 * Permite planejamento estratégico por divisão com focus em temporadas,
 * garantindo que o plano consolidado atinja as metas macro da organização.
 * 
 * Estrutura:
 * - PARTE A: Seleção de Temporada e Referência
 * - PARTE B: Mensagem de Orientação
 * - PARTE C: Card Fixo - Distribuição de Participação
 * - PARTE D: Blocos de Planejamento por Divisão
 * - PARTE E: Consolidado com Validação de Metas Macro
 * - PARTE F: Sistema de Cenários
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Save,
  Download,
  Plus,
  Trash2,
  AlertCircle,
  TrendingUp,
  Layers,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Eye,
  Copy,
} from "lucide-react";
import { ActionButton } from "../components/ActionButton";
import { DashboardHeader } from "../components/DashboardHeader";
import {
  BusinessDivisionId,
  DivisionPlanBlock,
  MacroTarget,
  DEFAULT_DIVISIONS,
  Module3Scenario,
} from "../types/module3";
import { useModule3 } from "../hooks/useModule3";

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

export default function Module3DivisionPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [referenceSeasonId, setReferenceSeasonId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // ─── Estado do Módulo 3 ────────────────────────────────────────────────────
  const {
    state,
    updateDivisionParticipation,
    updateIndicators,
    updatePriceRange,
    updateRiskMatrix,
    updateVolumeCoverage,
    calculateDivisionSellThrough,
    saveScenario,
    validateAgainstMacro,
  } = useModule3({
    seasonId: selectedSeasonId,
    referenceSeasonId: referenceSeasonId,
    macroTargets: {
      seasonId: selectedSeasonId,
      revenue: 10000000, // Exemplo: 10M
      margin: 48,
      sellThrough: 75,
      gmroi: 3.5,
    },
  });

  // ─── Estado Local da UI ─────────────────────────────────────────────────
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedScenarios, setSelectedScenarios] = useState<[string, string] | null>(null);
  const [expandedDivision, setExpandedDivision] = useState<BusinessDivisionId | null>(null);

  // ─── Inicialização ─────────────────────────────────────────────────────
  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      
      // Apenas CEOs podem acessar este módulo
      if (userData.profile !== "CEO") {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }

    // Carregar temporadas de OperationSettings
    try {
      const stored = localStorage.getItem("fashionmind_temporadas");
      if (stored) {
        const parsed = JSON.parse(stored);
        setTemporadas(parsed);
        if (parsed.length > 0) {
          setSelectedSeasonId(String(parsed[0].id));
          if (parsed.length > 1) {
            setReferenceSeasonId(String(parsed[1].id));
          }
        }
      }
    } catch (error) {
      console.error("Erro ao carregar temporadas:", error);
    }

    setIsLoading(false);
  }, [navigate]);

  if (!user || isLoading) return null;

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleSaveScenario = () => {
    if (!scenarioName.trim()) {
      alert("Nome do cenário é obrigatório");
      return;
    }
    saveScenario(scenarioName, scenarioDescription);
    setScenarioName("");
    setScenarioDescription("");
    setShowScenarioModal(false);
  };

  const handleExportScenarios = () => {
    const data = {
      season: temporadas.find(t => String(t.id) === selectedSeasonId),
      scenarios: state.scenarios,
      exportedAt: new Date().toISOString(),
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
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

  // ═══════════════════════════════════════════════════════════════════════════════════
  // ─── RENDER ────────────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════════

  const seasonName = temporadas.find(t => String(t.id) === selectedSeasonId)?.nome || "—";
  const referenceName = temporadas.find(t => String(t.id) === referenceSeasonId)?.nome || "—";
  const meetsTarget = validateAgainstMacro();

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind | Módulo 3 - Planejamento por Divisão</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span>{user.name}</span>
            </div>
            <button onClick={handleLogout} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        
        {/* ╔════════════════════════════════════════════════════════════════════╗ */}
        {/* ║ PARTE A — SELEÇÃO DE TEMPORADA E REFERÊNCIA                       ║ */}
        {/* ╚════════════════════════════════════════════════════════════════════╝ */}
        
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="grid grid-cols-2 gap-6 mb-4">
            {/* Temporada a Planejar */}
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide font-semibold mb-3">
                Temporada a Planejar
              </label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-3 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer font-medium"
              >
                <option value="">Selecione...</option>
                {temporadas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Temporada de Referência */}
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide font-semibold mb-3">
                Temporada de Referência (histórico)
              </label>
              <select
                value={referenceSeasonId}
                onChange={(e) => setReferenceSeasonId(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-3 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer font-medium"
              >
                <option value="">Selecione...</option>
                {temporadas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedSeasonId && referenceSeasonId && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">
              <CheckCircle className="w-4 h-4" />
              <span>
                Planejando <strong>{seasonName}</strong> com referência em <strong>{referenceName}</strong>
              </span>
            </div>
          )}
        </div>

        {selectedSeasonId && (
          <>
            {/* ╔════════════════════════════════════════════════════════════════════╗ */}
            {/* ║ PARTE B — MENSAGEM DE ORIENTAÇÃO                                  ║ */}
            {/* ╚════════════════════════════════════════════════════════════════════╝ */}
            
            <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg px-6 py-4">
              <p className="text-[#28071C] text-sm leading-relaxed">
                <strong>Planejamento por Divisão:</strong> Defina os indicadores de cada divisão para a temporada.
                O plano consolidado da temporada <strong>deve atingir obrigatoriamente as metas macro</strong> da organização definidas no Módulo 1.
                Ajuste proporções entre divisões, faixas de preço e matriz de risco para convergir ao objetivo.
              </p>
            </div>

            {/* ╔════════════════════════════════════════════════════════════════════╗ */}
            {/* ║ PARTE C — CARD FIXO: DISTRIBUIÇÃO DE PARTICIPAÇÃO POR DIVISÃO    ║ */}
            {/* ╚════════════════════════════════════════════════════════════════════╝ */}
            
            <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-md border-2 border-[#28071C]/10">
              <div className="flex items-center gap-3 mb-6">
                <Layers className="w-6 h-6 text-[#28071C]" />
                <h2 className="text-[#28071C] text-xl font-bold">Distribuição de Participação por Divisão</h2>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {(["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).map((divId) => {
                  const block = state.divisions[divId];
                  if (!block) return null;

                  return (
                    <div key={divId} className="bg-gradient-to-br from-[#28071C]/5 to-[#7598CF]/5 rounded-lg p-4 border border-[#28071C]/10">
                      <div className="text-xs uppercase tracking-wide text-[#28071C]/60 mb-2 font-semibold">
                        {DEFAULT_DIVISIONS[divId]}
                      </div>
                      <div className="flex items-end gap-2 mb-3">
                        <input
                          type="number"
                          value={block.participation}
                          onChange={(e) =>
                            updateDivisionParticipation(divId, Number(e.target.value))
                          }
                          min={0}
                          max={100}
                          className="flex-1 bg-white rounded px-2 py-2 text-[#28071C] text-lg font-bold border-2 border-[#28071C]/20 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                        />
                        <span className="text-[#28071C]/60 font-semibold">%</span>
                      </div>
                      <div
                        className="h-1 bg-gradient-to-r from-[#7598CF] to-[#28071C] rounded-full"
                        style={{ width: `${block.participation}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-sm text-[#28071C]/60">
                Total:{" "}
                <strong className="text-[#28071C]">
                  {(
                    Object.values(state.divisions).reduce((sum, d) => sum + d.participation, 0)
                  ).toFixed(1)}
                  %
                </strong>
              </div>
            </div>

            {/* ╔════════════════════════════════════════════════════════════════════╗ */}
            {/* ║ PARTE D — BLOCOS DE PLANEJAMENTO POR DIVISÃO                     ║ */}
            {/* ╚════════════════════════════════════════════════════════════════════╝ */}
            
            <div className="space-y-6">
              {(["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).map(
                (divId) => (
                  <DivisionPlanBlock
                    key={divId}
                    divId={divId}
                    block={state.divisions[divId]}
                    expanded={expandedDivision === divId}
                    onExpand={() =>
                      setExpandedDivision(
                        expandedDivision === divId ? null : divId
                      )
                    }
                    onUpdateIndicators={(indicators) =>
                      updateIndicators(divId, indicators)
                    }
                    onUpdatePriceRange={(priceRange) =>
                      updatePriceRange(divId, priceRange)
                    }
                    onUpdateRiskMatrix={(riskMatrix) =>
                      updateRiskMatrix(divId, riskMatrix)
                    }
                    onUpdateVolume={(volume) =>
                      updateVolumeCoverage(divId, volume)
                    }
                  />
                )
              )}
            </div>

            {/* ╔════════════════════════════════════════════════════════════════════╗ */}
            {/* ║ PARTE E — CONSOLIDADO COM VALIDAÇÃO DE METAS MACRO               ║ */}
            {/* ╚════════════════════════════════════════════════════════════════════╝ */}
            
            <div className={`rounded-2xl p-6 shadow-sm border-t-4 ${
              meetsTarget
                ? "bg-green-50 border-green-500"
                : "bg-red-50 border-red-500"
            }`}>
              <div className="flex items-center gap-3 mb-6">
                {meetsTarget ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                )}
                <h2 className={`text-xl font-bold ${
                  meetsTarget ? "text-green-900" : "text-red-900"
                }`}>
                  {meetsTarget
                    ? "✓ Consolidado atinge metas macro"
                    : "✗ Consolidado NÃO atinge metas macro"}
                </h2>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {[
                  {
                    label: "Receita Total",
                    value: `R$ ${(state.consolidated.totalRevenue / 1000000).toFixed(2)}M`,
                    target: `Meta: R$ ${(state.consolidated.macroTarget.revenue / 1000000).toFixed(2)}M`,
                    meets:
                      state.consolidated.totalRevenue >=
                      state.consolidated.macroTarget.revenue * 0.95,
                  },
                  {
                    label: "Margem Média",
                    value: `${state.consolidated.avgMargin.toFixed(1)}%`,
                    target: `Meta: ${state.consolidated.macroTarget.margin}%`,
                    meets:
                      state.consolidated.avgMargin >=
                      state.consolidated.macroTarget.margin * 0.95,
                  },
                  {
                    label: "Sell-Through",
                    value: `${state.consolidated.avgSellThrough.toFixed(1)}%`,
                    target: `Meta: ${state.consolidated.macroTarget.sellThrough}%`,
                    meets:
                      state.consolidated.avgSellThrough >=
                      state.consolidated.macroTarget.sellThrough * 0.95,
                  },
                  {
                    label: "GMROI",
                    value: `${state.consolidated.avgGmroi.toFixed(2)}x`,
                    target: `Meta: ${state.consolidated.macroTarget.gmroi}x`,
                    meets:
                      state.consolidated.avgGmroi >=
                      state.consolidated.macroTarget.gmroi * 0.95,
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-4 border-2 ${
                      item.meets
                        ? "border-green-300 bg-white"
                        : "border-red-300 bg-white"
                    }`}
                  >
                    <div className="text-xs text-[#28071C]/60 uppercase tracking-wide mb-2">
                      {item.label}
                    </div>
                    <div className={`text-lg font-bold ${
                      item.meets ? "text-green-700" : "text-red-700"
                    }`}>
                      {item.value}
                    </div>
                    <div className="text-xs text-[#28071C]/50 mt-1">
                      {item.target}
                    </div>
                  </div>
                ))}
              </div>

              {!meetsTarget && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg border border-red-300">
                  <p className="text-sm text-red-800">
                    <strong>Ação necessária:</strong> Ajuste as proporções ou indicadores das divisões para atingir as metas macro.
                  </p>
                </div>
              )}
            </div>

            {/* ╔════════════════════════════════════════════════════════════════════╗ */}
            {/* ║ PARTE F — CENÁRIOS                                               ║ */}
            {/* ╚════════════════════════════════════════════════════════════════════╝ */}
            
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-[#28071C]" />
                  <h2 className="text-[#28071C] text-xl font-bold">Cenários</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowScenarioModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Salvar Cenário
                  </button>
                  <button
                    onClick={handleExportScenarios}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-all text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Exportar
                  </button>
                </div>
              </div>

              {state.scenarios.length === 0 ? (
                <div className="text-center py-8 text-[#28071C]/60">
                  Nenhum cenário salvo ainda. Crie um para começar.
                </div>
              ) : (
                <div className="space-y-3">
                  {state.scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="flex items-center justify-between p-4 bg-white rounded-lg border border-[#28071C]/10 hover:bg-[#28071C]/5 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-[#28071C]">
                          {scenario.name}
                        </div>
                        {scenario.description && (
                          <div className="text-sm text-[#28071C]/60">
                            {scenario.description}
                          </div>
                        )}
                        <div className="text-xs text-[#28071C]/40 mt-1">
                          Criado em{" "}
                          {new Date(scenario.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors">
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
                <label className="block text-sm text-[#28071C]/70 mb-2">
                  Nome do Cenário
                </label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="Ex: Cenário Conservador"
                  className="w-full px-4 py-2 border-2 border-[#28071C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                />
              </div>

              <div>
                <label className="block text-sm text-[#28071C]/70 mb-2">
                  Descrição (opcional)
                </label>
                <textarea
                  value={scenarioDescription}
                  onChange={(e) => setScenarioDescription(e.target.value)}
                  placeholder="Descreva o objetivo deste cenário..."
                  rows={3}
                  className="w-full px-4 py-2 border-2 border-[#28071C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowScenarioModal(false)}
                className="flex-1 px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveScenario}
                className="flex-1 px-4 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-colors"
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

// ═══════════════════════════════════════════════════════════════════════════════════
// ─── COMPONENTE: Division Plan Block ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════════

interface DivisionPlanBlockProps {
  divId: BusinessDivisionId;
  block: DivisionPlanBlock;
  expanded: boolean;
  onExpand: () => void;
  onUpdateIndicators: (indicators: any) => void;
  onUpdatePriceRange: (range: any) => void;
  onUpdateRiskMatrix: (matrix: any) => void;
  onUpdateVolume: (volume: any) => void;
}

function DivisionPlanBlock({
  divId,
  block,
  expanded,
  onExpand,
  onUpdateIndicators,
  onUpdatePriceRange,
  onUpdateRiskMatrix,
  onUpdateVolume,
}: DivisionPlanBlockProps) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm border-l-4 border-[#28071C]">
      {/* Header Colapsível */}
      <button
        onClick={onExpand}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#28071C]/10 flex items-center justify-center">
            <span className="text-[#28071C] font-bold text-lg">
              {DEFAULT_DIVISIONS[divId].split(" ")[0][0]}
            </span>
          </div>
          <div className="text-left">
            <div className="font-bold text-[#28071C]">
              {DEFAULT_DIVISIONS[divId]}
            </div>
            <div className="text-sm text-[#28071C]/60">
              {block.participation}% participação · PMV R$ {block.indicators.avgPrice.toFixed(0)}
            </div>
          </div>
        </div>
        <div className="text-[#28071C]/60">
          {expanded ? "▼" : "▶"}
        </div>
      </button>

      {/* Conteúdo Expandido */}
      {expanded && (
        <div className="px-6 py-6 border-t border-[#28071C]/10 space-y-6">
          
          {/* BLOCO 1: Indicadores Comerciais */}
          <div>
            <h4 className="font-semibold text-[#28071C] mb-4 text-sm uppercase tracking-wide">
              Bloco 1 — Indicadores Comerciais
            </h4>
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  label: "PMV (R$)",
                  value: block.indicators.avgPrice,
                  field: "avgPrice",
                },
                {
                  label: "MKD (%)",
                  value: block.indicators.mkd,
                  field: "mkd",
                },
                {
                  label: "Margem (%)",
                  value: block.indicators.margin,
                  field: "margin",
                },
                {
                  label: "Sell-Through (%)",
                  value: block.indicators.sellThrough,
                  field: "sellThrough",
                },
              ].map((item) => (
                <div key={item.field}>
                  <label className="text-xs text-[#28071C]/60 mb-1 block">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={item.value}
                    onChange={(e) =>
                      onUpdateIndicators({
                        [item.field]: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* BLOCO 2: Faixa de Preço */}
          <div>
            <h4 className="font-semibold text-[#28071C] mb-4 text-sm uppercase tracking-wide">
              Bloco 2 — Faixa de Preço
            </h4>
            <div className="space-y-3">
              {[
                { label: "Entrada (R$)", field: "entry" },
                { label: "Médio (R$)", field: "middle" },
                { label: "Premium (R$)", field: "premium" },
              ].map((item) => (
                <div key={item.field}>
                  <label className="text-xs text-[#28071C]/60 mb-1 block">
                    {item.label}
                  </label>
                  <input
                    type="text"
                    value={(block.priceRange as any)[item.field]}
                    onChange={(e) =>
                      onUpdatePriceRange({
                        [item.field]: e.target.value,
                      })
                    }
                    placeholder="Ex: 119-169"
                    className="w-full px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                  />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#28071C]/10">
                {[
                  { label: "% Entry", field: "entryPercent" },
                  { label: "% Médio", field: "middlePercent" },
                  { label: "% Premium", field: "premiumPercent" },
                ].map((item) => (
                  <div key={item.field}>
                    <label className="text-xs text-[#28071C]/60 mb-1 block">
                      {item.label}
                    </label>
                    <input
                      type="number"
                      value={(block.priceRange as any)[item.field]}
                      onChange={(e) =>
                        onUpdatePriceRange({
                          [item.field]: Number(e.target.value),
                        })
                      }
                      min={0}
                      max={100}
                      className="w-full px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BLOCO 3: Matriz de Risco */}
          <div>
            <h4 className="font-semibold text-[#28071C] mb-4 text-sm uppercase tracking-wide">
              Bloco 3 — Matriz de Risco
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Básicos (%)", field: "basics" },
                { label: "Moda (%)", field: "fashion" },
                { label: "Alta Moda (%)", field: "highFashion" },
              ].map((item) => (
                <div key={item.field}>
                  <label className="text-xs text-[#28071C]/60 mb-1 block">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={(block.riskMatrix as any)[item.field]}
                    onChange={(e) =>
                      onUpdateRiskMatrix({
                        [item.field]: Number(e.target.value),
                      })
                    }
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* BLOCO 4: Volume/OTB + Cobertura */}
          <div>
            <h4 className="font-semibold text-[#28071C] mb-4 text-sm uppercase tracking-wide">
              Bloco 4 — Volume / OTB + Cobertura
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  label: "Cobertura (dias)",
                  field: "coverage",
                },
                {
                  label: "Estoque Inicial",
                  field: "initialStock",
                },
                {
                  label: "Reposições",
                  field: "replenishments",
                },
              ].map((item) => (
                <div key={item.field}>
                  <label className="text-xs text-[#28071C]/60 mb-1 block">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={(block.volumeCoverage as any)[item.field]}
                    onChange={(e) =>
                      onUpdateVolume({
                        [item.field]: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-[#28071C]/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#28071C]/50"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
