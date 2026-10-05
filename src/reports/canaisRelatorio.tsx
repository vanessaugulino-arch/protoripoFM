// ─── canaisRelatorio.tsx ──────────────────────────────────────────────────────
// PDF e Excel do Planejamento de Metas por Canal (M2), a partir dos mesmos
// números que a tela mostra: distribuição por canal, grade de indicadores por
// canal com o consolidado, desvios do plano macro, ano anterior real, divisão
// estimada (M4) e comparação dos cenários salvos.
// ─────────────────────────────────────────────────────────────────────────────

import { Capa, GradeKpis, RelatorioA4, Secao, TabelaRelatorio, type KpiRelatorio } from './RelatorioA4'
import { baixarXlsx, nomeArquivo, type Aba, type FormatoColuna } from './xlsxReport'

/** Formatos da tela do M2 (fmt do ChannelPlanning.tsx). */
export type FormatoCanal = 'currency' | 'percent' | 'days' | 'multiplier' | 'number'

export interface CanalRelatorio { id: string; nome: string; participacao: number; receitaDistribuida: number }

export interface LinhaIndicadorCanal {
  chave: string
  rotulo: string
  formato: FormatoCanal
  /** Indicador foco do M1 (fica no topo da grade). */
  foco: boolean
  driver: boolean
  valores: Record<string, number>
  consolidado: number
  /** Meta do M1 quando o consolidado está fora da banda; senão null. */
  metaM1: number | null
  /** Ano anterior real por canal (null quando não há dado real). */
  anoAnterior: Record<string, number | null>
  anoAnteriorConsolidado: number | null
  variacaoAnoAnteriorPct: number | null
}

export interface DesvioMacro { rotulo: string; taxa: boolean; meta: number; proposto: number; diferenca: number }
export interface DivisaoEstimada { temporada: string; divisao: string; participacao: number; receitaEstimada: number }
export interface CenarioCanalRelatorio { nome: string; salvoEm: string; aplicado: boolean; consolidado: Record<string, number> }

export interface DadosCanais {
  empresa: string
  ano: number
  anoReferencia: number | null
  /** Receita total do plano macro (M1) que é distribuída. */
  receitaMeta: number
  temPlanoMacro: boolean
  cenarioCarregado: string | null
  canais: CanalRelatorio[]
  totalParticipacao: number
  indicadores: LinhaIndicadorCanal[]
  /** true quando a tela faz a checagem contra o M1 (prioridades + 100%). */
  verificacaoMacro: boolean
  desvios: DesvioMacro[]
  anoAnterior: { receita: number; pmv: number; custo: number; variacaoReceitaPct: number | null } | null
  divisoes: DivisaoEstimada[]
  cenarios: CenarioCanalRelatorio[]
}

// ─── Consolidado de um cenário salvo (mesma conta do "Comparar" da tela) ────
export function consolidadoCenarioCanal(chData: Record<string, Record<string, number>>, chs: string[]): Record<string, number> {
  const sum = (key: string) => chs.reduce((s, ch) => s + (chData[ch]?.[key] ?? 0), 0)
  const totalR = sum('receita')
  // Média ponderada por receita — usada apenas para ticketMedio (sem base absoluta de transações)
  const wAvg = (key: string) =>
    totalR > 0 ? chs.reduce((s, ch) => s + (chData[ch]?.receita ?? 0) * (chData[ch]?.[key] ?? 0), 0) / totalR : 0
  const totalEstMedio = sum('estoqueMedioRS')
  const totalLucroBruto = sum('margemBrutaRS')
  const totalOrcamento = sum('orcamento')
  const totalMkd = sum('markdown')
  const totalProd = sum('producao')
  return {
    receita: totalR,
    margemBrutaRS: totalLucroBruto,
    margemBruta: totalR > 0 ? (totalLucroBruto / totalR) * 100 : 0,
    pmv: totalProd > 0 ? totalR / totalProd : 0,
    custoMedio: totalProd > 0 ? totalOrcamento / totalProd : 0,
    ticketMedio: wAvg('ticketMedio'),
    giro: totalEstMedio > 0 ? totalR / totalEstMedio : 0,
    cobertura: totalR > 0 ? (totalEstMedio / totalR) * 365 : 0,
    gmroi: totalEstMedio > 0 ? totalLucroBruto / totalEstMedio : 0,
    orcamento: totalOrcamento,
    mkdPct: totalR > 0 ? (totalMkd / totalR) * 100 : 0,
    markdown: totalMkd,
    producao: totalProd,
    totalPecas: sum('totalPecas'),
  }
}

