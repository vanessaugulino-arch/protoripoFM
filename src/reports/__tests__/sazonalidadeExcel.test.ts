import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { abasSazonalidade, linhasConsolidado, nomeArquivoSazonalidade, type DadosSazonalidade, type MesCanalSaz } from '../sazonalidadeRelatorio'
import { montarWorkbook } from '../xlsxReport'

const mes = (mesNome: string, curto: string, receita: number, anoAnterior: number, entrada: number): MesCanalSaz => ({
  mes: mesNome, mesCurto: curto, receita, anoAnterior, pecasVender: Math.round(receita / 100), coberturaMeta: 90,
  estoqueInicio: 500, entrada, estoqueFim: 400, coberturaReal: 95, custoEntrada: entrada * 40,
})

const dados: DadosSazonalidade = {
  empresa: 'Demonstração TFO',
  ano: 2027,
  anoReferencia: 2025,
  metaReceita: 250_000,
  totalReceita: 260_000,
  totalEntrada: 1_100,
  totalCustoEntrada: 44_000,
  coberturaMedia: 95,
  estoqueColecaoPassada: 500,
  custoMedio: 40,
  meses: [{ nome: 'Janeiro', curto: 'Jan' }, { nome: 'Fevereiro', curto: 'Fev' }],
  canais: [
    { id: 'varejo', nome: 'Varejo Físico', pmv: 100, totalReceita: 160_000, totalEntrada: 700, totalCustoEntrada: 28_000,
      meses: [mes('Janeiro', 'Jan', 100_000, 80_000, 500), mes('Fevereiro', 'Fev', 60_000, 0, 200)] },
    { id: 'ecommerce', nome: 'E-commerce', pmv: 120, totalReceita: 100_000, totalEntrada: 400, totalCustoEntrada: 16_000,
      meses: [mes('Janeiro', 'Jan', 40_000, 20_000, 300), mes('Fevereiro', 'Fev', 60_000, 0, 100)] },
  ],
  cenarios: [
    { nome: 'Base', aplicado: true, salvoEm: '01/10/2026 10:00:00', receita: 260_000, coberturaMedia: 95,
      receitaPorCanal: [{ canal: 'Varejo Físico', receita: 160_000 }, { canal: 'E-commerce', receita: 100_000 }] },
  ],
  divisoesEstimadas: [{ temporada: 'Inverno 2027', divisao: 'Feminino', participacao: 60, receitaEstimada: 150_000 }],
}

// O shim de tipos (src/xlsx.d.ts) não declara write/read completos.
const X = XLSX as unknown as {
  write: (wb: unknown, o: object) => ArrayBuffer
  read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown; t: string; z?: string }>> }
}

const wb = X.read(X.write(montarWorkbook(abasSazonalidade(dados), { empresa: dados.empresa, documento: 'Sazonalidade 2027' }), { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })

describe('Excel da Sazonalidade (M3)', () => {
  it('tem uma aba por tabela', () => {
    expect(wb.SheetNames).toEqual([
      'Resumo', 'Canais', 'Curva mensal', 'Receita por canal', 'Entrada por canal',
      'Motor por canal', 'Cenários', 'Cenários por canal', 'Divisão estimada',
    ])
  })

  it('resumo com formato por indicador', () => {
    const ws = wb.Sheets['Resumo']
    expect(ws['A1'].v).toBe('Sazonalidade 2027 — indicadores do ciclo')
    expect(String(ws['A2'].v)).toContain('Demonstração TFO')
    expect(ws['B5'].v).toBe(260_000)
    expect(ws['B5'].z).toContain('R$')
    expect(ws['B7'].v).toBe(10_000)                // diferença vs meta
    expect(ws['B8'].v).toBeCloseTo(0.04)            // +4% como fração
    expect(ws['B8'].z).toBe('0.0%')
    expect(ws['B9'].z).toBe('#,##0')                // entrada em peças
  })

  it('meses nas linhas, um canal por coluna, com total', () => {
    const ws = wb.Sheets['Receita por canal']
    expect(ws['A4'].v).toBe('Mês')
    expect(ws['B4'].v).toBe('Varejo Físico')
    expect(ws['C4'].v).toBe('E-commerce')
    expect(ws['D4'].v).toBe('Total')
    expect(ws['A5'].v).toBe('Janeiro')
    expect(ws['B5'].t).toBe('n')
    expect(ws['B5'].v).toBe(100_000)
    expect(ws['D5'].v).toBe(140_000)
    expect(ws['A7'].v).toBe('Total')
    expect(ws['D7'].v).toBe(260_000)
  })

  it('curva consolidada soma os canais e calcula Δ % sobre o ano anterior', () => {
    const ws = wb.Sheets['Curva mensal']
    expect(ws['B5'].v).toBe(140_000)
    expect(ws['C5'].v).toBe(100_000)
    expect(ws['E5'].v).toBeCloseTo(0.4)
    expect(ws['E6'].v).toBe('—')                    // fevereiro sem ano anterior
    expect(ws['F7'].v).toBe(1_100)                  // total de entrada
  })

  it('motor por canal em formato longo (canal × mês)', () => {
    const ws = wb.Sheets['Motor por canal']
    expect(ws['A5'].v).toBe('Varejo Físico')
    expect(ws['B5'].v).toBe('Janeiro')
    expect(ws['I5'].v).toBe(500)
    expect(ws['A8'].v).toBe('E-commerce')
  })

  it('cenário comparado com a meta', () => {
    const ws = wb.Sheets['Cenários']
    expect(ws['F5'].v).toBe(10_000)
    expect(ws['G5'].v).toBeCloseTo(0.04)
  })

  it('linhas consolidadas batem com o total do ciclo', () => {
    const soma = linhasConsolidado(dados).reduce((s, l) => s + l.receita, 0)
    expect(soma).toBe(dados.totalReceita)
  })

  it('nome de arquivo sem acento nem espaço', () => {
    expect(nomeArquivoSazonalidade('Demonstração TFO', 2027)).toBe('sazonalidade_demonstracao_tfo_2027')
  })
})
