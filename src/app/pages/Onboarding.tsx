import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, ChevronLeft, Check, ArrowUp, ArrowDown, Plus, X, AlertTriangle, Database, Layers, BookOpen, Lightbulb } from 'lucide-react'
import {
  type SegmentId, type RawMaterialId, type OrigemPecas, type SalesChannelId,
  type OnboardingProfile,
  SEGMENT_LABELS, RAW_MATERIAL_LABELS, ALL_RAW_MATERIALS, ORIGEM_LABELS,
  ERP_PRODUCT_HIERARCHY, SALES_CHANNELS,
  ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
} from '../types/onboarding'

// ─── Hierarquia fixa do sistema (não alterável pelo usuário) ──────────────────
const SYSTEM_HIERARCHY_INFO = [
  { id: 'divisao',      label: 'Divisão',      example: 'Feminino / Masculino',     description: 'Nível mais alto — separa grandes grupos estratégicos de produto' },
  { id: 'categoria',    label: 'Categoria',    example: 'Vestidos, Calças',          description: 'Tipo de produto dentro de uma divisão' },
  { id: 'subcategoria', label: 'Subcategoria', example: 'Casual, Festa, Comprimento', description: 'Especificação dentro de uma categoria' },
  { id: 'linha',        label: 'Linha',        example: 'Justa, Ampla, Básica',      description: 'Nível mais granular de diferenciação do produto' },
]

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
  | 'structure_intro' // AJUSTE 1: tela explicativa intermediária
  | 'erp_structure'   // AJUSTE 2: alinhamento dos níveis (hierarquia fixa)
  | 'materials'
  | 'origem'
  | 'import'          // condicional: apenas para produção própria / híbrido
  | 'export'
  | 'channels'

const STEP_TITLES: Record<StepId, string> = {
  segments:        'Segmentos de Produto',
  structure_intro: 'Organizando a inteligência do seu negócio',
  erp_structure:   'Alinhamento da Estrutura de Produtos',
  materials:       'Matérias-Primas Relevantes',
  origem:          'Origem das Peças',
  import:          'Matéria-Prima Importada',
  export:          'Exportação',
  channels:        'Canais de Venda',
}

