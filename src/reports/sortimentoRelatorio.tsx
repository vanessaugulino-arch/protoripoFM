// ─── sortimentoRelatorio.tsx ──────────────────────────────────────────────────
// PDF e Excel do Plano de Sortimento (M6), a partir dos mesmos dados e das
// mesmas fórmulas da tela. Substitui o window.print() da tela e os CSVs
// "coleções por mês", "cascata" e "cascata por mês".
//
// Diferente da tela (que mostra uma divisão por vez), o relatório cobre todas
// as divisões da temporada.
// ─────────────────────────────────────────────────────────────────────────────

import type { Division } from '../engine/sortimentDefaultScenario'
import type { ConsolidatedRow } from '../services/supabase/consolidatedHierarchyService'
import type { CategoryGrid } from '../services/supabase/sortimentGridService'
import type { PriceTierId } from '../app/types/pricePyramid'
import { Capa, GradeKpis, RelatorioA4, Secao, TabelaRelatorio, type KpiRelatorio } from './RelatorioA4'
import { baixarXlsx, nomeArquivo, type Aba } from './xlsxReport'

/** parent_path sentinela: categorias tratadas como irmãs entre si (ajustes de participação). */
export const CATEGORY_ROOT_PATH = '__categorias__'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const SEM_MES = '(sem mês definido)'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface KpisSortimento {
  /** Receita alvo da temporada (M1 recortado pela soma das divisões). */
  receitaTemporada: number | null
  margemAlvoPct: number | null
  orcamento: number | null
  sellThroughPct: number | null
  pmv: number | null
  pecasPlanejadas: number
  pecasOrcamentoAlvo: number | null
  pecasRestantes: number | null
}

export interface CategoriaSortimento {
  categoria: string
  participacaoPct: number
  receita: number
  pecas: number
  precoMedio: number
  /** Participação de cada faixa de preço na receita da categoria (0–100). */
  p1Pct: number
  p2Pct: number
  p3Pct: number
  mkdPct: number
}

export interface DivisaoSortimento {
  id: string
  nome: string
  receitaAlvo: number
  participacaoPct: number
  margemAlvoPct: number
  mkdAlvoPct: number
  pmv: number
  piramide: { p1: number; p2: number; p3: number }
  precos: { p1: number; p2: number; p3: number }
  /** null = cascata desta divisão ainda não calculada/carregada. */
  categorias: CategoriaSortimento[] | null
}

export interface LinhaColecaoMes {
  divisao: string
  colecao: string
  tipo: 'Coleção' | 'Drop'
  /** "YYYY-MM-DD" ou "" quando a entrada não tem data. */
  data: string
  /** "YYYY-MM" ou "" */
  ym: string
  pctReceitaDivisao: number
  /** Receita da coleção inteira (mesma coluna do antigo CSV). */
  receitaColecao: number
  /** Receita da coleção dividida igualmente entre as entradas. */
  receitaEntrada: number
}

export interface LinhaCascata {
  divisao: string
  categoria: string
  subcategoria: string
  linha: string
  faixa: string
  receita: number
  pctSustentador: number | null
  pctMotorGiro: number | null
  pctIcone: number | null
  pctBasico: number | null
  atualizadoEm: string
}

export interface LinhaCascataMes {
  divisao: string
  categoria: string
  subcategoria: string
  linha: string
  faixa: string
  /** "YYYY-MM" ou "(sem mês definido)" */
  ym: string
  receita: number
}

export interface DadosSortimento {
  empresa: string
  temporada: string
  anoFiscal: number | null
  kpis: KpisSortimento
  divisoes: DivisaoSortimento[]
  colecoesPorMes: LinhaColecaoMes[]
  cascata: LinhaCascata[]
  cascataPorMes: LinhaCascataMes[]
}

// ─── Cálculos (mesmas fórmulas da tela) ──────────────────────────────────────

