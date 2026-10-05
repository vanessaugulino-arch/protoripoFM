// ─── RelatorioA4.tsx ──────────────────────────────────────────────────────────
// Kit de relatório em PDF para todos os módulos.
//
// O PDF sai do layout de impressão do navegador ("Salvar como PDF"), não de
// uma captura de tela: texto selecionável e nítido, tabelas que continuam na
// página seguinte com o cabeçalho repetido, linhas que não quebram no meio,
// capa e rodapé com "Página X de Y".
//
// Uso: a tela renderiza <RelatorioA4> junto com o conteúdo normal. Na tela ele
// fica escondido; na impressão, só ele aparece. Com ?pdf=1 na URL ele aparece
// na tela, para conferir antes de imprimir.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'

export const COR = {
  vinho: '#28071C',
  azul: '#7598CF',
  amarelo: '#F6F3AA',
  cinza: '#F2F2F2',
  texto: '#28071C',
  suave: 'rgba(40,7,28,.55)',
  linha: 'rgba(40,7,28,.12)',
} as const

/** true quando a URL pede a pré-visualização do PDF na tela (?pdf=1). */
export function emPreviaPdf(): boolean {
  try { return new URLSearchParams(window.location.search).get('pdf') === '1' } catch { return false }
}

const css = (empresa: string, documento: string) => `
.relatorio-a4 { display: none; }
@media screen {
  .previa-pdf .relatorio-a4 { display: block; background: #d9d6d8; padding: 24px 0; }
  .previa-pdf .relatorio-a4 .folha { width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 18mm 16mm 20mm; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
  .previa-pdf .tela-app { display: none; }
}
@media print {
  @page {
    size: A4 portrait;
    margin: 16mm 14mm 18mm;
    @top-left { content: "${empresa.replace(/"/g, "'")}"; font: 600 8pt system-ui, sans-serif; color: ${COR.suave}; }
    @top-right { content: "${documento.replace(/"/g, "'")}"; font: 8pt system-ui, sans-serif; color: ${COR.suave}; }
    @bottom-left { content: "The Fashion Office · Fashion Mind · Powered by @arayssa.amaral"; font: 7.5pt system-ui, sans-serif; color: ${COR.suave}; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt system-ui, sans-serif; color: ${COR.suave}; }
  }
  @page :first { @top-left { content: none; } @top-right { content: none; } }
  html, body { background: #fff !important; }
  .tela-app, .tela-app * { display: none !important; }
  .relatorio-a4 { display: block !important; }
  .relatorio-a4 .folha { padding: 0; }
  .relatorio-a4 .quebra-antes { break-before: page; }
}
.relatorio-a4 { color: ${COR.texto}; font: 9.5pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.relatorio-a4 h1, .relatorio-a4 h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 600; color: ${COR.vinho}; margin: 0; }
.relatorio-a4 .capa { min-height: 250mm; display: flex; flex-direction: column; justify-content: space-between; }
.relatorio-a4 .capa .marca { font: 700 10pt system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; }
.relatorio-a4 .capa .faixa { height: 6px; background: linear-gradient(90deg, ${COR.vinho}, ${COR.azul}); border-radius: 3px; margin-top: 8px; width: 64mm; }
.relatorio-a4 .capa h1 { font-size: 30pt; line-height: 1.1; margin-bottom: 6mm; }
.relatorio-a4 .capa .sub { font-size: 12pt; color: ${COR.suave}; max-width: 140mm; }
.relatorio-a4 .capa .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; border-top: 1px solid ${COR.linha}; padding-top: 4mm; }
.relatorio-a4 .rot { font: 600 7pt system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: ${COR.suave}; }
.relatorio-a4 .secao { margin: 0 0 8mm; }
.relatorio-a4 .secao h2 { font-size: 14pt; margin-bottom: 1mm; }
.relatorio-a4 .secao .nota { color: ${COR.suave}; font-size: 8.5pt; margin: 0 0 3mm; }
.relatorio-a4 .kpis { display: grid; gap: 3mm; margin: 0 0 8mm; break-inside: avoid; }
.relatorio-a4 .kpi { border: 1px solid ${COR.linha}; border-radius: 3mm; padding: 3mm 3.5mm; }
.relatorio-a4 .kpi .v { font: 600 15pt Georgia, serif; margin-top: 1mm; }
.relatorio-a4 .kpi .d { font-size: 7.5pt; margin-top: 1mm; }
.relatorio-a4 .kpi .d.bom { color: #15803d; } .relatorio-a4 .kpi .d.ruim { color: #b91c1c; }
.relatorio-a4 table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
.relatorio-a4 thead { display: table-header-group; }
.relatorio-a4 tr { break-inside: avoid; }
.relatorio-a4 th { font: 600 7pt system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: ${COR.suave}; text-align: left; padding: 2mm 2mm; border-bottom: 1.2px solid ${COR.vinho}; }
.relatorio-a4 td { padding: 1.6mm 2mm; border-bottom: 1px solid ${COR.linha}; vertical-align: top; }
.relatorio-a4 td.num, .relatorio-a4 th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.relatorio-a4 tr.grupo td { background: ${COR.cinza}; font-weight: 700; }
.relatorio-a4 tr.total td { font-weight: 700; border-top: 1.2px solid ${COR.vinho}; border-bottom: none; }
.relatorio-a4 tr.sub td:first-child { padding-left: 6mm; color: ${COR.suave}; }
.relatorio-a4 .vazio { color: ${COR.suave}; font-style: italic; }
`

