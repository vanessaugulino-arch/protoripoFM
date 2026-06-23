import { useEffect, useState } from "react";
import {
  Plus, Edit, XCircle, Users, Loader2, Mail, Send,
  CheckCircle, Clock, UserX, Shield,
} from "lucide-react";
import {
  listUsers,
  updateUser,
  setUserStatus,
  inviteUser,
  listInvitations,
  revokeInvitation,
  listRoles,
  promoteToClientAdmin,
  type UserRow,
  type RoleRow,
} from "../../services/supabase/adminService";

interface Props {
  tenantId: string;
  tenantName: string;
  isSupport: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  invited: "Convidado",
  inactive: "Inativo",
};

const STATUS_CLASS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border border-green-300",
  invited: "bg-amber-100 text-amber-700 border border-amber-300",
  inactive: "bg-gray-200 text-gray-600 border border-gray-400",
};

export default function Admin_Users({ tenantId, tenantName, isSupport }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "invite">("users");

  // Formulário de edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [editSystemRole, setEditSystemRole] = useState<"client_admin" | "invited_user">("invited_user");

  // Formulário de convite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    loadAll();
  }, [tenantId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData, invData] = await Promise.all([
        listUsers(tenantId),
        listRoles(tenantId),
        listInvitations(tenantId),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      setInvitations(invData);
    } catch (err: any) {
      showToast("Erro ao carregar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleStartEdit = (user: UserRow) => {
    setEditingId(user.id);
    setEditName(user.name);
    setEditRoleId(user.role_id ?? "");
    setEditSystemRole(
      user.system_role === "client_admin" ? "client_admin" : "invited_user",
    );
    setTab("users");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateUser(editingId, {
        name: editName,
        role_id: editRoleId || null,
        system_role: editSystemRole,
      });
      if (editSystemRole === "client_admin") {
        await promoteToClientAdmin(editingId);
      }
      showToast("Usuário atualizado.");
      setEditingId(null);
      await loadAll();
    } catch (err: any) {
      showToast("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserRow) => {
    const next = user.status === "active" ? "inactive" : "active";
    try {
      await setUserStatus(user.id, next as any);
      showToast(`${user.name}: status alterado para ${STATUS_LABEL[next]}.`);
      await loadAll();
    } catch (err: any) {
      showToast("Erro: " + err.message);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) {
      showToast("Informe o e-mail para convidar.");
      return;
    }
    if (!inviteEmail.includes("@")) {
      showToast("E-mail inválido.");
      return;
    }
    setSaving(true);
    try {
      const { token } = await inviteUser(inviteEmail, tenantId, inviteRoleId || null);
      showToast(`Convite registrado para ${inviteEmail}. Token: ${token.slice(0, 8)}...`);
      setInviteEmail("");
      setInviteRoleId("");
      await loadAll();
    } catch (err: any) {
      showToast("Erro ao convidar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeInvitation = async (id: string, email: string) => {
    try {
      await revokeInvitation(id);
      showToast(`Convite de ${email} revogado.`);
      await loadAll();
    } catch (err: any) {
      showToast("Erro: " + err.message);
    }
  };

  if (!tenantId) {
    return (
      <div className="bg-white/80 rounded-xl p-8 text-center text-[#28071C]/50">
        Selecione um tenant para gerenciar usuários.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex space-x-2">
        <button
          onClick={() => setTab("users")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "users"
              ? "bg-[#28071C] text-white"
              : "bg-white/80 text-[#28071C] hover:bg-[#7598CF]/10 border border-[#7598CF]/30"
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Usuários ({users.length})
        </button>
        <button
          onClick={() => setTab("invite")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "invite"
              ? "bg-[#7598CF] text-white"
              : "bg-white/80 text-[#28071C] hover:bg-[#7598CF]/10 border border-[#7598CF]/30"
          }`}
        >
          <Mail className="w-4 h-4 inline mr-2" />
          Convidar usuário
        </button>
      </div>

      {/* TAB: Lista de Usuários */}
      {tab === "users" && (
        <>
          {/* Formulário de edição (inline quando editingId != null) */}
          {editingId && (
            <div className="bg-white/90 rounded-xl p-6 border-2 border-[#7598CF]/50 shadow-sm">
              <h3 className="text-[#28071C] font-medium mb-4">Editar Usuário</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-[#28071C] text-sm mb-1 block font-medium">Nome</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
                  />
                </div>
                <div>
                  <label className="text-[#28071C] text-sm mb-1 block font-medium">Cargo / Perfil</label>
                  <select
                    value={editRoleId}
                    onChange={(e) => setEditRoleId(e.target.value)}
                    className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
                  >
                    <option value="">Sem cargo</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[#28071C] text-sm mb-1 block font-medium flex items-center gap-1">
                    <Shield className="w-4 h-4" /> Papel no sistema
                  </label>
                  <select
                    value={editSystemRole}
                    onChange={(e) => setEditSystemRole(e.target.value as any)}
                    className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
                  >
                    <option value="invited_user">Usuário Convidado</option>
                    <option value="client_admin">Admin do Cliente</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-6 py-2 border-2 border-[#7598CF] text-[#7598CF] rounded-lg hover:bg-[#7598CF]/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex items-center space-x-2 bg-[#28071C] text-white px-6 py-2 rounded-lg hover:bg-[#28071C]/90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  <span>Salvar</span>
                </button>
              </div>
            </div>
          )}

          {/* Tabela de usuários */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-[#7598CF]/30 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-[#7598CF]/10 border-b-2 border-[#7598CF]/30">
              <h3 className="text-[#28071C] font-medium">
                Usuários — {tenantName}
              </h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-[#7598CF] animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-[#28071C]/50">
                Nenhum usuário neste tenant ainda.
                <br />
                <span className="text-sm">Use a aba "Convidar usuário" para adicionar.</span>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-[#7598CF]/5 border-b-2 border-[#7598CF]/20">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">Nome</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">E-mail</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">Cargo</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">Papel</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-[#28071C]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[#7598CF]/20 hover:bg-[#7598CF]/5 transition-colors"
                    >
                      <td className="px-6 py-4 text-[#28071C] font-medium">{user.name}</td>
                      <td className="px-6 py-4 text-[#28071C]/70 text-sm">{user.email}</td>
                      <td className="px-6 py-4">
                        {user.roles ? (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#7598CF]/20 text-[#7598CF] border border-[#7598CF]/30">
                            {user.roles.name}
                          </span>
                        ) : (
                          <span className="text-[#28071C]/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.system_role === "client_admin"
                              ? "bg-purple-100 text-purple-700 border border-purple-300"
                              : "bg-gray-100 text-gray-600 border border-gray-300"
                          }`}
                        >
                          {user.system_role === "client_admin" ? "Admin" : "Usuário"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_CLASS[user.status] ?? STATUS_CLASS.inactive}`}
                        >
                          {STATUS_LABEL[user.status] ?? user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleStartEdit(user)}
                            className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(user)}
                            className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                            title={user.status === "active" ? "Inativar" : "Ativar"}
                          >
                            {user.status === "active" ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Convites pendentes */}
          {invitations.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-amber-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-amber-50 border-b-2 border-amber-200">
                <h3 className="text-amber-800 font-medium flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Convites Pendentes ({invitations.length})
                </h3>
              </div>
              <table className="w-full">
                <thead className="bg-amber-50/50 border-b border-amber-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-amber-800">E-mail</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-amber-800">Cargo</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-amber-800">Expira em</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-amber-800">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="border-b border-amber-100">
                      <td className="px-6 py-3 text-[#28071C] text-sm">{inv.email}</td>
                      <td className="px-6 py-3 text-[#28071C]/70 text-sm">
                        {inv.roles?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-[#28071C]/60 text-sm">
                        {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => handleRevokeInvitation(inv.id, inv.email)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Revogar convite"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* TAB: Convidar Usuário */}
      {tab === "invite" && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border-2 border-[#7598CF]/30 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <Send className="w-6 h-6 text-[#7598CF]" />
            <div>
              <h3 className="text-[#28071C] text-lg font-medium">Convidar Novo Usuário</h3>
              <p className="text-[#28071C]/60 text-sm">
                O convite ficará pendente até que o usuário aceite e faça login.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-[#28071C] text-sm mb-1 block font-medium">
                E-mail do usuário *
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
                placeholder="usuario@empresa.com.br"
              />
            </div>
            <div>
              <label className="text-[#28071C] text-sm mb-1 block font-medium">
                Cargo / Perfil (opcional)
              </label>
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              >
                <option value="">Definir depois</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {roles.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm mb-4">
              Nenhum cargo cadastrado para este tenant. Crie cargos antes de convidar usuários.
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleInvite}
              disabled={saving || !inviteEmail}
              className="flex items-center space-x-2 bg-[#7598CF] text-white px-6 py-2 rounded-lg hover:bg-[#7598CF]/90 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Enviar Convite</span>
            </button>
          </div>
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