export interface EntradaCategorias {
  divisao: Pick<Division, 'avgPriceP1' | 'avgPriceP2' | 'avgPriceP3' | 'targetMkdPct'>
  /** Grades da divisão (computeCategoryGrids), na ordem da tela. */
  grids: CategoryGrid[]
  /** Linhas da cascata consolidada só desta divisão. */
  cascata: ConsolidatedRow[]
  /** Ajustes de participação salvos ("parentPath::nó" → %). */
  ajustesHierarquia: Map<string, number>
  /** Preço médio e remarcação salvos por categoria. */
  indicadores: Map<string, { avgPrice: number; mkdPct: number }>
}

/**
 * Tabela de categorias de uma divisão, como a "Cascata do Sortimento" da tela:
 * participação efetiva (ajuste salvo ou peso real), receita, peças, preço médio
 * (ajuste salvo ou mistura P1/P2/P3 da cascata) e remarcação (ajuste salvo ou
 * meta de MKD da divisão).
 */
export function calcularCategoriasDivisao(e: EntradaCategorias): CategoriaSortimento[] {
  const { divisao, grids, cascata, ajustesHierarquia, indicadores } = e
  const precoFaixa: Record<PriceTierId, number> = { p1: divisao.avgPriceP1 ?? 0, p2: divisao.avgPriceP2 ?? 0, p3: divisao.avgPriceP3 ?? 0 }
  const totalDivisao = grids.reduce((s, g) => s + g.categoryRevenue, 0)

  return grids.map(grid => {
    // Preço médio ponderado real da categoria (mistura P1/P2/P3 da cascata).
    const faixas = { p1: 0, p2: 0, p3: 0 }
    let temCascata = false
    for (const r of cascata) {
      if (r.category !== grid.category) continue
      temCascata = true
      faixas[r.priceTier] += r.revenueEstimate
    }
    const pecasCascata =
      (precoFaixa.p1 > 0 ? faixas.p1 / precoFaixa.p1 : 0) +
      (precoFaixa.p2 > 0 ? faixas.p2 / precoFaixa.p2 : 0) +
      (precoFaixa.p3 > 0 ? faixas.p3 / precoFaixa.p3 : 0)
    const precoMistura = temCascata ? (pecasCascata > 0 ? grid.categoryRevenue / pecasCascata : 0) : undefined

    const pctNatural = totalDivisao > 0 ? (grid.categoryRevenue / totalDivisao) * 100 : 100 / grids.length
    const participacaoPct = ajustesHierarquia.get(`${CATEGORY_ROOT_PATH}::${grid.category}`) ?? pctNatural
    const receita = totalDivisao * (participacaoPct / 100)
    const precoMedio = indicadores.get(grid.category)?.avgPrice ?? precoMistura ?? 0
    const mkdPct = indicadores.get(grid.category)?.mkdPct ?? divisao.targetMkdPct ?? 15
    const pecas = precoMedio > 0 ? receita / precoMedio : 0
    const somaFaixa = (t: PriceTierId) => grid.cells.filter(c => c.priceTier === t).reduce((s, c) => s + c.pct, 0)

    return {
      categoria: grid.category,
      participacaoPct,
      receita,
      pecas: Math.round(pecas),
      precoMedio,
      p1Pct: somaFaixa('p1'),
      p2Pct: somaFaixa('p2'),
      p3Pct: somaFaixa('p3'),
      mkdPct,
    }
  })
}

/** Linha "Total da divisão" (participação somada, preço = receita ÷ peças, % ponderados pela receita). */
export function totalCategorias(cats: CategoriaSortimento[]): CategoriaSortimento {
  const receita = cats.reduce((s, c) => s + c.receita, 0)
  const pecas = cats.reduce((s, c) => s + c.pecas, 0)
  const pond = (f: (c: CategoriaSortimento) => number) => (receita > 0 ? cats.reduce((s, c) => s + f(c) * c.receita, 0) / receita : 0)
  return {
    categoria: 'Total da divisão',
    participacaoPct: cats.reduce((s, c) => s + c.participacaoPct, 0),
    receita,
    pecas,
    precoMedio: pecas > 0 ? receita / pecas : 0,
    p1Pct: pond(c => c.p1Pct),
    p2Pct: pond(c => c.p2Pct),
    p3Pct: pond(c => c.p3Pct),
    mkdPct: pond(c => c.mkdPct),
  }
}

