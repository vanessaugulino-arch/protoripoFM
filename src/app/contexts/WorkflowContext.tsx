import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  User,
  CollectionCycle,
  CycleState,
  WorkflowStatus,
  ApprovalReport,
} from "../types/workflow";
import { getPermissionsByProfile } from "../utils/permissions";

interface WorkflowContextType extends CycleState {
  setCurrentCycle: (cycle: CollectionCycle | null) => void;
  setCurrentUser: (user: User | null) => void;
  approveCycle: (observations: string) => Promise<void>;
  updateCycle: (updates: Partial<CollectionCycle>) => Promise<void>;
  createApprovalReport: (observations: string) => ApprovalReport;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [cycle, setCycle] = useState<CollectionCycle | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calcula permissões baseado no usuário atual
  const permissions = currentUser
    ? getPermissionsByProfile(currentUser.profile)
    : {
        canEditStrategic: false,
        canEditTactical: false,
        canEditOperational: false,
        canApprove: false,
        canViewAll: false,
      };

  // Carrega usuário do sessionStorage
  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  /**
   * Aprova o ciclo atual e avança no workflow
   */
  const approveCycle = async (observations: string) => {
    if (!cycle || !currentUser) {
      setError("Ciclo ou usuário não encontrado");
      return;
    }

    setIsLoading(true);
    try {
      // Cria relatório de aprovação
      const report = createApprovalReport(observations);
      
      // Atualiza o status do ciclo baseado no perfil
      let newStatus: WorkflowStatus = cycle.status;
      const now = new Date().toISOString();

      if (currentUser.profile === "CEO") {
        // CEO aprova → libera para Direção Criativa
        newStatus = "pending_creative";
        cycle.section_murilo_estrategico.approvedAt = now;
        cycle.section_murilo_estrategico.approvedBy = currentUser.id;
        cycle.section_murilo_estrategico.observacoes = observations;
      } else if (currentUser.profile === "Direção Criativa") {
        // Direção Criativa aprova → libera para Estilo
        newStatus = "pending_style";
        if (cycle.section_renata_tatico) {
          cycle.section_renata_tatico.approvedAt = now;
          cycle.section_renata_tatico.approvedBy = currentUser.id;
          cycle.section_renata_tatico.observacoes = observations;
        }
      } else if (currentUser.profile === "Estilo") {
        // Estilo aprova → finaliza ciclo
        newStatus = "completed";
        if (cycle.section_carol_operacional) {
          cycle.section_carol_operacional.approvedAt = now;
          cycle.section_carol_operacional.approvedBy = currentUser.id;
          cycle.section_carol_operacional.observacoes = observations;
        }
      }

      // Atualiza o ciclo
      const updatedCycle = {
        ...cycle,
        status: newStatus,
      };

      // TODO: Persistir no backend
      // await saveCycleToBackend(updatedCycle);
      // await saveReportToBackend(report);

      setCycle(updatedCycle);
      
      // Salva no sessionStorage (temporário)
      sessionStorage.setItem("currentCycle", JSON.stringify(updatedCycle));
      sessionStorage.setItem(`report_${report.id}`, JSON.stringify(report));

    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar ciclo");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Atualiza dados do ciclo
   */
  const updateCycle = async (updates: Partial<CollectionCycle>) => {
    if (!cycle) return;

    setIsLoading(true);
    try {
      const updatedCycle = {
        ...cycle,
        ...updates,
      };

      // TODO: Persistir no backend
      // await saveCycleToBackend(updatedCycle);

      setCycle(updatedCycle);
      sessionStorage.setItem("currentCycle", JSON.stringify(updatedCycle));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar ciclo");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Cria um relatório de aprovação
   */
  const createApprovalReport = (observations: string): ApprovalReport => {
    if (!cycle || !currentUser) {
      throw new Error("Ciclo ou usuário não encontrado");
    }

    const nextProfile =
      currentUser.profile === "CEO"
        ? "Direção Criativa"
        : currentUser.profile === "Direção Criativa"
        ? "Estilo"
        : undefined;

    return {
      id: `report_${Date.now()}`,
      cycleId: cycle.id,
      approvedBy: currentUser.id,
      approvedByName: currentUser.name,
      approvedByProfile: currentUser.profile,
      approvedAt: new Date().toISOString(),
      observations,
      nextProfile,
    };
  };

  const value: WorkflowContextType = {
    cycle,
    currentUser,
    permissions,
    isLoading,
    error,
    setCurrentCycle: setCycle,
    setCurrentUser,
    approveCycle,
    updateCycle,
    createApprovalReport,
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow deve ser usado dentro de WorkflowProvider");
  }
  return context;
}
