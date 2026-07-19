// ─── planApprovalService.ts ────────────────────────────────────────────────────
// Gerencia pedidos de revisão/aprovação entre módulos do Fashion Mind.
//
// Fluxo:
//   M2 (ChannelPlanning) → pede aprovação a M1 (Planning)
//   M3 (DivisionPlanning) → pede aprovação a M2 (ChannelPlanning)
//   M4 (CycleValidation)  → pede aprovação a M2 (ChannelPlanning)
//
// Tabela: plan_approval_requests
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImpactedIndicator {
  key:       string
  label:     string
  planned:   number
  projected: number
  gap:       number
  isRate:    boolean
}

export interface PlanApprovalRequest {
  id:                   string
  tenant_id:            string
  year:                 number
  from_module:          number    // 2 | 3 | 4
  to_module:            number    // 1 | 2
  status:               'pending' | 'approved' | 'denied'
  requester_email:      string
  approver_email:       string | null
  justification:        string
  proposed_data:        Record<string, unknown>
  original_data:        Record<string, unknown>
  impacted_indicators:  ImpactedIndicator[]
  scenario_id:          string | null
  created_at:           string
  resolved_at:          string | null
  resolved_by:          string | null
}

export interface CreateApprovalInput {
  tenantId:             string
  year:                 number
  fromModule:           number
  toModule:             number
  requesterEmail:       string
  approverEmail?:       string
  justification:        string
  proposedData:         Record<string, unknown>
  originalData:         Record<string, unknown>
  impactedIndicators:   ImpactedIndicator[]
  scenarioId?:          string
}

// ── Criar pedido de aprovação ─────────────────────────────────────────────────

export async function createApprovalRequest(
  input: CreateApprovalInput,
): Promise<PlanApprovalRequest> {
  const { data, error } = await db
    .from('plan_approval_requests')
    .insert({
      tenant_id:            input.tenantId,
      year:                 input.year,
      from_module:          input.fromModule,
      to_module:            input.toModule,
      status:               'pending',
      requester_email:      input.requesterEmail,
      approver_email:       input.approverEmail ?? null,
      justification:        input.justification,
      proposed_data:        input.proposedData,
      original_data:        input.originalData,
      impacted_indicators:  input.impactedIndicators,
      scenario_id:          input.scenarioId ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as PlanApprovalRequest
}

// ── Listar pedidos pendentes (para o módulo aprovador) ────────────────────────

export async function getPendingApprovals(
  tenantId: string,
  toModule:  number,
): Promise<PlanApprovalRequest[]> {
  const { data, error } = await db
    .from('plan_approval_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('to_module', toModule)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as PlanApprovalRequest[]
}

// ── Verificar se o usuário atual tem pedidos pendentes direcionados a ele ─────
// (filtra por approver_email OU por qualquer pending — CEO vê todos)

export async function getPendingApprovalsForUser(
  tenantId:    string,
  toModule:    number,
  userEmail:   string,
  isCeoOrAdmin: boolean,
): Promise<PlanApprovalRequest[]> {
  let query = db
    .from('plan_approval_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('to_module', toModule)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!isCeoOrAdmin) {
    query = query.eq('approver_email', userEmail)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as PlanApprovalRequest[]
}

// ── Resolver pedido (aprovar ou negar) ───────────────────────────────────────

export async function resolveApproval(
  requestId:   string,
  status:      'approved' | 'denied',
  resolvedBy:  string,
): Promise<void> {
  const { error } = await db
    .from('plan_approval_requests')
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq('id', requestId)

  if (error) throw error
}

// ── Verificar se já existe pedido pendente do mesmo módulo para o mesmo ano ───

export async function hasPendingRequest(
  tenantId:   string,
  fromModule: number,
  year:       number,
): Promise<boolean> {
  const { data, error } = await db
    .from('plan_approval_requests')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('from_module', fromModule)
    .eq('year', year)
    .eq('status', 'pending')
    .limit(1)

  if (error) return false
  return Array.isArray(data) && data.length > 0
}
