// src/services/supabase/productHierarchyService.ts
// Hierarquia derivada dos produtos reais — busca, migração e importação

import { supabase } from "../../lib/supabase";
import { normalizeDivision } from "./historicalProfileService";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface HierLabels {
  divisao: string;
  categoria: string;
  subcategoria: string;
  linha: string;
}

export const DEFAULT_HIER_LABELS: HierLabels = {
  divisao: "Divisão",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  linha: "Linha",
};

export interface HierarchyPath {
  division: string | null;
  category: string | null;
  subcategory: string | null;
  linha: string | null;
  count: number;
}

export interface ProductForMigration {
  id: string;
  sku: string;
  name: string;
  division: string | null;
  category: string | null;
  subcategory: string | null;
  linha: string | null;
  material: string | null;
}

export interface HierDistinct {
  divisions: string[];
  categories: string[];
  subcategories: string[];
  linhas: string[];
  materials: string[];
}

export interface HierarchyImportRow {
  sku: string;
  division?: string;
  category?: string;
  subcategory?: string;
  linha?: string;
}

export interface HierarchyImportResult {
  updated: number;
  notFound: number;
  errors: number;
}

// ─── Buscar caminhos distintos (para construir árvore) ───────────────────────

export async function fetchHierarchyPaths(tenantId: string): Promise<HierarchyPath[]> {
  const { data, error } = await supabase
    .from("products")
    .select("division, category, subcategory, linha")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Agregar contagens por caminho único
  const map = new Map<string, HierarchyPath>();
  for (const row of data) {
    const key = [row.division ?? "", row.category ?? "", row.subcategory ?? "", row.linha ?? ""].join("|");
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, {
        division: row.division,
        category: row.category,
        subcategory: row.subcategory,
        linha: row.linha,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}

// ─── Divisões reais do tenant (para o Módulo 3) ───────────────────────────────
// Substitui a antiga lista fixa ["feminino","masculino","acessorios","infantil"].
// `id` é normalizado (minúsculo, sem acento — usado como chave interna/rota) e
// `label` é o valor real como está cadastrado em products.division (para exibição).

export interface TenantDivision {
  id: string;
  label: string;
}

export async function fetchTenantDivisions(tenantId: string): Promise<TenantDivision[]> {
  const { data, error } = await supabase
    .from("products")
    .select("division")
    .eq("tenant_id", tenantId)
    .not("division", "is", null);

  if (error) throw error;

  const labels = Array.from(
    new Set((data ?? []).map((r) => (r.division as string | null)?.trim()).filter((v): v is string => !!v)),
  );

  return labels
    .map((label) => ({ id: normalizeDivision(label), label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

// ─── Categorias reais de uma divisão (para a Pirâmide de Preço) ───────────────
// Substitui o CATEGORIES_BY_DIVISION hardcoded do PricePyramid.tsx — só mostra
// categorias que o tenant realmente tem cadastradas naquela divisão.

export async function fetchCategoriesForDivision(
  tenantId: string,
  divisionLabel: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("products")
    .select("category")
    .eq("tenant_id", tenantId)
    .eq("division", divisionLabel)
    .not("category", "is", null);

  if (error) throw error;

  return Array.from(
    new Set((data ?? []).map((r) => (r.category as string | null)?.trim()).filter((v): v is string => !!v)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ─── Buscar valores distintos para comboboxes ─────────────────────────────────

export async function fetchHierDistinct(tenantId: string): Promise<HierDistinct> {
  const { data, error } = await supabase
    .from("products")
    .select("division, category, subcategory, linha, material")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  if (!data) return { divisions: [], categories: [], subcategories: [], linhas: [], materials: [] };

  const unique = (arr: (string | null)[]): string[] =>
    Array.from(new Set(arr.filter((v): v is string => !!v))).sort();

  return {
    divisions:    unique(data.map(r => r.division)),
    categories:   unique(data.map(r => r.category)),
    subcategories: unique(data.map(r => r.subcategory)),
    linhas:       unique(data.map(r => r.linha)),
    materials:    unique(data.map(r => r.material)),
  };
}

// ─── Buscar produtos para seleção na migração ────────────────────────────────

export async function searchProductsForMigration(
  tenantId: string,
  filter: {
    division?: string;
    category?: string;
    subcategory?: string;
    keyword?: string;
    material?: string;
  }
): Promise<ProductForMigration[]> {
  let query = supabase
    .from("products")
    .select("id, sku, name, division, category, subcategory, linha, material")
    .eq("tenant_id", tenantId)
    .order("name")
    .limit(500);

  if (filter.division)    query = query.eq("division", filter.division);
  if (filter.category)    query = query.eq("category", filter.category);
  if (filter.subcategory) query = query.eq("subcategory", filter.subcategory);
  if (filter.keyword)     query = query.ilike("name", `%${filter.keyword}%`);
  if (filter.material)    query = query.eq("material", filter.material);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductForMigration[];
}

// ─── Migrar produtos para novo caminho de hierarquia ─────────────────────────

export async function migrateProducts(
  tenantId: string,
  skus: string[],
  newPath: {
    division?: string | null;
    category?: string | null;
    subcategory?: string | null;
    linha?: string | null;
  }
): Promise<number> {
  if (skus.length === 0) return 0;

  const update: {
    division?: string | null; category?: string | null;
    subcategory?: string | null; linha?: string | null; updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (newPath.division    !== undefined) update.division    = newPath.division;
  if (newPath.category    !== undefined) update.category    = newPath.category;
  if (newPath.subcategory !== undefined) update.subcategory = newPath.subcategory;
  if (newPath.linha       !== undefined) update.linha       = newPath.linha;

  // Processa em lotes de 200 para não ultrapassar limites da URL
  let totalUpdated = 0;
  const batchSize = 200;
  for (let i = 0; i < skus.length; i += batchSize) {
    const batch = skus.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("tenant_id", tenantId)
      .in("sku", batch)
      .select("id");
    if (!error && data) totalUpdated += data.length;
  }
  return totalUpdated;
}

// ─── Importar hierarquia de planilha ERP ──────────────────────────────────────
// Agrupa por caminho-destino (divisão/categoria/subcategoria/linha) para
// usar .in("sku", skus) por grupo, o que é muito mais eficiente do que
// uma query por linha.

export async function importHierarchyRows(
  tenantId: string,
  rows: HierarchyImportRow[]
): Promise<HierarchyImportResult> {
  if (rows.length === 0) return { updated: 0, notFound: 0, errors: 0 };

  // Agrupar por destino
  const groups = new Map<string, { path: Omit<HierarchyImportRow, "sku">; skus: string[] }>();
  for (const row of rows) {
    const { sku, ...path } = row;
    const key = JSON.stringify(path);
    if (!groups.has(key)) groups.set(key, { path, skus: [] });
    groups.get(key)!.skus.push(sku);
  }

  let updated = 0;
  let errors = 0;
  const allSkus = rows.map(r => r.sku);

  for (const { path, skus } of groups.values()) {
    const update: {
      division?: string; category?: string;
      subcategory?: string; linha?: string; updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (path.division)    update.division    = path.division;
    if (path.category)    update.category    = path.category;
    if (path.subcategory) update.subcategory = path.subcategory;
    if (path.linha)       update.linha       = path.linha;

    const batchSize = 200;
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("products")
        .update(update)
        .eq("tenant_id", tenantId)
        .in("sku", batch)
        .select("id");
      if (error) { errors++; }
      else if (data) { updated += data.length; }
    }
  }

  const notFound = allSkus.length - updated;
  return { updated, notFound: Math.max(0, notFound), errors };
}

// ─── Salvar rótulos de hierarquia no Supabase ────────────────────────────────

export async function saveHierLabels(tenantId: string, labels: HierLabels): Promise<void> {
  const { error } = await supabase
    .from("operation_settings")
    .upsert(
      { tenant_id: tenantId, hier_labels: labels as unknown as import("../../lib/database.types").Json, hier_labels_pending: false, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) throw error;
}
