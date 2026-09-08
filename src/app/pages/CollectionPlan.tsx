/**
 * Módulo 5 — Plano de Coleção
 *
 * Régua de tempo da temporada: o usuário distribui o volume de peças
 * estimado pela Divisão (Módulo 4, volumeCoverage.productionVolume) entre
 * coleções e drops, mês a mês. O sistema recalcula ao vivo quanto já foi
 * alocado, quanto falta, e uma cobertura estimada por mês (estoque
 * acumulado ÷ ritmo de venda esperado, na mesma lógica do cluster
 * Giro×Cobertura do M4, aplicada mês a mês em vez de só no total da
 * temporada).
 *
 * Ao aplicar: dentro do volume estimado (±2%, mesma banda usada no M4 para
 * receita) segue direto para a Engenharia de Sortimento (M6); fora da banda,
 * exige justificativa e pede aprovação ao M4 (mesmo padrão M2→M1/M3→M2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  User,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Package,
  Bookmark,
  GitCompare,
  SendHorizonal,
  HelpCircle,
  X,
  CheckCheck,
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import { getTemporadas, MONTHS, type Temporada } from "../../services/temporadaService";
import { expandSeasonMonths } from "../../engine/seasonMonths";
import { initPlanCycles } from "../types/planCycle";
import { fetchTenantDivisions, type TenantDivision } from "../../services/supabase/productHierarchyService";
import {
  getAppliedDivisionSeasonIds,
  getAppliedDivisionScenario,
} from "../../services/supabase/divisionScenarioService";
import type { DivisionPlanBlock } from "../types/module3";
import { getDivisionSeasonality, type DivisionMonthProfile } from "../../services/supabase/divisionSeasonalityService";
import {
  getWorkingCollectionPlan,
  saveWorkingCollectionPlan,
  listCollectionPlanScenarios,
  saveCollectionPlanScenario,
  deleteCollectionPlanScenario,
  applyCollectionPlanScenario,
  type CollectionPlanDivision,
  type CollectionPlanEntry,
  type CollectionPlanScenario,
  type CollectionPlanType,
} from "../../services/supabase/collectionPlanService";
import {
  createApprovalRequest,
  hasPendingRequest,
  type ImpactedIndicator,
} from "../../services/supabase/planApprovalService";
import { advanceDetailLevel } from "../../services/supabase/officialPlanService";

interface UserData {
  name: string;
  email: string;
  profile: string;
  system_role?: string;
  tenant_id?: string;
}

const COLLECTION_PLAN_TOUR: TourStep[] = [
  {
    targetId: "tour-cp-header",
    title: "Plano de Coleção — Módulo 5",
    content: "Distribua o volume de peças estimado pelo Planejamento por Divisão entre coleções e drops ao longo dos meses da temporada.",
  },
  {
    targetId: "tour-cp-division",
    title: "Volume por Divisão",
    content: "Cada divisão mostra o volume-teto vindo da Divisão (Módulo 4). Insira coleções/drops mês a mês e acompanhe o quanto já foi alocado.",
  },
  {
    targetId: "tour-cp-timeline",
    title: "Cobertura Mensal",
    content: "A régua de meses mostra as peças entrando, a venda esperada e a cobertura estimada — ajuste os meses para evitar ruptura ou excesso de estoque.",
  },
];

// Mesma banda de ±2% usada no M4 para o gap de receita (APPROVAL_BANDS_M3.receitaBruta).
const TOLERANCE_PCT = 2;

type NewEntryDraft = { name: string; type: CollectionPlanType; month: string; pieces: string };

const emptyDraft = (month: string, type: CollectionPlanType = "colecao"): NewEntryDraft => ({
  name: "", type, month, pieces: "",
});

export default function CollectionPlan() {
  const navigate = useNavigate();
  const tour = useTour("collection-plan");

  const [user, setUser] = useState<UserData | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [appliedSeasonIds, setAppliedSeasonIds] = useState<Set<string>>(new Set());
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");

  const [realDivisions, setRealDivisions] = useState<TenantDivision[]>([]);
  const [targets, setTargets] = useState<Record<string, { targetPieces: number; unitsExpectedSold: number; initialStock: number }>>({});
  const [divisionsPlan, setDivisionsPlan] = useState<Record<string, CollectionPlanDivision>>({});
  const [histProfiles, setHistProfiles] = useState<DivisionMonthProfile[]>([]);

  const [scenarios, setScenarios] = useState<CollectionPlanScenario[]>([]);
  const [scenarioListVersion, setScenarioListVersion] = useState(0);
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const [expandedDivision, setExpandedDivision] = useState<string | null>(null);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, NewEntryDraft>>({});

  const [applySuccess, setApplySuccess] = useState(false);
  const [showPostApplyModal, setShowPostApplyModal] = useState(false);
  const [showSubmitApprovalDialog, setShowSubmitApprovalDialog] = useState(false);
  const [approvalJustification, setApprovalJustification] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [alreadyPending, setAlreadyPending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const selectedTemporada = temporadas.find(t => t.id === selectedSeasonId) ?? null;

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (!stored) { navigate("/"); return; }
    const userData = JSON.parse(stored);
    setUser(userData);
    const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
    setTenantId(tid);
    if (tid) {
      initPlanCycles(tid).catch(() => {});
      getTemporadas(tid).then(setTemporadas).catch(() => {});
      getAppliedDivisionSeasonIds(tid).then(setAppliedSeasonIds).catch(() => {});
      fetchTenantDivisions(tid).then(setRealDivisions).catch(() => {});
      getDivisionSeasonality(tid).then(r => setHistProfiles(r.consolidated)).catch(() => {});
    }
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Pré-seleciona a primeira temporada elegível (com Divisão/M4 aplicada)
  useEffect(() => {
    if (selectedSeasonId || temporadas.length === 0 || appliedSeasonIds.size === 0) return;
    const first = temporadas.find(t => appliedSeasonIds.has(t.id));
    if (first) setSelectedSeasonId(first.id);
  }, [temporadas, appliedSeasonIds, selectedSeasonId]);

  // ─── Carrega volume-teto (M4), plano de trabalho e cenários da temporada ──
  useEffect(() => {
    if (!tenantId || !selectedSeasonId) return;
    setExpandedDivision(null);
    Promise.all([
      getAppliedDivisionScenario(tenantId, selectedSeasonId),
      getWorkingCollectionPlan(tenantId, selectedSeasonId),
      listCollectionPlanScenarios(tenantId, selectedSeasonId),
    ]).then(([divScenario, working, scenarioList]) => {
      const divs = (divScenario?.divisions ?? {}) as Record<string, DivisionPlanBlock>;
      const nextTargets: Record<string, { targetPieces: number; unitsExpectedSold: number; initialStock: number }> = {};
      for (const [divId, block] of Object.entries(divs)) {
        const vc = block?.volumeCoverage;
        if (!vc) continue;
        nextTargets[divId] = {
          targetPieces: vc.productionVolume ?? 0,
          unitsExpectedSold: vc.unitsExpectedSold ?? 0,
          initialStock: vc.initialStock ?? 0,
        };
      }
      setTargets(nextTargets);

      if (working && Object.keys(working).length > 0) {
        setDivisionsPlan(working);
      } else {
        const initial: Record<string, CollectionPlanDivision> = {};
        for (const [divId, t] of Object.entries(nextTargets)) {
          initial[divId] = { targetPieces: t.targetPieces, entries: [] };
        }
        setDivisionsPlan(initial);
      }
      setScenarios(scenarioList);
    }).catch(() => {});

    const year = temporadas.find(t => t.id === selectedSeasonId)?.anoFiscal ?? new Date().getFullYear();
    hasPendingRequest(tenantId, 5, year).then(setAlreadyPending).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedSeasonId, scenarioListVersion]);

  // ─── Meses da temporada (trata temporadas que cruzam o ano fiscal) ───────
  const seasonMonths = useMemo(() => {
    if (!selectedTemporada?.anoFiscal) return [] as string[];
    return expandSeasonMonths(selectedTemporada.mesInicio, selectedTemporada.mesFim, selectedTemporada.anoFiscal)
      .map(({ month }) => MONTHS[month - 1]);
  }, [selectedTemporada]);

  // ─── Persistência: debounce write-through → Supabase (mesmo padrão da Pirâmide de Preço) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((next: Record<string, CollectionPlanDivision>) => {
    if (!tenantId || !selectedSeasonId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWorkingCollectionPlan(tenantId, selectedSeasonId, next).catch(() => {});
    }, 800);
  }, [tenantId, selectedSeasonId]);

  const updateDivisionsPlan = (updater: (prev: Record<string, CollectionPlanDivision>) => Record<string, CollectionPlanDivision>) => {
    setDivisionsPlan(prev => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  };

  // ─── Vendas esperadas por mês, por divisão — perfil histórico (getDivisionSeasonality)
  // renormalizado só sobre os meses desta temporada, distribuindo unitsExpectedSold do M4. ──
  const monthlyExpectedSold = useCallback((divisionId: string): Record<string, number> => {
    const target = targets[divisionId];
    if (!target || !target.unitsExpectedSold || seasonMonths.length === 0) return {};
    const profile = histProfiles.find(p => p.division === divisionId);
    const weights = seasonMonths.map(m => profile?.monthlyPcts[m] ?? 0);
    const sumW = weights.reduce((s, w) => s + w, 0);
    const norm = sumW > 0 ? weights.map(w => w / sumW) : seasonMonths.map(() => 1 / seasonMonths.length);
    const result: Record<string, number> = {};
    seasonMonths.forEach((m, i) => { result[m] = target.unitsExpectedSold * norm[i]; });
    return result;
  }, [targets, histProfiles, seasonMonths]);

  // ─── Timeline mensal: peças entrando, venda esperada, estoque e cobertura ──
  // Cobertura reaproveita a lógica do cluster Giro×Cobertura do M4
  // (divisionEngineAdapter.applyVolumeCoverageEdit), só que aplicada mês a mês
  // em vez de uma vez só no total da temporada: estoque acumulado ao fim do
  // mês ÷ ritmo de venda esperado do mês × ~30 dias.
  const buildTimeline = useCallback((divisionId: string) => {
    const div = divisionsPlan[divisionId];
    const target = targets[divisionId];
    if (!div) return [];
    const expected = monthlyExpectedSold(divisionId);
    let cumEntered = 0;
    let cumSold = 0;
    const initialStock = target?.initialStock ?? 0;
    return seasonMonths.map(month => {
      const entries = div.entries.filter(e => e.month === month);
      const entered = entries.reduce((s, e) => s + e.plannedPieces, 0);
      cumEntered += entered;
      const soldExpected = expected[month] ?? 0;
      cumSold += soldExpected;
      const stockEnd = initialStock + cumEntered - cumSold;
      const coverageDays = soldExpected > 0 ? (stockEnd / soldExpected) * 30 : (stockEnd > 0 ? Infinity : 0);
      return { month, entries, entered, soldExpected, stockEnd, coverageDays };
    });
  }, [divisionsPlan, targets, monthlyExpectedSold, seasonMonths]);

  // ─── Alocado vs volume-teto, por divisão ─────────────────────────────────
  const divisionSummaries = useMemo(() => {
    return Object.entries(divisionsPlan).map(([divId, div]) => {
      const allocated = div.entries.reduce((s, e) => s + e.plannedPieces, 0);
      const target = div.targetPieces || targets[divId]?.targetPieces || 0;
      const gapPct = target > 0 ? ((allocated - target) / target) * 100 : 0;
      return { divId, allocated, target, gapPct, outsideTolerance: target > 0 && Math.abs(gapPct) > TOLERANCE_PCT };
    });
  }, [divisionsPlan, targets]);

  const impactedCollection: ImpactedIndicator[] = divisionSummaries
    .filter(d => d.outsideTolerance)
    .map(d => ({
      key: d.divId,
      label: realDivisions.find(rd => rd.id === d.divId)?.label ?? d.divId,
      planned: d.target,
      projected: d.allocated,
      gap: d.allocated - d.target,
      isRate: false,
    }));

  // ─── Entradas (coleções/drops) ────────────────────────────────────────────
  const getDraft = (divId: string): NewEntryDraft =>
    entryDrafts[divId] ?? emptyDraft(seasonMonths[0] ?? "");

  const setDraft = (divId: string, patch: Partial<NewEntryDraft>) => {
    setEntryDrafts(prev => ({ ...prev, [divId]: { ...getDraft(divId), ...patch } }));
  };

  const handleAddEntry = (divId: string) => {
    const draft = getDraft(divId);
    const pieces = Number(draft.pieces);
    if (!draft.name.trim() || !draft.month || !pieces || pieces <= 0) return;
    const entry: CollectionPlanEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: draft.name.trim(),
      type: draft.type,
      month: draft.month,
      plannedPieces: pieces,
    };
    updateDivisionsPlan(prev => ({
      ...prev,
      [divId]: { ...prev[divId], entries: [...(prev[divId]?.entries ?? []), entry] },
    }));
    setEntryDrafts(prev => ({ ...prev, [divId]: emptyDraft(draft.month, draft.type) }));
  };

  const handleDeleteEntry = (divId: string, entryId: string) => {
    updateDivisionsPlan(prev => ({
      ...prev,
      [divId]: { ...prev[divId], entries: (prev[divId]?.entries ?? []).filter(e => e.id !== entryId) },
    }));
  };

  // ─── Cenários (simulações salvas) ─────────────────────────────────────────
  const handleSaveScenario = async () => {
    if (!tenantId || !selectedSeasonId || !scenarioName.trim()) return;
    await saveCollectionPlanScenario(tenantId, selectedSeasonId, scenarioName.trim(), divisionsPlan).catch(() => {});
    setScenarioName("");
    setShowScenarioModal(false);
    setScenarioListVersion(v => v + 1);
  };

  const handleApplyScenario = async (scenarioId: string) => {
    if (!tenantId || !selectedSeasonId) return;
    await applyCollectionPlanScenario(tenantId, selectedSeasonId, scenarioId).catch(() => {});
    const working = await getWorkingCollectionPlan(tenantId, selectedSeasonId);
    if (working) setDivisionsPlan(working);
    setCompareOpen(false);
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    if (!tenantId) return;
    if (!confirm("Excluir esta simulação? Esta ação não pode ser desfeita.")) return;
    await deleteCollectionPlanScenario(tenantId, scenarioId).catch(() => {});
    setScenarioListVersion(v => v + 1);
  };

  // ─── Aplicar direto (dentro da banda) / Enviar para aprovação do M4 ──────
  const handleApplyDirect = async () => {
    if (!tenantId || !selectedTemporada) return;
    setIsApplying(true);
    try {
      const year = selectedTemporada.anoFiscal ?? new Date().getFullYear();
      await advanceDetailLevel(tenantId, year, 4);
    } catch { /* recompute não bloqueia */ }
    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 2500);
    setShowPostApplyModal(true);
    setIsApplying(false);
  };

  const handleSubmitApproval = async () => {
    if (!tenantId || !user || !selectedSeasonId || !selectedTemporada) return;
    setIsSubmittingApproval(true);
    try {
      // Salva um snapshot nomeado do plano atual — é o que o M4 aplica de
      // volta se aprovar (garante que a decisão reflete exatamente o que foi
      // revisado, mesmo que o rascunho continue mudando depois do envio).
      const snapshotName = `Aprovação ${new Date().toLocaleString("pt-BR")}`;
      const snapshot = await saveCollectionPlanScenario(tenantId, selectedSeasonId, snapshotName, divisionsPlan);
      await createApprovalRequest({
        tenantId,
        year: selectedTemporada.anoFiscal ?? new Date().getFullYear(),
        fromModule: 5,
        toModule: 4,
        requesterEmail: user.email,
        justification: approvalJustification.trim(),
        proposedData: { seasonId: selectedSeasonId, divisions: snapshot.divisions } as Record<string, unknown>,
        originalData: { targets } as Record<string, unknown>,
        impactedIndicators: impactedCollection,
        scenarioId: snapshot.id,
      });
      setAlreadyPending(true);
      setShowSubmitApprovalDialog(false);
      setApprovalJustification("");
      setScenarioListVersion(v => v + 1);
    } catch { /* silent */ }
    setIsSubmittingApproval(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  if (!user || isLoading) return null;

  const eligibleSeasons = temporadas.filter(t => appliedSeasonIds.has(t.id));
  const fmtPieces = (v: number) => `${Math.round(v).toLocaleString("pt-BR")}`;
  const totalTarget = divisionSummaries.reduce((s, d) => s + d.target, 0);
  const totalAllocated = divisionSummaries.reduce((s, d) => s + d.allocated, 0);

  const coverageBadge = (stockEnd: number, coverageDays: number) => {
    if (stockEnd < 0) return { label: "Ruptura", cls: "bg-red-50 text-red-700 border-red-200" };
    if (!Number.isFinite(coverageDays)) return { label: "Sem giro", cls: "bg-[#28071C]/5 text-[#28071C]/40 border-[#28071C]/10" };
    if (coverageDays < 30) return { label: `${Math.round(coverageDays)}d`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
    if (coverageDays > 120) return { label: `${Math.round(coverageDays)}d`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
    return { label: `${Math.round(coverageDays)}d`, cls: "bg-green-50 text-green-700 border-green-200" };
  };

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {tour.isOpen && <ProductTour steps={COLLECTION_PLAN_TOUR} onClose={tour.dismiss} />}

      {/* ─── HEADER ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div id="tour-cp-header">
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Módulo 5</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-2">· Plano de Coleção</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button onClick={tour.reopen} className="p-2 text-[#F6F3AA]/60 hover:text-[#F6F3AA] transition-colors" title="Ver tour de apresentação">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">
        {eligibleSeasons.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="bg-white rounded-2xl shadow-md border border-[#28071C]/8 p-10 max-w-lg w-full">
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-[#28071C] mb-2">Nenhuma temporada com Divisão aplicada</h2>
              <p className="text-sm text-[#28071C]/50 mb-6 leading-relaxed">
                O Plano de Coleção distribui o volume de peças definido no <strong>Módulo 4 — Planejamento por Divisão</strong>.
                Aplique a Divisão de uma temporada antes de continuar aqui.
              </p>
              <button
                onClick={() => navigate("/module3-division-planning")}
                className="w-full py-3 rounded-xl bg-[#28071C] text-white text-sm font-semibold hover:bg-[#28071C]/80 transition-colors"
              >
                Ir para Planejamento por Divisão
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ─── Seleção de temporada ────────────────────────────────────── */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border-t-4 border-[#7598CF]">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <label className="block text-[#28071C]/70 text-xs uppercase tracking-wide font-semibold mb-2">Temporada</label>
                  <select
                    value={selectedSeasonId}
                    onChange={e => setSelectedSeasonId(e.target.value)}
                    className="bg-white rounded-xl px-3 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 font-medium cursor-pointer min-w-[240px]"
                  >
                    {eligibleSeasons.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-[#28071C]/50 block text-xs uppercase tracking-wide font-semibold">Volume-teto</span>
                    <span className="text-[#28071C] font-bold text-lg">{fmtPieces(totalTarget)} pçs</span>
                  </div>
                  <div>
                    <span className="text-[#28071C]/50 block text-xs uppercase tracking-wide font-semibold">Alocado</span>
                    <span className={`font-bold text-lg ${Math.abs(totalAllocated - totalTarget) / (totalTarget || 1) * 100 > TOLERANCE_PCT ? "text-amber-600" : "text-green-700"}`}>
                      {fmtPieces(totalAllocated)} pçs
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowScenarioModal(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-[#28071C]/15 text-[#28071C]/70 rounded-xl text-sm hover:bg-white/60 transition-colors"
                    >
                      <Bookmark className="w-4 h-4" /> Salvar cenário
                    </button>
                    <button
                      onClick={() => setCompareOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-[#28071C]/15 text-[#28071C]/70 rounded-xl text-sm hover:bg-white/60 transition-colors"
                    >
                      <GitCompare className="w-4 h-4" /> Cenários
                      {scenarios.length > 0 && (
                        <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{scenarios.length}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Divisões ────────────────────────────────────────────────── */}
            <div id="tour-cp-division" className="space-y-3">
              {divisionSummaries.map(({ divId, allocated, target, gapPct, outsideTolerance }) => {
                const label = realDivisions.find(rd => rd.id === divId)?.label ?? divId;
                const isExpanded = expandedDivision === divId;
                const pct = target > 0 ? Math.min(100, (allocated / target) * 100) : 0;
                const timeline = isExpanded ? buildTimeline(divId) : [];
                const draft = getDraft(divId);

                return (
                  <div key={divId} className="bg-white rounded-2xl shadow-sm border border-[#28071C]/8 overflow-hidden">
                    <button
                      onClick={() => setExpandedDivision(isExpanded ? null : divId)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F2F2F2]/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-[#7598CF]" />
                        <span className="text-[#28071C] font-bold">{label}</span>
                        {outsideTolerance && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            <AlertTriangle className="w-3 h-3" /> {gapPct > 0 ? "+" : ""}{gapPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="w-40 hidden sm:block">
                          <div className="h-2 rounded-full bg-[#28071C]/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${outsideTolerance ? "bg-amber-400" : "bg-[#7598CF]"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm text-[#28071C]/60">
                          <strong className="text-[#28071C]">{fmtPieces(allocated)}</strong> / {fmtPieces(target)} pçs
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-[#28071C]/40" /> : <ChevronDown className="w-4 h-4 text-[#28071C]/40" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[#28071C]/8 px-5 py-4 space-y-4">
                        {/* Timeline mensal */}
                        <div id="tour-cp-timeline" className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-[#28071C]/40 uppercase tracking-widest font-semibold">
                                <th className="text-left py-1.5 pr-4">Mês</th>
                                {timeline.map(t => <th key={t.month} className="text-center py-1.5 px-2 whitespace-nowrap">{t.month.slice(0, 3)}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-[#28071C]/5">
                                <td className="py-1.5 pr-4 text-[#28071C]/60 font-semibold">Peças entrando</td>
                                {timeline.map(t => (
                                  <td key={t.month} className="text-center py-1.5 px-2 text-[#28071C]">
                                    {t.entered > 0 ? fmtPieces(t.entered) : "—"}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-t border-[#28071C]/5">
                                <td className="py-1.5 pr-4 text-[#28071C]/60 font-semibold">Venda esperada</td>
                                {timeline.map(t => (
                                  <td key={t.month} className="text-center py-1.5 px-2 text-[#28071C]/50">
                                    {Math.round(t.soldExpected) > 0 ? fmtPieces(t.soldExpected) : "—"}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-t border-[#28071C]/5">
                                <td className="py-1.5 pr-4 text-[#28071C]/60 font-semibold">Cobertura</td>
                                {timeline.map(t => {
                                  const badge = coverageBadge(t.stockEnd, t.coverageDays);
                                  return (
                                    <td key={t.month} className="text-center py-1.5 px-2">
                                      <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Entradas cadastradas */}
                        {(divisionsPlan[divId]?.entries.length ?? 0) > 0 && (
                          <div className="space-y-1.5">
                            {divisionsPlan[divId].entries.map(e => (
                              <div key={e.id} className="flex items-center justify-between bg-[#F2F2F2]/60 rounded-lg px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${e.type === "drop" ? "bg-[#9B8CD8]/15 text-[#9B8CD8]" : "bg-[#7598CF]/15 text-[#7598CF]"}`}>
                                    {e.type === "drop" ? "Drop" : "Coleção"}
                                  </span>
                                  <span className="text-[#28071C] font-medium">{e.name}</span>
                                  <span className="text-[#28071C]/50">· {e.month}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[#28071C] font-semibold">{fmtPieces(e.plannedPieces)} pçs</span>
                                  <button onClick={() => handleDeleteEntry(divId, e.id)} className="text-[#28071C]/30 hover:text-red-600 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Nova coleção/drop */}
                        <div className="flex items-end gap-2 flex-wrap pt-2 border-t border-[#28071C]/5">
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold mb-1">Nome</label>
                            <input
                              type="text"
                              value={draft.name}
                              onChange={e => setDraft(divId, { name: e.target.value })}
                              placeholder="Ex: Coleção Verão I"
                              className="w-full bg-white rounded-lg px-2.5 py-1.5 text-sm text-[#28071C] border border-[#28071C]/15 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold mb-1">Tipo</label>
                            <select
                              value={draft.type}
                              onChange={e => setDraft(divId, { type: e.target.value as CollectionPlanType })}
                              className="bg-white rounded-lg px-2.5 py-1.5 text-sm text-[#28071C] border border-[#28071C]/15 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 cursor-pointer"
                            >
                              <option value="colecao">Coleção</option>
                              <option value="drop">Drop</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold mb-1">Mês</label>
                            <select
                              value={draft.month}
                              onChange={e => setDraft(divId, { month: e.target.value })}
                              className="bg-white rounded-lg px-2.5 py-1.5 text-sm text-[#28071C] border border-[#28071C]/15 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 cursor-pointer"
                            >
                              {seasonMonths.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className="w-28">
                            <label className="block text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold mb-1">Peças</label>
                            <input
                              type="number"
                              min={0}
                              value={draft.pieces}
                              onChange={e => setDraft(divId, { pieces: e.target.value })}
                              placeholder="0"
                              className="w-full bg-white rounded-lg px-2.5 py-1.5 text-sm text-[#28071C] border border-[#28071C]/15 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                            />
                          </div>
                          <button
                            onClick={() => handleAddEntry(divId)}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#28071C] text-[#F6F3AA] rounded-lg text-sm font-semibold hover:opacity-90 transition-all"
                          >
                            <Plus className="w-4 h-4" /> Adicionar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ─── Rodapé: aplicar / enviar para aprovação ─────────────────── */}
            <div className="flex items-center justify-end gap-3 pt-2">
              {applySuccess && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl font-medium">
                  ✓ Plano de coleção confirmado
                </span>
              )}
              {impactedCollection.length === 0 ? (
                <button
                  onClick={handleApplyDirect}
                  disabled={isApplying}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <CheckCheck className="w-4 h-4" /> Aplicar plano de coleção
                </button>
              ) : (
                <button
                  onClick={() => { if (!alreadyPending) setShowSubmitApprovalDialog(true); }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                    alreadyPending
                      ? "bg-amber-100 text-amber-700 border border-amber-300 cursor-default"
                      : "bg-[#7598CF] text-white hover:opacity-90"
                  }`}
                >
                  <SendHorizonal className="w-4 h-4" />
                  {alreadyPending ? "Aprovação pendente" : "Enviar para aprovação (M4)"}
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {/* ─── MODAL: Salvar cenário ─────────────────────────────────────────── */}
      {showScenarioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-lg">Salvar cenário</h3>
              <button onClick={() => setShowScenarioModal(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              placeholder="Nome do cenário"
              className="w-full bg-white rounded-xl px-3 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 mb-4"
            />
            <button
              onClick={handleSaveScenario}
              disabled={!scenarioName.trim()}
              className="w-full py-2.5 rounded-xl bg-[#28071C] text-[#F6F3AA] text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: Comparar/aplicar cenários ────────────────────────────────── */}
      {compareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-lg">Cenários salvos</h3>
              <button onClick={() => setCompareOpen(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                <X className="w-5 h-5" />
              </button>
            </div>
            {scenarios.length === 0 ? (
              <p className="text-[#28071C]/50 text-sm text-center py-6">Nenhum cenário salvo ainda.</p>
            ) : (
              <div className="space-y-2">
                {scenarios.map(s => {
                  const total = Object.values(s.divisions).reduce(
                    (sum, d) => sum + d.entries.reduce((es, e) => es + e.plannedPieces, 0), 0,
                  );
                  return (
                    <div key={s.id} className="flex items-center justify-between border border-[#28071C]/10 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-[#28071C] font-semibold text-sm">{s.name}</p>
                        <p className="text-[#28071C]/50 text-xs">{fmtPieces(total)} pçs alocadas · {new Date(s.savedAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApplyScenario(s.id)}
                          className="px-3 py-1.5 bg-[#28071C] text-[#F6F3AA] rounded-lg text-xs font-semibold hover:opacity-90 transition-all"
                        >
                          Aplicar
                        </button>
                        <button onClick={() => handleDeleteScenario(s.id)} className="text-[#28071C]/30 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: Enviar para aprovação (M5→M4) ────────────────────────────── */}
      {showSubmitApprovalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-lg">Enviar para aprovação</h3>
              <button onClick={() => setShowSubmitApprovalDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#28071C]/60 mb-3">
              O volume alocado ficou fora do volume-teto definido na Divisão em {impactedCollection.length} divisão(ões). Justifique para o Planejamento por Divisão (Módulo 4) aprovar o desvio.
            </p>
            <div className="space-y-1.5 mb-4">
              {impactedCollection.map(i => (
                <div key={i.key} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="font-semibold text-amber-800">{i.label}</span>
                  <span className="text-amber-700">{fmtPieces(i.projected)} / {fmtPieces(i.planned)} pçs ({i.gap > 0 ? "+" : ""}{Math.round((i.gap / i.planned) * 100)}%)</span>
                </div>
              ))}
            </div>
            <textarea
              value={approvalJustification}
              onChange={e => setApprovalJustification(e.target.value)}
              placeholder="Justifique o desvio de volume..."
              rows={4}
              className="w-full bg-white rounded-xl px-3 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 mb-4 resize-none"
            />
            <button
              onClick={handleSubmitApproval}
              disabled={!approvalJustification.trim() || isSubmittingApproval}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#7598CF] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
            >
              <SendHorizonal className="w-4 h-4" /> {isSubmittingApproval ? "Enviando…" : "Enviar para aprovação"}
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL: Pós-Aplicação ─────────────────────────────────────────── */}
      {showPostApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-[#28071C] font-bold text-lg mb-1">Plano de coleção confirmado!</h2>
              <p className="text-[#28071C]/60 text-sm">Continue para a Engenharia de Sortimento.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => { setShowPostApplyModal(false); navigate("/sortiment-plan"); }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 transition-all"
              >
                Ir para Módulo 6 — Engenharia de Sortimento
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
    </div>
  );
}
