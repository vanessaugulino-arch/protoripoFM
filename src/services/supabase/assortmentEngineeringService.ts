// src/services/supabase/assortmentEngineeringService.ts
// "Engenharia de Sortimento" = M5 (Plano de Coleção) + M6 (Sortimento), vistos
// como uma única decisão em 2 etapas. Não é uma tabela nova — só combina os
// cenários nomeados de collection_plans e sortiment_plans pelo vínculo que já
// existe (sortiment_plans.source_collection_plan_id), permitindo salvar por
// etapas: nomear a etapa de coleções primeiro, completar o sortimento depois.

import { listCollectionPlanScenarios } from "./collectionPlanService";
import { listPlanScenarios } from "./sortimentPlanService";

export interface AssortmentEngineeringScenario {
  /** Nome do cenário — sempre lido de collection_plans (fonte única de verdade). */
  name: string;
  savedAt: string;
  collectionPlanId: string;
  hasCollection: true;
  sortimentPlanId: string | null;
  hasSortiment: boolean;
}

/**
 * Combina os cenários nomeados de M5 e M6 de uma temporada pelo vínculo
 * source_collection_plan_id. Cenários de sortiment_plans sem esse vínculo
 * (fluxo legado, montado direto do M4) não entram aqui — continuam
 * disponíveis via listPlanScenarios() para quem ainda usa o painel do M6 só.
 */
export async function listAssortmentEngineeringScenarios(
  tenantId: string,
  seasonId: string,
): Promise<AssortmentEngineeringScenario[]> {
  const [collectionScenarios, sortimentScenarios] = await Promise.all([
    listCollectionPlanScenarios(tenantId, seasonId),
    listPlanScenarios(tenantId, seasonId),
  ]);

  const sortimentByCollectionId = new Map<string, { id: string }>();
  for (const s of sortimentScenarios) {
    if (s.sourceCollectionPlanId) sortimentByCollectionId.set(s.sourceCollectionPlanId, { id: s.id });
  }

  return collectionScenarios.map(cp => {
    const linkedSortiment = sortimentByCollectionId.get(cp.id);
    return {
      name: cp.name,
      savedAt: cp.savedAt,
      collectionPlanId: cp.id,
      hasCollection: true,
      sortimentPlanId: linkedSortiment?.id ?? null,
      hasSortiment: !!linkedSortiment,
    };
  });
}
