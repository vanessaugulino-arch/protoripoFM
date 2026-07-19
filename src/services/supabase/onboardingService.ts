// ─── onboardingService.ts ──────────────────────────────────────────────────────
// Persistência do perfil de onboarding no Supabase (tabela onboarding_profiles).
//
// A tabela é isOneToOne com tenants — existe no máximo 1 linha por tenant.
// Usada para:
//   1. Salvar a configuração completa ao finalizar o onboarding
//   2. Detectar se o tenant já foi configurado (substitui query a season_default_rules)
//   3. Hidratar o perfil localStorage quando o cache local é perdido
//
// Padrão de acesso: `supabase as any` (campos adicionados após geração dos tipos)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'
import type {
  OnboardingProfile,
  SegmentId,
  SalesChannelId,
  RawMaterialGroupId,
  OrigemPecas,
} from '../../app/types/onboarding'
import { ONBOARDING_PROFILE_KEY } from '../../app/types/onboarding'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Salvar/atualizar perfil completo no DB ────────────────────────────────────
export async function saveOnboardingProfileDb(
  tenantId: string,
  profile:  OnboardingProfile,
): Promise<void> {
  const row = {
    tenant_id:            tenantId,
    segments:             profile.segments,
    sales_channels:       profile.salesChannels,
    origem_pecas:         profile.origem,
    raw_materials:        profile.rawMaterials,
    product_hierarchy:    profile.productHierarchy ?? [],
    has_imported_material: profile.hasImportedMaterial,
    exports:              profile.exports,
    completed_at:         profile.completedAt,
    updated_at:           new Date().toISOString(),
  }

  const { error } = await db
    .from('onboarding_profiles')
    .upsert(row, { onConflict: 'tenant_id' })

  if (error) throw error
}

// ── Verificar se o tenant já completou o onboarding ──────────────────────────
export async function isOnboardingCompleteDb(tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from('onboarding_profiles')
    .select('id, completed_at')
    .eq('tenant_id', tenantId)
    .limit(1)

  if (error) return false
  return Array.isArray(data) && data.length > 0 && data[0].completed_at !== null
}

// ── Carregar perfil do DB e hidratar o cache local ───────────────────────────
export async function loadOnboardingProfileFromDb(
  tenantId: string,
): Promise<OnboardingProfile | null> {
  const { data, error } = await db
    .from('onboarding_profiles')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .single()

  if (error || !data) return null

  const profile: OnboardingProfile = {
    segments:             (data.segments ?? []) as SegmentId[],
    salesChannels:        (data.sales_channels ?? []) as SalesChannelId[],
    origem:               (data.origem_pecas ?? 'propria') as OrigemPecas,
    rawMaterials:         (data.raw_materials ?? []) as RawMaterialGroupId[],
    productHierarchy:     (data.product_hierarchy ?? []) as string[],
    hasImportedMaterial:  data.has_imported_material ?? false,
    exports:              data.exports ?? false,
    completedAt:          data.completed_at ?? new Date().toISOString(),
    dataImportChoice:     'deferred', // não armazenado no DB, padrão seguro
  }

  // Hidrata localStorage para que consumidores síncronos (Planning, ChannelPlanning) funcionem
  try {
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))
    localStorage.setItem('fashionmind_onboarding_complete', 'true')
  } catch { /* em ambientes sem localStorage (SSR/testes) ignora */ }

  return profile
}

// ── Verificar configuração existente (ordem: localStorage → DB) ───────────────
// Retorna true se o tenant já foi configurado em qualquer dos dois lugares.
export async function checkConfigExists(tenantId: string): Promise<boolean> {
  // 1. Cache local rápido
  try {
    const done = localStorage.getItem('fashionmind_onboarding_complete')
    if (done === 'true') return true
  } catch { /* sem acesso ao localStorage */ }

  // 2. Fallback para o DB
  if (!tenantId) return false
  return isOnboardingCompleteDb(tenantId)
}
