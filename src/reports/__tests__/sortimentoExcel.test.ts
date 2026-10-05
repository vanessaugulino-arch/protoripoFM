import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  abasSortimento,
  calcularCategoriasDivisao,
  linhasCascata,
  linhasCascataPorMes,
  linhasColecoesPorMes,
  nomeArquivoSortimento,
  totalCategorias,
  CATEGORY_ROOT_PATH,
  type DadosSortimento,
} from '../sortimentoRelatorio'
import { montarWorkbook } from '../xlsxReport'
import type { Division } from '../../engine/sortimentDefaultScenario'
import type { ConsolidatedRow } from '../../services/supabase/consolidatedHierarchyService'
import type { CategoryGrid } from '../../services/supabase/sortimentGridService'

const feminino: Division = {
  id: 'feminino', name: 'Feminino', revenueTarget: 100_000, participationPct: 60,
  targetMarginPct: 62, targetMkdPct: 15, pricePyramid: { p1: 50, p2: 30, p3: 20 },
  avgPriceP1: 100, avgPriceP2: 200, avgPriceP3: 400,
  collections: [
    { id: 'c1', name: 'Coleção Principal', type: 'colecao', numEntradas: 2, revenuePct: 60,
      entries: [{ date: '2027-01-15', label: 'Entrada 1' }, { date: '2027-02-20', label: 'Entrada 2' }],
      categories: [], tierLayers: {}, mixStatus: 'nao_configurado' },
    { id: 'd1', name: 'Drop Verão', type: 'drop', numEntradas: 1, revenuePct: 40,
      entries: [{ date: '2027-02-10', label: 'Entrada 1' }],
      categories: [], tierLayers: {}, mixStatus: 'nao_configurado' },
  ],
}

const linha = (category: string, priceTier: 'p1' | 'p2' | 'p3', revenueEstimate: number): ConsolidatedRow => ({
  divisionId: 'feminino', category, subcategory: 'Sub', linha: 'Linha', priceTier, revenueEstimate,
  pctSustentadorMargem: 25, pctMotorGiro: 25, pctIconeMarca: 25, pctBasico: 25,
})
const cascata: ConsolidatedRow[] = [
  linha('Vestidos', 'p1', 30_000), linha('Vestidos', 'p2', 30_000),
  linha('Blusas', 'p1', 40_000),
]

// Grade: Vestidos 60k (50% P1, 50% P2), Blusas 40k (100% P1)
const cel = (priceTier: 'p1' | 'p2' | 'p3', pct: number) => ({ priceTier, riskLevel: 'basico', pct, isOverride: false, historicalRevenue: 0 })
const grids = [
  { category: 'Vestidos', categoryRevenue: 60_000, cells: [cel('p1', 50), cel('p2', 50), cel('p3', 0)] },
  { category: 'Blusas', categoryRevenue: 40_000, cells: [cel('p1', 100), cel('p2', 0), cel('p3', 0)] },
] as unknown as CategoryGrid[]

describe('Categorias do sortimento (mesma conta da tela)', () => {
  const cats = calcularCategoriasDivisao({
    divisao: feminino, grids, cascata,
    ajustesHierarquia: new Map(),
    indicadores: new Map([['Blusas', { avgPrice: 80, mkdPct: 10 }]]),
  })

  it('participação natural, preço da mistura de faixas e peças', () => {
    const v = cats[0]
    expect(v.categoria).toBe('Vestidos')
    expect(v.participacaoPct).toBeCloseTo(60)
    expect(v.receita).toBeCloseTo(60_000)
    // 30k/100 + 30k/200 = 450 peças → 60k/450
    expect(v.precoMedio).toBeCloseTo(60_000 / 450)
    expect(v.pecas).toBe(450)
    expect(v.p1Pct).toBe(50)
    expect(v.mkdPct).toBe(15)                  // meta de MKD da divisão
  })

  it('usa o preço médio e a remarcação salvos quando existem', () => {
    const b = cats[1]
    expect(b.precoMedio).toBe(80)
    expect(b.pecas).toBe(500)
    expect(b.mkdPct).toBe(10)
  })

  it('aplica o ajuste de participação salvo', () => {
    const ajustadas = calcularCategoriasDivisao({
      divisao: feminino, grids, cascata,
      ajustesHierarquia: new Map([[`${CATEGORY_ROOT_PATH}::Vestidos`, 70], [`${CATEGORY_ROOT_PATH}::Blusas`, 30]]),
      indicadores: new Map(),
    })
    expect(ajustadas[0].receita).toBeCloseTo(70_000)
    expect(ajustadas[1].receita).toBeCloseTo(30_000)
  })

  it('total da divisão soma receita e peças', () => {
    const t = totalCategorias(cats)
    expect(t.receita).toBeCloseTo(100_000)
    expect(t.pecas).toBe(950)
    expect(t.participacaoPct).toBeCloseTo(100)
  })
})

