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

// ─── Matérias-primas (grupos por impacto de indicador) ────────────────────────
// Cada grupo mapeia materiais reais → indicador macro ativado no painel Planning.
// Fonte: Matriz_Exata_Segmentos.xlsx (planilha de mapeamento segmento × indicador)

export type RawMaterialGroupId =
  // Fibras naturais / algodão
  | 'algodao_fibras'         // vest_*
  | 'algodao_lonas'          // acc_*, calc_*
  | 'algodao_meia_malha'     // under_*
  // Couro natural
  | 'couro_legitimo'         // vest_*, acc_*, calc_*
  // Sintéticos à base de petróleo
  | 'sinteticos_vestuario'   // vest_*, under_*
  | 'sinteticos_tecnicos'    // fitness_*, praia_*
  | 'sinteticos_acc'         // acc_*
  | 'solados_sinteticos'     // calc_*
  | 'polimeros_otica'        // acc_*
  // Metais base (LME)
  | 'metais_aviamentos'      // vest_*
  | 'metais_ferragens'       // acc_*
  | 'metais_joias'           // acc_*
  | 'metais_armacoes'        // acc_*
  // Metais nobres
  | 'metais_nobres'          // acc_*

export interface RawMaterialGroup {
  id: RawMaterialGroupId
  label: string       // nome curto para UI
  detail: string      // materiais específicos (col B da planilha)
  indicator: IndicatorId
  segments: SegmentId[]
}

export const RAW_MATERIAL_GROUPS: RawMaterialGroup[] = [
  {
    id: 'algodao_fibras',
    label: 'Fibras de Algodão e Malharia',
    detail: 'Algodão, Denim/Jeans, Sarja, Tricoline, Moletom, Meia-malha',
    indicator: 'algodao',
    segments: ['vest_fem', 'vest_masc', 'vest_inf'],
  },
  {
    id: 'algodao_lonas',
    label: 'Lonas e Tecidos Naturais de Forro',
    detail: 'Lonas, Forrações de Algodão, Tecidos Naturais de Forro',
    indicator: 'algodao',
    segments: ['acc_fem', 'acc_masc', 'acc_inf', 'calc_fem', 'calc_masc', 'calc_inf'],
  },
  {
    id: 'algodao_meia_malha',
    label: 'Algodão e Meia-malha',
    detail: 'Algodão, Meia-malha',
    indicator: 'algodao',
    segments: ['under_fem', 'under_masc', 'under_inf'],
  },
  {
    id: 'couro_legitimo',
    label: 'Couro Legítimo e Peles',
    detail: 'Couro Legítimo, Camurça, Nobuck',
    indicator: 'couro',
    segments: ['vest_fem', 'vest_masc', 'vest_inf', 'acc_fem', 'acc_masc', 'acc_inf', 'calc_fem', 'calc_masc', 'calc_inf'],
  },
  {
    id: 'sinteticos_vestuario',
    label: 'Sintéticos e Elastano (Vestuário)',
    detail: 'Poliéster, Poliamida/Nylon, Elastano/Spandex, PU',
    indicator: 'petroleo',
    segments: ['vest_fem', 'vest_masc', 'vest_inf', 'under_fem', 'under_masc', 'under_inf'],
  },
  {
    id: 'sinteticos_tecnicos',
    label: 'Tecidos Técnicos de Performance',
    detail: 'Poliéster, Poliamida/Nylon, Elastano/Spandex',
    indicator: 'petroleo',
    segments: ['fitness_fem', 'fitness_masc', 'fitness_inf', 'praia_fem', 'praia_masc', 'praia_inf'],
  },
  {
    id: 'sinteticos_acc',
    label: 'Couro Sintético e Laminados',
    detail: 'PU (Couro Sintético), Nylon, Telas Sintéticas',
    indicator: 'petroleo',
    segments: ['acc_fem', 'acc_masc', 'acc_inf'],
  },
  {
    id: 'solados_sinteticos',
    label: 'Solados e Componentes Sintéticos',
    detail: 'EVA, TR, Borracha Sintética, PU',
    indicator: 'petroleo',
    segments: ['calc_fem', 'calc_masc', 'calc_inf'],
  },
  {
    id: 'polimeros_otica',
    label: 'Polímeros para Ótica',
    detail: 'Acetato de Celulose, TR90, Policarbonato',
    indicator: 'petroleo',
    segments: ['acc_fem', 'acc_masc', 'acc_inf'],
  },
  {
    id: 'metais_aviamentos',
    label: 'Aviamentos Metálicos',
    detail: 'Zinco, Cobre, Alumínio, Aço Inox (Zíperes, Rebites, Botões)',
    indicator: 'metais',
    segments: ['vest_fem', 'vest_masc', 'vest_inf'],
  },
  {
    id: 'metais_ferragens',
    label: 'Ferragens de Acessórios',
    detail: 'Zinco, Cobre, Alumínio, Aço Inox (Alças, Fivelas, Fechos)',
    indicator: 'metais',
    segments: ['acc_fem', 'acc_masc', 'acc_inf'],
  },
  {
    id: 'metais_joias',
    label: 'Metais para Semijoias e Bijuterias',
    detail: 'Zinco, Cobre, Alumínio, Aço Inox (Latão, Zamac)',
    indicator: 'metais',
    segments: ['acc_fem', 'acc_masc', 'acc_inf'],
  },
  {
    id: 'metais_armacoes',
    label: 'Metais para Armações de Ótica',
    detail: 'Zinco, Cobre, Aço Inoxidável (Dobradiças, Hastes)',
    indicator: 'metais',
    segments: ['acc_fem', 'acc_masc', 'acc_inf'],
  },
  {
    id: 'metais_nobres',
    label: 'Metais Nobres',
    detail: 'Ouro Puro (XAU), Prata (XAG), Ródio',
    indicator: 'metais_nobres',
    segments: ['acc_fem', 'acc_masc', 'acc_inf'],
  },
]

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
  | 'algodao' | 'petroleo' | 'nafta' | 'couro' | 'metais' | 'metais_nobres'
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
  rawMaterials: RawMaterialGroupId[]
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
