// ─── Onboarding.tsx v6 ──────────────────────────────────────────────────────
// Fluxo unificado — 14 telas em sequência (antes separadas em SystemPresentation + Onboarding):
//   Telas 1-4  (conceito/intro):   todos os usuários
//   Telas 5-8  (config segmento/canal/negócio): admin sem config
//   Tela  9    (seas_concept):     todos os usuários
//   Tela  10   (seasons config):   admin sem config
//   Tela  11   (hier_concept):     todos os usuários
//   Telas 12-14 (dados/equipe/conclusão): admin sem config
//
// Detecção de admin: sessionStorage.currentUser → role
//   Roles não-admin: 'estrategico' | 'tatico' | 'operacional'
//   Padrão: admin (mostra tudo)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronRight, ChevronLeft, Check, Plus,
  X, Upload, Info, CheckCircle2, Package, AlertTriangle,
} from 'lucide-react'
import ImportWizard from '../components/ImportWizard'
import type { ImportDataType, ImportResult } from '../../services/importService'
import { IMPORT_CONFIG } from '../../services/importService'
import {
  saveOnboardingProfileDb,
  isOnboardingCompleteDb,
  loadOnboardingProfileFromDb,
} from '../../services/supabase/onboardingService'
import {
  type SegmentId, type RawMaterialGroupId, type OrigemPecas,
  type SalesChannelId, type TeamInvite, type DataImportChoice,
  type OnboardingProfile, type HybridProcessType,
  SEGMENT_LABELS, RAW_MATERIAL_GROUPS, ORIGEM_LABELS,
  SALES_CHANNELS,
  ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
  getStoredProfile,
} from '../types/onboarding'
import {
  MONTHS, DEFAULT_REGRA, computeMesFim,
} from '../../services/temporadaService'
import { saveRegraDefaultDb, upsertCanalRegraDefaultDb, autoGenerateForYearDb, listSeasonsDb } from '../../services/supabase/seasonService'
import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Detecção síncrona de admin via sessionStorage ─────────────────────────────
function detectIsAdmin(): boolean {
  try {
    const raw = sessionStorage.getItem('currentUser')
    if (!raw) return true
    const user = JSON.parse(raw)
    const role = String(user.role ?? user.perfil ?? user.user_role ?? '').toLowerCase()
    // Roles de usuários convidados (não-admin)
    if (['estrategico', 'tatico', 'operacional'].includes(role)) return false
    return true // admin, gestor, support, owner ou desconhecido → mostra tudo
  } catch {
    return true
  }
}

// ── Constantes ────────────────────────────────────────────────────────────────
const ALL_SEGMENTS: SegmentId[] = [
  'vest_fem',     'vest_masc',     'vest_inf',
  'acc_bol_fem',  'acc_bol_masc',  'acc_bol_inf',
  'acc_joia_fem', 'acc_joia_masc', 'acc_joia_inf',
  'calc_fem',     'calc_masc',     'calc_inf',
  'under_fem',    'under_masc',    'under_inf',
  'fitness_fem',  'fitness_masc',  'fitness_inf',
  'praia_fem',    'praia_masc',    'praia_inf',
]

// Canais disponíveis para configuração de período de venda
const TODOS_CANAIS_VENDA: { id: string; name: string }[] = [
  { id: "varejo",          name: "Varejo Físico"          },
  { id: "ecommerce",       name: "E-commerce"             },
  { id: "atacado",         name: "Atacado / Distribuidor" },
  { id: "multimarca",      name: "Multimarca"             },
  { id: "franquia",        name: "Franquia"               },
  { id: "popup",           name: "Pop-up"                 },
  { id: "marketplace",     name: "Marketplace"            },
  { id: "social_commerce", name: "Social Commerce"        },
]

const ORIGENS: OrigemPecas[] = [
  'propria', 'white_label', 'private_label', 'multimarca', 'hibrido',
]

const ORIGEM_DESCRIPTIONS: Record<OrigemPecas, string> = {
  propria:       'Sua equipe controla o processo produtivo do início ao fim.',
  white_label:   'Produtos fabricados por terceiros vendidos com sua marca.',
  private_label: 'Produtos desenvolvidos exclusivamente para sua marca por um fabricante.',
  multimarca:    'Você revende produtos de outras marcas no seu canal.',
  hibrido:       'Combinação de dois ou mais modelos — configure os processos e a participação de cada um.',
}

const HYBRID_PROCESS_OPTIONS: HybridProcessType[] = [
  'propria', 'white_label', 'private_label', 'multimarca',
]

const UPLOAD_FIELDS = [
  { key: 'catalog',   label: 'Cadastro de Produtos',        required: true,  description: 'SKU, nome, divisão, categoria, subcategoria, preço, custo, cor, coleção.' },
  { key: 'sales',     label: 'Histórico de Vendas',         required: true,  description: 'SKU, data, quantidade, receita bruta, canal, desconto.'                    },
  { key: 'orders',    label: 'Ordens de Produção & Compra', required: false, description: 'Número da ordem (OC/OP), SKU, data, quantidade, fornecedor, status.'        },
  { key: 'inventory', label: 'Estoque Histórico',           required: false, description: 'SKU, data da posição (1º ou último dia do mês), quantidade, valor.'        },
]

// ── Etapas ────────────────────────────────────────────────────────────────────
type StepId =
  | 'desafio' | 'fluxo' | 'consegue'           // conceito intro (todos)
  | 'intro_1'                                    // plataforma (todos)
  | 'segments' | 'channels' | 'business'         // config admin
  | 'seas_concept'                               // temporadas conceito (todos)
  | 'seasons'                                    // config coleções admin
  | 'hier_concept'                               // hierarquia conceito (todos)
  | 'data' | 'team' | 'complete'                 // config admin

type StepMeta = { id: StepId; label: string; optional?: boolean }

// IDs das etapas de conceito/intro — usados para header e botão
const CONCEPT_IDS: StepId[] = [
  'desafio', 'fluxo', 'consegue', 'intro_1', 'seas_concept', 'hier_concept',
]

// IDs das etapas numeradas do admin (Etapa X de 6)
const ADMIN_NUMBERED: StepId[] = ['segments', 'channels', 'business', 'seasons', 'data', 'team']

// Etapas conceituais que aparecem para TODOS (não-admin também vê)
const ALL_USERS_CONCEPT: StepMeta[] = [
  { id: 'desafio',      label: 'O Desafio'            },
  { id: 'fluxo',        label: 'O Fluxo'               },
  { id: 'consegue',     label: 'O que você consegue'   },
  { id: 'intro_1',      label: 'A Plataforma'          },
]

const CONCEPT_TAIL: StepMeta[] = [
  { id: 'seas_concept', label: 'Temporadas' },
  { id: 'hier_concept', label: 'Hierarquia' },
]

// Etapas de configuração admin (na ordem correta do fluxo)
const ADMIN_FLOW: StepMeta[] = [
  { id: 'segments',     label: 'Segmentos' },
  { id: 'channels',     label: 'Canais'    },
  { id: 'business',     label: 'Negócio'   },
  { id: 'seas_concept', label: 'Temporadas' },
  { id: 'seasons',      label: 'Coleções'  },
  { id: 'hier_concept', label: 'Hierarquia' },
  { id: 'data',         label: 'Dados',    optional: true },
  { id: 'team',         label: 'Equipe',   optional: true },
  { id: 'complete',     label: 'Pronto!'   },
]

// ── Títulos/descrições por slide ──────────────────────────────────────────────
type SlideKey = StepId | 'business_b'

const SLIDE_INFO: Record<SlideKey, { title: string; desc: string }> = {
  desafio: {
    title: 'O desafio na moda',
    desc:  'Como estruturar uma coleção que parte de metas reais de receita e margem?',
  },
  fluxo: {
    title: 'Planejamento completo',
    desc:  'Um método em três níveis que conecta a meta macro ao detalhe do sortimento.',
  },
  consegue: {
    title: 'O que você consegue',
    desc:  'Decisões mais rápidas, coleções mais assertivas, metas que fecham.',
  },
  intro_1: {
    title: 'Da estratégia à sazonalidade — em um único plano',
    desc:  'Tudo começa pela receita. Do planejamento estratégico ao calendário da coleção, cada camada se alimenta da anterior — e o histórico ancora todas as decisões.',
  },
  hier_concept: {
    title: 'Hierarquia de Produtos',
    desc:  'A hierarquia é a arquitetura de dados que viabiliza a governança do seu estoque — do orçamento macro ao SKU.',
  },
  seas_concept: {
    title: 'Entendendo as Temporadas',
    desc:  'A temporada é o ciclo completo de uma coleção — do lançamento até o fim da liquidação. Ela estrutura o calendário de toda a operação.',
  },
  segments: {
    title: 'O sistema se adapta à estrutura de cada negócio, promovendo uma experiência única!',
    desc:  'Quais categorias sua marca comercializa? Isso estrutura filtros e indicadores em todo o sistema.',
  },
  business: {
    title: 'Modelo de Negócio',
    desc:  'Como sua marca obtém os produtos? Isso adapta os indicadores ao seu fluxo operacional.',
  },
  business_b: {
    title: 'Insumos & Comércio Exterior',
    desc:  'Informe sobre matérias-primas utilizadas e operações de importação ou exportação.',
  },
  channels: {
    title: 'Canais de Venda',
    desc:  'Quais canais geram receita? Isso estrutura o Planejamento de Metas por Canal.',
  },
  seasons: {
    title: 'Configure o Calendário de Coleções',
    desc:  'Defina os meses de início e fim de cada temporada — inclua o período de liquidação no mês de fim.',
  },
  data: {
    title: 'Dados & Importação',
    desc:  'Escolha como você vai trazer seus dados para o sistema. Você pode fazer isso agora ou depois em Configurações.',
  },
  team: {
    title: 'Convide sua Equipe',
    desc:  'Adicione colaboradores agora ou depois em Configurações → Usuários.',
  },
  complete: {
    title: 'Tudo pronto!',
    desc:  'Configuração inicial concluída. Qualquer ajuste pode ser feito depois em Operações.',
  },
}

