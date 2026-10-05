import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { abasPlanoFinal, type DadosPlanoFinal } from '../planoFinalRelatorio'
import { montarWorkbook, nomeArquivo } from '../xlsxReport'

const macro = {
  receitaBruta: 2_850_000, pecasVendidas: 18_387, pmv: 155, margemBruta: 42.3, custoMedio: 89.44,
  estoqueMediao: 392_373, giro: 6.9, cobertura: 50, gmroi: 2.92, mkdRS: 142_500, mkdPct: 5, orcamento: 1_644_450,
  source: 'channel_rollup', recomputed_at: '',
}

const dados: DadosPlanoFinal = {
  empresa: 'Demonstração TFO',
  ano: 2027,
  macro,
  kpis: [
    { chave: 'receitaBruta', rotulo: 'Receita', valor: 2_850_000, texto: 'R$ 2,9 M', variacaoPct: 12.5, bom: true, doM1: false },
    { chave: 'margemBruta', rotulo: 'Margem Bruta', valor: 42.3, texto: '42,3%', variacaoPct: null, bom: null, doM1: false },
    { chave: 'gmroi', rotulo: 'GMROI', valor: 2.92, texto: '2,9×', variacaoPct: null, bom: null, doM1: false },
  ],
  canais: [
    { canal: 'Varejo', receita: 940_500, mkdPct: 5, giro: 6.9, producao: 6068 },
    { canal: 'E-commerce', receita: 969_000, mkdPct: 5, giro: 6.9, producao: 6252 },
  ],
  entrada: [{ label: 'Julho', pieces: 638, avgPrice: 155, value: 98_890 }],
  estrutura: [{ divisionLabel: 'Feminino', total: 593_750, categories: [
    { category: 'Vestidos', total: 59_375, pieces: 383, avgPrice: 155, marginPct: 42.3, mkdPct: 5 },
  ] }],
}

// O shim de tipos (src/xlsx.d.ts) não declara write/read completos.
const X = XLSX as unknown as {
  write: (wb: unknown, o: object) => ArrayBuffer
  read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown; t: string; z?: string }>> }
}

// Ida e volta pelo formato .xlsx real, como o arquivo baixado.
const wb = X.read(X.write(montarWorkbook(abasPlanoFinal(dados), { empresa: dados.empresa, documento: 'Plano Final 2027' }), { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })

describe('Excel do Plano Final', () => {
  it('tem as quatro abas', () => {
    expect(wb.SheetNames).toEqual(['Resumo', 'Canais', 'Necessidade de entrada', 'Estrutura'])
  })

  it('título e empresa no topo de cada aba', () => {
    const ws = wb.Sheets['Canais']
    expect(ws['A1'].v).toBe('Indicadores por canal — 2027')
    expect(String(ws['A2'].v)).toContain('Demonstração TFO')
  })

  it('valores numéricos com formato, não texto', () => {
    const ws = wb.Sheets['Canais']
    // linha 5 = primeiro canal (cabeçalho na linha 4)
    expect(ws['B5'].t).toBe('n')
    expect(ws['B5'].v).toBe(940_500)
    expect(ws['B5'].z).toContain('R$')
    expect(ws['D5'].v).toBeCloseTo(0.05)          // 5% gravado como fração
    expect(ws['D5'].z).toBe('0.0%')
  })

  it('linha de total do consolidado ao final', () => {
    const ws = wb.Sheets['Canais']
    expect(ws['A7'].v).toBe('Consolidado')
    expect(ws['B7'].v).toBe(2_850_000)
  })

  it('aba Resumo formata cada indicador do seu jeito', () => {
    const ws = wb.Sheets['Resumo']
    expect(ws['B5'].z).toContain('R$')       // receita
    expect(ws['B6'].z).toBe('0.0%')          // margem
    expect(ws['B6'].v).toBeCloseTo(0.423)
    expect(ws['B7'].z).toContain('×')        // GMROI
  })

  it('valor ausente vira "—" e não zero', () => {
    const ws = wb.Sheets['Resumo']
    expect(ws['C6'].v).toBe('—')             // margem sem variação
  })

  it('nome de arquivo sem acento nem espaço', () => {
    expect(nomeArquivo('plano_final', 'Demonstração TFO', 2027)).toBe('plano_final_demonstracao_tfo_2027')
  })
})