describe('Linhas por mês', () => {
  it('coleções: uma linha por entrada, receita da entrada dividida', () => {
    const ls = linhasColecoesPorMes([feminino])
    expect(ls).toHaveLength(3)
    expect(ls[0].receitaColecao).toBe(60_000)
    expect(ls[0].receitaEntrada).toBe(30_000)
    expect(ls[2].tipo).toBe('Drop')
  })

  it('cascata por mês: soma da divisão preservada', () => {
    const ls = linhasCascataPorMes([feminino], cascata)
    const total = ls.reduce((s, l) => s + l.receita, 0)
    expect(total).toBeCloseTo(100_000)
    // Jan = 30% (60% / 2 entradas); Fev = 30% + 40%
    const jan = ls.filter(l => l.ym === '2027-01').reduce((s, l) => s + l.receita, 0)
    expect(jan).toBeCloseTo(30_000)
  })
})

const cats = calcularCategoriasDivisao({ divisao: feminino, grids, cascata, ajustesHierarquia: new Map(), indicadores: new Map() })
const dados: DadosSortimento = {
  empresa: 'Demonstração TFO',
  temporada: 'Verão 2027',
  anoFiscal: 2027,
  kpis: { receitaTemporada: 100_000, margemAlvoPct: 62, orcamento: 38_000, sellThroughPct: 100, pmv: 150, pecasPlanejadas: 700, pecasOrcamentoAlvo: 667, pecasRestantes: -33 },
  divisoes: [{
    id: 'feminino', nome: 'Feminino', receitaAlvo: 100_000, participacaoPct: 60, margemAlvoPct: 62, mkdAlvoPct: 15,
    pmv: 150, piramide: feminino.pricePyramid, precos: { p1: 100, p2: 200, p3: 400 }, categorias: cats,
  }],
  colecoesPorMes: linhasColecoesPorMes([feminino]),
  cascata: linhasCascata([feminino], cascata),
  cascataPorMes: linhasCascataPorMes([feminino], cascata),
}

// O shim de tipos (src/xlsx.d.ts) não declara write/read completos.
const X = XLSX as unknown as {
  write: (wb: unknown, o: object) => ArrayBuffer
  read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown; t: string; z?: string }>> }
}
const wb = X.read(X.write(montarWorkbook(abasSortimento(dados), { empresa: dados.empresa, documento: 'Plano de Sortimento' }), { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })

describe('Excel do Plano de Sortimento', () => {
  it('tem as quatro abas', () => {
    expect(wb.SheetNames).toEqual(['Categorias', 'Coleções por mês', 'Cascata', 'Cascata por mês'])
  })

  it('Categorias: valores numéricos com formato e total da divisão', () => {
    const ws = wb.Sheets['Categorias']
    expect(ws['A1'].v).toBe('Categorias por divisão — Verão 2027')
    expect(String(ws['A2'].v)).toContain('Demonstração TFO')
    expect(ws['B5'].v).toBe('Vestidos')
    expect(ws['C5'].t).toBe('n')
    expect(ws['C5'].v).toBeCloseTo(0.6)            // 60% gravado como fração
    expect(ws['C5'].z).toBe('0.0%')
    expect(ws['D5'].v).toBeCloseTo(60_000)
    expect(ws['D5'].z).toContain('R$')
    expect(ws['E5'].v).toBe(450)
    expect(ws['K5'].v).toBeCloseTo(0.62)           // margem alvo da divisão
    expect(ws['B7'].v).toBe('Total da divisão')
    expect(ws['D7'].v).toBeCloseTo(100_000)
  })

  it('Coleções por mês: colunas do antigo CSV, numéricas', () => {
    const ws = wb.Sheets['Coleções por mês']
    expect(ws['A4'].v).toBe('Divisão')
    expect(ws['F4'].v).toBe('% Receita da Divisão')
    expect(ws['D5'].v).toBe('15/01/2027')
    expect(ws['E5'].v).toBe('Janeiro')
    expect(ws['F5'].v).toBeCloseTo(0.6)
    expect(ws['G5'].v).toBe(60_000)
    expect(ws['H5'].v).toBe(30_000)
  })

  it('Cascata por mês: receita numérica e total ao final', () => {
    const ws = wb.Sheets['Cascata por mês']
    expect(ws['A4'].v).toBe('Divisão')
    expect(ws['F5'].v).toBe('2027-01')
    expect(ws['G5'].t).toBe('n')
    expect(ws['G5'].z).toContain('R$')
    const ultima = 4 + dados.cascataPorMes.length + 1
    expect(ws[`A${ultima}`].v).toBe('Total')
    expect(ws[`G${ultima}`].v).toBeCloseTo(100_000)
  })

  it('Cascata: nome da divisão e % de papel como fração', () => {
    const ws = wb.Sheets['Cascata']
    expect(ws['A5'].v).toBe('Feminino')
    expect(ws['G5'].v).toBeCloseTo(0.25)
  })

  it('nome de arquivo sem acento nem espaço', () => {
    expect(nomeArquivoSortimento(dados)).toBe('plano_sortimento_demonstracao_tfo_verao_2027')
  })
})
