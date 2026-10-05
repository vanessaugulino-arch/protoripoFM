// ─── productRole.ts ───────────────────────────────────────────────────────────
// Fonte única dos papéis de produto (products.risk_level).
//
// O banco aceita só os CÓDIGOS (constraint products_risk_level_check). Telas e
// planilhas usam os RÓTULOS. Antes deste arquivo cada serviço tinha sua lista
// e seu conversor; agora todos importam daqui.
//
// "Porta de Entrada" não é papel: é a faixa de preço P1 (ver migration 006).
//
// Atenção (não alterado aqui): o cenário padrão do Sortimento
// (sortimentDefaultScenario.ts) ainda usa só 3 rótulos, sem Básico, e esses
// rótulos ficam gravados no JSON dos planos. Mudar exige migrar os planos
// salvos, então fica para a etapa de unificação dos dados.
// ─────────────────────────────────────────────────────────────────────────────

export type ProductRoleId = 'basico' | 'motor_giro' | 'sustentador' | 'icone'

/** Ordem de exibição (grade Faixa × Papel, legendas, exportações). */
export const PRODUCT_ROLES: readonly ProductRoleId[] = ['basico', 'motor_giro', 'sustentador', 'icone']

export const PRODUCT_ROLE_LABELS: Record<ProductRoleId, string> = {
  basico:      'Básico',
  motor_giro:  'Motor de Giro',
  sustentador: 'Sustentador de Margem',
  icone:       'Ícone de Marca',
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const chave = (s: string) => semAcento(s).trim().toLowerCase().replace(/[\s_-]+/g, ' ')

/** Rótulos e códigos exatos, sem acento e em minúsculas → código. */
const EXATOS: Record<string, ProductRoleId> = Object.fromEntries(
  PRODUCT_ROLES.flatMap(id => [
    [chave(id), id],
    [chave(PRODUCT_ROLE_LABELS[id]), id],
  ]),
)

// Variações vistas em planilhas de ERP e na nomenclatura antiga (antes da 006).
const SINONIMOS: Record<string, ProductRoleId> = {
  'basicos': 'basico',
  'sustentador': 'sustentador',
  'motor': 'motor_giro',
  'giro': 'motor_giro',
  'moda': 'motor_giro',
  'icone': 'icone',
  'alta moda': 'icone',
}

/**
 * Converte qualquer grafia (código, rótulo, variação de ERP) no código aceito
 * pelo banco. Valor não reconhecido vira null — a coluna aceita NULL e o
 * produto aparece como "sem classificação".
 */
export function normalizeProductRole(v: unknown): ProductRoleId | null {
  if (v == null) return null
  const s = chave(String(v))
  if (!s) return null
  if (EXATOS[s]) return EXATOS[s]
  if (SINONIMOS[s]) return SINONIMOS[s]
  // Últimos recursos por trecho. Ordem importa: "sustentador de margem básico"
  // e "ícone de marca" contêm palavras de outros papéis.
  if (s.includes('sustent')) return 'sustentador'
  if (s.includes('icone')) return 'icone'
  if (s.includes('motor') || s.includes('giro')) return 'motor_giro'
  if (/\bbasic/.test(s)) return 'basico'
  return null
}

export function productRoleLabel(id: string | null | undefined): string {
  return id && id in PRODUCT_ROLE_LABELS ? PRODUCT_ROLE_LABELS[id as ProductRoleId] : 'Sem classificação'
}
