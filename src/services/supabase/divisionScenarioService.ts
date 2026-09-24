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
  /** Linhagem M3→M4: planning_scenarios.id (Sazonalidade) usado para semear este cenário. */
  source_month_scenario_id: string | null;
}

// ─── Quebra por divisão de um ano fiscal (painel informativo M2/M3) ──────────
// M2 (Canal) e M3 (Sazonalidade) não armazenam divisão nenhuma — só canal e
// canal×mês. Isso mostra, de forma só-leitura, como a receita do ano se
// divide por divisão real do M4 (uma ou duas temporadas, Verão/Inverno) —
// uma estimativa proporcional (mesma divisão aplicada a qualquer canal/mês),
// não um cruzamento real canal×divisão (que não existe em lugar nenhum hoje).

export interface DivisionParticipationBySeason {
  seasonId: string;
  seasonName: string;
  /** divisionId -> % de participação (0-100) aplicada no M4 para esta temporada. */
  participations: Record<string, number>;
}

export async function getAppliedDivisionParticipationForYear(
  tenantId: string,
  year: number,
): Promise<DivisionParticipationBySeason[]> {
  const db = supabase as any;
  const { data, error } = await db
    .from("division_scenarios")
    .select("season_id, divisions")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .eq("is_applied", true);

  if (error || !data || data.length === 0) return [];

  // Sem FK declarada entre division_scenarios.season_id e seasons.id — o
  // PostgREST não resolve um embed automático aqui, por isso 2 consultas
  // separadas + join no cliente, em vez de seasons(name).
  const seasonIds = (data as any[]).map(r => r.season_id as string);
  const { data: seasonsRows } = await db
    .from("seasons")
    .select("id, name")
    .in("id", seasonIds);
  const nameById = new Map<string, string>((seasonsRows ?? []).map((s: any) => [s.id, s.name as string]));

  return (data as any[]).map(row => {
    const divisions = (row.divisions ?? {}) as Record<string, { participation?: number }>;
    const participations: Record<string, number> = {};
    for (const [divId, block] of Object.entries(divisions)) {
      participations[divId] = block?.participation ?? 0;
    }
    return {
      seasonId: row.season_id as string,
      seasonName: nameById.get(row.season_id as string) ?? row.season_id,
      participations,
    };
  });
}

// ─── Anos com cenário de divisão aplicado (para desbloqueio do M5) ────────────
// Usado pelo Dashboard: M5 só libera para o ANO cujo M3 foi de fato aplicado —
// sem isso, um M3 aplicado num ciclo antigo "vazava" e liberava M5 para sempre,
// em qualquer ciclo/ano seguinte, mesmo sem M3 aplicado ali.

export async function getM3AppliedYears(tenantId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("division_scenarios")
    .select("year")
    .eq("tenant_id", tenantId)
    .eq("is_applied", true);

  if (error) throw error;
  return [...new Set((data ?? []).map((r: { year: number }) => r.year))];
}

// ─── Temporadas com Divisão aplicada (para o M5 — Plano de Coleção) ───────────
// O Plano de Coleção só faz sentido para uma temporada cuja Divisão (M4) já
// tenha um cenário aplicado — é de lá que vem o volume-teto de peças por
// divisão que o usuário distribui em coleções/drops.

export async function getAppliedDivisionSeasonIds(tenantId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("division_scenarios")
    .select("season_id")
    .eq("tenant_id", tenantId)
    .eq("is_applied", true);

  if (error) throw error;
  return new Set((data ?? []).map((r: { season_id: string }) => r.season_id));
}

/** Cenário de Divisão aplicado de uma temporada específica (undefined se nenhum). */
export async function getAppliedDivisionScenario(
  tenantId: string,
  seasonId: string,
): Promise<DivisionScenarioRow | undefined> {
  const { data, error } = await supabase
    .from("division_scenarios")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("is_applied", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as DivisionScenarioRow | null) ?? undefined;
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

/**
 * @param sourceMonthScenarioId Linhagem M3→M4: planning_scenarios.id (Sazonalidade
 * aplicada) usado para derivar a meta de receita/participação sugerida quando
 * este cenário de Divisão foi criado.
 */
export async function saveDivisionScenario(
  tenantId: string,
  seasonId: string,
  year: number,
  name: string,
  description: string | null,
  divisions: Record<string, unknown>,
  consolidated: Record<string, unknown>,
  createdBy?: string,
  sourceMonthScenarioId?: string | null,
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
      source_month_scenario_id: sourceMonthScenarioId ?? null,
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
