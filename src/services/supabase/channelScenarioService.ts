// src/services/supabase/channelScenarioService.ts
// Gerencia channel_scenarios no Supabase (Módulo 2 — Planejamento por Canal)

import { supabase } from "../../lib/supabase";

export interface ChannelScenarioData {
  percents: Record<string, number>;
  channelData: Record<string, Record<string, number>>;
}

export interface ChannelScenario {
  id: string;
  tenant_id: string;
  year: number;
  name: string;
  percents: Record<string, number>;
  channel_data: Record<string, Record<string, number>>;
  is_applied: boolean;
  saved_at: string;
  created_by: string | null;
}

// ─── Listar cenários ──────────────────────────────────────────────────────────

export async function listChannelScenarios(
  tenantId: string,
  year: number
): Promise<ChannelScenario[]> {
  const { data, error } = await supabase
    .from("channel_scenarios")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .order("saved_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ChannelScenario[];
}

// ─── Salvar cenário ───────────────────────────────────────────────────────────

export async function saveChannelScenario(
  tenantId: string,
  year: number,
  name: string,
  data: ChannelScenarioData,
  createdBy?: string
): Promise<ChannelScenario> {
  const { data: row, error } = await supabase
    .from("channel_scenarios")
    .insert({
      tenant_id: tenantId,
      year,
      name: name.trim() || `Cenário ${new Date().toLocaleDateString("pt-BR")}`,
      percents: data.percents,
      channel_data: data.channelData,
      is_applied: false,
      saved_at: new Date().toISOString(),
      created_by: createdBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return row as ChannelScenario;
}

// ─── Deletar cenário ──────────────────────────────────────────────────────────

export async function deleteChannelScenario(
  tenantId: string,
  scenarioId: string
): Promise<void> {
  const { error } = await supabase
    .from("channel_scenarios")
    .delete()
    .eq("id", scenarioId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

// ─── Aplicar cenário ──────────────────────────────────────────────────────────

export async function applyChannelScenario(
  tenantId: string,
  year: number,
  scenarioId: string
): Promise<void> {
  await supabase
    .from("channel_scenarios")
    .update({ is_applied: false })
    .eq("tenant_id", tenantId)
    .eq("year", year);

  await supabase
    .from("channel_scenarios")
    .update({ is_applied: true })
    .eq("id", scenarioId);
}

// ─── Marcar anos revisados ────────────────────────────────────────────────────
// Canal: "reviewed years" é derivado de cenários aplicados no ano

export async function getReviewedYears(tenantId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("channel_scenarios")
    .select("year")
    .eq("tenant_id", tenantId)
    .eq("is_applied", true);

  if (error) throw error;
  return [...new Set((data ?? []).map((r: { year: number }) => r.year))];
}
