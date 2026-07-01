/**
 * Tela: Revisão de Pirâmide de Preço por Segmento — Módulo 3
 *
 * Aberta a partir do botão "Revisão de pirâmide de preço" no Bloco 2 de
 * cada DivisionBlockCard, recebendo o segmento via URL param (:divisionId).
 *
 * O usuário ajusta APENAS a participação (%) de cada faixa por categoria.
 * Os valores em R$ (P1/P2/P3) são somente leitura.
 *
 * Dados persistidos em localStorage por divisão.
 * TODO: Integrar categorias e faixas com OperationSettings quando disponível.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { BusinessDivisionId, DEFAULT_DIVISIONS } from "../types/module3";
import { CategoryPricePlan, PriceTierId, TierConfig } from "../types/pricePyramid";

// ─── Dados estáticos (TODO: virão das Configurações) ─────────────────────────

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

// ─── Helpers de storage ───────────────────────────────────────────────────────
// TODO: adicionar seasonId à chave quando integrar com Configurações

function storageKey(divisionId: string) {
  return `module3_price_pyramid_${divisionId}`;
}

function loadCategories(divId: BusinessDivisionId): CategoryPricePlan[] | null {
  try {
    const raw = localStorage.getItem(storageKey(divId));
    if (raw) return JSON.parse(raw) as CategoryPricePlan[];
  } catch { /* ignore */ }
  return null;
}

function persistCategories(divId: string, categories: CategoryPricePlan[]) {
  localStorage.setItem(storageKey(divId), JSON.stringify(categories));
}

function buildDefaults(divId: BusinessDivisionId): CategoryPricePlan[] {
  return (CATEGORIES_BY_DIVISION[divId] ?? []).map((cat) => ({
    categoryId: cat.id,
    label: cat.label,
    tiers: {
      p1: { participation: 33 },
      p2: { participation: 34 },
      p3: { participation: 33 },
    },
  }));
}

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

function tierMidpoint(tier: TierConfig): number {
  return (tier.rangeMin + tier.rangeMax) / 2;
}

