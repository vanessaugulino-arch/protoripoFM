/**
 * Plano Final — consolida M1-M6 (macro, sazonalidade aplicada nas divisões,
 * divisão, coleções e sortimento) numa única tela de apresentação/entrega,
 * com impressão (window.print()) e exportação em CSV ("Excel", mesmo padrão
 * de BOM UTF-8 já usado em todo o projeto).
 *
 * Referência visual: mockup "Entrega Final" apresentado anteriormente pela
 * usuária — reaproveita a densidade de informação (KPIs, régua mensal de
 * entrada, estrutura Divisão→Categoria→Subcategoria com risco), mas cada
 * número vem de dado real do plano; nenhuma coluna do mockup sem
 * equivalente real nos dados hoje disponíveis (ex.: margem/PM por categoria)
 * foi replicada.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Download, Printer, ChevronDown, ChevronRight, StickyNote } from "lucide-react";
import { PlanObservationCard } from "../components/PlanObservationCard";
import { getPlannedYears, initPlanCycles } from "../types/planCycle";
import { getOfficialPlan, type OfficialPlan } from "../../services/supabase/officialPlanService";
import { getTemporadas, MONTHS, type Temporada } from "../../services/temporadaService";
import { expandSeasonMonths } from "../../engine/seasonMonths";
import { fetchTenantDivisions, type TenantDivision } from "../../services/supabase/productHierarchyService";
import { getAppliedDivisionScenario } from "../../services/supabase/divisionScenarioService";
import type { DivisionPlanBlock } from "../types/module3";
import { getWorkingCollectionPlan, type CollectionPlanDivision } from "../../services/supabase/collectionPlanService";
import { computeMonthlyExpectedSold, buildDivisionTimeline, type DivisionSalesTarget } from "../../engine/collectionMonthlyLedger";
import { getConsolidated, getCategoryHistoricalIndicators, type ConsolidatedDbRow } from "../../services/supabase/consolidatedHierarchyService";
import { getCategoryNotes, getCategoryIndicators, type CategoryNote } from "../../services/supabase/sortimentGridService";

interface UserData {
  name: string;
  email: string;
  tenant_id?: string;
}

// ─── Agregação Divisão → Categoria → Subcategoria (real, sem colunas inventadas) ──
interface StructureRow {
  divisionId: string;
  divisionLabel: string;
  category: string;
  subcategory: string;
  revenueEstimate: number;
  pctSustentadorMargem: number | null;
  pctMotorGiro: number | null;
  pctIconeMarca: number | null;
  pctBasico: number | null;
  /** Preço Médio: valor decidido no plano (M6), com fallback pro histórico real. */
  avgPrice: number | null;
  /** Peças estimadas — revenueEstimate ÷ avgPrice. */
  pieces: number | null;
  /** Remarcação: valor decidido no plano (M6), com fallback pro histórico real. */
  mkdPct: number | null;
  /** Margem real (histórico) — não existe margem editável por categoria em nenhuma tela. */
  marginPct: number | null;
  note: CategoryNote | null;
}

// Cores da marca — Básico funde visualmente no Sustentador de Margem (decisão
// da usuária: só 3 segmentos na régua, não 4).
const RISK_COLORS: Record<"sustentador" | "motorGiro" | "icone", string> = {
  sustentador: "#94A3B8", // cinza da marca (inclui Básico)
  motorGiro: "#28071C",   // vinho da marca
  icone: "#F6F3AA",       // amarelo da marca
};

function weightedAvg(pairs: Array<[number | null, number]>): number | null {
  let sumW = 0, sumWV = 0, any = false;
  for (const [v, w] of pairs) {
    if (v == null || w <= 0) continue;
    any = true;
    sumW += w;
    sumWV += v * w;
  }
  return any && sumW > 0 ? sumWV / sumW : null;
}