const receitaColecao = (d: Division, pct: number) => d.revenueTarget * pct / 100

/** Uma linha por entrada de cada coleção/drop (antigo CSV "coleções por mês"). */
export function linhasColecoesPorMes(divisoes: Division[]): LinhaColecaoMes[] {
  const out: LinhaColecaoMes[] = []
  for (const d of divisoes) {
    for (const col of d.collections) {
      const receita = receitaColecao(d, col.revenuePct)
      const entradas = col.entries.length > 0 ? col.entries : [{ date: '', label: '' }]
      for (const en of entradas) {
        out.push({
          divisao: d.name,
          colecao: col.name,
          tipo: col.type === 'colecao' ? 'Coleção' : 'Drop',
          data: en.date || '',
          ym: en.date ? en.date.slice(0, 7) : '',
          pctReceitaDivisao: col.revenuePct,
          receitaColecao: receita,
          receitaEntrada: receita / entradas.length,
        })
      }
    }
  }
  return out
}

/** Cascata consolidada com o nome da divisão (antigo CSV "cascata"). */
export function linhasCascata(divisoes: Pick<Division, 'id' | 'name'>[], rows: (ConsolidatedRow & { updatedAt?: string })[]): LinhaCascata[] {
  const nome = new Map(divisoes.map(d => [d.id, d.name]))
  return rows.map(r => ({
    divisao: nome.get(r.divisionId) ?? r.divisionId,
    categoria: r.category,
    subcategoria: r.subcategory,
    linha: r.linha,
    faixa: r.priceTier.toUpperCase(),
    receita: r.revenueEstimate,
    pctSustentador: r.pctSustentadorMargem,
    pctMotorGiro: r.pctMotorGiro,
    pctIcone: r.pctIconeMarca,
    pctBasico: r.pctBasico,
    atualizadoEm: r.updatedAt ? new Date(r.updatedAt).toLocaleString('pt-BR') : '',
  }))
}

/**
 * Cascata distribuída pelos meses de entrada (antigo CSV "cascata por mês").
 * A grade categoria × faixa não tem mês; o mês vem da distribuição das
 * entradas das coleções/drops de cada divisão (a % de cada coleção dividida
 * igualmente entre as suas entradas), supondo o mesmo mix em todos os meses.
 */
export function linhasCascataPorMes(divisoes: Division[], rows: ConsolidatedRow[]): LinhaCascataMes[] {
  const out: LinhaCascataMes[] = []
  for (const d of divisoes) {
    const parteMes: Record<string, number> = {}
    for (const col of d.collections) {
      if (col.entries.length === 0) continue
      const porEntrada = col.revenuePct / col.entries.length
      for (const en of col.entries) {
        if (!en.date) continue
        const ym = en.date.slice(0, 7)
        parteMes[ym] = (parteMes[ym] ?? 0) + porEntrada
      }
    }
    const meses = Object.entries(parteMes).sort(([a], [b]) => a.localeCompare(b))
    const alvos: [string, number][] = meses.length > 0 ? meses : [[SEM_MES, 100]]
    for (const r of rows.filter(x => x.divisionId === d.id)) {
      for (const [ym, pct] of alvos) {
        const receita = r.revenueEstimate * (pct / 100)
        if (receita <= 0) continue
        out.push({ divisao: d.name, categoria: r.category, subcategoria: r.subcategory, linha: r.linha, faixa: r.priceTier.toUpperCase(), ym, receita })
      }
    }
  }
  return out
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const brl = (v: number | null | undefined, casas = 0) =>
  v == null || !Number.isFinite(v) ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const int = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('pt-BR'))

