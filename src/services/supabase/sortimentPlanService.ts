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
}

// ─── Plano de trabalho (is_applied = true) ───────────────────────────────────

export async function getWorkingPlan(
  tenantId: string,
  seasonId: string,
): Promise<Record<string, unknown>[] | null> {
  const { data, error } = await supabase
    .from("sortiment_plans")
    .select("divisions")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[sortimentPlan] getWorkingPlan:", error.message);
    return null;
  }
  return (data?.divisions as Record<string, unknown>[]) ?? null;
}

export async function saveWorkingPlan(
  tenantId: string,
  seasonId: string,
  divisions: Record<string, unknown>[],
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

  if (existing?.id) {
    await supabase
      .from("sortiment_plans")
      .update({
        divisions: divisions as unknown as import('../../lib/database.types').Json,
        saved_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("sortiment_plans").insert({
      tenant_id: tenantId,
      season_id: seasonId,
      name: "__working__",
      divisions: divisions as unknown as import('../../lib/database.types').Json,
      is_applied: true,
      saved_at: new Date().toISOString(),
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
    .select("id, name, saved_at, divisions")
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
  }));
}

export async function savePlanScenario(
  tenantId: string,
  seasonId: string,
  name: string,
  divisions: Record<string, unknown>[],
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
    })
    .select("id, name, saved_at, divisions")
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    name: data.name as string,
    savedAt: data.saved_at as string,
    data: (data.divisions as Record<string, unknown>[]) ?? [],
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
