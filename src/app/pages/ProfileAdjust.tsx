import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, Save, Check, User, LogOut } from "lucide-react"
import {
  SEGMENT_LABELS, ALL_RAW_MATERIALS, RAW_MATERIAL_LABELS,
  ORIGEM_LABELS, ONBOARDING_DONE_KEY, ONBOARDING_PROFILE_KEY,
  getStoredProfile,
} from "../types/onboarding"
import type { SegmentId, RawMaterialId, OrigemPecas, OnboardingProfile, RankedMaterial } from "../types/onboarding"
import { ChevronUp, ChevronDown } from "lucide-react"

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

  const handleSave = () => {
    if (segments.length === 0) return
    const profile: OnboardingProfile = {
      segments,
      rawMaterials: materials,
      origem,
      hasImportedMaterial: hasImport,
      exports: hasExport,
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile))
    localStorage.setItem(ONBOARDING_DONE_KEY, "true")
    setSaved(true)
    setTimeout(() => navigate(-1), 1200)
  }

  const showTrade = origem === "propria" || origem === "hibrido"

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

      <main className="max-w-[900px] mx-auto px-6 py-8 space-y-6">

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

        {/* ─── SAVE BUTTON ─────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={segments.length === 0}
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