/** "2027-03" → "Mar/27" */
export function rotuloMes(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || SEM_MES
  return `${MESES_CURTOS[parseInt(ym.slice(5, 7), 10) - 1]}/${ym.slice(2, 4)}`
}
const nomeMes = (data: string) => (data ? MESES[new Date(`${data}T00:00:00`).getMonth()] ?? '' : '')
const dataBR = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—')

// ─── PDF ─────────────────────────────────────────────────────────────────────

type LinhaColecaoPdf = { tipo: 'mes' | 'entrada'; rotulo: string; data: string; divisao: string; tipoCol: string; pct: number | null; receita: number }

function linhasColecoesPdf(linhas: LinhaColecaoMes[]): LinhaColecaoPdf[] {
  const porMes = new Map<string, LinhaColecaoMes[]>()
  for (const l of linhas) {
    const k = l.ym || SEM_MES
    if (!porMes.has(k)) porMes.set(k, [])
    porMes.get(k)!.push(l)
  }
  const chaves = [...porMes.keys()].sort((a, b) => (a === SEM_MES ? 1 : b === SEM_MES ? -1 : a.localeCompare(b)))
  const out: LinhaColecaoPdf[] = []
  for (const k of chaves) {
    const ls = porMes.get(k)!.sort((a, b) => a.data.localeCompare(b.data) || a.divisao.localeCompare(b.divisao))
    out.push({ tipo: 'mes', rotulo: rotuloMes(k), data: '', divisao: '', tipoCol: '', pct: null, receita: ls.reduce((s, l) => s + l.receitaEntrada, 0) })
    for (const l of ls) out.push({ tipo: 'entrada', rotulo: l.colecao, data: dataBR(l.data), divisao: l.divisao, tipoCol: l.tipo, pct: l.pctReceitaDivisao, receita: l.receitaEntrada })
  }
  return out
}

type LinhaCascataMesPdf = { tipo: 'mes' | 'categoria'; rotulo: string; p1: number; p2: number; p3: number; total: number }

function linhasCascataMesPdf(linhas: LinhaCascataMes[]): LinhaCascataMesPdf[] {
  const porMes = new Map<string, Map<string, { p1: number; p2: number; p3: number }>>()
  for (const l of linhas) {
    if (!porMes.has(l.ym)) porMes.set(l.ym, new Map())
    const cats = porMes.get(l.ym)!
    if (!cats.has(l.categoria)) cats.set(l.categoria, { p1: 0, p2: 0, p3: 0 })
    const f = l.faixa.toLowerCase() as PriceTierId
    if (f === 'p1' || f === 'p2' || f === 'p3') cats.get(l.categoria)![f] += l.receita
  }
  const chaves = [...porMes.keys()].sort((a, b) => (a === SEM_MES ? 1 : b === SEM_MES ? -1 : a.localeCompare(b)))
  const out: LinhaCascataMesPdf[] = []
  for (const k of chaves) {
    const cats = [...porMes.get(k)!.entries()].map(([c, t]) => ({ tipo: 'categoria' as const, rotulo: c, ...t, total: t.p1 + t.p2 + t.p3 }))
      .sort((a, b) => b.total - a.total)
    const soma = cats.reduce((s, c) => ({ p1: s.p1 + c.p1, p2: s.p2 + c.p2, p3: s.p3 + c.p3 }), { p1: 0, p2: 0, p3: 0 })
    out.push({ tipo: 'mes', rotulo: rotuloMes(k), ...soma, total: soma.p1 + soma.p2 + soma.p3 })
    out.push(...cats)
  }
  return out
}

