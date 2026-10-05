import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { abasDivisoes, nomeArquivoDivisoes, type DadosDivisoes, type DivisaoRelatorio } from '../divisoesRelatorio'
import { montarWorkbook } from '../xlsxReport'

const divisao = (id: string, nome: string, participacao: number, receita: number, real: boolean): DivisaoRelatorio => ({
  id, nome, participacao, sugeridoSazonalidade: participacao + 2, receita,
  pmv: 150, mkd: 5, margem: 45, sellThrough: 75,
  pmvAnoAnterior: 140, mkdAnoAnterior: null, margemAnoAnterior: 43.5,
  faixas: [
    { faixa: 'P1 Entrada', intervalo: '89-169', pctPecas: 40, precoMedio: 129, fontePreco: 'vendido' },
    { faixa: 'P2 Médio', intervalo: '179-259', pctPecas: 40, precoMedio: 219, fontePreco: 'ponto_medio' },
    { faixa: 'P3 Premium', intervalo: '269-389', pctPecas: 20, precoMedio: null, fontePreco: null },
  ],
  risco: { sustentadorMargem: 35, motorGiro: 35, iconeMarca: 20, basico: 10 },
  volume: {
    producao: 1000, orcamento: 80_000, vendasEsperadas: 900, estoqueInicial: 600, giro: 2.5, estoqueMedio: 360,
    cobertura: real ? 84 : null, reposicoes: 600, stCalc: 75, real,
  },
})

const dados: DadosDivisoes = {
  empresa: 'Demonstração TFO',
  temporada: 'Inverno 2027',
  periodoTemporada: 'Mar → Jul',
  ano: 2027,
  referencia: 'Inverno 2026',
  receitaTemporada: 500_000,
  receitaDaSazonalidade: true,
  participacaoTotal: 100,
  metasAtingidas: false,
  metas: [
    { chave: 'receitaBruta', rotulo: 'Receita Total', meta: 500_000, projetado: 500_000, formato: 'brl', dentroDaBanda: true },
    { chave: 'margemBruta', rotulo: 'Margem Bruta %', meta: 48, projetado: 45, formato: 'pct', dentroDaBanda: false },
    { chave: 'gmroi', rotulo: 'GMROI', meta: 0, projetado: 2.1, formato: 'multiplo', dentroDaBanda: true },
  ],
  consolidado: { receita: 500_000, pmv: 150, mkd: 5, margem: 45, sellThrough: 75 },
  compensacao: { margemAtual: 45, margemMeta: 48, mkdSugerido: 2, limitado: false },
  divisoes: [divisao('feminino', 'Feminino', 60, 300_000, true), divisao('masculino', 'Masculino', 40, 200_000, false)],
  cenarios: [{ nome: 'Conservador', descricao: 'teste', ativo: true, criadoEm: '01/10/2026', receita: 550_000, margem: 46 }],
}

// O shim de tipos (src/xlsx.d.ts) não declara write/read completos.
const X = XLSX as unknown as {
  write: (wb: unknown, o: object) => ArrayBuffer
  read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown; t: string; z?: string }>> }
}

const wb = X.read(X.write(montarWorkbook(abasDivisoes(dados), { empresa: dados.empresa, documento: 'Plano por Divisão' }), { type: 'array', bookType: 'xlsx' }), { type: 'array', cellNF: true })

describe('Excel do Plano por Divisão (M4)', () => {
  it('tem uma aba por tabela', () => {
    expect(wb.SheetNames).toEqual([
      'Resumo', 'Metas macro', 'Participação', 'Indicadores comerciais',
      'Pirâmide de preço', 'Matriz de risco', 'Volume e estoque', 'Cenários',
    ])
  })

  it('participação em % e receita em R$, com total', () => {
    const ws = wb.Sheets['Participação']
    expect(ws['A1'].v).toBe('Participação e receita por divisão — Inverno 2027')
    expect(String(ws['A2'].v)).toContain('Demonstração TFO')
    expect(ws['B5'].v).toBeCloseTo(0.6)
    expect(ws['B5'].z).toBe('0.0%')
    expect(ws['D5'].v).toBe(300_000)
    expect(ws['D5'].z).toContain('R$')
    expect(ws['A7'].v).toBe('Total')
    expect(ws['D7'].v).toBe(500_000)
    expect(ws['C7'].v).toBe('—')                    // sem sugerido no total
  })

  it('metas com formato por indicador e sem meta vira "—"', () => {
    const ws = wb.Sheets['Metas macro']
    expect(ws['B5'].z).toContain('R$')
    expect(ws['B6'].v).toBeCloseTo(0.48)
    expect(ws['D6'].v).toBeCloseTo(-0.03)
    expect(ws['E6'].v).toBe('fora da banda')
    expect(ws['B7'].v).toBe('—')
    expect(ws['C7'].z).toContain('×')
  })

  it('indicadores comerciais com consolidado e ano anterior ausente como "—"', () => {
    const ws = wb.Sheets['Indicadores comerciais']
    expect(ws['B5'].v).toBe(150)
    expect(ws['E5'].v).toBe('—')                    // MKD ano anterior sem dado
    expect(ws['A7'].v).toBe('Consolidado')
    expect(ws['I7'].v).toBe(1_800)                  // soma das vendas esperadas
  })

  it('pirâmide de preço: uma linha por faixa', () => {
    const ws = wb.Sheets['Pirâmide de preço']
    expect(ws['A5'].v).toBe('Feminino')
    expect(ws['B5'].v).toBe('P1 Entrada')
    expect(ws['D5'].v).toBeCloseTo(0.4)
    expect(ws['E5'].v).toBe(129)
    expect(ws['E7'].v).toBe('—')
    expect(ws['A10'].v).toBe('Masculino')
  })

  it('volume: cobertura sem estoque real vira "—" e total soma peças', () => {
    const ws = wb.Sheets['Volume e estoque']
    expect(ws['H5'].v).toBe(84)
    expect(ws['H6'].v).toBe('—')
    expect(ws['A7'].v).toBe('Total')
    expect(ws['B7'].v).toBe(2_000)
    expect(ws['C7'].v).toBe(160_000)
    expect(ws['J7'].v).toBeCloseTo(0.75)            // 1800 / (1200 + 1200)
  })

  it('cenário comparado com o plano atual', () => {
    const ws = wb.Sheets['Cenários']
    expect(ws['F5'].v).toBeCloseTo(0.1)
    expect(ws['H5'].v).toBeCloseTo(1)
  })

  it('nome de arquivo sem acento nem espaço', () => {
    expect(nomeArquivoDivisoes('Demonstração TFO', 'Inverno 2027')).toBe('plano_divisao_demonstracao_tfo_inverno_2027')
  })
})
