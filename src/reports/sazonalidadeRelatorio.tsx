// ─── sazonalidadeRelatorio.tsx ────────────────────────────────────────────────
// PDF e Excel do Módulo 3 (Sazonalidade / validação do ciclo), a partir dos
// mesmos números que a tela calcula (motor bottom-up por canal × mês).
//
// Tabelas mensais saem com os MESES NAS LINHAS (a tela mostra meses nas
// colunas): 12 meses + total não cabem em A4 retrato. Colunas por canal são
// divididas em blocos de até 5 canais por tabela.
// ─────────────────────────────────────────────────────────────────────────────

import { Capa, GradeKpis, RelatorioA4, Secao, TabelaRelatorio, type ColunaTabela, type KpiRelatorio } from './RelatorioA4'
import { baixarXlsx, nomeArquivo, type Aba, type Coluna, type FormatoColuna } from './xlsxReport'
import { Compacta, EstiloCompacto, Subtitulo, brl, brlSinal, dias, emBlocos, int, pct, pctSinal, variacaoPct } from './comum'

export interface MesCanalSaz {
  mes: string            // nome completo ("Janeiro")
  mesCurto: string       // "Jan"
  receita: number
  anoAnterior: number
  pecasVender: number
  coberturaMeta: number  // dias
  estoqueInicio: number
  entrada: number
  estoqueFim: number
  coberturaReal: number  // dias
  custoEntrada: number
}

export interface CanalSaz {
  id: string
  nome: string
  pmv: number
  meses: MesCanalSaz[]
  totalReceita: number
  totalEntrada: number
  totalCustoEntrada: number
}

export interface CenarioSaz {
  nome: string
  aplicado: boolean
  salvoEm: string
  receita: number
  coberturaMedia: number
  receitaPorCanal: { canal: string; receita: number }[]
}

export interface DivisaoEstimadaSaz { temporada: string; divisao: string; participacao: number; receitaEstimada: number }

export interface DadosSazonalidade {
  empresa: string
  ano: number
  anoReferencia: number | null
  metaReceita: number          // M1 (0 = sem plano macro)
  totalReceita: number
  totalEntrada: number
  totalCustoEntrada: number
  coberturaMedia: number       // dias
  estoqueColecaoPassada: number
  custoMedio: number           // R$/peça usado no custo da entrada
  meses: { nome: string; curto: string }[]
  canais: CanalSaz[]
  cenarios: CenarioSaz[]
  divisoesEstimadas: DivisaoEstimadaSaz[]
}

// ─── Linhas derivadas (mesmas somas da tela) ─────────────────────────────────

export interface LinhaMesConsolidado {
  mes: string; mesCurto: string
  receita: number; anoAnterior: number; difRS: number; difPct: number | null
  entrada: number; custoEntrada: number
}

export function linhasConsolidado(d: DadosSazonalidade): LinhaMesConsolidado[] {
  return d.meses.map(m => {
    const doMes = d.canais.map(c => c.meses.find(x => x.mes === m.nome))
    const receita = doMes.reduce((s, x) => s + (x?.receita ?? 0), 0)
    const anoAnterior = doMes.reduce((s, x) => s + (x?.anoAnterior ?? 0), 0)
    return {
      mes: m.nome, mesCurto: m.curto, receita, anoAnterior,
      difRS: receita - anoAnterior, difPct: variacaoPct(receita, anoAnterior),
      entrada: doMes.reduce((s, x) => s + (x?.entrada ?? 0), 0),
      custoEntrada: doMes.reduce((s, x) => s + (x?.custoEntrada ?? 0), 0),
    }
  })
}

function totalConsolidado(d: DadosSazonalidade, linhas: LinhaMesConsolidado[]): LinhaMesConsolidado {
  const anoAnterior = linhas.reduce((s, l) => s + l.anoAnterior, 0)
  return {
    mes: 'Total', mesCurto: 'Total', receita: d.totalReceita, anoAnterior,
    difRS: d.totalReceita - anoAnterior, difPct: variacaoPct(d.totalReceita, anoAnterior),
    entrada: d.totalEntrada, custoEntrada: d.totalCustoEntrada,
  }
}

