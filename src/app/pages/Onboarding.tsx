// ─── Onboarding.tsx v4 ─────────────────────────────────────────────────────
// Mudanças:
//   • Canais ANTES de Temporadas (nova ordem)
//   • Temporadas com explicação enriquecida
//   • Dados dividido em 2 sub-slides:
//       slide 0 = contexto + hierarquia (informativo)
//       slide 1 = escolha do método (3 opções) + wizard
//   • Perguntas importação/exportação sempre visíveis (slide 2b de Negócio)
//   • Topbar h-[72px]
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronRight, ChevronLeft, Check, Plus,
  X, Upload, Info, CheckCircle2, Package,
} from 'lucide-react'
import ImportWizard from '../components/ImportWizard'
import type { ImportDataType, ImportResult } from '../../services/importService'
import { IMPORT_CONFIG } from '../../services/importService'
import {
  type SegmentId, type RawMaterialGroupId, type OrigemPecas, type SalesChannelId,
  type TeamInvite, type DataImportChoice,
  type OnboardingProfile,
  SEGMENT_LABELS, RAW_MATERIAL_GROUPS, ORIGEM_LABELS,
  SALES_CHANNELS,
  ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
} from '../types/onboarding'
import {
  MONTHS, DEFAULT_REGRA, computeMesFim,
} from '../../services/temporadaService'
import { saveRegraDefaultDb } from '../../services/supabase/seasonService'

// ── Constantes ────────────────────────────────────────────────────────────────
const ALL_SEGMENTS: SegmentId[] = [
  'vest_fem', 'vest_masc', 'vest_inf',
  'acc_fem', 'acc_masc', 'acc_inf',
  'calc_fem', 'calc_masc', 'calc_inf',
  'under_fem', 'under_masc', 'under_inf',
  'fitness_fem', 'fitness_masc', 'fitness_inf',
  'praia_fem', 'praia_masc', 'praia_inf',
]

const ORIGENS: OrigemPecas[] = [
  'propria', 'white_label', 'private_label', 'multimarca', 'hibrido',
]

const ORIGEM_DESCRIPTIONS: Record<OrigemPecas, string> = {
  propria:       'Sua equipe controla o processo produtivo do início ao fim.',
  white_label:   'Produtos fabricados por terceiros vendidos com sua marca.',
  private_label: 'Produtos desenvolvidos exclusivamente para sua marca por um fabricante.',
  multimarca:    'Você revende produtos de outras marcas no seu canal.',
  hibrido:       'Combinação de produção própria com compra de terceiros.',
}

const UPLOAD_FIELDS = [
  { key: 'catalog',   label: 'Cadastro de Produtos',       required: true,  description: 'SKU, nome, divisão, categoria, subcategoria, preço, custo, cor, coleção.' },
  { key: 'sales',     label: 'Histórico de Vendas',        required: true,  description: 'SKU, data, quantidade, receita bruta, canal, desconto.'                    },
  { key: 'orders',    label: 'Pedidos / Ordens de Compra', required: false, description: 'Número do pedido, SKU, data, quantidade, fornecedor, status.'               },
  { key: 'inventory', label: 'Estoque Histórico',          required: false, description: 'SKU, data da posição (1º ou último dia do mês), quantidade, valor.'        },
]

// ── Etapas — Canais ANTES de Temporadas ──────────────────────────────────────
type StepId = 'segments' | 'business' | 'channels' | 'seasons' | 'data' | 'team' | 'complete'

const STEP_META: { id: StepId; label: string; optional?: boolean }[] = [
  { id: 'segments', label: 'Segmentos' },
  { id: 'business', label: 'Negócio'   },
  { id: 'channels', label: 'Canais'    },   // ← antes de Temporadas
  { id: 'seasons',  label: 'Coleções'  },   // ← depois de Canais
  { id: 'data',     label: 'Dados',    optional: true },
  { id: 'team',     label: 'Equipe',   optional: true },
  { id: 'complete', label: 'Pronto!'   },
]

