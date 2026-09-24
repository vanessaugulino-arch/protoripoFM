// src/app/components/AssortmentEngineeringTabs.tsx
// "Engenharia de Sortimento" = Plano de Coleção (M5) + Sortimento (M6) como
// duas etapas de uma mesma decisão. Cada tela continua sendo sua própria
// rota/componente (risco de fundir 2 arquivos de 1000+ linhas é alto demais)
// — isto é só uma barra de abas visual que navega entre elas.

import { useNavigate } from "react-router";

export function AssortmentEngineeringTabs({ active }: { active: "collection" | "sortiment" }) {
  const navigate = useNavigate();

  const tabClass = (isActive: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
      isActive ? "bg-white/25 text-[#F6F3AA]" : "text-[#F6F3AA]/60 hover:bg-white/10 hover:text-[#F6F3AA]"
    }`;

  return (
    <div className="inline-flex items-center gap-1 bg-black/10 rounded-lg p-1 ml-3">
      <button onClick={() => navigate("/collection-plan")} className={tabClass(active === "collection")}>
        Coleções
      </button>
      <button onClick={() => navigate("/sortiment-plan")} className={tabClass(active === "sortiment")}>
        Sortimento
      </button>
    </div>
  );
}