export function kpisPdfSortimento(k: KpisSortimento): KpiRelatorio[] {
  const itens: KpiRelatorio[] = []
  if (k.receitaTemporada != null) itens.push({ rotulo: 'Receita alvo da temporada', valor: brl(k.receitaTemporada), nota: 'M1 recortado pelas divisões (M4)' })
  if (k.margemAlvoPct != null) itens.push({ rotulo: 'Margem alvo', valor: pct(k.margemAlvoPct) })
  if (k.orcamento != null) itens.push({ rotulo: 'Orçamento', valor: brl(k.orcamento) })
  if (k.sellThroughPct != null) itens.push({ rotulo: 'Sell-through', valor: pct(k.sellThroughPct), nota: 'implícito do plano' })
  if (k.pmv != null) itens.push({ rotulo: 'PMV', valor: brl(k.pmv, 2), nota: 'preço médio de venda (M1)' })
  itens.push({ rotulo: 'Peças planejadas', valor: int(k.pecasPlanejadas), nota: 'nas coleções cadastradas' })
  if (k.pecasRestantes != null) {
    itens.push({
      rotulo: 'Peças do orçamento',
      valor: k.pecasRestantes > 0 ? `${int(k.pecasRestantes)} restantes` : 'Orçamento coberto',
      nota: k.pecasOrcamentoAlvo != null ? `de ${int(k.pecasOrcamentoAlvo)} peças estimadas` : undefined,
    })
  }
  return itens
}