// ══════════════════════════════════════════════════════════════════════════════
//  Componente
// ══════════════════════════════════════════════════════════════════════════════
export default function Onboarding() {
  const navigate  = useNavigate()
  const isAdmin   = detectIsAdmin()

  // Nota: não limpamos localStorage em DEV — o Login já sincroniza do DB.
  // Para forçar um novo onboarding em dev, use o botão "Reiniciar configuração"
  // disponível no painel quando configExists === true.

  // ── Detecção de configuração existente ────────────────────────────────────
  const [configExists,       setConfigExists]       = useState<boolean | null>(null)
  const [hierBalloonVisible, setHierBalloonVisible] = useState(false)
  const [hierBalloonClosed,  setHierBalloonClosed]  = useState(false)

  useEffect(() => {
    // 1. Verificação rápida via localStorage
    const stored = getStoredProfile()
    if (stored) { setConfigExists(true); return }

    // 2. Verificação assíncrona via onboarding_profiles (fonte canônica)
    const tenantId = sessionStorage.getItem('activeTenantId')
    if (!tenantId) { setConfigExists(false); return }

    ;(async () => {
      try {
        const done = await isOnboardingCompleteDb(tenantId)
        if (done) {
          // Hidrata localStorage para que módulos síncronos funcionem
          await loadOnboardingProfileFromDb(tenantId)
        }
        setConfigExists(done)
      } catch {
        setConfigExists(false)
      }
    })()
  }, [])

  // ── STEP_META dinâmico ────────────────────────────────────────────────────
  // Admin sem config → fluxo completo (14 telas)
  // Outros → apenas telas de conceito (6 telas)
  const showAdminConfig = isAdmin && configExists === false

  const STEP_META: StepMeta[] = useMemo(() => {
    if (configExists === null) return []
    if (showAdminConfig) {
      return [...ALL_USERS_CONCEPT, ...ADMIN_FLOW]
    }
    return [...ALL_USERS_CONCEPT, ...CONCEPT_TAIL]
  }, [configExists, showAdminConfig])

  // ── Navegação principal ───────────────────────────────────────────────────
  const [step,     setStep]     = useState(0)
  const [bizSlide, setBizSlide] = useState<0 | 1>(0)

  const currentStepId = STEP_META[step]?.id ?? 'desafio'

  const slideKey: SlideKey =
    currentStepId === 'business' && bizSlide === 1 ? 'business_b' : currentStepId as SlideKey

  const info = SLIDE_INFO[slideKey] ?? SLIDE_INFO['desafio']

  const isConceptStep = CONCEPT_IDS.includes(currentStepId)

  // Índice entre as etapas numeradas do admin (−1 se não for etapa admin)
  const adminEtapaIdx = ADMIN_NUMBERED.indexOf(currentStepId as StepId)

  const subLabel = currentStepId === 'business' ? `${bizSlide + 1}/2` : null

  // ── Etapa: Segmentos ──────────────────────────────────────────────────────
  const [segments, setSegments] = useState<SegmentId[]>([])
  function toggleSegment(id: SegmentId) {
    setSegments(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  // ── Etapa: Negócio ────────────────────────────────────────────────────────
  const [origem,             setOrigem]             = useState<OrigemPecas | null>(null)
  const [selectedMaterials,  setSelectedMaterials]  = useState<RawMaterialGroupId[]>([])
  const [hasImport,          setHasImport]          = useState<boolean | null>(null)
  const [hasExport,          setHasExport]          = useState<boolean | null>(null)
  const [hybridProcesses,    setHybridProcesses]    = useState<HybridProcessType[]>([])
  const [hybridParticipations, setHybridParticipations] = useState<Partial<Record<HybridProcessType, number>>>({})

  function toggleHybridProcess(type: HybridProcessType) {
    setHybridProcesses(prev => {
      if (prev.includes(type)) {
        const next = prev.filter(p => p !== type)
        setHybridParticipations(p => { const np = { ...p }; delete np[type]; return np })
        return next
      }
      return [...prev, type]
    })
  }

  function setHybridParticipation(type: HybridProcessType, value: number) {
    setHybridParticipations(prev => ({ ...prev, [type]: Math.min(100, Math.max(0, value)) }))
  }

  const totalHybridParticipation = hybridProcesses.reduce(
    (sum, p) => sum + (hybridParticipations[p] ?? 0), 0,
  )

  const showMaterials     = origem !== null && origem !== 'multimarca'
  const materialsRequired = origem === 'propria' || origem === 'hibrido'

  const availableMaterialGroups = RAW_MATERIAL_GROUPS.filter(g =>
    g.segments.some(s => segments.includes(s))
  )

  function toggleMaterial(id: RawMaterialGroupId) {
    setSelectedMaterials(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  const bizSlide0Valid =
    origem !== null && (origem !== 'hibrido' || hybridProcesses.length >= 2)

  const bizSlide1Valid =
    (!materialsRequired || selectedMaterials.length > 0) &&
    hasImport !== null &&
    hasExport !== null

  // ── Etapa: Canais ─────────────────────────────────────────────────────────
  const [selectedChannels, setSelectedChannels] = useState<SalesChannelId[]>([])
  function toggleChannel(id: SalesChannelId) {
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  // ── Etapa: Temporadas ─────────────────────────────────────────────────────
  const [veraoInicio,   setVeraoInicio]   = useState(DEFAULT_REGRA.verao.mesInicio)
  const [veraoFim,      setVeraoFim]      = useState(DEFAULT_REGRA.verao.mesFim)
  const [invernoInicio, setInvernoInicio] = useState(DEFAULT_REGRA.inverno.mesInicio)
  const [invernoFim,    setInvernoFim]    = useState(DEFAULT_REGRA.inverno.mesFim)
  // Períodos de venda por canal (ciclo financeiro/logístico — distinto do calendário de comunicação)
  const [canalVendaRegras, setCanalVendaRegras] = useState<{ canal_id: string; tipo: "verao" | "inverno"; mes_inicio: string; mes_fim: string }[]>([])
  const [addCanalIds,      setAddCanalIds]      = useState<Set<string>>(new Set())
  const [addCanalTipo,     setAddCanalTipo]     = useState<"verao" | "inverno">("verao")
  const [addCanalInicio,   setAddCanalInicio]   = useState(MONTHS[0])
  const [addCanalFim,      setAddCanalFim]      = useState(MONTHS[0])
  useEffect(() => { setInvernoFim(computeMesFim(veraoInicio))  }, [veraoInicio])
  useEffect(() => { setVeraoFim(computeMesFim(invernoInicio))  }, [invernoInicio])

  // ── Balão hier_concept — aparece após 2s e habilita o botão Avançar ───────
  useEffect(() => {
    if (currentStepId !== 'hier_concept') {
      setHierBalloonVisible(false)
      setHierBalloonClosed(false)
      return
    }
    const t = setTimeout(() => setHierBalloonVisible(true), 2000)
    return () => clearTimeout(t)
  }, [currentStepId])

  // ── Etapa: Dados ──────────────────────────────────────────────────────────
  const [dataChoice,       setDataChoice]       = useState<DataImportChoice | null>(null)
  const [uploadedFiles,    setUploadedFiles]    = useState<Record<string, string>>({})
  const [activeWizardType, setActiveWizardType] = useState<ImportDataType | null>(null)
  const [importResults,    setImportResults]    = useState<Partial<Record<ImportDataType, ImportResult>>>({})

  const activeTenantId = (() => {
    try {
      const cu = sessionStorage.getItem('currentUser')
      if (!cu) return ''
      const parsed = JSON.parse(cu)
      return sessionStorage.getItem('activeTenantId') ?? parsed.tenant_id ?? ''
    } catch { return '' }
  })()

  function handleWizardComplete(result: ImportResult) {
    setImportResults(prev => ({ ...prev, [result.dataType]: result }))
    setUploadedFiles(prev => ({ ...prev, [result.dataType]: result.fileName }))
    setActiveWizardType(null)
    try {
      const IMPORT_HISTORY_KEY = 'fm_import_history_v1'
      const existing = JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) ?? '[]')
      localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify([{
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dataType: result.dataType,
        label:    IMPORT_CONFIG[result.dataType]?.label ?? result.dataType,
        importedRows: result.importedRows, errors: result.errors,
        fileName: result.fileName, timestamp: new Date().toISOString(), source: 'onboarding',
      }, ...existing].slice(0, 50)))
    } catch { /* silent */ }
  }

  const FIELD_KEY_TO_IMPORT_TYPE: Record<string, ImportDataType> = {
    catalog: 'catalog', sales: 'sales', orders: 'orders', inventory: 'inventory',
  }

  // ── Etapa: Equipe ─────────────────────────────────────────────────────────
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([
    { name: '', email: '', role: 'estrategico' },
  ])
  function updateInvite(i: number, field: keyof TeamInvite, value: string) {
    setTeamInvites(prev => prev.map((inv, idx) => idx === i ? { ...inv, [field]: value } : inv))
  }
  function addInvite() {
    setTeamInvites(prev => [...prev, { name: '', email: '', role: 'operacional' }])
  }
  function removeInvite(i: number) {
    setTeamInvites(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Navegação ─────────────────────────────────────────────────────────────
  function goNext() {
    if (currentStepId === 'business' && bizSlide === 0) { setBizSlide(1); return }
    if (currentStepId === 'business') setBizSlide(0)
    if (step >= STEP_META.length - 1) {
      // Último step do fluxo não-admin (hier_concept) → vai pro dashboard
      navigate('/dashboard')
      return
    }
    setStep(s => s + 1)
  }

  function goBack() {
    if (step === 0) return // desabilitado no primeiro passo
    if (currentStepId === 'business' && bizSlide === 1) { setBizSlide(0); return }
    setStep(s => Math.max(s - 1, 0))
  }

  function skipStep() {
    if (currentStepId === 'data') setDataChoice('deferred')
    setStep(s => Math.min(s + 1, STEP_META.length - 1))
  }

  // ── Conclusão ─────────────────────────────────────────────────────────────
  async function complete() {
    const validInvites = teamInvites.filter(inv => inv.email.trim() && inv.name.trim())
    const profile: OnboardingProfile = {
      segments,
      rawMaterials: selectedMaterials,
      origem: origem ?? 'propria',
      hybridProcesses: origem === 'hibrido'
        ? hybridProcesses.map(type => ({ type, participation: hybridParticipations[type] ?? 0 }))
        : undefined,
      hasImportedMaterial: hasImport ?? false,
      exports:             hasExport ?? false,
      productHierarchy:    [],
      salesChannels:       selectedChannels,
      teamInvites:         validInvites.length > 0 ? validInvites : undefined,
      dataImportChoice:    dataChoice ?? 'deferred',
      importedFileNames:   Object.values(uploadedFiles).length > 0 ? Object.values(uploadedFiles) : undefined,
      completedAt:         new Date().toISOString(),
    }

    // 1. Persiste em localStorage (leitura síncrona por Planning, ChannelPlanning)
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))

    const tenantId = sessionStorage.getItem('activeTenantId') ?? ''
    if (tenantId) {
      // 2. Persiste no Supabase (onboarding_profiles — fonte canônica).
      //    AGUARDA a gravação antes de navegar: sem o await, a navegação para o
      //    dashboard cancela a requisição em voo e o perfil não persiste — é o
      //    que fazia o onboarding reaparecer a cada login / troca de navegador.
      try {
        await saveOnboardingProfileDb(tenantId, profile)
      } catch (err) {
        console.error('Erro ao salvar perfil de onboarding:', err)
        alert(
          'Não foi possível salvar sua configuração no servidor. ' +
          'Verifique sua conexão e clique em Concluir novamente.'
        )
        return // não navega — evita "concluir" sem persistir no banco
      }

      // 3. Regra de temporadas e 4. períodos por canal — best-effort,
      //    não bloqueiam a conclusão (o perfil canônico já está salvo).
      try {
        await saveRegraDefaultDb(tenantId, {
          verao:               { mesInicio: veraoInicio,   mesFim: veraoFim   },
          inverno:             { mesInicio: invernoInicio, mesFim: invernoFim },
          canalPeriodsUnified: canalVendaRegras.length === 0,
        })
        // Gera as temporadas do ano corrente e do próximo a partir da regra, para
        // que apareçam JÁ no card de Temporadas (antes eram criadas só ao planejar).
        // Só gera se o tenant ainda não tem NENHUMA temporada — evita duplicar em
        // bases já configuradas.
        const existentes = await listSeasonsDb(tenantId).catch(() => [])
        if (existentes.length === 0) {
          const anoAtual = new Date().getFullYear()
          await autoGenerateForYearDb(tenantId, anoAtual).catch(() => null)
          await autoGenerateForYearDb(tenantId, anoAtual + 1).catch(() => null)
        }
      } catch (err) {
        console.warn('Erro ao salvar/gerar temporadas:', err)
      }

      for (const r of canalVendaRegras) {
        upsertCanalRegraDefaultDb(tenantId, r.canal_id, r.tipo, r.mes_inicio, r.mes_fim)
          .catch(err => console.warn('Erro ao salvar regra de canal:', err))
      }
    } else {
      console.warn('activeTenantId ausente na conclusão do onboarding — perfil salvo apenas localmente')
    }

    navigate('/dashboard')
  }

  // ── Validação ─────────────────────────────────────────────────────────────
  const nextDisabled =
    (currentStepId === 'hier_concept' && !hierBalloonVisible) ||
    (!isConceptStep && (
      (currentStepId === 'segments' && segments.length === 0) ||
      (currentStepId === 'business' && bizSlide === 0 && !bizSlide0Valid) ||
      (currentStepId === 'business' && bizSlide === 1 && !bizSlide1Valid) ||
      (currentStepId === 'channels' && selectedChannels.length === 0) ||
      (currentStepId === 'seasons'  && veraoInicio === invernoInicio) ||
      (currentStepId === 'data'     && !!activeWizardType)
    ))

  // Texto do botão avançar
  const nextLabel =
    currentStepId === 'desafio' || currentStepId === 'fluxo' ? 'Próximo' :
    isConceptStep ? 'Entendido, avançar' :
    'Continuar'

  // ── Label do header ────────────────────────────────────────────────────────
  const headerLabel =
    isConceptStep   ? 'Bem-vindo ao Fashion Mind' :
    adminEtapaIdx >= 0 ? `Etapa ${adminEtapaIdx + 1} de ${ADMIN_NUMBERED.length}` :
    '' // complete

  // ══════════════════════════════════════════════════════════════════════════
  //  Loading state
  // ══════════════════════════════════════════════════════════════════════════
  if (configExists === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#28071C]">
        <p className="text-white/30 text-sm tracking-wide">Preparando seu ambiente…</p>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#28071C] relative">

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════
          TOPBAR
      ══════════════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 h-[72px] flex items-center px-8 gap-6">
        <div className="flex items-baseline gap-1.5 flex-shrink-0 w-44">
          <span className="text-[#F6F3AA] text-sm font-light tracking-wide select-none">tfo</span>
          <span className="text-[#F6F3AA]/35 text-[9px] tracking-widest uppercase select-none">/ the fashion office</span>
        </div>

        <div className="flex-1 flex items-center justify-center gap-2.5">
          {STEP_META.map((s, i) => {
            const isCurrent   = i === step
            const isCompleted = i < step
            if (isCurrent) {
              return (
                <span key={`${s.id}-${i}`}
                  className="bg-[#7598CF]/25 text-white text-xs font-semibold px-3.5 py-1 rounded-full border border-[#7598CF]/45 select-none whitespace-nowrap">
                  {s.label}
                  {subLabel && <span className="ml-1.5 text-[#7598CF] font-normal">{subLabel}</span>}
                </span>
              )
            }
            return (
              <div key={`${s.id}-${i}`}
                className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                  isCompleted ? 'bg-[#F6F3AA]/75' : 'bg-white/18'
                }`} />
            )
          })}
        </div>

        <div className="w-44 flex-shrink-0" />
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          ÁREA PRINCIPAL
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-[#F2F2F2] rounded-t-2xl overflow-hidden">

        {/* Cabeçalho da etapa */}
        <div className="flex-shrink-0 px-12 pt-7 pb-4">
          {headerLabel && (
            <p className="text-[#28071C]/35 text-[11px] font-bold uppercase tracking-widest mb-1.5">
              {headerLabel}
              {subLabel && adminEtapaIdx >= 0 && (
                <span className="ml-1 text-[#7598CF]/60">· {subLabel}</span>
              )}
            </p>
          )}
          <h2 className="text-[#28071C] text-2xl font-bold tracking-tight leading-snug">{info.title}</h2>
          <p className="text-[#28071C]/55 text-sm mt-1.5 leading-relaxed max-w-3xl">{info.desc}</p>
        </div>
        <div className="flex-shrink-0 h-px bg-[#28071C]/8 mx-12" />

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-12 py-7">

          {/* ── TELA 1: O Desafio ─────────────────────────────────────── */}
          {currentStepId === 'desafio' && (
            <div className="h-full flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: 'Ferramentas financeiras tradicionais param no teto de gastos e volume de compra', desc: 'Nós conectamos esse orçamento à construção de um mix estratégico, aplicando governança adaptativa para alinhar a meta financeira ao ciclo real de produção e linguagem da moda.' },
                  { title: 'PLMs assumem a arquitetura já decidida',       desc: 'Partem do produto, não da meta financeira.' },
                  { title: 'Entre o número e a criação há um vazio',       desc: 'Nenhuma ferramenta preenche esse gap com método.' },
                  { title: 'Decisões sem base de dados integrada',          desc: 'Estilo e comercial trabalham desconectados.' },
                ].map((item, i) => (
                  <div key={i} className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
                    <div>
                      <p className="text-[#28071C] text-sm font-semibold leading-snug">{item.title}</p>
                      <p className="text-[#28071C]/55 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[#28071C] rounded-2xl px-6 py-4 text-white">
                <p className="text-[#F6F3AA] font-semibold text-base mb-3">A solução Fashion Mind</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {[
                    'Planejamento de cima para baixo — da meta ao detalhe',
                    'Do estratégico até o operacional em um método claro',
                    'Simule, salve e compare cenários em qualquer ponto',
                    'Preenche o vazio entre finanças e criação',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-white/80">
                      <span className="text-[#F6F3AA] flex-shrink-0 mt-0.5">✓</span>
                      {item}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[#F6F3AA]/55 text-xs italic">
                  "De uma meta de receita a um portfólio balanceado e assertivo."
                </p>
              </div>
            </div>
          )}

          {/* ── TELA 2: O Fluxo ───────────────────────────────────────── */}
          {currentStepId === 'fluxo' && (
            <div className="h-full flex flex-col gap-3">
              {[
                {
                  level: 'Estratégico',
                  color: 'bg-[#7598CF]', text: 'text-[#7598CF]',
                  border: 'border-[#7598CF]/25', bg: 'bg-[#7598CF]/6',
                  desc: 'Metas de receita, margem e orçamento',
                  detail: 'Foco em giro? Margem? Crescimento? Simule cenários "Crescimento" vs "Conservador" antes de comprometer o ciclo.',
                },
                {
                  level: 'Tático',
                  color: 'bg-[#9B8CD8]', text: 'text-[#9B8CD8]',
                  border: 'border-[#9B8CD8]/25', bg: 'bg-[#9B8CD8]/6',
                  desc: 'Quebra por canal, sazonalidade e grupos',
                  detail: 'Quanto cada divisão contribui? Compare distribuições e veja o impacto consolidado em tempo real.',
                },
                {
                  level: 'Operacional',
                  color: 'bg-[#28071C]', text: 'text-[#28071C]',
                  border: 'border-[#28071C]/15', bg: 'bg-[#28071C]/4',
                  desc: 'Engenharia de sortimento e mix de produtos',
                  detail: 'Quantos SKUs? Qual distribuição por faixa de preço? Simule composições com base sólida em números reais.',
                },
              ].map((item, i) => (
                <div key={i} className={`${item.bg} border ${item.border} rounded-xl px-5 py-3.5`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.color}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${item.text}`}>{item.level}</span>
                  </div>
                  <p className="text-[#28071C] font-semibold text-sm">{item.desc}</p>
                  <p className="text-[#28071C]/55 text-xs mt-0.5 leading-relaxed">{item.detail}</p>
                </div>
              ))}
              <div className="bg-[#F6F3AA]/50 border border-[#F6F3AA] rounded-xl px-5 py-3 text-center">
                <p className="text-[#28071C] font-semibold text-sm">
                  Em cada nível: simule → salve → compare → selecione o melhor cenário
                </p>
                <p className="text-[#28071C]/45 text-xs mt-0.5">
                  Nenhuma simulação altera dados oficiais até você aplicar formalmente.
                </p>
              </div>
            </div>
          )}

          {/* ── TELA 3: O que você consegue ───────────────────────────── */}
          {currentStepId === 'consegue' && (
            <div className="h-full flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    icon: '🎯', perfil: 'Estratégico', modulos: 'Módulos 1 e 2',
                    badge: 'bg-[#28071C] text-[#F6F3AA]',
                    color: 'border-[#28071C]/15 bg-[#28071C]/3',
                    desc: 'Vejo minha meta decomposta até o último detalhe. Simulo cenários antes de decidir. Tenho recomendações em tempo real se algo sai do trilho.',
                  },
                  {
                    icon: '📊', perfil: 'Tático', modulos: 'Módulos 3 e 4',
                    badge: 'bg-[#7598CF]/15 text-[#7598CF]',
                    color: 'border-[#7598CF]/25 bg-[#7598CF]/5',
                    desc: 'Entendo como o estratégico se divide nos meus canais. Comparo diferentes distribuições e escolho a melhor. Meus ajustes se desdobram em todos os níveis.',
                  },
                  {
                    icon: '✏️', perfil: 'Operacional', modulos: 'Módulo 5',
                    badge: 'bg-[#9B8CD8]/15 text-[#9B8CD8]',
                    color: 'border-[#9B8CD8]/25 bg-[#9B8CD8]/5',
                    desc: 'Recebo um briefing claro com metas por categoria. Simulo diferentes composições de sortimento. Meu trabalho criativo tem base sólida em números.',
                  },
                ].map((item, i) => (
                  <div key={i} className={`border rounded-xl px-4 py-3.5 ${item.color}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{item.icon}</span>
                      <div>
                        <p className="text-[#28071C] font-semibold text-sm leading-snug">{item.perfil}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${item.badge}`}>
                          {item.modulos}
                        </span>
                      </div>
                    </div>
                    <p className="text-[#28071C]/65 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#28071C] rounded-xl px-5 py-3 flex items-start gap-2.5">
                <span className="text-base flex-shrink-0">✅</span>
                <div>
                  <p className="font-bold text-xs mb-0.5 text-[#F6F3AA] uppercase tracking-widest">Resultado</p>
                  <p className="text-white/80 text-xs leading-relaxed">
                    Menos rejeição, mais assertividade — coleções que fecham as metas e um processo até 70% mais rápido.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: '📈', title: 'O histórico ancora tudo',   desc: 'Vendas, giro e sazonalidade por coleção. O passado informa o futuro — o sistema calcula o quanto mudar e quanto manter.' },
                  { icon: '🔗', title: 'Planos conectados',          desc: 'Alterar a receita no Módulo 1 recalcula automaticamente tudo que impacta os módulos seguintes.'                          },
                  { icon: '⚖️', title: 'Hierarquia de prioridade',  desc: 'O campo de maior impacto estratégico protege o valor inserido pelo gestor.'                                              },
                  { icon: '🔄', title: 'Ciclos, não relatórios',     desc: 'O sistema acompanha toda a vida de uma coleção — do planejamento ao fechamento.'                                        },
                ].map((p, i) => (
                  <div key={i} className="bg-white border border-[#28071C]/8 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <span className="text-sm flex-shrink-0 mt-0.5">{p.icon}</span>
                    <div>
                      <p className="text-[#28071C] text-[11px] font-bold leading-snug">{p.title}</p>
                      <p className="text-[#28071C]/50 text-[10px] mt-0.5 leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TELA 4: A Plataforma (intro_1) ────────────────────────── */}
          {currentStepId === 'intro_1' && (
            <div className="flex flex-col gap-4 h-full">
              {/* O que é */}
              <div className="bg-white rounded-xl border border-[#28071C]/8 px-5 py-3.5">
                <p className="text-[#28071C]/50 text-[10px] font-bold uppercase tracking-widest mb-1.5">O que é</p>
                <p className="text-[#28071C] text-sm leading-relaxed">
                  O Fashion Mind é uma plataforma de gestão para o mercado de moda que conecta o planejamento financeiro ao operacional —
                  do número de receita ao calendário da coleção. Desenvolvido sobre a metodologia que os melhores gestores já aplicam
                  intuitivamente, o sistema formaliza esse conhecimento, permite <strong>simular cenários antes de qualquer compromisso</strong> e
                  coloca todos os perfis trabalhando no mesmo plano.
                </p>
              </div>

              {/* Cascata metodológica */}
              <div className="flex flex-col flex-1 min-h-0">
                <p className="text-[#28071C]/45 text-[10px] font-bold uppercase tracking-widest mb-2.5">
                  A metodologia: do macro ao micro
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { nivel: '01', nome: 'Planejamento Macro', detalhe: 'Receita, margem, custo médio, cobertura de estoque, orçamento total.',                    cor: 'bg-[#28071C] text-white',          bordaCor: 'border-[#28071C]'     },
                    { nivel: '02', nome: 'Canal',              detalhe: 'Distribui o plano macro por loja física, e-commerce, atacado e outros canais.',            cor: 'bg-[#7598CF]/15 text-[#7598CF]',   bordaCor: 'border-[#7598CF]/30'  },
                    { nivel: '03', nome: 'Divisão',            detalhe: 'Feminino, masculino, infantil — cada divisão com sua margem e mix.',                       cor: 'bg-[#9B8CD8]/15 text-[#9B8CD8]',   bordaCor: 'border-[#9B8CD8]/30'  },
                    { nivel: '04', nome: 'Sazonalidade',       detalhe: 'Distribuição mensal das metas — curva de vendas e calendário da coleção.',                 cor: 'bg-[#F6F3AA]/60 text-[#28071C]',   bordaCor: 'border-[#F6F3AA]'     },
                    { nivel: '05', nome: 'Sortimento',         detalhe: 'Categorias, peças e mix de preços — a vitrine em números.',                                cor: 'bg-emerald-50 text-emerald-700',   bordaCor: 'border-emerald-200'   },
                  ].map((nivel, i, arr) => (
                    <div key={nivel.nivel} className="flex flex-col gap-1.5">
                      <div className={`rounded-2xl border-2 ${nivel.bordaCor} px-3 py-4 flex flex-col gap-2 flex-1`}>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md self-start ${nivel.cor}`}>
                          {nivel.nivel}
                        </span>
                        <p className="text-[#28071C] text-xs font-bold leading-tight">{nivel.nome}</p>
                        <p className="text-[#28071C]/50 text-[11px] leading-relaxed">{nivel.detalhe}</p>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="w-full h-0.5 bg-[#28071C]/10 relative">
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-[#28071C]/20" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── TELA 5: Segmentos ─────────────────────────────────────── */}
          {currentStepId === 'segments' && (
            <div>
              <div className="grid grid-cols-3 gap-2">
                {ALL_SEGMENTS.map(id => {
                  const selected = segments.includes(id)
                  return (
                    <button key={id} onClick={() => toggleSegment(id)}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${
                        selected
                          ? 'bg-[#28071C] border-[#28071C] text-white'
                          : 'bg-white border-[#28071C]/10 text-[#28071C]/70 hover:border-[#7598CF]/50'
                      }`}>
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        selected ? 'bg-white border-white' : 'border-[#28071C]/20'
                      }`}>
                        {selected && <Check className="w-2.5 h-2.5 text-[#28071C]" />}
                      </div>
                      {SEGMENT_LABELS[id]}
                    </button>
                  )
                })}
              </div>
              {segments.length > 0 && (
                <p className="text-xs text-[#28071C]/40 mt-3">
                  {segments.length} segmento{segments.length > 1 ? 's' : ''} selecionado{segments.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* ── TELA 6: Canais de Venda ───────────────────────────────── */}
          {currentStepId === 'channels' && (
            <div>
              <div className="grid grid-cols-3 gap-2 max-w-3xl">
                {SALES_CHANNELS.map(ch => {
                  const selected = selectedChannels.includes(ch.id)
                  return (
                    <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        selected
                          ? 'bg-[#28071C]/5 border-[#28071C]'
                          : 'bg-white border-[#28071C]/10 hover:border-[#7598CF]/50'
                      }`}>
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 ${
                        selected ? 'bg-[#28071C] border-[#28071C]' : 'border-[#28071C]/20'
                      }`}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-[#28071C] text-sm font-medium">{ch.label}</span>
                    </button>
                  )
                })}
              </div>
              {selectedChannels.length > 0 && (
                <p className="text-xs text-[#28071C]/40 mt-3">
                  {selectedChannels.length} canal{selectedChannels.length > 1 ? 'is' : ''} selecionado{selectedChannels.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* ── TELA 7: Negócio — Modelo de Negócio ──────────────────── */}
          {currentStepId === 'business' && bizSlide === 0 && (
            <div className="max-w-lg space-y-2">
              {ORIGENS.map(o => (
                <button key={o} onClick={() => {
                  setOrigem(o)
                  if (o !== 'hibrido') { setHybridProcesses([]); setHybridParticipations({}) }
                  setHasImport(null)
                }}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all ${
                    origem === o
                      ? 'bg-[#28071C]/5 border-[#28071C]'
                      : 'bg-white border-[#28071C]/10 hover:border-[#7598CF]/50'
                  }`}>
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                    origem === o ? 'border-[#28071C] bg-[#28071C]' : 'border-[#28071C]/30'
                  }`}>
                    {origem === o && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-[#28071C] text-sm font-semibold">{ORIGEM_LABELS[o]}</p>
                    {origem === o && (
                      <p className="text-[#28071C]/50 text-xs mt-0.5">{ORIGEM_DESCRIPTIONS[o]}</p>
                    )}
                  </div>
                </button>
              ))}

              {origem === 'hibrido' && (
                <div className="mt-3 p-4 bg-[#7598CF]/5 border border-[#7598CF]/25 rounded-2xl">
                  <p className="text-[#28071C] text-sm font-bold mb-1">Quais processos sua marca combina?</p>
                  <p className="text-[#28071C]/50 text-xs mb-3">Selecione ao menos 2 processos.</p>
                  <div className="space-y-2 mb-4">
                    {HYBRID_PROCESS_OPTIONS.map(o => {
                      const selected = hybridProcesses.includes(o)
                      return (
                        <button key={o} onClick={() => toggleHybridProcess(o)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                            selected ? 'bg-white border-[#28071C]' : 'bg-white/60 border-[#28071C]/10 hover:border-[#7598CF]/50'
                          }`}>
                          <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                            selected ? 'bg-[#28071C] border-[#28071C]' : 'border-[#28071C]/20'
                          }`}>
                            {selected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="text-[#28071C] text-sm font-medium">{ORIGEM_LABELS[o]}</span>
                        </button>
                      )
                    })}
                  </div>

                  {hybridProcesses.length >= 2 && (
                    <div className="border-t border-[#7598CF]/20 pt-4">
                      <p className="text-[#28071C]/60 text-xs font-bold uppercase tracking-widest mb-3">
                        Participação aproximada de cada processo
                      </p>
                      <div className="space-y-3">
                        {hybridProcesses.map(proc => (
                          <div key={proc} className="flex items-center gap-3">
                            <span className="text-[#28071C]/65 text-xs flex-1 min-w-0 truncate">
                              {ORIGEM_LABELS[proc]}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <input
                                type="number" min={0} max={100} step={5}
                                value={hybridParticipations[proc] ?? ''}
                                onChange={e => setHybridParticipation(proc, +e.target.value)}
                                placeholder="0"
                                className="w-16 px-2 py-1.5 border-2 border-[#28071C]/15 rounded-lg text-sm text-right text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white"
                              />
                              <span className="text-[#28071C]/40 text-xs">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className={`text-xs font-semibold ${
                          Math.abs(totalHybridParticipation - 100) <= 10 ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          Total: {totalHybridParticipation}%
                          {Math.abs(totalHybridParticipation - 100) > 10 && ' — ajuste para ~100%'}
                        </p>
                      </div>
                      <p className="text-[#28071C]/35 text-[11px] mt-2 italic">
                        Participações aproximadas — serão refinadas com a importação dos dados históricos.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TELA 8: Negócio — Insumos & Comércio Exterior ─────────── */}
          {currentStepId === 'business' && bizSlide === 1 && (
            <div className="flex gap-6 h-full">
              {showMaterials ? (
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-[#28071C]/60 text-xs font-bold uppercase tracking-widest">
                      Matérias-primas relevantes
                    </label>
                    {materialsRequired && (
                      <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">
                        Selecione ao menos 1
                      </span>
                    )}
                  </div>
                  <p className="text-[#28071C]/45 text-xs mb-3">
                    Os indicadores macroeconômicos relevantes serão ativados automaticamente.
                  </p>
                  {availableMaterialGroups.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-[#28071C]/10 rounded-xl">
                      <p className="text-[#28071C]/30 text-sm text-center px-6">
                        Selecione os segmentos de produto na etapa anterior para ver as matérias-primas disponíveis.
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto bg-white border border-[#28071C]/10 rounded-xl divide-y divide-[#28071C]/6">
                      {availableMaterialGroups.map(group => {
                        const selected = selectedMaterials.includes(group.id)
                        return (
                          <button key={group.id} onClick={() => toggleMaterial(group.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                              selected ? 'bg-[#7598CF]/6' : 'hover:bg-[#28071C]/3'
                            }`}>
                            <div className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                              selected ? 'border-[#7598CF] bg-[#7598CF]' : 'border-[#28071C]/20'
                            }`}>
                              {selected && <Check className="w-2 h-2 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-semibold leading-snug ${selected ? 'text-[#28071C]' : 'text-[#28071C]/75'}`}>
                                {group.label}
                              </span>
                              <p className="text-[10px] text-[#28071C]/35 leading-snug truncate">{group.detail}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {showMaterials && <div className="w-px bg-[#28071C]/8 self-stretch flex-shrink-0" />}

              <div className={`flex flex-col gap-6 ${showMaterials ? 'flex-1 min-w-0' : 'max-w-lg w-full'}`}>
                <label className="text-[#28071C]/60 text-xs font-bold uppercase tracking-widest">
                  Comércio exterior
                </label>
                {[
                  { label: 'Usa matéria-prima importada?', val: hasImport, setter: setHasImport,
                    hint: 'Câmbio e frete marítimo serão monitorados nos indicadores de custo.' },
                  { label: 'Sua marca exporta produtos?', val: hasExport, setter: setHasExport,
                    hint: 'Ativaremos indicadores de moeda e mercado externo.' },
                ].map(q => (
                  <div key={q.label}>
                    <p className="text-[#28071C] text-sm font-semibold mb-3">{q.label}</p>
                    <div className="flex gap-2">
                      {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(({ v, l }) => (
                        <button key={l} onClick={() => q.setter(v)}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                            q.val === v
                              ? 'bg-[#28071C] border-[#28071C] text-white'
                              : 'bg-white border-[#28071C]/12 text-[#28071C]/70 hover:border-[#7598CF]/50'
                          }`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {q.val === true && (
                      <p className="mt-2 text-xs text-[#7598CF] flex items-start gap-1">
                        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        {q.hint}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TELA 9: Entendendo as Temporadas (seas_concept) ──────────── */}
          {currentStepId === 'seas_concept' && (
            <div className="flex gap-8 h-full">
              {/* Esq — conceito */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div className="bg-white rounded-2xl border border-[#28071C]/8 px-5 py-4">
                  <p className="text-[#28071C] text-xs font-bold uppercase tracking-widest mb-2">
                    O que é uma temporada?
                  </p>
                  <p className="text-[#28071C]/60 text-sm leading-relaxed">
                    A temporada (Verão/SS ou Inverno/AW) é o <strong className="text-[#28071C]">ciclo completo de uma coleção</strong> —
                    desde o lançamento até o fim da liquidação. Ela funciona como um "guarda-chuva" temporal que abriga
                    o Preview (peças que chegam antes da virada oficial), os drops e cápsulas intermediários, e o período de markdown para queima de estoque.
                  </p>
                  <p className="text-[#28071C]/50 text-xs mt-2 leading-relaxed">
                    <strong className="text-[#28071C]">Atenção:</strong> o mês de fim deve incluir a liquidação, não apenas o período de preço cheio.
                    Excluir o markdown deixa as vendas desse período sem coleção, distorcendo faturamento e sell-through.
                    Após o mês de fim, o sistema ainda tolera até 60 dias para resíduos de estoque de perfil específico.
                  </p>
                </div>

                <div>
                  <p className="text-[#28071C]/55 text-xs font-bold uppercase tracking-widest mb-2">
                    Como o sistema usa a temporada
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { e: '🎨', t: 'Criativo',   d: 'Vincula cada produto (Preview, principal ou drop) à coleção — cartela de cores, silhuetas, coesão visual.' },
                      { e: '⚙️', t: 'Industrial', d: 'Calcula lead time reverso: a data que o produto precisa estar na vitrine determina quando comprar MP e programar produção.' },
                      { e: '💼', t: 'Comercial',  d: 'Mede sell-through durante os meses ativos. Alerta quando o ritmo indica necessidade de antecipar o markdown.' },
                    ].map(p => (
                      <div key={p.t} className="bg-[#F2F2F2] border border-[#28071C]/8 rounded-xl px-3 py-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-base">{p.e}</span>
                          <span className="text-[#28071C] text-xs font-bold">{p.t}</span>
                        </div>
                        <p className="text-[#28071C]/55 text-[11px] leading-relaxed">{p.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="w-px bg-[#28071C]/8 self-stretch flex-shrink-0" />

              {/* Dir — contexto Brasil + configuração (compacto para não rolar) */}
              <div className="w-80 flex-shrink-0 flex flex-col gap-2.5">
                <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
                  <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                  <p className="text-[#28071C]/65 text-xs leading-relaxed">
                    <strong className="text-[#28071C]">Contexto Brasil:</strong> Verão costuma ir de <strong>agosto a fevereiro</strong> (incluindo liquidação de jan-fev);
                    Inverno de <strong>março a julho</strong>. O Preview de Verão pode chegar em julho, mas ainda pertence à temporada Verão —
                    o mês de início é quando a comunicação e a vitrine mudam de fato.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#28071C]/8 px-4 py-3.5">
                  <p className="text-[#28071C] text-xs font-bold uppercase tracking-widest mb-2.5">
                    O que você vai configurar
                  </p>
                  <div className="space-y-2 mb-2.5">
                    {[
                      { emoji: '☀️', nome: 'Verão (SS)',    ex: 'Agosto → Fevereiro' },
                      { emoji: '❄️', nome: 'Inverno (AW)',  ex: 'Março → Julho'      },
                    ].map(t => (
                      <div key={t.nome} className="flex items-center gap-3 bg-[#F2F2F2] rounded-xl px-3 py-2">
                        <span className="text-xl flex-shrink-0">{t.emoji}</span>
                        <div>
                          <p className="text-[#28071C] text-xs font-bold">{t.nome}</p>
                          <p className="text-[#28071C]/45 text-[11px]">{t.ex}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                    <Info className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-700 text-[11px] leading-relaxed">
                      A sazonalidade histórica das suas temporadas ancora o cálculo de cobertura de estoque e o volume de abastecimento mês a mês.
                    </p>
                  </div>
                  <p className="text-[#28071C]/40 text-[11px] italic">
                    Os meses exatos são configurados na próxima etapa — se o sistema já estiver configurado, você pode ajustá-los em Configurações.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── TELA 10: Configure o Calendário de Coleções ───────────── */}
          {currentStepId === 'seasons' && (
            <div className="flex gap-5 h-full">

              {/* ── COLUNA ESQUERDA: Calendário de Comunicação ─────────── */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div>
                  <p className="text-[10px] font-bold text-[#28071C]/50 uppercase tracking-widest mb-0.5">
                    Calendário de Comunicação
                  </p>
                  <p className="text-[11px] text-[#28071C]/45 leading-relaxed">
                    Período em que a temporada é lançada ao mercado — base do calendário criativo e de marketing.
                  </p>
                </div>

                {/* Cards Verão + Inverno compactos */}
                <div className="flex gap-3">
                  {/* Verão */}
                  <div className="w-[168px] bg-white rounded-xl border-2 border-[#7598CF]/25 p-3.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-base">☀️</span>
                      <span className="text-[#28071C] font-bold text-sm">Verão</span>
                    </div>
                    <div className="space-y-2">
                      {[
                        { l: 'Início', v: veraoInicio, fn: setVeraoInicio },
                        { l: 'Fim (liquidação)', v: veraoFim, fn: setVeraoFim },
                      ].map(s => (
                        <div key={s.l}>
                          <label className="block text-[9px] text-[#28071C]/40 font-bold uppercase tracking-widest mb-0.5">{s.l}</label>
                          <select value={s.v} onChange={e => s.fn(e.target.value)}
                            className="w-full px-2 py-1.5 border border-[#7598CF]/25 rounded-lg text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer">
                            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Inverno */}
                  <div className="w-[168px] bg-white rounded-xl border-2 border-[#9B8CD8]/25 p-3.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-base">❄️</span>
                      <span className="text-[#28071C] font-bold text-sm">Inverno</span>
                    </div>
                    <div className="space-y-2">
                      {[
                        { l: 'Início', v: invernoInicio, fn: setInvernoInicio },
                        { l: 'Fim (liquidação)', v: invernoFim, fn: setInvernoFim },
                      ].map(s => (
                        <div key={s.l}>
                          <label className="block text-[9px] text-[#28071C]/40 font-bold uppercase tracking-widest mb-0.5">{s.l}</label>
                          <select value={s.v} onChange={e => s.fn(e.target.value)}
                            className="w-full px-2 py-1.5 border border-[#9B8CD8]/25 rounded-lg text-xs text-[#28071C] focus:outline-none focus:border-[#9B8CD8] bg-white cursor-pointer">
                            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Nota sobre nomes das temporadas */}
                <div className="flex items-start gap-2 bg-white border border-[#28071C]/8 rounded-lg px-3 py-2.5">
                  <Info className="w-3.5 h-3.5 text-[#28071C]/35 flex-shrink-0 mt-0.5" />
                  <p className="text-[#28071C]/50 text-[11px] leading-relaxed">
                    Os nomes (ex.: <em>Verão 2026</em>) são gerados automaticamente. Você pode renomear cada temporada depois em <strong className="text-[#28071C]/70">Configurações → Operação</strong>.
                  </p>
                </div>

                {/* Avisos */}
                {veraoInicio === invernoInicio && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <p className="text-amber-800 text-[11px]">Verão e Inverno não podem ter o mesmo mês de início.</p>
                  </div>
                )}
                <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-lg px-3 py-2.5">
                  <Info className="w-3.5 h-3.5 text-[#7598CF] flex-shrink-0 mt-0.5" />
                  <p className="text-[#28071C]/60 text-[11px] leading-relaxed">
                    Os meses permanecem os mesmos a cada ano. Instâncias anuais (Verão 2026 etc.) são geradas automaticamente ao salvar um Planejamento.
                  </p>
                </div>
              </div>

              {/* Divisor vertical */}
              <div className="w-px bg-[#28071C]/10 self-stretch flex-shrink-0" />

              {/* ── COLUNA DIREITA: Período de Venda por Canal ─────────── */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div>
                  <p className="text-[10px] font-bold text-[#28071C]/50 uppercase tracking-widest mb-0.5">
                    Período de Venda por Canal
                  </p>
                  <p className="text-[11px] text-[#28071C]/45 leading-relaxed">
                    Ciclo financeiro e logístico de cada canal. Atacado fatura antes do lançamento; varejo e e-commerce vendem durante a temporada.
                  </p>
                </div>

                {/* Lista de canais configurados */}
                {canalVendaRegras.length > 0 && (
                  <div className="bg-white border border-[#28071C]/10 rounded-xl overflow-hidden max-h-[200px] overflow-y-auto">
                    <div className="grid gap-2 px-3 py-1.5 bg-[#28071C]/3 border-b border-[#28071C]/6"
                      style={{ gridTemplateColumns: '68px 1fr 90px 90px 24px' }}>
                      <span className="text-[9px] font-bold text-[#28071C]/40 uppercase tracking-widest">Temporada</span>
                      <span className="text-[9px] font-bold text-[#28071C]/40 uppercase tracking-widest">Canal</span>
                      <span className="text-[9px] font-bold text-[#28071C]/40 uppercase tracking-widest">Início</span>
                      <span className="text-[9px] font-bold text-[#28071C]/40 uppercase tracking-widest">Fim</span>
                      <span />
                    </div>
                    {canalVendaRegras.map(r => {
                      const canal = TODOS_CANAIS_VENDA.find(c => c.id === r.canal_id)
                      return (
                        <div key={`${r.canal_id}-${r.tipo}`}
                          className="grid gap-2 items-center px-3 py-2 border-b border-[#28071C]/6 last:border-b-0 hover:bg-[#28071C]/2 transition-colors"
                          style={{ gridTemplateColumns: '68px 1fr 90px 90px 24px' }}>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${
                            r.tipo === "verao"
                              ? "bg-[#F6F3AA]/80 text-[#28071C]/70"
                              : "bg-[#7598CF]/15 text-[#7598CF]"
                          }`}>
                            {r.tipo === "verao" ? "Verão" : "Inverno"}
                          </span>
                          <span className="text-xs font-semibold text-[#28071C]/70 truncate">{canal?.name ?? r.canal_id}</span>
                          <span className="text-xs text-[#28071C]">{r.mes_inicio}</span>
                          <span className="text-xs text-[#28071C]">{r.mes_fim}</span>
                          <button
                            onClick={() => setCanalVendaRegras(prev => prev.filter(x => !(x.canal_id === r.canal_id && x.tipo === r.tipo)))}
                            className="text-[#28071C]/25 hover:text-red-500 transition-colors flex items-center justify-center">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Formulário de adição inline */}
                {TODOS_CANAIS_VENDA.some(c => !canalVendaRegras.find(r => r.canal_id === c.id && r.tipo === addCanalTipo)) && (
                  <div className="bg-[#7598CF]/5 border border-[#7598CF]/20 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-[#28071C]/40 uppercase tracking-widest mb-2">Adicionar canal</p>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="w-[100px]">
                        <label className="text-[9px] text-[#28071C]/40 font-semibold uppercase tracking-wide">Temporada</label>
                        <select value={addCanalTipo} onChange={e => { setAddCanalTipo(e.target.value as "verao" | "inverno"); setAddCanalIds(new Set()) }}
                          className="w-full mt-0.5 px-2 py-1.5 border border-[#7598CF]/20 rounded-lg text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer">
                          <option value="verao">Verão</option>
                          <option value="inverno">Inverno</option>
                        </select>
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="text-[9px] text-[#28071C]/40 font-semibold uppercase tracking-wide">
                          Canais
                          {addCanalIds.size > 0 && (
                            <span className="ml-1 text-[#7598CF]">({addCanalIds.size} selecionado{addCanalIds.size > 1 ? 's' : ''})</span>
                          )}
                        </label>
                        <div className="mt-0.5 border border-[#7598CF]/20 rounded-lg bg-white overflow-y-auto max-h-[74px]">
                          {TODOS_CANAIS_VENDA
                            .filter(c => !canalVendaRegras.find(r => r.canal_id === c.id && r.tipo === addCanalTipo))
                            .map((c, i, arr) => (
                              <label
                                key={c.id}
                                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs text-[#28071C] hover:bg-[#7598CF]/5 transition-colors${i < arr.length - 1 ? ' border-b border-[#7598CF]/10' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={addCanalIds.has(c.id)}
                                  onChange={() => setAddCanalIds(prev => {
                                    const next = new Set(prev)
                                    next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                                    return next
                                  })}
                                  className="accent-[#7598CF] cursor-pointer"
                                />
                                {c.name}
                              </label>
                            ))}
                        </div>
                      </div>
                      <div className="w-24">
                        <label className="text-[9px] text-[#28071C]/40 font-semibold uppercase tracking-wide">Início</label>
                        <select value={addCanalInicio} onChange={e => setAddCanalInicio(e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 border border-[#7598CF]/20 rounded-lg text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer">
                          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="text-[9px] text-[#28071C]/40 font-semibold uppercase tracking-wide">Fim</label>
                        <select value={addCanalFim} onChange={e => setAddCanalFim(e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 border border-[#7598CF]/20 rounded-lg text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer">
                          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <button
                        disabled={addCanalIds.size === 0}
                        onClick={() => {
                          if (addCanalIds.size === 0) return
                          setCanalVendaRegras(prev => {
                            const filtered = prev.filter(r => !(addCanalIds.has(r.canal_id) && r.tipo === addCanalTipo))
                            const newEntries = Array.from(addCanalIds).map(cid => ({
                              canal_id: cid, tipo: addCanalTipo,
                              mes_inicio: addCanalInicio, mes_fim: addCanalFim,
                            }))
                            return [...filtered, ...newEntries]
                          })
                          setAddCanalIds(new Set())
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#7598CF] text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    </div>
                  </div>
                )}

                {canalVendaRegras.length === 0 && (
                  <p className="text-[11px] text-[#28071C]/40 italic leading-relaxed">
                    Se todos os seus canais vendem no mesmo período da temporada, não é necessário adicionar entradas aqui.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── TELA 11: Hierarquia de Produtos (hier_concept) ────────── */}
          {currentStepId === 'hier_concept' && (
            <div className="relative flex gap-8 h-full">
              {/* Esq — dados + conceito */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                {/* Dados que o sistema utiliza */}
                <div>
                  <p className="text-[#28071C]/55 text-xs font-bold uppercase tracking-widest mb-2">
                    Dados que o sistema utiliza
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { e: '📦', t: 'Produtos & SKUs',      d: 'Base do sortimento — hierarquia, preço, custo e coleção.' },
                      { e: '📊', t: 'Histórico de Vendas',  d: 'Ativa sell-through, GMROI e análise por canal.'           },
                      { e: '🚚', t: 'Pedidos / Ordens',     d: 'Acompanhamento de entregas e lead times reais.'           },
                      { e: '📦', t: 'Posições de Estoque',  d: 'Calcula cobertura e giro com precisão.'                   },
                    ].map(item => (
                      <div key={item.t} className="bg-white border border-[#28071C]/8 rounded-xl px-3.5 py-3 flex items-start gap-2.5">
                        <span className="text-base flex-shrink-0">{item.e}</span>
                        <div>
                          <p className="text-[#28071C] text-xs font-bold">{item.t}</p>
                          <p className="text-[#28071C]/50 text-[11px] mt-0.5">{item.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conceito de hierarquia */}
                <div className="bg-white rounded-2xl border border-[#28071C]/8 px-5 py-4 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-[#28071C]" />
                    <p className="text-[#28071C] text-xs font-bold uppercase tracking-widest">
                      A Hierarquia de Produtos
                    </p>
                  </div>
                  <p className="text-[#28071C]/60 text-xs leading-relaxed mb-3">
                    A hierarquia é a arquitetura de dados que viabiliza a governança do seu estoque.
                    Ela organiza o sortimento do macro ao micro, permitindo distribuir orçamentos,
                    medir rentabilidade e — principalmente —{' '}
                    <strong className="text-[#28071C]">visualizar o produto apenas lendo o dado</strong>.
                    O sistema trabalha com{' '}
                    <strong className="text-[#28071C]">2 a 4 níveis</strong>; o que cada nível representa é uma decisão estratégica sua.
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {[
                      { label: 'Divisão',      bg: 'bg-[#28071C]'    },
                      { label: 'Categoria',    bg: 'bg-[#7598CF]'    },
                      { label: 'Subcategoria', bg: 'bg-[#9B8CD8]'    },
                      { label: 'Linha',        bg: 'bg-[#28071C]/40' },
                    ].map((lvl, i, arr) => (
                      <div key={lvl.label} className="flex items-center gap-1.5">
                        <div className={`px-2.5 py-1.5 ${lvl.bg} text-white rounded-lg text-xs font-bold`}>
                          {lvl.label}
                        </div>
                        {i < arr.length - 1 && <span className="text-[#28071C]/25 text-sm">→</span>}
                      </div>
                    ))}
                    <span className="text-[#28071C]/30 text-[10px] ml-1">opcional</span>
                  </div>

                  <div className="border-t border-[#28071C]/6 pt-3">
                    <p className="text-[10px] text-[#28071C]/40 font-bold uppercase tracking-widest mb-2">
                      Exemplo — leitura visual do produto
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap bg-[#F2F2F2] rounded-lg px-3 py-2 mb-1.5">
                      {['Feminino', 'Vestido', 'Midi', 'Justo'].map((v, i, arr) => (
                        <div key={v} className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${
                            i === 0 ? 'text-[#28071C]' :
                            i === 1 ? 'text-[#7598CF]' :
                            i === 2 ? 'text-[#9B8CD8]' :
                            'text-[#28071C]/50'
                          }`}>{v}</span>
                          {i < arr.length - 1 && <span className="text-[#28071C]/20 text-xs">→</span>}
                        </div>
                      ))}
                    </div>
                    <p className="text-[#28071C]/40 text-[11px] italic">
                      Ao bater o olho na trilha de dados, você já consegue visualizar perfeitamente o produto.
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-px bg-[#28071C]/8 self-stretch flex-shrink-0" />

              {/* Dir — por que é indispensável */}
              <div className="w-72 flex-shrink-0 flex flex-col gap-3">
                <p className="text-[#28071C]/55 text-xs font-bold uppercase tracking-widest mb-1">
                  Por que a hierarquia é indispensável
                </p>
                <div className="space-y-2">
                  {[
                    { icon: '👁️', mod: 'Leitura Visual',         uso: 'Gestor entende o que está vendendo só lendo o dado — sem precisar ver a foto da peça.'              },
                    { icon: '💰', mod: 'Orçamento (OTB)',         uso: 'Verba distribuída por agrupamentos lógicos (Divisão → Categoria), não por SKU isolado.'           },
                    { icon: '📊', mod: 'Rentabilidade',           uso: 'Giro e GMROI calculados por bloco — revela se uma categoria rentável mascara o prejuízo de outra.' },
                    { icon: '📦', mod: 'Abastecimento Adequado',  uso: 'O sistema projeta necessidade de estoque na hierarquia, direcionando o investimento de estoque onde gera retorno.' },
                  ].map(item => (
                    <div key={item.mod} className="flex items-start gap-2.5 bg-white border border-[#28071C]/8 rounded-lg px-3 py-2.5">
                      <span className="text-sm flex-shrink-0 mt-0.5">{item.icon}</span>
                      <div>
                        <p className="text-[#28071C] text-xs font-semibold">{item.mod}</p>
                        <p className="text-[#28071C]/50 text-[11px] mt-0.5 leading-relaxed">{item.uso}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balão flutuante — aparece 2s após entrar na tela */}
              {hierBalloonVisible && !hierBalloonClosed && (
                <div
                  className="absolute z-10 w-72 bg-[#FEF9C3] border border-amber-200 rounded-2xl px-4 py-3.5 shadow-lg"
                  style={{ animation: 'fadeSlideUp 0.4s ease', bottom: '0', left: '50%', transform: 'translateX(-50%)' }}
                >
                  <button
                    onClick={() => setHierBalloonClosed(true)}
                    className="absolute top-2.5 right-2.5 text-amber-400 hover:text-amber-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-amber-800 text-xs font-bold mb-1.5 pr-5 leading-snug">
                    Importe ou desenvolva sua Hierarquia com o Fashion Mind
                  </p>
                  <p className="text-amber-700 text-[11px] leading-relaxed">
                    Muitos ERPs não estruturam os produtos em hierarquia. Se for o seu caso, você pode criá-la dentro
                    do Fashion Mind para planos futuros. Se tiver sua hierarquia em planilha, importe-a separado que
                    o sistema irá cruzar as informações! A próxima tela mostra como configurar isso.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── TELA 12: Dados & Importação ───────────────────────────── */}
          {currentStepId === 'data' && (
            <div className="max-w-2xl">
              {activeWizardType && (
                <div>
                  <button onClick={() => setActiveWizardType(null)}
                    className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-5 transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" /> Voltar à lista
                  </button>
                  {!activeTenantId && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
                      Sessão não identificada. Volte ao início e faça login novamente.
                    </div>
                  )}
                  <ImportWizard
                    dataType={activeWizardType}
                    tenantId={activeTenantId}
                    onComplete={handleWizardComplete}
                    onCancel={() => setActiveWizardType(null)}
                  />
                </div>
              )}

              {!activeWizardType && (
                <>
                  {!dataChoice && (
                    <div className="space-y-3">
                      {[
                        {
                          key: 'erp_completo' as DataImportChoice,
                          icon: <Package className="w-5 h-5 text-emerald-600" />,
                          iconBg: 'bg-emerald-50',
                          badge: 'ERP Completo', badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                          title: 'Importar via ERP (com hierarquia)',
                          desc: 'Meu ERP já organiza os produtos por divisão, categoria e subcategoria. Vou exportar de lá.',
                        },
                        {
                          key: 'hierarquia' as DataImportChoice,
                          icon: <Package className="w-5 h-5 text-[#7598CF]" />,
                          iconBg: 'bg-[#7598CF]/10',
                          badge: 'ERP + Planilha', badgeColor: 'text-[#7598CF] bg-[#7598CF]/10 border-[#7598CF]/20',
                          title: 'ERP para dados + planilha para hierarquia',
                          desc: 'Meu ERP tem produtos e vendas, mas a estrutura hierárquica está em planilha separada.',
                        },
                        {
                          key: 'completa' as DataImportChoice,
                          icon: <Upload className="w-5 h-5 text-[#9B8CD8]" />,
                          iconBg: 'bg-[#9B8CD8]/10',
                          badge: 'Só Planilhas', badgeColor: 'text-[#9B8CD8] bg-[#9B8CD8]/10 border-[#9B8CD8]/20',
                          title: 'Importar tudo via planilhas',
                          desc: 'Não uso ERP ou prefiro importar produtos, vendas e estoque direto de arquivos CSV ou XLSX.',
                        },
                      ].map(opt => (
                        <button key={opt.key} onClick={() => setDataChoice(opt.key)}
                          className="w-full flex items-start gap-4 px-5 py-4 border-2 border-[#28071C]/10 rounded-2xl text-left hover:border-[#7598CF]/50 transition-all bg-white">
                          <div className={`w-10 h-10 ${opt.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            {opt.icon}
                          </div>
                          <div className="flex-1">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest mb-1 ${opt.badgeColor}`}>
                              {opt.badge}
                            </span>
                            <p className="text-[#28071C] font-semibold text-sm">{opt.title}</p>
                            <p className="text-[#28071C]/50 text-xs mt-0.5 leading-relaxed">{opt.desc}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#28071C]/25 mt-1 flex-shrink-0" />
                        </button>
                      ))}
                      <div className="text-center pt-1">
                        <button onClick={skipStep}
                          className="text-sm text-[#28071C]/40 hover:text-[#28071C]/70 underline transition-colors">
                          Importar depois — explorar o sistema agora
                        </button>
                      </div>
                    </div>
                  )}

                  {dataChoice === 'erp_completo' && (
                    <div>
                      <button onClick={() => setDataChoice(null)}
                        className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" /> Mudar opção
                      </button>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <p className="text-emerald-800 font-semibold text-sm">ERP com hierarquia completa</p>
                        </div>
                        <p className="text-emerald-700 text-xs leading-relaxed">
                          A configuração da integração ou importação via ERP é feita em{' '}
                          <strong>Configurações → Integrações</strong> após o onboarding.
                        </p>
                      </div>
                      <div className="bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 flex items-start gap-2">
                        <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                        <p className="text-[#28071C]/60 text-xs leading-relaxed">
                          Confirme para continuar. Você poderá importar os dados logo após concluir a configuração inicial.
                        </p>
                      </div>
                    </div>
                  )}

                  {dataChoice === 'hierarquia' && (
                    <div>
                      <button onClick={() => setDataChoice(null)}
                        className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" /> Mudar opção
                      </button>
                      <div className="bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 flex items-start gap-2 mb-4">
                        <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                        <p className="text-[#28071C]/60 text-xs leading-relaxed">
                          Importe a planilha com a hierarquia. O sistema cruzará os registros pelo{' '}
                          <strong className="text-[#28071C]">código do produto (SKU)</strong> com os dados do ERP.
                        </p>
                      </div>
                      <HierarchyFileRow
                        result={importResults['hierarchy' as ImportDataType]}
                        onImport={() => setActiveWizardType('hierarchy' as ImportDataType)}
                      />
                    </div>
                  )}

                  {dataChoice === 'completa' && (
                    <div>
                      <button onClick={() => setDataChoice(null)}
                        className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" /> Mudar opção
                      </button>
                      <div className="space-y-2.5">
                        {UPLOAD_FIELDS.map(field => {
                          const importType = FIELD_KEY_TO_IMPORT_TYPE[field.key] as ImportDataType
                          const result = importResults[importType]
                          const isImported = Boolean(result)
                          return (
                            <div key={field.key}
                              className={`rounded-xl border-2 px-4 py-3.5 transition-all ${
                                isImported ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[#28071C]/10'
                              }`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <p className="text-[#28071C] text-sm font-semibold">{field.label}</p>
                                    {field.required && (
                                      <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">
                                        Obrigatório
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[#28071C]/45 text-xs">{field.description}</p>
                                  {isImported && result && (
                                    <p className="text-emerald-600 text-xs mt-0.5">{result.importedRows} registros importados</p>
                                  )}
                                </div>
                                {isImported ? (
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <button onClick={() => setActiveWizardType(importType)}
                                      className="text-emerald-600 hover:text-emerald-800 text-xs underline">
                                      Reimportar
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => setActiveWizardType(importType)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#28071C] text-white text-xs font-semibold rounded-lg hover:bg-[#28071C]/90 transition-colors flex-shrink-0">
                                    <Upload className="w-3.5 h-3.5" /> Importar
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TELA 13: Convide sua Equipe ───────────────────────────── */}
          {currentStepId === 'team' && (
            <div className="space-y-4 max-w-2xl">
              <div className="space-y-3">
                {teamInvites.map((inv, i) => (
                  <div key={i} className="bg-white rounded-xl border border-[#28071C]/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <select value={inv.role} onChange={e => updateInvite(i, 'role', e.target.value)}
                        className="text-xs font-bold text-[#7598CF] bg-[#7598CF]/10 rounded-lg px-2 py-1 border-0 focus:outline-none cursor-pointer uppercase tracking-widest">
                        <option value="estrategico">Estratégico</option>
                        <option value="tatico">Tático</option>
                        <option value="operacional">Operacional</option>
                      </select>
                      {teamInvites.length > 1 && (
                        <button onClick={() => removeInvite(i)} className="text-[#28071C]/25 hover:text-red-500 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-1">Nome</label>
                        <input type="text" value={inv.name} onChange={e => updateInvite(i, 'name', e.target.value)}
                          placeholder="Nome completo"
                          className="w-full px-3 py-2 border border-[#28071C]/12 rounded-lg text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 bg-[#F2F2F2]" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-1">E-mail</label>
                        <input type="email" value={inv.email} onChange={e => updateInvite(i, 'email', e.target.value)}
                          placeholder="email@marca.com.br"
                          className="w-full px-3 py-2 border border-[#28071C]/12 rounded-lg text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 bg-[#F2F2F2]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addInvite}
                className="flex items-center gap-2 text-sm text-[#7598CF] hover:text-[#28071C] transition-colors">
                <Plus className="w-4 h-4" /> Adicionar outro membro
              </button>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-amber-700 text-xs leading-relaxed">
                  Os convidados receberão e-mail com link de acesso.
                  Gerencie a equipe depois em <strong>Configurações → Usuários</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ── TELA 14: Revisão & Confirmação ───────────────────────────── */}
          {currentStepId === 'complete' && (
            <div className="grid grid-cols-2 gap-5 h-full">

              {/* ── Coluna esquerda: o que você configurou ─────────────── */}
              <div className="flex flex-col gap-3 min-w-0">
                <p className="text-[#28071C]/45 text-[10px] font-bold uppercase tracking-widest">
                  O que você configurou
                </p>

                {/* Segmentos */}
                <ReviewBlock
                  icon="🏷️" title="Segmentos de produto"
                  status={segments.length > 0 ? 'ok' : 'warn'}
                  warnMsg="Nenhum segmento selecionado — volte à etapa 1">
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {segments.map(s => (
                      <span key={s} className="text-[10px] bg-[#28071C]/6 text-[#28071C] px-2 py-0.5 rounded-full">
                        {SEGMENT_LABELS[s]}
                      </span>
                    ))}
                  </div>
                </ReviewBlock>

                {/* Modelo de negócio */}
                <ReviewBlock
                  icon="🏭" title="Modelo de negócio"
                  status={origem ? 'ok' : 'warn'}
                  warnMsg="Modelo não definido">
                  <p className="text-[#28071C]/70 text-xs mt-0.5">{ORIGEM_LABELS[origem ?? 'propria']}</p>
                  {origem === 'hibrido' && hybridProcesses.length > 0 && (
                    <p className="text-[#28071C]/45 text-[11px] mt-0.5">
                      {hybridProcesses.map(p => `${ORIGEM_LABELS[p]} (${hybridParticipations[p] ?? 0}%)`).join(' + ')}
                    </p>
                  )}
                  {selectedMaterials.length > 0 && (
                    <p className="text-[#28071C]/40 text-[11px] mt-1">
                      {selectedMaterials.length} grupo{selectedMaterials.length > 1 ? 's' : ''} de insumos monitorados
                    </p>
                  )}
                  <div className="flex gap-2 mt-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasImport ? 'bg-[#7598CF]/10 text-[#7598CF]' : 'bg-[#28071C]/6 text-[#28071C]/40'}`}>
                      {hasImport ? 'Importa MP' : 'Sem importação de MP'}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasExport ? 'bg-[#7598CF]/10 text-[#7598CF]' : 'bg-[#28071C]/6 text-[#28071C]/40'}`}>
                      {hasExport ? 'Exporta produtos' : 'Sem exportação'}
                    </span>
                  </div>
                </ReviewBlock>

                {/* Canais */}
                <ReviewBlock
                  icon="🛍️" title="Canais de venda"
                  status={selectedChannels.length > 0 ? 'ok' : 'warn'}
                  warnMsg="Nenhum canal selecionado">
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedChannels.map(id => {
                      const ch = SALES_CHANNELS.find(c => c.id === id)
                      return (
                        <span key={id} className="text-[10px] bg-[#7598CF]/8 text-[#7598CF] px-2 py-0.5 rounded-full">
                          {ch?.label ?? id}
                        </span>
                      )
                    })}
                  </div>
                </ReviewBlock>

                {/* Temporadas */}
                <ReviewBlock icon="📅" title="Calendário de coleções" status="ok">
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div className="bg-[#F2F2F2] rounded-lg px-3 py-2">
                      <p className="text-[11px] font-bold text-[#28071C]">☀️ Verão</p>
                      <p className="text-[10px] text-[#28071C]/50 mt-0.5">{veraoInicio} → {veraoFim}</p>
                    </div>
                    <div className="bg-[#F2F2F2] rounded-lg px-3 py-2">
                      <p className="text-[11px] font-bold text-[#28071C]">❄️ Inverno</p>
                      <p className="text-[10px] text-[#28071C]/50 mt-0.5">{invernoInicio} → {invernoFim}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#28071C]/35 mt-1.5 italic">
                    Salvo em <code className="bg-[#28071C]/6 px-1 rounded">season_default_rules</code> — usado para gerar temporadas automaticamente ao criar um plano.
                  </p>
                </ReviewBlock>
              </div>

              {/* ── Coluna direita: o que acontece agora ──────────────── */}
              <div className="flex flex-col gap-3 min-w-0">
                <p className="text-[#28071C]/45 text-[10px] font-bold uppercase tracking-widest">
                  O que acontece agora
                </p>

                {/* Dados */}
                <ReviewBlock
                  icon="📂" title="Dados & Importação"
                  status={dataChoice && dataChoice !== 'deferred' ? 'ok' : 'info'}
                  infoMsg="Dados ainda não importados — recomendamos fazer antes de iniciar o planejamento">
                  <p className="text-[#28071C]/65 text-xs mt-0.5">
                    {dataChoice === 'erp_completo' ? 'Configure a integração ERP em Configurações → Integrações' :
                     dataChoice === 'hierarquia'   ? 'ERP para dados + planilha de hierarquia importada' :
                     dataChoice === 'completa'     ? `${Object.keys(importResults).length} arquivo(s) importado(s) via planilha` :
                     'Sem dados importados — acesse Configurações → Importação de Planilhas a qualquer momento'}
                  </p>
                  <p className="text-[10px] text-[#28071C]/35 mt-1.5 italic">
                    O histórico de vendas, estoque e hierarquia alimentam os KPIs do Dashboard e o baseline do Planejamento.
                  </p>
                </ReviewBlock>

                {/* Equipe */}
                {teamInvites.some(inv => inv.email.trim()) ? (
                  <ReviewBlock icon="👥" title="Equipe convidada" status="ok">
                    <div className="space-y-1 mt-1.5">
                      {teamInvites.filter(inv => inv.email.trim()).map((inv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] bg-[#9B8CD8]/10 text-[#9B8CD8] px-1.5 py-0.5 rounded-full font-medium capitalize">
                            {inv.role}
                          </span>
                          <span className="text-[11px] text-[#28071C]/65 truncate">{inv.name} — {inv.email}</span>
                        </div>
                      ))}
                    </div>
                  </ReviewBlock>
                ) : (
                  <ReviewBlock icon="👥" title="Equipe" status="info"
                    infoMsg="Sem convites — adicione colaboradores depois em Configurações → Usuários" />
                )}

                {/* O que cada módulo vai usar */}
                <div className="bg-[#28071C] rounded-2xl px-4 py-4 mt-auto">
                  <p className="text-[#F6F3AA] text-xs font-bold uppercase tracking-widest mb-3">
                    De onde cada módulo vai buscar dados
                  </p>
                  <div className="space-y-2">
                    {[
                      { mod: 'Módulo 1 — Planejamento Macro', fonte: 'Histórico de vendas + configuração de temporadas', table: 'sales_history, season_default_rules' },
                      { mod: 'Módulo 2 — Canal',              fonte: 'Canais configurados aqui + cenários salvos',        table: 'onboarding_profiles, channel_scenarios' },
                      { mod: 'Módulo 3 — Divisão',            fonte: 'Segmentos + hierarquia de produtos',                table: 'onboarding_profiles, hier_labels' },
                      { mod: 'Módulo 4 — Sazonalidade',       fonte: 'Temporadas e calendário configurados aqui',         table: 'seasons, season_default_rules' },
                      { mod: 'Módulo 5 — Sortimento',         fonte: 'Histórico de produtos + faixas de preço',           table: 'products, price_tiers' },
                    ].map(m => (
                      <div key={m.mod} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-[#7598CF] flex-shrink-0 mt-1.5" />
                        <div>
                          <p className="text-white text-[11px] font-semibold leading-snug">{m.mod}</p>
                          <p className="text-white/45 text-[10px]">{m.fonte}</p>
                          <p className="text-[#7598CF]/50 text-[9px] font-mono">{m.table}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="flex gap-3 mt-2">
                  <button onClick={complete}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#28071C] text-white rounded-xl font-semibold text-sm hover:bg-[#28071C]/90 transition-all shadow-sm">
                    Confirmar e Iniciar <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={goBack}
                    className="px-4 py-3 border-2 border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-[#28071C]/5 transition-all">
                    Revisar
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── NAV FOOTER ──────────────────────────────────────────────── */}
        {currentStepId !== 'complete' && (
          <div className="flex-shrink-0 px-12 py-4 border-t border-[#28071C]/8 bg-[#EBEBEB]/60 flex items-center justify-between">
            <button onClick={goBack}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-[#28071C]/50 hover:text-[#28071C] transition-colors text-sm disabled:opacity-25 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>

            <div className="flex items-center gap-4">
              {/* Skip para todas as etapas de config admin */}
              {!isConceptStep && (
                <button onClick={skipStep}
                  className="text-sm text-[#28071C]/40 hover:text-[#28071C]/70 transition-colors underline">
                  {currentStepId === 'data'   ? 'Importar depois'   :
                   currentStepId === 'team'   ? 'Convidar depois'   :
                   'Configurar depois'}
                </button>
              )}
              <button onClick={goNext}
                disabled={nextDisabled}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
                {nextLabel}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Micro-componentes ─────────────────────────────────────────────────────────

function SummaryRow({ icon, title, desc }: { icon: ReactNode; title: string; desc?: string }) {
  return (
    <div className="px-5 py-3.5 flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="text-[#28071C] text-sm font-semibold">{title}</p>
        {desc && <p className="text-[#28071C]/45 text-xs mt-0.5">{desc}</p>}
      </div>
    </div>
  )
}

type ReviewStatus = 'ok' | 'warn' | 'info'

function ReviewBlock({
  icon, title, status, warnMsg, infoMsg, children,
}: {
  icon:      string
  title:     string
  status:    ReviewStatus
  warnMsg?:  string
  infoMsg?:  string
  children?: ReactNode
}) {
  const borderColor =
    status === 'ok'   ? 'border-emerald-200 bg-emerald-50/50' :
    status === 'warn' ? 'border-amber-200 bg-amber-50/50'     :
    'border-[#7598CF]/20 bg-[#7598CF]/4'

  const dotColor =
    status === 'ok'   ? 'bg-emerald-500' :
    status === 'warn' ? 'bg-amber-500'   :
    'bg-[#7598CF]'

  const msgColor =
    status === 'warn' ? 'text-amber-700' : 'text-[#7598CF]'

  const StatusIcon =
    status === 'ok'   ? Check          :
    status === 'warn' ? AlertTriangle  :
    Info

  const iconColor =
    status === 'ok'   ? 'text-emerald-500' :
    status === 'warn' ? 'text-amber-500'   :
    'text-[#7598CF]'

  return (
    <div className={`rounded-xl border px-4 py-3 ${borderColor}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-base flex-shrink-0">{icon}</span>
        <p className="text-[#28071C] text-xs font-bold flex-1 leading-snug">{title}</p>
        <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      </div>
      {(warnMsg || infoMsg) && (
        <p className={`text-[11px] mt-0.5 leading-snug ${msgColor}`}>
          {warnMsg ?? infoMsg}
        </p>
      )}
      {children}
    </div>
  )
  // suppress unused var warning for dotColor
  void dotColor
}

function HierarchyFileRow({
  result, onImport,
}: { result: ImportResult | undefined; onImport: () => void }) {
  const isImported = Boolean(result)
  return (
    <div className={`rounded-xl border-2 px-4 py-4 transition-all ${
      isImported ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[#28071C]/10'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[#28071C] text-sm font-semibold">Planilha de Hierarquia</p>
            <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">
              Obrigatório
            </span>
          </div>
          <p className="text-[#28071C]/45 text-xs">
            SKU + Divisão + Categoria + Subcategoria (join pelo código do produto com os dados do ERP).
          </p>
          {isImported && result && (
            <p className="text-emerald-600 text-xs mt-0.5">{result.importedRows} registros importados</p>
          )}
        </div>
        {isImported ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <button onClick={onImport} className="text-emerald-600 hover:text-emerald-800 text-xs underline">
              Reimportar
            </button>
          </div>
        ) : (
          <button onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#28071C] text-white text-xs font-semibold rounded-lg hover:bg-[#28071C]/90 transition-colors flex-shrink-0">
            <Upload className="w-3.5 h-3.5" /> Importar
          </button>
        )}
      </div>
    </div>
  )
}
