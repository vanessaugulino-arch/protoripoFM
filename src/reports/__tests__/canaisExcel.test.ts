import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { abasCanais, consolidadoCenarioCanal, formatarCanal, type DadosCanais } from '../canaisRelatorio'
import { montarWorkbook } from '../xlsxReport'

const chData = {
  varejo: { receita: 1_000_000, margemBrutaRS: 450_000, estoqueMedioRS: 200_000, orcamento: 550_000, markdown: 50_000, producao: 6_000, totalPecas: 6_000, ticketMedio: 300 },
  ecommerce: { receita: 500_000, margemBrutaRS: 200_000, estoqueMedioRS: 100_000, orcamento: 300_000, markdown: 40_000, producao: 4_000, totalPecas: 4_000, ticketMedio: 240 },
}

const dados: DadosCanais = {
  empresa: 'Demonstração TFO',
  ano: 2027,
  anoReferencia: 2025,
  receitaMeta: 1_500_000,
  temPlanoMacro: true,
  cenarioCarregado: 'Base',
  canais: [
    { id: 'varejo', nome: 'Varejo', participacao: 66.7, receitaDistribuida: 1_000_000 },
    { id: 'ecommerce', nome: 'E-commerce', participacao: 33.3, receitaDistribuida: 500_000 },
  ],
  totalParticipacao: 100,
  indicadores: [
    { chave: 'receita', rotulo: 'Receita Bruta (R$)', formato: 'currency', foco: true, driver: false, valores: { varejo: 1_000_000, ecommerce: 500_000 }, consolidado: 1_500_000, metaM1: null, anoAnterior: { varejo: 900_000, ecommerce: 400_000 }, anoAnteriorConsolidado: 1_300_000, variacaoAnoAnteriorPct: 15.38 },
    { chave: 'margemBruta', rotulo: 'Margem Bruta (%)', formato: 'percent', foco: true, driver: true, valores: { varejo: 45, ecommerce: 40 }, consolidado: 43.33, metaM1: 45, anoAnterior: { varejo: 44, ecommerce: null }, anoAnteriorConsolidado: 44, variacaoAnoAnteriorPct: -1.5 },
    { chave: 'giro', rotulo: 'Giro', formato: 'multiplier', foco: false, driver: true, valores: { varejo: 5, ecommerce: 5 }, consolidado: 5, metaM1: null, anoAnterior: { varejo: null, ecommerce: null }, anoAnteriorConsolidado: null, variacaoAnoAnteriorPct: null },
  ],
  verificacaoMacro: true,
  desvios: [{ rotulo: 'Margem Bruta (%)', taxa: true, meta: 45, proposto: 43.33, diferenca: -1.67 }],
  anoAnterior: { receita: 1_300_000, pmv: 150, custo: 80, variacaoReceitaPct: 15.38 },
  divisoes: [{ temporada: 'Verão 2027', divisao: 'Feminino', participacao: 60, receitaEstimada: 900_000 }],
  cenarios: [
    { nome: 'Base', salvoEm: '2026-10-01T12:00:00Z', aplicado: true, consolidado: consolidadoCenarioCanal(chData, ['varejo', 'ecommerce']) },
  ],
}

const X = XLSX as unknown as {
  write: (wb: unknown, o: object) => ArrayBuffer
  read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown; t: string; z?: string }>> }
}

const wb = X.read(X.write(montarWorkbook(abasCanais(dados), { empresa: dados.empresa, documento: 'Metas por Canal 2027' }), { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })

describe('Excel das Metas por Canal (M2)', () => {
  it('tem todas as abas', () => {
    expect(wb.SheetNames).toEqual(['Distribuição', 'Indicadores por canal', 'Ano anterior por canal', 'Desvios do M1', 'Divisão estimada', 'Comparação de cenários'])
  })

  it('abas opcionais somem quando a tela não mostra o bloco', () => {
    const nomes = abasCanais({ ...dados, verificacaoMacro: false, divisoes: [], cenarios: [], indicadores: dados.indicadores.map(l => ({ ...l, anoAnterior: { varejo: null, ecommerce: null }, anoAnteriorConsolidado: null })) }).map(a => a.nome)
    expect(nomes).toEqual(['Distribuição', 'Indicadores por canal'])
  })

  it('distribuição com % como fração e total', () => {
    const ws = wb.Sheets['Distribuição']
    expect(ws['B5'].v).toBeCloseTo(0.667)
    expect(ws['B5'].z).toBe('0.0%')
    expect(ws['C5'].v).toBe(1_000_000)
    expect(ws['C5'].z).toContain('R$')
    expect(ws['A7'].v).toBe('Total')
    expect(ws['B7'].v).toBeCloseTo(1)
    expect(ws['C7'].v).toBe(1_500_000)
  })

  it('grade por canal: uma coluna por canal, formato por indicador', () => {
    const ws = wb.Sheets['Indicadores por canal']
    expect(ws['D4'].v).toBe('Varejo')
    expect(ws['E4'].v).toBe('E-commerce')
    expect(ws['F4'].v).toBe('Consolidado')
    expect(ws['D5'].v).toBe(1_000_000)
    expect(ws['D5'].z).toContain('R$')
    expect(ws['F6'].v).toBeCloseTo(0.4333)
    expect(ws['F6'].z).toBe('0.0%')
    expect(ws['G6'].v).toBeCloseTo(0.45)       // meta M1 fora da banda
    expect(ws['G5'].v).toBe('—')               // sem desvio, sem meta
    expect(ws['F7'].z).toContain('×')          // giro
    expect(ws['H7'].v).toBe('—')               // sem ano anterior real
    expect(ws['A5'].v).toBe('Foco (M1)')
  })

  it('comparação usa a mesma conta do botão Comparar', () => {
    const c = consolidadoCenarioCanal(chData, ['varejo', 'ecommerce'])
    expect(c.receita).toBe(1_500_000)
    expect(c.margemBruta).toBeCloseTo(650_000 / 1_500_000 * 100)
    expect(c.pmv).toBeCloseTo(150)
    expect(c.giro).toBeCloseTo(5)
    expect(c.cobertura).toBeCloseTo(73)
    expect(c.ticketMedio).toBeCloseTo(280)
    const ws = wb.Sheets['Comparação de cenários']
    expect(ws['B4'].v).toBe('Base (aplicado)')
    expect(ws['B5'].v).toBe(1_500_000)
    expect(ws['B6'].v).toBeCloseTo(0.4333)
  })

  it('texto do PDF igual ao da grade da tela', () => {
    expect(formatarCanal('currency', 1_234_567.6)).toBe('R$ 1.234.568')
    expect(formatarCanal('percent', 43.33)).toBe('43,3%')
    expect(formatarCanal('days', 72.6)).toBe('73 dias')
    expect(formatarCanal('multiplier', 5)).toBe('5,00')
    expect(formatarCanal('number', 6000)).toBe('6.000')
  })
})
