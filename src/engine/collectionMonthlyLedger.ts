// src/engine/collectionMonthlyLedger.ts
// Extraído de CollectionPlan.tsx (Módulo 5) — funções puras de venda esperada
// mensal e da régua "Necessidade de Entrada", reutilizadas também pelo Plano
// Final (M1-M6 consolidado), sem duplicar a fórmula.

import type { CollectionPlanEntry } from "../services/supabase/collectionPlanService";
import type { DivisionMonthProfile } from "../services/supabase/divisionSeasonalityService";

export interface DivisionSalesTarget {
  targetPieces: number;
  unitsExpectedSold: number;
  initialStock: number;
  participation: number;
  avgPrice: number;
}

/**
 * Venda esperada por mês, por divisão — a partir da receita REAL já aplicada
 * na Sazonalidade (M3), não de peso histórico. Ex.: R$200 mil vendidos em
 * agosto na Sazonalidade × 40% de participação da divisão (M4) ÷ PMV da
 * divisão = peças que a divisão precisa vender em agosto. Cai para peso
 * histórico (getDivisionSeasonality) só quando a Sazonalidade real ainda não
 * está disponível (ex.: cenário legado sem plannedRevenue salvo).
 */
export function computeMonthlyExpectedSold(
  target: DivisionSalesTarget | undefined,
  seasonMonths: string[],
  sazonalidadeMonthlyTotal: Record<string, number> | null,
  histProfile: DivisionMonthProfile | undefined,
): Record<string, number> {
  if (!target || seasonMonths.length === 0) return {};
  const { participation, avgPrice, unitsExpectedSold } = target;

  if (sazonalidadeMonthlyTotal && avgPrice > 0 && participation > 0) {
    const result: Record<string, number> = {};
    seasonMonths.forEach(m => {
      const receitaMes = sazonalidadeMonthlyTotal[m] ?? 0;
      result[m] = (receitaMes * (participation / 100)) / avgPrice;
    });
    return result;
  }

  // Fallback: peso histórico distribuindo o total de peças da temporada.
  if (!unitsExpectedSold) return {};
  const weights = seasonMonths.map(m => histProfile?.monthlyPcts[m] ?? 0);
  const sumW = weights.reduce((s, w) => s + w, 0);
  const norm = sumW > 0 ? weights.map(w => w / sumW) : seasonMonths.map(() => 1 / seasonMonths.length);
  const result: Record<string, number> = {};
  seasonMonths.forEach((m, i) => { result[m] = unitsExpectedSold * norm[i]; });
  return result;
}

export const COBERTURA_JANELA_DIAS = 90;

export interface DivisionTimelineMonth {
  month: string;
  entries: CollectionPlanEntry[];
  necessidadeEntrada: number;
  entered: number;
  diferenca: number;
  soldExpected: number;
  stockEnd: number;
  coverageDays: number;
}

/**
 * Timeline mensal de uma divisão — 4 linhas:
 * 1. Necessidade de entrada: peças que PRECISAM entrar neste mês pra cobrir
 *    a venda esperada, descontado o estoque já projetado no início do mês.
 * 2. Coleções: peças de fato planejadas (entries).
 * 3. Diferença: Coleções − Necessidade (negativo = falta planejar mais).
 * 4. Cobertura: janela fixa de 90 dias (soma da venda esperada dos 3 meses
 *    seguintes, incluindo o atual) — usa estoque de FIM de mês (stockEnd),
 *    sempre a partir do que foi de fato planejado em coleções, nunca da
 *    necessidade (que é só referência para a estilista decidir se ajusta).
 */
export function buildDivisionTimeline(
  entries: CollectionPlanEntry[],
  target: DivisionSalesTarget | undefined,
  seasonMonths: string[],
  expected: Record<string, number>,
): DivisionTimelineMonth[] {
  const covMonths = Math.round(COBERTURA_JANELA_DIAS / 30); // 3 meses ≈ 90 dias
  let stockStart = target?.initialStock ?? 0;
  return seasonMonths.map((month, i) => {
    const monthEntries = entries.filter(e => e.month === month);
    const entered = monthEntries.reduce((s, e) => s + e.plannedPieces, 0);
    const soldExpected = expected[month] ?? 0;
    const necessidadeEntrada = Math.max(0, soldExpected - stockStart);
    const diferenca = entered - necessidadeEntrada;
    const stockEnd = stockStart + entered - soldExpected;
    const demanda90d = seasonMonths
      .slice(i, i + covMonths)
      .reduce((s, m) => s + (expected[m] ?? 0), 0);
    const coverageDays = demanda90d > 0
      ? (stockEnd / demanda90d) * COBERTURA_JANELA_DIAS
      : (stockEnd > 0 ? Infinity : 0);
    stockStart = stockEnd;
    return { month, entries: monthEntries, necessidadeEntrada, entered, diferenca, soldExpected, stockEnd, coverageDays };
  });
}
