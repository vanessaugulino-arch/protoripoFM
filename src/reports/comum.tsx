// ─── comum.tsx ────────────────────────────────────────────────────────────────
// Peças compartilhadas pelos relatórios dos módulos: formatação pt-BR para o
// PDF, tabela compacta (muitas colunas em A4 retrato) e divisão de colunas
// dinâmicas (ex.: uma por canal) em blocos que cabem na largura da folha.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)

export const brl = (v: number | null | undefined, casas = 0) =>
  !ok(v) ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
export const pct = (v: number | null | undefined, casas = 1) =>
  !ok(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
export const pctSinal = (v: number | null | undefined, casas = 1) =>
  !ok(v) ? '—' : `${v > 0 ? '+' : ''}${pct(v, casas)}`
export const brlSinal = (v: number | null | undefined) =>
  !ok(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${brl(Math.abs(v))}`
export const int = (v: number | null | undefined) => (!ok(v) ? '—' : Math.round(v).toLocaleString('pt-BR'))
export const dec2 = (v: number | null | undefined) =>
  !ok(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const mult = (v: number | null | undefined) => (!ok(v) ? '—' : `${dec2(v)}×`)
export const dias = (v: number | null | undefined) =>
  v === Infinity ? '∞' : !ok(v) ? '—' : `${Math.round(v).toLocaleString('pt-BR')} d`

/** Variação percentual de `atual` sobre `base` (null sem base). */
export const variacaoPct = (atual: number, base: number): number | null => (base > 0 ? ((atual - base) / base) * 100 : null)

/** Divide uma lista em blocos de até `tamanho` itens (colunas dinâmicas por tabela). */
export function emBlocos<T>(itens: T[], tamanho: number): T[][] {
  if (itens.length === 0) return [[]]
  const out: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho))
  return out
}

const cssCompacta = `
.relatorio-a4 .compacta table { font-size: 7.5pt; }
.relatorio-a4 .compacta th { font-size: 6.3pt; letter-spacing: .04em; padding: 1.6mm 1.1mm; }
.relatorio-a4 .compacta td { padding: 1.3mm 1.1mm; }
.relatorio-a4 .subtitulo { font: 600 9.5pt system-ui, sans-serif; margin: 4mm 0 1.5mm; }
.relatorio-a4 .bloco-tabela + .bloco-tabela { margin-top: 4mm; }
`

/** Estilo extra para tabelas largas (até ~10 colunas em A4 retrato). */
export function EstiloCompacto() {
  return <style>{cssCompacta}</style>
}

/** Envolve uma tabela com fonte menor e espaçamento justo. */
export function Compacta({ children }: { children: ReactNode }) {
  return <div className="compacta bloco-tabela">{children}</div>
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return <div className="subtitulo">{children}</div>
}
