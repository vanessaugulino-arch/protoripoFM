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
    id:                  row.id as string,
    nome:                row.name as string,
    mesInicio:           row.month_start as string,
    mesFim:              row.month_end as string,
    criadaEm:            row.created_at as string,
    anoFiscal:           row.fiscal_year ?? undefined,
    autoGerada:          row.auto_generated ?? false,
    tipo:                row.tipo as "verao" | "inverno" | undefined,
    canalPeriodsUnified: row.canal_periods_unified ?? true,
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
  tenantId:            string,
  nome:                string,
  mesInicio:           string,
  mesFim:              string,
  anoFiscal?:          number,
  autoGerada           = false,
  tipo?:               "verao" | "inverno",
  canalPeriodsUnified  = true,
): Promise<Temporada> {
  const { data, error } = await db
    .from("seasons")
    .insert({
      tenant_id:             tenantId,
      name:                  nome,
      month_start:           mesInicio,
      month_end:             mesFim,
      fiscal_year:           anoFiscal ?? null,
      auto_generated:        autoGerada,
      tipo:                  tipo ?? null,
      canal_periods_unified: canalPeriodsUnified,
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

  // canal_periods_unified: se as duas linhas concordam, usa o valor; senão true
  const unifiedV = verao?.canal_periods_unified ?? true;
  const unifiedI = inverno?.canal_periods_unified ?? true;

  return {
    verao:   verao
      ? { mesInicio: verao.month_start,   mesFim: verao.month_end   }
      : DEFAULT_REGRA.verao,
    inverno: inverno
      ? { mesInicio: inverno.month_start, mesFim: inverno.month_end }
      : DEFAULT_REGRA.inverno,
    canalPeriodsUnified: unifiedV && unifiedI,
  };
}

export async function saveRegraDefaultDb(
  tenantId: string,
  regra:    TemporadaRegraDefault,
): Promise<void> {
  const unified = regra.canalPeriodsUnified ?? true;
  const rows = [
    {
      tenant_id:             tenantId,
      tipo:                  "verao",
      month_start:           regra.verao.mesInicio,
      month_end:             regra.verao.mesFim,
      canal_periods_unified: unified,
      updated_at:            new Date().toISOString(),
    },
    {
      tenant_id:             tenantId,
      tipo:                  "inverno",
      month_start:           regra.inverno.mesInicio,
      month_end:             regra.inverno.mesFim,
      canal_periods_unified: unified,
      updated_at:            new Date().toISOString(),
    },
  ];

  const { error } = await db
    .from("season_default_rules")
    .upsert(rows, { onConflict: "tenant_id,tipo" });

  if (error) throw error;
}

// ─── Canal × Temporada Config ─────────────────────────────────────────────────

export interface CanalConfig {
  id:         string;
  canal_id:   string;
  mes_inicio: string;
  /** Fim do período de vendas deste canal. null = usa mesFim da temporada. */
  mes_fim:    string | null;
}

/** Carrega todos os canal_temporada_config do tenant de uma só vez (para exibição inline na tabela). */
export async function listAllCanalConfigsDb(
  tenantId: string,
): Promise<(CanalConfig & { season_id: string })[]> {
  const { data, error } = await db
    .from("canal_temporada_config")
    .select("id, canal_id, season_id, mes_inicio, mes_fim")
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return (data ?? []) as (CanalConfig & { season_id: string })[];
}

export async function listCanalConfigDb(
  tenantId: string,
  seasonId: string,
): Promise<CanalConfig[]> {
  const { data, error } = await db
    .from("canal_temporada_config")
    .select("id, canal_id, mes_inicio, mes_fim")
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
  mesFim?:   string | null,
): Promise<void> {
  const { error } = await db
    .from("canal_temporada_config")
    .upsert(
      {
        tenant_id:  tenantId,
        season_id:  seasonId,
        canal_id:   canalId,
        mes_inicio: mesInicio,
        mes_fim:    mesFim ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,season_id,canal_id" },
    );
  if (error) throw error;
}

// ─── Canal Regra Default (período de venda por canal — nível regra) ───────────

export interface CanalRegraDefault {
  id:         string;
  canal_id:   string;
  tipo:       "verao" | "inverno";
  mes_inicio: string;
  mes_fim:    string;
}

export async function listCanalRegraDefaultDb(tenantId: string): Promise<CanalRegraDefault[]> {
  const { data, error } = await db
    .from("canal_regra_default")
    .select("id, canal_id, tipo, mes_inicio, mes_fim")
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return (data ?? []) as CanalRegraDefault[];
}

export async function upsertCanalRegraDefaultDb(
  tenantId:  string,
  canalId:   string,
  tipo:      "verao" | "inverno",
  mesInicio: string,
  mesFim:    string,
): Promise<void> {
  const { error } = await db
    .from("canal_regra_default")
    .upsert(
      { tenant_id: tenantId, canal_id: canalId, tipo, mes_inicio: mesInicio, mes_fim: mesFim, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,canal_id,tipo" },
    );
  if (error) throw error;
}

export async function deleteCanalRegraDefaultDb(
  tenantId: string,
  canalId:  string,
  tipo:     "verao" | "inverno",
): Promise<void> {
  const { error } = await db
    .from("canal_regra_default")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("canal_id", canalId)
    .eq("tipo", tipo);
  if (error) throw error;
}

/** Atualiza apenas o flag canal_periods_unified de uma temporada. */
export async function updateSeasonCanalUnifiedDb(
  id:      string,
  unified: boolean,
): Promise<void> {
  const { error } = await db
    .from("seasons")
    .update({ canal_periods_unified: unified })
    .eq("id", id);
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

  // 3. Obtém os períodos de venda por canal definidos na regra padrão
  const canalRegras = await listCanalRegraDefaultDb(tenantId);
  const unified     = canalRegras.length === 0;

  // 4. Insere Verão e Inverno — herda canal_periods_unified derivado das regras
  const { data: inserted, error } = await db.from("seasons").insert([
    {
      tenant_id:             tenantId,
      name:                  `Verão ${anoFiscal}`,
      month_start:           regra.verao.mesInicio,
      month_end:             regra.verao.mesFim,
      fiscal_year:           anoFiscal,
      auto_generated:        true,
      tipo:                  "verao",
      canal_periods_unified: unified,
    },
    {
      tenant_id:             tenantId,
      name:                  `Inverno ${anoFiscal}`,
      month_start:           regra.inverno.mesInicio,
      month_end:             regra.inverno.mesFim,
      fiscal_year:           anoFiscal,
      auto_generated:        true,
      tipo:                  "inverno",
      canal_periods_unified: unified,
    },
  ]).select("id, tipo");

  if (error) throw error;

  // 5. Propaga canal_regra_default → canal_temporada_config para cada nova instância
  //    Filtra por tipo para que Verão só herde regras de verao, Inverno só de inverno
  const insertedSeasons = inserted as { id: string; tipo: string }[];
  if (canalRegras.length > 0 && insertedSeasons.length > 0) {
    const configRows = insertedSeasons.flatMap(season => {
      const regrasDoTipo = canalRegras.filter(r => r.tipo === (season.tipo ?? "verao"));
      return regrasDoTipo.map(r => ({
        tenant_id:  tenantId,
        season_id:  season.id,
        canal_id:   r.canal_id,
        mes_inicio: r.mes_inicio,
        mes_fim:    r.mes_fim,
        updated_at: new Date().toISOString(),
      }));
    });
    // fire-and-forget; erros não bloqueiam a geração da temporada
    db.from("canal_temporada_config").upsert(configRows, { onConflict: "tenant_id,season_id,canal_id" })
      .then(({ error: e }: { error: any }) => {
        if (e) console.warn("[autoGenerate] Erro ao propagar canal configs:", e);
      });
  }
}
