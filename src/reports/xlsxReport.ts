// ─── xlsxReport.ts ────────────────────────────────────────────────────────────
// Kit de exportação Excel (.xlsx de verdade, não CSV) para todos os módulos.
//
// Cada aba tem título, subtítulo, cabeçalho e linhas. As colunas declaram o
// formato (moeda, %, inteiro…): o valor vai NUMÉRICO para a célula, com o
// formato aplicado — a cliente soma, filtra e faz gráfico sem limpar texto.
// Percentuais entram como número de 0 a 100 (como no app) e são gravados como
// fração com formato %, que é o que o Excel espera.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx'

// O projeto declara um tipo mínimo para 'xlsx' (src/xlsx.d.ts); os tipos de
// célula/planilha usados aqui ficam locais.
type Celula = { t: 's' | 'n'; v: string | number; z?: string }
type Planilha = Record<string, unknown>
type Livro = { Props?: Record<string, string>; SheetNames: string[]; Sheets: Record<string, Planilha> }

export type FormatoColuna = 'texto' | 'brl' | 'pct' | 'inteiro' | 'decimal2' | 'multiplo'

export interface Coluna<T> {
  titulo: string
  valor: (linha: T) => string | number | null | undefined
  formato?: FormatoColuna
  /** Formato que muda por linha (ex.: aba de indicadores com R$, % e ×). */
  formatoPorLinha?: (linha: T) => FormatoColuna
  /** Largura em caracteres. Padrão: calculada pelo conteúdo. */
  largura?: number
}

export interface Aba<T = unknown> {
  /** Nome da aba (até 31 caracteres, sem : \ / ? * [ ]). */
  nome: string
  titulo: string
  subtitulo?: string
  colunas: Coluna<T>[]
  linhas: T[]
  /** Linha de total ao final (mesmas colunas). */
  total?: T
}

export interface MetaRelatorio {
  empresa: string
  documento: string
  /** Data de geração; padrão: agora. */
  geradoEm?: Date
}

const FORMATO_EXCEL: Record<FormatoColuna, string | undefined> = {
  texto: undefined,
  brl: '"R$" #,##0.00',
  pct: '0.0%',
  inteiro: '#,##0',
  decimal2: '0.00',
  multiplo: '0.00"×"',
}

function nomeAbaValido(nome: string, usados: Set<string>): string {
  let base = nome.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Aba'
  let n = 2
  let candidato = base
  while (usados.has(candidato.toLowerCase())) {
    const suf = ` (${n++})`
    candidato = base.slice(0, 31 - suf.length) + suf
  }
  usados.add(candidato.toLowerCase())
  return candidato
}

function celula(v: string | number | null | undefined, formato: FormatoColuna = 'texto'): Celula {
  if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return { t: 's', v: '—' }
  if (typeof v === 'number' && formato !== 'texto') {
    const valor = formato === 'pct' ? v / 100 : v
    return { t: 'n', v: valor, z: FORMATO_EXCEL[formato] }
  }
  return { t: 's', v: String(v) }
}

/** Monta a planilha de uma aba (exportado para teste). */
export function montarAba<T>(aba: Aba<T>, meta: MetaRelatorio): Planilha {
  const ws: Planilha = {}
  const nCols = aba.colunas.length
  const geradoEm = (meta.geradoEm ?? new Date()).toLocaleDateString('pt-BR')
  const put = (r: number, c: number, cell: Celula) => { ws[XLSX.utils.encode_cell({ r, c })] = cell }

  put(0, 0, { t: 's', v: aba.titulo })
  put(1, 0, { t: 's', v: [meta.empresa, aba.subtitulo, `gerado em ${geradoEm}`].filter(Boolean).join(' · ') })
  const linhaCab = 3
  aba.colunas.forEach((c, i) => put(linhaCab, i, { t: 's', v: c.titulo }))

  const todas = aba.total ? [...aba.linhas, aba.total] : aba.linhas
  todas.forEach((linha, li) => {
    aba.colunas.forEach((c, ci) => put(linhaCab + 1 + li, ci, celula(c.valor(linha), c.formatoPorLinha?.(linha) ?? c.formato)))
  })

  const ultimaLinha = linhaCab + todas.length
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(ultimaLinha, 1), c: Math.max(nCols - 1, 0) } })
  ws['!merges'] = nCols > 1
    ? [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } }]
    : []
  if (aba.linhas.length > 0) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: linhaCab, c: 0 }, e: { r: linhaCab + aba.linhas.length, c: nCols - 1 } }) }
  }
  ws['!cols'] = aba.colunas.map((c, i) => {
    if (c.largura) return { wch: c.largura }
    const maior = Math.max(
      c.titulo.length,
      ...todas.slice(0, 200).map(l => {
        const v = c.valor(l)
        return typeof v === 'number' ? 14 : String(v ?? '').length
      }),
    )
    return { wch: Math.min(Math.max(maior + 2, i === 0 ? 18 : 10), 60) }
  })
  return ws
}

/** Gera o workbook (exportado para teste). */
export function montarWorkbook(abas: Aba<any>[], meta: MetaRelatorio): Livro {
  const wb = XLSX.utils.book_new() as Livro
  wb.Props = { Title: meta.documento, Company: meta.empresa, Author: 'Fashion Mind · The Fashion Office' }
  const usados = new Set<string>()
  for (const aba of abas) XLSX.utils.book_append_sheet(wb, montarAba(aba, meta), nomeAbaValido(aba.nome, usados))
  return wb
}

/** Baixa o .xlsx no navegador. */
export function baixarXlsx(nomeArquivo: string, abas: Aba<any>[], meta: MetaRelatorio): void {
  const wb = montarWorkbook(abas, meta)
  const nome = nomeArquivo.endsWith('.xlsx') ? nomeArquivo : `${nomeArquivo}.xlsx`
  XLSX.writeFile(wb, nome, { compression: true })
}

/** Nome de arquivo seguro: "plano_final_marca_2027". */
export function nomeArquivo(...partes: (string | number | null | undefined)[]): string {
  return partes
    .filter(p => p != null && p !== '')
    .map(p => String(p).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
    .join('_')
}
