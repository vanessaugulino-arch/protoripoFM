// ─── Regras de indicadores por segmento ──────────────────────────────────────
// Fonte: tabela de mapeamento segmento × indicador (documento de requisitos)

import type { SegmentId, IndicatorId, OnboardingProfile } from '../types/onboarding'

// Mapeamento: cada segmento ativa um conjunto de indicadores
const SEGMENT_INDICATORS: Record<SegmentId, IndicatorId[]> = {
  vest_fem:        ['algodao', 'emprego', 'renda', 'confianca'],
  vest_masc:       ['algodao', 'emprego', 'renda', 'confianca'],
  vest_inf:        ['algodao', 'emprego', 'confianca', 'natalidade'],
  acc_bolsas_fem:  ['petroleo', 'couro', 'metais', 'emprego', 'renda', 'confianca'],
  acc_bolsas_masc: ['petroleo', 'couro', 'metais', 'emprego', 'renda', 'confianca'],
  acc_bolsas_inf:  ['petroleo', 'couro', 'metais', 'emprego', 'confianca', 'natalidade'],
  calc_fem:        ['nafta', 'couro', 'metais', 'emprego', 'renda', 'confianca'],
  calc_masc:       ['nafta', 'couro', 'metais', 'emprego', 'renda', 'confianca'],
  calc_inf:        ['nafta', 'couro', 'metais', 'emprego', 'confianca', 'natalidade'],
  under_fem:       ['algodao', 'emprego', 'renda', 'confianca'],
  under_masc:      ['algodao', 'emprego', 'renda', 'confianca'],
  under_inf:       ['algodao', 'emprego', 'confianca', 'natalidade'],
  fitness_fem:     ['petroleo', 'nafta', 'emprego', 'confianca'],
  fitness_masc:    ['petroleo', 'nafta', 'emprego', 'confianca'],
  fitness_inf:     ['petroleo', 'nafta', 'emprego', 'confianca', 'natalidade'],
  praia_fem:       ['petroleo', 'nafta', 'emprego', 'confianca', 'turismo'],
  praia_masc:      ['petroleo', 'nafta', 'emprego', 'confianca', 'turismo'],
  praia_inf:       ['petroleo', 'nafta', 'emprego', 'confianca', 'natalidade', 'turismo'],
  bijuteria:       ['metais', 'emprego', 'renda', 'confianca'],
}

// Ordem de exibição preferencial dos indicadores
const INDICATOR_ORDER: IndicatorId[] = [
  'algodao', 'petroleo', 'nafta', 'couro', 'metais',
  'emprego', 'renda', 'confianca', 'natalidade', 'turismo',
  'frete', 'cambio',
]

/**
 * Calcula o conjunto de indicadores ativos com base no perfil do onboarding.
 * Retorna os IDs ordenados conforme INDICATOR_ORDER.
 */
export function getActiveIndicators(profile: OnboardingProfile): IndicatorId[] {
  const active = new Set<IndicatorId>()

  // 1. Union dos indicadores de todos os segmentos selecionados
  for (const seg of profile.segments) {
    const indicators = SEGMENT_INDICATORS[seg] ?? []
    for (const ind of indicators) {
      active.add(ind)
    }
  }

  // 2. Frete e câmbio: apenas se há importação OU exportação
  if (profile.hasImportedMaterial || profile.exports) {
    active.add('frete')
    active.add('cambio')
  } else {
    active.delete('frete')
    active.delete('cambio')
  }

  // 3. Retorna na ordem canônica
  return INDICATOR_ORDER.filter(id => active.has(id))
}

// ─── Metadados dos indicadores (label, fonte, valor de referência) ─────────────
export interface IndicatorMeta {
  label:    string
  fonte:    string
  valor:    string
  desc:     string  // descrição exibida no tooltip (aparece após 2s de hover)
  variacao?: string
  positivo?: boolean // true = variação positiva é boa para o negócio
}

