// ─── seasonService.ts ─────────────────────────────────────────────────────────
// Persistência de Temporadas e Regras Padrão via Supabase.
// Consumido por: temporadaService.ts (wrapper), OperationSettings, PlanningSetup, Onboarding.
// Nota: as colunas fiscal_year, auto_generated e tipo foram adicionadas à tabela
// seasons após a geração do database.types.ts. Usamos `db = supabase as any` até
// que os tipos sejam regenerados via `supabase gen types typescript`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../../lib/supabase";
import {
  DEFAULT_REGRA,
  type Temporada,
  type TemporadaRegraDefault,
} from "../temporadaService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Mapeamento DB → interface ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTemporada(row: any): Temporada {
  return {
    id:         row.id as string,
    nome:       row.name as string,
    mesInicio:  row.month_start as string,
    mesFim:     row.month_end as string,
    criadaEm:  row.created_at as string,
    anoFiscal:  row.fiscal_year ?? undefined,
    autoGerada: row.auto_generated ?? false,
    tipo:       row.tipo as "verao" | "inverno" | undefined,
  };
}

// ─── Seasons CRUD ─────────────────────────────────────────────────────────────

export async function listSeasonsDb(tenantId: string): Promise<Temporada[]> {
  const { data, error } = await db
    .from("seasons")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("fiscal_year", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToTemporada);
}

export async function insertSeasonDb(
  tenantId:   string,
  nome:       string,
  mesInicio:  string,
  mesFim:     string,
  anoFiscal?: number,
  autoGerada  = false,
  tipo?:      "verao" | "inverno",
): Promise<Temporada> {
  const { data, error } = await db
    .from("seasons")
    .insert({
      tenant_id:      tenantId,
      name:           nome,
      month_start:    mesInicio,
      month_end:      mesFim,
      fiscal_year:    anoFiscal ?? null,
      auto_generated: autoGerada,
      tipo:           tipo ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToTemporada(data);
}

export async function updateSeasonDb(
  id:        string,
  nome:      string,
  mesInicio: string,
  mesFim:    string,
): Promise<void> {
  const { error } = await db
    .from("seasons")
    .update({ name: nome, month_start: mesInicio, month_end: mesFim })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteSeasonDb(id: string): Promise<void> {
  const { error } = await db
    .from("seasons")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ─── Season Default Rules ─────────────────────────────────────────────────────

export async function getRegraDefaultDb(
  tenantId: string,
): Promise<TemporadaRegraDefault> {
  const { data } = await db
    .from("season_default_rules")
    .select("*")
    .eq("tenant_id", tenantId);

  if (!data || data.length === 0) return DEFAULT_REGRA;

  const verao   = data.find((r: any) => r.tipo === "verao");
  const inverno = data.find((r: any) => r.tipo === "inverno");

  return {
    verao:   verao
      ? { mesInicio: verao.month_start,   mesFim: verao.month_end   }
      : DEFAULT_REGRA.verao,
    inverno: inverno
      ? { mesInicio: inverno.month_start, mesFim: inverno.month_end }
      : DEFAULT_REGRA.inverno,
  };
}

export async function saveRegraDefaultDb(
  tenantId: string,
  regra:    TemporadaRegraDefault,
): Promise<void> {
  const rows = [
    {
      tenant_id:   tenantId,
      tipo:        "verao",
      month_start: regra.verao.mesInicio,
      month_end:   regra.verao.mesFim,
      updated_at:  new Date().toISOString(),
    },
    {
      tenant_id:   tenantId,
      tipo:        "inverno",
      month_start: regra.inverno.mesInicio,
      month_end:   regra.inverno.mesFim,
      updated_at:  new Date().toISOString(),
    },
  ];

  const { error } = await db
    .from("season_default_rules")
    .upsert(rows, { onConflict: "tenant_id,tipo" });

  if (error) throw error;
}

// ─── Canal × Temporada Config (Phase F) ──────────────────────────────────────

export interface CanalConfig {
  id:         string;
  canal_id:   string;
  mes_inicio: string;
}

export async function listCanalConfigDb(
  tenantId: string,
  seasonId: string,
): Promise<CanalConfig[]> {
  const { data, error } = await db
    .from("canal_temporada_config")
    .select("id, canal_id, mes_inicio")
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId);
  if (error) throw error;
  return (data ?? []) as CanalConfig[];
}

export async function upsertCanalConfigDb(
  tenantId:  string,
  seasonId:  string,
  canalId:   string,
  mesInicio: string,
): Promise<void> {
  const { error } = await db
    .from("canal_temporada_config")
    .upsert(
      {
        tenant_id:  tenantId,
        season_id:  seasonId,
        canal_id:   canalId,
        mes_inicio: mesInicio,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,season_id,canal_id" },
    );
  if (error) throw error;
}

export async function deleteCanalConfigDb(
  tenantId: string,
  seasonId: string,
  canalId:  string,
): Promise<void> {
  const { error } = await db
    .from("canal_temporada_config")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("season_id", seasonId)
    .eq("canal_id", canalId);
  if (error) throw error;
}

// ─── Auto-geração idempotente ─────────────────────────────────────────────────

/**
 * Cria as 2 temporadas padrão (Verão + Inverno) para o ano fiscal,
 * caso ainda não existam. Chamado após salvar um Planejamento Estratégico.
 */
export async function autoGenerateForYearDb(
  tenantId:  string,
  anoFiscal: number,
): Promise<void> {
  // 1. Verifica idempotência
  const { data: existing } = await db
    .from("seasons")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("fiscal_year", anoFiscal)
    .eq("auto_generated", true);

  if (existing && existing.length > 0) return; // já geradas

  // 2. Obtém regra padrão do tenant
  const regra = await getRegraDefaultDb(tenantId);

  // 3. Insere Verão e Inverno
  const { error } = await db.from("seasons").insert([
    {
      tenant_id:      tenantId,
      name:           `Verão ${anoFiscal}`,
      month_start:    regra.verao.mesInicio,
      month_end:      regra.verao.mesFim,
      fiscal_year:    anoFiscal,
      auto_generated: true,
      tipo:           "verao",
    },
    {
      tenant_id:      tenantId,
      name:           `Inverno ${anoFiscal}`,
      month_start:    regra.inverno.mesInicio,
      month_end:      regra.inverno.mesFim,
      fiscal_year:    anoFiscal,
      auto_generated: true,
      tipo:           "inverno",
    },
  ]);

  if (error) throw error;
}
