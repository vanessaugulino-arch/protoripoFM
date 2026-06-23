import { supabase } from "../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SystemRole = "support" | "client_admin" | "invited_user";

export interface TenantRow {
  id: string;
  name: string;
  cnpj: string | null;
  status: string;
  plan_id: string | null;
  created_at: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  tenant_id: string;
  role_id: string | null;
  system_role: SystemRole;
  status: string;
  created_at: string;
  roles?: { id: string; name: string; base_level: string } | null;
  tenants?: { id: string; name: string } | null;
}

export interface RoleRow {
  id: string;
  name: string;
  base_level: string;
  tenant_id: string;
}

export interface ModuleRow {
  id: string;
  code: string;
  name: string;
  level: string;
  order_index: number;
}

export interface PermissionMatrixRow {
  id: string;
  role_id: string;
  module_id: string;
  tenant_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
}

export interface UserPermissionOverride {
  module_id: string;
  module_code: string;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
}

export interface EffectivePermission {
  module_id: string;
  module_code: string;
  module_name: string;
  module_level: string;
  module_order: number;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
  is_override: boolean;
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantRow[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .neq("id", "00000000-0000-0000-0000-000000000001") // exclui tenant de sistema
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createTenant(
  name: string,
  cnpj: string | null,
  planId: string | null,
): Promise<TenantRow> {
  const { data, error } = await supabase
    .from("tenants")
    .insert({ name, cnpj, plan_id: planId, status: "active" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTenant(
  id: string,
  payload: { name?: string; cnpj?: string | null; plan_id?: string | null },
): Promise<void> {
  const { error } = await supabase.from("tenants").update(payload).eq("id", id);
  if (error) throw error;
}

export async function setTenantStatus(id: string, status: "active" | "inactive"): Promise<void> {
  const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
  if (error) throw error;
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

export async function listUsers(tenantId: string): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*, roles(id, name, base_level), tenants(id, name)")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function updateUser(
  id: string,
  payload: { name?: string; role_id?: string | null; status?: string; system_role?: SystemRole },
): Promise<void> {
  const { error } = await supabase.from("users").update(payload).eq("id", id);
  if (error) throw error;
}

export async function setUserStatus(
  id: string,
  status: "active" | "invited" | "inactive",
): Promise<void> {
  const { error } = await supabase.from("users").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function promoteToClientAdmin(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ system_role: "client_admin" })
    .eq("id", userId);
  if (error) throw error;
}

// ─── Convites ────────────────────────────────────────────────────────────────

export async function inviteUser(
  email: string,
  tenantId: string,
  roleId: string | null,
): Promise<{ token: string }> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

  const { error } = await supabase.from("invitations").insert({
    email,
    tenant_id: tenantId,
    role_id: roleId,
    token,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token };
}

export async function listInvitations(tenantId: string) {
  const { data, error } = await supabase
    .from("invitations")
    .select("*, roles(name)")
    .eq("tenant_id", tenantId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase.from("invitations").delete().eq("id", id);
  if (error) throw error;
}

// ─── Cargos (Roles) ──────────────────────────────────────────────────────────

export async function listRoles(tenantId: string): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createRole(
  tenantId: string,
  name: string,
  baseLevel: string,
): Promise<RoleRow> {
  const { data, error } = await supabase
    .from("roles")
    .insert({ tenant_id: tenantId, name, base_level: baseLevel })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Catálogo de Módulos ─────────────────────────────────────────────────────

export async function listModules(): Promise<ModuleRow[]> {
  const { data, error } = await supabase
    .from("modules")
    .select("*")
    .order("order_index");
  if (error) throw error;
  return data ?? [];
}

// ─── Permissões por Cargo (base) ─────────────────────────────────────────────

export async function getRolePermissions(
  roleId: string,
  tenantId: string,
): Promise<PermissionMatrixRow[]> {
  const { data, error } = await supabase
    .from("permission_matrix")
    .select("*")
    .eq("role_id", roleId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertRolePermissions(
  tenantId: string,
  roleId: string,
  permissions: { module_id: string; can_view: boolean; can_edit: boolean; can_approve: boolean }[],
): Promise<void> {
  const rows = permissions.map((p) => ({
    tenant_id: tenantId,
    role_id: roleId,
    module_id: p.module_id,
    can_view: p.can_view,
    can_edit: p.can_edit,
    can_approve: p.can_approve,
  }));
  const { error } = await supabase
    .from("permission_matrix")
    .upsert(rows, { onConflict: "role_id,module_id" });
  if (error) throw error;
}

// ─── Overrides de Permissão por Usuário ──────────────────────────────────────

export async function getUserPermissionOverrides(
  userId: string,
): Promise<UserPermissionOverride[]> {
  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("module_id, can_view, can_edit, can_approve, modules(code)")
    .eq("user_id", userId);
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    module_id: row.module_id,
    module_code: row.modules?.code ?? "",
    can_view: row.can_view,
    can_edit: row.can_edit,
    can_approve: row.can_approve,
  }));
}

export async function saveUserPermissionOverrides(
  userId: string,
  tenantId: string,
  overrides: { module_id: string; can_view: boolean; can_edit: boolean; can_approve: boolean }[],
): Promise<void> {
  if (overrides.length === 0) return;

  const rows = overrides.map((o) => ({
    user_id: userId,
    tenant_id: tenantId,
    module_id: o.module_id,
    can_view: o.can_view,
    can_edit: o.can_edit,
    can_approve: o.can_approve,
  }));

  const { error } = await supabase
    .from("user_permission_overrides")
    .upsert(rows, { onConflict: "user_id,module_id" });
  if (error) throw error;
}

// ─── Permissão Efetiva (role base + override do usuário) ─────────────────────
// Merge: override prevalece sobre role; se não há override, usa role.

export async function getEffectivePermissions(
  userId: string,
  roleId: string | null,
  tenantId: string,
): Promise<EffectivePermission[]> {
  const [modules, rolePerms, overrides] = await Promise.all([
    listModules(),
    roleId ? getRolePermissions(roleId, tenantId) : Promise.resolve([] as PermissionMatrixRow[]),
    getUserPermissionOverrides(userId),
  ]);

  const roleMap = new Map(rolePerms.map((p) => [p.module_id, p]));
  const overrideMap = new Map(overrides.map((o) => [o.module_id, o]));

  return modules.map((m) => {
    const override = overrideMap.get(m.id);
    const role = roleMap.get(m.id);

    if (override) {
      return {
        module_id: m.id,
        module_code: m.code,
        module_name: m.name,
        module_level: m.level,
        module_order: m.order_index,
        can_view: override.can_view,
        can_edit: override.can_edit,
        can_approve: override.can_approve,
        is_override: true,
      };
    }
    return {
      module_id: m.id,
      module_code: m.code,
      module_name: m.name,
      module_level: m.level,
      module_order: m.order_index,
      can_view: role?.can_view ?? false,
      can_edit: role?.can_edit ?? false,
      can_approve: role?.can_approve ?? false,
      is_override: false,
    };
  });
}
