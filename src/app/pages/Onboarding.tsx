import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, ChevronLeft, Check, ArrowUp, ArrowDown, Plus, X, AlertTriangle, Database, Layers } from 'lucide-react'
import {
  type SegmentId, type RawMaterialId, type OrigemPecas, type SalesChannelId,
  type OnboardingProfile,
  SEGMENT_LABELS, RAW_MATERIAL_LABELS, ALL_RAW_MATERIALS, ORIGEM_LABELS,
  ERP_PRODUCT_HIERARCHY, SALES_CHANNELS,
  ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
} from '../types/onboarding'

// ─── Ordem dos segmentos na UI ────────────────────────────────────────────────
const ALL_SEGMENTS: SegmentId[] = [
  'vest_fem', 'vest_masc', 'vest_inf',
  'acc_bolsas_fem', 'acc_bolsas_masc', 'acc_bolsas_inf',
  'calc_fem', 'calc_masc', 'calc_inf',
  'under_fem', 'under_masc', 'under_inf',
  'fitness_fem', 'fitness_masc', 'fitness_inf',
  'praia_fem', 'praia_masc', 'praia_inf',
  'bijuteria',
]

// AJUSTE 2: private_label incluído na lista de origens
const ORIGENS: OrigemPecas[] = ['propria', 'white_label', 'private_label', 'multimarca', 'hibrido']

// Origem que exige a pergunta de matéria-prima importada
function originRequiresImportQuestion(o: OrigemPecas | undefined): boolean {
  return o === 'propria' || o === 'hibrido'
}

// ─── Step IDs ─────────────────────────────────────────────────────────────────
type StepId =
  | 'segments'
  | 'erp_structure'   // NOVO: validação da hierarquia de produtos do ERP
  | 'materials'
  | 'origem'
  | 'import'          // condicional: apenas para produção própria / híbrido
  | 'export'
  | 'channels'        // NOVO: canais de venda

const STEP_TITLES: Record<StepId, string> = {
  segments:      'Segmentos de Produto',
  erp_structure: 'Estrutura de Produtos',
  materials:     'Matérias-Primas Relevantes',
  origem:        'Origem das Peças',
  import:        'Matéria-Prima Importada',
  export:        'Exportação',
  channels:      'Canais de Venda',
}

