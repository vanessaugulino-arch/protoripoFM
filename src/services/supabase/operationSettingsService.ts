// src/services/supabase/operationSettingsService.ts
// Gerencia operation_settings no Supabase — hierarquia, basicosAtivos, etc.

import { supabase } from "../../lib/supabase";
import type { HierNode } from "../../app/pages/OperationSettings";
import type { HierLabels } from "./productHierarchyService";

export interface TierLabel {
  id: string;
  nome: string;
  min: number;
  max: number;
}

export interface FaixaCategoria {
  id: number;
  grupo: string;
  divisao?: string;
  categoria: string;
  faixas: {
    P1: { inicio: number; fim: number };
    P2: { inicio: number; fim: number };
    P3: { inicio: number; fim: number };
  };
}

export interface OperationSettingsRow {
  id: string;
  tenant_id: string;
  hier_divisao_ativa: boolean;
  hier_ordem: string;         // JSON string com estrutura da hierarquia (legado)
  subcategorias: string[];
  basicos_ativos: boolean;
  basicos_tipo: string | null;
  basicos_skus: string | null;
  faixas_preco: TierLabel[] | null;            // tier labels do catálogo
  faixas_categoria: FaixaCategoria[] | null;   // faixas P1/P2/P3 por grupo/categoria
  hier_labels: HierLabels | null;              // rótulos "de × para" dos níveis
  hier_labels_pending: boolean;               // true enquanto usuário não configurou
  updated_at: string;
}

// ─── Carregar settings ────────────────────────────────────────────────────────

export async function getOperationSettings(
  tenantId: string
): Promise<OperationSettingsRow | null> {
  const { data, error } = await supabase
    .from("operation_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as OperationSettingsRow | null;
}

// ─── Salvar settings (upsert) ─────────────────────────────────────────────────

export async function saveOperationSettings(
  tenantId: string,
  settings: {
    hier_divisao_ativa: boolean;
    hier_struct: HierNode[];
    hier_ordem: string;
    subcategorias: string[];
    basicos_ativos: boolean;
    basicos_tipo: string | null;
    basicos_skus: string | null;
    faixas_preco?: TierLabel[];
    faixas_categoria?: FaixaCategoria[];
  }
): Promise<void> {
  const base = {
    tenant_id: tenantId,
    hier_divisao_ativa: settings.hier_divisao_ativa,
    // hier_struct não existe na tabela — armazenamos em hier_ordem como JSON
    hier_ordem: JSON.stringify(settings.hier_struct),
    subcategorias: settings.subcategorias,
    basicos_ativos: settings.basicos_ativos,
    basicos_tipo: settings.basicos_tipo,
    basicos_skus: settings.basicos_skus,
    updated_at: new Date().toISOString(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = { ...base };
  if (settings.faixas_preco !== undefined) row.faixas_preco = settings.faixas_preco;
  if (settings.faixas_categoria !== undefined) row.faixas_categoria = settings.faixas_categoria;

  const { error } = await supabase
    .from("operation_settings")
    .upsert(row, { onConflict: "tenant_id" });

  if (error) throw error;
}

// ─── Salvar apenas tier labels (faixas catálogo) ──────────────────────────────

export async function saveTierLabels(
  tenantId: string,
  faixas: TierLabel[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {
    tenant_id: tenantId,
    faixas_preco: faixas,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("operation_settings")
    .upsert(row, { onConflict: "tenant_id" });
  if (error) throw error;
}

// ─── Salvar apenas faixas por categoria (P1/P2/P3) ───────────────────────────

export async function saveFaixasCategoria(
  tenantId: string,
  faixas: FaixaCategoria[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {
    tenant_id: tenantId,
    faixas_categoria: faixas,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("operation_settings")
    .upsert(row, { onConflict: "tenant_id" });
  if (error) throw error;
}

// ─── Carregar hierarquia (retorna HierNode[]) ─────────────────────────────────

export async function loadHierStruct(tenantId: string): Promise<HierNode[]> {
  const row = await getOperationSettings(tenantId);
  if (!row) return [];

  try {
    return JSON.parse(row.hier_ordem) as HierNode[];
  } catch {
    return [];
  }
}
