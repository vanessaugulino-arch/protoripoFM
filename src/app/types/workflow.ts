// Tipos para o sistema de workflow do Fashion Mind

export type Profile = "CEO" | "Direção Criativa" | "Estilo";

export type WorkflowStatus = "draft" | "pending_creative" | "pending_style" | "completed" | "in_revision";

export interface User {
  id: string;
  name: string;
  email: string;
  profile: Profile;
}

// Hierarquia de produtos
export interface Product {
  id: string;
  name: string;
  subcategoryId: string;
  // Exemplo: "Blusa manga curta ampla marrom"
}

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
  // Exemplo: "Blusa manga curta", "Regata"
}

export interface Category {
  id: string;
  name: string;
  groupId: string;
  // Exemplo: "Blusa", "Calça", "Vestido"
}

export interface ProductGroup {
  id: string;
  name: string;
  // Exemplo: "Feminino", "Masculino", "Infantil"
}

// Ciclo de coleção
export interface CollectionCycle {
  id: string;
  name: string;
  season: string; // Ex: "Verão 2026"
  status: WorkflowStatus;
  createdAt: string;
  createdBy: string; // User ID (Murilo/CEO)
  
  // Dados estratégicos (definidos pelo CEO - Murilo)
  section_murilo_estrategico: {
    metaReceitaTotal: number;
    orcamento: number;
    margemAlvo: number;
    observacoes?: string;
    approvedAt?: string;
    approvedBy?: string;
  };
  
  // Dados táticos (definidos pela Direção Criativa - Renata)
  section_renata_tatico?: {
    metasPorGrupo: {
      groupId: string;
      metaReceita: number;
      orcamento: number;
    }[];
    temas: {
      id: string;
      nome: string;
      cores: string[];
      percentualColecao: number;
    }[];
    observacoes?: string;
    approvedAt?: string;
    approvedBy?: string;
  };
  
  // Dados operacionais (definidos pelo Estilo - Carol)
  section_carol_operacional?: {
    mixProdutos: {
      groupId: string;
      categoryId: string;
      subcategoryId?: string;
      quantidade: number;
      precoMedio: number;
      temaId: string;
    }[];
    observacoes?: string;
    approvedAt?: string;
    approvedBy?: string;
  };
}

// Fechamento de ciclo / Markdown
export interface CycleClosing {
  id: string;
  cycleId: string;
  status: WorkflowStatus;
  createdAt: string;
  
  // Análise estratégica (CEO - Murilo)
  section_murilo_estrategico: {
    metasAlcancadas: boolean;
    percentualMarkdown: number;
    impactoMargem: number;
    observacoes?: string;
    approvedAt?: string;
  };
  
  // Análise tática (Direção Criativa - Renata)
  section_renata_tatico?: {
    gruposComMarkdown: {
      groupId: string;
      percentualDesconto: number;
      itensAfetados: number;
    }[];
    observacoes?: string;
    approvedAt?: string;
  };
  
  // Execução (Estilo - Carol)
  section_carol_operacional?: {
    produtosMarkdown: {
      productId: string;
      estoqueAtual: number;
      descontoAplicado: number;
      dataInicio: string;
      dataFim: string;
    }[];
    observacoes?: string;
    approvedAt?: string;
  };
}

// Report de aprovação
export interface ApprovalReport {
  id: string;
  cycleId: string;
  approvedBy: string;
  approvedByName: string;
  approvedByProfile: Profile;
  approvedAt: string;
  observations: string;
  nextProfile?: Profile;
}

// Permissões por perfil
export interface Permissions {
  canEditStrategic: boolean; // section_murilo_estrategico
  canEditTactical: boolean; // section_renata_tatico
  canEditOperational: boolean; // section_carol_operacional
  canApprove: boolean;
  canViewAll: boolean;
}

// Estado do ciclo por perfil
export interface CycleState {
  cycle: CollectionCycle | null;
  currentUser: User | null;
  permissions: Permissions;
  isLoading: boolean;
  error: string | null;
}
