import { supabase } from "../../lib/supabase";

// ─── Onboarding Profile ───────────────────────────────────────────────────────

export interface OnboardingProfilePayload {
  segments: string[];
  rawMaterials: { id: string; rank: number }[];
  origemPecas: string | null;
  hasImportedMaterial: boolean;
  exports: boolean;
  productHierarchy: string[];
  salesChannels: string[];
  completedAt?: string;
}

export async function upsertOnboardingProfile(tenantId: string, payload: OnboardingProfilePayload) {
  const { data, error } = await supabase
    .from("onboarding_profiles")
    .upsert(
      {
        tenant_id:             tenantId,
        segments:              payload.segments,
        raw_materials:         payload.rawMaterials as never,
        origem_pecas:          payload.origemPecas,
        has_imported_material: payload.hasImportedMaterial,
        exports:               payload.exports,
        product_hierarchy:     payload.productHierarchy,
        sales_channels:        payload.salesChannels,
        completed_at:          payload.completedAt ?? new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOnboardingProfile(tenantId: string) {
  const { data, error } = await supabase
    .from("onboarding_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─── Temporadas ───────────────────────────────────────────────────────────────

export async function listSeasons(tenantId: string) {
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createSeason(tenantId: string, name: string, monthStart: string, monthEnd: string) {
  const { data, error } = await supabase
    .from("seasons")
    .insert({ tenant_id: tenantId, name, month_start: monthStart, month_end: monthEnd })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSeason(id: string) {
  const { error } = await supabase.from("seasons").delete().eq("id", id);
  if (error) throw error;
}

// ─── Coleções ─────────────────────────────────────────────────────────────────

export async function listCollections(tenantId: string, seasonId?: string) {
  let query = supabase
    .from("collections")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("start_date", { ascending: true });

  if (seasonId) query = query.eq("season_id", seasonId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function upsertCollection(
  tenantId: string,
  seasonId: string,
  name: string,
  startDate: string,
  endDate: string,
  leadTimeDays: number,
  id?: string,
) {
  const payload = { tenant_id: tenantId, season_id: seasonId, name, start_date: startDate, end_date: endDate, lead_time_days: leadTimeDays };

  if (id) {
    const { data, error } = await supabase.from("collections").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from("collections").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCollection(id: string) {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

// ─── Faixas de Preço ──────────────────────────────────────────────────────────

export async function listPriceTiers(tenantId: string) {
  const { data, error } = await supabase
    .from("price_tiers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("category");

  if (error) throw error;
  return data ?? [];
}

export async function upsertPriceTier(
  tenantId: string,
  category: string,
  division: string | null,
  tiers: { p1Min: number; p1Max: number; p2Min: number; p2Max: number; p3Min: number; p3Max: number },
) {
  const { data, error } = await supabase
    .from("price_tiers")
    .upsert(
      {
        tenant_id: tenantId, category, division,
        p1_min: tiers.p1Min, p1_max: tiers.p1Max,
        p2_min: tiers.p2Min, p2_max: tiers.p2Max,
        p3_min: tiers.p3Min, p3_max: tiers.p3Max,
      },
      { onConflict: "tenant_id,division,category" },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePriceTier(id: string) {
  const { error } = await supabase.from("price_tiers").delete().eq("id", id);
  if (error) throw error;
}

// ─── Lead Times ───────────────────────────────────────────────────────────────

export async function listLeadTimeRules(tenantId: string) {
  const { data, error } = await supabase
    .from("lead_time_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at");

  if (error) throw error;
  return data ?? [];
}

export async function createLeadTimeRule(
  tenantId: string,
  rule: {
    type: "producao" | "pedido";
    category: string;
    division?: string;
    subcategory?: string;
    riskLevel?: string;
    priceTier?: string;
    leadTime: number;
    unit: "dias" | "meses";
  },
) {
  const { data, error } = await supabase
    .from("lead_time_rules")
    .insert({
      tenant_id:  tenantId,
      type:       rule.type,
      category:   rule.category,
      division:   rule.division ?? null,
      subcategory: rule.subcategory ?? null,
      risk_level: rule.riskLevel ?? null,
      price_tier: rule.priceTier ?? null,
      lead_time:  rule.leadTime,
      unit:       rule.unit,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLeadTimeRule(id: string) {
  const { error } = await supabase.from("lead_time_rules").delete().eq("id", id);
  if (error) throw error;
}

// ─── Configurações Operacionais ───────────────────────────────────────────────

export async function upsertOperationSettings(
  tenantId: string,
  settings: {
    hierDivisaoAtiva: boolean;
    hierOrdem: string;
    subcategorias: string[];
    basicosAtivos: boolean;
    basicosTipo?: "estoque" | "novos";
    basicosSkus?: string;
  },
) {
  const { error } = await supabase
    .from("operation_settings")
    .upsert(
      {
        tenant_id:          tenantId,
        hier_divisao_ativa: settings.hierDivisaoAtiva,
        hier_ordem:         settings.hierOrdem,
        subcategorias:      settings.subcategorias,
        basicos_ativos:     settings.basicosAtivos,
        basicos_tipo:       settings.basicosTipo ?? null,
        basicos_skus:       settings.basicosSkus ?? null,
      },
      { onConflict: "tenant_id" },
    );

  if (error) throw error;
}

// ─── Importações de Planilha ──────────────────────────────────────────────────

export async function logSpreadsheetImport(
  tenantId: string,
  mode: "completa" | "hierarquia",
  fileName: string,
  columnMapping: Record<string, string>,
  userId?: string,
) {
  const { data, error } = await supabase
    .from("spreadsheet_imports")
    .insert({
      tenant_id:      tenantId,
      mode,
      file_name:      fileName,
      column_mapping: columnMapping as never,
      status:         "pending",
      created_by:     userId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listSpreadsheetImports(tenantId: string) {
  const { data, error } = await supabase
    .from("spreadsheet_imports")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
