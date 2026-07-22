// src/services/supabase/divisionScenarioService.ts
// Gerencia division_scenarios no Supabase (Módulo 3 — Planejamento por Divisão)

import { supabase } from "../../lib/supabase";

export interface DivisionScenarioRow {
  id: string;
  tenant_id: string;
  season_id: string;
  year: number;
  name: string;
  description: string | null;
  divisions: Record<string, unknown>;
  consolidated: Record<string, unknown>;
  is_applied: boolean;
  saved_at: string;
  created_by: string | null;
}

// ─── Listar cenários de uma temporada ─────────────────────────────────────────

export async function listDivisionScenarios(
  tenantId: string,
  seasonId: string
): Promise<DivisionScenarioRow[]> {
  const { data, error } = await supabase
    .from("division_scenarios")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .order("saved_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DivisionScenarioRow[];
}

// ─── Salvar cenário ───────────────────────────────────────────────────────────

export async function saveDivisionScenario(
  tenantId: string,
  seasonId: string,
  year: number,
  name: string,
  description: string | null,
  divisions: Record<string, unknown>,
  consolidated: Record<string, unknown>,
  createdBy?: string
): Promise<DivisionScenarioRow> {
  const { data, error } = await supabase
    .from("division_scenarios")
    .insert({
      tenant_id: tenantId,
      season_id: seasonId,
      year,
      name: name.trim() || `Cenário ${new Date().toLocaleDateString("pt-BR")}`,
      description: description ?? null,
      divisions: divisions as unknown as import('../../lib/database.types').Json,
      consolidated: consolidated as unknown as import('../../lib/database.types').Json,
      is_applied: false,
      saved_at: new Date().toISOString(),
      created_by: createdBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DivisionScenarioRow;
}

// ─── Deletar cenário ──────────────────────────────────────────────────────────

export async function deleteDivisionScenario(
  tenantId: string,
  scenarioId: string
): Promise<void> {
  const { error } = await supabase
    .from("division_scenarios")
    .delete()
    .eq("id", scenarioId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

// ─── Aplicar cenário ──────────────────────────────────────────────────────────

export async function applyDivisionScenario(
  tenantId: string,
  seasonId: string,
  scenarioId: string
): Promise<void> {
  await supabase
    .from("division_scenarios")
    .update({ is_applied: false })
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId);

  await supabase
    .from("division_scenarios")
    .update({ is_applied: true })
    .eq("id", scenarioId);
}

/**
 * Aplica um cenário de divisão conhecendo apenas o id do cenário — resolve o
 * season_id sozinho (usado no aceite de aprovação M3→M1, onde só temos o id).
 */
export async function applyDivisionScenarioById(
  tenantId:   string,
  scenarioId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("division_scenarios")
    .select("season_id")
    .eq("id", scenarioId)
    .maybeSingle();
  const seasonId = data?.season_id as string | undefined;
  if (seasonId) {
    await supabase
      .from("division_scenarios")
      .update({ is_applied: false })
      .eq("tenant_id", tenantId)
      .eq("season_id", seasonId);
  }
  await supabase
    .from("division_scenarios")
    .update({ is_applied: true })
    .eq("id", scenarioId);
}