/** Indicadores da comparação de cenários (mesma lista do modal "Comparar"). */
export const CAMPOS_COMPARACAO: { chave: string; rotulo: string; formato: FormatoCanal }[] = [
  { chave: 'receita', rotulo: 'Receita Total (R$)', formato: 'currency' },
  { chave: 'margemBruta', rotulo: 'Margem Bruta (%)', formato: 'percent' },
  { chave: 'margemBrutaRS', rotulo: 'Margem Bruta (R$)', formato: 'currency' },
  { chave: 'pmv', rotulo: 'PMV (R$)', formato: 'currency' },
  { chave: 'ticketMedio', rotulo: 'Ticket Médio (R$)', formato: 'currency' },
  { chave: 'custoMedio', rotulo: 'Custo Médio (R$)', formato: 'currency' },
  { chave: 'giro', rotulo: 'Giro', formato: 'multiplier' },
  { chave: 'cobertura', rotulo: 'Cobertura (dias)', formato: 'days' },
  { chave: 'orcamento', rotulo: 'Orçamento (R$)', formato: 'currency' },
  { chave: 'mkdPct', rotulo: 'Markdown (%)', formato: 'percent' },
  { chave: 'markdown', rotulo: 'Markdown (R$)', formato: 'currency' },
  { chave: 'producao', rotulo: 'Produção (peças)', formato: 'number' },
  { chave: 'gmroi', rotulo: 'GMROI', formato: 'multiplier' },
]

const EXCEL: Record<FormatoCanal, FormatoColuna> = { currency: 'brl', percent: 'pct', days: 'inteiro', multiplier: 'multiplo', number: 'inteiro' }

/** Mesmo texto da grade da tela. */
export function formatarCanal(formato: FormatoCanal, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  switch (formato) {
    case 'currency': return `R$ ${Math.round(v).toLocaleString('pt-BR')}`
    case 'percent': return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    case 'days': return `${Math.round(v)} dias`
    case 'multiplier': return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    default: return Math.round(v).toLocaleString('pt-BR')
  }
}

// Arredonda antes do sinal: nada de "-0%" ou "+0,0%" em variação nula.
const sinal = (r: number) => (r > 0 ? '+' : '')
const pct0 = (v: number | null) => { if (v == null || !Number.isFinite(v)) return '—'; const r = Math.round(v) || 0; return `${sinal(r)}${r}%` }
const pct1 = (v: number | null) => { if (v == null || !Number.isFinite(v)) return '—'; const r = Math.round(v * 10) / 10 || 0; return `${sinal(r)}${r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` }
const formatoDesvio = (d: DesvioMacro): FormatoCanal => (d.taxa ? 'percent' : 'currency')

type LinhaGrade = { tipo: 'grupo'; titulo: string } | ({ tipo: 'indicador' } & LinhaIndicadorCanal)

function linhasComGrupos(linhas: LinhaIndicadorCanal[]): LinhaGrade[] {
  const foco = linhas.filter(l => l.foco)
  const demais = linhas.filter(l => !l.foco)
  if (foco.length === 0) return linhas.map(l => ({ tipo: 'indicador' as const, ...l }))
  return [
    { tipo: 'grupo', titulo: 'Indicadores foco (M1)' },
    ...foco.map(l => ({ tipo: 'indicador' as const, ...l })),
    ...(demais.length > 0 ? [{ tipo: 'grupo' as const, titulo: 'Indicadores secundários' }] : []),
    ...demais.map(l => ({ tipo: 'indicador' as const, ...l })),
  ]
}

