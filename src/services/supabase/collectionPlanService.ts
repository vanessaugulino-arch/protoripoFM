// src/services/supabase/collectionPlanService.ts
// Gerencia collection_plans no Supabase (Módulo 5 — Plano de Coleção, Fase 4/5)
//
// Mesmo modelo de sortimentPlanService.ts:
//   Plano de trabalho  → is_applied = true,  name = '__working__'
//   Simulações salvas  → is_applied = false, name = <nome dado pelo usuário>

import { supabase as _supabase } from "../../lib/supabase";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any; // collection_plans não está no database.types.ts até próxima geração de tipos

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type CollectionPlanType = "colecao" | "drop";

/** Uma coleção/drop alocada num mês, com o volume de peças planejado. */
export interface CollectionPlanEntry {
  id: string;
  name: string;
  type: CollectionPlanType;
  month: string;          // nome do mês (ex: "Agosto") dentro do ciclo da temporada
  plannedPieces: number;
}

/** Estado de uma divisão dentro do Plano de Coleção. */
export interface CollectionPlanDivision {
  /** Volume-teto vindo do M4 (Divisão) — volumeCoverage.productionVolume daquela divisão. */
  targetPieces: number;
  entries: CollectionPlanEntry[];
}

export interface CollectionPlanRow {
  id: string;
  tenant_id: string;
  season_id: string;
  name: string;
  divisions: Record<string, CollectionPlanDivision>;
  is_applied: boolean;
  saved_at: string;
  /** Linhagem M4→M5: division_scenarios.id (M4) usado para semear targetPieces. */
  source_division_scenario_id?: string | null;
}

export interface CollectionPlanScenario {
  id: string;
  name: string;
  savedAt: string;
  divisions: Record<string, CollectionPlanDivision>;
}

// ─── Plano de trabalho (is_applied = true) ───────────────────────────────────

export async function getWorkingCollectionPlan(
  tenantId: string,
  seasonId: string,
): Promise<Record<string, CollectionPlanDivision> | null> {
  const { data, error } = await supabase
    .from("collection_plans")
    .select("divisions")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[collectionPlan] getWorkingCollectionPlan:", error.message);
    return null;
  }
  return (data?.divisions as Record<string, CollectionPlanDivision>) ?? null;
}

/**
 * @param sourceDivisionScenarioId Linhagem M4→M5. Omitido (undefined) nos
 * autosaves normais de edição — preserva o vínculo já gravado em vez de
 * apagá-lo a cada tecla.
 */
export async function saveWorkingCollectionPlan(
  tenantId: string,
  seasonId: string,
  divisions: Record<string, CollectionPlanDivision>,
  sourceDivisionScenarioId?: string | null,
): Promise<void> {
  const { data: existing } = await supabase
    .from("collection_plans")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", true)
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    divisions: divisions as unknown as import("../../lib/database.types").Json,
    saved_at: new Date().toISOString(),
  };
  if (sourceDivisionScenarioId !== undefined) {
    patch.source_division_scenario_id = sourceDivisionScenarioId;
  }

  if (existing?.id) {
    await supabase.from("collection_plans").update(patch).eq("id", existing.id);
  } else {
    await supabase.from("collection_plans").insert({
      tenant_id: tenantId,
      season_id: seasonId,
      name: "__working__",
      is_applied: true,
      ...patch,
    });
  }
}

// ─── Simulações (is_applied = false) ─────────────────────────────────────────

export async function listCollectionPlanScenarios(
  tenantId: string,
  seasonId: string,
): Promise<CollectionPlanScenario[]> {
  const { data, error } = await supabase
    .from("collection_plans")
    .select("id, name, saved_at, divisions")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", false)
    .order("saved_at", { ascending: true });

  if (error) {
    console.warn("[collectionPlan] listCollectionPlanScenarios:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    name: row.name as string,
    savedAt: row.saved_at as string,
    divisions: (row.divisions as Record<string, CollectionPlanDivision>) ?? {},
  }));
}

export async function saveCollectionPlanScenario(
  tenantId: string,
  seasonId: string,
  name: string,
  divisions: Record<string, CollectionPlanDivision>,
  sourceDivisionScenarioId?: string | null,
): Promise<CollectionPlanScenario> {
  const savedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("collection_plans")
    .insert({
      tenant_id: tenantId,
      season_id: seasonId,
      name: name.trim(),
      divisions: divisions as unknown as import("../../lib/database.types").Json,
      is_applied: false,
      saved_at: savedAt,
      source_division_scenario_id: sourceDivisionScenarioId ?? null,
    })
    .select("id, name, saved_at, divisions")
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    name: data.name as string,
    savedAt: data.saved_at as string,
    divisions: (data.divisions as Record<string, CollectionPlanDivision>) ?? {},
  };
}

export async function deleteCollectionPlanScenario(
  tenantId: string,
  planId: string,
): Promise<void> {
  const { error } = await supabase
    .from("collection_plans")
    .delete()
    .eq("id", planId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

// ─── Listagem para o M6 (Engenharia de Sortimento) escolher a base ───────────

export interface CollectionPlanSummary {
  id: string;
  name: string;
  savedAt: string;
  isApplied: boolean;
  divisions: Record<string, CollectionPlanDivision>;
}

/**
 * Lista TODOS os planos de coleção da temporada (o plano de trabalho aplicado
 * + qualquer simulação salva), para o M6 poder escolher qual usar como base —
 * antes o M6 nem lia esta tabela, sempre montava as collections do zero.
 */
export async function listAllCollectionPlans(
  tenantId: string,
  seasonId: string,
): Promise<CollectionPlanSummary[]> {
  const { data, error } = await supabase
    .from("collection_plans")
    .select("id, name, saved_at, is_applied, divisions")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .order("is_applied", { ascending: false })
    .order("saved_at", { ascending: true });

  if (error) {
    console.warn("[collectionPlan] listAllCollectionPlans:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    name: row.is_applied ? "Plano de trabalho atual (M5)" : (row.name as string),
    savedAt: row.saved_at as string,
    isApplied: !!row.is_applied,
    divisions: (row.divisions as Record<string, CollectionPlanDivision>) ?? {},
  }));
}

/**
 * Aplica um cenário salvo como plano de trabalho — copia suas divisions para
 * a linha is_applied=true (cria se não existir), mesmo efeito de "aplicar"
 * usado no resto do app.
 */
export async function applyCollectionPlanScenario(
  tenantId: string,
  seasonId: string,
  scenarioId: string,
): Promise<void> {
  const { data: scenario, error } = await supabase
    .from("collection_plans")
    .select("divisions")
    .eq("id", scenarioId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !scenario) return;
  await saveWorkingCollectionPlan(tenantId, seasonId, scenario.divisions ?? {});
}
