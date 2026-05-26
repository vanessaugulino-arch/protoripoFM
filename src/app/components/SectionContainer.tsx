import { Profile } from "../types/workflow";

interface SectionContainerProps {
  id: "section_murilo_estrategico" | "section_renata_tatico" | "section_carol_operacional";
  currentUserProfile: Profile;
  sectionOwnerProfile: Profile;
  isApproved?: boolean;
  isEditable?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Container para seções específicas de cada perfil
 * Gerencia visibilidade e estados de edição baseado no workflow
 */
export function SectionContainer({
  id,
  currentUserProfile,
  sectionOwnerProfile,
  isApproved = false,
  isEditable = true,
  children,
  className = "",
}: SectionContainerProps) {
  // Determina se o usuário pode ver esta seção
  const canView = () => {
    // CEO vê tudo
    if (currentUserProfile === "CEO") return true;
    
    // Direção Criativa vê estratégico e tático
    if (currentUserProfile === "Direção Criativa") {
      return sectionOwnerProfile === "CEO" || sectionOwnerProfile === "Direção Criativa";
    }
    
    // Estilo vê tático e operacional (precisa ver direcionamentos da Renata)
    if (currentUserProfile === "Estilo") {
      return sectionOwnerProfile === "Direção Criativa" || sectionOwnerProfile === "Estilo";
    }
    
    return false;
  };

  // Determina se o usuário pode editar esta seção
  const canEdit = () => {
    if (!isEditable) return false;
    
    // CEO pode editar estratégico
    if (currentUserProfile === "CEO" && sectionOwnerProfile === "CEO") {
      return true;
    }
    
    // Direção Criativa pode editar tático
    if (currentUserProfile === "Direção Criativa" && sectionOwnerProfile === "Direção Criativa") {
      return true;
    }
    
    // Estilo pode editar operacional
    if (currentUserProfile === "Estilo" && sectionOwnerProfile === "Estilo") {
      return true;
    }
    
    return false;
  };

  if (!canView()) {
    return null;
  }

  const editableClass = canEdit() ? "border-2 border-[#7598CF]" : "border border-[#E7E7E6]";
  const approvedClass = isApproved ? "bg-green-50" : "";

  return (
    <div
      id={id}
      className={`${className} ${editableClass} ${approvedClass} rounded-xl relative`}
      data-owner={sectionOwnerProfile}
      data-editable={canEdit()}
      data-approved={isApproved}
    >
      {/* Badge indicando dono da seção */}
      <div className="absolute -top-3 left-4 bg-white px-3 py-1 rounded-full border border-[#E7E7E6] text-xs font-semibold text-[#28071C]">
        {sectionOwnerProfile}
      </div>

      {/* Badge de aprovação */}
      {isApproved && (
        <div className="absolute -top-3 right-4 bg-green-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
          ✓ Aprovado
        </div>
      )}

      {/* Conteúdo */}
      <div className={`${!canEdit() ? 'pointer-events-none opacity-75' : ''}`}>
        {children}
      </div>
    </div>
  );
}
