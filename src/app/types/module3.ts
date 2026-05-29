/**
 * Tipos e Interfaces para Módulo 3 - Planejamento por Divisão de Negócio (Temporada)
 * 
 * O Módulo 3 permite planejamento por divisão garantindo que o consolidado
 * atinja as metas macro da organização.
 */

// ─── Divisões de Negócio ──────────────────────────────────────────────────────
export type BusinessDivisionId = "feminino" | "masculino" | "acessorios" | "infantil";

export interface BusinessDivision {
  id: BusinessDivisionId;
  name: string;                    // "Feminino Adulto", "Masculino Adulto", etc
  participation: number;            // % de participação (0-100)
  avgPrice?: number;                // Preço médio de venda atualizado
  sellThrough?: number;             // % de venda (0-100)
}

// ─── Indicadores Comerciais por Divisão ─────────────────────────────────────
export interface CommercialIndicators {
  avgPrice: number;                 // Preço Médio de Venda (PMV)
  mkd: number;                      // MKD % (markdown)
  margin: number;                   // Margem % bruta
  sellThrough: number;              // Sell-Through %
  
  // Campos calculados
  revenue?: number;                 // Receita em R$
  gmroi?: number;                   // Gross Margin ROI
}

// ─── Faixa de Preço ──────────────────────────────────────────────────────────
export interface PriceRange {
  entry: string;                    // Ex: "119-169"
  middle: string;                   // Ex: "179-259"
  premium: string;                  // Ex: "269-389"
  entryPercent: number;             // % de peças na faixa entry
  middlePercent: number;            // % de peças na faixa middle
  premiumPercent: number;           // % de peças na faixa premium
}

// ─── Matriz de Risco ─────────────────────────────────────────────────────────
export interface RiskMatrix {
  basics: number;                   // % de produtos básicos/recorrentes
  fashion: number;                  // % de produtos moda
  highFashion: number;              // % de produtos alta moda
  
  // Validação: basics + fashion + highFashion = 100
}

// ─── Volume, OTB e Cobertura ─────────────────────────────────────────────────
export interface VolumeAndCoverage {
  // Para produtor
  productionVolume?: number;        // Quantidade de peças a produzir
  
  // Para revenda
  otbBudget?: number;               // Orçamento de compra em R$
  
  // Comum
  coverage: number;                 // Dias de cobertura de estoque
  initialStock: number;             // Estoque inicial em peças
  replenishments: number;           // Total de reposições no período
  unitsExpectedSold: number;        // Peças esperadas a vender (base para sell-through)
}

// ─── Bloco de Planejamento por Divisão ──────────────────────────────────────
export interface DivisionPlanBlock {
  divisionId: BusinessDivisionId;
  participation: number;            // % de participação na temporada
  
  // Bloco 1: Indicadores Comerciais
  indicators: CommercialIndicators;
  
  // Bloco 2: Faixa de Preço
  priceRange: PriceRange;
  
  // Bloco 3: Matriz de Risco
  riskMatrix: RiskMatrix;
  
  // Bloco 4: Volume/OTB + Cobertura
  volumeCoverage: VolumeAndCoverage;
  
  // Status de validação
  meetsTarget: boolean;             // Se indicadores atingem meta macro
  status: "draft" | "reviewed" | "approved";
}

// ─── Cenário (Versionamento) ────────────────────────────────────────────────
export interface Module3Scenario {
  id: string;
  name: string;                     // Ex: "Cenário Conservador"
  description?: string;
  seasonId: string;                 // Vinculado a qual temporada
  referenceSeasonId: string;        // Temporada de referência
  
  // Data e quem criou
  createdAt: string;
  createdBy: string;                // User profile
  
  // Dados do planejamento
  divisions: Record<BusinessDivisionId, DivisionPlanBlock>;
  
  // Consolidado
  consolidated: {
    totalRevenue: number;
    avgMargin: number;
    avgSellThrough: number;
    avgGmroi: number;
    meetsAllTargets: boolean;
  };
  
  // Status
  isActive: boolean;
}

// ─── Meta Macro (do Módulo 1) ───────────────────────────────────────────────
export interface MacroTarget {
  seasonId: string;
  revenue: number;                  // Meta de receita em R$
  margin: number;                   // Meta de margem %
  sellThrough: number;              // Meta de sell-through %
  gmroi: number;                    // Meta de GMROI
}

// ─── Consolidado da Temporada (Dashboard) ───────────────────────────────────
export interface SeasonConsolidated {
  seasonId: string;
  seasonName: string;
  referenceSeasonId?: string;
  
  // Dados consolidados
  totalRevenue: number;
  avgPrice: number;
  avgMargin: number;
  avgSellThrough: number;
  avgGmroi: number;
  
  // Validação contra macro
  macroTarget: MacroTarget;
  reachesMacroTarget: boolean;
  gaps: {
    revenue: number;                // Diferença em R$
    margin: number;                 // Diferença em %
    sellThrough: number;            // Diferença em %
  };
  
  // Division breakdown
  divisionBreakdown: Record<BusinessDivisionId, {
    participation: number;
    revenue: number;
    indicators: CommercialIndicators;
  }>;
  
  // Cenários salvos
  scenarios: Module3Scenario[];
}

// ─── Estado Global do Módulo 3 ─────────────────────────────────────────────
export interface Module3State {
  selectedSeasonId: string;         // Temporada selecionada
  referenceSeasonId: string;        // Temporada de referência
  
  // Divisões e seus planos
  divisions: Record<BusinessDivisionId, DivisionPlanBlock>;
  
  // Cenários
  scenarios: Module3Scenario[];
  activeScenarioId?: string;
  
  // Consolidado
  consolidated: SeasonConsolidated;
  
  // UI State
  isLoading: boolean;
  error?: string;
  lastSavedAt?: string;
}

// ─── Helper: Sell-Through Calculation ──────────────────────────────────────
/**
 * Sell-Through = Quantidade vendida ÷ (Estoque inicial + Reposições)
 * 
 * O período do Sell-Through é a "safra" da coleção, não o ano fiscal.
 * Acompanha do lançamento à liquidação final.
 */
export interface SellThroughInput {
  unitsSold: number;
  initialStock: number;
  replenishments: number;
}

export function calculateSellThrough(input: SellThroughInput): number {
  const totalAvailable = input.initialStock + input.replenishments;
  if (totalAvailable === 0) return 0;
  return (input.unitsSold / totalAvailable) * 100;
}

// ─── Helper: Validação de Risco Matrix ────────────────────────────────────
export function isValidRiskMatrix(riskMatrix: RiskMatrix): boolean {
  const total = riskMatrix.basics + riskMatrix.fashion + riskMatrix.highFashion;
  return Math.abs(total - 100) < 0.01; // Tolerância de 0.01%
}

// ─── Helper: Validação de Price Range ────────────────────────────────────
export function isValidPriceRange(priceRange: PriceRange): boolean {
  const total = priceRange.entryPercent + priceRange.middlePercent + priceRange.premiumPercent;
  return Math.abs(total - 100) < 0.01;
}

// ─── Divisões Padrão ──────────────────────────────────────────────────────
export const DEFAULT_DIVISIONS: Record<BusinessDivisionId, string> = {
  feminino: "Feminino Adulto",
  masculino: "Masculino Adulto",
  acessorios: "Acessórios",
  infantil: "Infantil",
};

// ─── Participações Iniciais Padrão ────────────────────────────────────────
export const DEFAULT_PARTICIPATION: Record<BusinessDivisionId, number> = {
  feminino: 45,
  masculino: 35,
  acessorios: 15,
  infantil: 5,
};
