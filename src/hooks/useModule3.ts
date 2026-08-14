/**
 * Hook para gerenciar lógica do Módulo 3 - Planejamento por Divisão
 */

import { useState, useCallback, useEffect, useRef } from "react";
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
  calculateSellThrough,
} from "../app/types/module3";
import {
  saveModule3Scenario,
  listModule3Scenarios,
  calculateScenarioConsolidated,
} from "../services/module3ScenarioService";
import { applyDivisionEdit, type DivisionIndicators } from "../engine/divisionEngineAdapter";

export interface UseModule3Options {
  seasonId: string;
  referenceSeasonId: string;
  macroTargets: MacroTarget;
  // Divisões reais do tenant (vindas de fetchTenantDivisions) — nunca uma lista fixa.
  divisionIds: string[];
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

/**
 * Inicializa os blocos de divisão usando as taxas do M1 (macro targets).
 * Todos os blocos iniciam com a mesma taxa macro → o consolidado inicial
 * produz EXATAMENTE os valores do M1.
 * O usuário depois ajusta por divisão; desvios disparam o fluxo de aprovação.
 */
function initializeDivisions(divisionIds: string[], macroTargets?: MacroTarget): Record<BusinessDivisionId, DivisionPlanBlock> {
  const divisions: Record<BusinessDivisionId, DivisionPlanBlock> = {} as Record<BusinessDivisionId, DivisionPlanBlock>;
  // Bootstrap com divisão igualitária — o efeito de proporções históricas reais
  // (Module3DivisionPlanning, via getHistoricalProfiles) corrige isso logo em
  // seguida quando não há cenário salvo ainda.
  const equalShare = divisionIds.length > 0 ? 100 / divisionIds.length : 0;

  divisionIds.forEach((divId) => {
    divisions[divId] = {
      divisionId: divId,
      participation: equalShare,
      indicators: {
        // Lê do M1; fallback para valores de referência quando M1 não tem o indicador
        avgPrice:    195,
        mkd:         15,
        margin:      macroTargets?.margin      ?? 48,
        sellThrough: macroTargets?.sellThrough ?? 75,
        gmroi:       macroTargets?.gmroi       ?? 2.35,
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
  // Rastreia contexto anterior para detecção de delta: temporada + taxas do M1.
  // Quando a temporada muda → re-inicializa divisões (sem delta).
  // Quando as taxas do M1 mudam dentro da mesma temporada → aplica delta proporcional.
  const prevMacroCtxRef = useRef<{
    seasonId: string;
    margin: number;
    gmroi: number;
    sellThrough: number;
  } | null>(null);

  const [state, setState] = useState<Module3State>(() => ({
    selectedSeasonId: options.seasonId,
    referenceSeasonId: options.referenceSeasonId,
    divisions: initializeDivisions(options.divisionIds, options.macroTargets),
    scenarios: options.seasonId ? listModule3Scenarios(options.seasonId) : [],
    activeScenarioId: undefined,
    consolidated: buildInitialConsolidated(options.macroTargets),
    isLoading: false,
    error: undefined,
  }));

  // Rastreia PMV tocado manualmente por divisão, nesta sessão de edição.
  // Regra: markdown só absorve automaticamente a diferença de margem quando o
  // usuário NÃO mexeu em preço — se já mexeu, ele escolheu outro caminho pra
  // chegar na margem (subir preço), e o sistema não sobrepõe empurrando o MKD.
  const [touchedPrice, setTouchedPrice] = useState<Record<string, true>>({});

  // Re-inicializar quando a temporada muda OU quando as divisões reais do tenant
  // chegam (elas são buscadas assincronamente — no primeiro render costumam
  // estar vazias).
  const divisionIdsKey = options.divisionIds.join(",");
  useEffect(() => {
    if (!options.seasonId || options.divisionIds.length === 0) return;
    setState((prev) => ({
      ...prev,
      selectedSeasonId: options.seasonId,
      referenceSeasonId: options.referenceSeasonId,
      divisions: initializeDivisions(options.divisionIds, options.macroTargets),
      scenarios: listModule3Scenarios(options.seasonId),
      activeScenarioId: undefined,
      consolidated: buildInitialConsolidated(options.macroTargets),
    }));
    setTouchedPrice({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.seasonId, divisionIdsKey]);

  // Propagação delta: quando as taxas do M1 mudam dentro da mesma temporada,
  // cada divisão tem sua taxa multiplicada pelo mesmo fator k.
  // Prova: consolidated_rate = Σ(revDiv × rate_div) / ΣrevDiv
  //        → após ×k em todos: = k × old_consolidated = exatamente o novo alvo do M1.
  useEffect(() => {
    const prev = prevMacroCtxRef.current;
    const curr = {
      seasonId:    options.seasonId,
      margin:      options.macroTargets.margin,
      gmroi:       options.macroTargets.gmroi,
      sellThrough: options.macroTargets.sellThrough,
    };
    prevMacroCtxRef.current = curr;

    if (!prev || prev.seasonId !== curr.seasonId) {
      // Temporada mudou (ou primeira carga) — re-init já feito pelo efeito de temporada;
      // só atualiza o consolidado.
      setState(prevState => ({
        ...prevState,
        consolidated: recalcConsolidated(prevState.divisions, options.macroTargets, options.seasonId, options.referenceSeasonId),
      }));
      return;
    }

    // Mesma temporada — detecta quais taxas mudaram no M1
    const deltas: Partial<Record<"margin" | "gmroi" | "sellThrough", number>> = {};
    if (prev.margin      > 0 && curr.margin      > 0 && Math.abs(curr.margin      / prev.margin      - 1) > 0.001) deltas.margin      = curr.margin      / prev.margin;
    if (prev.gmroi       > 0 && curr.gmroi       > 0 && Math.abs(curr.gmroi       / prev.gmroi       - 1) > 0.001) deltas.gmroi       = curr.gmroi       / prev.gmroi;
    if (prev.sellThrough > 0 && curr.sellThrough > 0 && Math.abs(curr.sellThrough / prev.sellThrough - 1) > 0.001) deltas.sellThrough = curr.sellThrough / prev.sellThrough;

    setState(prevState => {
      if (Object.keys(deltas).length === 0) {
        // Apenas receita mudou — recalcula consolidado sem alterar divisões
        return {
          ...prevState,
          consolidated: recalcConsolidated(prevState.divisions, options.macroTargets, options.seasonId, options.referenceSeasonId),
        };
      }

      // Aplica delta proporcional a cada divisão — o consolidado emergirá = alvo M1 exato
      const newDivisions: Record<BusinessDivisionId, DivisionPlanBlock> =
        {} as Record<BusinessDivisionId, DivisionPlanBlock>;

      for (const divId of Object.keys(prevState.divisions) as BusinessDivisionId[]) {
        const block = prevState.divisions[divId];
        newDivisions[divId] = {
          ...block,
          indicators: {
            ...block.indicators,
            margin:      deltas.margin      ? block.indicators.margin                 * deltas.margin      : block.indicators.margin,
            gmroi:       deltas.gmroi       ? (block.indicators.gmroi       ?? 0)     * deltas.gmroi       : block.indicators.gmroi,
            sellThrough: deltas.sellThrough ? block.indicators.sellThrough            * deltas.sellThrough : block.indicators.sellThrough,
          },
        };
      }

      return {
        ...prevState,
        divisions:   newDivisions,
        consolidated: recalcConsolidated(newDivisions, options.macroTargets, options.seasonId, options.referenceSeasonId),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.macroTargets.revenue, options.macroTargets.margin, options.macroTargets.gmroi, options.macroTargets.sellThrough, options.seasonId]);

  // ─── Recalcular Consolidado ────────────────────────────────────────────────
  function recalcConsolidated(
    divisions: Record<BusinessDivisionId, DivisionPlanBlock>,
    macroTargets: MacroTarget,
    seasonId: string,
    refSeasonId: string
  ): SeasonConsolidated {
    // Passa a receita macro da temporada para que o cálculo derive receita por divisão
    // de forma exata (receita_div = revenue × participation/100 → Σ = revenue exato).
    const raw = calculateScenarioConsolidated(divisions, macroTargets.revenue > 0 ? macroTargets.revenue : undefined);

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
      avgPmv: raw.avgPmv,
      avgMkd: raw.avgMkd,
      avgGiro: raw.avgGiro,
      avgCobertura: raw.avgCobertura,
      macroTarget: macroTargets,
      reachesMacroTarget,
      gaps: {
        revenue: raw.totalRevenue - macroTargets.revenue,
        margin: raw.avgMargin - macroTargets.margin,
        sellThrough: raw.avgSellThrough - macroTargets.sellThrough,
      },
      divisionBreakdown: {} as SeasonConsolidated["divisionBreakdown"],
      // Absolutos completos para o rollup bottom-up (grão mensal)
      totalPecas:      raw.totalPecas,
      totalLucroBruto: raw.totalLucroBruto,
      totalEstMedioRS: raw.totalEstMedioRS,
      totalMarkdownRS: raw.totalMarkdownRS,
      totalOrcamento:  raw.totalOrcamento,
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
      if (indicators.avgPrice !== undefined) {
        setTouchedPrice(prev => ({ ...prev, [divisionId]: true }));
      }
      setState((prev) => {
        const block = prev.divisions[divisionId];
        // Receita da divisão (para o motor): receita_macro × participação, ou a
        // receita já gravada no indicador quando não há meta macro.
        const macroRev = options.macroTargets.revenue;
        const revenue  = macroRev > 0
          ? macroRev * (block.participation / 100)
          : (block.indicators.revenue ?? 0);

        // Cada campo editado passa pelo motor de clusters (T1/T3 e ponte GMROI).
        // O que não tem correspondente no motor (sell-through) é gravado direto.
        let nextInd: DivisionIndicators = {
          avgPrice:    block.indicators.avgPrice,
          margin:      block.indicators.margin,
          mkd:         block.indicators.mkd,
          gmroi:       block.indicators.gmroi ?? 0,
          sellThrough: block.indicators.sellThrough,
          revenue:     block.indicators.revenue,
        };
        for (const [field, value] of Object.entries(indicators)) {
          if (typeof value !== "number") { nextInd = { ...nextInd, [field]: value as never }; continue; }
          nextInd = applyDivisionEdit(nextInd, revenue, field as keyof DivisionIndicators, value);
        }

        const divisions = {
          ...prev.divisions,
          [divisionId]: {
            ...block,
            indicators: { ...block.indicators, ...nextInd },
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
    touchedPrice,
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
