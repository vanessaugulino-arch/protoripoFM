// Tipos específicos para Markdown/Promoções

export type DiscountLevel = "Baixo" | "Médio" | "Agressivo";

export interface ProductMarkdown {
  id: string;
  nome: string;
  foto: string;
  grupo: string; // "Feminino", "Masculino", "Infantil"
  categoria: string; // "Blusa", "Calça", "Vestido"
  subcategoria: string; // "Blusa manga curta", "Regata"
  temaColecao: string; // "Verão Vibrante", "Minimalista"
  
  // Dados de estoque e preço
  estoqueAtual: number;
  precoOriginal: number;
  custoUnitario: number;
  margemOriginal: number; // Percentual
  
  // Flags
  continuidade: boolean; // false = descontinuado
  
  // Decisões de markdown (editáveis pelo usuário)
  percentualDesconto: number; // 0-100
  nivelCorte: DiscountLevel;
  
  // Calculados
  precoComDesconto?: number;
  custoDesconto?: number; // Custo total do desconto para este produto
  margemFinal?: number;
  vendaEstimada?: number; // Unidades
  estoqueFinalPrevisto?: number;
}

export interface MarkdownBudget {
  grupoId: string;
  grupoNome: string;
  verbaTotalRemarcacao: number;
  definidoPor: string; // ID do usuário (Renata)
  definidoEm: string;
}

export interface MarkdownSummary {
  verbaTotalDisponivel: number;
  verbaTotalUtilizada: number;
  percentualUtilizacao: number;
  margemMediaOriginal: number;
  margemMediaFinal: number;
  totalUnidadesEstoque: number;
  totalUnidadesVendaEstimada: number;
  totalEstoqueFinalPrevisto: number;
  economiaVerbaNaoUtilizada: number;
}

export interface MarkdownFilters {
  categoria?: string;
  subcategoria?: string;
  temaColecao?: string;
  searchTerm?: string;
}

// Elasticidade de vendas por nível de corte
export const ELASTICITY_MULTIPLIER: Record<DiscountLevel, number> = {
  "Baixo": 1.10,      // 10% aumento nas vendas
  "Médio": 1.25,      // 25% aumento nas vendas
  "Agressivo": 1.50,  // 50% aumento nas vendas
};

// Sugestão de desconto por nível de corte
export const SUGGESTED_DISCOUNT: Record<DiscountLevel, number> = {
  "Baixo": 15,
  "Médio": 30,
  "Agressivo": 50,
};
