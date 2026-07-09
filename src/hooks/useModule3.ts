/**
 * Hook para gerenciar lógica do Módulo 3 - Planejamento por Divisão
 */

import { useState, useCallback, useEffect } from "react";
import {
  Module3State,
  DivisionPlanBlock,
  BusinessDivisionId,
  MacroTarget,
  CommercialIndicators,
  RiskMatrix,
  PriceRange,
  VolumeAndCoverage,
  SeasonConsolidated,
  DEFAULT_PARTICIPATION,
  calculateSellThrough,
} from "../app/types/module3";
import {
  saveModule3Scenario,
  listModule3Scenarios,
  calculateScenarioConsolidated,
} from "../services/module3ScenarioService";

export interface UseModule3Options {
  seasonId: string;
  referenceSeasonId: string;
  macroTargets: MacroTarget;
}

function buildInitialConsolidated(macroTargets: MacroTarget): SeasonConsolidated {
  return {
    seasonId: macroTargets.seasonId,
    seasonName: "",
    referenceSeasonId: undefined,
    totalRevenue: 0,
    avgPrice: 0,
    avgMargin: 0,
    avgSellThrough: 0,
    avgGmroi: 0,
    macroTarget: macroTargets,
    reachesMacroTarget: false,
    gaps: { revenue: -macroTargets.revenue, margin: -macroTargets.margin, sellThrough: -macroTargets.sellThrough },
    divisionBreakdown: {} as SeasonConsolidated["divisionBreakdown"],
    scenarios: [],
  };
}

function initializeDivisions(): Record<BusinessDivisionId, DivisionPlanBlock> {
  const divisions: Record<BusinessDivisionId, DivisionPlanBlock> = {} as Record<BusinessDivisionId, DivisionPlanBlock>;

  (["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).forEach((divId) => {
    divisions[divId] = {
      divisionId: divId,
      participation: DEFAULT_PARTICIPATION[divId],
      indicators: {
        avgPrice: 195,
        mkd: 15,
        margin: 48,
        sellThrough: 75,
      },
      priceRange: {
        entry: "119-169",
        middle: "179-259",
        premium: "269-389",
        entryPercent: 30,
        middlePercent: 50,
        premiumPercent: 20,
      },
      riskMatrix: {
        sustentadorMargem: 40,
        motorGiro: 40,
        iconeMarca: 20,
      },
      volumeCoverage: {
        coverage: 45,
        initialStock: 1000,
        replenishments: 500,
        unitsExpectedSold: 1200,
      },
      meetsTarget: true,
      status: "draft",
    };
  });

  return divisions;
}

