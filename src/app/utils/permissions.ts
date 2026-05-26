import { Profile, Permissions } from "../types/workflow";

/**
 * Retorna as permissões de cada perfil no sistema
 */
export function getPermissionsByProfile(profile: Profile): Permissions {
  switch (profile) {
    case "CEO":
      return {
        canEditStrategic: true,
        canEditTactical: false, // CEO não edita tático diretamente, mas seus ajustes impactam
        canEditOperational: false,
        canApprove: true,
        canViewAll: true,
      };
    
    case "Direção Criativa":
      return {
        canEditStrategic: false, // Não pode alterar números do CEO
        canEditTactical: true,
        canEditOperational: false, // Mas seus ajustes impactam operacional
        canApprove: true,
        canViewAll: true,
      };
    
    case "Estilo":
      return {
        canEditStrategic: false,
        canEditTactical: false, // Não pode alterar números da Diretora
        canEditOperational: true,
        canApprove: true,
        canViewAll: false, // Vê apenas o necessário para seu trabalho
      };
    
    default:
      return {
        canEditStrategic: false,
        canEditTactical: false,
        canEditOperational: false,
        canApprove: false,
        canViewAll: false,
      };
  }
}

/**
 * Retorna o próximo perfil no workflow
 */
export function getNextProfile(currentProfile: Profile): Profile | null {
  switch (currentProfile) {
    case "CEO":
      return "Direção Criativa";
    case "Direção Criativa":
      return "Estilo";
    case "Estilo":
      return null; // Último no workflow
    default:
      return null;
  }
}

/**
 * Retorna o perfil anterior no workflow (para casos de ajustes)
 */
export function getPreviousProfile(currentProfile: Profile): Profile | null {
  switch (currentProfile) {
    case "Estilo":
      return "Direção Criativa";
    case "Direção Criativa":
      return "CEO";
    case "CEO":
      return null; // Primeiro no workflow
    default:
      return null;
  }
}

/**
 * Verifica se um perfil pode fazer ajustes que impactam outro
 * CEO pode ajustar tudo (impacta Renata e Carol)
 * Renata pode ajustar tático (impacta Carol, mas não altera estratégico do Murilo)
 * Carol pode ajustar operacional (não impacta ninguém)
 */
export function getImpactedProfiles(profile: Profile): Profile[] {
  switch (profile) {
    case "CEO":
      return ["Direção Criativa", "Estilo"];
    case "Direção Criativa":
      return ["Estilo"];
    case "Estilo":
      return [];
    default:
      return [];
  }
}

/**
 * Valida se um ajuste é permitido considerando a hierarquia
 */
export function canAdjustSection(
  userProfile: Profile,
  sectionOwnerProfile: Profile
): boolean {
  // CEO pode ajustar tudo
  if (userProfile === "CEO") return true;
  
  // Renata pode ajustar apenas sua própria seção (tático)
  if (userProfile === "Direção Criativa") {
    return sectionOwnerProfile === "Direção Criativa";
  }
  
  // Carol pode ajustar apenas sua própria seção (operacional)
  if (userProfile === "Estilo") {
    return sectionOwnerProfile === "Estilo";
  }
  
  return false;
}
