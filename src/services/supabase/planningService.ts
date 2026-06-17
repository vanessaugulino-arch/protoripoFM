import { supabase } from "../../lib/supabase";
import type { TablesInsert } from "../../lib/database.types";

// ─── Ciclos de Planejamento (Módulo 1) ────────────────────────────────────────

export async function upsertPlanCycle(
  tenantId: string,
  year: number,
  focus: string,
  mode: string,
  fieldPriorities: unknown[],
) {
  const { data, error } = await supabase
    .from("annual_plan_cycles")
    .upsert(
      { tenant_id: tenantId, year, focus, mode, field_priorities: fieldPriorities as never },
      { onConflict: "tenant_id,year" },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPlanCycles(tenantId: string) {
  const { data, error } = await supabase
    .from("annual_plan_cycles")
    .select("*, planning_scenarios(*)")
    .eq("tenant_id", tenantId)
    .order("year", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPlanCycleByYear(tenantId: string, year: number) {
  const { data, error } = await supabase
    .from("annual_plan_cycles")
    .select("*, planning_scenarios(*)")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function applyPlanCycle(cycleId: string, userId: string) {
  const { error } = await supabase
    .from("annual_plan_cycles")
    .update({ applied_at: new Date().toISOString(), applied_by: userId })
    .eq("id", cycleId);

  if (error) throw error;
}

// ─── Cenários do Módulo 1 ─────────────────────────────────────────────────────

export async function savePlanningScenario(
  cycleId: string,
  tenantId: string,
  name: string,
  values: Record<string, number | null>,
  version: number,
  userId?: string,
) {
  const payload: TablesInsert<"planning_scenarios"> = {
    cycle_id:   cycleId,
    tenant_id:  tenantId,
    name,
    values:     values as never,
    version,
    is_applied: false,
    created_by: userId ?? null,
  };

  const { data, error } = await supabase
    .from("planning_scenarios")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listPlanningScenarios(cycleId: string) {
  const { data, error } = await supabase
    .from("planning_scenarios")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function applyPlanningScenario(scenarioId: string, cycleId: string) {
  // Desmarca todos os cenários do ciclo, aplica o selecionado
  await supabase
    .from("planning_scenarios")
    .update({ is_applied: false })
    .eq("cycle_id", cycleId);

  const { error } = await supabase
    .from("planning_scenarios")
    .update({ is_applied: true })
    .eq("id", scenarioId);

  if (error) throw error;
}

// ─── Cenários do Módulo 2 (Canal) ────────────────────────────────────────────

export async function saveChannelScenarioDb(
  tenantId: string,
  year: number,
  name: string,
  percents: Record<string, number>,
  channelData: Record<string, unknown>,
  userId?: string,
) {
  const { data, error } = await supabase
    .from("channel_scenarios")
    .insert({
      tenant_id:    tenantId,
      year,
      name,
      percents:     percents as never,
      channel_data: channelData as never,
      is_applied:   false,
      created_by:   userId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listChannelScenariosDb(tenantId: string, year: number) {
  const { data, error } = await supabase
    .from("channel_scenarios")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .order("saved_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function applyChannelScenarioDb(scenarioId: string, tenantId: string, year: number) {
  await supabase
    .from("channel_scenarios")
    .update({ is_applied: false })
    .eq("tenant_id", tenantId)
    .eq("year", year);

  const { error } = await supabase
    .from("channel_scenarios")
    .update({ is_applied: true })
    .eq("id", scenarioId);

  if (error) throw error;
}

// ─── Cenários do Módulo 3 (Divisão) ──────────────────────────────────────────

export async function saveDivisionScenarioDb(
  tenantId: string,
  year: number,
  seasonId: string,
  name: string,
  description: string | null,
  divisions: Record<string, unknown>,
  consolidated: Record<string, unknown>,
  userId?: string,
) {
  const { data, error } = await supabase
    .from("division_scenarios")
    .insert({
      tenant_id:   tenantId,
      year,
      season_id:   seasonId,
      name,
      description,
      divisions:   divisions as never,
      consolidated: consolidated as never,
      is_applied:  false,
      created_by:  userId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listDivisionScenariosDb(tenantId: string, year: number, seasonId?: string) {
  let query = supabase
    .from("division_scenarios")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .order("saved_at", { ascending: false });

  if (seasonId) query = query.eq("season_id", seasonId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Workflow States ──────────────────────────────────────────────────────────

export async function getWorkflowState(tenantId: string, year: number, moduleCode: string) {
  const { data, error } = await supabase
    .from("workflow_states")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .eq("module_code", moduleCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertWorkflowState(
  tenantId: string,
  year: number,
  moduleCode: string,
  status: "draft" | "submitted" | "approved" | "in_revision",
  userId?: string,
) {
  const { error } = await supabase
    .from("workflow_states")
    .upsert(
      { tenant_id: tenantId, year, module_code: moduleCode, status, updated_by: userId ?? null },
      { onConflict: "tenant_id,year,module_code" },
    );

  if (error) throw error;
}