export const INDICATOR_META: Record<IndicatorId, IndicatorMeta> = {
  algodao:   { label: 'Algodão (Pluma)',               fonte: 'CEPEA',     valor: 'US$ 82,5 /lb',     desc: 'Principal matéria-prima do vestuário. Alta no preço pressiona o custo do produto e corrói a margem bruta — monitore antes de fechar preço de coleção.',                                                       variacao: '+8,2%',  positivo: false },
  petroleo:  { label: 'Petróleo Brent',                fonte: 'ICE',       valor: 'US$ 78,4 /bbl',    desc: 'Base para derivados petroquímicos (poliéster, elastano, aviamentos sintéticos). Impacta indiretamente o custo de matéria-prima e o frete internacional.',                                                     variacao: '-3,1%',  positivo: true  },
  nafta:     { label: 'Nafta Petroquímica',             fonte: 'Platts',    valor: 'US$ 612 /t',       desc: 'Insumo direto na produção de fibras sintéticas (nylon, poliéster, elastano). Alta na nafta eleva o custo de tecidos técnicos e calçados com componentes plásticos.',                                          variacao: '+4,7%',  positivo: false },
  couro:     { label: 'Couro Bovino (Índice)',          fonte: 'CICB',      valor: '—',                desc: 'Matéria-prima de calçados, bolsas e acessórios. Variação no índice sinaliza pressão de custo nos segmentos de couro — acompanhe para antecipar ajustes de precificação.',                                     variacao: undefined                 },
  metais:    { label: 'Metais (Zamac/Cobre/Al/Au/Ag)', fonte: 'LME / B3',  valor: '—',                desc: 'Preço de metais usados em aviamentos, fivelas, botões e joias. Alta afeta o custo de acabamento em calçados e acessórios de moda.',                                                                            variacao: undefined                 },
  emprego:   { label: 'Emprego Formal (CAGED)',         fonte: 'MTE',       valor: '+87.430 empregos', desc: 'Variação mensal de empregos com carteira assinada. Mais empregos aumentam a renda disponível e o consumo de moda — indicador antecedente de demanda para o varejo.',                                          variacao: '+5,2%',  positivo: true  },
  renda:     { label: 'Renda Média Real',               fonte: 'IBGE/PNAD', valor: 'R$ 3.127',         desc: 'Rendimento médio real dos trabalhadores, descontada a inflação. Crescimento de renda amplia o ticket médio e sustenta posicionamento de preço acima da base do mercado.',                                      variacao: '+2,8%',  positivo: true  },
  confianca: { label: 'Confiança do Consumidor',        fonte: 'FGV',       valor: '92,4 pts',         desc: 'Índice que mede a disposição do consumidor para gastar. Queda na confiança antecipa retração nas compras não-essenciais — incluindo moda — antes que as vendas caiam.',                                        variacao: '-1,2%',  positivo: false },
  natalidade:{ label: 'Taxa de Natalidade',             fonte: 'IBGE',      valor: '—',                desc: 'Número de nascimentos por mil habitantes. Indicador de longo prazo para segmentos infantis — quedas sustentadas reduzem a base de consumidores potenciais para bebê e kids.',                                  variacao: undefined                 },
  turismo:   { label: 'Volume Serviços – Turismo',      fonte: 'IBGE',      valor: '+6,1% a.a.',       desc: 'Volume de serviços turísticos no país. Alta no turismo aumenta demanda por moda praia, resort e casual — especialmente em regiões litorâneas e destinos de verão.',                                            variacao: undefined                 },
  frete:     { label: 'Frete Marítimo (WCI)',           fonte: 'Drewry',    valor: 'US$ 2.847 /FEU',   desc: 'World Container Index — custo médio por contêiner de 40 pés. Alta no frete eleva o custo de importação de produto acabado e insumos, pressionando o Orçamento e a margem bruta.',                                   variacao: '+12,3%', positivo: false },
  cambio:    { label: 'Câmbio USD/BRL',                fonte: 'BCB Focus', valor: 'R$ 5,85',          desc: 'Taxa de câmbio dólar × real projetada pelo mercado (Focus/BCB). Câmbio alto encarece importação de insumos, reduz a margem em coleções com matéria-prima importada e pressiona o preço final.',               variacao: '+3,4%',  positivo: false },
}
