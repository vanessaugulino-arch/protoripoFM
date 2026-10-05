// ─── planejamentoMacroRelatorio.tsx ───────────────────────────────────────────
// PDF e Excel do Planejamento Estratégico (M1), a partir dos mesmos números que
// a tela mostra: cenário consolidado (plano × ano de referência), indicadores
// selecionados e comparação dos cenários salvos.
// ─────────────────────────────────────────────────────────────────────────────

import { Capa, GradeKpis, RelatorioA4, Secao, TabelaRelatorio, type KpiRelatorio } from './RelatorioA4'
import { baixarXlsx, nomeArquivo, type Aba, type Coluna, type FormatoColuna } from './xlsxReport'

/** Formato de exibição de cada indicador (o mesmo que a tela aplica). */
export type FormatoM1 = 'brl' | 'pct' | 'multiplo' | 'dias' | 'pecas'

export const FORMATO_INDICADOR_M1: Record<string, FormatoM1> = {
  receitaBruta: 'brl', margemBruta: 'pct', mkdPct: 'pct', gmroi: 'multiplo', pmv: 'brl', orcamento: 'brl',
  giroUnidades: 'multiplo', giro: 'multiplo', cobertura: 'dias', producaoPecas: 'pecas', ticketMedio: 'brl',
  estoqueMediao: 'brl', estoqueMedioPecas: 'pecas', custoMedio: 'brl', mkdRS: 'brl', pecasVendidas: 'pecas',
  idadeMediaEstoque: 'dias',
}

export interface LinhaM1 {
  chave: string
  rotulo: string
  formato: FormatoM1
  plano: number | null
  /** Projeção de fim de ano (revisão de meio de ciclo); null quando não há. */
  projecao: number | null
  referencia: number | null
  /** Variação do plano sobre a referência, em % (0–100). */
  variacaoPct: number | null
  /** Indicador escolhido no setup (fica no topo da tela). */
  selecionado: boolean
  /** Aviso de valor estimado no ano de referência. */
  notaReferencia: string | null
}

export interface CenarioM1 { nome: string; ativo: boolean; valores: Record<string, number | null> }

export interface DadosPlanejamentoMacro {
  empresa: string
  ano: number
  anoReferencia: string
  /** false = ano de referência com números de exemplo (sem histórico importado). */
  dadosReais: boolean
  foco: string | null
  cenarioAtivo: string | null
  temProjecao: boolean
  linhas: LinhaM1[]
  cenarios: CenarioM1[]
}

const EXCEL: Record<FormatoM1, FormatoColuna> = { brl: 'brl', pct: 'pct', multiplo: 'multiplo', dias: 'inteiro', pecas: 'inteiro' }

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Mesmo texto da tela (fmtPlan/fmtRef do Planning.tsx). */
export function formatarM1(formato: FormatoM1, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  switch (formato) {
    case 'brl': return `R$ ${num2(v)}`
    case 'pct': return `${num2(v)}%`
    case 'multiplo': return `${num2(v)}x`
    case 'dias': return `${Math.round(v).toLocaleString('pt-BR')} dias`
    case 'pecas': return `${Math.round(v).toLocaleString('pt-BR')} pç`
  }
}

