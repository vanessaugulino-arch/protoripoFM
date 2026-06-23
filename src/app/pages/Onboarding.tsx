import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronRight, ChevronLeft, Check, ArrowUp, ArrowDown,
  Plus, X, Upload, Users, Package, Info,
} from 'lucide-react'
import {
  type SegmentId, type RawMaterialId, type OrigemPecas, type SalesChannelId,
  type TeamInvite, type DataImportChoice,
  type OnboardingProfile,
  SEGMENT_LABELS, RAW_MATERIAL_LABELS, ALL_RAW_MATERIALS, ORIGEM_LABELS,
  SALES_CHANNELS,
  ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
} from '../types/onboarding'
import {
  MONTHS, DEFAULT_REGRA,
} from '../../services/temporadaService'
import { saveRegraDefaultDb } from '../../services/supabase/seasonService'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALL_SEGMENTS: SegmentId[] = [
  'vest_fem', 'vest_masc', 'vest_inf',
  'acc_bolsas_fem', 'acc_bolsas_masc', 'acc_bolsas_inf',
  'calc_fem', 'calc_masc', 'calc_inf',
  'under_fem', 'under_masc', 'under_inf',
  'fitness_fem', 'fitness_masc', 'fitness_inf',
  'praia_fem', 'praia_masc', 'praia_inf',
  'bijuteria',
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
  {
    key: 'catalog',
    label: 'Cadastro de Produtos',
    required: true,
    description: 'SKU, nome, categoria, preço de venda, custo, cor, coleção.',
    hint: 'Obrigatório — base de tudo.',
  },
  {
    key: 'sales',
    label: 'Histórico de Vendas',
    required: true,
    description: 'SKU, data, quantidade, receita bruta, canal, desconto.',
    hint: 'Obrigatório — habilita indicadores históricos.',
  },
  {
    key: 'orders',
    label: 'Pedidos / Ordens de Compra',
    required: false,
    description: 'Número do pedido, SKU, data, quantidade, fornecedor, status.',
    hint: 'Recomendado — habilita acompanhamento de entregas.',
  },
  {
    key: 'inventory',
    label: 'Estoque Histórico',
    required: false,
    description: 'SKU, data da posição (1º ou último dia do mês), quantidade, valor.',
    hint: 'Recomendado — habilita GMROI e Cobertura precisos.',
  },
]

// ─── Etapas ───────────────────────────────────────────────────────────────────

type StepId = 'segments' | 'business' | 'seasons' | 'channels' | 'team' | 'data' | 'complete'