/** Uma linha por mês com o valor de cada canal (chave = id do canal). */
type LinhaMesCanais = { mes: string; mesCurto: string; valores: Record<string, number>; total: number }

function linhasPorCanal(d: DadosSazonalidade, campo: 'receita' | 'entrada'): { linhas: LinhaMesCanais[]; total: LinhaMesCanais } {
  const linhas = d.meses.map(m => {
    const valores: Record<string, number> = {}
    for (const c of d.canais) valores[c.id] = c.meses.find(x => x.mes === m.nome)?.[campo] ?? 0
    return { mes: m.nome, mesCurto: m.curto, valores, total: Object.values(valores).reduce((s, v) => s + v, 0) }
  })
  const valoresTotal: Record<string, number> = {}
  for (const c of d.canais) valoresTotal[c.id] = campo === 'receita' ? c.totalReceita : c.totalEntrada
  return {
    linhas,
    total: { mes: 'Total', mesCurto: 'Total', valores: valoresTotal, total: campo === 'receita' ? d.totalReceita : d.totalEntrada },
  }
}

const statusCobertura = (v: number) => (v < 60 ? 'baixa' : v > 150 ? 'elevada' : 'adequada')

// ─── PDF ─────────────────────────────────────────────────────────────────────

const CANAIS_POR_TABELA = 5

function TabelaPorCanal({ d, campo, fmt }: { d: DadosSazonalidade; campo: 'receita' | 'entrada'; fmt: (v: number) => string }) {
  const { linhas, total } = linhasPorCanal(d, campo)
  const blocos = emBlocos(d.canais, CANAIS_POR_TABELA)
  return (
    <>
      {blocos.map((bloco, i) => {
        const ultimo = i === blocos.length - 1
        const colunas: ColunaTabela<LinhaMesCanais>[] = [
          { titulo: 'Mês', valor: l => l.mesCurto },
          ...bloco.map(c => ({ titulo: c.nome, valor: (l: LinhaMesCanais) => fmt(l.valores[c.id] ?? 0), numero: true })),
          ...(ultimo ? [{ titulo: 'Total', valor: (l: LinhaMesCanais) => fmt(l.total), numero: true }] : []),
        ]
        return (
          <Compacta key={i}>
            {blocos.length > 1 && <Subtitulo>Canais {i * CANAIS_POR_TABELA + 1} a {i * CANAIS_POR_TABELA + bloco.length} de {d.canais.length}</Subtitulo>}
            <TabelaRelatorio colunas={colunas} linhas={linhas} total={total} />
          </Compacta>
        )
      })}
    </>
  )
}

type LinhaMotor = MesCanalSaz & { total?: boolean }

function TabelaMotor({ canal }: { canal: CanalSaz }) {
  const totalLinha: LinhaMotor = {
    mes: 'Total', mesCurto: 'Total', total: true,
    receita: canal.totalReceita,
    anoAnterior: canal.meses.reduce((s, m) => s + m.anoAnterior, 0),
    pecasVender: canal.meses.reduce((s, m) => s + m.pecasVender, 0),
    coberturaMeta: NaN, estoqueInicio: NaN, estoqueFim: NaN, coberturaReal: NaN,
    entrada: canal.totalEntrada,
    custoEntrada: canal.totalCustoEntrada,
  }
  return (
    <Compacta>
      <Subtitulo>{canal.nome} · PMV {brl(canal.pmv)}</Subtitulo>
      <TabelaRelatorio<LinhaMotor>
        colunas={[
          { titulo: 'Mês', valor: m => m.mesCurto },
          { titulo: 'Receita', valor: m => brl(m.receita), numero: true },
          { titulo: 'Ano ant.', valor: m => (m.anoAnterior > 0 ? brl(m.anoAnterior) : '—'), numero: true },
          { titulo: 'Peças a vender', valor: m => int(m.pecasVender), numero: true },
          { titulo: 'Cob. meta', valor: m => (m.total ? '' : dias(m.coberturaMeta)), numero: true },
          { titulo: 'Est. início', valor: m => (m.total ? '' : int(m.estoqueInicio)), numero: true },
          { titulo: 'Entrada (pçs)', valor: m => (m.entrada > 0 ? int(m.entrada) : '—'), numero: true },
          { titulo: 'Est. fim', valor: m => (m.total ? '' : int(m.estoqueFim)), numero: true },
          { titulo: 'Cob. real', valor: m => (m.total ? '' : dias(m.coberturaReal)), numero: true },
          { titulo: 'Custo entrada', valor: m => (m.custoEntrada > 0 ? brl(m.custoEntrada) : '—'), numero: true },
        ]}
        linhas={canal.meses}
        total={totalLinha}
      />
    </Compacta>
  )
}