const variacao = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const r = Math.round(v * 10) / 10   // evita "-0,0%" em variações minúsculas
  const abs = Math.abs(r).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${r > 0 ? '+' : r < 0 ? '-' : ''}${abs}%`
}

type LinhaTabela = { tipo: 'grupo'; titulo: string } | ({ tipo: 'indicador' } & LinhaM1)

function linhasComGrupos(linhas: LinhaM1[]): LinhaTabela[] {
  const sel = linhas.filter(l => l.selecionado)
  const demais = linhas.filter(l => !l.selecionado)
  if (sel.length === 0) return linhas.map(l => ({ tipo: 'indicador' as const, ...l }))
  return [
    { tipo: 'grupo', titulo: 'Indicadores selecionados' },
    ...sel.map(l => ({ tipo: 'indicador' as const, ...l })),
    ...(demais.length > 0 ? [{ tipo: 'grupo' as const, titulo: 'Demais indicadores' }] : []),
    ...demais.map(l => ({ tipo: 'indicador' as const, ...l })),
  ]
}

export function RelatorioPlanejamentoMacro({ dados }: { dados: DadosPlanejamentoMacro }) {
  const { empresa, ano, anoReferencia, dadosReais, foco, cenarioAtivo, temProjecao, linhas, cenarios } = dados
  const selecionadas = linhas.filter(l => l.selecionado)
  const kpis: KpiRelatorio[] = (selecionadas.length > 0 ? selecionadas : linhas.slice(0, 6)).map(l => ({
    rotulo: l.rotulo,
    valor: formatarM1(l.formato, l.plano),
    variacao: l.plano != null && l.variacaoPct != null
      ? { texto: `${variacao(l.variacaoPct)} vs ${anoReferencia}`, bom: l.variacaoPct >= 0 }
      : null,
  }))
  const notas = linhas.filter(l => l.notaReferencia)
  const tabela = linhasComGrupos(linhas)
  const ind = (l: LinhaTabela, f: (x: LinhaM1) => string) => (l.tipo === 'grupo' ? '' : f(l))

  return (
    <RelatorioA4 empresa={empresa} documento={`Planejamento Estratégico ${ano}`}>
      <Capa
        titulo={`Planejamento Estratégico ${ano}`}
        subtitulo={`Metas macro do ano comparadas com ${anoReferencia}${foco ? `. Foco estratégico: ${foco}` : ''}.`}
        empresa={empresa}
        periodo={`Ano fiscal ${ano}`}
        versao={cenarioAtivo ? `cenário ${cenarioAtivo}` : undefined}
      />

      <Secao
        titulo="Indicadores do plano"
        nota={selecionadas.length > 0
          ? `Indicadores escolhidos no setup do ciclo, com a variação sobre ${anoReferencia}.`
          : `Principais indicadores do plano, com a variação sobre ${anoReferencia}.`}
      >
        <GradeKpis itens={kpis} />
      </Secao>

      <Secao
        titulo="Cenário consolidado"
        nota={`Todos os indicadores do plano ${ano} ao lado do ano de referência ${anoReferencia}.`
          + (dadosReais ? '' : ' Sem histórico de vendas importado: a referência usa números de exemplo, não da marca.')
          + (notas.length > 0 ? ' Valores com * na referência são estimados (ver notas abaixo).' : '')}
      >
        <TabelaRelatorio
          colunas={[
            { titulo: 'Indicador', valor: (l: LinhaTabela) => (l.tipo === 'grupo' ? l.titulo : l.rotulo), largura: '34%' },
            { titulo: `Plano ${ano}`, valor: l => ind(l, x => formatarM1(x.formato, x.plano)), numero: true },
            ...(temProjecao ? [{ titulo: 'Projeção', valor: (l: LinhaTabela) => ind(l, x => formatarM1(x.formato, x.projecao)), numero: true }] : []),
            { titulo: `Ref. ${anoReferencia}`, valor: l => ind(l, x => `${formatarM1(x.formato, x.referencia)}${x.notaReferencia ? ' *' : ''}`), numero: true },
            { titulo: 'vs Ref.', valor: l => ind(l, x => (x.plano == null ? '—' : variacao(x.variacaoPct))), numero: true },
          ]}
          linhas={tabela}
          classeLinha={l => (l.tipo === 'grupo' ? 'grupo' : undefined)}
        />
        {notas.length > 0 && (
          <div style={{ marginTop: '3mm' }}>
            {notas.map(n => <p key={n.chave} className="nota" style={{ margin: '0 0 1mm' }}>* {n.rotulo}: {n.notaReferencia}</p>)}
          </div>
        )}
      </Secao>

      <Secao
        titulo="Comparação de cenários"
        nota={cenarios.length > 0
          ? `Cenários salvos para ${ano}${cenarioAtivo ? `; o ativo é "${cenarioAtivo}"` : ''}.`
          : undefined}
        novaPagina={cenarios.length > 0}
      >
        <TabelaRelatorio
          colunas={[
            { titulo: 'Indicador', valor: (l: LinhaM1) => l.rotulo, largura: '30%' },
            ...cenarios.map(sc => ({
              titulo: sc.ativo ? `${sc.nome} (ativo)` : sc.nome,
              valor: (l: LinhaM1) => formatarM1(l.formato, sc.valores[l.chave] ?? null),
              numero: true,
            })),
          ]}
          linhas={cenarios.length > 0 ? linhas : []}
          vazio="Nenhum cenário salvo para este ano."
        />
      </Secao>
    </RelatorioA4>
  )
}

/** Abas do Excel do M1 (exportado para teste). */
export function abasPlanejamentoMacro(dados: DadosPlanejamentoMacro): Aba<any>[] {
  const { ano, anoReferencia, dadosReais, temProjecao, linhas, cenarios } = dados
  const fmt = (l: LinhaM1) => EXCEL[l.formato]
  const colunas: Coluna<LinhaM1>[] = [
    { titulo: 'Grupo', valor: l => (l.selecionado ? 'Selecionado' : 'Demais') },
    { titulo: 'Indicador', valor: l => l.rotulo, largura: 30 },
    { titulo: `Plano ${ano}`, valor: l => l.plano, formatoPorLinha: fmt, largura: 18 },
    ...(temProjecao ? [{ titulo: 'Projeção', valor: (l: LinhaM1) => l.projecao, formatoPorLinha: fmt, largura: 18 }] : []),
    { titulo: `Referência ${anoReferencia}`, valor: l => l.referencia, formatoPorLinha: fmt, largura: 18 },
    { titulo: 'Variação vs referência', valor: l => (l.plano == null ? null : l.variacaoPct), formato: 'pct' },
    { titulo: 'Observação', valor: l => l.notaReferencia ?? '', largura: 50 },
  ]
  const abas: Aba<any>[] = [{
    nome: 'Cenário consolidado',
    titulo: `Planejamento Estratégico ${ano} · cenário consolidado`,
    subtitulo: `Referência ${anoReferencia}${dadosReais ? '' : ' (números de exemplo)'}`,
    colunas,
    linhas,
  }]
  if (cenarios.length > 0) {
    abas.push({
      nome: 'Comparação de cenários',
      titulo: `Comparação de cenários · ${ano}`,
      subtitulo: `${cenarios.length} cenário${cenarios.length > 1 ? 's' : ''} salvo${cenarios.length > 1 ? 's' : ''}`,
      colunas: [
        { titulo: 'Indicador', valor: (l: LinhaM1) => l.rotulo, largura: 30 },
        ...cenarios.map(sc => ({
          titulo: sc.ativo ? `${sc.nome} (ativo)` : sc.nome,
          valor: (l: LinhaM1) => sc.valores[l.chave] ?? null,
          formatoPorLinha: fmt,
          largura: 18,
        })),
      ],
      linhas,
    })
  }
  return abas
}

export function baixarExcelPlanejamentoMacro(dados: DadosPlanejamentoMacro): void {
  baixarXlsx(
    nomeArquivo('planejamento_estrategico', dados.empresa, dados.ano),
    abasPlanejamentoMacro(dados),
    { empresa: dados.empresa, documento: `Planejamento Estratégico ${dados.ano}` },
  )
}