function buildStepSequence(segments: SegmentId[], origem: OrigemPecas | undefined): StepId[] {
  const steps: StepId[] = ['segments']
  // Validação ERP: exibida sempre que houver segmentos selecionados (simulação de divergência)
  if (segments.length > 0) steps.push('erp_structure')
  steps.push('materials', 'origem')
  if (originRequiresImportQuestion(origem)) steps.push('import')
  steps.push('export', 'channels')
  return steps
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate()

  // ── Estado de navegação ──
  const [stepIndex, setStepIndex] = useState(0)

  // ── Dados existentes (inalterados) ──
  const [segments, setSegments]               = useState<SegmentId[]>([])
  const [rankedMaterials, setRankedMaterials] = useState<RawMaterialId[]>([])
  const [origem, setOrigem]                   = useState<OrigemPecas | undefined>(undefined)
  const [hasImport, setHasImport]             = useState<boolean | undefined>(undefined)
  const [hasExport, setHasExport]             = useState<boolean | undefined>(undefined)

  // ── Novos dados ──
  // Hierarquia de produtos: começa com a ordem do ERP, usuário pode reordenar
  const [hierarchyLevels, setHierarchyLevels] = useState<string[]>(
    ERP_PRODUCT_HIERARCHY.map(l => l.id)
  )
  const [hierarchyConfirmed, setHierarchyConfirmed] = useState(false)

  // Canais de venda: pré-seleciona os detectados no ERP
  const [selectedChannels, setSelectedChannels] = useState<SalesChannelId[]>(
    SALES_CHANNELS.filter(c => c.erpFound).map(c => c.id)
  )

  // ── Sequência de passos dinâmica ──
  const stepIds = buildStepSequence(segments, origem)
  const currentStepId = stepIds[stepIndex]
  const totalSteps = stepIds.length

  // ─── Navegação ──────────────────────────────────────────────────────────────
  function next() {
    if (stepIndex < stepIds.length - 1) setStepIndex(i => i + 1)
  }

  function back() {
    if (stepIndex > 0) setStepIndex(i => i - 1)
  }

  // ─── Validação por passo ────────────────────────────────────────────────────
  function canAdvance(): boolean {
    switch (currentStepId) {
      case 'segments':      return segments.length > 0
      case 'erp_structure': return hierarchyConfirmed
      case 'materials':     return rankedMaterials.length > 0
      case 'origem':        return origem !== undefined
      case 'import':        return hasImport !== undefined
      case 'export':        return hasExport !== undefined
      case 'channels':      return selectedChannels.length > 0
      default:              return true
    }
  }

  // ─── Conclusão ──────────────────────────────────────────────────────────────
  function complete() {
    const profile: OnboardingProfile = {
      segments,
      rawMaterials: rankedMaterials.map((id, i) => ({ id, rank: i + 1 })),
      origem: origem!,
      hasImportedMaterial: originRequiresImportQuestion(origem) ? (hasImport ?? false) : false,
      exports: hasExport ?? false,
      productHierarchy: hierarchyLevels,
      salesChannels: selectedChannels,
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))
    navigate('/dashboard')
  }

  // ─── Helpers de segmento ─────────────────────────────────────────────────
  function toggleSegment(id: SegmentId) {
    setSegments(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
    // Resetar confirmação da hierarquia se segmentos mudam
    setHierarchyConfirmed(false)
  }

  // ─── Helpers de matéria-prima (ranked list) ────────────────────────────
  function addMaterial(id: RawMaterialId) {
    if (!rankedMaterials.includes(id)) {
      setRankedMaterials(prev => [...prev, id])
    }
  }

  function removeMaterial(id: RawMaterialId) {
    setRankedMaterials(prev => prev.filter(m => m !== id))
  }

  function moveUp(index: number) {
    if (index === 0) return
    setRankedMaterials(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setRankedMaterials(prev => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  // ─── Helpers de hierarquia ────────────────────────────────────────────
  function moveHierarchyUp(index: number) {
    if (index === 0) return
    setHierarchyLevels(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setHierarchyConfirmed(false)
  }

  function moveHierarchyDown(index: number) {
    setHierarchyLevels(prev => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setHierarchyConfirmed(false)
  }

  // ─── Helpers de canais ────────────────────────────────────────────────
  function toggleChannel(id: SalesChannelId) {
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const availableMaterials = ALL_RAW_MATERIALS.filter(m => !rankedMaterials.includes(m))

  const isLastStep = stepIndex === stepIds.length - 1

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start bg-gradient-to-br from-[#7598CF] to-[#9B8CD8] p-4 py-10">
      {/* Cabeçalho */}
      <div className="text-center mb-6">
        <h1 className="text-[#F6F3AA] text-2xl">tfo <span className="text-[#F6F3AA]/70">/ THE FASHION OFFICE</span></h1>
        <p className="text-white/80 text-sm mt-1">Configuração inicial do perfil</p>
      </div>

      {/* Card principal */}
      <div className="w-full max-w-2xl bg-[#E7E7E6] rounded-3xl shadow-2xl overflow-hidden">

        {/* Barra de progresso */}
        <div className="w-full h-1.5 bg-[#28071C]/10">
          <div
            className="h-full bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Header do passo */}
        <div className="px-8 pt-6 pb-4 border-b border-[#28071C]/10">
          <div className="flex items-center justify-between">
            <span className="text-[#28071C]/50 text-xs uppercase tracking-widest font-semibold">
              Passo {stepIndex + 1} de {totalSteps}
            </span>
            <div className="flex gap-1.5">
              {stepIds.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i <= stepIndex ? 'bg-[#7598CF]' : 'bg-[#28071C]/20'
                  }`}
                />
              ))}
            </div>
          </div>
          <h2 className="text-[#28071C] text-xl font-bold mt-2">
            {STEP_TITLES[currentStepId]}
          </h2>
        </div>

        {/* Conteúdo do passo */}
        <div className="px-8 py-6 min-h-[340px]">

          {/* ── Segmentos (existente — inalterado) ───────────────────────────── */}
          {currentStepId === 'segments' && (
            <div>
              <p className="text-[#28071C]/70 text-sm mb-4">
                Selecione todos os segmentos de produto do seu negócio.
              </p>
              <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                {ALL_SEGMENTS.map(id => (
                  <button
                    key={id}
                    onClick={() => toggleSegment(id)}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-left text-sm transition-all ${
                      segments.includes(id)
                        ? 'bg-[#7598CF]/10 border-[#7598CF] text-[#28071C] font-medium'
                        : 'bg-white border-transparent text-[#28071C]/70 hover:border-[#7598CF]/40'
                    }`}
                  >
                    <span>{SEGMENT_LABELS[id]}</span>
                    {segments.includes(id) && (
                      <Check className="w-4 h-4 text-[#7598CF] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              {segments.length > 0 && (
                <p className="text-[#7598CF] text-xs font-medium mt-3">
                  {segments.length} segmento{segments.length > 1 ? 's' : ''} selecionado{segments.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* ── NOVO: Validação ERP – Estrutura de Produtos ───────────────────── */}
          {currentStepId === 'erp_structure' && (
            <div>
              {/* Aviso de divergência ERP */}
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <strong>Divergência detectada:</strong> A estrutura de produtos do ERP possui{' '}
                  <strong>4 níveis hierárquicos</strong> que precisam ser mapeados para o plano de coleção.
                  Ajuste a ordem e confirme antes de continuar.
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-[#7598CF]" />
                <p className="text-[#28071C]/70 text-sm">
                  Hierarquia de planejamento — arraste para reordenar os níveis (até 4 níveis)
                </p>
              </div>

              <div className="space-y-2 mb-4">
                {hierarchyLevels.map((levelId, idx) => {
                  const level = ERP_PRODUCT_HIERARCHY.find(l => l.id === levelId)
                  if (!level) return null
                  return (
                    <div
                      key={levelId}
                      className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-[#7598CF]/20 rounded-xl"
                    >
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#7598CF] text-white text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#28071C]">{level.label}</div>
                        <div className="text-xs text-[#28071C]/50 truncate">Ex: {level.example}</div>
                      </div>
                      <div className="flex gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => moveHierarchyUp(idx)}
                          disabled={idx === 0}
                          className="p-1 text-[#28071C]/40 hover:text-[#28071C] disabled:opacity-20 disabled:cursor-not-allowed rounded"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveHierarchyDown(idx)}
                          disabled={idx === hierarchyLevels.length - 1}
                          className="p-1 text-[#28071C]/40 hover:text-[#28071C] disabled:opacity-20 disabled:cursor-not-allowed rounded"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Relação pai/filho visual */}
              <div className="bg-[#28071C]/5 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="w-3.5 h-3.5 text-[#28071C]/50" />
                  <span className="text-xs text-[#28071C]/50 font-medium uppercase tracking-wide">Relação pai / filho</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {hierarchyLevels.map((levelId, idx) => {
                    const level = ERP_PRODUCT_HIERARCHY.find(l => l.id === levelId)
                    return (
                      <span key={levelId} className="flex items-center gap-1">
                        <span className="text-xs font-medium text-[#28071C] bg-white px-2 py-0.5 rounded-md border border-[#28071C]/10">
                          {level?.label}
                        </span>
                        {idx < hierarchyLevels.length - 1 && (
                          <ChevronRight className="w-3 h-3 text-[#28071C]/30" />
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <strong>Impacto controlado:</strong> Esta estrutura ajustada não altera o ERP.
                Será usada como hierarquia oficial de planejamento nos Módulos 3 e 5.
              </div>

              {/* Botão de confirmação explícita */}
              <button
                onClick={() => setHierarchyConfirmed(true)}
                className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  hierarchyConfirmed
                    ? 'bg-green-100 border-2 border-green-400 text-green-800'
                    : 'bg-[#7598CF]/10 border-2 border-[#7598CF]/40 text-[#28071C] hover:bg-[#7598CF]/20'
                }`}
              >
                <Check className={`w-4 h-4 ${hierarchyConfirmed ? 'text-green-600' : 'text-[#7598CF]'}`} />
                {hierarchyConfirmed ? 'Estrutura confirmada — pronto para avançar' : 'Confirmar estrutura de planejamento'}
              </button>
            </div>
          )}

          {/* ── Matérias-primas (existente — inalterado, agora com Poliamida disponível) ── */}
          {currentStepId === 'materials' && (
            <div>
              <p className="text-[#28071C]/70 text-sm mb-4">
                Selecione e ordene as matérias-primas relevantes para o seu negócio.
                <span className="font-semibold text-[#28071C]"> Posição 1 = maior impacto.</span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                {/* Disponíveis */}
                <div>
                  <p className="text-[#28071C]/50 text-xs uppercase tracking-wide font-semibold mb-2">
                    Disponíveis
                  </p>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {availableMaterials.map(id => (
                      <button
                        key={id}
                        onClick={() => addMaterial(id)}
                        className="flex items-center justify-between w-full px-3 py-2 bg-white rounded-lg text-[#28071C]/80 text-sm hover:bg-[#7598CF]/10 hover:text-[#28071C] border-2 border-transparent hover:border-[#7598CF]/40 transition-all"
                      >
                        <span>{RAW_MATERIAL_LABELS[id]}</span>
                        <Plus className="w-3.5 h-3.5 text-[#7598CF]" />
                      </button>
                    ))}
                    {availableMaterials.length === 0 && (
                      <p className="text-[#28071C]/40 text-xs px-2">Todas selecionadas</p>
                    )}
                  </div>
                </div>

                {/* Ranqueadas */}
                <div>
                  <p className="text-[#28071C]/50 text-xs uppercase tracking-wide font-semibold mb-2">
                    Ranking (arraste para ordenar)
                  </p>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {rankedMaterials.map((id, idx) => (
                      <div
                        key={id}
                        className="flex items-center gap-2 px-3 py-2 bg-[#7598CF]/10 border-2 border-[#7598CF]/30 rounded-lg"
                      >
                        <span className="text-[#7598CF] font-bold text-xs w-4 flex-shrink-0">{idx + 1}</span>
                        <span className="text-[#28071C] text-sm flex-1 truncate">{RAW_MATERIAL_LABELS[id]}</span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => moveUp(idx)}
                            disabled={idx === 0}
                            className="p-0.5 text-[#28071C]/40 hover:text-[#28071C] disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveDown(idx)}
                            disabled={idx === rankedMaterials.length - 1}
                            className="p-0.5 text-[#28071C]/40 hover:text-[#28071C] disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => removeMaterial(id)}
                            className="p-0.5 text-red-400 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {rankedMaterials.length === 0 && (
                      <p className="text-[#28071C]/40 text-xs px-2">
                        Clique nas matérias-primas ao lado para adicionar
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Origem (existente — inalterado, agora com private_label disponível) ── */}
          {currentStepId === 'origem' && (
            <div>
              <p className="text-[#28071C]/70 text-sm mb-4">
                Qual é a principal origem das peças comercializadas pelo seu negócio?
              </p>
              <div className="space-y-3">
                {ORIGENS.map(o => (
                  <button
                    key={o}
                    onClick={() => setOrigem(o)}
                    className={`flex items-center justify-between w-full px-5 py-4 rounded-xl border-2 text-left transition-all ${
                      origem === o
                        ? 'bg-[#7598CF]/10 border-[#7598CF] text-[#28071C] font-medium'
                        : 'bg-white border-transparent text-[#28071C]/70 hover:border-[#7598CF]/40'
                    }`}
                  >
                    <span>{ORIGEM_LABELS[o]}</span>
                    {origem === o && <Check className="w-5 h-5 text-[#7598CF]" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Importação (existente — inalterado) ──────────────────────────── */}
          {currentStepId === 'import' && (
            <div>
              <p className="text-[#28071C]/70 text-sm mb-6">
                Seu negócio utiliza <span className="font-semibold text-[#28071C]">matéria-prima relevante importada</span> na produção das peças?
              </p>
              <div className="space-y-3 max-w-xs">
                {([true, false] as const).map(v => (
                  <button
                    key={String(v)}
                    onClick={() => setHasImport(v)}
                    className={`flex items-center justify-between w-full px-5 py-4 rounded-xl border-2 text-left transition-all ${
                      hasImport === v
                        ? 'bg-[#7598CF]/10 border-[#7598CF] text-[#28071C] font-medium'
                        : 'bg-white border-transparent text-[#28071C]/70 hover:border-[#7598CF]/40'
                    }`}
                  >
                    <span>{v ? 'Sim' : 'Não'}</span>
                    {hasImport === v && <Check className="w-5 h-5 text-[#7598CF]" />}
                  </button>
                ))}
              </div>
              {hasImport === true && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  Frete Marítimo Global (WCI) e Taxa de Câmbio serão incluídos nos seus indicadores.
                </div>
              )}
            </div>
          )}

          {/* ── Exportação (existente — inalterado) ──────────────────────────── */}
          {currentStepId === 'export' && (
            <div>
              <p className="text-[#28071C]/70 text-sm mb-6">
                Seu negócio <span className="font-semibold text-[#28071C]">exporta produtos</span>?
              </p>
              <div className="space-y-3 max-w-xs">
                {([true, false] as const).map(v => (
                  <button
                    key={String(v)}
                    onClick={() => setHasExport(v)}
                    className={`flex items-center justify-between w-full px-5 py-4 rounded-xl border-2 text-left transition-all ${
                      hasExport === v
                        ? 'bg-[#7598CF]/10 border-[#7598CF] text-[#28071C] font-medium'
                        : 'bg-white border-transparent text-[#28071C]/70 hover:border-[#7598CF]/40'
                    }`}
                  >
                    <span>{v ? 'Sim' : 'Não'}</span>
                    {hasExport === v && <Check className="w-5 h-5 text-[#7598CF]" />}
                  </button>
                ))}
              </div>
              {hasExport === true && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  Frete Marítimo Global (WCI) e Taxa de Câmbio serão incluídos nos seus indicadores.
                </div>
              )}
            </div>
          )}

          {/* ── NOVO: Canais de Venda ────────────────────────────────────────── */}
          {currentStepId === 'channels' && (
            <div>
              <p className="text-[#28071C]/70 text-sm mb-4">
                Selecione os canais de venda do seu negócio. Esta configuração impacta exclusivamente o{' '}
                <span className="font-semibold text-[#28071C]">Módulo 2 — Planejamento de metas por canal</span>.
              </p>

              {/* Legenda ERP */}
              <div className="flex items-center gap-3 mb-3 p-2.5 bg-[#7598CF]/10 border border-[#7598CF]/30 rounded-xl">
                <Database className="w-3.5 h-3.5 text-[#7598CF] flex-shrink-0" />
                <p className="text-xs text-[#28071C]/70">
                  <span className="inline-flex items-center gap-1 font-medium text-[#7598CF]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF] inline-block" /> ERP
                  </span>
                  {' '}= canal detectado no seu histórico de vendas. Confirme, adicione ou remova conforme necessário.
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {SALES_CHANNELS.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${
                      selectedChannels.includes(ch.id)
                        ? 'bg-[#7598CF]/10 border-[#7598CF] text-[#28071C] font-medium'
                        : 'bg-white border-transparent text-[#28071C]/70 hover:border-[#7598CF]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{ch.label}</span>
                      {ch.erpFound && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#7598CF] bg-[#7598CF]/10 px-1.5 py-0.5 rounded-full">
                          <Database className="w-2.5 h-2.5" />
                          ERP
                        </span>
                      )}
                    </div>
                    {selectedChannels.includes(ch.id) && (
                      <Check className="w-4 h-4 text-[#7598CF] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {selectedChannels.length > 0 && (
                <p className="text-[#7598CF] text-xs font-medium mt-3">
                  {selectedChannels.length} canal{selectedChannels.length > 1 ? 'is' : ''} selecionado{selectedChannels.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

        </div>

        {/* Rodapé de navegação */}
        <div className="px-8 pb-8 flex items-center justify-between">
          <button
            onClick={back}
            disabled={stepIndex === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[#28071C]/60 hover:text-[#28071C] hover:bg-[#28071C]/5 transition-all disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>

          {/* Indicador de passo */}
          <span className="text-[#28071C]/40 text-xs">
            {stepIndex + 1} / {totalSteps}
          </span>

          {isLastStep ? (
            <button
              onClick={complete}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              <Check className="w-4 h-4" />
              Concluir
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-white/60 text-xs mt-6">
        Esta configuração pode ser alterada a qualquer momento nas Configurações do sistema.
      </p>
    </div>
  )
}