export default function FinalPlan() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [plannedYears, setPlannedYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [officialPlan, setOfficialPlan] = useState<OfficialPlan | null>(null);
  const [priorYearPlan, setPriorYearPlan] = useState<OfficialPlan | null>(null);

  const [allTemporadas, setAllTemporadas] = useState<Temporada[]>([]);
  const [seasonsInYear, setSeasonsInYear] = useState<Temporada[]>([]);
  const [realDivisions, setRealDivisions] = useState<TenantDivision[]>([]);

  const [structureRows, setStructureRows] = useState<StructureRow[]>([]);
  const [ledger, setLedger] = useState<Array<{ label: string; pieces: number; avgPrice: number | null; value: number }>>([]);
  const [hasCollectionData, setHasCollectionData] = useState(false);

  const [mode, setMode] = useState<"resumido" | "detalhado">("resumido");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (!stored) { navigate("/"); return; }
    const userData = JSON.parse(stored);
    setUser(userData);
    const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
    setTenantId(tid);
    if (tid) {
      initPlanCycles(tid).then(() => {
        const years = getPlannedYears();
        setPlannedYears(years);
        if (years.length > 0) setSelectedYear(Math.max(...years));
      }).catch(() => {});
      getTemporadas(tid).then(setAllTemporadas).catch(() => {});
      fetchTenantDivisions(tid).then(setRealDivisions).catch(() => {});
    }
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    setSeasonsInYear(allTemporadas.filter(t => t.anoFiscal === selectedYear));
  }, [allTemporadas, selectedYear]);

  // ─── Plano Oficial (macro real) do ano selecionado + ano anterior ────────
  useEffect(() => {
    if (!tenantId) return;
    getOfficialPlan(tenantId, selectedYear).then(setOfficialPlan).catch(() => setOfficialPlan(null));
    getOfficialPlan(tenantId, selectedYear - 1).then(setPriorYearPlan).catch(() => setPriorYearPlan(null));
  }, [tenantId, selectedYear]);

  // ─── Estrutura Divisão→Categoria→Subcategoria (M6, agregada entre temporadas do ano) ──
  useEffect(() => {
    if (!tenantId || seasonsInYear.length === 0) { setStructureRows([]); return; }
    let cancelled = false;

    Promise.all(
      seasonsInYear.map(async season => {
        const rows = await getConsolidated(tenantId, season.id);
        const divIds = Array.from(new Set(rows.map(r => r.divisionId)));
        const notesByDiv = await Promise.all(divIds.map(id => getCategoryNotes(tenantId, season.id, id)));
        const overridesByDiv = await Promise.all(divIds.map(id => getCategoryIndicators(tenantId, season.id, id)));
        const notesMap = new Map<string, Map<string, CategoryNote[]>>();
        const overridesMap = new Map<string, Map<string, { avgPrice: number; mkdPct: number }>>();
        divIds.forEach((id, i) => { notesMap.set(id, notesByDiv[i]); overridesMap.set(id, overridesByDiv[i]); });
        return { rows, notesMap, overridesMap, divIds };
      }),
    ).then(async perSeason => {
      if (cancelled) return;

      // Histórico real (avgPrice/mkdPct/margin) — não depende de temporada,
      // uma busca por divisão só (getCategoryHistoricalIndicators já cobre
      // o tenant inteiro daquela divisão).
      const allDivIds = Array.from(new Set(perSeason.flatMap(s => s.divIds)));
      const histByDiv = await Promise.all(allDivIds.map(id => getCategoryHistoricalIndicators(tenantId, id)));
      const histIndicatorsMap = new Map<string, Record<string, { avgPrice: number; mkdPct: number | null; marginPct: number }>>();
      allDivIds.forEach((id, i) => histIndicatorsMap.set(id, histByDiv[i]));

      // Agrega por (divisão, categoria, subcategoria) entre todas as temporadas do ano.
      const byKey = new Map<string, ConsolidatedDbRow[]>();
      const notesByDivCat = new Map<string, CategoryNote | null>();
      const overridesByDivCat = new Map<string, { avgPrice: number; mkdPct: number }>();
      for (const { rows, notesMap, overridesMap } of perSeason) {
        for (const r of rows) {
          const key = `${r.divisionId}::${r.category}::${r.subcategory}`;
          byKey.set(key, [...(byKey.get(key) ?? []), r]);
        }
        for (const [divId, catMap] of notesMap) {
          for (const [category, notes] of catMap) {
            const noteKey = `${divId}::${category}`;
            if (notes.length > 0 && !notesByDivCat.has(noteKey)) notesByDivCat.set(noteKey, notes[0]);
          }
        }
        for (const [divId, catMap] of overridesMap) {
          for (const [category, ov] of catMap) {
            const key = `${divId}::${category}`;
            if (!overridesByDivCat.has(key)) overridesByDivCat.set(key, ov);
          }
        }
      }
      const out: StructureRow[] = [];
      for (const [key, group] of byKey) {
        const [divisionId, category, subcategory] = key.split("::");
        const totalRevenue = group.reduce((s, r) => s + r.revenueEstimate, 0);
        const hist = histIndicatorsMap.get(divisionId)?.[category];
        const override = overridesByDivCat.get(`${divisionId}::${category}`);
        // Preço Médio/Remarcação: valor decidido no plano (M6) quando existe;
        // sem decisão salva, cai pro histórico real como referência.
        const avgPrice = override?.avgPrice ?? hist?.avgPrice ?? null;
        out.push({
          divisionId,
          divisionLabel: realDivisions.find(d => d.id === divisionId)?.label ?? divisionId,
          category,
          subcategory,
          revenueEstimate: totalRevenue,
          pctSustentadorMargem: weightedAvg(group.map(r => [r.pctSustentadorMargem, r.revenueEstimate])),
          pctMotorGiro: weightedAvg(group.map(r => [r.pctMotorGiro, r.revenueEstimate])),
          pctIconeMarca: weightedAvg(group.map(r => [r.pctIconeMarca, r.revenueEstimate])),
          pctBasico: weightedAvg(group.map(r => [r.pctBasico, r.revenueEstimate])),
          avgPrice,
          pieces: avgPrice != null && avgPrice > 0 ? totalRevenue / avgPrice : null,
          mkdPct: override?.mkdPct ?? hist?.mkdPct ?? null,
          marginPct: hist?.marginPct ?? null,
          note: notesByDivCat.get(`${divisionId}::${category}`) ?? null,
        });
      }
      out.sort((a, b) => a.divisionLabel.localeCompare(b.divisionLabel) || b.revenueEstimate - a.revenueEstimate);
      setStructureRows(out);
    }).catch(() => setStructureRows([]));

    return () => { cancelled = true; };
  }, [tenantId, seasonsInYear, realDivisions]);

  // ─── Régua "Necessidade de Entrada" — ano civil, agregada entre temporadas/divisões ──
  useEffect(() => {
    if (!tenantId || seasonsInYear.length === 0) { setLedger([]); setHasCollectionData(false); return; }
    let cancelled = false;

    Promise.all(
      seasonsInYear.map(async season => {
        const [divScenario, working] = await Promise.all([
          getAppliedDivisionScenario(tenantId, season.id),
          getWorkingCollectionPlan(tenantId, season.id),
        ]);
        const divs = (divScenario?.divisions ?? {}) as Record<string, DivisionPlanBlock>;
        const plan = (working ?? {}) as Record<string, CollectionPlanDivision>;
        const seasonMonths = expandSeasonMonths(season.mesInicio, season.mesFim, season.anoFiscal ?? selectedYear);
        const monthNames = seasonMonths.map(m => MONTHS[m.month - 1]);

        const perDivision = Object.entries(divs).map(([divId, block]) => {
          const vc = block?.volumeCoverage;
          const target: DivisionSalesTarget = {
            targetPieces: vc?.productionVolume ?? 0,
            unitsExpectedSold: vc?.unitsExpectedSold ?? 0,
            initialStock: vc?.initialStock ?? 0,
            participation: block?.participation ?? 0,
            avgPrice: block?.indicators?.avgPrice ?? 0,
          };
          const expected = computeMonthlyExpectedSold(target, monthNames, null, undefined);
          const entries = plan[divId]?.entries ?? [];
          const timeline = buildDivisionTimeline(entries, target, monthNames, expected);
          return { avgPrice: target.avgPrice, timeline };
        });

        return { seasonMonths, monthNames, perDivision };
      }),
    ).then(perSeason => {
      if (cancelled) return;
      // Chave canônica ano-mês (para meses de temporadas diferentes não colidirem).
      const byMonthKey = new Map<string, { label: string; pieces: number; value: number; sortKey: number }>();
      let anyEntries = false;
      for (const { seasonMonths, monthNames, perDivision } of perSeason) {
        seasonMonths.forEach((sm, i) => {
          const monthKey = `${sm.year}-${String(sm.month).padStart(2, "0")}`;
          const label = monthNames[i];
          const bucket = byMonthKey.get(monthKey) ?? { label, pieces: 0, value: 0, sortKey: sm.year * 12 + sm.month };
          for (const div of perDivision) {
            const t = div.timeline[i];
            if (!t) continue;
            if (t.entries.length > 0) anyEntries = true;
            bucket.pieces += t.necessidadeEntrada;
            bucket.value += t.necessidadeEntrada * div.avgPrice;
          }
          byMonthKey.set(monthKey, bucket);
        });
      }
      const sorted = Array.from(byMonthKey.values()).sort((a, b) => a.sortKey - b.sortKey);
      setLedger(sorted.map(b => ({
        label: b.label,
        pieces: b.pieces,
        avgPrice: b.pieces > 0 ? b.value / b.pieces : null,
        value: b.value,
      })));
      setHasCollectionData(anyEntries);
    }).catch(() => { setLedger([]); setHasCollectionData(false); });

    return () => { cancelled = true; };
  }, [tenantId, seasonsInYear, selectedYear]);

  const macro = officialPlan?.macro ?? null;
  const priorMacro = priorYearPlan?.macro ?? null;

  const delta = (curr: number | undefined, prior: number | undefined): { pct: number; good: boolean } | null => {
    if (curr == null || prior == null || prior === 0) return null;
    const pct = ((curr - prior) / Math.abs(prior)) * 100;
    return { pct, good: pct >= 0 };
  };

  const fmtMoneyM = (v: number) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
  const fmtPct1 = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
  const fmtMoney2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const ledgerTotals = useMemo(() => ({
    pieces: ledger.reduce((s, m) => s + m.pieces, 0),
    value: ledger.reduce((s, m) => s + m.value, 0),
  }), [ledger]);

  const groupedStructure = useMemo(() => {
    const byDivision = new Map<string, StructureRow[]>();
    for (const r of structureRows) {
      byDivision.set(r.divisionId, [...(byDivision.get(r.divisionId) ?? []), r]);
    }
    return Array.from(byDivision.entries()).map(([divisionId, rows]) => {
      const byCategory = new Map<string, StructureRow[]>();
      for (const r of rows) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
      const divisionTotal = rows.reduce((s, r) => s + r.revenueEstimate, 0);
      return {
        divisionId,
        divisionLabel: rows[0]?.divisionLabel ?? divisionId,
        total: divisionTotal,
        categories: Array.from(byCategory.entries()).map(([category, catRows]) => {
          const catTotal = catRows.reduce((s, r) => s + r.revenueEstimate, 0);
          const avgPrice = catRows.find(r => r.avgPrice != null)?.avgPrice ?? null;
          return {
            category,
            total: catTotal,
            note: catRows.find(r => r.note)?.note ?? null,
            avgPrice,
            pieces: avgPrice != null && avgPrice > 0 ? catTotal / avgPrice : null,
            mkdPct: catRows.find(r => r.mkdPct != null)?.mkdPct ?? null,
            marginPct: weightedAvg(catRows.map(r => [r.marginPct, r.revenueEstimate])),
            risk: {
              // Básico funde no Sustentador de Margem (decisão da usuária).
              sustentador: weightedAvg(catRows.map(r => [
                (r.pctSustentadorMargem ?? 0) + (r.pctBasico ?? 0), r.revenueEstimate,
              ])),
              motorGiro: weightedAvg(catRows.map(r => [r.pctMotorGiro, r.revenueEstimate])),
              icone: weightedAvg(catRows.map(r => [r.pctIconeMarca, r.revenueEstimate])),
            },
            subcategories: catRows.filter(r => r.subcategory),
          };
        }).sort((a, b) => b.total - a.total),
      };
    }).sort((a, b) => b.total - a.total);
  }, [structureRows]);

  const totalRevenueStructure = structureRows.reduce((s, r) => s + r.revenueEstimate, 0);

  const riskBar = (risk: { sustentador: number | null; motorGiro: number | null; icone: number | null }) => {
    const parts: Array<[number, string, string]> = [
      [risk.sustentador ?? 0, RISK_COLORS.sustentador, "Sustentador de Margem (+ Básico)"],
      [risk.motorGiro ?? 0, RISK_COLORS.motorGiro, "Motor de Giro"],
      [risk.icone ?? 0, RISK_COLORS.icone, "Ícone de Marca"],
    ];
    const total = parts.reduce((s, [v]) => s + v, 0);
    if (total <= 0) return <span className="text-[#28071C]/30 text-xs">—</span>;
    const tooltip = parts.map(([v, , label]) => `${label}: ${v.toFixed(0)}%`).join(" · ");
    return (
      <div className="flex h-1.5 rounded-full overflow-hidden w-full max-w-[100px]" title={tooltip}>
        {parts.map(([v, color], i) => v > 0 ? <span key={i} style={{ width: `${v}%`, background: color }} /> : null)}
      </div>
    );
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleNote = (key: string) => {
    setOpenNotes(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const buildFinalPlanCsv = (): string => {
    const lines: string[] = [];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const row = (vals: (string | number)[]) => lines.push(vals.map(esc).join(";"));

    row([`Plano Final — Ciclo ${selectedYear}`]);
    row([]);
    row(["Indicador", "Valor"]);
    if (macro) {
      row(["Receita Bruta", macro.receitaBruta.toFixed(2)]);
      row(["Margem Bruta (%)", macro.margemBruta.toFixed(1)]);
      row(["Remarcação (%)", macro.mkdPct.toFixed(1)]);
      row(["GMROI", macro.gmroi.toFixed(2)]);
      row(["Peças Vendidas (Produção Necessária)", Math.round(macro.pecasVendidas)]);
    }
    row([]);

    row(["Necessidade de Entrada — Mês", "Necessidade (pçs)", "Preço Médio", "Valor Financeiro"]);
    ledger.forEach(m => row([m.label, Math.round(m.pieces), m.avgPrice?.toFixed(2) ?? "", m.value.toFixed(2)]));
    row(["Total", Math.round(ledgerTotals.pieces), "", ledgerTotals.value.toFixed(2)]);
    row([]);

    row([
      "Divisão", "Categoria", "Subcategoria", "Peças", "Faturamento Estimado", "Margem %", "Preço Médio", "Remarcação %",
      "% Sustentador (+ Básico)", "% Motor de Giro", "% Ícone",
    ]);
    structureRows.forEach(r => row([
      r.divisionLabel, r.category, r.subcategory,
      r.pieces != null ? Math.round(r.pieces) : "",
      r.revenueEstimate.toFixed(2),
      r.marginPct?.toFixed(1) ?? "",
      r.avgPrice?.toFixed(2) ?? "",
      r.mkdPct?.toFixed(1) ?? "",
      ((r.pctSustentadorMargem ?? 0) + (r.pctBasico ?? 0)).toFixed(1),
      r.pctMotorGiro?.toFixed(1) ?? "",
      r.pctIconeMarca?.toFixed(1) ?? "",
    ]));

    return lines.join("\n");
  };

  const downloadCsv = () => {
    const csv = buildFinalPlanCsv();
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plano_final_${selectedYear}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !user) return null;

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2] print:bg-white">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body { background: white; }
        }
      `}</style>

      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg print:hidden">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Plano Final</span>
              {plannedYears.length > 1 && (
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="ml-3 bg-white/15 text-[#F6F3AA] text-xs font-semibold px-2.5 py-1 rounded-full border-none outline-none"
                >
                  {plannedYears.map(y => <option key={y} value={y} className="text-[#28071C]">{y}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-[#F6F3AA] rounded-lg text-xs font-medium transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Baixar Excel
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F3AA] hover:bg-[#F6F3AA]/90 text-[#28071C] rounded-lg text-xs font-semibold transition-all"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-5 print:px-0 print:py-0">
        {!macro ? (
          <div className="bg-white rounded-2xl p-8 text-center text-[#28071C]/50 shadow-sm">
            Nenhum plano macro salvo ainda para {selectedYear} — o Plano Final fica disponível assim que o Módulo 1 é salvo.
          </div>
        ) : (
          <>
            {/* ─── KPIs ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {([
                ["Receita", fmtMoneyM(macro.receitaBruta), delta(macro.receitaBruta, priorMacro?.receitaBruta)],
                ["Margem Bruta", fmtPct1(macro.margemBruta), delta(macro.margemBruta, priorMacro?.margemBruta)],
                // Remarcação: queda é boa — inverte o sinal de "good" do delta padrão.
                ["Remarcação", fmtPct1(macro.mkdPct), (() => {
                  const d = delta(macro.mkdPct, priorMacro?.mkdPct);
                  return d ? { pct: d.pct, good: !d.good } : null;
                })()],
                ["GMROI", `${macro.gmroi.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`, delta(macro.gmroi, priorMacro?.gmroi)],
                ["Produção Necessária", `${fmtInt(macro.pecasVendidas)} pçs`, null],
              ] as const).map(([label, value, d], i) => (
                <div key={i} className="bg-white border border-[#28071C]/8 rounded-xl px-3 py-2.5 shadow-sm">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wide text-[#28071C]/40 mb-1">{label}</div>
                  <div className="text-base font-semibold text-[#28071C] font-serif mb-1 truncate">{value}</div>
                  {d && (
                    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${d.good ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                      {d.pct >= 0 ? "+" : ""}{d.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* ─── Observações do Plano Macro ───────────────────────────── */}
            <PlanObservationCard
              tenantId={tenantId}
              module="m1_estrategico"
              seasonKey={String(selectedYear)}
              title="Observações do Plano Macro"
              userEmail={user.email}
            />

            {/* ─── Necessidade de Entrada — Ano Civil ───────────────────── */}
            <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#28071C]/8 flex items-baseline justify-between flex-wrap gap-2">
                <h2 className="font-serif font-semibold text-[#28071C] text-base">Necessidade de Entrada — Ano Civil {selectedYear}</h2>
                <span className="text-[11px] text-[#28071C]/40">Peças que precisam entrar mês a mês, considerando o estoque já projetado (M4+M5 reais)</span>
              </div>
              <div className="p-5">
                {!hasCollectionData ? (
                  <p className="text-[#28071C]/40 text-sm">
                    Ainda não há Plano de Coleção (M5) aplicado para nenhuma temporada de {selectedYear} — esta régua fica disponível assim que houver coleções planejadas.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 760 }}>
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-[#28071C]/40 border-b border-[#28071C]/15">
                          <th className="text-left py-2 pr-3"></th>
                          {ledger.map(m => <th key={m.label} className="text-center py-2 px-2 whitespace-nowrap">{m.label}</th>)}
                          <th className="text-center py-2 px-3 bg-[#F2F2F2] whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-[#28071C]/8">
                          <th className="text-left py-2 pr-3 font-semibold text-[#28071C] whitespace-nowrap">Necessidade (pçs)</th>
                          {ledger.map(m => <td key={m.label} className="text-right font-mono py-2 px-2 text-[#28071C]/75">{fmtInt(m.pieces)}</td>)}
                          <td className="text-right font-mono font-bold py-2 px-3 bg-[#F2F2F2]">{fmtInt(ledgerTotals.pieces)}</td>
                        </tr>
                        <tr className="border-b border-[#28071C]/8">
                          <th className="text-left py-2 pr-3 font-semibold text-[#28071C] whitespace-nowrap">Preço Médio</th>
                          {ledger.map(m => <td key={m.label} className="text-right font-mono py-2 px-2 text-[#28071C]/75">{m.avgPrice != null ? fmtMoney2(m.avgPrice) : "—"}</td>)}
                          <td className="text-right font-mono font-bold py-2 px-3 bg-[#F2F2F2]">{ledgerTotals.pieces > 0 ? fmtMoney2(ledgerTotals.value / ledgerTotals.pieces) : "—"}</td>
                        </tr>
                        <tr>
                          <th className="text-left py-2 pr-3 font-semibold text-[#28071C] whitespace-nowrap">Valor Financeiro</th>
                          {ledger.map(m => <td key={m.label} className="text-right font-mono py-2 px-2 text-[#28071C]/75">{fmtMoney2(m.value)}</td>)}
                          <td className="text-right font-mono font-bold py-2 px-3 bg-[#F2F2F2]">{fmtMoney2(ledgerTotals.value)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* ─── Estrutura da Coleção ──────────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#28071C]/8 flex items-baseline justify-between flex-wrap gap-2">
                <h2 className="font-serif font-semibold text-[#28071C] text-base">Estrutura da Coleção</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#28071C]/40">
                    {mode === "detalhado" ? "Divisão → Categoria → Subcategoria" : "Divisão → Categoria — resumo consolidado"}
                  </span>
                  <div className="inline-flex bg-[#F2F2F2] rounded-lg p-0.5 print:hidden">
                    <button onClick={() => setMode("resumido")} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${mode === "resumido" ? "bg-white shadow-sm text-[#28071C]" : "text-[#28071C]/50"}`}>Resumido</button>
                    <button onClick={() => setMode("detalhado")} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${mode === "detalhado" ? "bg-white shadow-sm text-[#28071C]" : "text-[#28071C]/50"}`}>Detalhado</button>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {structureRows.length === 0 ? (
                  <p className="text-[#28071C]/40 text-sm">
                    Ainda não há cascata de categoria (M6) calculada para nenhuma temporada de {selectedYear}.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 720 }}>
                      <thead>
                        <tr className="text-[9.5px] uppercase tracking-wide text-[#28071C]/40 border-b border-[#28071C]/15">
                          <th className="text-left py-2 pr-3">Estrutura</th>
                          <th className="text-right py-2 px-2">Participação</th>
                          <th className="text-right py-2 px-2">Peças</th>
                          <th className="text-right py-2 px-2">Faturamento</th>
                          <th className="text-right py-2 px-2">Margem</th>
                          <th className="text-right py-2 px-2">Preço Médio</th>
                          <th className="text-right py-2 px-2">Remarcação</th>
                          <th className="text-right py-2 px-2">GMROI</th>
                          <th className="text-left py-2 px-2 w-[110px]">Risco</th>
                          <th className="text-center py-2 px-2 w-[40px]">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedStructure.map(div => (
                          <Fragment key={div.divisionId}>
                            <tr className="bg-[#F2F2F2] font-bold">
                              <td className="py-2 pr-3 font-serif text-[13px] text-[#28071C]">{div.divisionLabel}</td>
                              <td className="text-right font-mono py-2 px-2">{totalRevenueStructure > 0 ? fmtPct1((div.total / totalRevenueStructure) * 100) : "—"}</td>
                              <td className="py-2 px-2"></td>
                              <td className="text-right font-mono py-2 px-2">{fmtMoneyM(div.total)}</td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2"></td>
                            </tr>
                            {div.categories.map(cat => {
                              const catKey = `${div.divisionId}::${cat.category}`;
                              const isOpen = expandedCategories.has(catKey);
                              const noteKey = `note-${catKey}`;
                              return (
                                <Fragment key={catKey}>
                                  <tr
                                    className={mode === "detalhado" ? "cursor-pointer hover:bg-[#7598CF]/5" : ""}
                                    onClick={() => mode === "detalhado" && toggleCategory(catKey)}
                                  >
                                    <td className="py-2 pr-3 pl-6 text-[#28071C]/85">
                                      <span className="inline-flex items-center gap-1.5">
                                        {mode === "detalhado" && cat.subcategories.length > 0 ? (
                                          isOpen ? <ChevronDown className="w-3 h-3 text-[#28071C]/40" /> : <ChevronRight className="w-3 h-3 text-[#28071C]/40" />
                                        ) : <span className="w-3" />}
                                        {cat.category}
                                      </span>
                                    </td>
                                    <td className="text-right font-mono py-2 px-2">{div.total > 0 ? fmtPct1((cat.total / div.total) * 100) : "—"}</td>
                                    <td className="text-right font-mono py-2 px-2">{cat.pieces != null ? fmtInt(cat.pieces) : "—"}</td>
                                    <td className="text-right font-mono py-2 px-2">{fmtMoneyM(cat.total)}</td>
                                    <td className="text-right font-mono py-2 px-2">{cat.marginPct != null ? fmtPct1(cat.marginPct) : "—"}</td>
                                    <td className="text-right font-mono py-2 px-2">{cat.avgPrice != null ? fmtMoney2(cat.avgPrice) : "—"}</td>
                                    <td className="text-right font-mono py-2 px-2">{cat.mkdPct != null ? fmtPct1(cat.mkdPct) : "—"}</td>
                                    <td className="text-right font-mono py-2 px-2 text-[#28071C]/25" title="Sem estoque médio real por categoria ainda — não é possível calcular GMROI sem inventar dado.">—</td>
                                    <td className="py-2 px-2">{riskBar(cat.risk)}</td>
                                    <td className="text-center py-2 px-2">
                                      {cat.note ? (
                                        <button onClick={e => { e.stopPropagation(); toggleNote(noteKey); }} className="text-[#7598CF]" title="Ver observação">
                                          <StickyNote className="w-3.5 h-3.5" />
                                        </button>
                                      ) : <span className="text-[#28071C]/15">—</span>}
                                    </td>
                                  </tr>
                                  {cat.note && openNotes.has(noteKey) && (
                                    <tr className="bg-[#7598CF]/5">
                                      <td colSpan={10} className="py-2 px-6 text-[11px] italic text-[#28071C]/70">“{cat.note.note}”</td>
                                    </tr>
                                  )}
                                  {mode === "detalhado" && isOpen && cat.subcategories.map(sub => (
                                    <tr key={`${catKey}::${sub.subcategory}`} className="bg-[#F2F2F2]/60 text-[11px]">
                                      <td className="py-1.5 pr-3 pl-10 text-[#28071C]/70">{sub.subcategory}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/70">{cat.total > 0 ? fmtPct1((sub.revenueEstimate / cat.total) * 100) : "—"}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/70">{sub.pieces != null ? fmtInt(sub.pieces) : "—"}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/70">{fmtMoneyM(sub.revenueEstimate)}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/70">{sub.marginPct != null ? fmtPct1(sub.marginPct) : "—"}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/70">{sub.avgPrice != null ? fmtMoney2(sub.avgPrice) : "—"}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/70">{sub.mkdPct != null ? fmtPct1(sub.mkdPct) : "—"}</td>
                                      <td className="text-right font-mono py-1.5 px-2 text-[#28071C]/25">—</td>
                                      <td className="py-1.5 px-2">{riskBar({
                                        sustentador: (sub.pctSustentadorMargem ?? 0) + (sub.pctBasico ?? 0),
                                        motorGiro: sub.pctMotorGiro,
                                        icone: sub.pctIconeMarca,
                                      })}</td>
                                      <td></td>
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex gap-4 mt-4 text-[10.5px] text-[#28071C]/55">
                      <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: RISK_COLORS.sustentador }} />Sustentador de Margem (+ Básico)</span>
                      <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: RISK_COLORS.motorGiro }} />Motor de Giro</span>
                      <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: RISK_COLORS.icone }} />Ícone de Marca</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
