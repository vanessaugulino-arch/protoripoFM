/**
 * Serviço de Cenários para Módulo 3
 * Cache em memória + write-through para Supabase.
 * NÃO usa localStorage.
 */

import { Module3Scenario, BusinessDivisionId, DivisionPlanBlock } from "../app/types/module3";
import { consolidateCells, type MacroCell } from "../engine/cellConsolidation";
import {
  listDivisionScenarios,
  saveDivisionScenario,
  deleteDivisionScenario,
  applyDivisionScenario,
  type DivisionScenarioRow,
} from "./supabase/divisionScenarioService";

// ─── Cache em memória ─────────────────────────────────────────────────────────
// Populado via initModule3Scenarios(tenantId, seasonId).
// Escrita via saveModule3Scenario (write-through → Supabase, fire-and-forget).

let _tenantId: string | null = null;
const _cache = new Map<string, Module3Scenario[]>(); // key: seasonId

// ─── Mapeamento DB ↔ Module3Scenario ─────────────────────────────────────────

function rowToScenario(row: DivisionScenarioRow): Module3Scenario {
  const cons = row.consolidated as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    seasonId: row.season_id,
    referenceSeasonId: (cons?.referenceSeasonId as string | undefined) ?? row.season_id,
    createdAt: row.saved_at,
    createdBy: row.created_by ?? "",
    divisions: row.divisions as Record<BusinessDivisionId, DivisionPlanBlock>,
    consolidated: {
      totalRevenue:    (cons?.totalRevenue    as number) ?? 0,
      avgMargin:       (cons?.avgMargin       as number) ?? 0,
      avgSellThrough:  (cons?.avgSellThrough  as number) ?? 0,
      avgGmroi:        (cons?.avgGmroi        as number) ?? 0,
      meetsAllTargets: (cons?.meetsAllTargets as boolean) ?? false,
    },
    isActive: row.is_applied,
  };
}

// ─── Inicialização ────────────────────────────────────────────────────────────
// Deve ser chamado quando a temporada muda em Module3DivisionPlanning.

export async function initModule3Scenarios(
  tenantId: string,
  seasonId: string,
): Promise<void> {
  _tenantId = tenantId;
  if (_cache.has(seasonId)) return; // já carregado nesta sessão
  try {
    const rows = await listDivisionScenarios(tenantId, seasonId);
    _cache.set(seasonId, rows.map(rowToScenario));
  } catch (err) {
    console.warn("[module3] initModule3Scenarios erro:", err);
    _cache.set(seasonId, []);
  }
}

// ─── Leitura síncrona (do cache) ─────────────────────────────────────────────

export function listModule3Scenarios(seasonId: string): Module3Scenario[] {
  return _cache.get(seasonId) ?? [];
}

export function getModule3Scenario(
  seasonId: string,
  scenarioId: string,
): Module3Scenario | null {
  return listModule3Scenarios(seasonId).find(s => s.id === scenarioId) ?? null;
}

// ─── Escrita: cache + Supabase write-through (fire-and-forget) ────────────────

export function saveModule3Scenario(seasonId: string, scenario: Module3Scenario): void {
  const existing = _cache.get(seasonId) ?? [];
  const idx = existing.findIndex(s => s.id === scenario.id);
  if (idx >= 0) {
    existing[idx] = scenario;
  } else {
    existing.push(scenario);
  }
  _cache.set(seasonId, existing);

  if (!_tenantId) return;
  const yearNum = Number(seasonId.split("-")[0]) || new Date().getFullYear();
  saveDivisionScenario(
    _tenantId, seasonId, yearNum,
    scenario.name, scenario.description ?? null,
    scenario.divisions as Record<string, unknown>,
    { ...scenario.consolidated, referenceSeasonId: scenario.referenceSeasonId } as Record<string, unknown>,
    scenario.createdBy || undefined,
  ).catch(err => console.warn("[module3] saveDivisionScenario erro:", err));
}

