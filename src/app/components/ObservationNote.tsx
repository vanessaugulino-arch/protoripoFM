/**
 * ObservationNote — exibe (só leitura) a observação já registrada numa tela
 * de planejamento (M1-M5, via PlanObservationCard). Usado em telas de
 * resumo/entrega como o Plano Final, onde a observação deve ser lida, não
 * editada ali — o texto é escrito na tela do módulo de origem.
 *
 * Nunca é um card: texto explicativo simples no fluxo da página, com um
 * cabeçalho que pode recolher/expandir o conteúdo — mesmo padrão de
 * observação usado em outras telas de análise (não uma caixa branca com
 * sombra).
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  getPlanObservation,
  type PlanObservationModule,
} from "../../services/supabase/planObservationService";

export function ObservationNote({
  tenantId,
  module,
  seasonKey,
  label,
}: {
  tenantId: string | undefined;
  module: PlanObservationModule;
  seasonKey: string | undefined;
  label: string;
}) {
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!tenantId || !seasonKey) { setNote(""); setLoaded(true); return; }
    getPlanObservation(tenantId, module, seasonKey)
      .then(obs => setNote(obs.note))
      .catch(() => setNote(""))
      .finally(() => setLoaded(true));
  }, [tenantId, module, seasonKey]);

  if (!loaded || !note.trim()) return null;

  return (
    <div className="py-1">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-[#28071C] hover:opacity-70 transition-opacity"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-[#28071C]/40" /> : <ChevronDown className="w-3.5 h-3.5 text-[#28071C]/40" />}
        {label}
        <span className="text-[11px] font-normal text-[#28071C]/40">· observação</span>
      </button>
      {!collapsed && (
        <p className="text-[13px] text-[#28071C]/65 leading-relaxed mt-1 pl-5">{note}</p>
      )}
    </div>
  );
}