// ── Títulos/descrições por slide ──────────────────────────────────────────────
type SlideKey = StepId | 'business_b' | 'data_intro'

const SLIDE_INFO: Record<SlideKey, { title: string; desc: string }> = {
  segments: {
    title: 'Segmentos de Produto',
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
    title: 'Calendário de Temporadas',
    desc:  'A temporada é o ciclo completo de uma coleção — do lançamento à liquidação. Configure os meses de início e fim de cada uma.',
  },
  data_intro: {
    title: 'Dados & Hierarquia de Produtos',
    desc:  'A hierarquia é a arquitetura de dados que viabiliza a governança do seu estoque — distribui orçamentos, mede rentabilidade e dá legibilidade ao mix, do macro ao SKU.',
  },
  data: {
    title: 'Método de Importação',
    desc:  'Escolha como você vai trazer seus dados para o sistema.',
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

// ═══════════════════════════════════════════════════════════════════════════════
//  Componente
// ═══════════════════════════════════════════════════════════════════════════════
export default function Onboarding() {
  const navigate = useNavigate()

  useEffect(() => {
    if (import.meta.env.DEV) {
      localStorage.removeItem(ONBOARDING_DONE_KEY)
      localStorage.removeItem(ONBOARDING_PROFILE_KEY)
    }
  }, [])

  // ── Navegação principal ───────────────────────────────────────────────────────
  const [step, setStep] = useState(0)
  const [bizSlide, setBizSlide] = useState<0 | 1>(0)   // 0=origem, 1=insumos
  const [dataSlide, setDataSlide] = useState<0 | 1>(0)  // 0=contexto, 1=escolha
  const [showErpTip, setShowErpTip] = useState(false)

  const currentStepId = STEP_META[step].id

  // Balão ERP: aparece 2s após entrar no slide data_intro, fecha ao mudar de slide
  useEffect(() => {
    if (currentStepId === 'data' && dataSlide === 0) {
      const t = setTimeout(() => setShowErpTip(true), 2000)
      return () => clearTimeout(t)
    }
    setShowErpTip(false)
  }, [currentStepId, dataSlide])

  const slideKey: SlideKey =
    currentStepId === 'business' && bizSlide === 1  ? 'business_b'  :
    currentStepId === 'data'     && dataSlide === 0 ? 'data_intro'  :
    currentStepId

  const info = SLIDE_INFO[slideKey]

  // ── Etapa 1: Segmentos ───────────────────────────────────────────────────────
  const [segments, setSegments] = useState<SegmentId[]>([])
  function toggleSegment(id: SegmentId) {
    setSegments(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  // ── Etapa 2: Negócio ─────────────────────────────────────────────────────────
  const [origem,            setOrigem]            = useState<OrigemPecas | null>(null)
  const [selectedMaterials, setSelectedMaterials] = useState<RawMaterialGroupId[]>([])
  const [hasImport,         setHasImport]         = useState<boolean | null>(null)
  const [hasExport,         setHasExport]         = useState<boolean | null>(null)

  const showMaterials     = origem !== null && origem !== 'multimarca'
  const materialsRequired = origem === 'propria' || origem === 'hibrido'

  // Grupos de matérias-primas disponíveis conforme segmentos selecionados (col A → col B)
  const availableMaterialGroups = RAW_MATERIAL_GROUPS.filter(g =>
    g.segments.some(s => segments.includes(s))
  )

  function toggleMaterial(id: RawMaterialGroupId) {
    setSelectedMaterials(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  const bizSlide0Valid = origem !== null
  const bizSlide1Valid =
    (!materialsRequired || selectedMaterials.length > 0) &&
    hasImport !== null &&
    hasExport !== null

  // ── Etapa 3: Canais ──────────────────────────────────────────────────────────
  const [selectedChannels, setSelectedChannels] = useState<SalesChannelId[]>(
    SALES_CHANNELS.filter(c => c.erpFound).map(c => c.id)
  )
  function toggleChannel(id: SalesChannelId) {
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  // ── Etapa 4: Temporadas ──────────────────────────────────────────────────────
  const [veraoInicio,   setVeraoInicio]   = useState(DEFAULT_REGRA.verao.mesInicio)
  const [veraoFim,      setVeraoFim]      = useState(DEFAULT_REGRA.verao.mesFim)
  const [invernoInicio, setInvernoInicio] = useState(DEFAULT_REGRA.inverno.mesInicio)
  const [invernoFim,    setInvernoFim]    = useState(DEFAULT_REGRA.inverno.mesFim)
  useEffect(() => { setInvernoFim(computeMesFim(veraoInicio))   }, [veraoInicio])
  useEffect(() => { setVeraoFim(computeMesFim(invernoInicio))   }, [invernoInicio])

  // ── Etapa 5: Dados ───────────────────────────────────────────────────────────
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

  // ── Etapa 6: Equipe ──────────────────────────────────────────────────────────
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

  // ── Navegação ─────────────────────────────────────────────────────────────────
  function goNext() {
    if (currentStepId === 'business' && bizSlide === 0) { setBizSlide(1); return }
    if (currentStepId === 'business') setBizSlide(0)
    if (currentStepId === 'data' && dataSlide === 0)    { setDataSlide(1); return }
    if (currentStepId === 'data') setDataSlide(0)
    setStep(s => Math.min(s + 1, STEP_META.length - 1))
  }
  function goBack() {
    if (currentStepId === 'business' && bizSlide === 1)  { setBizSlide(0); return }
    if (currentStepId === 'data'     && dataSlide === 1) { setDataSlide(0); return }
    setStep(s => Math.max(s - 1, 0))
  }
  function skipData() {
    setDataChoice('deferred')
    setDataSlide(0)
    setStep(s => Math.min(s + 1, STEP_META.length - 1))
  }

  // ── Conclusão ─────────────────────────────────────────────────────────────────
  function complete() {
    const validInvites = teamInvites.filter(inv => inv.email.trim() && inv.name.trim())
    const profile: OnboardingProfile = {
      segments,
      rawMaterials: selectedMaterials,
      origem: origem!,
      hasImportedMaterial: hasImport ?? false,
      exports:             hasExport ?? false,
      productHierarchy:    [],
      salesChannels:       selectedChannels,
      teamInvites:         validInvites.length > 0 ? validInvites : undefined,
      dataImportChoice:    dataChoice ?? 'deferred',
      importedFileNames:   Object.values(uploadedFiles).length > 0 ? Object.values(uploadedFiles) : undefined,
      completedAt:         new Date().toISOString(),
    }
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))
    const tenantId = sessionStorage.getItem('activeTenantId') ?? ''
    if (tenantId) {
      saveRegraDefaultDb(tenantId, {
        verao:   { mesInicio: veraoInicio,   mesFim: veraoFim   },
        inverno: { mesInicio: invernoInicio, mesFim: invernoFim },
      }).catch(err => console.warn('Erro ao salvar regra padrão:', err))
    }
    navigate('/dashboard')
  }

  // ── Disabled / skip logic ─────────────────────────────────────────────────────
  const nextDisabled =
    (currentStepId === 'segments' && segments.length === 0) ||
    (currentStepId === 'business' && bizSlide === 0 && !bizSlide0Valid) ||
    (currentStepId === 'business' && bizSlide === 1 && !bizSlide1Valid) ||
    (currentStepId === 'channels' && selectedChannels.length === 0) ||
    (currentStepId === 'seasons'  && veraoInicio === invernoInicio) ||
    (currentStepId === 'data'     && dataSlide === 0 && !showErpTip) ||
    (currentStepId === 'data'     && dataSlide === 1 && !!activeWizardType)

  // sub-passo no topbar (Negócio ou Dados têm sub-slides)
  const subLabel =
    currentStepId === 'business' ? `${bizSlide + 1}/2` :
    currentStepId === 'data'     ? `${dataSlide + 1}/2` :
    null

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#28071C] relative">

      {/* ── Balão ERP tip — aparece 2s após entrar no data_intro ───────────── */}
      {showErpTip && (
        <div
          className="fixed z-50 max-w-xs
            bg-amber-50 border border-amber-200 rounded-2xl shadow-xl
            px-4 py-3.5"
          style={{
            animation: 'fadeSlideUp 0.35s ease-out forwards',
            bottom: '76px',
            left: '42%',
          }}
        >
          {/* Pontinha no topo-esquerdo */}
          <div className="absolute -top-2 left-5 w-4 h-4 bg-amber-50 border-l border-t border-amber-200 rotate-45 rounded-sm" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-amber-800 text-xs font-bold mb-1">E se meu ERP não tem hierarquia?</p>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                Muitos ERPs de moda não estruturam os produtos com hierarquia. Se for o seu caso
                e você tiver a hierarquia em planilha, importe os dados via ERP e depois a hierarquia
                separada. A próxima tela mostra como configurar isso.
              </p>
            </div>
            <button onClick={() => setShowErpTip(false)}
              className="text-amber-400 hover:text-amber-700 transition-colors flex-shrink-0 mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════════════
          TOPBAR
      ════════════════════════════════════════════════════════════════════ */}
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
                <span key={s.id}
                  className="bg-[#7598CF]/25 text-white text-xs font-semibold px-3.5 py-1 rounded-full border border-[#7598CF]/45 select-none whitespace-nowrap">
                  {s.label}
                  {subLabel && <span className="ml-1.5 text-[#7598CF] font-normal">{subLabel}</span>}
                </span>
              )
            }
            return (
              <div key={s.id}
                className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                  isCompleted ? 'bg-[#F6F3AA]/75' : 'bg-white/18'
                }`} />
            )
          })}
        </div>

        <div className="w-44 flex-shrink-0" />
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          ÁREA PRINCIPAL
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-[#F2F2F2] rounded-t-2xl overflow-hidden">

        {/* Cabeçalho da etapa */}
        <div className="flex-shrink-0 px-12 pt-7 pb-4">
          <p className="text-[#28071C]/35 text-[11px] font-bold uppercase tracking-widest mb-1.5">
            Etapa {step + 1} de {STEP_META.length}
            {subLabel && <span className="ml-1 text-[#7598CF]/60">· {subLabel}</span>}
          </p>
          <h2 className="text-[#28071C] text-2xl font-bold tracking-tight leading-snug">{info.title}</h2>
          <p className="text-[#28071C]/55 text-sm mt-1.5 leading-relaxed max-w-3xl">{info.desc}</p>
        </div>
        <div className="flex-shrink-0 h-px bg-[#28071C]/8 mx-12" />

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-12 py-7">

          {/* ── SEGMENTOS ──────────────────────────────────────────────────── */}
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

          {/* ── NEGÓCIO 2A: Origem ─────────────────────────────────────────── */}
          {currentStepId === 'business' && bizSlide === 0 && (
            <div className="max-w-lg space-y-2">
              {ORIGENS.map(o => (
                <button key={o} onClick={() => { setOrigem(o); setHasImport(null) }}
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
                  <div>
                    <p className="text-[#28071C] text-sm font-semibold">{ORIGEM_LABELS[o]}</p>
                    {origem === o && (
                      <p className="text-[#28071C]/50 text-xs mt-0.5">{ORIGEM_DESCRIPTIONS[o]}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── NEGÓCIO 2B: Insumos (esq) + Comércio Exterior (dir) ─────── */}
          {currentStepId === 'business' && bizSlide === 1 && (
            <div className="flex gap-8 h-full">
              {/* Coluna esquerda — Matérias-primas (checklist filtrada por segmento) */}
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
                    Selecione os insumos que sua marca utiliza. Os indicadores macroeconômicos relevantes serão ativados automaticamente.
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
                        const INDICATOR_BADGE: Record<string, string> = {
                          algodao:       'CEPEA Algodão',
                          petroleo:      'Petróleo Brent',
                          couro:         'CEPEA Couro',
                          metais:        'LME Metais',
                          metais_nobres: 'Metais Nobres',
                        }
                        return (
                          <button key={group.id} onClick={() => toggleMaterial(group.id)}
                            className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                              selected ? 'bg-[#7598CF]/6' : 'hover:bg-[#28071C]/3'
                            }`}>
                            <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                              selected ? 'border-[#7598CF] bg-[#7598CF]' : 'border-[#28071C]/20'
                            }`}>
                              {selected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm font-semibold ${selected ? 'text-[#28071C]' : 'text-[#28071C]/75'}`}>
                                  {group.label}
                                </span>
                                <span className="text-[10px] bg-[#28071C]/8 text-[#28071C]/50 rounded-full px-1.5 py-0.5 font-semibold whitespace-nowrap">
                                  {INDICATOR_BADGE[group.indicator] ?? group.indicator}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#28071C]/40 mt-0.5 leading-snug">{group.detail}</p>
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

              {/* Coluna direita — Comércio Exterior */}
              <div className={`flex flex-col gap-6 ${showMaterials ? 'w-72 flex-shrink-0' : 'max-w-md w-full'}`}>
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

          {/* ── CANAIS ─────────────────────────────────────────────────────── */}
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

          {/* ── TEMPORADAS ─────────────────────────────────────────────────── */}
          {currentStepId === 'seasons' && (
            <div className="flex gap-8 h-full">

              {/* COLUNA ESQUERDA — explicação */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">

                {/* O que é uma temporada */}
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
                    <strong className="text-[#28071C]">Atenção:</strong> o mês de fim que você cadastra deve incluir a liquidação, não apenas o período de preço cheio.
                    Excluir o markdown deixa as vendas desse período sem coleção, distorcendo faturamento e sell-through.
                    Após o mês de fim, o sistema ainda tolera até 60 dias para resíduos de estoque de perfil específico.
                  </p>
                </div>

                {/* Três frentes de uso */}
                <div>
                  <p className="text-[#28071C]/55 text-xs font-bold uppercase tracking-widest mb-2">
                    Como o sistema usa a temporada
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { e: '🎨', t: 'Criativo',   d: 'Vincula cada produto (Preview, principal ou drop) à coleção — cartela de cores, silhuetas, coesão visual.' },
                      { e: '⚙️', t: 'Industrial', d: 'Calcula lead time reverso: a data em que o produto precisa estar na vitrine determina quando comprar MP e programar produção.' },
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

                {/* Contexto Brasil */}
                <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
                  <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                  <p className="text-[#28071C]/65 text-xs leading-relaxed">
                    <strong className="text-[#28071C]">Contexto Brasil:</strong> Verão costuma ir de <strong>agosto a fevereiro</strong> (incluindo liquidação de jan-fev);
                    Inverno de <strong>março a julho</strong>. O Preview de Verão pode chegar em julho, mas ainda pertence à temporada Verão —
                    o mês de início é quando a comunicação e a vitrine mudam de fato.
                  </p>
                </div>
              </div>

              {/* Divisor */}
              <div className="w-px bg-[#28071C]/8 self-stretch flex-shrink-0" />

              {/* COLUNA DIREITA — seletores */}
              <div className="w-72 flex-shrink-0 flex flex-col gap-4">
                {/* Verão */}
                <div className="bg-white rounded-2xl border-2 border-[#7598CF]/25 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">☀️</span>
                    <span className="text-[#28071C] font-bold">Verão</span>
                  </div>
                  <div className="space-y-3">
                    {[{ l: 'Início', v: veraoInicio, fn: setVeraoInicio }, { l: 'Fim', v: veraoFim, fn: setVeraoFim }].map(s => (
                      <div key={s.l}>
                        <label className="block text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-1">{s.l}</label>
                        <select value={s.v} onChange={e => s.fn(e.target.value)}
                          className="w-full px-3 py-2.5 border-2 border-[#7598CF]/20 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white">
                          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Inverno */}
                <div className="bg-white rounded-2xl border-2 border-[#9B8CD8]/25 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">❄️</span>
                    <span className="text-[#28071C] font-bold">Inverno</span>
                  </div>
                  <div className="space-y-3">
                    {[{ l: 'Início', v: invernoInicio, fn: setInvernoInicio }, { l: 'Fim', v: invernoFim, fn: setInvernoFim }].map(s => (
                      <div key={s.l}>
                        <label className="block text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-1">{s.l}</label>
                        <select value={s.v} onChange={e => s.fn(e.target.value)}
                          className="w-full px-3 py-2.5 border-2 border-[#9B8CD8]/20 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#9B8CD8] bg-white">
                          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {veraoInicio === invernoInicio && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <p className="text-amber-800 text-xs">Início do Verão e do Inverno não podem ser o mesmo mês.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── DADOS slide 0: Contexto + Hierarquia ───────────────────────── */}
          {currentStepId === 'data' && dataSlide === 0 && (
            <div className="flex gap-8 h-full">

              {/* COLUNA ESQUERDA — dados importados + hierarquia */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">

                {/* O que vamos importar */}
                <div>
                  <p className="text-[#28071C]/55 text-xs font-bold uppercase tracking-widest mb-2">
                    Dados que o sistema utiliza
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: '📦', t: 'Produtos & SKUs',         d: 'Base do sortimento — hierarquia, preço, custo e coleção.' },
                      { icon: '📈', t: 'Histórico de Vendas',     d: 'Ativa sell-through, GMROI e análise por canal.' },
                      { icon: '🚚', t: 'Pedidos / Ordens',        d: 'Acompanhamento de entregas e lead times reais.' },
                      { icon: '🏪', t: 'Posições de Estoque',     d: 'Calcula cobertura e giro com precisão.' },
                    ].map(item => (
                      <div key={item.t} className="bg-white border border-[#28071C]/8 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                        <span className="text-base flex-shrink-0">{item.icon}</span>
                        <div>
                          <p className="text-[#28071C] text-xs font-semibold">{item.t}</p>
                          <p className="text-[#28071C]/50 text-[11px] mt-0.5 leading-relaxed">{item.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* A hierarquia */}
                <div className="bg-white border border-[#28071C]/8 rounded-2xl px-5 py-4 flex-1">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#7598CF]" />
                    <p className="text-[#28071C] text-xs font-bold uppercase tracking-widest">
                      A hierarquia de produtos
                    </p>
                  </div>
                  <p className="text-[#28071C]/60 text-xs leading-relaxed mb-3">
                    A hierarquia é a arquitetura de dados que viabiliza a governança do seu estoque.
                    Ela organiza o sortimento do macro ao micro, permitindo distribuir orçamentos,
                    medir rentabilidade (Giro e GMROI) e — principalmente — <strong className="text-[#28071C]">visualizar o produto apenas lendo o dado</strong>.
                    O sistema trabalha com <strong className="text-[#28071C]">2 a 4 níveis</strong>; o que cada nível representa é uma decisão estratégica sua.
                  </p>

                  {/* Estrutura visual — 4 níveis */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {[
                      { label: 'Divisão',      bg: 'bg-[#28071C]',   ring: '' },
                      { label: 'Categoria',    bg: 'bg-[#7598CF]',   ring: '' },
                      { label: 'Subcategoria', bg: 'bg-[#9B8CD8]',   ring: '' },
                      { label: 'Linha',        bg: 'bg-[#28071C]/40',ring: '' },
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

                  {/* Exemplo de leitura visual */}
                  <div className="border-t border-[#28071C]/6 pt-3">
                    <p className="text-[10px] text-[#28071C]/40 font-bold uppercase tracking-widest mb-2">
                      Exemplo — leitura visual do produto
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap bg-[#F2F2F2] rounded-lg px-3 py-2 mb-1.5">
                      {['Feminino', 'Vestido', 'Midi', 'Justo'].map((v, i, arr) => (
                        <div key={v} className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${
                            i === 0 ? 'text-[#28071C]'   :
                            i === 1 ? 'text-[#7598CF]'   :
                            i === 2 ? 'text-[#9B8CD8]'   :
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

              {/* Divisor */}
              <div className="w-px bg-[#28071C]/8 self-stretch flex-shrink-0" />

              {/* COLUNA DIREITA — 4 pilares de uso + alerta ERP */}
              <div className="w-80 flex-shrink-0 flex flex-col gap-3">

                <div>
                  <p className="text-[#28071C]/55 text-xs font-bold uppercase tracking-widest mb-2">
                    Por que a hierarquia é indispensável
                  </p>
                  <div className="space-y-2">
                    {[
                      {
                        icon: '👁️',
                        mod: 'Leitura Visual',
                        uso: 'Gestor entende o que está vendendo só lendo o dado — sem precisar ver a foto da peça.',
                      },
                      {
                        icon: '💰',
                        mod: 'Orçamento (OTB)',
                        uso: 'Verba distribuída por agrupamentos lógicos (Divisão → Categoria), não por SKU isolado.',
                      },
                      {
                        icon: '📊',
                        mod: 'Rentabilidade',
                        uso: 'Giro e GMROI calculados por bloco — revela se uma categoria rentável mascara o prejuízo de outra.',
                      },
                      {
                        icon: '🗂️',
                        mod: 'Sortimento & Preços',
                        uso: 'Balanceia a vitrine garantindo entrada, preço médio e premium na proporção certa por grupo.',
                      },
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

              </div>
            </div>
          )}

          {/* ── DADOS slide 1: Método de importação ───────────────────────── */}
          {currentStepId === 'data' && dataSlide === 1 && (
            <div className="max-w-2xl">
              {/* Wizard aberto inline */}
              {activeWizardType && (
                <div>
                  <button onClick={() => setActiveWizardType(null)}
                    className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-5 transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" /> Voltar à lista
                  </button>
                  {!activeTenantId && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
                      ⚠️ Sessão não identificada. Volte ao início e faça login novamente.
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
                  {/* Seleção do método — 3 opções */}
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
                          desc: 'Meu ERP tem produtos e vendas, mas a estrutura hierárquica (divisão/categoria/subcategoria) está em planilha separada.',
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
                        <button onClick={skipData}
                          className="text-sm text-[#28071C]/40 hover:text-[#28071C]/70 underline transition-colors">
                          Importar depois — explorar o sistema agora
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ERP Completo — sem arquivo para fazer upload, configura depois */}
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
                          A configuração da integração ou importação via ERP é feita em <strong>Configurações → Integrações</strong> após o onboarding,
                          quando você terá acesso ao mapeamento de campos e ao template de exportação.
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

                  {/* ERP + Hierarquia em planilha */}
                  {dataChoice === 'hierarquia' && (
                    <div>
                      <button onClick={() => setDataChoice(null)}
                        className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" /> Mudar opção
                      </button>
                      <div className="bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 flex items-start gap-2 mb-4">
                        <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                        <p className="text-[#28071C]/60 text-xs leading-relaxed">
                          Importe aqui a planilha com a hierarquia. O sistema cruzará os registros pelo <strong className="text-[#28071C]">código do produto (SKU)</strong> com os dados do ERP.
                        </p>
                      </div>
                      <HierarchyFileRow
                        result={importResults['hierarchy' as ImportDataType]}
                        onImport={() => setActiveWizardType('hierarchy' as ImportDataType)}
                      />
                    </div>
                  )}

                  {/* Só planilhas */}
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
                                isImported
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : 'bg-white border-[#28071C]/10'
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

          {/* ── EQUIPE ─────────────────────────────────────────────────────── */}
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

          {/* ── PRONTO ─────────────────────────────────────────────────────── */}
          {currentStepId === 'complete' && (
            <div className="max-w-2xl">
              <div className="w-12 h-12 bg-emerald-100 border-2 border-emerald-200 rounded-full flex items-center justify-center mb-5">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="bg-white rounded-2xl border border-[#28071C]/8 divide-y divide-[#28071C]/6 mb-7">
                <SummaryRow icon={<Check className="w-4 h-4 text-emerald-500" />}
                  title={`${segments.length} segmento${segments.length > 1 ? 's' : ''} configurado${segments.length > 1 ? 's' : ''}`}
                  desc={`${segments.slice(0, 3).map(s => SEGMENT_LABELS[s]).join(', ')}${segments.length > 3 ? ` e mais ${segments.length - 3}` : ''}`} />
                <SummaryRow icon={<Check className="w-4 h-4 text-emerald-500" />}
                  title={`Modelo: ${ORIGEM_LABELS[origem!]}`}
                  desc={selectedMaterials.length > 0 ? `${selectedMaterials.length} grupo${selectedMaterials.length > 1 ? 's' : ''} de insumos selecionado${selectedMaterials.length > 1 ? 's' : ''}` : undefined} />
                <SummaryRow icon={<Check className="w-4 h-4 text-emerald-500" />}
                  title={`${selectedChannels.length} canal${selectedChannels.length > 1 ? 'is' : ''} de venda`}
                  desc={selectedChannels.slice(0, 3).map(id => SALES_CHANNELS.find(c => c.id === id)?.label ?? id).join(', ')} />
                {teamInvites.some(inv => inv.email.trim()) && (
                  <SummaryRow icon={<Check className="w-4 h-4 text-emerald-500" />}
                    title={`${teamInvites.filter(inv => inv.email.trim()).length} convite${teamInvites.filter(inv => inv.email.trim()).length > 1 ? 's' : ''} enviados`}
                    desc="Os convidados receberão e-mail com link de acesso" />
                )}
                <SummaryRow
                  icon={dataChoice && dataChoice !== 'deferred' ? <Check className="w-4 h-4 text-emerald-500" /> : <Info className="w-4 h-4 text-amber-400" />}
                  title={
                    dataChoice === 'erp_completo' ? 'Integração via ERP configurada'  :
                    dataChoice === 'hierarquia'   ? 'ERP + hierarquia em planilha'     :
                    dataChoice === 'completa'     ? 'Importação completa via planilhas':
                    'Dados para importar depois'
                  }
                  desc={dataChoice === 'deferred' ? 'Disponível em Configurações → Importação de Planilhas' : undefined} />
              </div>
              <div className="flex gap-3">
                <button onClick={complete}
                  className="flex items-center gap-2 px-7 py-3.5 bg-[#28071C] text-white rounded-xl font-semibold text-sm hover:bg-[#28071C]/90 transition-all shadow-sm">
                  Iniciar Planejamento <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={complete}
                  className="px-7 py-3.5 border-2 border-[#28071C]/15 text-[#28071C]/70 rounded-xl font-semibold text-sm hover:bg-[#28071C]/5 transition-all">
                  Explorar o Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── NAV BUTTONS ───────────────────────────────────────────────────── */}
        {currentStepId !== 'complete' && (
          <div className="flex-shrink-0 px-12 py-4 border-t border-[#28071C]/8 bg-[#EBEBEB]/60 flex items-center justify-between">
            <button onClick={goBack}
              disabled={step === 0 && bizSlide === 0}
              className="flex items-center gap-1.5 text-[#28071C]/50 hover:text-[#28071C] disabled:opacity-0 disabled:pointer-events-none transition-colors text-sm">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>

            <div className="flex items-center gap-4">
              {/* Skip para etapas opcionais */}
              {STEP_META[step].optional && (
                <button onClick={skipData}
                  className="text-sm text-[#28071C]/40 hover:text-[#28071C]/70 transition-colors underline">
                  {currentStepId === 'data' ? 'Importar depois' : 'Convidar depois'}
                </button>
              )}
              {/* Continuar */}
              <button onClick={goNext} disabled={nextDisabled}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
                {currentStepId === 'data' && dataSlide === 0 ? 'Entendido, avançar' : 'Continuar'}
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

function SummaryRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
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
