import { useEffect, useState, useCallback } from "react";
import { Shield, Save, Loader2, Eye, Edit2, CheckCircle, Info, User, AlertTriangle } from "lucide-react";
import {
  listUsers,
  listRoles,
  listModules,
  getRolePermissions,
  getUserPermissionOverrides,
  saveUserPermissionOverrides,
  type UserRow,
  type RoleRow,
  type ModuleRow,
  type PermissionMatrixRow,
  type UserPermissionOverride,
} from "../../services/supabase/adminService";

interface Props {
  tenantId: string;
  tenantName: string;
  isSupport: boolean;
}

interface PermState {
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

const LEVEL_LABELS: Record<string, string> = {
  module:  "Módulo",
  section: "Seção / Card",
  action:  "Ação de Aprovação",
};

const LEVEL_COLORS: Record<string, string> = {
  module:  "bg-[#28071C] text-white",
  section: "bg-[#7598CF]/20 text-[#28071C]",
  action:  "bg-green-100 text-green-800",
};

export default function Admin_Permissions({ tenantId, tenantName }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [loadingPerms, setLoadingPerms] = useState(false);

  const [permissions, setPermissions] = useState<PermState[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Carrega módulos, usuários e cargos ao montar
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      listModules(),
      listUsers(tenantId),
      listRoles(tenantId),
    ])
      .then(([mods, usrs, rls]) => {
        setModules(mods);
        setUsers(usrs);
        setRoles(rls);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId]);

  // Quando usuário é selecionado, monta a matriz de permissões efetivas
  const loadPermissionsForUser = useCallback(
    async (userId: string) => {
      const user = users.find((u) => u.id === userId);
      if (!user) return;
      setSelectedUser(user);
      setLoadingPerms(true);
      setHasChanges(false);

      try {
        const [rolePerms, overrides]: [PermissionMatrixRow[], UserPermissionOverride[]] =
          await Promise.all([
            user.role_id
              ? getRolePermissions(user.role_id, tenantId)
              : Promise.resolve([] as PermissionMatrixRow[]),
            getUserPermissionOverrides(userId),
          ]);

        const roleMap = new Map(rolePerms.map((p) => [p.module_id, p]));
        const overrideMap = new Map(overrides.map((o) => [o.module_id, o]));

        const merged: PermState[] = modules.map((m) => {
          const ov = overrideMap.get(m.id);
          const rp = roleMap.get(m.id);
          return {
            module_id: m.id,
            module_code: m.code,
            module_name: m.name,
            module_level: m.level,
            module_order: m.order_index,
            can_view: ov ? ov.can_view : (rp?.can_view ?? false),
            can_edit: ov ? ov.can_edit : (rp?.can_edit ?? false),
            can_approve: ov ? ov.can_approve : (rp?.can_approve ?? false),
            is_override: !!ov,
          };
        });

        setPermissions(merged);
      } catch (err: any) {
        showToast("Erro ao carregar permissões: " + err.message);
      } finally {
        setLoadingPerms(false);
      }
    },
    [users, modules, tenantId],
  );

  const handleUserSelect = (userId: string) => {
    if (hasChanges && !confirm("Você tem alterações não salvas. Deseja trocar de usuário?")) return;
    setSelectedUserId(userId);
    setPermissions([]);
    setHasChanges(false);
    if (userId) loadPermissionsForUser(userId);
    else setSelectedUser(null);
  };

  // Aplica perfil-base de um cargo como ponto de partida (sem salvar ainda)
  const applyRoleTemplate = async (roleId: string) => {
    if (!roleId) return;
    setLoadingPerms(true);
    try {
      const rolePerms = await getRolePermissions(roleId, tenantId);
      const roleMap = new Map(rolePerms.map((p) => [p.module_id, p]));

      setPermissions((prev) =>
        prev.map((p) => {
          const rp = roleMap.get(p.module_id);
          return {
            ...p,
            can_view: rp?.can_view ?? false,
            can_edit: rp?.can_edit ?? false,
            can_approve: rp?.can_approve ?? false,
            is_override: true,
          };
        }),
      );
      setHasChanges(true);
      showToast("Perfil-base aplicado. Ajuste individualmente e salve.");
    } catch (err: any) {
      showToast("Erro ao aplicar perfil: " + err.message);
    } finally {
      setLoadingPerms(false);
    }
  };

  const toggle = (moduleId: string, type: "can_view" | "can_edit" | "can_approve") => {
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.module_id !== moduleId) return p;
        const updated = { ...p, is_override: true };

