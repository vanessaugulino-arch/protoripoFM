// src/services/supabase/colorBankService.ts
// Banco Global de Cores — dicionário compartilhado da plataforma.
//
// Arquitetura:
//   color_bank (global, sem RLS por tenant)  — dicionário cor_display → família + intensidade
//   products.color_group (por tenant)        — campo propagado após classificação
//
// Qualquer cliente que cadastra ou classifica uma cor alimenta o banco global.

import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorBankEntry {
  id:          string
  cor_norm:    string     // chave: lowercase sem acento
  cor_display: string     // nome original: ex "Azul Royal", "Marinho"
  familia:     string     // ex: "Azul", "Vermelho"
  intensidade: string     // ex: "Royal", "Marinho", "Claro"
}

export interface ColorBankGroup {
  familia:     string
  totalCores:  number
  intensidades: {
    intensidade: string
    cores:       ColorBankEntry[]
  }[]
}

export interface ClassifyPayload {
  cor_norm:    string
  cor_display: string
  familia:     string
  intensidade: string
}

// ─── Normalização ─────────────────────────────────────────────────────────────
export function normalizeCor(cor: string): string {
  return cor.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function getColorBank(): Promise<ColorBankEntry[]> {
  const { data, error } = await supabase
    .from('color_bank')
    .select('id, cor_norm, cor_display, familia, intensidade')
    .order('familia')
    .order('intensidade')
    .order('cor_display')
  if (error) throw error
  return (data ?? []) as ColorBankEntry[]
}

/** Banco agrupado por família → intensidade → cores */
export async function getColorBankGrouped(): Promise<ColorBankGroup[]> {
  const entries = await getColorBank()

  const famMap = new Map<string, Map<string, ColorBankEntry[]>>()
  for (const entry of entries) {
    if (!famMap.has(entry.familia)) famMap.set(entry.familia, new Map())
    const intMap = famMap.get(entry.familia)!
    if (!intMap.has(entry.intensidade)) intMap.set(entry.intensidade, [])
    intMap.get(entry.intensidade)!.push(entry)
  }

  return Array.from(famMap.entries())
    .map(([familia, intMap]) => ({
      familia,
      totalCores: [...intMap.values()].reduce((s, arr) => s + arr.length, 0),
      intensidades: Array.from(intMap.entries())
        .map(([intensidade, cores]) => ({ intensidade, cores }))
        .sort((a, b) => a.intensidade.localeCompare(b.intensidade, 'pt')),
    }))
    .sort((a, b) => a.familia.localeCompare(b.familia, 'pt'))
}

export async function getColorFamilias(): Promise<string[]> {
  const { data, error } = await supabase
    .from('color_bank')
    .select('familia')
    .order('familia')
  if (error) throw error
  return [...new Set((data ?? []).map(r => r.familia).filter(Boolean))]
}

export async function getColorIntensidades(familia?: string): Promise<string[]> {
  let q = supabase.from('color_bank').select('intensidade').order('intensidade')
  if (familia) q = q.eq('familia', familia)
  const { data, error } = await q
  if (error) throw error
  return [...new Set((data ?? []).map(r => r.intensidade).filter(Boolean))]
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

/** Adiciona ou atualiza uma cor no banco global (sem propagação para produtos) */
export async function addToColorBank(entry: {
  cor_display: string
  familia:     string
  intensidade: string
}): Promise<void> {
  const cor_norm = normalizeCor(entry.cor_display)
  const { error } = await supabase
    .from('color_bank')
    .upsert(
      {
        cor_norm,
        cor_display: entry.cor_display.trim(),
        familia:     entry.familia.trim(),
        intensidade: entry.intensidade.trim(),
      },
      { onConflict: 'cor_norm' }
    )
  if (error) throw error
}

/** Remove uma entrada do banco global */
export async function deleteFromColorBank(id: string): Promise<void> {
  const { error } = await supabase.from('color_bank').delete().eq('id', id)
  if (error) throw error
}

// ─── Classificar + propagar para produtos do tenant ───────────────────────────
// Chama a função SQL que faz upsert no banco global E atualiza products.color_group

export async function classifyColors(
  tenantId: string,
  entries: ClassifyPayload[]
): Promise<{ classified: number; errors: string[] }> {
  const errors: string[] = []
  let classified = 0

  for (const entry of entries) {
    if (!entry.familia.trim() || !entry.intensidade.trim()) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('classify_color', {
      p_cor_norm:    entry.cor_norm,
      p_cor_display: entry.cor_display,
      p_familia:     entry.familia.trim(),
      p_intensidade: entry.intensidade.trim(),
      p_tenant_id:   tenantId,
    })
    if (error) errors.push(`${entry.cor_display}: ${error.message}`)
    else classified++
  }

  return { classified, errors }
}