type LinhaCenarioCanal = { tipo: 'cenario' | 'canal'; nome: string; receita: number; part: number | null }

export function RelatorioSazonalidade({ dados }: { dados: DadosSazonalidade }) {
  const d = dados
  const consolidado = linhasConsolidado(d)
  const totalCons = totalConsolidado(d, consolidado)
  const divergencia = d.totalReceita - d.metaReceita
  const temMeta = d.metaReceita > 0

  const kpis: KpiRelatorio[] = [
    {
      rotulo: 'Receita planejada', valor: brl(d.totalReceita),
      variacao: temMeta
        ? Math.abs(divergencia) > 500
          ? { texto: `${brlSinal(divergencia)} (${pctSinal(variacaoPct(d.totalReceita, d.metaReceita))}) vs meta`, bom: divergencia > 0 }
          : { texto: 'Alinhada à meta do M1', bom: true }
        : null,
      nota: temMeta ? undefined : 'sem plano macro (M1)',
    },
    { rotulo: 'Meta de receita (M1)', valor: temMeta ? brl(d.metaReceita) : '—' },
    { rotulo: 'Entrada total', valor: `${int(d.totalEntrada)} pçs`, nota: `${brl(d.totalCustoEntrada)} em custo` },
    { rotulo: 'Cobertura média', valor: dias(d.coberturaMedia), nota: `cobertura ${statusCobertura(d.coberturaMedia)}` },
    { rotulo: 'Estoque coleção passada', valor: `${int(d.estoqueColecaoPassada)} pçs`, nota: 'no início do ciclo' },
    { rotulo: 'Custo médio por peça', valor: brl(d.custoMedio), nota: `${d.canais.length} ${d.canais.length === 1 ? 'canal' : 'canais'} no ciclo` },
  ]

  const linhasCenarioCanal: LinhaCenarioCanal[] = d.cenarios.flatMap(s => [
    { tipo: 'cenario' as const, nome: `${s.nome}${s.aplicado ? ' (aplicado)' : ''}`, receita: s.receita, part: null },
    ...s.receitaPorCanal.map(c => ({ tipo: 'canal' as const, nome: c.canal, receita: c.receita, part: s.receita > 0 ? (c.receita / s.receita) * 100 : null })),
  ])

  return (
    <RelatorioA4 empresa={d.empresa} documento={`Sazonalidade ${d.ano}`}>
      <EstiloCompacto />
      <Capa
        titulo={`Sazonalidade ${d.ano}`}
        subtitulo="Validação do ciclo: curva de receita por canal e mês, entrada de mercadoria calculada pelo motor bottom-up e comparação de cenários."
        empresa={d.empresa}
        periodo={`Ano fiscal ${d.ano} (Jan–Dez)`}
        versao={d.anoReferencia ? `referência ${d.anoReferencia}` : undefined}
      />

      <Secao titulo="Indicadores do ciclo" nota={`Ano fiscal ${d.ano}. Receita comparada com a meta do Planejamento Estratégico (M1).`}>
        <GradeKpis itens={kpis} />
      </Secao>

      <Secao titulo="Resumo por canal" nota="PMV usado no motor (M2 aplicado, senão histórico, senão M1), receita do ano e entrada calculada.">
        <TabelaRelatorio
          colunas={[
            { titulo: 'Canal', valor: (c: CanalSaz & { anoAnterior: number }) => c.nome, largura: '22%' },
            { titulo: 'PMV', valor: c => (c.id === '__total' ? '' : brl(c.pmv)), numero: true },
            { titulo: 'Receita', valor: c => brl(c.totalReceita), numero: true },
            { titulo: d.anoReferencia ? `Real ${d.anoReferencia}` : 'Ano anterior', valor: c => brl(c.anoAnterior), numero: true },
            { titulo: 'Δ %', valor: c => pctSinal(variacaoPct(c.totalReceita, c.anoAnterior), 0), numero: true },
            { titulo: 'Entrada (pçs)', valor: c => int(c.totalEntrada), numero: true },
            { titulo: 'Custo entrada', valor: c => brl(c.totalCustoEntrada), numero: true },
          ]}
          linhas={d.canais.map(c => ({ ...c, anoAnterior: c.meses.reduce((s, m) => s + m.anoAnterior, 0) }))}
          total={{ id: '__total', nome: 'Total', pmv: 0, meses: [], totalReceita: d.totalReceita, totalEntrada: d.totalEntrada, totalCustoEntrada: d.totalCustoEntrada, anoAnterior: totalCons.anoAnterior }}
          vazio="Nenhum canal de venda configurado."
        />
      </Secao>

      <Secao titulo="Curva mensal consolidada" nota="Soma de todos os canais, mês a mês.">
        <TabelaRelatorio
          colunas={[
            { titulo: 'Mês', valor: (l: LinhaMesConsolidado) => l.mesCurto },
            { titulo: 'Receita', valor: l => brl(l.receita), numero: true },
            { titulo: 'Ano anterior', valor: l => (l.anoAnterior > 0 ? brl(l.anoAnterior) : '—'), numero: true },
            { titulo: 'Δ R$', valor: l => (l.anoAnterior > 0 ? brlSinal(l.difRS) : '—'), numero: true },
            { titulo: 'Δ %', valor: l => pctSinal(l.difPct, 0), numero: true },
            { titulo: 'Entrada (pçs)', valor: l => (l.entrada > 0 ? int(l.entrada) : '—'), numero: true },
            { titulo: 'Custo entrada', valor: l => (l.custoEntrada > 0 ? brl(l.custoEntrada) : '—'), numero: true },
          ]}
          linhas={consolidado}
          total={totalCons}
          vazio="Sem meses no ciclo."
        />
      </Secao>

      {d.canais.length > 0 && (
        <Secao titulo="Receita por canal e mês" nota="Curva de vendas planejada (R$)." novaPagina>
          <TabelaPorCanal d={d} campo="receita" fmt={v => brl(v)} />
        </Secao>
      )}

      {d.canais.length > 0 && (
        <Secao titulo="Entrada de mercadoria por canal e mês" nota="Peças que precisam entrar para garantir a cobertura meta (calculado, não editável).">
          <TabelaPorCanal d={d} campo="entrada" fmt={v => (v > 0 ? int(v) : '—')} />
        </Secao>
      )}

      {d.canais.length > 0 && (
        <Secao titulo="Motor bottom-up por canal" nota="Receita ÷ PMV = peças a vender; peças da janela de cobertura − estoque no início = entrada. Coberturas em dias." novaPagina>
          {d.canais.map(c => <TabelaMotor key={c.id} canal={c} />)}
        </Secao>
      )}

      <Secao titulo="Cenários" nota={temMeta ? `Comparação com a meta de receita do M1 (${brl(d.metaReceita)}).` : 'Sem meta de receita no M1 para comparar.'} novaPagina>
        <TabelaRelatorio
          colunas={[
            { titulo: 'Cenário', valor: (s: CenarioSaz) => s.nome, largura: '24%' },
            { titulo: 'Status', valor: s => (s.aplicado ? 'Aplicado' : 'Salvo') },
            { titulo: 'Salvo em', valor: s => s.salvoEm },
            { titulo: 'Receita', valor: s => brl(s.receita), numero: true },
            { titulo: 'Cobertura', valor: s => dias(s.coberturaMedia), numero: true },
            { titulo: 'vs meta', valor: s => (temMeta ? brlSinal(s.receita - d.metaReceita) : '—'), numero: true },
            { titulo: 'vs meta %', valor: s => (temMeta ? pctSinal(variacaoPct(s.receita, d.metaReceita)) : '—'), numero: true },
          ]}
          linhas={d.cenarios}
          vazio="Nenhum cenário salvo."
        />
        {linhasCenarioCanal.length > 0 && (
          <>
            <Subtitulo>Receita por canal em cada cenário</Subtitulo>
            <TabelaRelatorio
              colunas={[
                { titulo: 'Cenário / canal', valor: (l: LinhaCenarioCanal) => l.nome, largura: '50%' },
                { titulo: 'Receita', valor: l => brl(l.receita), numero: true },
                { titulo: 'Participação', valor: l => (l.tipo === 'canal' ? pct(l.part) : ''), numero: true },
              ]}
              linhas={linhasCenarioCanal}
              classeLinha={l => (l.tipo === 'cenario' ? 'grupo' : 'sub')}
            />
          </>
        )}
      </Secao>

      {d.divisoesEstimadas.length > 0 && (
        <Secao titulo="Divisão (estimado, do Módulo 4)" nota="Não é um cruzamento real canal × divisão: é a participação aplicada no M4 para cada temporada, sobre a meta de receita do ano.">
          <TabelaRelatorio
            colunas={[
              { titulo: 'Temporada', valor: (l: DivisaoEstimadaSaz) => l.temporada },
              { titulo: 'Divisão', valor: l => l.divisao },
              { titulo: 'Participação', valor: l => pct(l.participacao, 0), numero: true },
              { titulo: 'Receita estimada', valor: l => brl(l.receitaEstimada), numero: true },
            ]}
            linhas={d.divisoesEstimadas}
          />
        </Secao>
      )}
    </RelatorioA4>
  )
}