function buildStepSequence(segments: SegmentId[], origem: OrigemPecas | undefined): StepId[] {
  const steps: StepId[] = ['segments']
  if (segments.length > 0) {
    steps.push('structure_intro') // tela explicativa antes do alinhamento
    steps.push('erp_structure')   // alinhamento da hierarquia
  }
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
  // Mapeamento: para cada nível do sistema (fixo), qual campo do negócio corresponde
  const [hierarchyMapping, setHierarchyMapping] = useState<string[]>(
    ERP_PRODUCT_HIERARCHY.map(l => l.label) // sugestão automática do ERP
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
      case 'segments':        return segments.length > 0
      case 'structure_intro': return true  // tela apenas informativa
      case 'erp_structure':   return hierarchyConfirmed
      case 'materials':       return rankedMaterials.length > 0
      case 'origem':          return origem !== undefined
      case 'import':          return hasImport !== undefined
      case 'export':          return hasExport !== undefined
      case 'channels':        return selectedChannels.length > 0
      default:                return true
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
      productHierarchy: hierarchyMapping,
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

          {/* ── AJUSTE 1: Tela explicativa intermediária ─────────────────────── */}
          {currentStepId === 'structure_intro' && (
            <div className="space-y-4">
              {/* Conceito principal */}
              <div className="flex items-start gap-3 p-4 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-[#7598CF] flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[#28071C] text-sm font-semibold mb-1">
                    Por que precisamos organizar a "árvore" do seu negócio?
                  </p>
                  <p className="text-[#28071C]/60 text-sm leading-relaxed">
                    No nosso sistema, cada grupo de produtos é tratado como uma unidade estratégica.
                    Essa organização permite planejar compras, produção, margens e evitar estoques parados,
                    garantindo melhor retorno financeiro.
                  </p>
                </div>
              </div>

              {/* Os 4 níveis */}
              <div>
                <p className="text-[#28071C]/60 text-xs uppercase tracking-widest font-semibold mb-2.5">
                  O sistema utiliza uma estrutura de até 4 níveis — do macro ao micro
                </p>
                <div className="space-y-2">
                  {SYSTEM_HIERARCHY_INFO.map((level, idx) => (
                    <div key={level.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-[#28071C]/8">
                      <div className="w-6 h-6 rounded-full bg-[#7598CF] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-[#28071C]">{idx + 1}º Nível — {level.label}</span>
                        <span className="text-sm text-[#28071C]/40 ml-2">ex: {level.example}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mensagem-chave */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-sm text-emerald-800 leading-relaxed">
                  <strong>Já analisamos sua base de dados e montamos uma estrutura inicial.</strong><br />
                  Na próxima tela, você só precisa validar se ela faz sentido para a dinâmica da sua marca.
                </p>
              </div>

              {/* Dicas rápidas */}
              <div className="p-4 bg-[#28071C]/4 rounded-xl">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Lightbulb className="w-3.5 h-3.5 text-[#28071C]/40" />
                  <span className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold">Dicas rápidas</span>
                </div>
                {[
                  'Pense em planejamento, não em cadastro',
                  'Evite divisões excessivas',
                  'Priorize blocos estratégicos que ajudem no giro e margem',
                ].map(tip => (
                  <div key={tip} className="flex items-start gap-2 text-sm text-[#28071C]/65 mb-1.5 last:mb-0">
                    <span className="text-[#7598CF] font-bold flex-shrink-0 leading-5">•</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AJUSTE 2: Alinhamento de estrutura – hierarquia fixa ───────────── */}
          {currentStepId === 'erp_structure' && (
            <div>
              {/* Premissa obrigatória: hierarquia do sistema é fixa */}
              <div className="flex items-start gap-3 p-3 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl mb-4">
                <div className="w-5 h-5 rounded-full bg-[#7598CF] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[10px] font-bold">i</span>
                </div>
                <div className="text-xs text-[#28071C]/70 leading-relaxed">
                  <strong className="text-[#28071C]">A hierarquia do sistema é fixa:</strong>{' '}
                  Divisão → Categoria → Subcategoria → Linha. Você não reordena os níveis —
                  apenas indica qual informação do seu negócio ocupa cada posição.
                </div>
              </div>

              <p className="text-[#28071C]/60 text-sm mb-3">
                Com base na sua base de dados, sugerimos o mapeamento abaixo. Confirme ou ajuste:
              </p>

              <div className="space-y-2.5 mb-4">
                {SYSTEM_HIERARCHY_INFO.map((sysLevel, idx) => (
                  <div key={sysLevel.id} className="bg-white border-2 border-[#7598CF]/20 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#7598CF] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-[#28071C]">{sysLevel.label}</span>
                          <span className="text-[10px] text-[#28071C]/35 bg-[#28071C]/5 px-2 py-0.5 rounded">
                            nível fixo do sistema
                          </span>
                        </div>
                        <p className="text-xs text-[#28071C]/40 mb-2">{sysLevel.description}</p>
                        <div>
                          <label className="text-[10px] text-[#28071C]/40 uppercase tracking-widest font-semibold block mb-1">
                            Campo do seu negócio correspondente
                          </label>
                          <select
                            value={hierarchyMapping[idx] ?? ''}
                            onChange={e => {
                              const updated = [...hierarchyMapping]
                              updated[idx] = e.target.value
                              setHierarchyMapping(updated)
                              setHierarchyConfirmed(false)
                            }}
                            className="w-full px-3 py-2 bg-[#E7E7E6] border border-[#28071C]/15 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]"
                          >
                            {ERP_PRODUCT_HIERARCHY.map(erpLevel => (
                              <option key={erpLevel.id} value={erpLevel.label}>
                                {erpLevel.label} — ex: {erpLevel.example}
                              </option>
                            ))}
                            <option value="Não utilizado">Não utilizado neste negócio</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview da estrutura confirmada */}
              <div className="bg-[#28071C]/5 rounded-xl p-3 mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="w-3.5 h-3.5 text-[#28071C]/50" />
                  <span className="text-xs text-[#28071C]/50 font-medium uppercase tracking-wide">
                    Estrutura que será utilizada
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {SYSTEM_HIERARCHY_INFO.map((sysLevel, idx) => (
                    <span key={sysLevel.id} className="flex items-center gap-1">
                      <span className="text-xs font-medium text-[#28071C] bg-white px-2 py-0.5 rounded-md border border-[#28071C]/10">
                        {hierarchyMapping[idx] || sysLevel.label}
                      </span>
                      {idx < SYSTEM_HIERARCHY_INFO.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-[#28071C]/30" />
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 mb-3">
                <strong>Impacto controlado:</strong> Esta estrutura não altera o ERP.
                Será usada como hierarquia oficial de planejamento nos{' '}
                <strong>Módulos 3 e 5</strong>.
              </div>

              <button
                onClick={() => setHierarchyConfirmed(true)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
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
