import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, Save, Check, User, LogOut, ChevronUp, ChevronDown, Info } from "lucide-react"
import {
  SEGMENT_LABELS, ALL_RAW_MATERIALS, RAW_MATERIAL_LABELS,
  ORIGEM_LABELS, ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
  getStoredProfile,
} from "../types/onboarding"
import type { SegmentId, RawMaterialId, OrigemPecas, OnboardingProfile, RankedMaterial } from "../types/onboarding"
import { MONTHS, DEFAULT_REGRA, computeMesFim } from "../../services/temporadaService"
import { getRegraDefaultDb, saveRegraDefaultDb } from "../../services/supabase/seasonService"

const ALL_SEGMENTS = Object.keys(SEGMENT_LABELS) as SegmentId[]
const ALL_ORIGENS  = Object.keys(ORIGEM_LABELS)  as OrigemPecas[]

interface UserData { name: string; email: string; profile: string }

export default function ProfileAdjust() {
  const navigate = useNavigate()

  const [user,         setUser]         = useState<UserData | null>(null)
  const [segments,     setSegments]     = useState<SegmentId[]>([])
  const [materials,    setMaterials]    = useState<RankedMaterial[]>([])
  const [origem,       setOrigem]       = useState<OrigemPecas>("white_label")
  const [hasImport,    setHasImport]    = useState(false)
  const [hasExport,    setHasExport]    = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [veraoInicio,   setVeraoInicio]   = useState(DEFAULT_REGRA.verao.mesInicio)
  const [invernoInicio, setInvernoInicio] = useState(DEFAULT_REGRA.inverno.mesInicio)

  const veraoFim   = computeMesFim(invernoInicio)
  const invernoFim = computeMesFim(veraoInicio)

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser")
    if (!stored) { navigate("/"); return }
    setUser(JSON.parse(stored))
    const profile = getStoredProfile()
    if (profile) {
      setSegments(profile.segments)
      setMaterials(profile.rawMaterials)
      setOrigem(profile.origem)
      setHasImport(profile.hasImportedMaterial)
      setHasExport(profile.exports)
    } else {
      // Bootstrap from all materials ranked in default order
      setMaterials(ALL_RAW_MATERIALS.map((id, i) => ({ id, rank: i + 1 })))
    }
    // Carrega a regra de temporadas do Supabase
    const cu = JSON.parse(stored)
    const tenantId = sessionStorage.getItem("activeTenantId") ?? cu.tenant_id ?? ""
    if (tenantId) {
      getRegraDefaultDb(tenantId).then(regra => {
        setVeraoInicio(regra.verao.mesInicio)
        setInvernoInicio(regra.inverno.mesInicio)
      }).catch(() => {})
    }
  }, [navigate])

  const toggleSegment = (id: SegmentId) => {
    setSegments((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  const moveMatUp = (idx: number) => {
    if (idx === 0) return
    setMaterials((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next.map((m, i) => ({ ...m, rank: i + 1 }))
    })
  }

  const moveMatDown = (idx: number) => {
    if (idx === materials.length - 1) return
    setMaterials((prev) => {
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next.map((m, i) => ({ ...m, rank: i + 1 }))
    })
  }

  const handleSave = async () => {
    if (segments.length === 0) return
    const profile: OnboardingProfile = {
      segments,
      rawMaterials: materials,
      origem,
      hasImportedMaterial: hasImport,
      exports: hasExport,
      productHierarchy: [],
      salesChannels: [],
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))
    localStorage.setItem(ONBOARDING_DONE_KEY, "true")
    // Salva regra de temporadas no Supabase
    const cu = JSON.parse(sessionStorage.getItem("currentUser") ?? "{}")
    const tenantId = sessionStorage.getItem("activeTenantId") ?? cu.tenant_id ?? ""
    if (tenantId) {
      try {
        await saveRegraDefaultDb(tenantId, {
          verao:   { mesInicio: veraoInicio,   mesFim: veraoFim   },
          inverno: { mesInicio: invernoInicio, mesFim: invernoFim },
        })
      } catch (err) {
        console.warn("Erro ao salvar regra de temporadas:", err)
      }
    }
    setSaved(true)
    setTimeout(() => navigate(-1), 1200)
  }

  const showTrade = origem === "propria" || origem === "hibrido"

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#F2F2F2]">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Módulo 1</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Ajuste de Perfil de Negócio</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-5 space-y-5">

        {/* ─── SEGMENTOS ──────────────────────────────────────────────────── */}
        <section className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-semibold text-base">Segmentos de Produto</h2>
            <p className="text-[#28071C]/50 text-sm mt-0.5">
              Selecione todos os segmentos do seu negócio.
              {segments.length === 0 && (
                <span className="text-red-500 ml-2 text-xs">Selecione ao menos um</span>
              )}
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-2">
              {ALL_SEGMENTS.map((id) => {
                const selected = segments.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleSegment(id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${
                      selected
                        ? "border-[#7598CF] bg-[#7598CF]/10 text-[#28071C] font-medium"
                        : "border-[#28071C]/10 bg-white/50 text-[#28071C]/60 hover:border-[#7598CF]/30"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                      selected ? "border-[#7598CF] bg-[#7598CF]" : "border-[#28071C]/20"
                    }`}>
                      {selected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {SEGMENT_LABELS[id]}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* ─── MATÉRIAS-PRIMAS ─────────────────────────────────────────────── */}
        <section className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-semibold text-base">Matérias-primas</h2>
            <p className="text-[#28071C]/50 text-sm mt-0.5">
              Ordene da que tem maior impacto no seu custo para a de menor impacto.
            </p>
          </div>
          <div className="px-6 py-4 space-y-1">
            {materials.map((mat, idx) => (
              <div
                key={mat.id}
                className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-white/60 border border-[#28071C]/6"
              >
                <span className="w-6 h-6 rounded-full bg-[#7598CF]/20 text-[#7598CF] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm text-[#28071C] font-medium">
                  {RAW_MATERIAL_LABELS[mat.id]}
                </span>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveMatUp(idx)}
                    disabled={idx === 0}
                    className="w-6 h-5 flex items-center justify-center rounded hover:bg-[#7598CF]/15 disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-[#28071C]/60" />
                  </button>
                  <button
                    onClick={() => moveMatDown(idx)}
                    disabled={idx === materials.length - 1}
                    className="w-6 h-5 flex items-center justify-center rounded hover:bg-[#7598CF]/15 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-[#28071C]/60" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── ORIGEM ──────────────────────────────────────────────────────── */}
        <section className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-semibold text-base">Origem das Peças</h2>
          </div>
          <div className="p-6 space-y-3">
            {ALL_ORIGENS.map((o) => (
              <button
                key={o}
                onClick={() => setOrigem(o)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${
                  origem === o
                    ? "border-[#7598CF] bg-[#7598CF]/10 text-[#28071C] font-medium"
                    : "border-[#28071C]/10 bg-white/50 text-[#28071C]/60 hover:border-[#7598CF]/30"
                }`}
              >
                <div className={`w-4 h-4 rounded-full flex-shrink-0 border-2 transition-all ${
                  origem === o ? "border-[#7598CF] bg-[#7598CF]" : "border-[#28071C]/20"
                }`} />
                {ORIGEM_LABELS[o]}
              </button>
            ))}

            {showTrade && (
              <div className="mt-4 pt-4 border-t border-[#28071C]/8 space-y-3">
                <p className="text-xs text-[#28071C]/50 uppercase tracking-widest font-semibold">Comércio Exterior</p>
                {[
                  { label: "Importo matéria-prima ou produtos", value: hasImport, set: setHasImport },
                  { label: "Exporto produtos",                   value: hasExport, set: setHasExport },
                ].map(({ label, value, set }) => (
                  <button
                    key={label}
                    onClick={() => set(!value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${
                      value
                        ? "border-[#7598CF] bg-[#7598CF]/10 text-[#28071C] font-medium"
                        : "border-[#28071C]/10 bg-white/50 text-[#28071C]/60 hover:border-[#7598CF]/30"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                      value ? "border-[#7598CF] bg-[#7598CF]" : "border-[#28071C]/20"
                    }`}>
                      {value && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ─── CALENDÁRIO DE TEMPORADAS ────────────────────────────────────── */}
        <section className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#28071C]/8">
            <h2 className="text-[#28071C] font-semibold text-base">Calendário de Temporadas</h2>
            <p className="text-[#28071C]/50 text-sm mt-0.5">
              Defina o mês de início de cada temporada. O mês de fim é calculado automaticamente.
            </p>
          </div>
          <div className="p-6">
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
                    <select
                      value={veraoInicio}
                      onChange={e => setVeraoInicio(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-[#7598CF]/25 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white cursor-pointer"
                    >
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#28071C]/45 font-semibold uppercase tracking-widest mb-1">Fim</label>
                    <div className="w-full px-3 py-2 border-2 border-[#7598CF]/15 rounded-lg text-sm text-[#28071C]/50 bg-[#7598CF]/5">
                      {veraoFim}
                    </div>
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
                    <select
                      value={invernoInicio}
                      onChange={e => setInvernoInicio(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-[#9B8CD8]/25 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#9B8CD8] bg-white cursor-pointer"
                    >
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#28071C]/45 font-semibold uppercase tracking-widest mb-1">Fim</label>
                    <div className="w-full px-3 py-2 border-2 border-[#9B8CD8]/15 rounded-lg text-sm text-[#28071C]/50 bg-[#9B8CD8]/5">
                      {invernoFim}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {veraoInicio === invernoInicio && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-amber-800 text-xs">
                  O mês de início do Verão e do Inverno não podem ser o mesmo. Ajuste um deles.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
              <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
              <p className="text-[#28071C]/60 text-xs leading-relaxed">
                Essas datas definem o <strong>período de venda a preço cheio</strong> — não a data de entrega. Alterações aqui refletem nas configurações de planejamento.
              </p>
            </div>
          </div>
        </section>

        {/* ─── SAVE BUTTON ─────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={segments.length === 0 || veraoInicio === invernoInicio}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold transition-all shadow-md ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] text-white hover:opacity-90 disabled:opacity-40"
            }`}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Perfil salvo!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar perfil
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
