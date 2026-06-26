/**
 * Serviço de Cenários para Módulo 3
 * Gerencia salvamento, carregamento e export de cenários por temporada
 */

import { Module3Scenario, BusinessDivisionId, DivisionPlanBlock } from "../app/types/module3";

const STORAGE_KEY_PREFIX = "fashionmind_m3_scenarios_";

/**
 * Salva um cenário para uma temporada específica
 */
export function saveModule3Scenario(seasonId: string, scenario: Module3Scenario): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${seasonId}`;
    const existing = localStorage.getItem(key);
    const scenarios: Module3Scenario[] = existing ? JSON.parse(existing) : [];
    
    const index = scenarios.findIndex(s => s.id === scenario.id);
    if (index >= 0) {
      scenarios[index] = scenario;
    } else {
      scenarios.push(scenario);
    }
    
    localStorage.setItem(key, JSON.stringify(scenarios));
  } catch (error) {
    console.error("Erro ao salvar cenário do Módulo 3:", error);
  }
}

/**
 * Lista todos os cenários de uma temporada
 */
export function listModule3Scenarios(seasonId: string): Module3Scenario[] {
  try {
    const key = `${STORAGE_KEY_PREFIX}${seasonId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Erro ao carregar cenários do Módulo 3:", error);
    return [];
  }
}

/**
 * Carrega um cenário específico
 */
export function getModule3Scenario(seasonId: string, scenarioId: string): Module3Scenario | null {
  try {
    const scenarios = listModule3Scenarios(seasonId);
    return scenarios.find(s => s.id === scenarioId) || null;
  } catch (error) {
    console.error("Erro ao carregar cenário do Módulo 3:", error);
    return null;
  }
}

/**
 * Deleta um cenário
 */
export function deleteModule3Scenario(seasonId: string, scenarioId: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${seasonId}`;
    const scenarios = listModule3Scenarios(seasonId);
    const filtered = scenarios.filter(s => s.id !== scenarioId);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (error) {
    console.error("Erro ao deletar cenário do Módulo 3:", error);
  }
}

/**
 * Exporta cenários como JSON (download)
 */
export function exportModule3Scenarios(seasonId: string, seasonName: string): void {
  try {
    const scenarios = listModule3Scenarios(seasonId);
    const data = {
      season: {
        id: seasonId,
        name: seasonName,
      },
      scenarios,
      exportedAt: new Date().toISOString(),
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modulo3_${seasonId}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Erro ao exportar cenários do Módulo 3:", error);
  }
}

/**
 * Importa cenários de um arquivo JSON
 */
export function importModule3Scenarios(
  file: File,
  onSuccess: (scenarios: Module3Scenario[]) => void,
  onError: (error: string) => void
): void {
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.scenarios || !Array.isArray(data.scenarios)) {
          onError("Formato inválido: campo 'scenarios' não encontrado");
          return;
        }
        
        onSuccess(data.scenarios);
      } catch (parseError) {
        onError("Erro ao parsear JSON: " + String(parseError));
      }
    };
    reader.readAsText(file);
  } catch (error) {
    onError("Erro ao ler arquivo: " + String(error));
  }
}

/**
 * Calcula consolidado de um cenário
 */
export function calculateScenarioConsolidated(
  divisions: Record<BusinessDivisionId, DivisionPlanBlock>
): {
  totalRevenue: number;
  avgMargin: number;
  avgSellThrough: number;
  avgGmroi: number;
  meetsAllTargets: boolean;
} {
  const divisionIds = Object.keys(divisions) as BusinessDivisionId[];
  
  let totalRevenue = 0;
  let totalMargin = 0;
  let totalSellThrough = 0;
  let totalGmroi = 0;
  let meetsAllTargets = true;
  
  for (const divId of divisionIds) {
    const block = divisions[divId];
    if (!block) continue;
    
    totalRevenue += block.indicators.revenue || 0;
    totalMargin += block.indicators.margin * (block.participation / 100);
    totalSellThrough += block.indicators.sellThrough * (block.participation / 100);
    totalGmroi += (block.indicators.gmroi || 0) * (block.participation / 100);
    
    if (!block.meetsTarget) {
      meetsAllTargets = false;
    }
  }
  
  return {
    totalRevenue,
    avgMargin: totalMargin,
    avgSellThrough: totalSellThrough,
    avgGmroi: totalGmroi,
    meetsAllTargets,
  };
}

/**
 * Clona um cenário (cria cópia com novo ID e timestamp)
 */
export function cloneModule3Scenario(
  scenario: Module3Scenario,
  newName: string
): Module3Scenario {
  return {
    ...scenario,
    id: `${scenario.id}_clone_${Date.now()}`,
    name: newName,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Retorna true se houver ao menos um cenário ativo (aplicado) em qualquer temporada do Módulo 3.
 * Usado pelo Dashboard para liberar o Plano de Sortimento (Módulo 5).
 */
export function hasModule3ActiveScenario(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const scenarios: Module3Scenario[] = JSON.parse(raw);
      if (scenarios.some(s => s.isActive)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Aplica um cenário (marca como ativo)
 */
export function applyModule3Scenario(seasonId: string, scenarioId: string): void {
  try {
    const scenarios = listModule3Scenarios(seasonId);
    scenarios.forEach(s => {
      s.isActive = s.id === scenarioId;
    });
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${seasonId}`, JSON.stringify(scenarios));
  } catch (error) {
    console.error("Erro ao aplicar cenário do Módulo 3:", error);
  }
}

/**
 * Compara dois cenários lado a lado
 */
export interface ScenarioComparison {
  scenario1: Module3Scenario;
  scenario2: Module3Scenario;
  differences: {
    divisionId: BusinessDivisionId;
    field: string;
    value1: any;
    value2: any;
  }[];
}

export function compareModule3Scenarios(
  scenario1: Module3Scenario,
  scenario2: Module3Scenario
): ScenarioComparison {
  const differences: ScenarioComparison["differences"] = [];
  const divisionIds = Object.keys(scenario1.divisions) as BusinessDivisionId[];
  
  for (const divId of divisionIds) {
    const block1 = scenario1.divisions[divId];
    const block2 = scenario2.divisions[divId];
    
    if (!block1 || !block2) continue;
    
    // Comparar participation
    if (block1.participation !== block2.participation) {
      differences.push({
        divisionId: divId,
        field: "participation",
        value1: block1.participation,
        value2: block2.participation,
      });
    }
    
    // Comparar indicadores
    const indicators1 = block1.indicators;
    const indicators2 = block2.indicators;
    
    if (indicators1.avgPrice !== indicators2.avgPrice) {
      differences.push({
        divisionId: divId,
        field: "avgPrice",
        value1: indicators1.avgPrice,
        value2: indicators2.avgPrice,
      });
    }
    
    if (indicators1.margin !== indicators2.margin) {
      differences.push({
        divisionId: divId,
        field: "margin",
        value1: indicators1.margin,
        value2: indicators2.margin,
      });
    }
    
    if (indicators1.sellThrough !== indicators2.sellThrough) {
      differences.push({
        divisionId: divId,
        field: "sellThrough",
        value1: indicators1.sellThrough,
        value2: indicators2.sellThrough,
      });
    }
  }
  
  return { scenario1, scenario2, differences };
}