const KPIS_CHAVES = ['receita', 'margemBruta', 'pmv', 'giro', 'producao', 'mkdPct']

export function RelatorioCanais({ dados }: { dados: DadosCanais }) {
  const { empresa, ano, anoReferencia, receitaMeta, temPlanoMacro, cenarioCarregado, canais, totalParticipacao,
    indicadores, verificacaoMacro, desvios, anoAnterior, divisoes, cenarios } = dados

  const kpis: KpiRelatorio[] = KPIS_CHAVES.flatMap(chave => {
    const l = indicadores.find(x => x.chave === chave)
    if (!l) return []
    const k: KpiRelatorio = { rotulo: l.rotulo, valor: formatarCanal(l.formato, l.consolidado) }
    if (chave === 'receita' && anoAnterior?.variacaoReceitaPct != null) {
      k.variacao = { texto: `${pct1(anoAnterior.variacaoReceitaPct)} vs ano anterior`, bom: anoAnterior.variacaoReceitaPct >= 0 }
    } else if (l.metaM1 != null) {
      k.variacao = { texto: `meta M1: ${formatarCanal(l.formato, l.metaM1)}`, bom: false }
    } else if (chave === 'receita' && temPlanoMacro) {
      k.nota = `meta macro: R$ ${receitaMeta.toLocaleString('pt-BR')}`
    }
    return [k]
  })

  const grade = linhasComGrupos(indicadores)
  const ind = (l: LinhaGrade, f: (x: LinhaIndicadorCanal) => string) => (l.tipo === 'grupo' ? '' : f(l))
  const temAnoAnterior = indicadores.some(l => l.anoAnteriorConsolidado != null)
  const temMeta = indicadores.some(l => l.metaM1 != null)
  const totalDistribuido = canais.reduce((s, c) => s + c.receitaDistribuida, 0)

  return (
    <RelatorioA4 empresa={empresa} documento={`Metas por Canal ${ano}`}>
      <Capa
        titulo={`Metas por Canal ${ano}`}
        subtitulo="Distribuição da receita do plano macro entre os canais de venda, com os indicadores de cada canal e o consolidado."
        empresa={empresa}
        periodo={`Ano fiscal ${ano}`}
        versao={cenarioCarregado ? `cenário ${cenarioCarregado}` : undefined}
      />

      <Secao
        titulo="Indicadores consolidados"
        nota={temPlanoMacro
          ? `Soma dos canais. Receita total do plano macro: R$ ${receitaMeta.toLocaleString('pt-BR')}.`
          : `Soma dos canais. Nenhum cenário salvo no Módulo 1 para ${ano}: a receita total usa o valor padrão da tela.`}
      >
        <GradeKpis itens={kpis} />
      </Secao>

      <Secao
        titulo="Distribuição por canal"
        nota={totalParticipacao === 100 ? 'Participação de cada canal na receita total.' : `Atenção: a participação soma ${totalParticipacao}% e deveria somar 100%.`}
      >
        <TabelaRelatorio
          colunas={[
            { titulo: 'Canal', valor: (c: CanalRelatorio) => c.nome },
            { titulo: 'Participação', valor: c => `${c.participacao.toLocaleString('pt-BR')}%`, numero: true },
            { titulo: 'Receita', valor: c => `R$ ${Math.round(c.receitaDistribuida).toLocaleString('pt-BR')}`, numero: true },
          ]}
          linhas={canais}
          total={{ id: 'total', nome: 'Total', participacao: totalParticipacao, receitaDistribuida: totalDistribuido }}
        />
      </Secao>

      {verificacaoMacro && (
        <Secao titulo="Aderência ao plano macro" nota="Indicadores foco do M1 comparados com o consolidado dos canais.">
          <TabelaRelatorio
            colunas={[
              { titulo: 'Indicador', valor: (d: DesvioMacro) => d.rotulo },
              { titulo: 'Meta M1', valor: d => formatarCanal(formatoDesvio(d), d.meta), numero: true },
              { titulo: 'Proposto (canais)', valor: d => formatarCanal(formatoDesvio(d), d.proposto), numero: true },
              { titulo: 'Diferença', valor: d => (d.taxa ? `${d.diferenca >= 0 ? '+' : ''}${d.diferenca.toFixed(1)} pp` : `${d.diferenca >= 0 ? '+' : '-'}R$ ${Math.round(Math.abs(d.diferenca)).toLocaleString('pt-BR')}`), numero: true },
            ]}
            linhas={desvios}
            vazio="Todos os indicadores macro do plano estão sendo atingidos com a distribuição atual."
          />
        </Secao>
      )}

      <Secao
        titulo="Indicadores por canal"
        nota={[
          'Valores de cada canal e o consolidado.',
          temMeta ? 'A coluna Meta M1 aparece onde o consolidado está fora da meta do plano macro.' : '',
          temAnoAnterior ? `Ano anterior real${anoReferencia ? ` (${anoReferencia})` : ''} só onde há histórico de vendas por canal; giro, cobertura, orçamento e GMROI não têm base real por canal.` : '',
        ].filter(Boolean).join(' ')}
        novaPagina
      >
        <TabelaRelatorio
          colunas={[
            { titulo: 'Indicador', valor: (l: LinhaGrade) => (l.tipo === 'grupo' ? l.titulo : l.rotulo), largura: '22%' },
            ...canais.map(c => ({ titulo: c.nome, valor: (l: LinhaGrade) => ind(l, x => formatarCanal(x.formato, x.valores[c.id])), numero: true })),
            { titulo: 'Consolidado', valor: l => ind(l, x => formatarCanal(x.formato, x.consolidado)), numero: true },
            ...(temMeta ? [{ titulo: 'Meta M1', valor: (l: LinhaGrade) => ind(l, x => (x.metaM1 == null ? '' : formatarCanal(x.formato, x.metaM1))), numero: true }] : []),
            ...(temAnoAnterior ? [
              { titulo: 'Ano anterior', valor: (l: LinhaGrade) => ind(l, x => formatarCanal(x.formato, x.anoAnteriorConsolidado)), numero: true },
              { titulo: 'Var. a.a.', valor: (l: LinhaGrade) => ind(l, x => pct0(x.variacaoAnoAnteriorPct)), numero: true },
            ] : []),
          ]}
          linhas={grade}
          classeLinha={l => (l.tipo === 'grupo' ? 'grupo' : undefined)}
        />
      </Secao>

      {temAnoAnterior && (
        <Secao titulo="Ano anterior por canal" nota={`Dado real de vendas${anoReferencia ? ` de ${anoReferencia}` : ''}, por canal. "—" onde não há base real.`}>
          <TabelaRelatorio
            colunas={[
              { titulo: 'Indicador', valor: (l: LinhaIndicadorCanal) => l.rotulo, largura: '26%' },
              ...canais.map(c => ({ titulo: c.nome, valor: (l: LinhaIndicadorCanal) => formatarCanal(l.formato, l.anoAnterior[c.id]), numero: true })),
              { titulo: 'Consolidado', valor: (l: LinhaIndicadorCanal) => formatarCanal(l.formato, l.anoAnteriorConsolidado), numero: true },
            ]}
            linhas={indicadores.filter(l => l.anoAnteriorConsolidado != null || canais.some(c => l.anoAnterior[c.id] != null))}
          />
        </Secao>
      )}

      {divisoes.length > 0 && (
        <Secao
          titulo="Divisão (estimado, do Módulo 4)"
          nota="Não é um dado real por canal: é a participação aplicada no M4 para cada temporada, sobre a receita total do plano. O M2 não armazena divisão."
        >
          <TabelaRelatorio
            colunas={[
              { titulo: 'Temporada', valor: (d: DivisaoEstimada) => d.temporada },
              { titulo: 'Divisão', valor: d => d.divisao },
              { titulo: 'Participação', valor: d => `${d.participacao.toFixed(0)}%`, numero: true },
              { titulo: 'Receita estimada', valor: d => `R$ ${Math.round(d.receitaEstimada).toLocaleString('pt-BR')}`, numero: true },
            ]}
            linhas={divisoes}
          />
        </Secao>
      )}

      <Secao
        titulo="Comparação de cenários"
        nota={cenarios.length > 0 ? `Consolidado de cada cenário salvo para ${ano}, pela mesma conta do botão Comparar.` : undefined}
        novaPagina={cenarios.length > 0}
      >
        <TabelaRelatorio
          colunas={[
            { titulo: 'Indicador', valor: (f: typeof CAMPOS_COMPARACAO[number]) => f.rotulo, largura: '26%' },
            ...cenarios.map(sc => ({
              titulo: `${sc.nome}${sc.aplicado ? ' (aplicado)' : ''}`,
              valor: (f: typeof CAMPOS_COMPARACAO[number]) => formatarCanal(f.formato, sc.consolidado[f.chave] ?? 0),
              numero: true,
            })),
          ]}
          linhas={cenarios.length > 0 ? CAMPOS_COMPARACAO : []}
          vazio="Nenhum cenário salvo para este ano."
        />
      </Secao>
    </RelatorioA4>
  )
}