// ─── Excel ───────────────────────────────────────────────────────────────────

type LinhaResumo = { indicador: string; valor: number | null; formato: FormatoColuna; obs?: string }

/** Abas do Excel da Sazonalidade (exportado para teste). */
export function abasSazonalidade(d: DadosSazonalidade): Aba<any>[] {
  const temMeta = d.metaReceita > 0
  const consolidado = linhasConsolidado(d)
  const totalCons = totalConsolidado(d, consolidado)
  const sub = `Ano fiscal ${d.ano}${d.anoReferencia ? ` · referência ${d.anoReferencia}` : ''}`

  const resumo: LinhaResumo[] = [
    { indicador: 'Receita planejada', valor: d.totalReceita, formato: 'brl' },
    { indicador: 'Meta de receita (M1)', valor: temMeta ? d.metaReceita : null, formato: 'brl' },
    { indicador: 'Diferença vs meta', valor: temMeta ? d.totalReceita - d.metaReceita : null, formato: 'brl' },
    { indicador: 'Diferença vs meta (%)', valor: temMeta ? variacaoPct(d.totalReceita, d.metaReceita) : null, formato: 'pct' },
    { indicador: 'Entrada total (peças)', valor: d.totalEntrada, formato: 'inteiro' },
    { indicador: 'Custo da entrada', valor: d.totalCustoEntrada, formato: 'brl' },
    { indicador: 'Cobertura média (dias)', valor: d.coberturaMedia, formato: 'inteiro', obs: statusCobertura(d.coberturaMedia) },
    { indicador: 'Estoque coleção passada (peças)', valor: d.estoqueColecaoPassada, formato: 'inteiro' },
    { indicador: 'Custo médio por peça', valor: d.custoMedio, formato: 'brl' },
    { indicador: 'Canais no ciclo', valor: d.canais.length, formato: 'inteiro', obs: d.canais.map(c => c.nome).join(', ') },
  ]

  const abas: Aba<any>[] = [
    {
      nome: 'Resumo', titulo: `Sazonalidade ${d.ano} — indicadores do ciclo`, subtitulo: sub,
      colunas: [
        { titulo: 'Indicador', valor: (l: LinhaResumo) => l.indicador, largura: 32 },
        { titulo: 'Valor', valor: (l: LinhaResumo) => l.valor, formatoPorLinha: (l: LinhaResumo) => l.formato, largura: 18 },
        { titulo: 'Observação', valor: (l: LinhaResumo) => l.obs ?? '' },
      ],
      linhas: resumo,
    },
    {
      nome: 'Canais', titulo: `Resumo por canal — ${d.ano}`, subtitulo: sub,
      colunas: [
        { titulo: 'Canal', valor: (c: CanalSaz & { anoAnterior: number }) => c.nome },
        { titulo: 'PMV', valor: c => (c.id === '__total' ? null : c.pmv), formato: 'brl' },
        { titulo: 'Receita', valor: c => c.totalReceita, formato: 'brl' },
        { titulo: 'Ano anterior', valor: c => c.anoAnterior, formato: 'brl' },
        { titulo: 'Δ %', valor: c => variacaoPct(c.totalReceita, c.anoAnterior), formato: 'pct' },
        { titulo: 'Entrada (peças)', valor: c => c.totalEntrada, formato: 'inteiro' },
        { titulo: 'Custo da entrada', valor: c => c.totalCustoEntrada, formato: 'brl' },
      ] as Coluna<CanalSaz & { anoAnterior: number }>[],
      linhas: d.canais.map(c => ({ ...c, anoAnterior: c.meses.reduce((s, m) => s + m.anoAnterior, 0) })),
      total: { id: '__total', nome: 'Total', pmv: 0, meses: [], totalReceita: d.totalReceita, totalEntrada: d.totalEntrada, totalCustoEntrada: d.totalCustoEntrada, anoAnterior: totalCons.anoAnterior },
    },
    {
      nome: 'Curva mensal', titulo: `Curva mensal consolidada — ${d.ano}`, subtitulo: 'Soma de todos os canais',
      colunas: [
        { titulo: 'Mês', valor: (l: LinhaMesConsolidado) => l.mes },
        { titulo: 'Receita', valor: (l: LinhaMesConsolidado) => l.receita, formato: 'brl' },
        { titulo: 'Ano anterior', valor: (l: LinhaMesConsolidado) => l.anoAnterior, formato: 'brl' },
        { titulo: 'Δ R$', valor: (l: LinhaMesConsolidado) => l.difRS, formato: 'brl' },
        { titulo: 'Δ %', valor: (l: LinhaMesConsolidado) => l.difPct, formato: 'pct' },
        { titulo: 'Entrada (peças)', valor: (l: LinhaMesConsolidado) => l.entrada, formato: 'inteiro' },
        { titulo: 'Custo da entrada', valor: (l: LinhaMesConsolidado) => l.custoEntrada, formato: 'brl' },
      ],
      linhas: consolidado,
      total: totalCons,
    },
  ]

  for (const campo of ['receita', 'entrada'] as const) {
    const { linhas, total } = linhasPorCanal(d, campo)
    const formato: FormatoColuna = campo === 'receita' ? 'brl' : 'inteiro'
    abas.push({
      nome: campo === 'receita' ? 'Receita por canal' : 'Entrada por canal',
      titulo: campo === 'receita' ? `Receita por canal e mês — ${d.ano}` : `Entrada de mercadoria (peças) por canal e mês — ${d.ano}`,
      subtitulo: campo === 'receita' ? 'Curva de vendas planejada' : 'Calculada pelo motor bottom-up',
      colunas: [
        { titulo: 'Mês', valor: (l: LinhaMesCanais) => l.mes },
        ...d.canais.map(c => ({ titulo: c.nome, valor: (l: LinhaMesCanais) => l.valores[c.id] ?? 0, formato })),
        { titulo: 'Total', valor: (l: LinhaMesCanais) => l.total, formato },
      ],
      linhas,
      total,
    })
  }

  type LinhaMotorX = MesCanalSaz & { canal: string; pmv: number }
  abas.push({
    nome: 'Motor por canal', titulo: `Motor bottom-up por canal — ${d.ano}`, subtitulo: 'Receita ÷ PMV → peças → cobertura → entrada',
    colunas: [
      { titulo: 'Canal', valor: (l: LinhaMotorX) => l.canal },
      { titulo: 'Mês', valor: (l: LinhaMotorX) => l.mes },
      { titulo: 'PMV', valor: (l: LinhaMotorX) => l.pmv, formato: 'brl' },
      { titulo: 'Receita', valor: (l: LinhaMotorX) => l.receita, formato: 'brl' },
      { titulo: 'Ano anterior', valor: (l: LinhaMotorX) => l.anoAnterior, formato: 'brl' },
      { titulo: 'Peças a vender', valor: (l: LinhaMotorX) => l.pecasVender, formato: 'inteiro' },
      { titulo: 'Cobertura meta (dias)', valor: (l: LinhaMotorX) => l.coberturaMeta, formato: 'inteiro' },
      { titulo: 'Estoque início', valor: (l: LinhaMotorX) => l.estoqueInicio, formato: 'inteiro' },
      { titulo: 'Entrada (peças)', valor: (l: LinhaMotorX) => l.entrada, formato: 'inteiro' },
      { titulo: 'Estoque fim', valor: (l: LinhaMotorX) => l.estoqueFim, formato: 'inteiro' },
      { titulo: 'Cobertura real (dias)', valor: (l: LinhaMotorX) => l.coberturaReal, formato: 'inteiro' },
      { titulo: 'Custo da entrada', valor: (l: LinhaMotorX) => l.custoEntrada, formato: 'brl' },
    ],
    linhas: d.canais.flatMap(c => c.meses.map(m => ({ ...m, canal: c.nome, pmv: c.pmv }))),
  })

  abas.push({
    nome: 'Cenários', titulo: `Cenários — Sazonalidade ${d.ano}`, subtitulo: temMeta ? 'Comparação com a meta do M1' : 'Sem meta no M1',
    colunas: [
      { titulo: 'Cenário', valor: (s: CenarioSaz) => s.nome },
      { titulo: 'Status', valor: (s: CenarioSaz) => (s.aplicado ? 'Aplicado' : 'Salvo') },
      { titulo: 'Salvo em', valor: (s: CenarioSaz) => s.salvoEm },
      { titulo: 'Receita', valor: (s: CenarioSaz) => s.receita, formato: 'brl' },
      { titulo: 'Cobertura média (dias)', valor: (s: CenarioSaz) => s.coberturaMedia, formato: 'inteiro' },
      { titulo: 'vs meta (R$)', valor: (s: CenarioSaz) => (temMeta ? s.receita - d.metaReceita : null), formato: 'brl' },
      { titulo: 'vs meta (%)', valor: (s: CenarioSaz) => (temMeta ? variacaoPct(s.receita, d.metaReceita) : null), formato: 'pct' },
    ],
    linhas: d.cenarios,
  })

  type LinhaCC = { cenario: string; canal: string; receita: number; part: number | null }
  abas.push({
    nome: 'Cenários por canal', titulo: `Receita por canal em cada cenário — ${d.ano}`,
    colunas: [
      { titulo: 'Cenário', valor: (l: LinhaCC) => l.cenario },
      { titulo: 'Canal', valor: (l: LinhaCC) => l.canal },
      { titulo: 'Receita', valor: (l: LinhaCC) => l.receita, formato: 'brl' },
      { titulo: 'Participação no cenário', valor: (l: LinhaCC) => l.part, formato: 'pct' },
    ],
    linhas: d.cenarios.flatMap(s => s.receitaPorCanal.map(c => ({ cenario: s.nome, canal: c.canal, receita: c.receita, part: s.receita > 0 ? (c.receita / s.receita) * 100 : null }))),
  })

  if (d.divisoesEstimadas.length > 0) {
    abas.push({
      nome: 'Divisão estimada', titulo: `Divisão (estimado, do Módulo 4) — ${d.ano}`, subtitulo: 'Participação do M4 aplicada sobre a meta do ano',
      colunas: [
        { titulo: 'Temporada', valor: (l: DivisaoEstimadaSaz) => l.temporada },
        { titulo: 'Divisão', valor: (l: DivisaoEstimadaSaz) => l.divisao },
        { titulo: 'Participação', valor: (l: DivisaoEstimadaSaz) => l.participacao, formato: 'pct' },
        { titulo: 'Receita estimada', valor: (l: DivisaoEstimadaSaz) => l.receitaEstimada, formato: 'brl' },
      ],
      linhas: d.divisoesEstimadas,
    })
  }
  return abas
}

export function nomeArquivoSazonalidade(empresa: string, ano: number): string {
  return nomeArquivo('sazonalidade', empresa, ano)
}

export function baixarExcelSazonalidade(dados: DadosSazonalidade): void {
  baixarXlsx(nomeArquivoSazonalidade(dados.empresa, dados.ano), abasSazonalidade(dados), { empresa: dados.empresa, documento: `Sazonalidade ${dados.ano}` })
}
