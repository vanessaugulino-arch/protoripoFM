// ─── divisoesRelatorio.tsx ────────────────────────────────────────────────────
// PDF e Excel do Módulo 4 (Planejamento por Divisão de Negócio, por temporada),
// a partir dos mesmos números que a tela mostra: participação e receita por
// divisão, indicadores comerciais, pirâmide de preço, matriz de risco,
// volume/estoque, metas macro × projetado e cenários.
// ─────────────────────────────────────────────────────────────────────────────

import { Capa, GradeKpis, RelatorioA4, Secao, TabelaRelatorio, type KpiRelatorio } from './RelatorioA4'
import { baixarXlsx, nomeArquivo, type Aba, type FormatoColuna } from './xlsxReport'
import { Compacta, EstiloCompacto, brl, brlSinal, dias, int, mult, pct, pctSinal, variacaoPct } from './comum'

export type FormatoMeta = 'brl' | 'pct' | 'multiplo' | 'inteiro'

export interface MetaDivisao {
  chave: string
  rotulo: string
  meta: number          // 0 = sem meta no M1
  projetado: number
  formato: FormatoMeta
  dentroDaBanda: boolean
}

export interface FaixaPrecoDivisao {
  faixa: string                  // "P1 Entrada"
  intervalo: string              // "89-169"
  pctPecas: number
  precoMedio: number | null
  fontePreco: 'vendido' | 'catalogo' | 'ponto_medio' | null
}

export interface DivisaoRelatorio {
  id: string
  nome: string
  participacao: number
  sugeridoSazonalidade: number | null
  receita: number | null         // null = meta da temporada não definida
  pmv: number
  mkd: number
  margem: number
  sellThrough: number
  pmvAnoAnterior: number | null
  mkdAnoAnterior: number | null
  margemAnoAnterior: number | null
  faixas: FaixaPrecoDivisao[]
  risco: { sustentadorMargem: number; motorGiro: number; iconeMarca: number; basico: number }
  volume: {
    producao: number | null
    orcamento: number | null
    vendasEsperadas: number
    estoqueInicial: number
    giro: number | null
    estoqueMedio: number | null
    cobertura: number | null     // null = sem estoque real importado
    reposicoes: number
    stCalc: number | null
    real: boolean                // estoque lido de inventory_snapshots
  }
}

export interface CenarioDivisao { nome: string; descricao?: string; ativo: boolean; criadoEm: string; receita: number; margem: number }

export interface DadosDivisoes {
  empresa: string
  temporada: string
  periodoTemporada: string       // ex.: "Ago/2026 → Fev/2027"
  ano: number
  referencia: string | null
  receitaTemporada: number
  receitaDaSazonalidade: boolean // true = total da curva aplicada no M3; false = rateio linear do M1
  participacaoTotal: number
  metasAtingidas: boolean
  metas: MetaDivisao[]
  consolidado: { receita: number; pmv: number; mkd: number; margem: number; sellThrough: number }
  compensacao: { margemAtual: number; margemMeta: number; mkdSugerido: number; limitado: boolean } | null
  divisoes: DivisaoRelatorio[]
  cenarios: CenarioDivisao[]
}

const FORMATO_EXCEL: Record<FormatoMeta, FormatoColuna> = { brl: 'brl', pct: 'pct', multiplo: 'multiplo', inteiro: 'inteiro' }

function fmtMeta(f: FormatoMeta, v: number): string {
  if (f === 'brl') return brl(v)
  if (f === 'multiplo') return mult(v)
  if (f === 'inteiro') return dias(v)
  return pct(v)
}
function fmtGap(f: FormatoMeta, v: number): string {
  if (f === 'brl') return brlSinal(v)
  if (f === 'pct') return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
  if (f === 'multiplo') return `${v > 0 ? '+' : ''}${mult(v)}`
  return `${v > 0 ? '+' : ''}${dias(v)}`
}

const FONTE_PRECO: Record<NonNullable<FaixaPrecoDivisao['fontePreco']>, string> = {
  vendido: 'vendido na referência',
  catalogo: 'catálogo atual',
  ponto_medio: 'ponto médio da faixa',
}

