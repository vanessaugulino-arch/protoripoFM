// ─── Regras de indicadores por segmento e matéria-prima ──────────────────────
// Fonte: Matriz_Exata_Segmentos.xlsx (mapeamento segmento × matéria × indicador)
//
// Lógica:
//   1. Indicadores de custo     → derivados das matérias-primas selecionadas
//   2. Indicadores de mercado   → derivados dos segmentos selecionados
//   3. Indicadores de comércio  → frete + câmbio se há importação ou exportação

import type { IndicatorId, OnboardingProfile } from '../types/onboarding'
import { RAW_MATERIAL_GROUPS } from '../types/onboarding'

// ─── Ordem de exibição preferencial ──────────────────────────────────────────
const INDICATOR_ORDER: IndicatorId[] = [
  'algodao', 'petroleo', 'nafta', 'couro', 'metais', 'metais_nobres',
  'emprego', 'renda', 'confianca', 'natalidade', 'turismo',
  'frete', 'cambio',
]

/**
 * Calcula o conjunto de indicadores ativos com base no perfil do onboarding.
 * Retorna os IDs ordenados conforme INDICATOR_ORDER.
 */
export function getActiveIndicators(profile: OnboardingProfile): IndicatorId[] {
  const active = new Set<IndicatorId>()

  // 1. Indicadores de custo — ativados pelas matérias-primas selecionadas
  for (const matId of profile.rawMaterials) {
    const group = RAW_MATERIAL_GROUPS.find(g => g.id === matId)
    if (group) active.add(group.indicator)
  }

  // 2. Indicadores de mercado — derivados dos segmentos
  if (profile.segments.length > 0) {
    active.add('emprego')
    active.add('confianca')
  }
  // Renda: adultos (não-infantil)
  if (profile.segments.some(s => !s.endsWith('_inf'))) {
    active.add('renda')
  }
  // Natalidade: qualquer segmento infantil
  if (profile.segments.some(s => s.endsWith('_inf'))) {
    active.add('natalidade')
  }
  // Turismo: moda praia
  if (profile.segments.some(s => s.startsWith('praia_'))) {
    active.add('turismo')
  }

  // 3. Comércio exterior
  if (profile.hasImportedMaterial || profile.exports) {
    active.add('frete')
    active.add('cambio')
  }

  return INDICATOR_ORDER.filter(id => active.has(id))
}

// ─── Metadados dos indicadores (label, fonte, valor de referência) ────────────
export interface IndicatorMeta {
  label:    string
  fonte:    string
  valor:    string
  desc:     string
  variacao?: string
  positivo?: boolean
}

export const INDICATOR_META: Record<IndicatorId, IndicatorMeta> = {
  algodao:      { label: 'Algodão (Pluma)',                  fonte: 'CEPEA',        valor: 'US$ 82,5 /lb',      desc: 'Principal matéria-prima do vestuário. Alta no preço pressiona o custo do produto e corrói a margem bruta — monitore antes de fechar preço de coleção.',                                                                         variacao: '+8,2%',  positivo: false },
  petroleo:     { label: 'Petróleo Brent',                   fonte: 'ICE',          valor: 'US$ 78,4 /bbl',     desc: 'Base petroquímica de fibras sintéticas, solados, PU e laminados. Altas no barril encarecem toda a cadeia de sintéticos — vestuário, calçados, acessórios e fitness.',                                                           variacao: '-3,1%',  positivo: true  },
  nafta:        { label: 'Nafta Petroquímica',               fonte: 'Platts',       valor: 'US$ 612 /t',        desc: 'Insumo direto na produção de fibras sintéticas (nylon, poliéster, elastano). Alta na nafta eleva o custo de tecidos técnicos e calçados com componentes plásticos.',                                                             variacao: '+4,7%',  positivo: false },
  couro:        { label: 'Couro Bovino (Índice CEPEA)',      fonte: 'CICB',         valor: '—',                 desc: 'Matéria-prima de calçados, bolsas e peças estruturadas em couro legítimo. Variação no índice sinaliza pressão de custo — acompanhe para antecipar ajustes de precificação.',                                                      variacao: undefined                 },
  metais:       { label: 'Metais Base (LME)',                fonte: 'LME',          valor: '—',                 desc: 'Preço de metais usados em aviamentos (zíperes, rebites), ferragens (alças, fivelas) e semijoias (zamac, latão). Alta afeta diretamente o custo de acabamento e fundição.',                                                         variacao: undefined                 },
  metais_nobres:{ label: 'Metais Nobres (Ouro, Prata, Ródio)', fonte: 'LBMA / Spot', valor: '—',               desc: 'Preço spot de ouro (XAU), prata (XAG) e ródio. Impacta diretamente o custo de semijoias e bijuterias finas, bem como banhos de galvanoplastia premium em acessórios.',                                                            variacao: undefined                 },
  emprego:      { label: 'Emprego Formal (CAGED)',           fonte: 'MTE',          valor: '+87.430 empregos',  desc: 'Variação mensal de empregos com carteira assinada. Mais empregos aumentam a renda disponível e o consumo de moda — indicador antecedente de demanda para o varejo.',                                                                variacao: '+5,2%',  positivo: true  },
  renda:        { label: 'Renda Média Real',                 fonte: 'IBGE/PNAD',    valor: 'R$ 3.127',          desc: 'Rendimento médio real dos trabalhadores, descontada a inflação. Crescimento de renda amplia o ticket médio e sustenta posicionamento de preço acima da base do mercado.',                                                            variacao: '+2,8%',  positivo: true  },
  confianca:    { label: 'Confiança do Consumidor',          fonte: 'FGV',          valor: '92,4 pts',          desc: 'Índice que mede a disposição do consumidor para gastar. Queda na confiança antecipa retração nas compras não-essenciais — incluindo moda — antes que as vendas caiam.',                                                             variacao: '-1,2%',  positivo: false },
  natalidade:   { label: 'Taxa de Natalidade',               fonte: 'IBGE',         valor: '—',                 desc: 'Número de nascimentos por mil habitantes. Indicador de longo prazo para segmentos infantis — quedas sustentadas reduzem a base de consumidores potenciais para bebê e kids.',                                                        variacao: undefined                 },
  turismo:      { label: 'Volume Serviços – Turismo',        fonte: 'IBGE',         valor: '+6,1% a.a.',        desc: 'Volume de serviços turísticos no país. Alta no turismo aumenta demanda por moda praia, resort e casual — especialmente em regiões litorâneas e destinos de verão.',                                                                  variacao: undefined                 },
  frete:        { label: 'Frete Marítimo (WCI)',             fonte: 'Drewry',       valor: 'US$ 2.847 /FEU',    desc: 'World Container Index — custo médio por contêiner de 40 pés. Alta no frete eleva o custo de importação de produto acabado e insumos, pressionando o Orçamento e a margem bruta.',                                                       variacao: '+12,3%', positivo: false },
  cambio:       { label: 'Câmbio USD/BRL',                  fonte: 'BCB Focus',    valor: 'R$ 5,85',           desc: 'Taxa de câmbio dólar × real projetada pelo mercado (Focus/BCB). Câmbio alto encarece importação de insumos, reduz a margem em coleções com matéria-prima importada e pressiona o preço final.',                                        variacao: '+3,4%',  positivo: false },
}
