// src/services/supabase/planningScenarioService.ts
// Gerencia ciclos anuais (annual_plan_cycles) e cenários de planejamento (planning_scenarios)

import { supabase } from "../../lib/supabase";
import type { StrategicFocus, PlanMode, PlanFieldPriority } from "../../app/types/planCycle";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AnnualPlanCycle {
  id: string;
  tenant_id: string;
  year: number;
  focus: StrategicFocus;
  mode: PlanMode;
  field_priorities: Record<string, PlanFieldPriority>;
  applied_at: string | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningScenarioRow {
  id: string;
  tenant_id: string;
  cycle_id: string;
  name: string;
  version: number;
  values: Record<string, unknown>;
  is_applied: boolean;
  created_at: string;
  created_by: string | null;
}

// ─── Ciclos (annual_plan_cycles) ──────────────────────────────────────────────

export async function getOrCreateCycle(
  tenantId: string,
  year: number,
  defaults: { focus: StrategicFocus; mode: PlanMode; field_priorities: Record<string, PlanFieldPriority> }
): Promise<AnnualPlanCycle> {
  // Tenta buscar ciclo existente
  const { data: existing, error: fetchErr } = await supabase
    .from("annual_plan_cycles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (existing) return existing as unknown as AnnualPlanCycle;

  // Cria novo ciclo
  const { data: created, error: insertErr } = await supabase
    .from("annual_plan_cycles")
    .insert({
      tenant_id: tenantId,
      year,
      focus: defaults.focus,
      mode: defaults.mode,
      field_priorities: defaults.field_priorities as unknown as import('../../lib/database.types').Json,
    })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return created as unknown as AnnualPlanCycle;
}

export async function saveCycle(
  tenantId: string,
  year: number,
  data: { focus: StrategicFocus; mode: PlanMode; field_priorities: Record<string, PlanFieldPriority> }
): Promise<AnnualPlanCycle> {
  const { data: upserted, error } = await supabase
    .from("annual_plan_cycles")
    .upsert(
      {
        tenant_id: tenantId,
        year,
        focus: data.focus,
        mode: data.mode,
        field_priorities: data.field_priorities as unknown as import('../../lib/database.types').Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,year" }
    )
    .select()
    .single();

  if (error) throw error;
  return upserted as unknown as AnnualPlanCycle;
}

export async function getCycle(
  tenantId: string,
  year: number
): Promise<AnnualPlanCycle | null> {
  const { data, error } = await supabase
    .from("annual_plan_cycles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as AnnualPlanCycle | null;
}

// ─── Cenários (planning_scenarios) ───────────────────────────────────────────

export async function listScenarios(
  tenantId: string,
  year: number
): Promise<PlanningScenarioRow[]> {
  // Primeiro encontra o cycle_id do ano
  const cycle = await getCycle(tenantId, year);
  if (!cycle) return [];

  const { data, error } = await supabase
    .from("planning_scenarios")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("cycle_id", cycle.id)
    .order("version", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlanningScenarioRow[];
}

export async function saveScenario(
  tenantId: string,
  cycleId: string,
  name: string,
  version: number,
  values: Record<string, unknown>,
  createdBy?: string
): Promise<PlanningScenarioRow> {
  const { data, error } = await supabase
    .from("planning_scenarios")
    .insert({
      tenant_id: tenantId,
      cycle_id: cycleId,
      name,
      version,
      values: values as unknown as import('../../lib/database.types').Json,
      is_applied: false,
      created_by: createdBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PlanningScenarioRow;
}

export async function deleteScenario(
  tenantId: string,
  scenarioId: string
): Promise<void> {
  const { error } = await supabase
    .from("planning_scenarios")
    .delete()
    .eq("id", scenarioId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

export async function applyScenario(
  tenantId: string,
  cycleId: string,
  scenarioId: string,
  appliedBy: string
): Promise<void> {
  // Remove applied de todos os cenários do ciclo
  await supabase
    .from("planning_scenarios")
    .update({ is_applied: false })
    .eq("tenant_id", tenantId)
    .eq("cycle_id", cycleId);

  // Marca o cenário selecionado
  await supabase
    .from("planning_scenarios")
    .update({ is_applied: true })
    .eq("id", scenarioId);

  // Atualiza o ciclo
  await supabase
    .from("annual_plan_cycles")
    .update({ applied_at: new Date().toISOString(), applied_by: appliedBy })
    .eq("id", cycleId)
    .eq("tenant_id", tenantId);
}
