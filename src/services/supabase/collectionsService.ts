// src/services/supabase/collectionsService.ts
// Gerencia coleções/drops no Supabase (antes em localStorage como fashionmind_colecoes).
//
// Regras:
//   - Coleção vinculada a uma temporada (season_id).
//   - Datas devem estar dentro do intervalo de meses da temporada (validado no frontend).
//   - Coleção não pode ser excluída se tiver produtos vinculados (verificação no caller).
//
// Colunas reais na tabela `collections`:
//   id, tenant_id, season_id, name, start_date, end_date, lead_time_days, created_at, updated_at

import { supabase } from '../../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ColecaoRow {
  id:         string   // uuid
  tenant_id:  string
  season_id:  string
  name:       string   // nome da coleção
  start_date: string   // YYYY-MM-DD
  end_date:   string   // YYYY-MM-DD
  created_at: string
  updated_at: string
}

export interface ColecaoInsert {
  tenant_id:  string
  season_id:  string
  name:       string
  start_date: string
  end_date:   string
}

export interface ColecaoUpdate {
  name?:       string
  start_date?: string
  end_date?:   string
}

// ─── Listar ───────────────────────────────────────────────────────────────────

export async function listColecoes(tenantId: string): Promise<ColecaoRow[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as ColecaoRow[]
}

export async function listColecoesBySeason(
  tenantId: string,
  seasonId: string
): Promise<ColecaoRow[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('season_id', seasonId)
    .order('start_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as ColecaoRow[]
}

// ─── Inserir ──────────────────────────────────────────────────────────────────

export async function insertColecao(payload: ColecaoInsert): Promise<ColecaoRow> {
  const { data, error } = await supabase
    .from('collections')
    .insert({
      tenant_id:  payload.tenant_id,
      season_id:  payload.season_id,
      name:       payload.name.trim(),
      start_date: payload.start_date,
      end_date:   payload.end_date,
    })
    .select()
    .single()

  if (error) throw error
  return data as ColecaoRow
}

// ─── Atualizar ────────────────────────────────────────────────────────────────

export async function updateColecao(
  tenantId: string,
  colecaoId: string,
  updates: ColecaoUpdate
): Promise<ColecaoRow> {
  const { data, error } = await supabase
    .from('collections')
    .update({ ...updates })
    .eq('id', colecaoId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as ColecaoRow
}

// ─── Excluir ──────────────────────────────────────────────────────────────────

export async function deleteColecao(
  tenantId: string,
  colecaoId: string
): Promise<void> {
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', colecaoId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

// ─── Excluir todas de uma temporada ──────────────────────────────────────────
// Usado quando a temporada é excluída junto com suas coleções.

export async function deleteColecoesBySeason(
  tenantId: string,
  seasonId: string
): Promise<void> {
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('season_id', seasonId)

  if (error) throw error
}
