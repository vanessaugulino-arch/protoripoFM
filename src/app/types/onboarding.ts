// ─── Segmentos de produto ─────────────────────────────────────────────────────
export type SegmentId =
  | 'vest_fem' | 'vest_masc' | 'vest_inf'
  | 'acc_fem' | 'acc_masc' | 'acc_inf'
  | 'calc_fem' | 'calc_masc' | 'calc_inf'
  | 'under_fem' | 'under_masc' | 'under_inf'
  | 'fitness_fem' | 'fitness_masc' | 'fitness_inf'
  | 'praia_fem' | 'praia_masc' | 'praia_inf'

export const SEGMENT_LABELS: Record<SegmentId, string> = {
  vest_fem:   'Vestuário Feminino',
  vest_masc:  'Vestuário Masculino',
  vest_inf:   'Vestuário Infantil',
  acc_fem:    'Acessórios Feminino',
  acc_masc:   'Acessórios Masculino',
  acc_inf:    'Acessórios Infantil',
  calc_fem:   'Calçados Femininos',
  calc_masc:  'Calçados Masculinos',
  calc_inf:   'Calçados Infantis',
  under_fem:  'Underwear Feminino',
  under_masc: 'Underwear Masculino',
  under_inf:  'Underwear Infantil',
  fitness_fem:  'Moda Fitness Feminino',
  fitness_masc: 'Moda Fitness Masculino',
  fitness_inf:  'Moda Fitness Infantil',
  praia_fem:  'Moda Praia Feminino',
  praia_masc: 'Moda Praia Masculino',
  praia_inf:  'Moda Praia Infantil',
}

// ─── Matérias-primas ──────────────────────────────────────────────────────────
// AJUSTE 1: Poliamida adicionada como nova opção
export type RawMaterialId =
  | 'algodao' | 'eva' | 'pvc' | 'poliester' | 'poliamida'
  | 'couro' | 'zamac' | 'cobre' | 'aluminio' | 'ouro' | 'prata'

export const RAW_MATERIAL_LABELS: Record<RawMaterialId, string> = {
  algodao:   'Algodão',
  eva:       'EVA',
  pvc:       'PVC',
  poliester: 'Poliéster',
  poliamida: 'Poliamida',
  couro:     'Couro',
  zamac:     'Zamac',
  cobre:     'Cobre',
  aluminio:  'Alumínio',
  ouro:      'Ouro',
  prata:     'Prata',
}

export const ALL_RAW_MATERIALS: RawMaterialId[] = [
  'algodao', 'eva', 'pvc', 'poliester', 'poliamida',
  'couro', 'zamac', 'cobre', 'aluminio', 'ouro', 'prata',
]

export interface RankedMaterial {
  id: RawMaterialId
  rank: number // 1 = maior impacto
}

// ─── Origem das peças ─────────────────────────────────────────────────────────
// AJUSTE 2: Private label adicionado como nova opção
export type OrigemPecas = 'propria' | 'white_label' | 'private_label' | 'multimarca' | 'hibrido'

export const ORIGEM_LABELS: Record<OrigemPecas, string> = {
  propria:       'Produção própria',
  white_label:   'White label',
  private_label: 'Private label',
  multimarca:    'Multimarca',
  hibrido:       'Híbrido (combinação entre produção própria e white label, private label ou multimarca)',
}

// ─── Indicadores macroeconômicos ──────────────────────────────────────────────
export type IndicatorId =
  | 'algodao' | 'petroleo' | 'nafta' | 'couro' | 'metais'
  | 'emprego' | 'renda' | 'confianca' | 'natalidade' | 'turismo'
  | 'frete' | 'cambio'

// ─── Hierarquia de produtos (validação com ERP) ───────────────────────────────
export interface ProductHierarchyLevel {
  id: string
  label: string
  example: string
}

export const ERP_PRODUCT_HIERARCHY: ProductHierarchyLevel[] = [
  { id: 'grupo',     label: 'Grupo',     example: 'Feminino Adulto, Infantil' },
  { id: 'categoria', label: 'Categoria', example: 'Vestido, Saia, Blusa, Calça' },
  { id: 'linha',     label: 'Linha',     example: 'Festa, Casual, Trabalho' },
  { id: 'produto',   label: 'Produto',   example: 'Curto, Longo, Justo, Amplo' },
]

// ─── Canais de venda ──────────────────────────────────────────────────────────
export type SalesChannelId =
  | 'varejo_fisico' | 'ecommerce_proprio' | 'marketplace'
  | 'atacado' | 'franquia' | 'multimarca_canal' | 'popup' | 'social_commerce'

export interface SalesChannelDef {
  id: SalesChannelId
  label: string
  erpFound: boolean
}

export const SALES_CHANNELS: SalesChannelDef[] = [
  { id: 'varejo_fisico',     label: 'Varejo físico (loja própria)',    erpFound: true  },
  { id: 'ecommerce_proprio', label: 'E-commerce próprio',              erpFound: true  },
  { id: 'marketplace',       label: 'Marketplace',                     erpFound: false },
  { id: 'atacado',           label: 'Atacado / Representação',         erpFound: true  },
  { id: 'franquia',          label: 'Franquia',                        erpFound: false },
  { id: 'multimarca_canal',  label: 'Multimarca / Revendedores',       erpFound: false },
  { id: 'popup',             label: 'Pop-up e eventos',                erpFound: false },
  { id: 'social_commerce',   label: 'Redes sociais (social commerce)', erpFound: false },
]

// ─── Convites de equipe ───────────────────────────────────────────────────────
export type TeamRole = 'estrategico' | 'tatico' | 'operacional'

export interface TeamInvite {
  name: string
  email: string
  role: TeamRole
}

// ─── Opção de importação de dados ────────────────────────────────────────────
export type DataImportChoice =
  | 'erp_completo'   // ERP já tem tudo, incluindo hierarquia
  | 'hierarquia'     // ERP para dados + planilha para hierarquia
  | 'completa'       // tudo via planilhas (sem ERP)
  | 'deferred'       // importar depois

// ─── Perfil salvo após onboarding ────────────────────────────────────────────
export interface OnboardingProfile {
  segments: SegmentId[]
  rawMaterials: RankedMaterial[]
  origem: OrigemPecas
  hasImportedMaterial: boolean
  exports: boolean
  productHierarchy: string[]
  salesChannels: SalesChannelId[]
  teamInvites?: TeamInvite[]
  dataImportChoice?: DataImportChoice
  importedFileNames?: string[]
  completedAt: string
}

// ─── Chaves de localStorage ───────────────────────────────────────────────────
export const ONBOARDING_DONE_KEY    = 'fashionmind_onboarding_complete'
export const ONBOARDING_PROFILE_KEY = 'fashionmind_onboarding_profile'

export function getStoredProfile(): OnboardingProfile | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_PROFILE_KEY)
    return raw ? (JSON.parse(raw) as OnboardingProfile) : null
  } catch {
    return null
  }
}

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true'
}