export function RelatorioSortimento({ dados }: { dados: DadosSortimento }) {
  const { empresa, temporada, anoFiscal, kpis, divisoes, colecoesPorMes, cascataPorMes } = dados
  const documento = `Plano de Sortimento · ${temporada}`
  const totalDivisoes = {
    nome: 'Total', receitaAlvo: divisoes.reduce((s, d) => s + d.receitaAlvo, 0),
    participacaoPct: divisoes.reduce((s, d) => s + d.participacaoPct, 0),
  }
  const linhasCol = linhasColecoesPdf(colecoesPorMes)
  const totalCol = colecoesPorMes.reduce((s, l) => s + l.receitaEntrada, 0)

  return (
    <RelatorioA4 empresa={empresa} documento={documento}>
      <Capa
        titulo="Plano de Sortimento"
        subtitulo="Metas da temporada, estrutura por divisão e categoria, coleções e cascata de receita mês a mês."
        empresa={empresa}
        periodo={anoFiscal ? `${temporada} · ano fiscal ${anoFiscal}` : temporada}
      />

      <Secao titulo="Indicadores da temporada" nota="Os mesmos indicadores do topo da tela do Módulo 6.">
        <GradeKpis itens={kpisPdfSortimento(kpis)} />
      </Secao>

      <Secao titulo="Divisões" nota="Metas de cada divisão na temporada (M4) e pirâmide de preços (participação da receita por faixa).">
        <TabelaRelatorio
          colunas={[
            { titulo: 'Divisão', valor: (d: DivisaoSortimento) => d.nome, largura: '20%' },
            { titulo: 'Participação', valor: d => pct(d.participacaoPct), numero: true },
            { titulo: 'Receita alvo', valor: d => brl(d.receitaAlvo), numero: true },
            { titulo: 'Margem', valor: d => (d.id ? pct(d.margemAlvoPct) : ''), numero: true },
            { titulo: 'MKD', valor: d => (d.id ? pct(d.mkdAlvoPct) : ''), numero: true },
            { titulo: 'PMV', valor: d => (d.id ? brl(d.pmv, 2) : ''), numero: true },
            { titulo: 'P1 / P2 / P3', valor: d => (d.id ? `${int(d.piramide.p1)} / ${int(d.piramide.p2)} / ${int(d.piramide.p3)}%` : ''), numero: true },
          ]}
          linhas={divisoes}
          total={{ ...divisoes[0], id: '', ...totalDivisoes } as DivisaoSortimento}
          vazio="Nenhuma divisão configurada nesta temporada."
        />
      </Secao>

      {divisoes.map((d, i) => {
        const cats = d.categorias
        return (
          <Secao
            key={d.id}
            titulo={`Categorias — ${d.nome}`}
            novaPagina={i === 0}
            nota={`Receita alvo da divisão (M4): ${brl(d.receitaAlvo)} · margem bruta alvo ${pct(d.margemAlvoPct)} · preço por faixa: P1 ${brl(d.precos.p1)}, P2 ${brl(d.precos.p2)}, P3 ${brl(d.precos.p3)}. Colunas P1–P3: parte da receita da categoria em cada faixa.`}
          >
            {cats == null
              ? <p className="vazio">Cascata desta divisão ainda não calculada.</p>
              : (
                <TabelaRelatorio
                  colunas={[
                    { titulo: 'Categoria', valor: (c: CategoriaSortimento) => c.categoria, largura: '22%' },
                    { titulo: 'Part.', valor: c => pct(c.participacaoPct), numero: true },
                    { titulo: 'Receita', valor: c => brl(c.receita), numero: true },
                    { titulo: 'Peças', valor: c => int(c.pecas), numero: true },
                    { titulo: 'Preço médio', valor: c => brl(c.precoMedio, 2), numero: true },
                    { titulo: 'P1', valor: c => pct(c.p1Pct), numero: true },
                    { titulo: 'P2', valor: c => pct(c.p2Pct), numero: true },
                    { titulo: 'P3', valor: c => pct(c.p3Pct), numero: true },
                    { titulo: 'MKD', valor: c => pct(c.mkdPct), numero: true },
                  ]}
                  linhas={cats}
                  total={cats.length > 0 ? totalCategorias(cats) : undefined}
                  vazio="Sem categorias com receita nesta divisão."
                />
              )}
          </Secao>
        )
      })}

      <Secao titulo="Coleções por mês" nota="Entradas de cada coleção e drop. A receita da coleção é dividida igualmente entre as suas entradas; % = participação da coleção na receita da divisão." novaPagina>
        <TabelaRelatorio
          colunas={[
            { titulo: 'Mês / coleção', valor: (l: LinhaColecaoPdf) => l.rotulo, largura: '30%' },
            { titulo: 'Entrada', valor: l => l.data },
            { titulo: 'Divisão', valor: l => l.divisao },
            { titulo: 'Tipo', valor: l => l.tipoCol },
            { titulo: '% da divisão', valor: l => (l.pct == null ? '' : pct(l.pct)), numero: true },
            { titulo: 'Receita', valor: l => brl(l.receita), numero: true },
          ]}
          linhas={linhasCol}
          total={linhasCol.length > 0 ? { tipo: 'mes', rotulo: 'Total', data: '', divisao: '', tipoCol: '', pct: null, receita: totalCol } : undefined}
          classeLinha={l => (l.tipo === 'mes' ? 'grupo' : 'sub')}
          vazio="Nenhuma coleção ou drop cadastrado nesta temporada."
        />
      </Secao>

      <Secao titulo="Cascata por mês" nota="Receita estimada da cascata (categoria × faixa de preço) distribuída pelos meses de entrada das coleções de cada divisão, supondo o mesmo mix em todos os meses." novaPagina>
        {divisoes.length === 0 && <p className="vazio">Sem divisões.</p>}
        {divisoes.map(d => {
          const ls = cascataPorMes.filter(l => l.divisao === d.nome)
          const linhas = linhasCascataMesPdf(ls)
          const soma = ls.reduce((s, l) => {
            const f = l.faixa.toLowerCase()
            if (f === 'p1') s.p1 += l.receita; else if (f === 'p2') s.p2 += l.receita; else if (f === 'p3') s.p3 += l.receita
            return s
          }, { p1: 0, p2: 0, p3: 0 })
          return (
            <div key={d.id} style={{ marginBottom: '6mm' }}>
              <div className="rot" style={{ margin: '0 0 1.5mm' }}>{d.nome}</div>
              <TabelaRelatorio
                colunas={[
                  { titulo: 'Mês / categoria', valor: (l: LinhaCascataMesPdf) => l.rotulo, largura: '32%' },
                  { titulo: 'P1', valor: l => brl(l.p1), numero: true },
                  { titulo: 'P2', valor: l => brl(l.p2), numero: true },
                  { titulo: 'P3', valor: l => brl(l.p3), numero: true },
                  { titulo: 'Total', valor: l => brl(l.total), numero: true },
                ]}
                linhas={linhas}
                total={linhas.length > 0 ? { tipo: 'mes', rotulo: 'Total da divisão', ...soma, total: soma.p1 + soma.p2 + soma.p3 } : undefined}
                classeLinha={l => (l.tipo === 'mes' ? 'grupo' : 'sub')}
                vazio="Sem cascata calculada para esta divisão."
              />
            </div>
          )
        })}
      </Secao>
    </RelatorioA4>
  )
}

