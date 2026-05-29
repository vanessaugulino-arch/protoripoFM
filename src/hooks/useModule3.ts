/**
 * Hook para gerenciar lógica do Módulo 3 - Planejamento por Divisão
 */

import { useState, useCallback } from "react";
import {
  Module3State,
  DivisionPlanBlock,
  BusinessDivisionId,
  MacroTarget,
  CommercialIndicators,
  RiskMatrix,
  PriceRange,
  VolumeAndCoverage,
  DEFAULT_DIVISIONS,
  DEFAULT_PARTICIPATION,
  calculateSellThrough,
  isValidRiskMatrix,
  isValidPriceRange,
} from "../types/module3";
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

export function useModule3(options: UseModule3Options) {
  const [state, setState] = useState<Module3State>(() => ({
    selectedSeasonId: options.seasonId,
    referenceSeasonId: options.referenceSeasonId,
    divisions: initializeDivisions(),
    scenarios: listModule3Scenarios(options.seasonId),
    activeScenarioId: undefined,
    consolidated: {} as any,
    isLoading: false,
    error: undefined,
  }));

  // ─── Inicialização de Divisões ──────────────────────────────────────────
  function initializeDivisions(): Record<BusinessDivisionId, DivisionPlanBlock> {
    const divisions: Record<BusinessDivisionId, DivisionPlanBlock> = {} as any;
    
    (["feminino", "masculino", "acessorios", "infantil"] as BusinessDivisionId[]).forEach(
      (divId) => {
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
            basics: 40,
            fashion: 40,
            highFashion: 20,
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
      }
    );
    
    return divisions;
  }

  // ─── Atualizar Participação de Divisão ──────────────────────────────────
  const updateDivisionParticipation = useCallback(
    (divisionId: BusinessDivisionId, participation: number) => {
      setState((prev) => {
        const updated = { ...prev };
        updated.divisions[divisionId].participation = participation;
        
        // Recalcular consolidado
        updated.consolidated = calculateConsolidated(updated.divisions);
        
        return updated;
      });
    },
    []
  );

  // ─── Atualizar Indicadores Comerciais ───────────────────────────────────
  const updateIndicators = useCallback(
    (divisionId: BusinessDivisionId, indicators: Partial<CommercialIndicators>) => {
      setState((prev) => {
        const updated = { ...prev };
        updated.divisions[divisionId].indicators = {
          ...updated.divisions[divisionId].indicators,
          ...indicators,
        };
        
        // Recalcular consolidado
        updated.consolidated = calculateConsolidated(updated.divisions);
        
        return updated;
      });
    },
    []
  );

  // ─── Atualizar Faixa de Preço ──────────────────────────────────────────
  const updatePriceRange = useCallback(
    (divisionId: BusinessDivisionId, priceRange: Partial<PriceRange>) => {
      setState((prev) => {
        const updated = { ...prev };
        const newRange = {
          ...updated.divisions[divisionId].priceRange,
          ...priceRange,
        };
        
        if (!isValidPriceRange(newRange as PriceRange)) {
          console.warn("Faixa de preço inválida: não soma 100%");
          return prev;
        }
        
        updated.divisions[divisionId].priceRange = newRange as PriceRange;
        updated.consolidated = calculateConsolidated(updated.divisions);
        
        return updated;
      });
    },
    []
  );

  // ─── Atualizar Matriz de Risco ─────────────────────────────────────────
  const updateRiskMatrix = useCallback(
    (divisionId: BusinessDivisionId, riskMatrix: Partial<RiskMatrix>) => {
      setState((prev) => {
        const updated = { ...prev };
        const newMatrix = {
          ...updated.divisions[divisionId].riskMatrix,
          ...riskMatrix,
        };
        
        if (!isValidRiskMatrix(newMatrix as RiskMatrix)) {
          console.warn("Matriz de risco inválida: não soma 100%");
          return prev;
        }
        
        updated.divisions[divisionId].riskMatrix = newMatrix as RiskMatrix;
        updated.consolidated = calculateConsolidated(updated.divisions);
        
        return updated;
      });
    },
    []
  );

  // ─── Atualizar Volume/OTB e Cobertura ───────────────────────────────────
  const updateVolumeCoverage = useCallback(
    (divisionId: BusinessDivisionId, volumeCoverage: Partial<VolumeAndCoverage>) => {
      setState((prev) => {
        const updated = { ...prev };
        const newVolume = {
          ...updated.divisions[divisionId].volumeCoverage,
          ...volumeCoverage,
        };
        
        updated.divisions[divisionId].volumeCoverage = newVolume as VolumeAndCoverage;
        updated.consolidated = calculateConsolidated(updated.divisions);
        
        return updated;
      });
    },
    []
  );

  // ─── Calcular Sell-Through para uma Divisão ────────────────────────────
  const calculateDivisionSellThrough = useCallback(
    (divisionId: BusinessDivisionId) => {
      const block = state.divisions[divisionId];
      if (!block) return 0;
      
      const { volumeCoverage } = block;
      const sellThrough = calculateSellThrough({
        unitsSold: volumeCoverage.unitsExpectedSold,
        initialStock: volumeCoverage.initialStock,
        replenishments: volumeCoverage.replenishments,
      });
      
      return sellThrough;
    },
    [state.divisions]
  );

  // ─── Calcular Consolidado da Temporada ──────────────────────────────────
  function calculateConsolidated(divisions: Record<BusinessDivisionId, DivisionPlanBlock>) {
    const consolidated = calculateScenarioConsolidated(divisions);
    
    // Validar contra metas macro
    const reachesMacroTarget =
      consolidated.totalRevenue >= options.macroTargets.revenue * 0.95 && // 5% de tolerância
      consolidated.avgMargin >= options.macroTargets.margin * 0.95 &&
      consolidated.avgSellThrough >= options.macroTargets.sellThrough * 0.95;

    return {
      seasonId: state.selectedSeasonId,
      seasonName: "",
      referenceSeasonId: state.referenceSeasonId,
      totalRevenue: consolidated.totalRevenue,
      avgPrice: 195, // Será recalculado
      avgMargin: consolidated.avgMargin,
      avgSellThrough: consolidated.avgSellThrough,
      avgGmroi: consolidated.avgGmroi,
      macroTarget: options.macroTargets,
      reachesMacroTarget,
      gaps: {
        revenue: consolidated.totalRevenue - options.macroTargets.revenue,
        margin: consolidated.avgMargin - options.macroTargets.margin,
        sellThrough: consolidated.avgSellThrough - options.macroTargets.sellThrough,
      },
      divisionBreakdown: {} as any,
      scenarios: listModule3Scenarios(state.selectedSeasonId),
    };
  }

  // ─── Salvar Cenário ────────────────────────────────────────────────────
  const saveScenario = useCallback(
    (name: string, description?: string) => {
      const scenario = {
        id: `scenario_${Date.now()}`,
        name,
        description,
        seasonId: state.selectedSeasonId,
        referenceSeasonId: state.referenceSeasonId,
        createdAt: new Date().toISOString(),
        createdBy: "current_user", // Será substituído pelo contexto
        divisions: state.divisions,
        consolidated: state.consolidated,
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

  // ─── Validar se atinge meta macro ──────────────────────────────────────
  const validateAgainstMacro = useCallback(() => {
    return state.consolidated.reachesMacroTarget;
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
    validateAgainstMacro,
  };
}
