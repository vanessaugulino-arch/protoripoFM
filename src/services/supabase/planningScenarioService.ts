// src/services/supabase/planningScenarioService.ts
// Gerencia ciclos anuais (annual_plan_cycles) e cenários de planejamento (planning_scenarios)

import { supabase } from "../../lib/supabase";
import type { StrategicFocus, PlanMode, PlanFieldPriority } from "../../app/types/planCycle";
import { expandSeasonMonths } from "../../engine/seasonMonths";

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

// ─── Fase 3 — Sazonalidade aplicada por ano fiscal ───────────────────────────
// Uma temporada de Verão (ago-fev) cruza dois anos fiscais. Consideramos um
// ano fiscal Y "com Sazonalidade completa" quando TODAS as temporadas que
// COMEÇAM nesse ano (ex.: Inverno-Y e Verão-Y) já foram aplicadas — não
// rastreamos mês a mês, só por temporada (is_applied em
// planning_scenarios.values.seasonId, gravado em CycleValidation.tsx).
//
// Usado pelo gate do M4-Divisão: uma temporada só pode ser planejada por
// divisão quando TODOS os anos fiscais que ela toca (1 ou 2, se cruza o ano)
// já estiverem com a Sazonalidade completa.

/**
 * Anos fiscais tocados por uma temporada — 1 item se não cruza o ano, 2 se
 * cruza (ex.: Verão ago-fev). Reaproveita expandSeasonMonths (engine/seasonMonths.ts),
 * que já trata esse cruzamento corretamente em outros pontos do motor.
 */
export function seasonFiscalYearsTouched(
  mesInicio: string,
  mesFim: string,
  fiscalYear: number,
): number[] {
  const months = expandSeasonMonths(mesInicio, mesFim, fiscalYear);
  return Array.from(new Set(months.map((m) => m.year))).sort((a, b) => a - b);
}

export async function getSazonalidadeCompletedYears(tenantId: string): Promise<number[]> {
  const db = supabase as any;
  const [{ data: seasonRows }, { data: scenarioRows }] = await Promise.all([
    db.from("seasons").select("id, fiscal_year").eq("tenant_id", tenantId),
    db.from("planning_scenarios").select("values").eq("tenant_id", tenantId).eq("is_applied", true),
  ]);

  const appliedSeasonIds = new Set(
    ((scenarioRows ?? []) as { values: { seasonId?: string } }[])
      .map((r) => r.values?.seasonId)
      .filter((id): id is string => Boolean(id)),
  );

  const seasonsByYear = new Map<number, string[]>();
  for (const s of (seasonRows ?? []) as { id: string; fiscal_year: number | null }[]) {
    if (s.fiscal_year == null) continue;
    const list = seasonsByYear.get(s.fiscal_year) ?? [];
    list.push(s.id);
    seasonsByYear.set(s.fiscal_year, list);
  }

  const completedYears: number[] = [];
  for (const [year, ids] of seasonsByYear.entries()) {
    if (ids.length > 0 && ids.every((id) => appliedSeasonIds.has(id))) completedYears.push(year);
  }
  return completedYears.sort((a, b) => a - b);
}
