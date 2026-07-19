/**
 * Tela: Revisão de Pirâmide de Preço por Divisão — Módulo 3
 *
 * Aberta a partir do botão "Revisão" no Bloco 2 de cada DivisionBlockCard.
 * Recebe por navigation state: plannedAvgPrice, seasonId, referenceSeasonId, tenantId.
 *
 * Por divisão e temporada, o gestor pode para cada categoria:
 *   1. Ver a média histórica real (calculada dos produtos importados).
 *   2. Ajustar a participação (%) de cada faixa.
 *   3. Substituir a média planejada da faixa (plannedAvg), quando a média
 *      histórica não reflete as expectativas do ciclo atual.
 *
 * O PMV Estimado usa: plannedAvg ?? historicalAvg ?? midpoint do range.
 * Dados persistidos no Supabase via pricePyramidService (sem localStorage).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { BusinessDivisionId, DEFAULT_DIVISIONS } from "../types/module3";
import { CategoryPricePlan, PriceTierId, TierConfig, TierPlan } from "../types/pricePyramid";
import {
  fetchHistoricalTierAvgs,
  loadDivisionTierConfig,
  loadPyramidPlan,
  savePyramidPlan,
  type CategoryTierRanges,
  type TierHistoricalAvg,
  type TierRange,
} from "../../services/supabase/pricePyramidService";

// ─── Dados estáticos (ranges vêm de OperationSettings no futuro) ───────────

const TIER_CONFIG: Record<PriceTierId, TierConfig> = {
  p1: { id: "p1", label: "P1 — Entrada", rangeMin: 89,  rangeMax: 169 },
  p2: { id: "p2", label: "P2 — Médio",   rangeMin: 179, rangeMax: 259 },
  p3: { id: "p3", label: "P3 — Premium", rangeMin: 269, rangeMax: 389 },
};

const TIER_COLORS: Record<PriceTierId, string> = {
  p1: "bg-blue-500",
  p2: "bg-amber-500",
  p3: "bg-[#28071C]",
};

const TIER_RANGES: Record<PriceTierId, TierRange> = {
  p1: { min: TIER_CONFIG.p1.rangeMin, max: TIER_CONFIG.p1.rangeMax },
  p2: { min: TIER_CONFIG.p2.rangeMin, max: TIER_CONFIG.p2.rangeMax },
  p3: { min: TIER_CONFIG.p3.rangeMin, max: TIER_CONFIG.p3.rangeMax },
};

// TODO: Substituir por categorias vindas das Configurações de Operação
const CATEGORIES_BY_DIVISION: Record<BusinessDivisionId, Array<{ id: string; label: string }>> = {
  feminino:   [
    { id: "vestidos",   label: "Vestidos" },
    { id: "blusas",     label: "Blusas" },
    { id: "calcas",     label: "Calças" },
    { id: "saias",      label: "Saias" },
    { id: "moda_praia", label: "Moda Praia" },
  ],
  masculino:  [
    { id: "camisas",   label: "Camisas" },
    { id: "calcas_m",  label: "Calças" },
    { id: "bermudas",  label: "Bermudas" },
    { id: "moletons",  label: "Moletons" },
  ],
  acessorios: [
    { id: "bolsas",     label: "Bolsas" },
    { id: "cintos",     label: "Cintos" },
    { id: "bijuterias", label: "Bijuterias" },
    { id: "calcados",   label: "Calçados" },
  ],
  infantil:   [
    { id: "conjuntos",  label: "Conjuntos" },
    { id: "vestidos_i", label: "Vestidos" },
    { id: "camisetas",  label: "Camisetas" },
    { id: "calcas_i",   label: "Calças" },
  ],
};

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

/**
 * Calcula o PMV de uma categoria usando a hierarquia de prioridade:
 * plannedAvg (override do gestor) → historicalAvg (do banco) → midpoint do range
 *
 * @param catRanges  ranges dinâmicos por categoria (carregados do OperationSettings).
 *                   Se ausente, usa globalRanges (fallback TIER_RANGES).
 */
function calcCategoryPmv(
  cat: CategoryPricePlan,
  historicalAvg: TierHistoricalAvg,
  catRanges: CategoryTierRanges | undefined,
  globalRanges: Record<PriceTierId, TierRange>,
): number {
  return (["p1", "p2", "p3"] as PriceTierId[]).reduce((sum, tid) => {
    const plan = cat.tiers[tid];
    const range = catRanges?.[tid] ?? globalRanges[tid];
    const effective =
      plan.plannedAvg ??
      historicalAvg[tid] ??
      (range.min + range.max) / 2;
    return sum + (effective * plan.participation) / 100;
  }, 0);
}