export function RelatorioA4({ empresa, documento, children }: { empresa: string; documento: string; children: ReactNode }) {
  return (
    <div className="relatorio-a4" aria-hidden={!emPreviaPdf()}>
      <style>{css(empresa, documento)}</style>
      <div className="folha">{children}</div>
    </div>
  )
}

export function Capa({ titulo, subtitulo, empresa, periodo, versao }: {
  titulo: string; subtitulo?: string; empresa: string; periodo: string; versao?: string
}) {
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  return (
    <section className="capa quebra-depois" style={{ breakAfter: 'page' }}>
      <div>
        <div className="marca">The Fashion Office</div>
        <div className="rot" style={{ marginTop: '1mm' }}>Fashion Mind</div>
        <div className="faixa" />
      </div>
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="sub">{subtitulo}</p>}
      </div>
      <div className="meta">
        <div><div className="rot">Empresa</div><div style={{ fontWeight: 600 }}>{empresa}</div></div>
        <div><div className="rot">Período</div><div style={{ fontWeight: 600 }}>{periodo}</div></div>
        <div><div className="rot">Gerado em</div><div style={{ fontWeight: 600 }}>{hoje}{versao ? ` · ${versao}` : ''}</div></div>
      </div>
    </section>
  )
}

export function Secao({ titulo, nota, children, novaPagina }: { titulo: string; nota?: string; children: ReactNode; novaPagina?: boolean }) {
  return (
    <section className={`secao${novaPagina ? ' quebra-antes' : ''}`}>
      <h2>{titulo}</h2>
      {nota ? <p className="nota">{nota}</p> : <div style={{ height: '3mm' }} />}
      {children}
    </section>
  )
}

export interface KpiRelatorio { rotulo: string; valor: string; variacao?: { texto: string; bom: boolean } | null; nota?: string }

export function GradeKpis({ itens }: { itens: KpiRelatorio[] }) {
  const cols = Math.min(Math.max(itens.length, 1), 3)
  return (
    <div className="kpis" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {itens.map(k => (
        <div key={k.rotulo} className="kpi">
          <div className="rot">{k.rotulo}</div>
          <div className="v">{k.valor}</div>
          {k.variacao
            ? <div className={`d ${k.variacao.bom ? 'bom' : 'ruim'}`}>{k.variacao.texto}</div>
            : k.nota ? <div className="d" style={{ color: COR.suave }}>{k.nota}</div> : null}
        </div>
      ))}
    </div>
  )
}

export interface ColunaTabela<T> { titulo: string; valor: (l: T) => ReactNode; numero?: boolean; largura?: string }

export function TabelaRelatorio<T>({ colunas, linhas, total, classeLinha, vazio }: {
  colunas: ColunaTabela<T>[]
  linhas: T[]
  total?: T
  classeLinha?: (l: T) => string | undefined
  vazio?: string
}) {
  if (linhas.length === 0) return <p className="vazio">{vazio ?? 'Sem dados para este período.'}</p>
  return (
    <table>
      <thead>
        <tr>{colunas.map(c => <th key={c.titulo} className={c.numero ? 'num' : undefined} style={c.largura ? { width: c.largura } : undefined}>{c.titulo}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className={classeLinha?.(l)}>
            {colunas.map(c => <td key={c.titulo} className={c.numero ? 'num' : undefined}>{c.valor(l)}</td>)}
          </tr>
        ))}
        {total && (
          <tr className="total">{colunas.map(c => <td key={c.titulo} className={c.numero ? 'num' : undefined}>{c.valor(total)}</td>)}</tr>
        )}
      </tbody>
    </table>
  )
}

/** Abre a impressão (o navegador oferece "Salvar como PDF"). */
export function imprimirPdf(nomeSugerido: string): void {
  const anterior = document.title
  document.title = nomeSugerido   // vira o nome do arquivo no "Salvar como PDF"
  window.print()
  setTimeout(() => { document.title = anterior }, 1000)
}
