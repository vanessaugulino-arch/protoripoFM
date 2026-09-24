// src/app/components/AssortmentEngineeringTabs.tsx
// "Engenharia de Sortimento" = Plano de Coleção (M5) + Sortimento (M6) como
// duas etapas de uma mesma decisão. Cada tela continua sendo sua própria
// rota/componente (risco de fundir 2 arquivos de 1000+ linhas é alto demais)
// — isto é só uma barra de abas visual que navega entre elas. Vive no corpo
// da página (não na topbar) para ficar visível de verdade ao trocar de tela.

import { useNavigate } from "react-router";

export function AssortmentEngineeringTabs({ active }: { active: "collection" | "sortiment" }) {
  const navigate = useNavigate();

  const tabClass = (isActive: boolean) =>
    `flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      isActive
        ? "bg-[#28071C] text-[#F6F3AA] shadow-sm"
        : "text-[#28071C]/50 hover:bg-[#28071C]/5 hover:text-[#28071C]"
    }`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#28071C]/8 px-4 py-3 flex items-center gap-4 flex-wrap">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#28071C]/40">Engenharia de Sortimento</span>
      <div className="flex gap-1 bg-[#F2F2F2] rounded-xl p-1 w-full sm:w-auto">
        <button onClick={() => navigate("/collection-plan")} className={tabClass(active === "collection")}>
          Coleções
        </button>
        <button onClick={() => navigate("/sortiment-plan")} className={tabClass(active === "sortiment")}>
          Sortimento
        </button>
      </div>
    </div>
  );
}
