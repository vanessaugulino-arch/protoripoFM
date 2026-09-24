/**
 * PlanObservationCard — campo de observação (texto livre, sem limite de
 * caracteres) reaproveitável nas telas M1-M5. Uma nota única por
 * (tenant, módulo, temporada/ciclo) — o "porquê" das decisões do plano,
 * não só os números. Autosave com debounce, mesmo padrão já usado em
 * PricePyramid.tsx.
 *
 * M6 (Engenharia de Sortimento) tem seu próprio padrão de notas, por
 * categoria (ver SortimentPlan.tsx) — não usa este componente.
 */
import { useEffect, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import {
  getPlanObservation,
  savePlanObservation,
  type PlanObservationModule,
} from "../../services/supabase/planObservationService";

interface PlanObservationCardProps {
  tenantId: string | undefined;
  module: PlanObservationModule;
  seasonKey: string | undefined;
  title?: string;
  placeholder?: string;
  userEmail?: string;
  /** "inline": sem cartão branco nem sombra — para ocupar a coluna ao lado de uma tabela. */
  variant?: "card" | "inline";
}

export function PlanObservationCard({
  tenantId,
  module,
  seasonKey,
  title = "Observações do Plano",
  placeholder = "Registre o porquê das decisões deste plano — ex.: trade-offs entre margem, preço e remarcação, ajustes de abastecimento, contexto que não aparece nos números.",
  userEmail,
  variant = "card",
}: PlanObservationCardProps) {
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    if (!tenantId || !seasonKey) { setNote(""); setLoaded(true); return; }
    getPlanObservation(tenantId, module, seasonKey)
      .then(obs => { setNote(obs.note); setSavedAt(obs.updatedAt); })
      .catch(() => setNote(""))
      .finally(() => setLoaded(true));
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, module, seasonKey]);

  const handleChange = (value: string) => {
    setNote(value);
    if (!tenantId || !seasonKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await savePlanObservation(tenantId, module, seasonKey, value, userEmail);
      setSavedAt(new Date().toISOString());
      setSaving(false);
    }, 800);
  };

  if (!tenantId || !seasonKey) return null;

  const inline = variant === "inline";

  return (
    <div className={inline ? "" : "bg-white rounded-2xl p-5 shadow-sm"}>
      <div className={`flex items-center justify-between ${inline ? "mb-2" : "mb-3"}`}>
        <div className="flex items-center gap-2">
          <StickyNote className={inline ? "w-3.5 h-3.5 text-[#7598CF]" : "w-4 h-4 text-[#7598CF]"} />
          <h3 className={inline ? "text-[11px] font-semibold uppercase tracking-wide text-[#28071C]/50" : "font-semibold text-[#28071C]"}>{title}</h3>
        </div>
        <span className="text-[10px] text-[#28071C]/40">
          {saving ? "Salvando…" : savedAt ? (inline ? "salvo" : `Salvo ${new Date(savedAt).toLocaleString("pt-BR")}`) : ""}
        </span>
      </div>
      <textarea
        value={note}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={!loaded}
        rows={inline ? 5 : 3}
        className={`w-full resize-y rounded-xl border border-[#28071C]/15 bg-[#F2F2F2]/60 px-3.5 py-3 text-[#28071C]/80 placeholder:text-[#28071C]/35 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 disabled:opacity-50 ${inline ? "min-h-[120px] text-[12px]" : "min-h-[88px] text-sm"}`}
      />
      {!inline && <p className="text-[10px] text-[#28071C]/40 mt-1.5">Sem limite de caracteres.</p>}
    </div>
  );
}