/** Abas do Excel do M2 (exportado para teste). */
export function abasCanais(dados: DadosCanais): Aba<any>[] {
  const { ano, anoReferencia, canais, totalParticipacao, indicadores, verificacaoMacro, desvios, divisoes, cenarios } = dados
  const fmt = (l: { formato: FormatoCanal }) => EXCEL[l.formato]
  const abas: Aba<any>[] = [
    {
      nome: 'Distribuição', titulo: `Distribuição por canal · ${ano}`, subtitulo: 'Participação na receita total',
      colunas: [
        { titulo: 'Canal', valor: (c: CanalRelatorio) => c.nome },
        { titulo: 'Participação', valor: (c: CanalRelatorio) => c.participacao, formato: 'pct' },
        { titulo: 'Receita', valor: (c: CanalRelatorio) => c.receitaDistribuida, formato: 'brl' },
      ],
      linhas: canais,
      total: { id: 'total', nome: 'Total', participacao: totalParticipacao, receitaDistribuida: canais.reduce((s, c) => s + c.receitaDistribuida, 0) },
    },
    {
      nome: 'Indicadores por canal', titulo: `Indicadores por canal · ${ano}`, subtitulo: 'Valores de cada canal e o consolidado',
      colunas: [
        { titulo: 'Grupo', valor: (l: LinhaIndicadorCanal) => (l.foco ? 'Foco (M1)' : 'Secundário') },
        { titulo: 'Indicador', valor: (l: LinhaIndicadorCanal) => l.rotulo, largura: 22 },
        { titulo: 'Tipo', valor: (l: LinhaIndicadorCanal) => (l.driver ? 'Driver editável' : 'Calculado') },
        ...canais.map(c => ({ titulo: c.nome, valor: (l: LinhaIndicadorCanal) => l.valores[c.id], formatoPorLinha: fmt, largura: 16 })),
        { titulo: 'Consolidado', valor: (l: LinhaIndicadorCanal) => l.consolidado, formatoPorLinha: fmt, largura: 16 },
        { titulo: 'Meta M1 (fora da banda)', valor: (l: LinhaIndicadorCanal) => l.metaM1, formatoPorLinha: fmt, largura: 16 },
        { titulo: `Ano anterior${anoReferencia ? ` ${anoReferencia}` : ''}`, valor: (l: LinhaIndicadorCanal) => l.anoAnteriorConsolidado, formatoPorLinha: fmt, largura: 16 },
        { titulo: 'Variação a.a.', valor: (l: LinhaIndicadorCanal) => l.variacaoAnoAnteriorPct, formato: 'pct' },
      ],
      linhas: indicadores,
    },
  ]
  if (indicadores.some(l => l.anoAnteriorConsolidado != null || canais.some(c => l.anoAnterior[c.id] != null))) {
    abas.push({
      nome: 'Ano anterior por canal', titulo: `Ano anterior por canal${anoReferencia ? ` · ${anoReferencia}` : ''}`, subtitulo: 'Dado real de vendas',
      colunas: [
        { titulo: 'Indicador', valor: (l: LinhaIndicadorCanal) => l.rotulo, largura: 22 },
        ...canais.map(c => ({ titulo: c.nome, valor: (l: LinhaIndicadorCanal) => l.anoAnterior[c.id], formatoPorLinha: fmt, largura: 16 })),
        { titulo: 'Consolidado', valor: (l: LinhaIndicadorCanal) => l.anoAnteriorConsolidado, formatoPorLinha: fmt, largura: 16 },
      ],
      linhas: indicadores,
    })
  }
  if (verificacaoMacro) {
    abas.push({
      nome: 'Desvios do M1', titulo: `Desvios do plano macro · ${ano}`, subtitulo: desvios.length === 0 ? 'Nenhum desvio: todas as metas atingidas' : `${desvios.length} indicador(es) fora da banda`,
      colunas: [
        { titulo: 'Indicador', valor: (d: DesvioMacro) => d.rotulo, largura: 24 },
        { titulo: 'Meta M1', valor: (d: DesvioMacro) => d.meta, formatoPorLinha: (d: DesvioMacro) => EXCEL[formatoDesvio(d)] },
        { titulo: 'Proposto (canais)', valor: (d: DesvioMacro) => d.proposto, formatoPorLinha: (d: DesvioMacro) => EXCEL[formatoDesvio(d)] },
        { titulo: 'Diferença (pp ou R$)', valor: (d: DesvioMacro) => d.diferenca, formatoPorLinha: (d: DesvioMacro) => (d.taxa ? 'decimal2' : 'brl') },
      ],
      linhas: desvios,
    })
  }
  if (divisoes.length > 0) {
    abas.push({
      nome: 'Divisão estimada', titulo: `Divisão (estimado, do Módulo 4) · ${ano}`, subtitulo: 'Participação do M4 sobre a receita total; não é dado real por canal',
      colunas: [
        { titulo: 'Temporada', valor: (d: DivisaoEstimada) => d.temporada },
        { titulo: 'Divisão', valor: (d: DivisaoEstimada) => d.divisao },
        { titulo: 'Participação', valor: (d: DivisaoEstimada) => d.participacao, formato: 'pct' },
        { titulo: 'Receita estimada', valor: (d: DivisaoEstimada) => d.receitaEstimada, formato: 'brl' },
      ],
      linhas: divisoes,
    })
  }
  if (cenarios.length > 0) {
    abas.push({
      nome: 'Comparação de cenários', titulo: `Comparação de cenários · ${ano}`, subtitulo: 'Consolidado de cada cenário salvo',
      colunas: [
        { titulo: 'Indicador', valor: (f: typeof CAMPOS_COMPARACAO[number]) => f.rotulo, largura: 22 },
        ...cenarios.map(sc => ({
          titulo: `${sc.nome}${sc.aplicado ? ' (aplicado)' : ''}`,
          valor: (f: typeof CAMPOS_COMPARACAO[number]) => sc.consolidado[f.chave] ?? 0,
          formatoPorLinha: fmt,
          largura: 18,
        })),
      ],
      linhas: CAMPOS_COMPARACAO,
    })
  }
  return abas
}

export function baixarExcelCanais(dados: DadosCanais): void {
  baixarXlsx(nomeArquivo('metas_por_canal', dados.empresa, dados.ano), abasCanais(dados), { empresa: dados.empresa, documento: `Metas por Canal ${dados.ano}` })
}