const STEP_META: { id: StepId; label: string; optional?: boolean }[] = [
  { id: 'segments', label: 'Segmentos' },
  { id: 'business', label: 'Negócio' },
  { id: 'seasons',  label: 'Coleções' },
  { id: 'channels', label: 'Canais' },
  { id: 'team',     label: 'Equipe',   optional: true },
  { id: 'data',     label: 'Dados',    optional: true },
  { id: 'complete', label: 'Pronto!' },
]

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function StepDots({
  steps, current,
}: { steps: typeof STEP_META; current: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
            i < current
              ? 'bg-[#28071C]'
              : i === current
                ? 'bg-[#7598CF] scale-125'
                : 'bg-[#28071C]/20'
          }`} />
          {i < steps.length - 1 && (
            <div className={`w-6 h-px transition-all duration-300 ${i < current ? 'bg-[#28071C]/40' : 'bg-[#28071C]/10'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-[#28071C] font-bold text-sm uppercase tracking-widest">{children}</span>
      {optional && (
        <span className="text-[10px] text-[#28071C]/40 bg-[#28071C]/8 rounded-full px-2 py-0.5 font-medium">
          opcional
        </span>
      )}
    </div>
  )
}

function NavButtons({
  onBack, onNext, nextLabel = 'Continuar', nextDisabled = false, onSkip, skipLabel,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  onSkip?: () => void
  skipLabel?: string
}) {
  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-[#28071C]/10">
      <button
        onClick={onBack}
        disabled={!onBack}
        className="flex items-center gap-1.5 text-[#28071C]/50 hover:text-[#28071C] disabled:opacity-0 disabled:pointer-events-none transition-colors text-sm"
      >
        <ChevronLeft className="w-4 h-4" />
        Voltar
      </button>
      <div className="flex items-center gap-3">
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-sm text-[#28071C]/40 hover:text-[#28071C]/70 transition-colors underline"
          >
            {skipLabel ?? 'Pular por agora'}
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {nextLabel}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()

  // Em DEV, reseta o onboarding para sempre poder ver o fluxo
  useEffect(() => {
    if (import.meta.env.DEV) {
      localStorage.removeItem(ONBOARDING_DONE_KEY)
      localStorage.removeItem(ONBOARDING_PROFILE_KEY)
    }
  }, [])

  const [step, setStep] = useState(0)
  const currentStepId = STEP_META[step].id

  // ── Etapa 1: Segmentos ──────────────────────────────────────────────────────
  const [segments, setSegments] = useState<SegmentId[]>([])

  function toggleSegment(id: SegmentId) {
    setSegments(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  // ── Etapa 2: Negócio ────────────────────────────────────────────────────────
  const [origem, setOrigem]       = useState<OrigemPecas | null>(null)
  const [rankedMaterials, setRankedMaterials] = useState<RawMaterialId[]>([])
  const [hasImport, setHasImport] = useState<boolean | null>(null)
  const [hasExport, setHasExport] = useState<boolean | null>(null)

  const showImportQuestion = origem === 'propria' || origem === 'hibrido'
  const showMaterials      = origem !== null && origem !== 'multimarca'
  // Materiais são obrigatórios apenas para produção própria ou híbrido
  // (quem controla o processo produtivo e precisa monitorar custos de insumo)
  const materialsRequired  = origem === 'propria' || origem === 'hibrido'

  function addMaterial(id: RawMaterialId) {
    if (!rankedMaterials.includes(id)) setRankedMaterials(prev => [...prev, id])
  }
  function removeMaterial(id: RawMaterialId) {
    setRankedMaterials(prev => prev.filter(m => m !== id))
  }
  function moveMaterial(i: number, dir: -1 | 1) {
    setRankedMaterials(prev => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const businessValid =
    origem !== null &&
    (!materialsRequired || rankedMaterials.length > 0) &&
    (!showImportQuestion || hasImport !== null) &&
    hasExport !== null

  // ── Etapa 3: Calendário de Coleções ────────────────────────────────────────
  const [veraoInicio,   setVeraoInicio]   = useState(DEFAULT_REGRA.verao.mesInicio)
  const [veraoFim,      setVeraoFim]      = useState(DEFAULT_REGRA.verao.mesFim)
  const [invernoInicio, setInvernoInicio] = useState(DEFAULT_REGRA.inverno.mesInicio)
  const [invernoFim,    setInvernoFim]    = useState(DEFAULT_REGRA.inverno.mesFim)

  // ── Etapa 4: Canais ─────────────────────────────────────────────────────────
  const [selectedChannels, setSelectedChannels] = useState<SalesChannelId[]>(
    SALES_CHANNELS.filter(c => c.erpFound).map(c => c.id)
  )
  function toggleChannel(id: SalesChannelId) {
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  // ── Etapa 4: Equipe ─────────────────────────────────────────────────────────
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

  // ── Etapa 5: Dados ──────────────────────────────────────────────────────────
  const [dataChoice, setDataChoice] = useState<DataImportChoice | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({})

  function handleFileChange(key: string, file: File | undefined) {
    if (file) setUploadedFiles(prev => ({ ...prev, [key]: file.name }))
  }

  const requiredUploaded =
    dataChoice !== 'deferred' &&
    dataChoice !== null &&
    Boolean(uploadedFiles['catalog']) &&
    Boolean(uploadedFiles['sales'])

  // ── Navegação ────────────────────────────────────────────────────────────────
  function goNext() { setStep(s => Math.min(s + 1, STEP_META.length - 1)) }
  function goBack() { setStep(s => Math.max(s - 1, 0)) }

  // ── Conclusão ────────────────────────────────────────────────────────────────
  function complete() {
    const validInvites = teamInvites.filter(inv => inv.email.trim() && inv.name.trim())

    const profile: OnboardingProfile = {
      segments,
      rawMaterials: rankedMaterials.map((id, i) => ({ id, rank: i + 1 })),
      origem: origem!,
      hasImportedMaterial: showImportQuestion ? (hasImport ?? false) : false,
      exports: hasExport ?? false,
      productHierarchy: [],
      salesChannels: selectedChannels,
      teamInvites:    validInvites.length > 0 ? validInvites : undefined,
      dataImportChoice: dataChoice ?? 'deferred',
      importedFileNames: Object.values(uploadedFiles).length > 0
        ? Object.values(uploadedFiles)
        : undefined,
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))
    // Salva a regra padrão de temporadas no Supabase
    const tenantId = sessionStorage.getItem("activeTenantId") ?? ""
    if (tenantId) {
      saveRegraDefaultDb(tenantId, {
        verao:   { mesInicio: veraoInicio,   mesFim: veraoFim   },
        inverno: { mesInicio: invernoInicio, mesFim: invernoFim },
      }).catch(err =>
        console.warn("Erro ao salvar regra padrão de temporadas:", err)
      )
    }
    navigate('/dashboard')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start bg-gradient-to-br from-[#7598CF] to-[#9B8CD8] p-4 py-10">

      {/* Logo */}
      <div className="text-center mb-6">
        <h1 className="text-[#F6F3AA] text-2xl">
          tfo <span className="text-[#F6F3AA]/70">/ THE FASHION OFFICE</span>
        </h1>
        <p className="text-white/70 text-sm mt-1">Configuração inicial — vamos preparar o Fashion Mind para o seu negócio</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl bg-[#F2F2F2] rounded-3xl shadow-2xl overflow-hidden">

        {/* Barra de progresso */}
        <div className="w-full h-1 bg-[#28071C]/10">
          <div
            className="h-full bg-gradient-to-r from-[#7598CF] to-[#9B8CD8] transition-all duration-500"
            style={{ width: `${((step + 1) / STEP_META.length) * 100}%` }}
          />
        </div>

        <div className="px-8 py-7">

          {/* Dots de etapa */}
          <StepDots steps={STEP_META} current={step} />

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 1 — SEGMENTOS
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'segments' && (
            <div>
              <SectionLabel>Segmentos de Produto</SectionLabel>
              <p className="text-[#28071C]/60 text-sm mb-5 leading-relaxed">
                Quais segmentos de produto a sua marca comercializa? Selecione todos que se aplicam.
                Isso estrutura os filtros e indicadores em todo o sistema.
              </p>

              <div className="grid grid-cols-2 gap-2 mb-2">
                {ALL_SEGMENTS.map(id => {
                  const selected = segments.includes(id)
                  return (
                    <button
                      key={id}
                      onClick={() => toggleSegment(id)}
                      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 text-left text-sm transition-all ${
                        selected
                          ? 'bg-[#28071C] border-[#28071C] text-white'
                          : 'bg-white border-[#28071C]/12 text-[#28071C]/70 hover:border-[#7598CF]/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        selected ? 'bg-white border-white' : 'border-[#28071C]/25'
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

              <NavButtons
                onNext={goNext}
                nextDisabled={segments.length === 0}
                nextLabel="Continuar"
              />
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 2 — NEGÓCIO & LOGÍSTICA
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'business' && (
            <div>
              <SectionLabel>Negócio & Logística</SectionLabel>
              <p className="text-[#28071C]/60 text-sm mb-6 leading-relaxed">
                Como sua marca obtém os produtos? Essas informações adaptam os indicadores e alertas do sistema ao seu modelo de negócio.
              </p>

              {/* Origem */}
              <div className="mb-5">
                <label className="block text-[#28071C]/70 text-xs font-semibold uppercase tracking-widest mb-3">
                  Origem das peças
                </label>
                <div className="space-y-2">
                  {ORIGENS.map(o => (
                    <button
                      key={o}
                      onClick={() => { setOrigem(o); setHasImport(null) }}
                      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        origem === o
                          ? 'bg-[#28071C]/5 border-[#28071C]'
                          : 'bg-white border-[#28071C]/12 hover:border-[#7598CF]/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                        origem === o ? 'border-[#28071C] bg-[#28071C]' : 'border-[#28071C]/30'
                      }`}>
                        {origem === o && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-[#28071C] text-sm font-semibold">{ORIGEM_LABELS[o]}</p>
                        <p className="text-[#28071C]/50 text-xs mt-0.5">{ORIGEM_DESCRIPTIONS[o]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Matérias-primas — dois painéis (lista | ranking) */}
              {showMaterials && (
                <div className="mb-5 border-t border-[#28071C]/8 pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-[#28071C]/70 text-xs font-semibold uppercase tracking-widest">
                      Matérias-primas relevantes
                    </label>
                    {materialsRequired && (
                      <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">
                        Obrigatório — selecione ao menos 1
                      </span>
                    )}
                  </div>
                  <p className="text-[#28071C]/50 text-xs mb-3">
                    Clique em uma matéria-prima à esquerda para adicioná-la. Ordene à direita da mais impactante para a menos.
                    O sistema monitora flutuações de preço dessas matérias.
                  </p>

                  <div className="grid grid-cols-2 gap-3">

                    {/* Painel esquerdo — disponíveis */}
                    <div>
                      <p className="text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-2">
                        Disponíveis — clique para selecionar
                      </p>
                      <div className="border border-[#28071C]/10 rounded-xl overflow-hidden">
                        {ALL_RAW_MATERIALS.filter(m => !rankedMaterials.includes(m)).map((m, i, arr) => (
                          <button
                            key={m}
                            onClick={() => addMaterial(m)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm text-[#28071C] hover:bg-[#7598CF]/8 hover:text-[#7598CF] transition-colors group ${
                              i < arr.length - 1 ? 'border-b border-[#28071C]/6' : ''
                            }`}
                          >
                            <span>{RAW_MATERIAL_LABELS[m]}</span>
                            <Plus className="w-3.5 h-3.5 text-[#28071C]/25 group-hover:text-[#7598CF] transition-colors flex-shrink-0" />
                          </button>
                        ))}
                        {ALL_RAW_MATERIALS.filter(m => !rankedMaterials.includes(m)).length === 0 && (
                          <p className="px-3 py-4 text-xs text-[#28071C]/35 text-center">
                            Todas as matérias-primas foram selecionadas
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Painel direito — ranking */}
                    <div>
                      <p className="text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-2">
                        Selecionadas — ordene por impacto no custo
                      </p>
                      {rankedMaterials.length > 0 ? (
                        <div className="border border-[#7598CF]/25 rounded-xl overflow-hidden bg-[#7598CF]/3">
                          {rankedMaterials.map((id, i) => (
                            <div
                              key={id}
                              className={`flex items-center gap-2 px-3 py-2.5 ${
                                i < rankedMaterials.length - 1 ? 'border-b border-[#7598CF]/15' : ''
                              }`}
                            >
                              <span className="text-[11px] text-[#7598CF] font-bold w-4 text-center flex-shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-[#28071C] text-sm flex-1 min-w-0 truncate">
                                {RAW_MATERIAL_LABELS[id]}
                              </span>
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => moveMaterial(i, -1)}
                                  disabled={i === 0}
                                  className="p-0.5 text-[#28071C]/30 hover:text-[#28071C] disabled:opacity-0 transition-colors"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => moveMaterial(i, 1)}
                                  disabled={i === rankedMaterials.length - 1}
                                  className="p-0.5 text-[#28071C]/30 hover:text-[#28071C] disabled:opacity-0 transition-colors"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => removeMaterial(id)}
                                  className="p-0.5 text-[#28071C]/25 hover:text-red-500 transition-colors ml-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-[#28071C]/10 rounded-xl p-4 text-center">
                          <p className="text-[#28071C]/35 text-xs leading-relaxed">
                            Nenhuma selecionada ainda.
                            <br />
                            Clique nas matérias-primas à esquerda.
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* Matéria-prima importada (condicional) */}
              {showImportQuestion && (
                <div className="mb-5 border-t border-[#28071C]/8 pt-5">
                  <label className="block text-[#28071C]/70 text-xs font-semibold uppercase tracking-widest mb-3">
                    Usa matéria-prima importada?
                  </label>
                  <div className="flex gap-3">
                    {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(({ v, l }) => (
                      <button
                        key={l}
                        onClick={() => setHasImport(v)}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                          hasImport === v
                            ? 'bg-[#28071C] border-[#28071C] text-white'
                            : 'bg-white border-[#28071C]/15 text-[#28071C]/70 hover:border-[#7598CF]/50'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {hasImport && (
                    <p className="mt-2 text-xs text-[#7598CF] flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Câmbio e frete marítimo serão monitorados nos indicadores de custo.
                    </p>
                  )}
                </div>
              )}

              {/* Exportação */}
              <div className="border-t border-[#28071C]/8 pt-5">
                <label className="block text-[#28071C]/70 text-xs font-semibold uppercase tracking-widest mb-3">
                  Sua marca exporta produtos?
                </label>
                <div className="flex gap-3">
                  {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(({ v, l }) => (
                    <button
                      key={l}
                      onClick={() => setHasExport(v)}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        hasExport === v
                          ? 'bg-[#28071C] border-[#28071C] text-white'
                          : 'bg-white border-[#28071C]/15 text-[#28071C]/70 hover:border-[#7598CF]/50'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <NavButtons
                onBack={goBack}
                onNext={goNext}
                nextDisabled={!businessValid}
              />
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 3 — CALENDÁRIO DE TEMPORADAS
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'seasons' && (
            <div>
              <SectionLabel>Calendário de Temporadas</SectionLabel>

              {/* Texto introdutório completo */}
              <div className="mb-5 space-y-3">
                <p className="text-[#28071C]/70 text-sm leading-relaxed">
                  No Fashion Mind trabalhamos o planejamento pelo <strong className="text-[#28071C]">ano fiscal</strong> e também pelas <strong className="text-[#28071C]">temporadas de moda</strong>.
                  Trata-se de uma convenção comercial, industrial e criativa que organiza o fluxo de mercadorias — estabelecendo o ciclo em que seus produtos estarão expostos a preço cheio e delimitando o ritmo de vendas, compras e markdowns.
                </p>

                {/* Os três pilares */}
                <div className="grid grid-cols-1 gap-2 mt-3">
                  {[
                    {
                      emoji: '🎨',
                      titulo: 'Pilar Criativo (A Narrativa)',
                      desc: 'O recorte temporal onde o estilo define um novo tema, uma nova cartela de cores e uma nova proposta de silhuetas. Garante identidade visual e coesão estética a cada lançamento.',
                      cor: 'border-[#9B8CD8]/30 bg-[#9B8CD8]/4',
                    },
                    {
                      emoji: '⚙️',
                      titulo: 'Pilar Industrial (A Operação)',
                      desc: 'O cronograma que dita o ritmo de toda a cadeia de suprimentos. Sincroniza desde a compra de matérias-primas e o desenvolvimento de produtos até a fabricação e a entrega logística nas lojas.',
                      cor: 'border-[#7598CF]/30 bg-[#7598CF]/4',
                    },
                    {
                      emoji: '💼',
                      titulo: 'Pilar Comercial (O Varejo)',
                      desc: 'O ciclo de vida do produto no mercado. Define o período de vendas a preço cheio, planeja a rotatividade das vitrines para atrair o cliente e organiza o fluxo de caixa através do escoamento planejado de estoque.',
                      cor: 'border-[#28071C]/10 bg-[#28071C]/3',
                    },
                  ].map(p => (
                    <div key={p.titulo} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${p.cor}`}>
                      <span className="text-xl flex-shrink-0 mt-0.5">{p.emoji}</span>
                      <div>
                        <p className="text-[#28071C] text-xs font-bold mb-0.5">{p.titulo}</p>
                        <p className="text-[#28071C]/60 text-xs leading-relaxed">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[#28071C]/50 text-xs leading-relaxed mt-2">
                  O Fashion Mind pré-configura duas temporadas padrão, mas você tem <strong className="text-[#28071C]">autonomia total</strong> para personalizar a estrutura do seu negócio.
                </p>
              </div>

              {/* Cards das temporadas — seletores livres */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Verão */}
                <div className="bg-white rounded-2xl border-2 border-[#7598CF]/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">☀️</span>
                    <span className="text-[#28071C] font-bold text-sm">Verão</span>
                    <span className="ml-auto text-[10px] font-semibold text-[#7598CF] bg-[#7598CF]/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Auto</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-[#28071C]/45 font-semibold uppercase tracking-widest mb-1">Início</label>
                      <select value={veraoInicio} onChange={e => setVeraoInicio(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-[#7598CF]/25 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer">
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#28071C]/45 font-semibold uppercase tracking-widest mb-1">Fim</label>
                      <select value={veraoFim} onChange={e => setVeraoFim(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-[#7598CF]/25 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer">
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Inverno */}
                <div className="bg-white rounded-2xl border-2 border-[#9B8CD8]/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">❄️</span>
                    <span className="text-[#28071C] font-bold text-sm">Inverno</span>
                    <span className="ml-auto text-[10px] font-semibold text-[#9B8CD8] bg-[#9B8CD8]/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Auto</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-[#28071C]/45 font-semibold uppercase tracking-widest mb-1">Início</label>
                      <select value={invernoInicio} onChange={e => setInvernoInicio(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-[#9B8CD8]/25 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#9B8CD8] bg-white cursor-pointer">
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#28071C]/45 font-semibold uppercase tracking-widest mb-1">Fim</label>
                      <select value={invernoFim} onChange={e => setInvernoFim(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-[#9B8CD8]/25 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#9B8CD8] bg-white cursor-pointer">
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aviso sobre mês de início igual */}
              {veraoInicio === invernoInicio && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
                  <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-amber-800 text-xs">
                    O mês de início do Verão e do Inverno não podem ser o mesmo. Ajuste um deles.
                  </p>
                </div>
              )}

              {/* Bloco Sell-Through */}
              <div className="flex items-start gap-3 bg-[#F6F3AA]/40 border border-[#F6F3AA] rounded-xl px-4 py-3 mb-3">
                <span className="text-base flex-shrink-0 mt-0.5">📊</span>
                <div>
                  <p className="text-[#28071C] text-xs font-bold mb-0.5 uppercase tracking-widest">Sell-Through</p>
                  <p className="text-[#28071C]/70 text-xs leading-relaxed">
                    Mede a performance e a eficiência de escoamento da sua coleção.<br />
                    <span className="font-semibold text-[#28071C]">Venda ÷ (Estoque Inicial + Compras do período).</span>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                <p className="text-[#28071C]/60 text-xs leading-relaxed">
                  Essas datas definem o <strong>período de venda a preço cheio</strong> — não a data de entrega. Lead times de produção e pedido são configurados em <strong>Operações</strong>. Durações customizadas são permitidas, inclusive ultrapassando o limite do ano fiscal.
                </p>
              </div>

              <NavButtons
                onBack={goBack}
                onNext={goNext}
                nextDisabled={veraoInicio === invernoInicio}
              />
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 4 — CANAIS DE VENDA
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'channels' && (
            <div>
              <SectionLabel>Canais de Venda</SectionLabel>
              <p className="text-[#28071C]/60 text-sm mb-5 leading-relaxed">
                Quais canais geram receita para a sua marca? Isso estrutura o Planejamento de Metas por Canal (Módulo 2).
              </p>

              <div className="space-y-2">
                {SALES_CHANNELS.map(ch => {
                  const selected = selectedChannels.includes(ch.id)
                  return (
                    <button
                      key={ch.id}
                      onClick={() => toggleChannel(ch.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        selected
                          ? 'bg-[#28071C]/5 border-[#28071C]'
                          : 'bg-white border-[#28071C]/12 hover:border-[#7598CF]/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        selected ? 'bg-[#28071C] border-[#28071C]' : 'border-[#28071C]/25'
                      }`}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-[#28071C] text-sm font-medium">{ch.label}</span>
                    </button>
                  )
                })}
              </div>

              <NavButtons
                onBack={goBack}
                onNext={goNext}
                nextDisabled={selectedChannels.length === 0}
              />
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 4 — EQUIPE (opcional)
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'team' && (
            <div>
              <SectionLabel optional>Convide sua Equipe</SectionLabel>
              <p className="text-[#28071C]/60 text-sm mb-5 leading-relaxed">
                Você pode convidar a equipe agora ou depois. Recomendado: convide antes de começar o planejamento tático.
              </p>

              <div className="space-y-3">
                {teamInvites.map((inv, i) => (
                  <div key={i} className="bg-white rounded-xl border border-[#28071C]/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <select
                        value={inv.role}
                        onChange={e => updateInvite(i, 'role', e.target.value)}
                        className="text-xs font-bold text-[#7598CF] bg-[#7598CF]/10 rounded-lg px-2 py-1 border-0 focus:outline-none cursor-pointer uppercase tracking-widest"
                      >
                        <option value="estrategico">Estratégico</option>
                        <option value="tatico">Tático</option>
                        <option value="operacional">Operacional</option>
                      </select>
                      {teamInvites.length > 1 && (
                        <button onClick={() => removeInvite(i)} className="text-[#28071C]/30 hover:text-red-500 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-1">Nome</label>
                        <input
                          type="text"
                          value={inv.name}
                          onChange={e => updateInvite(i, 'name', e.target.value)}
                          placeholder="Nome completo"
                          className="w-full px-3 py-2 border border-[#28071C]/15 rounded-lg text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#28071C]/40 font-semibold uppercase tracking-widest mb-1">E-mail</label>
                        <input
                          type="email"
                          value={inv.email}
                          onChange={e => updateInvite(i, 'email', e.target.value)}
                          placeholder="email@marca.com.br"
                          className="w-full px-3 py-2 border border-[#28071C]/15 rounded-lg text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addInvite}
                className="mt-3 flex items-center gap-2 text-sm text-[#7598CF] hover:text-[#28071C] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar outro membro
              </button>

              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-amber-700 text-xs leading-relaxed">
                  Os convidados receberão e-mail com link de acesso. Você pode gerenciar a equipe depois em <strong>Configurações → Usuários</strong>.
                </p>
              </div>

              <NavButtons
                onBack={goBack}
                onNext={goNext}
                nextLabel="Continuar"
                onSkip={goNext}
                skipLabel="Convidar depois"
              />
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 5 — DADOS & HISTÓRICO (opcional)
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'data' && (
            <div>
              <SectionLabel optional>Dados & Histórico</SectionLabel>
              <p className="text-[#28071C]/60 text-sm mb-5 leading-relaxed">
                Importe seus dados para ativar indicadores históricos — ou explore o sistema agora e importe depois em Configurações.
              </p>

              {/* Seleção do fluxo */}
              {!dataChoice && (
                <div className="space-y-3">
                  {[
                    {
                      key: 'completa' as DataImportChoice,
                      icon: <Upload className="w-5 h-5 text-[#9B8CD8]" />,
                      badge: 'Sem ERP',
                      badgeColor: 'text-[#9B8CD8] bg-[#9B8CD8]/10',
                      title: 'Importação Completa',
                      desc: 'Seus dados de produto, vendas e estoque estão em planilhas. Faça upload de todos os arquivos agora.',
                    },
                    {
                      key: 'hierarquia' as DataImportChoice,
                      icon: <Package className="w-5 h-5 text-[#7598CF]" />,
                      badge: 'Com ERP',
                      badgeColor: 'text-[#7598CF] bg-[#7598CF]/10',
                      title: 'Complemento de Hierarquia',
                      desc: 'Seu ERP já possui os produtos, mas a hierarquia de categorias está em planilha separada.',
                    },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setDataChoice(opt.key)}
                      className="w-full flex items-start gap-4 px-4 py-4 border-2 border-[#28071C]/10 rounded-2xl text-left hover:border-[#7598CF]/50 transition-all bg-white"
                    >
                      <div className="w-10 h-10 bg-[#28071C]/5 rounded-xl flex items-center justify-center flex-shrink-0">
                        {opt.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${opt.badgeColor}`}>
                            {opt.badge}
                          </span>
                        </div>
                        <p className="text-[#28071C] font-semibold text-sm">{opt.title}</p>
                        <p className="text-[#28071C]/55 text-xs mt-0.5 leading-relaxed">{opt.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#28071C]/30 mt-1 flex-shrink-0" />
                    </button>
                  ))}

                  <div className="text-center pt-2">
                    <button
                      onClick={() => { setDataChoice('deferred'); goNext() }}
                      className="text-sm text-[#28071C]/40 hover:text-[#28071C]/70 underline transition-colors"
                    >
                      Importar depois — explorar o sistema agora
                    </button>
                  </div>
                </div>
              )}

              {/* Upload de arquivos */}
              {(dataChoice === 'completa' || dataChoice === 'hierarquia') && (
                <div>
                  <button
                    onClick={() => setDataChoice(null)}
                    className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Mudar opção
                  </button>

                  <div className="space-y-3">
                    {(dataChoice === 'hierarquia'
                      ? UPLOAD_FIELDS.slice(0, 1)
                      : UPLOAD_FIELDS
                    ).map(field => {
                      const uploaded = uploadedFiles[field.key]
                      return (
                        <div
                          key={field.key}
                          className={`rounded-xl border-2 p-4 transition-all ${
                            uploaded
                              ? 'bg-emerald-50 border-emerald-200'
                              : field.required
                                ? 'bg-white border-[#28071C]/12'
                                : 'bg-white border-dashed border-[#28071C]/12'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-[#28071C] text-sm font-semibold">{field.label}</p>
                                {field.required && (
                                  <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">
                                    Obrigatório
                                  </span>
                                )}
                              </div>
                              <p className="text-[#28071C]/50 text-xs">{field.description}</p>
                              <p className="text-[#28071C]/35 text-[10px] mt-0.5">{field.hint}</p>
                            </div>
                            <div className="flex-shrink-0">
                              {uploaded ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-700 text-xs font-semibold max-w-[120px] truncate">{uploaded}</span>
                                  <button
                                    onClick={() => setUploadedFiles(prev => { const n = {...prev}; delete n[field.key]; return n })}
                                    className="text-emerald-500 hover:text-red-500 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#28071C] text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-[#28071C]/90 transition-colors">
                                  <Upload className="w-3.5 h-3.5" />
                                  Upload
                                  <input
                                    type="file"
                                    accept=".xlsx,.csv"
                                    className="sr-only"
                                    onChange={e => handleFileChange(field.key, e.target.files?.[0])}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {dataChoice === 'hierarquia' && (
                    <div className="mt-4 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 flex items-start gap-2">
                      <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                      <p className="text-[#28071C]/60 text-xs leading-relaxed">
                        O sistema cruzará os dados pelo <strong className="text-[#28071C]">código do produto (SKU)</strong> como chave de join entre o ERP e a planilha de hierarquia.
                      </p>
                    </div>
                  )}

                  <NavButtons
                    onBack={() => setDataChoice(null)}
                    onNext={goNext}
                    nextDisabled={!requiredUploaded}
                    nextLabel="Confirmar importação"
                    onSkip={() => { setDataChoice('deferred'); goNext() }}
                    skipLabel="Importar depois"
                  />
                </div>
              )}

              {/* Quando "deferred" é selecionado, já vai para o próximo passo */}
              {!dataChoice && (
                <NavButtons
                  onBack={goBack}
                  onNext={() => { setDataChoice('deferred'); goNext() }}
                  nextLabel="Continuar sem importar"
                  onSkip={undefined}
                />
              )}
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              ETAPA 6 — PRONTO!
          ────────────────────────────────────────────────────────────────── */}
          {currentStepId === 'complete' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-5">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>

              <h2 className="text-[#28071C] font-bold text-xl mb-2">
                Seu Fashion Mind está pronto!
              </h2>
              <p className="text-[#28071C]/55 text-sm mb-7 leading-relaxed">
                Configuração inicial concluída. Aqui está um resumo do que foi configurado.
              </p>

              {/* Resumo */}
              <div className="text-left bg-white rounded-2xl border border-[#28071C]/10 divide-y divide-[#28071C]/6 mb-7">
                <div className="px-5 py-3.5 flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#28071C] text-sm font-semibold">
                      {segments.length} segmento{segments.length > 1 ? 's' : ''} configurado{segments.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-[#28071C]/45 text-xs mt-0.5">
                      {segments.slice(0, 3).map(s => SEGMENT_LABELS[s]).join(', ')}
                      {segments.length > 3 && ` e mais ${segments.length - 3}`}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#28071C] text-sm font-semibold">
                      Modelo de negócio: {ORIGEM_LABELS[origem!]}
                    </p>
                    {rankedMaterials.length > 0 && (
                      <p className="text-[#28071C]/45 text-xs mt-0.5">
                        Matérias-primas: {rankedMaterials.slice(0, 3).map(m => RAW_MATERIAL_LABELS[m]).join(', ')}
                        {rankedMaterials.length > 3 && ` +${rankedMaterials.length - 3}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3.5 flex items-start gap-3">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#28071C] text-sm font-semibold">
                      {selectedChannels.length} canal{selectedChannels.length > 1 ? 'is' : ''} de venda
                    </p>
                    <p className="text-[#28071C]/45 text-xs mt-0.5">
                      {selectedChannels.slice(0, 3).map(id =>
                        SALES_CHANNELS.find(c => c.id === id)?.label ?? id
                      ).join(', ')}
                      {selectedChannels.length > 3 && ` e mais ${selectedChannels.length - 3}`}
                    </p>
                  </div>
                </div>

                {teamInvites.some(inv => inv.email.trim()) && (
                  <div className="px-5 py-3.5 flex items-start gap-3">
                    <Users className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[#28071C] text-sm font-semibold">
                        {teamInvites.filter(inv => inv.email.trim()).length} convite{teamInvites.filter(inv => inv.email.trim()).length > 1 ? 's' : ''} de equipe
                      </p>
                      <p className="text-[#28071C]/45 text-xs mt-0.5">Os convites serão enviados ao concluir</p>
                    </div>
                  </div>
                )}

                <div className="px-5 py-3.5 flex items-start gap-3">
                  {dataChoice && dataChoice !== 'deferred' ? (
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-[#28071C] text-sm font-semibold">
                      {dataChoice === 'completa'
                        ? 'Importação completa de dados'
                        : dataChoice === 'hierarquia'
                          ? 'Hierarquia importada (join pelo ERP)'
                          : 'Dados para importar depois'
                      }
                    </p>
                    {dataChoice === 'deferred' && (
                      <p className="text-[#28071C]/45 text-xs mt-0.5">
                        Disponível em Configurações → Importação de Planilhas
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="space-y-3">
                <button
                  onClick={complete}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-[#7598CF] to-[#9B8CD8] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md"
                >
                  Iniciar Planejamento Estratégico
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={complete}
                  className="w-full px-6 py-3 border-2 border-[#28071C]/15 text-[#28071C]/70 rounded-xl font-semibold text-sm hover:bg-[#28071C]/5 transition-all"
                >
                  Explorar o Dashboard
                </button>
              </div>

              <NavButtons onBack={goBack} onNext={complete} nextLabel="Concluir" />
            </div>
          )}

        </div>
      </div>

      {/* Powered by */}
      <div className="mt-6 opacity-30 text-white/70 text-xs text-center">
        powered by tfo / The Fashion Office
      </div>
    </div>
  )
}