// ─── Linhas derivadas ────────────────────────────────────────────────────────

type LinhaPart = { nome: string; participacao: number; sugerido: number | null; receita: number | null; total?: boolean }
type LinhaInd = Pick<DivisaoRelatorio, 'nome' | 'pmv' | 'mkd' | 'margem' | 'sellThrough' | 'pmvAnoAnterior' | 'mkdAnoAnterior' | 'margemAnoAnterior'> & { vendasEsperadas: number | null }
type LinhaFaixa = { tipo: 'divisao' | 'faixa'; divisao: string; nome: string; intervalo: string; pctPecas: number | null; precoMedio: number | null; fonte: string }
type LinhaRisco = { nome: string; sustentadorMargem: number; motorGiro: number; iconeMarca: number; basico: number; total: number }
type LinhaVolume = DivisaoRelatorio['volume'] & { nome: string; total?: boolean }

function linhasParticipacao(d: DadosDivisoes): { linhas: LinhaPart[]; total: LinhaPart } {
  return {
    linhas: d.divisoes.map(x => ({ nome: x.nome, participacao: x.participacao, sugerido: x.sugeridoSazonalidade, receita: x.receita })),
    total: { nome: 'Total', participacao: d.participacaoTotal, sugerido: null, receita: d.consolidado.receita, total: true },
  }
}

function linhasIndicadores(d: DadosDivisoes): { linhas: LinhaInd[]; total: LinhaInd } {
  return {
    linhas: d.divisoes.map(x => ({ ...x, vendasEsperadas: x.volume.vendasEsperadas })),
    total: {
      nome: 'Consolidado', pmv: d.consolidado.pmv, mkd: d.consolidado.mkd, margem: d.consolidado.margem, sellThrough: d.consolidado.sellThrough,
      pmvAnoAnterior: null, mkdAnoAnterior: null, margemAnoAnterior: null,
      vendasEsperadas: d.divisoes.reduce((s, x) => s + x.volume.vendasEsperadas, 0),
    },
  }
}

function linhasFaixas(d: DadosDivisoes): LinhaFaixa[] {
  return d.divisoes.flatMap(x => [
    { tipo: 'divisao' as const, divisao: x.nome, nome: x.nome, intervalo: '', pctPecas: x.faixas.reduce((s, f) => s + f.pctPecas, 0), precoMedio: null, fonte: '' },
    ...x.faixas.map(f => ({
      tipo: 'faixa' as const, divisao: x.nome, nome: f.faixa, intervalo: f.intervalo || '—', pctPecas: f.pctPecas, precoMedio: f.precoMedio,
      fonte: f.fontePreco ? FONTE_PRECO[f.fontePreco] : '—',
    })),
  ])
}

function linhasRisco(d: DadosDivisoes): LinhaRisco[] {
  return d.divisoes.map(x => ({ nome: x.nome, ...x.risco, total: x.risco.sustentadorMargem + x.risco.motorGiro + x.risco.iconeMarca + x.risco.basico }))
}