function buildDefaults(divId: BusinessDivisionId): CategoryPricePlan[] {
  return (CATEGORIES_BY_DIVISION[divId] ?? []).map((cat) => ({
    categoryId: cat.id,
    label:      cat.label,
    tiers: {
      p1: { participation: 33 },
      p2: { participation: 34 },
      p3: { participation: 33 },
    },
  }));
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PricePyramid() {
  const navigate   = useNavigate();
  const { divisionId } = useParams<{ divisionId: string }>();
  const location   = useLocation();

  // Navigation state enviado pelo Module3DivisionPlanning
  const navState = (location.state as {
    plannedAvgPrice?: number;
    seasonId?: string;
    referenceSeasonId?: string;
    tenantId?: string;
  } | null);

  const plannedAvgPrice  = navState?.plannedAvgPrice;
  const seasonId         = navState?.seasonId ?? "";
  const tenantId: string = navState?.tenantId ?? (() => {
    try {
      const cu = JSON.parse(sessionStorage.getItem("currentUser") ?? "{}");
      return sessionStorage.getItem("activeTenantId") ?? (cu.tenant_id as string) ?? "";
    } catch { return ""; }
  })();

  const divId = divisionId as BusinessDivisionId;

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [categories, setCategories]           = useState<CategoryPricePlan[]>([]);
  const [historicalAvg, setHistoricalAvg]     = useState<TierHistoricalAvg>({ p1: null, p2: null, p3: null });
  const [categoryRangesMap, setCategoryRangesMap] = useState<Map<string, CategoryTierRanges>>(new Map());
  const [globalTierRanges, setGlobalTierRanges]   = useState<Record<PriceTierId, TierRange>>(TIER_RANGES);
  const [loading, setLoading]                 = useState(true);

  // ── Carga inicial: tier config → plano + médias históricas ───────────────
  // Sequência intencional: carrega ranges do OperationSettings antes de buscar
  // médias históricas, para filtrar produtos com os ranges corretos do tenant.
  useEffect(() => {
    if (!divisionId) return;
    setLoading(true);
    const defaults = buildDefaults(divId);

    // 1. Ranges dinâmicos (fallback: TIER_RANGES hardcoded)
    const tierCfgPromise = tenantId
      ? loadDivisionTierConfig(tenantId, divId)
      : Promise.resolve(null);

    tierCfgPromise.then((tierCfg) => {
      const ranges = tierCfg?.global ?? TIER_RANGES;
      if (tierCfg) {
        setCategoryRangesMap(new Map(tierCfg.byCategory.map((c) => [c.categoryLabel, c])));
        setGlobalTierRanges(tierCfg.global);
      }

      // 2. Plano salvo + médias históricas com ranges corretos
      Promise.all([
        tenantId && seasonId
          ? loadPyramidPlan(tenantId, seasonId, divisionId)
          : Promise.resolve(null),
        tenantId
          ? fetchHistoricalTierAvgs(tenantId, divisionId, ranges)
          : Promise.resolve<TierHistoricalAvg>({ p1: null, p2: null, p3: null }),
      ]).then(([savedPlan, avgs]: [CategoryPricePlan[] | null, TierHistoricalAvg]) => {
        setHistoricalAvg(avgs);
        if (savedPlan && savedPlan.length > 0) {
          // Mescla: garante que categorias novas apareçam mesmo em planos antigos
          const saved = new Map(savedPlan.map((c) => [c.categoryId, c]));
          setCategories(defaults.map((d) => saved.get(d.categoryId) ?? d));
        } else {
          setCategories(defaults);
        }
      }).finally(() => setLoading(false));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, seasonId, tenantId]);

  // ── Persistência: debounce write-through → Supabase ───────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (cats: CategoryPricePlan[]) => {
      if (!tenantId || !seasonId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePyramidPlan(tenantId, seasonId, divisionId!, cats);
      }, 800);
    },
    [tenantId, seasonId, divisionId],
  );

  // ── Mutações ───────────────────────────────────────────────────────────────
  function updateTier(categoryId: string, tierId: PriceTierId, updates: Partial<TierPlan>) {
    setCategories((prev) => {
      const next = prev.map((cat) =>
        cat.categoryId === categoryId
          ? { ...cat, tiers: { ...cat.tiers, [tierId]: { ...cat.tiers[tierId], ...updates } } }
          : cat,
      );
      persist(next);
      return next;
    });
  }

  // ── Cálculos derivados ─────────────────────────────────────────────────────
  const pmvEstimado = useMemo(() => {
    if (categories.length === 0) return 0;
    const sum = categories.reduce(
      (s, cat) => s + calcCategoryPmv(cat, historicalAvg, categoryRangesMap.get(cat.label), globalTierRanges),
      0,
    );
    return sum / categories.length;
  }, [categories, historicalAvg, categoryRangesMap, globalTierRanges]);

  const delta = plannedAvgPrice != null ? pmvEstimado - plannedAvgPrice : null;
  const deltaAligned =
    delta != null && plannedAvgPrice != null && plannedAvgPrice > 0
      ? Math.abs(delta / plannedAvgPrice) <= 0.1
      : null;

  const validCategoriesCount = categories.filter((cat) => {
    const total = (["p1", "p2", "p3"] as PriceTierId[]).reduce(
      (s, tid) => s + cat.tiers[tid].participation, 0,
    );
    return Math.abs(total - 100) < 0.01;
  }).length;

  if (!divisionId || !CATEGORIES_BY_DIVISION[divId]) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <p className="text-[#28071C] font-semibold">Divisão não encontrada.</p>
      </div>
    );
  }

  const divisionName = DEFAULT_DIVISIONS[divId] ?? divisionId;

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">

      {/* ── HEADER ────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1400px] mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/module3-division-planning")}
            className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <span className="text-[#F6F3AA] text-base font-semibold">
              Pirâmide de Preço · {divisionName}
            </span>
            <span className="text-[#F6F3AA]/70 text-sm ml-3">
              Participação por faixa e categoria — Módulo 3
            </span>
          </div>
        </div>
      </header>

      {/* ── CARD DE IMPACTO FIXO ──────────────────────────────────────────────── */}
      <div className="sticky top-[72px] z-30 bg-white/95 backdrop-blur-md shadow-md border-b border-[#28071C]/10 px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center gap-6">

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">PMV Estimado</span>
            <span className="text-base font-bold text-[#28071C]">R$ {pmvEstimado.toFixed(0)}</span>
          </div>

          <div className="h-5 w-px bg-[#28071C]/15" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">PMV Planejado</span>
            <span className="text-base font-bold text-[#28071C]">
              {plannedAvgPrice != null ? `R$ ${plannedAvgPrice.toFixed(0)}` : "—"}
            </span>
          </div>

          <div className="h-5 w-px bg-[#28071C]/15" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">Δ PMV</span>
            {delta != null ? (
              <div className="flex items-center gap-2">
                <span className={`text-base font-bold ${deltaAligned ? "text-green-700" : "text-red-600"}`}>
                  {delta >= 0 ? "+" : ""}R$ {delta.toFixed(0)}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  deltaAligned ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                }`}>
                  {deltaAligned ? "Alinhado ±10%" : "Divergência >10%"}
                </span>
              </div>
            ) : (
              <span className="text-base font-bold text-[#28071C]/30">—</span>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">Categorias OK</span>
            <span className={`text-[12px] font-bold px-3 py-1 rounded-full ${
              validCategoriesCount === categories.length
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              {validCategoriesCount}/{categories.length}
            </span>
          </div>

        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">

        {/* ── ORIENTAÇÃO ──────────────────────────────────────────────────────── */}
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl px-6 py-4">
          <p className="text-[#28071C] text-sm leading-relaxed">
            Para cada categoria, ajuste a <strong>participação (%)</strong> de cada faixa.
            A <strong>Média Histórica</strong> é calculada dos produtos importados — use-a como referência.
            Se a expectativa para este ciclo divergir do histórico, defina uma <strong>Média Planejada</strong> para a faixa.
            O PMV Estimado usa: Média Planejada → Média Histórica → ponto médio do range (nesta prioridade).
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#28071C]/40 text-sm">Carregando…</div>
        ) : (
          <>
            {/* ── LEGENDA DAS FAIXAS ──────────────────────────────────────────── */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border-t-4 border-[#7598CF]">
              <h2 className="text-[#28071C] font-bold mb-4 text-[11px] uppercase tracking-wide">
                Faixas de Preço — {divisionName}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {(["p1", "p2", "p3"] as PriceTierId[]).map((tid) => {
                  const tier  = TIER_CONFIG[tid];
                  const range = globalTierRanges[tid];
                  const hAvg  = historicalAvg[tid];
                  return (
                    <div key={tid} className="flex items-center gap-3 bg-[#28071C]/5 rounded-xl p-4 border border-[#28071C]/10">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${TIER_COLORS[tid]}`} />
                      <div>
                        <div className="text-[11px] font-bold text-[#28071C]/70 uppercase tracking-wide mb-0.5">
                          {tier.label}
                        </div>
                        <div className="text-[13px] font-semibold text-[#28071C]">
                          R$ {range.min} – {range.max}
                        </div>
                        {hAvg != null ? (
                          <div className="text-[11px] text-[#7598CF] font-semibold">
                            Média histórica: R$ {hAvg}
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#28071C]/40 italic">
                            Ref. estimada: R$ {Math.round((range.min + range.max) / 2)}
                          </div>
                        )}
                        <div className="text-[10px] text-[#28071C]/40 mt-0.5 italic">Somente leitura</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── CATEGORIAS ──────────────────────────────────────────────────── */}
            <div className="space-y-4">
              {categories.map((cat) => {
                const total = (["p1", "p2", "p3"] as PriceTierId[]).reduce(
                  (s, tid) => s + cat.tiers[tid].participation, 0,
                );
                const valid  = Math.abs(total - 100) < 0.01;
                const catPmv = calcCategoryPmv(cat, historicalAvg, categoryRangesMap.get(cat.label), globalTierRanges);

                return (
                  <div
                    key={cat.categoryId}
                    className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border-l-4 border-[#7598CF]"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[#28071C] font-bold">{cat.label}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[#28071C]/50">
                          PMV cat.:{" "}
                          <strong className="text-[#28071C]">R$ {catPmv.toFixed(0)}</strong>
                        </span>
                        <span className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                          valid
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {valid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {valid ? "100%" : `${total.toFixed(0)}%`}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      {(["p1", "p2", "p3"] as PriceTierId[]).map((tid) => {
                        const tier    = TIER_CONFIG[tid]; // label (P1 — Entrada, etc.)
                        const range   = categoryRangesMap.get(cat.label)?.[tid] ?? globalTierRanges[tid];
                        const plan    = cat.tiers[tid];
                        const hAvg    = historicalAvg[tid];
                        const effective =
                          plan.plannedAvg ??
                          hAvg ??
                          (range.min + range.max) / 2;

                        return (
                          <div
                            key={tid}
                            className="bg-[#28071C]/5 rounded-xl p-3 border border-[#28071C]/10 space-y-2"
                          >
                            {/* Cabeçalho da faixa */}
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${TIER_COLORS[tid]}`} />
                              <span className="text-[11px] font-bold text-[#28071C]/70 uppercase tracking-wide">
                                {tier.label}
                              </span>
                            </div>

                            {/* Range — somente leitura */}
                            <div className="text-[11px] text-[#28071C]/50">
                              R$ {range.min}–{range.max}
                            </div>

                            {/* Média histórica — referência */}
                            <div className="text-[10px]">
                              <span className="text-[#28071C]/40">Hist.: </span>
                              <span className={hAvg != null ? "text-[#7598CF] font-semibold" : "text-[#28071C]/30 italic"}>
                                {hAvg != null ? `R$ ${hAvg}` : "sem dados"}
                              </span>
                            </div>

                            {/* Média planejada — override editável */}
                            <div>
                              <label className="text-[10px] text-[#28071C]/50 block mb-0.5">
                                Média planejada (R$)
                              </label>
                              <input
                                type="number"
                                min={range.min}
                                max={range.max}
                                placeholder={`${Math.round(effective)}`}
                                value={plan.plannedAvg ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updateTier(cat.categoryId, tid, {
                                    plannedAvg: raw === "" ? undefined : Number(raw),
                                  });
                                }}
                                className="w-full px-2 py-1 border-2 border-[#28071C]/20 rounded-lg text-[12px] text-center font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                              />
                              {plan.plannedAvg != null && (
                                <button
                                  onClick={() => updateTier(cat.categoryId, tid, { plannedAvg: undefined })}
                                  className="text-[9px] text-[#28071C]/30 hover:text-red-400 mt-0.5 w-full text-center transition-colors"
                                >
                                  usar histórico
                                </button>
                              )}
                            </div>

                            {/* Participação — editável */}
                            <div>
                              <label className="text-[10px] text-[#28071C]/50 block mb-0.5">
                                Participação (%)
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={plan.participation}
                                  onChange={(e) =>
                                    updateTier(cat.categoryId, tid, { participation: Number(e.target.value) })
                                  }
                                  min={0}
                                  max={100}
                                  className="flex-1 min-w-0 px-2 py-1.5 border-2 border-[#28071C]/20 rounded-lg text-[12px] text-center font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
                                />
                                <span className="text-[11px] text-[#28071C]/50 font-medium">%</span>
                              </div>
                            </div>

                            {/* Barra visual */}
                            <div className="h-1 bg-[#28071C]/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${TIER_COLORS[tid]}`}
                                style={{ width: `${Math.min(plan.participation, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