        if (type === "can_view") {
          updated.can_view = !p.can_view;
          if (!updated.can_view) { updated.can_edit = false; updated.can_approve = false; }
        } else if (type === "can_edit") {
          updated.can_edit = !p.can_edit;
          if (updated.can_edit) updated.can_view = true;
          else updated.can_approve = false;
        } else if (type === "can_approve") {
          updated.can_approve = !p.can_approve;
          if (updated.can_approve) { updated.can_view = true; updated.can_edit = true; }
        }
        return updated;
      }),
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const overrides = permissions.map((p) => ({
        module_id: p.module_id,
        can_view: p.can_view,
        can_edit: p.can_edit,
        can_approve: p.can_approve,
      }));
      await saveUserPermissionOverrides(selectedUserId, tenantId, overrides);
      setHasChanges(false);
      setPermissions((prev) => prev.map((p) => ({ ...p, is_override: true })));
      showToast(`Permissões de ${selectedUser?.name} salvas com sucesso.`);
    } catch (err: any) {
      showToast("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  if (!tenantId) {
    return (
      <div className="bg-white/80 rounded-xl p-8 text-center text-[#28071C]/50">
        Selecione um tenant para configurar permissões.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#7598CF] animate-spin" />
      </div>
    );
  }

  // Agrupa módulos por módulo pai (level='module') para exibição hierárquica
  const moduleGroups: { parent: ModuleRow; children: PermState[] }[] = [];
  const parentModules = modules.filter((m) => m.level === "module").sort((a, b) => a.order_index - b.order_index);

  for (const parent of parentModules) {
    const children = permissions
      .filter(
        (p) =>
          p.module_level !== "module" &&
          p.module_code.startsWith(parent.code + "_"),
      )
      .sort((a, b) => a.module_order - b.module_order);
    moduleGroups.push({ parent, children });
  }

  const parentPermMap = new Map(
    permissions.filter((p) => p.module_level === "module").map((p) => [p.module_id, p]),
  );

  return (
    <div className="space-y-6">
      {/* 1. Seleção de Usuário */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border-2 border-[#7598CF]/30 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <User className="w-6 h-6 text-[#7598CF]" />
          <h3 className="text-[#28071C] text-lg font-medium">
            Selecione o usuário para configurar permissões
          </h3>
          {hasChanges && (
            <div className="ml-auto flex items-center text-amber-600 text-sm">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Alterações não salvas
            </div>
          )}
        </div>

        <select
          value={selectedUserId}
          onChange={(e) => handleUserSelect(e.target.value)}
          className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-3 rounded-lg focus:outline-none focus:border-[#7598CF]"
        >
          <option value="">— Selecione um usuário —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
              {u.roles ? ` — ${u.roles.name}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Perfil-base (template de cargo) */}
      {selectedUserId && !loadingPerms && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border-2 border-[#7598CF]/30 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <Shield className="w-6 h-6 text-[#7598CF]" />
            <h3 className="text-[#28071C] text-lg font-medium">Perfil-base de partida</h3>
          </div>
          <p className="text-[#28071C]/60 text-sm mb-4">
            Selecione um cargo para pré-preencher a matriz com as permissões padrão desse perfil.
            Você pode ajustar individualmente antes de salvar.
          </p>
          <div className="flex flex-wrap gap-3">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => applyRoleTemplate(role.id)}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  selectedUser?.role_id === role.id
                    ? "border-[#7598CF] bg-[#7598CF]/10 text-[#28071C]"
                    : "border-[#28071C]/20 text-[#28071C]/70 hover:border-[#7598CF]/50"
                }`}
              >
                {role.name}
                {selectedUser?.role_id === role.id && (
                  <span className="ml-2 text-xs text-[#7598CF]">(cargo atual)</span>
                )}
              </button>
            ))}
            {roles.length === 0 && (
              <p className="text-[#28071C]/50 text-sm">
                Nenhum cargo cadastrado para este tenant.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 3. Matriz de Permissões */}
      {selectedUserId && loadingPerms && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#7598CF] animate-spin" />
        </div>
      )}

      {selectedUserId && !loadingPerms && permissions.length > 0 && (
        <>
          {/* Legenda */}
          <div className="flex items-center gap-6 px-2 text-sm text-[#28071C]/70">
            <div className="flex items-center gap-1"><Eye className="w-4 h-4 text-[#7598CF]" /> Visualizar</div>
            <div className="flex items-center gap-1"><Edit2 className="w-4 h-4 text-[#28071C]" /> Editar</div>
            <div className="flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-600" /> Aprovar</div>
            <div className="flex items-center gap-1 ml-auto">
              <Info className="w-4 h-4 text-amber-500" />
              <span>Amarelo = override individual (prevalece sobre o cargo)</span>
            </div>
          </div>

          {moduleGroups.map(({ parent, children }) => {
            const parentPerm = parentPermMap.get(parent.id);
            return (
              <div key={parent.id} className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-[#7598CF]/30 overflow-hidden shadow-sm">
                {/* Header do módulo pai */}
                <div
                  className="px-6 py-3 bg-[#28071C] flex items-center justify-between cursor-pointer"
                  onClick={() => parentPerm && toggle(parent.id, parentPerm.can_view ? "can_view" : "can_view")}
                >
                  <span className="text-white font-medium">{parent.name}</span>
                  <div className="flex items-center gap-4">
                    {parentPerm && (
                      <>
                        <PermToggle
                          label="Visualizar"
                          checked={parentPerm.can_view}
                          onChange={() => toggle(parent.id, "can_view")}
                          icon={<Eye className="w-3 h-3" />}
                          activeClass="bg-[#7598CF]"
                          isOverride={parentPerm.is_override}
                        />
                        <PermToggle
                          label="Editar"
                          checked={parentPerm.can_edit}
                          onChange={() => toggle(parent.id, "can_edit")}
                          icon={<Edit2 className="w-3 h-3" />}
                          activeClass="bg-white/30"
                          isOverride={parentPerm.is_override}
                        />
                        <PermToggle
                          label="Aprovar"
                          checked={parentPerm.can_approve}
                          onChange={() => toggle(parent.id, "can_approve")}
                          icon={<CheckCircle className="w-3 h-3" />}
                          activeClass="bg-green-500"
                          isOverride={parentPerm.is_override}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Seções/Cards filhos */}
                {children.length > 0 && (
                  <div className="divide-y divide-[#7598CF]/10">
                    {children.map((perm) => (
                      <div
                        key={perm.module_id}
                        className={`px-6 py-3 flex items-center justify-between hover:bg-[#7598CF]/5 transition-colors ${
                          perm.is_override ? "border-l-4 border-amber-400" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[perm.module_level] ?? LEVEL_COLORS.section}`}
                          >
                            {LEVEL_LABELS[perm.module_level] ?? perm.module_level}
                          </span>
                          <span className="text-[#28071C] text-sm">{perm.module_name}</span>
                          {perm.is_override && (
                            <span className="text-xs text-amber-600 font-medium">override</span>
                          )}
                        </div>

                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={perm.can_view}
                              onChange={() => toggle(perm.module_id, "can_view")}
                              className="w-4 h-4 rounded border-2 border-[#7598CF] text-[#7598CF] cursor-pointer"
                            />
                            <Eye className="w-4 h-4 text-[#7598CF]" />
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={perm.can_edit}
                              onChange={() => toggle(perm.module_id, "can_edit")}
                              className="w-4 h-4 rounded border-2 border-[#28071C] text-[#28071C] cursor-pointer"
                            />
                            <Edit2 className="w-4 h-4 text-[#28071C]" />
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={perm.can_approve}
                              onChange={() => toggle(perm.module_id, "can_approve")}
                              className="w-4 h-4 rounded border-2 border-green-600 text-green-600 cursor-pointer"
                            />
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Botão Salvar */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center space-x-2 bg-[#28071C] text-white px-8 py-3 rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              <span>Salvar Permissões de {selectedUser?.name}</span>
            </button>
          </div>
        </>
      )}

      {/* Estado vazio */}
      {!selectedUserId && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-12 border-2 border-[#7598CF]/30 text-center">
          <Shield className="w-16 h-16 text-[#7598CF]/40 mx-auto mb-4" />
          <p className="text-[#28071C]/60 text-lg">
            Selecione um usuário acima para configurar suas permissões
          </p>
          <p className="text-[#28071C]/40 text-sm mt-2">
            As permissões são configuradas individualmente, com um perfil-base como ponto de partida.
          </p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 right-8 bg-[#28071C] text-white px-6 py-4 rounded-lg shadow-xl z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

// Componente auxiliar para toggle no header do módulo
function PermToggle({
  label, checked, onChange, icon, activeClass, isOverride,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  activeClass: string;
  isOverride: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
        checked
          ? `${activeClass} text-white`
          : "bg-white/10 text-white/50"
      } ${isOverride && checked ? "ring-1 ring-amber-400" : ""}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