export function deleteModule3Scenario(seasonId: string, scenarioId: string): void {
  const existing = _cache.get(seasonId) ?? [];
  _cache.set(seasonId, existing.filter(s => s.id !== scenarioId));

  if (!_tenantId) return;
  deleteDivisionScenario(_tenantId, scenarioId)
    .catch(err => console.warn("[module3] deleteDivisionScenario erro:", err));
}

export function applyModule3Scenario(seasonId: string, scenarioId: string): void {
  const existing = _cache.get(seasonId) ?? [];
  _cache.set(seasonId, existing.map(s => ({ ...s, isActive: s.id === scenarioId })));

  if (!_tenantId) return;
  applyDivisionScenario(_tenantId, seasonId, scenarioId)
    .catch(err => console.warn("[module3] applyDivisionScenario erro:", err));
}

/**
 * @deprecated Dashboard agora verifica is_applied direto no Supabase de forma assíncrona.
 * Mantido para evitar quebrar imports existentes.
 */
export function hasModule3ActiveScenario(): boolean {
  for (const scenarios of _cache.values()) {
    if (scenarios.some(s => s.isActive)) return true;
  }
  return false;
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export function exportModule3Scenarios(seasonId: string, seasonName: string): void {
  const scenarios = listModule3Scenarios(seasonId);
  const data = {
    season: { id: seasonId, name: seasonName },
    scenarios,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `modulo3_${seasonId}_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importModule3Scenarios(
  file: File,
  onSuccess: (scenarios: Module3Scenario[]) => void,
  onError: (error: string) => void,
): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string);
      if (!data.scenarios || !Array.isArray(data.scenarios)) {
        onError("Formato inválido: campo 'scenarios' não encontrado");
        return;
      }
      onSuccess(data.scenarios);
    } catch (err) {
      onError("Erro ao parsear JSON: " + String(err));
    }
  };
  reader.readAsText(file);
}

// ─── Cálculo do consolidado ───────────────────────────────────────────────────
// Função pura — não toca cache nem Supabase.

export function calculateScenarioConsolidated(
  divisions: Record<BusinessDivisionId, DivisionPlanBlock>,
  seasonMacroRevenue?: number,
): {
  totalRevenue: number;
  avgMargin: number;
  avgSellThrough: number;
  avgGmroi: number;
  avgPmv: number;
  avgMkd: number;
  avgGiro: number;
  avgCobertura: number;
  meetsAllTargets: boolean;
  // Absolutos completos por temporada — persistidos para o rollup bottom-up
  // (grão mensal) e a Fase 3. Primazia dos absolutos: taxas derivam destes.
  totalPecas:      number;
  totalLucroBruto: number;
  totalEstMedioRS: number;
  totalMarkdownRS: number;
  totalOrcamento:  number;
} {
  const divisionIds = Object.keys(divisions) as BusinessDivisionId[];
  let meetsAllTargets = true;

  // Cada divisão vira uma CÉLULA de absolutos. A matemática de consolidação vive
  // em consolidateCells (motor único) — inclusive o PMV = Σreceita ÷ Σpeças.
  const cells: MacroCell[] = [];
  let totalSTNum = 0; // sell-through consolidado = ponderado por receita

  for (const divId of divisionIds) {
    const block = divisions[divId];
    if (!block) continue;

    const revDiv = seasonMacroRevenue != null
      ? seasonMacroRevenue * (block.participation / 100)
      : (block.indicators.revenue ?? 0);

    const margin      = block.indicators.margin      ?? 0;
    const sellThrough = block.indicators.sellThrough ?? 0;
    const gmroi       = block.indicators.gmroi       ?? 0;
    const avgPrice    = block.indicators.avgPrice    ?? 0;
    const mkd         = block.indicators.mkd         ?? 0;

    const lucroBrutoDiv = revDiv * (margin / 100);
    const estMedioDiv   = gmroi > 0 ? lucroBrutoDiv / gmroi : 0;
    const markdownDiv   = revDiv * (mkd / 100);
    const pecasDiv      = avgPrice > 0 ? revDiv / avgPrice : 0;
    // Orçamento da divisão: usa o do bloco de volume se houver, senão o CPV
    // (receita − lucro − markdown) como proxy do custo de compra.
    const orcamentoDiv  = block.volumeCoverage?.orcamento
      ?? Math.max(0, revDiv - lucroBrutoDiv - markdownDiv);

    cells.push({
      receita:        revDiv,
      pecas:          pecasDiv,
      lucroBruto:     lucroBrutoDiv,
      estoqueMedioRS: estMedioDiv,
      markdownRS:     markdownDiv,
      orcamento:      orcamentoDiv,
      dimension:      divId,
    });
    totalSTNum += revDiv * sellThrough;

    if (!block.meetsTarget) meetsAllTargets = false;
  }

  const macro = consolidateCells(cells);
  const totalRevenue = macro?.receitaBruta ?? 0;

  return {
    totalRevenue,
    avgMargin:      macro?.margemBruta ?? 0,
    avgSellThrough: totalRevenue > 0 ? totalSTNum / totalRevenue : 0,
    avgGmroi:       macro?.gmroi ?? 0,
    avgPmv:         macro?.pmv ?? 0,          // ✳ corrigido: Σreceita ÷ Σpeças
    avgMkd:         macro?.mkdPct ?? 0,
    avgGiro:        macro?.giro ?? 0,
    avgCobertura:   macro?.cobertura ?? 0,
    meetsAllTargets,
    totalPecas:      macro?.pecasVendidas ?? 0,
    totalLucroBruto: totalRevenue > 0 ? (macro!.margemBruta / 100) * totalRevenue : 0,
    totalEstMedioRS: macro?.estoqueMediao ?? 0,
    totalMarkdownRS: macro?.mkdRS ?? 0,
    totalOrcamento:  macro?.orcamento ?? 0,
  };
}

// ─── Clone ────────────────────────────────────────────────────────────────────

export function cloneModule3Scenario(
  scenario: Module3Scenario,
  newName: string,
): Module3Scenario {
  return {
    ...scenario,
    id: `${scenario.id}_clone_${Date.now()}`,
    name: newName,
    createdAt: new Date().toISOString(),
  };
}

// ─── Comparação ───────────────────────────────────────────────────────────────

export interface ScenarioComparison {
  scenario1: Module3Scenario;
  scenario2: Module3Scenario;
  differences: {
    divisionId: BusinessDivisionId;
    field: string;
    value1: unknown;
    value2: unknown;
  }[];
}

export function compareModule3Scenarios(
  scenario1: Module3Scenario,
  scenario2: Module3Scenario,
): ScenarioComparison {
  const differences: ScenarioComparison["differences"] = [];
  const divisionIds = Object.keys(scenario1.divisions) as BusinessDivisionId[];

  for (const divId of divisionIds) {
    const block1 = scenario1.divisions[divId];
    const block2 = scenario2.divisions[divId];
    if (!block1 || !block2) continue;

    if (block1.participation !== block2.participation) {
      differences.push({ divisionId: divId, field: "participation", value1: block1.participation, value2: block2.participation });
    }

    const i1 = block1.indicators;
    const i2 = block2.indicators;

    if (i1.avgPrice    !== i2.avgPrice)    differences.push({ divisionId: divId, field: "avgPrice",    value1: i1.avgPrice,    value2: i2.avgPrice    });
    if (i1.margin      !== i2.margin)      differences.push({ divisionId: divId, field: "margin",      value1: i1.margin,      value2: i2.margin      });
    if (i1.sellThrough !== i2.sellThrough) differences.push({ divisionId: divId, field: "sellThrough", value1: i1.sellThrough, value2: i2.sellThrough });
  }

  return { scenario1, scenario2, differences };
}