export function useModule3(options: UseModule3Options) {
  const [state, setState] = useState<Module3State>(() => ({
    selectedSeasonId: options.seasonId,
    referenceSeasonId: options.referenceSeasonId,
    divisions: initializeDivisions(),
    scenarios: options.seasonId ? listModule3Scenarios(options.seasonId) : [],
    activeScenarioId: undefined,
    consolidated: buildInitialConsolidated(options.macroTargets),
    isLoading: false,
    error: undefined,
  }));

  // Re-inicializar quando a temporada muda
  useEffect(() => {
    if (!options.seasonId) return;
    setState((prev) => ({
      ...prev,
      selectedSeasonId: options.seasonId,
      referenceSeasonId: options.referenceSeasonId,
      divisions: initializeDivisions(),
      scenarios: listModule3Scenarios(options.seasonId),
      activeScenarioId: undefined,
      consolidated: buildInitialConsolidated(options.macroTargets),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.seasonId]);

  // Atualizar macroTargets no consolidado quando mudam
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      consolidated: recalcConsolidated(prev.divisions, options.macroTargets, options.seasonId, options.referenceSeasonId),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.macroTargets.revenue, options.macroTargets.margin, options.macroTargets.gmroi]);

  // ─── Recalcular Consolidado ────────────────────────────────────────────────
  function recalcConsolidated(
    divisions: Record<BusinessDivisionId, DivisionPlanBlock>,
    macroTargets: MacroTarget,
    seasonId: string,
    refSeasonId: string
  ): SeasonConsolidated {
    const raw = calculateScenarioConsolidated(divisions);

    const reachesMacroTarget =
      (macroTargets.revenue === 0 || raw.totalRevenue >= macroTargets.revenue * 0.95) &&
      raw.avgMargin >= macroTargets.margin * 0.95 &&
      raw.avgSellThrough >= macroTargets.sellThrough * 0.95;

    return {
      seasonId,
      seasonName: "",
      referenceSeasonId: refSeasonId,
      totalRevenue: raw.totalRevenue,
      avgPrice: 0,
      avgMargin: raw.avgMargin,
      avgSellThrough: raw.avgSellThrough,
      avgGmroi: raw.avgGmroi,
      macroTarget: macroTargets,
      reachesMacroTarget,
      gaps: {
        revenue: raw.totalRevenue - macroTargets.revenue,
        margin: raw.avgMargin - macroTargets.margin,
        sellThrough: raw.avgSellThrough - macroTargets.sellThrough,
      },
      divisionBreakdown: {} as SeasonConsolidated["divisionBreakdown"],
      scenarios: listModule3Scenarios(seasonId),
    };
  }

  // ─── Atualizar Participação de Divisão ────────────────────────────────────
  const updateDivisionParticipation = useCallback(
    (divisionId: BusinessDivisionId, participation: number) => {
      setState((prev) => {
        const divisions = {
          ...prev.divisions,
          [divisionId]: { ...prev.divisions[divisionId], participation },
        };
        return {
          ...prev,
          divisions,
          consolidated: recalcConsolidated(divisions, options.macroTargets, prev.selectedSeasonId, prev.referenceSeasonId),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.macroTargets]
  );

  // ─── Atualizar Indicadores Comerciais ─────────────────────────────────────
  const updateIndicators = useCallback(
    (divisionId: BusinessDivisionId, indicators: Partial<CommercialIndicators>) => {
      setState((prev) => {
        const divisions = {
          ...prev.divisions,
          [divisionId]: {
            ...prev.divisions[divisionId],
            indicators: { ...prev.divisions[divisionId].indicators, ...indicators },
          },
        };
        return {
          ...prev,
          divisions,
          consolidated: recalcConsolidated(divisions, options.macroTargets, prev.selectedSeasonId, prev.referenceSeasonId),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.macroTargets]
  );

  // ─── Atualizar Faixa de Preço (sem bloquear valores intermediários) ───────
  const updatePriceRange = useCallback(
    (divisionId: BusinessDivisionId, priceRange: Partial<PriceRange>) => {
      setState((prev) => {
        const newRange = { ...prev.divisions[divisionId].priceRange, ...priceRange };
        const divisions = {
          ...prev.divisions,
          [divisionId]: { ...prev.divisions[divisionId], priceRange: newRange },
        };
        return {
          ...prev,
          divisions,
          consolidated: recalcConsolidated(divisions, options.macroTargets, prev.selectedSeasonId, prev.referenceSeasonId),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.macroTargets]
  );

  // ─── Atualizar Matriz de Risco (sem bloquear valores intermediários) ──────
  const updateRiskMatrix = useCallback(
    (divisionId: BusinessDivisionId, riskMatrix: Partial<RiskMatrix>) => {
      setState((prev) => {
        const newMatrix = { ...prev.divisions[divisionId].riskMatrix, ...riskMatrix };
        const divisions = {
          ...prev.divisions,
          [divisionId]: { ...prev.divisions[divisionId], riskMatrix: newMatrix },
        };
        return {
          ...prev,
          divisions,
          consolidated: recalcConsolidated(divisions, options.macroTargets, prev.selectedSeasonId, prev.referenceSeasonId),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.macroTargets]
  );

  // ─── Atualizar Volume/Orçamento e Cobertura ─────────────────────────────────
  const updateVolumeCoverage = useCallback(
    (divisionId: BusinessDivisionId, volumeCoverage: Partial<VolumeAndCoverage>) => {
      setState((prev) => {
        const newVol = { ...prev.divisions[divisionId].volumeCoverage, ...volumeCoverage };
        const divisions = {
          ...prev.divisions,
          [divisionId]: { ...prev.divisions[divisionId], volumeCoverage: newVol },
        };
        return {
          ...prev,
          divisions,
          consolidated: recalcConsolidated(divisions, options.macroTargets, prev.selectedSeasonId, prev.referenceSeasonId),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.macroTargets]
  );

  // ─── Calcular Sell-Through para uma Divisão ───────────────────────────────
  const calculateDivisionSellThrough = useCallback(
    (divisionId: BusinessDivisionId) => {
      const block = state.divisions[divisionId];
      if (!block) return 0;
      const { volumeCoverage } = block;
      return calculateSellThrough({
        unitsSold: volumeCoverage.unitsExpectedSold,
        initialStock: volumeCoverage.initialStock,
        replenishments: volumeCoverage.replenishments,
      });
    },
    [state.divisions]
  );

  // ─── Salvar Cenário ───────────────────────────────────────────────────────
  const saveScenario = useCallback(
    (name: string, description?: string) => {
      const scenario = {
        id: `scenario_${Date.now()}`,
        name,
        description,
        seasonId: state.selectedSeasonId,
        referenceSeasonId: state.referenceSeasonId,
        createdAt: new Date().toISOString(),
        createdBy: "current_user",
        divisions: state.divisions,
        consolidated: {
          totalRevenue: state.consolidated.totalRevenue,
          avgMargin: state.consolidated.avgMargin,
          avgSellThrough: state.consolidated.avgSellThrough,
          avgGmroi: state.consolidated.avgGmroi,
          meetsAllTargets: state.consolidated.reachesMacroTarget,
        },
        isActive: false,
      };

      saveModule3Scenario(state.selectedSeasonId, scenario);

      setState((prev) => ({
        ...prev,
        scenarios: [...prev.scenarios, scenario],
      }));
    },
    [state.selectedSeasonId, state.referenceSeasonId, state.divisions, state.consolidated]
  );

  // ─── Recarregar cenários do storage ──────────────────────────────────────
  const reloadScenarios = useCallback(() => {
    setState((prev) => ({
      ...prev,
      scenarios: listModule3Scenarios(prev.selectedSeasonId),
    }));
  }, []);

  // ─── Validar se atinge meta macro ────────────────────────────────────────
  const validateAgainstMacro = useCallback(() => {
    return state.consolidated.reachesMacroTarget ?? false;
  }, [state.consolidated]);

  return {
    state,
    updateDivisionParticipation,
    updateIndicators,
    updatePriceRange,
    updateRiskMatrix,
    updateVolumeCoverage,
    calculateDivisionSellThrough,
    saveScenario,
    reloadScenarios,
    validateAgainstMacro,
  };
}
