/**
 * Tipos para Pirâmide de Preço por Categoria — Módulo 3
 *
 * O usuário ajusta apenas a PARTICIPAÇÃO (%) de cada faixa por categoria.
 * Os valores em R$ das faixas (rangeMin/rangeMax) são somente leitura aqui —
 * serão definidos no painel de Configurações (TODO: integrar com OperationSettings).
 */

export type PriceTierId = "p1" | "p2" | "p3";

export interface TierConfig {
  id: PriceTierId;
  label: string;    // "P1 — Entrada" | "P2 — Médio" | "P3 — Premium"
  rangeMin: number; // R$ fixo (somente leitura)
  rangeMax: number;
}

export interface CategoryPricePlan {
  categoryId: string;
  label: string;   // "Vestido", "Blusa", etc.
  tiers: Record<PriceTierId, { participation: number }>; // % editável (0-100)
}

export interface DivisionPricePyramid {
  divisionId: string;
  tierConfig: Record<PriceTierId, TierConfig>;
  categories: CategoryPricePlan[];
}