function calcCategoryPmv(cat: CategoryPricePlan): number {
  return (["p1", "p2", "p3"] as PriceTierId[]).reduce((sum, tid) => {
    return sum + (tierMidpoint(TIER_CONFIG[tid]) * cat.tiers[tid].participation) / 100;
  }, 0);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PricePyramid() {
  const navigate   = useNavigate();
  const { divisionId } = useParams<{ divisionId: string }>();
  const location   = useLocation();

  // PMV planejado vem do navigation state enviado pelo botão no Bloco 2
  const plannedAvgPrice: number | undefined =
    (location.state as { plannedAvgPrice?: number } | null)?.plannedAvgPrice;

  const divId = divisionId as BusinessDivisionId;

  const [categories, setCategories] = useState<CategoryPricePlan[]>(() => {
    if (!divisionId) return [];
    return loadCategories(divId) ?? buildDefaults(divId);
  });

  useEffect(() => {
    if (divisionId) persistCategories(divisionId, categories);
  }, [divisionId, categories]);

  // PMV estimado pela pirâmide — recalcula ao vivo
  const pmvEstimado = useMemo(() => {
    if (categories.length === 0) return 0;
    const sum = categories.reduce((s, cat) => s + calcCategoryPmv(cat), 0);
    return sum / categories.length;
  }, [categories]);

  const delta        = plannedAvgPrice != null ? pmvEstimado - plannedAvgPrice : null;
  const deltaAligned = delta != null && plannedAvgPrice != null && plannedAvgPrice > 0
    ? Math.abs(delta / plannedAvgPrice) <= 0.1
    : null;

  const validCategoriesCount = categories.filter((cat) => {
    const total = (["p1", "p2", "p3"] as PriceTierId[]).reduce(
      (s, tid) => s + cat.tiers[tid].participation,
      0
    );
    return Math.abs(total - 100) < 0.01;
  }).length;

  function updateParticipation(categoryId: string, tierId: PriceTierId, value: number) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.categoryId === categoryId
          ? { ...cat, tiers: { ...cat.tiers, [tierId]: { participation: value } } }
          : cat
      )
    );
  }

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

          {/* PMV Estimado */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">PMV Estimado</span>
            <span className="text-base font-bold text-[#28071C]">R$ {pmvEstimado.toFixed(0)}</span>
          </div>

          <div className="h-5 w-px bg-[#28071C]/15" />

          {/* PMV Planejado */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">PMV Planejado</span>
            <span className="text-base font-bold text-[#28071C]">
              {plannedAvgPrice != null ? `R$ ${plannedAvgPrice.toFixed(0)}` : "—"}
            </span>
          </div>

          <div className="h-5 w-px bg-[#28071C]/15" />

          {/* Δ PMV */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#28071C]/50 uppercase tracking-wide font-semibold">Δ PMV</span>
            {delta != null ? (
              <div className="flex items-center gap-2">
                <span className={`text-base font-bold ${deltaAligned ? "text-green-700" : "text-red-600"}`}>
                  {delta >= 0 ? "+" : ""}R$ {delta.toFixed(0)}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  deltaAligned
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-600"
                }`}>
                  {deltaAligned ? "Alinhado ±10%" : "Divergência >10%"}
                </span>
              </div>
            ) : (
              <span className="text-base font-bold text-[#28071C]/30">—</span>
            )}
          </div>

          <div className="flex-1" />

          {/* Categorias validadas */}
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
            Defina a <strong>participação (%) de cada faixa de preço</strong> por categoria.
            Os valores em R$ são <strong>somente leitura</strong> — definidos nas Configurações.
            A soma das faixas de cada categoria deve fechar em <strong>100%</strong>.
          </p>
        </div>

        {/* ── LEGENDA DAS FAIXAS (somente leitura) ────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 shadow-sm border-t-4 border-[#7598CF]">
          <h2 className="text-[#28071C] font-bold mb-4 text-[11px] uppercase tracking-wide">
            Faixas de Preço — {divisionName}
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {(["p1", "p2", "p3"] as PriceTierId[]).map((tid) => {
              const tier = TIER_CONFIG[tid];
              return (
                <div key={tid} className="flex items-center gap-3 bg-[#28071C]/5 rounded-xl p-4 border border-[#28071C]/10">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${TIER_COLORS[tid]}`} />
                  <div>
                    <div className="text-[11px] font-bold text-[#28071C]/70 uppercase tracking-wide mb-0.5">
                      {tier.label}
                    </div>
                    <div className="text-[13px] font-semibold text-[#28071C]">
                      R$ {tier.rangeMin} – {tier.rangeMax}
                    </div>
                    <div className="text-[11px] text-[#28071C]/50">
                      PMV médio: R$ {tierMidpoint(tier).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-[#28071C]/40 mt-0.5 italic">Somente leitura</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CATEGORIAS ──────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {categories.map((cat) => {
            const total = (["p1", "p2", "p3"] as PriceTierId[]).reduce(
              (s, tid) => s + cat.tiers[tid].participation,
              0
            );
            const valid  = Math.abs(total - 100) < 0.01;
            const catPmv = calcCategoryPmv(cat);

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
                    const tier = TIER_CONFIG[tid];
                    return (
                      <div
                        key={tid}
                        className="bg-[#28071C]/5 rounded-xl p-3 border border-[#28071C]/10"
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className={`w-2 h-2 rounded-full ${TIER_COLORS[tid]}`} />
                          <span className="text-[11px] font-bold text-[#28071C]/70 uppercase tracking-wide">
                            {tier.label}
                          </span>
                        </div>

                        {/* R$ range — somente leitura */}
                        <div className="text-[11px] text-[#28071C]/50 mb-2">
                          R$ {tier.rangeMin}–{tier.rangeMax}
                          <span className="mx-1 opacity-50">·</span>
                          PMV R$ {tierMidpoint(tier).toFixed(0)}
                        </div>

                        {/* Participação — editável */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={cat.tiers[tid].participation}
                            onChange={(e) =>
                              updateParticipation(cat.categoryId, tid, Number(e.target.value))
                            }
                            min={0}
                            max={100}
                            className="flex-1 min-w-0 px-2 py-1.5 border-2 border-[#28071C]/20 rounded-lg text-[12px] text-center font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#28071C]/40"
                          />
                          <span className="text-[11px] text-[#28071C]/50 font-medium">%</span>
                        </div>

                        {/* Barra visual */}
                        <div className="mt-2 h-1 bg-[#28071C]/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${TIER_COLORS[tid]}`}
                            style={{ width: `${Math.min(cat.tiers[tid].participation, 100)}%` }}
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

      </main>
    </div>
  );
}
