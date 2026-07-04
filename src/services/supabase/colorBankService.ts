// src/services/supabase/colorBankService.ts
// Banco de Cores Global — mapeamento cor bruta → família + intensidade
//
// Arquitetura:
//   color_bank (global, sem RLS por tenant) — dicionário compartilhado
//   products.color_group (por tenant)       — rótulo derivado usado em análises
//
// Fluxo:
//   1. Busca cores únicas dos produtos do tenant que não têm color_group
//   2. Cruza com color_bank global para identificar as não classificadas
//   3. Usuário classifica → classify_color() salva e propaga

import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ColorBankEntry {
  id:          string
  cor_norm:    string
  cor_display: string
  familia:     string
  intensidade: string
  color_group: string  // generated column: familia + ' ' + intensidade
}

export interface UnclassifiedColor {
  cor_bruta:    string   // raw, as stored in products.color
  cor_norm:     string   // lower(trim(cor_bruta))
  count:        number   // quantos produtos do tenant têm essa cor
  already_in_bank: boolean  // existe no banco global mas sem color_group no produto
  existing_entry?: ColorBankEntry  // se já existe no banco global
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
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos p/ lookup
    .replace(/\s+/g, ' ')
}

// ─── 1. Cores únicas dos produtos do tenant ────────────────────────────────────
export async function getProductColors(tenantId: string): Promise<
  { cor_bruta: string; cor_norm: string; count: number }[]
> {
  const { data, error } = await supabase
    .from('products')
    .select('color')
    .eq('tenant_id', tenantId)
    .not('color', 'is', null)

  if (error) throw error

  // Agrupa por cor normalizada (case-insensitive)
  const map = new Map<string, { cor_bruta: string; count: number }>()
  for (const row of data ?? []) {
    if (!row.color) continue
    const norm = normalizeCor(row.color)
    if (!map.has(norm)) {
      map.set(norm, { cor_bruta: row.color, count: 0 })
    }
    map.get(norm)!.count++
  }

  return Array.from(map.entries()).map(([norm, v]) => ({
    cor_norm:  norm,
    cor_bruta: v.cor_bruta,
    count:     v.count,
  }))
}

// ─── 2. Entradas do banco global ──────────────────────────────────────────────
export async function getColorBank(): Promise<ColorBankEntry[]> {
  const { data, error } = await supabase
    .from('color_bank')
    .select('id, cor_norm, cor_display, familia, intensidade, color_group')
    .order('familia', { ascending: true })
    .order('intensidade', { ascending: true })

  if (error) throw error
  return (data ?? []) as ColorBankEntry[]
}

// ─── 3. Famílias e intensidades únicas do banco ───────────────────────────────
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

// ─── 4. Cores não classificadas do tenant ────────────────────────────────────
// Retorna cores do tenant que NÃO têm color_group no produto.
// Cruza com o banco global para mostrar se já existe classificação disponível.
export async function getUnclassifiedColors(tenantId: string): Promise<UnclassifiedColor[]> {
  const [productColors, bankEntries] = await Promise.all([
    getProductColors(tenantId),
    getColorBank(),
  ])

  const bankMap = new Map(bankEntries.map(e => [e.cor_norm, e]))

  // Busca produtos SEM color_group para saber quais cores ainda precisam classificação
  const { data: unclassifiedRows, error } = await supabase
    .from('products')
    .select('color')
    .eq('tenant_id', tenantId)
    .is('color_group', null)
    .not('color', 'is', null)

  if (error) throw error

  const unclassifiedNorms = new Set(
    (unclassifiedRows ?? []).map(r => normalizeCor(r.color ?? ''))
  )

  return productColors
    .filter(pc => unclassifiedNorms.has(pc.cor_norm))
    .map(pc => {
      const entry = bankMap.get(pc.cor_norm)
      return {
        cor_bruta:        pc.cor_bruta,
        cor_norm:         pc.cor_norm,
        count:            pc.count,
        already_in_bank:  !!entry,
        existing_entry:   entry,
      }
    })
    .sort((a, b) => b.count - a.count) // mais frequentes primeiro
}

// ─── 5. Classificar cores (upsert + propagar) ─────────────────────────────────
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

    if (error) {
      errors.push(`${entry.cor_display}: ${error.message}`)
    } else {
      classified++
    }
  }

  return { classified, errors }
}

// ─── 6. Estatísticas do tenant ────────────────────────────────────────────────
export interface ColorBankStats {
  totalCores:         number   // total de cores distintas no tenant
  classificadas:      number   // com color_group
  naoClassificadas:   number   // sem color_group
  coberturaPct:       number   // % classificadas
}

export async function getColorBankStats(tenantId: string): Promise<ColorBankStats> {
  const { data: all, error: e1 } = await supabase
    .from('products')
    .select('color')
    .eq('tenant_id', tenantId)
    .not('color', 'is', null)

  const { data: classified, error: e2 } = await supabase
    .from('products')
    .select('color')
    .eq('tenant_id', tenantId)
    .not('color', 'is', null)
    .not('color_group', 'is', null)

  if (e1 || e2) throw e1 ?? e2

  const allNorms     = new Set((all ?? []).map(r => normalizeCor(r.color ?? '')))
  const classNorms   = new Set((classified ?? []).map(r => normalizeCor(r.color ?? '')))
  const total        = allNorms.size
  const nClass       = classNorms.size
  const nUnclass     = total - nClass

  return {
    totalCores:       total,
    classificadas:    nClass,
    naoClassificadas: nUnclass,
    coberturaPct:     total > 0 ? Math.round((nClass / total) * 100) : 0,
  }
}