// ─── Excel ───────────────────────────────────────────────────────────────────

type LinhaCategoriaXlsx = CategoriaSortimento & { divisao: string; margemDivisao: number; total: boolean }

/** Abas do Excel do Plano de Sortimento (exportado para teste). */
export function abasSortimento(dados: DadosSortimento): Aba<any>[] {
  const { temporada, divisoes, colecoesPorMes, cascata, cascataPorMes } = dados

  const categorias: LinhaCategoriaXlsx[] = []
  for (const d of divisoes) {
    if (!d.categorias || d.categorias.length === 0) continue
    for (const c of d.categorias) categorias.push({ ...c, divisao: d.nome, margemDivisao: d.margemAlvoPct, total: false })
    categorias.push({ ...totalCategorias(d.categorias), divisao: d.nome, margemDivisao: d.margemAlvoPct, total: true })
  }

  const totalCascataMes = cascataPorMes.reduce((s, l) => s + l.receita, 0)
  const totalCascata = cascata.reduce((s, l) => s + l.receita, 0)

  return [
    {
      nome: 'Categorias', titulo: `Categorias por divisão — ${temporada}`, subtitulo: 'Cascata do sortimento (M6)',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaCategoriaXlsx) => l.divisao },
        { titulo: 'Categoria', valor: (l: LinhaCategoriaXlsx) => l.categoria },
        { titulo: 'Participação na divisão', valor: (l: LinhaCategoriaXlsx) => l.participacaoPct, formato: 'pct' },
        { titulo: 'Receita', valor: (l: LinhaCategoriaXlsx) => l.receita, formato: 'brl' },
        { titulo: 'Peças', valor: (l: LinhaCategoriaXlsx) => l.pecas, formato: 'inteiro' },
        { titulo: 'Preço médio', valor: (l: LinhaCategoriaXlsx) => l.precoMedio, formato: 'brl' },
        { titulo: 'Faixa P1', valor: (l: LinhaCategoriaXlsx) => l.p1Pct, formato: 'pct' },
        { titulo: 'Faixa P2', valor: (l: LinhaCategoriaXlsx) => l.p2Pct, formato: 'pct' },
        { titulo: 'Faixa P3', valor: (l: LinhaCategoriaXlsx) => l.p3Pct, formato: 'pct' },
        { titulo: 'Remarcação', valor: (l: LinhaCategoriaXlsx) => l.mkdPct, formato: 'pct' },
        { titulo: 'Margem alvo da divisão', valor: (l: LinhaCategoriaXlsx) => l.margemDivisao, formato: 'pct' },
      ],
      linhas: categorias,
    },
    {
      nome: 'Coleções por mês', titulo: `Coleções por mês — ${temporada}`, subtitulo: 'Uma linha por entrada de coleção/drop',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaColecaoMes) => l.divisao },
        { titulo: 'Coleção/Drop', valor: (l: LinhaColecaoMes) => l.colecao },
        { titulo: 'Tipo', valor: (l: LinhaColecaoMes) => l.tipo },
        { titulo: 'Data de Entrada', valor: (l: LinhaColecaoMes) => (l.data ? dataBR(l.data) : '') },
        { titulo: 'Mês', valor: (l: LinhaColecaoMes) => nomeMes(l.data) },
        { titulo: '% Receita da Divisão', valor: (l: LinhaColecaoMes) => l.pctReceitaDivisao, formato: 'pct' },
        { titulo: 'Receita Estimada da Coleção (R$)', valor: (l: LinhaColecaoMes) => l.receitaColecao, formato: 'brl' },
        { titulo: 'Receita da Entrada (R$)', valor: (l: LinhaColecaoMes) => l.receitaEntrada, formato: 'brl' },
      ],
      linhas: colecoesPorMes,
    },
    {
      nome: 'Cascata', titulo: `Cascata do sortimento — ${temporada}`, subtitulo: 'Categoria → subcategoria → linha × faixa de preço',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaCascata) => l.divisao },
        { titulo: 'Categoria', valor: (l: LinhaCascata) => l.categoria },
        { titulo: 'Subcategoria', valor: (l: LinhaCascata) => l.subcategoria },
        { titulo: 'Linha', valor: (l: LinhaCascata) => l.linha },
        { titulo: 'Faixa de Preço', valor: (l: LinhaCascata) => l.faixa },
        { titulo: 'Receita Estimada (R$)', valor: (l: LinhaCascata) => l.receita, formato: 'brl' },
        { titulo: '% Sustentador de Margem', valor: (l: LinhaCascata) => l.pctSustentador, formato: 'pct' },
        { titulo: '% Motor de Giro', valor: (l: LinhaCascata) => l.pctMotorGiro, formato: 'pct' },
        { titulo: '% Ícone de Marca', valor: (l: LinhaCascata) => l.pctIcone, formato: 'pct' },
        { titulo: '% Básico', valor: (l: LinhaCascata) => l.pctBasico, formato: 'pct' },
        { titulo: 'Atualizado em', valor: (l: LinhaCascata) => l.atualizadoEm },
      ],
      linhas: cascata,
      total: cascata.length > 0
        ? { divisao: 'Total', categoria: '', subcategoria: '', linha: '', faixa: '', receita: totalCascata, pctSustentador: null, pctMotorGiro: null, pctIcone: null, pctBasico: null, atualizadoEm: '' }
        : undefined,
    },
    {
      nome: 'Cascata por mês', titulo: `Cascata por mês — ${temporada}`, subtitulo: 'Cascata distribuída pelos meses de entrada',
      colunas: [
        { titulo: 'Divisão', valor: (l: LinhaCascataMes) => l.divisao },
        { titulo: 'Categoria', valor: (l: LinhaCascataMes) => l.categoria },
        { titulo: 'Subcategoria', valor: (l: LinhaCascataMes) => l.subcategoria },
        { titulo: 'Linha', valor: (l: LinhaCascataMes) => l.linha },
        { titulo: 'Faixa de Preço', valor: (l: LinhaCascataMes) => l.faixa },
        { titulo: 'Mês', valor: (l: LinhaCascataMes) => l.ym },
        { titulo: 'Receita Estimada (R$)', valor: (l: LinhaCascataMes) => l.receita, formato: 'brl' },
      ],
      linhas: cascataPorMes,
      total: cascataPorMes.length > 0
        ? { divisao: 'Total', categoria: '', subcategoria: '', linha: '', faixa: '', ym: '', receita: totalCascataMes }
        : undefined,
    },
  ]
}

export function nomeArquivoSortimento(dados: Pick<DadosSortimento, 'empresa' | 'temporada'>): string {
  return nomeArquivo('plano_sortimento', dados.empresa, dados.temporada)
}

export function baixarExcelSortimento(dados: DadosSortimento): void {
  baixarXlsx(nomeArquivoSortimento(dados), abasSortimento(dados), { empresa: dados.empresa, documento: `Plano de Sortimento ${dados.temporada}` })
}
