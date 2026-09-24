// src/services/supabase/sortimentPlanService.ts
// Gerencia sortiment_plans no Supabase (Módulo 5 — Plano de Sortimento)
//
// Modelo:
//   Plano de trabalho  → is_applied = true,  name = '__working__'
//   Simulações salvas  → is_applied = false,  name = <nome dado pelo usuário>

import { supabase as _supabase } from "../../lib/supabase";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any; // sortiment_plans não está no database.types.ts até próxima geração de tipos

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface SortimentPlanRow {
  id: string;
  tenant_id: string;
  season_id: string;
  name: string;
  divisions: Record<string, unknown>[];
  is_applied: boolean;
  saved_at: string;
}

export interface SortimentScenario {
  id: string;
  name: string;
  savedAt: string;
  // data é o array de Division[] armazenado como jsonb
  data: Record<string, unknown>[];
  /** Plano de Coleção (M5, collection_plans.id) que originou este cenário — null se montado direto do M4. */
  sourceCollectionPlanId: string | null;
}

export interface SortimentWorkingPlan {
  divisions: Record<string, unknown>[];
  /** Plano de Coleção (M5, collection_plans.id) usado como base — null se montado do zero/M4. */
  sourceCollectionPlanId: string | null;
}

// ─── Plano de trabalho (is_applied = true) ───────────────────────────────────

export async function getWorkingPlan(
  tenantId: string,
  seasonId: string,
): Promise<SortimentWorkingPlan | null> {
  const { data, error } = await supabase
    .from("sortiment_plans")
    .select("divisions, source_collection_plan_id")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[sortimentPlan] getWorkingPlan:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    divisions: (data.divisions as Record<string, unknown>[]) ?? [],
    sourceCollectionPlanId: (data.source_collection_plan_id as string | null) ?? null,
  };
}

/**
 * @param sourceCollectionPlanId Passe apenas quando o vínculo com o M5 muda de
 * fato (ex.: o usuário escolheu outro Plano de Coleção como base). Omitido
 * (undefined) nos autosaves normais de edição — preserva o vínculo já gravado
 * em vez de apagá-lo a cada tecla.
 */
export async function saveWorkingPlan(
  tenantId: string,
  seasonId: string,
  divisions: Record<string, unknown>[],
  sourceCollectionPlanId?: string | null,
): Promise<void> {
  // Verifica se já existe um plano de trabalho
  const { data: existing } = await supabase
    .from("sortiment_plans")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", true)
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    divisions: divisions as unknown as import('../../lib/database.types').Json,
    saved_at: new Date().toISOString(),
  };
  if (sourceCollectionPlanId !== undefined) {
    patch.source_collection_plan_id = sourceCollectionPlanId;
  }

  if (existing?.id) {
    await supabase.from("sortiment_plans").update(patch).eq("id", existing.id);
  } else {
    await supabase.from("sortiment_plans").insert({
      tenant_id: tenantId,
      season_id: seasonId,
      name: "__working__",
      is_applied: true,
      ...patch,
    });
  }
}

// ─── Simulações (is_applied = false) ─────────────────────────────────────────

export async function listPlanScenarios(
  tenantId: string,
  seasonId: string,
): Promise<SortimentScenario[]> {
  const { data, error } = await supabase
    .from("sortiment_plans")
    .select("id, name, saved_at, divisions, source_collection_plan_id")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", false)
    .order("saved_at", { ascending: true });

  if (error) {
    console.warn("[sortimentPlan] listPlanScenarios:", error.message);
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id as string,
    name: row.name as string,
    savedAt: row.saved_at as string,
    data: (row.divisions as Record<string, unknown>[]) ?? [],
    sourceCollectionPlanId: (row.source_collection_plan_id as string | null) ?? null,
  }));
}

/**
 * @param sourceCollectionPlanId Vínculo com o Plano de Coleção (M5) que deu
 * origem a este cenário — permite listar Coleção+Sortimento como uma única
 * "Engenharia de Sortimento". Omitido (undefined/null) em cenários montados
 * direto do M4, sem passar por um Plano de Coleção nomeado.
 */
export async function savePlanScenario(
  tenantId: string,
  seasonId: string,
  name: string,
  divisions: Record<string, unknown>[],
  sourceCollectionPlanId?: string | null,
): Promise<SortimentScenario> {
  const savedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("sortiment_plans")
    .insert({
      tenant_id: tenantId,
      season_id: seasonId,
      name: name.trim(),
      divisions: divisions as unknown as import('../../lib/database.types').Json,
      is_applied: false,
      saved_at: savedAt,
      source_collection_plan_id: sourceCollectionPlanId ?? null,
    })
    .select("id, name, saved_at, divisions, source_collection_plan_id")
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    name: data.name as string,
    savedAt: data.saved_at as string,
    data: (data.divisions as Record<string, unknown>[]) ?? [],
    sourceCollectionPlanId: (data.source_collection_plan_id as string | null) ?? null,
  };
}

export async function deletePlanScenario(
  tenantId: string,
  planId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sortiment_plans")
    .delete()
    .eq("id", planId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}
