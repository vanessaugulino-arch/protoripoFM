import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { abasPlanejamentoMacro, formatarM1, type DadosPlanejamentoMacro } from '../planejamentoMacroRelatorio'
import { montarWorkbook, nomeArquivo } from '../xlsxReport'

const dados: DadosPlanejamentoMacro = {
  empresa: 'Demonstração TFO',
  ano: 2027,
  anoReferencia: '2025',
  dadosReais: true,
  foco: 'Rentabilidade',
  cenarioAtivo: 'Moderado',
  temProjecao: false,
  linhas: [
    { chave: 'receitaBruta', rotulo: 'Receita (R$)', formato: 'brl', plano: 3_120_000, projecao: null, referencia: 2_850_000, variacaoPct: 9.47, selecionado: true, notaReferencia: null },
    { chave: 'margemBruta', rotulo: 'Margem Bruta (%)', formato: 'pct', plano: 43.5, projecao: null, referencia: 42.3, variacaoPct: 2.84, selecionado: true, notaReferencia: 'estimado: nenhuma venda do ano tem produto com custo cadastrado' },
    { chave: 'gmroi', rotulo: 'GMROI', formato: 'multiplo', plano: 2.95, projecao: null, referencia: 2.92, variacaoPct: 1.03, selecionado: false, notaReferencia: null },
    { chave: 'cobertura', rotulo: 'Cobertura (dias)', formato: 'dias', plano: 52, projecao: null, referencia: null, variacaoPct: null, selecionado: false, notaReferencia: null },
  ],
  cenarios: [
    { nome: 'Conservador', ativo: false, valores: { receitaBruta: 2_950_000, margemBruta: 42.5, gmroi: 2.9, cobertura: 50 } },
    { nome: 'Moderado', ativo: true, valores: { receitaBruta: 3_120_000, margemBruta: 43.5, gmroi: 2.95, cobertura: null } },
  ],
}

// O shim de tipos (src/xlsx.d.ts) não declara write/read completos.
const X = XLSX as unknown as {
  write: (wb: unknown, o: object) => ArrayBuffer
  read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown; t: string; z?: string }>> }
}

const wb = X.read(X.write(montarWorkbook(abasPlanejamentoMacro(dados), { empresa: dados.empresa, documento: 'Planejamento Estratégico 2027' }), { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })

describe('Excel do Planejamento Estratégico (M1)', () => {
  it('tem as abas do consolidado e da comparação', () => {
    expect(wb.SheetNames).toEqual(['Cenário consolidado', 'Comparação de cenários'])
  })

  it('sem cenários salvos, só a aba do consolidado', () => {
    expect(abasPlanejamentoMacro({ ...dados, cenarios: [] }).map(a => a.nome)).toEqual(['Cenário consolidado'])
  })

  it('consolidado: valores numéricos com o formato de cada indicador', () => {
    const ws = wb.Sheets['Cenário consolidado']
    expect(ws['A1'].v).toBe('Planejamento Estratégico 2027 · cenário consolidado')
    expect(String(ws['A2'].v)).toContain('Demonstração TFO')
    expect(ws['D4'].v).toBe('Referência 2025')
    // linha 5 = receita
    expect(ws['C5'].t).toBe('n')
    expect(ws['C5'].v).toBe(3_120_000)
    expect(ws['C5'].z).toContain('R$')
    expect(ws['E5'].v).toBeCloseTo(0.0947)
    expect(ws['E5'].z).toBe('0.0%')
    // margem em %, gravada como fração
    expect(ws['C6'].v).toBeCloseTo(0.435)
    expect(ws['C6'].z).toBe('0.0%')
    expect(String(ws['F6'].v)).toContain('estimado')
    // GMROI como múltiplo, cobertura como inteiro
    expect(ws['C7'].z).toContain('×')
    expect(ws['C8'].z).toBe('#,##0')
    expect(ws['A5'].v).toBe('Selecionado')
    expect(ws['A7'].v).toBe('Demais')
  })

  it('referência ausente vira "—", não zero', () => {
    const ws = wb.Sheets['Cenário consolidado']
    expect(ws['D8'].v).toBe('—')
    expect(ws['E8'].v).toBe('—')
  })

  it('coluna de projeção só quando a tela tem projeção', () => {
    const abas = abasPlanejamentoMacro({ ...dados, temProjecao: true })
    expect(abas[0].colunas.map(c => c.titulo)).toContain('Projeção')
    expect(abasPlanejamentoMacro(dados)[0].colunas.map(c => c.titulo)).not.toContain('Projeção')
  })

  it('comparação: uma coluna por cenário, ativo marcado', () => {
    const ws = wb.Sheets['Comparação de cenários']
    expect(ws['B4'].v).toBe('Conservador')
    expect(ws['C4'].v).toBe('Moderado (ativo)')
    expect(ws['B5'].v).toBe(2_950_000)
    expect(ws['C6'].v).toBeCloseTo(0.435)
    expect(ws['C8'].v).toBe('—')
  })

  it('texto do PDF igual ao da tela', () => {
    expect(formatarM1('brl', 3_120_000)).toBe('R$ 3.120.000,00')
    expect(formatarM1('pct', 43.5)).toBe('43,50%')
    expect(formatarM1('multiplo', 2.95)).toBe('2,95x')
    expect(formatarM1('dias', 51.6)).toBe('52 dias')
    expect(formatarM1('pecas', 18387.4)).toBe('18.387 pç')
    expect(formatarM1('brl', null)).toBe('—')
  })

  it('nome de arquivo', () => {
    expect(nomeArquivo('planejamento_estrategico', 'Demonstração TFO', 2027)).toBe('planejamento_estrategico_demonstracao_tfo_2027')
  })
})
