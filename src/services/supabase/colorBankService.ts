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

// ─── Enriquecimento automático pós-import ─────────────────────────────────────
// Lê o color_bank e cruza com os produtos do tenant que têm `color` preenchido.
// Para cada cor que tiver correspondência no banco, escreve `color_group` no produto.
// Cores sem correspondência são retornadas em `unmatched` para classificação manual.

export interface EnrichResult {
  enriched:  number      // total de SKUs que receberam color_group
  unmatched: string[]    // cores brutas sem match no banco global
}

export async function enrichProductColors(tenantId: string): Promise<EnrichResult> {
  // 1. Banco de cores completo → Map cor_norm → color_group
  const bank = await getColorBank()
  if (bank.length === 0) return { enriched: 0, unmatched: [] }

  const bankMap = new Map<string, string>()
  for (const entry of bank) {
    bankMap.set(entry.cor_norm, `${entry.familia} ${entry.intensidade}`)
  }

  // 2. Produtos do tenant com color preenchido
  const { data: products, error } = await supabase
    .from('products')
    .select('id, color')
    .eq('tenant_id', tenantId)
    .not('color', 'is', null)

  if (error || !products?.length) return { enriched: 0, unmatched: [] }

  // 3. Particiona por cor: matched (cor → color_group) e unmatched
  const matchedColors  = new Map<string, string>()   // originalColor → color_group
  const unmatchedSet   = new Set<string>()

  for (const p of products) {
    const raw = ((p as any).color as string).trim()
    if (matchedColors.has(raw) || unmatchedSet.has(raw)) continue
    const norm = normalizeCor(raw)
    const cg   = bankMap.get(norm)
    if (cg) matchedColors.set(raw, cg)
    else    unmatchedSet.add(raw)
  }

  // 4. Atualiza em batch (uma query por cor distinta para aproveitar índice)
  //    Escreve color_group (combinado), color_family e color_intensity separados
  const bankFull = new Map<string, { familia: string; intensidade: string }>()
  for (const entry of bank) {
    bankFull.set(entry.cor_norm, { familia: entry.familia, intensidade: entry.intensidade })
  }

  let enriched = 0
  for (const [originalColor, colorGroup] of matchedColors.entries()) {
    const norm   = normalizeCor(originalColor)
    const detail = bankFull.get(norm)
    const { error: upErr } = await (supabase as any)
      .from('products')
      .update({
        color_group:     colorGroup,
        color_family:    detail?.familia    ?? null,
        color_intensity: detail?.intensidade ?? null,
        updated_at:      new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('color', originalColor)
    if (!upErr) {
      enriched += products.filter(
        p => ((p as any).color as string).trim() === originalColor
      ).length
    }
  }

  return { enriched, unmatched: [...unmatchedSet] }
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