function linhasVolume(d: DadosDivisoes): { linhas: LinhaVolume[]; total: LinhaVolume } {
  const soma = (f: (v: DivisaoRelatorio['volume']) => number | null) => d.divisoes.reduce((s, x) => s + (f(x.volume) ?? 0), 0)
  const estIni = soma(v => v.estoqueInicial)
  const repos = soma(v => v.reposicoes)
  const vendas = soma(v => v.vendasEsperadas)
  return {
    linhas: d.divisoes.map(x => ({ ...x.volume, nome: x.nome })),
    total: {
      nome: 'Total', total: true,
      producao: soma(v => v.producao), orcamento: soma(v => v.orcamento), vendasEsperadas: vendas,
      estoqueInicial: estIni, giro: null, estoqueMedio: soma(v => v.estoqueMedio), cobertura: null, reposicoes: repos,
      stCalc: estIni + repos > 0 ? (vendas / (estIni + repos)) * 100 : null, real: false,
    },
  }
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export function RelatorioDivisoes({ dados }: { dados: DadosDivisoes }) {
  const d = dados
  const foraDaBanda = d.metas.filter(m => m.meta > 0 && !m.dentroDaBanda).length
  const part = linhasParticipacao(d)
  const ind = linhasIndicadores(d)
  const vol = linhasVolume(d)
  const partOk = Math.abs(d.participacaoTotal - 100) < 0.01

  const kpis: KpiRelatorio[] = [
    { rotulo: 'Receita da temporada', valor: brl(d.receitaTemporada), nota: d.receitaDaSazonalidade ? 'curva aplicada na Sazonalidade (M3)' : 'rateio do M1 (Sazonalidade não aplicada)' },
    { rotulo: 'Margem consolidada', valor: pct(d.consolidado.margem) },
    { rotulo: 'MKD consolidado', valor: pct(d.consolidado.mkd) },
    { rotulo: 'PMV consolidado', valor: brl(d.consolidado.pmv) },
    { rotulo: 'Participação total', valor: pct(d.participacaoTotal), variacao: { texto: partOk ? 'Fecha 100%' : 'Não fecha 100%', bom: partOk } },
    {
      rotulo: 'Metas macro (M1)', valor: d.metasAtingidas ? 'Atingidas' : 'Não atingidas',
      variacao: { texto: foraDaBanda === 0 ? 'todos os indicadores dentro da banda' : `${foraDaBanda} indicador${foraDaBanda > 1 ? 'es' : ''} fora da banda`, bom: foraDaBanda === 0 },
    },
  ]

  return (
    <RelatorioA4 empresa={d.empresa} documento={`Plano por Divisão · ${d.temporada}`}>
      <EstiloCompacto />
      <Capa
        titulo="Planejamento por Divisão"
        subtitulo={`Temporada ${d.temporada}: participação e receita por divisão, indicadores comerciais, pirâmide de preço, matriz de risco, volume e cenários.`}
        empresa={d.empresa}
        periodo={`${d.temporada}${d.periodoTemporada ? ` · ${d.periodoTemporada}` : ''}`}
        versao={d.referencia ? `referência ${d.referencia}` : undefined}
      />

      <Secao titulo="Indicadores da temporada" nota={`Ano fiscal ${d.ano}. Consolidado das divisões comparado com as metas do Planejamento Estratégico (M1).`}>
        <GradeKpis itens={kpis} />
      </Secao>

      <Secao
        titulo="Metas macro × projetado"
        nota={d.compensacao
          ? `Sugestão da tela: a participação entre divisões levou a margem a ${pct(d.compensacao.margemAtual)} (meta ${pct(d.compensacao.margemMeta)}); compensar com MKD de ${pct(d.compensacao.mkdSugerido)}${d.compensacao.limitado ? ' (mínimo possível, não alcança a meta só com MKD)' : ''}.`
          : 'Indicadores foco do M1 que o plano por divisão consegue calcular; banda de tolerância bilateral.'}
      >
        <TabelaRelatorio
          colunas={[
            { titulo: 'Indicador', valor: (m: MetaDivisao) => m.rotulo, largura: '28%' },
            { titulo: 'Meta (M1)', valor: m => (m.meta > 0 ? fmtMeta(m.formato, m.meta) : '—'), numero: true },
            { titulo: 'Projetado', valor: m => fmtMeta(m.formato, m.projetado), numero: true },
            { titulo: 'Δ', valor: m => (m.meta > 0 ? fmtGap(m.formato, m.projetado - m.meta) : '—'), numero: true },
            { titulo: 'Situação', valor: m => (m.meta <= 0 ? 'sem meta' : m.dentroDaBanda ? 'dentro da banda' : 'fora da banda') },
          ]}
          linhas={d.metas}
          vazio="Sem indicadores para comparar."
        />
      </Secao>

      <Secao titulo="Participação e receita por divisão" nota="Receita = participação × receita da temporada.">
        <TabelaRelatorio
          colunas={[
            { titulo: 'Divisão', valor: (l: LinhaPart) => l.nome, largura: '34%' },
            { titulo: 'Participação', valor: l => pct(l.participacao), numero: true },
            { titulo: 'Sugerido pela Sazonalidade', valor: l => (l.total ? '' : pct(l.sugerido)), numero: true },
            { titulo: 'Receita', valor: l => (l.receita == null ? 'meta não definida' : brl(l.receita)), numero: true },
          ]}
          linhas={part.linhas}
          total={part.total}
          vazio="Nenhuma divisão no catálogo."
        />
      </Secao>

      <Secao titulo="Indicadores comerciais" nota="Plano por divisão e ano anterior real (histórico de vendas). A linha Consolidado pondera pela receita.">
        <Compacta>
          <TabelaRelatorio
            colunas={[
              { titulo: 'Divisão', valor: (l: LinhaInd) => l.nome, largura: '20%' },
              { titulo: 'PMV', valor: l => brl(l.pmv), numero: true },
              { titulo: 'PMV ano ant.', valor: l => brl(l.pmvAnoAnterior), numero: true },
              { titulo: 'MKD', valor: l => pct(l.mkd), numero: true },
              { titulo: 'MKD ano ant.', valor: l => pct(l.mkdAnoAnterior), numero: true },
              { titulo: 'Margem', valor: l => pct(l.margem), numero: true },
              { titulo: 'Margem ano ant.', valor: l => pct(l.margemAnoAnterior), numero: true },
              { titulo: 'Sell-through', valor: l => pct(l.sellThrough), numero: true },
              { titulo: 'Vendas esp. (pçs)', valor: l => int(l.vendasEsperadas), numero: true },
            ]}
            linhas={ind.linhas}
            total={ind.total}
            vazio="Nenhuma divisão no catálogo."
          />
        </Compacta>
      </Secao>

      <Secao titulo="Pirâmide de preço" nota="Faixa, % de peças e preço médio por faixa (vendido na temporada de referência quando houver; senão catálogo atual ou ponto médio da faixa)." novaPagina>
        <TabelaRelatorio
          colunas={[
            { titulo: 'Divisão / faixa', valor: (l: LinhaFaixa) => l.nome, largura: '28%' },
            { titulo: 'Intervalo (R$)', valor: l => l.intervalo },
            { titulo: '% peças', valor: l => pct(l.pctPecas, 0), numero: true },
            { titulo: 'Preço médio', valor: l => (l.tipo === 'faixa' ? brl(l.precoMedio) : ''), numero: true },
            { titulo: 'Origem do preço', valor: l => l.fonte },
          ]}
          linhas={linhasFaixas(d)}
          classeLinha={l => (l.tipo === 'divisao' ? 'grupo' : 'sub')}
          vazio="Nenhuma divisão no catálogo."
        />
      </Secao>

      <Secao titulo="Matriz de risco" nota="Perfil de produto por divisão (% do sortimento). Cada divisão deve somar 100%.">
        <TabelaRelatorio
          colunas={[
            { titulo: 'Divisão', valor: (l: LinhaRisco) => l.nome, largura: '26%' },
            { titulo: 'Sustentador de margem', valor: l => pct(l.sustentadorMargem, 0), numero: true },
            { titulo: 'Motor de giro', valor: l => pct(l.motorGiro, 0), numero: true },
            { titulo: 'Ícone de marca', valor: l => pct(l.iconeMarca, 0), numero: true },
            { titulo: 'Básico', valor: l => pct(l.basico, 0), numero: true },
            { titulo: 'Total', valor: l => pct(l.total, 0), numero: true },
          ]}
          linhas={linhasRisco(d)}
          vazio="Nenhuma divisão no catálogo."
        />
      </Secao>

      <Secao titulo="Volume, estoque e cobertura" nota="Peças, exceto orçamento (R$). Estoque, giro, cobertura e reposições marcados * vêm do estoque real importado; os demais são estimativa do plano.">
        <Compacta>
          <TabelaRelatorio
            colunas={[
              { titulo: 'Divisão', valor: (l: LinhaVolume) => `${l.nome}${l.real ? ' *' : ''}`, largura: '15%' },
              { titulo: 'Volume prod.', valor: l => int(l.producao), numero: true },
              { titulo: 'Orçamento', valor: l => brl(l.orcamento), numero: true },
              { titulo: 'Vendas esp.', valor: l => int(l.vendasEsperadas), numero: true },
              { titulo: 'Est. inicial', valor: l => int(l.estoqueInicial), numero: true },
              { titulo: 'Giro', valor: l => (l.total ? '' : mult(l.giro)), numero: true },
              { titulo: 'Est. médio', valor: l => int(l.estoqueMedio), numero: true },
              { titulo: 'Cobertura', valor: l => (l.total ? '' : l.cobertura == null ? 'sem dado' : dias(l.cobertura)), numero: true },
              { titulo: 'Reposições', valor: l => int(l.reposicoes), numero: true },
              { titulo: 'ST calc.', valor: l => pct(l.stCalc), numero: true },
            ]}
            linhas={vol.linhas}
            total={vol.total}
            vazio="Nenhuma divisão no catálogo."
          />
        </Compacta>
      </Secao>

      <Secao titulo="Cenários" nota="Receita e margem de cada cenário salvo, comparadas com o plano atual na tela." novaPagina>
        <TabelaRelatorio
          colunas={[
            { titulo: 'Cenário', valor: (s: CenarioDivisao) => s.nome, largura: '26%' },
            { titulo: 'Status', valor: s => (s.ativo ? 'Ativo' : 'Salvo') },
            { titulo: 'Criado em', valor: s => s.criadoEm },
            { titulo: 'Receita', valor: s => brl(s.receita), numero: true },
            { titulo: 'vs plano atual', valor: s => pctSinal(variacaoPct(s.receita, d.consolidado.receita)), numero: true },
            { titulo: 'Margem', valor: s => pct(s.margem), numero: true },
            { titulo: 'vs plano atual', valor: s => fmtGap('pct', s.margem - d.consolidado.margem), numero: true },
          ]}
          linhas={d.cenarios}
          vazio="Nenhum cenário salvo."
        />
      </Secao>
    </RelatorioA4>
  )
}

// ─── Excel ───────────────────────────────────────────────────────────────────

type LinhaResumo = { indicador: string; valor: number | string | null; formato: FormatoColuna }

/** Abas do Excel do Plano por Divisão (exportado para teste). */
export function abasDivisoes(d: DadosDivisoes): Aba<any>[] {
  const sub = `${d.temporada}${d.periodoTemporada ? ` (${d.periodoTemporada})` : ''}${d.referencia ? ` · referência ${d.referencia}` : ''}`
  const part = linhasParticipacao(d)
  const ind = linhasIndicadores(d)
  const vol = linhasVolume(d)

  const resumo: LinhaResumo[] = [
    { indicador: 'Receita da temporada', valor: d.receitaTemporada, formato: 'brl' },
    { indicador: 'Origem da receita', valor: d.receitaDaSazonalidade ? 'Sazonalidade (M3) aplicada' : 'Rateio do M1', formato: 'texto' },
    { indicador: 'Participação total', valor: d.participacaoTotal, formato: 'pct' },
    { indicador: 'Receita consolidada', valor: d.consolidado.receita, formato: 'brl' },
    { indicador: 'PMV consolidado', valor: d.consolidado.pmv, formato: 'brl' },
    { indicador: 'MKD consolidado', valor: d.consolidado.mkd, formato: 'pct' },
    { indicador: 'Margem consolidada', valor: d.consolidado.margem, formato: 'pct' },
    { indicador: 'Sell-through consolidado', valor: d.consolidado.sellThrough, formato: 'pct' },
    { indicador: 'Metas macro', valor: d.metasAtingidas ? 'Atingidas' : 'Não atingidas', formato: 'texto' },
  ]
  if (d.compensacao) resumo.push({ indicador: 'MKD sugerido para compensar a margem', valor: d.compensacao.mkdSugerido, formato: 'pct' })

  return [
    {
      nome: 'Resumo', titulo: `Planejamento por Divisão — ${d.temporada}`, subtitulo: sub,
      colunas: [
        { titulo: 'Indicador', valor: (l: LinhaResumo) => l.indicador, largura: 36 },
        { titulo: 'Valor', valor: (l: LinhaResumo) => l.valor, formatoPorLinha: (l: LinhaResumo) => l.formato, largura: 26 },
      ],
      linhas: resumo,
    },
    {
      nome: 'Metas macro', titulo: `Metas macro (M1) × projetado — ${d.temporada}`, subtitulo: 'Margem, MKD e sell-through em %; Δ de taxas em pontos percentuais',
      colunas: [
        { titulo: 'Indicador', valor: (m: MetaDivisao) => m.rotulo },
        { titulo: 'Meta (M1)', valor: (m: MetaDivisao) => (m.meta > 0 ? m.meta : null), formatoPorLinha: (m: MetaDivisao) => FORMATO_EXCEL[m.formato] },
        { titulo: 'Projetado', valor: (m: MetaDivisao) => m.projetado, formatoPorLinha: (m: MetaDivisao) => FORMATO_EXCEL[m.formato] },
        { titulo: 'Δ', valor: (m: MetaDivisao) => (m.meta > 0 ? m.projetado - m.meta : null), formatoPorLinha: (m: MetaDivisao) => FORMATO_EXCEL[m.formato] },
        { titulo: 'Situação', valor: (m: MetaDivisao) => (m.meta <= 0 ? 'sem meta' : m.dentroDaBanda ? 'dentro da banda' : 'fora da banda') },
      ],
      linhas: d.metas,
    },
    {
      nome: 'Participação', titulo: `Participação e receita por divisão — ${d.temporada}`, subtitulo: 'Receita = participação × receita da temporada',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaPart) => l.nome },
        { titulo: 'Participação', valor: (l: LinhaPart) => l.participacao, formato: 'pct' },
        { titulo: 'Sugerido pela Sazonalidade', valor: (l: LinhaPart) => l.sugerido, formato: 'pct' },
        { titulo: 'Receita', valor: (l: LinhaPart) => l.receita, formato: 'brl' },
      ],
      linhas: part.linhas,
      total: part.total,
    },
    {
      nome: 'Indicadores comerciais', titulo: `Indicadores comerciais por divisão — ${d.temporada}`, subtitulo: 'Plano × ano anterior real',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaInd) => l.nome },
        { titulo: 'PMV', valor: (l: LinhaInd) => l.pmv, formato: 'brl' },
        { titulo: 'PMV ano anterior', valor: (l: LinhaInd) => l.pmvAnoAnterior, formato: 'brl' },
        { titulo: 'MKD', valor: (l: LinhaInd) => l.mkd, formato: 'pct' },
        { titulo: 'MKD ano anterior', valor: (l: LinhaInd) => l.mkdAnoAnterior, formato: 'pct' },
        { titulo: 'Margem', valor: (l: LinhaInd) => l.margem, formato: 'pct' },
        { titulo: 'Margem ano anterior', valor: (l: LinhaInd) => l.margemAnoAnterior, formato: 'pct' },
        { titulo: 'Sell-through', valor: (l: LinhaInd) => l.sellThrough, formato: 'pct' },
        { titulo: 'Vendas esperadas (peças)', valor: (l: LinhaInd) => l.vendasEsperadas, formato: 'inteiro' },
      ],
      linhas: ind.linhas,
      total: ind.total,
    },
    {
      nome: 'Pirâmide de preço', titulo: `Pirâmide de preço por divisão — ${d.temporada}`,
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaFaixa) => l.divisao },
        { titulo: 'Faixa', valor: (l: LinhaFaixa) => l.nome },
        { titulo: 'Intervalo (R$)', valor: (l: LinhaFaixa) => l.intervalo },
        { titulo: '% peças', valor: (l: LinhaFaixa) => l.pctPecas, formato: 'pct' },
        { titulo: 'Preço médio', valor: (l: LinhaFaixa) => l.precoMedio, formato: 'brl' },
        { titulo: 'Origem do preço', valor: (l: LinhaFaixa) => l.fonte },
      ],
      linhas: linhasFaixas(d).filter(l => l.tipo === 'faixa'),
    },
    {
      nome: 'Matriz de risco', titulo: `Matriz de risco por divisão — ${d.temporada}`, subtitulo: '% do sortimento por perfil de produto',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaRisco) => l.nome },
        { titulo: 'Sustentador de margem', valor: (l: LinhaRisco) => l.sustentadorMargem, formato: 'pct' },
        { titulo: 'Motor de giro', valor: (l: LinhaRisco) => l.motorGiro, formato: 'pct' },
        { titulo: 'Ícone de marca', valor: (l: LinhaRisco) => l.iconeMarca, formato: 'pct' },
        { titulo: 'Básico', valor: (l: LinhaRisco) => l.basico, formato: 'pct' },
        { titulo: 'Total', valor: (l: LinhaRisco) => l.total, formato: 'pct' },
      ],
      linhas: linhasRisco(d),
    },
    {
      nome: 'Volume e estoque', titulo: `Volume, estoque e cobertura — ${d.temporada}`, subtitulo: 'Peças, exceto orçamento (R$)',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaVolume) => l.nome },
        { titulo: 'Volume de produção', valor: (l: LinhaVolume) => l.producao, formato: 'inteiro' },
        { titulo: 'Orçamento', valor: (l: LinhaVolume) => l.orcamento, formato: 'brl' },
        { titulo: 'Vendas esperadas', valor: (l: LinhaVolume) => l.vendasEsperadas, formato: 'inteiro' },
        { titulo: 'Estoque inicial', valor: (l: LinhaVolume) => l.estoqueInicial, formato: 'inteiro' },
        { titulo: 'Giro', valor: (l: LinhaVolume) => l.giro, formato: 'multiplo' },
        { titulo: 'Estoque médio', valor: (l: LinhaVolume) => l.estoqueMedio, formato: 'inteiro' },
        { titulo: 'Cobertura (dias)', valor: (l: LinhaVolume) => (l.cobertura === Infinity ? 'sem venda' : l.cobertura), formato: 'inteiro' },
        { titulo: 'Reposições', valor: (l: LinhaVolume) => l.reposicoes, formato: 'inteiro' },
        { titulo: 'Sell-through calc.', valor: (l: LinhaVolume) => l.stCalc, formato: 'pct' },
        { titulo: 'Fonte do estoque', valor: (l: LinhaVolume) => (l.total ? '' : l.real ? 'estoque real importado' : 'estimativa do plano') },
      ],
      linhas: vol.linhas,
      total: vol.total,
    },
    {
      nome: 'Cenários', titulo: `Cenários — ${d.temporada}`, subtitulo: 'Comparados com o plano atual na tela',
      colunas: [
        { titulo: 'Cenário', valor: (s: CenarioDivisao) => s.nome },
        { titulo: 'Descrição', valor: (s: CenarioDivisao) => s.descricao ?? '' },
        { titulo: 'Status', valor: (s: CenarioDivisao) => (s.ativo ? 'Ativo' : 'Salvo') },
        { titulo: 'Criado em', valor: (s: CenarioDivisao) => s.criadoEm },
        { titulo: 'Receita', valor: (s: CenarioDivisao) => s.receita, formato: 'brl' },
        { titulo: 'Receita vs plano atual', valor: (s: CenarioDivisao) => variacaoPct(s.receita, d.consolidado.receita), formato: 'pct' },
        { titulo: 'Margem', valor: (s: CenarioDivisao) => s.margem, formato: 'pct' },
        { titulo: 'Margem vs plano atual (p.p.)', valor: (s: CenarioDivisao) => s.margem - d.consolidado.margem, formato: 'decimal2' },
      ],
      linhas: d.cenarios,
    },
  ]
}

export function nomeArquivoDivisoes(empresa: string, temporada: string): string {
  return nomeArquivo('plano_divisao', empresa, temporada)
}

export function baixarExcelDivisoes(dados: DadosDivisoes): void {
  baixarXlsx(nomeArquivoDivisoes(dados.empresa, dados.temporada), abasDivisoes(dados), { empresa: dados.empresa, documento: `Plano por Divisão · ${dados.temporada}` })
}
