import { useState } from "react";
import { Plus, Edit, XCircle, Users } from "lucide-react";
import type { Client, SystemUser } from "./AdminDashboard";

interface Admin_UsersProps {
  clients: Client[];
  users: SystemUser[];
  setUsers: (users: SystemUser[]) => void;
}

export default function Admin_Users({ clients, users, setUsers }: Admin_UsersProps) {
  // Estado do formulário
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    tenant: "",
    role: "", // Cargo - campo texto livre
    status: "Ativo",
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  // Atualiza campos do formulário
  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  // Salva usuário (criar novo ou editar existente)
  const handleSaveUser = () => {
    if (!formData.name || !formData.email || !formData.tenant || !formData.role) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (editingId) {
      // Modo edição
      setUsers(
        users.map((user) =>
          user.id === editingId
            ? { ...user, ...formData }
            : user
        )
      );
      setEditingId(null);
    } else {
      // Modo criação
      const newUser: SystemUser = {
        id: Math.max(0, ...users.map((u) => u.id)) + 1,
        ...formData,
      };
      setUsers([...users, newUser]);
    }

    // Limpa formulário
    setFormData({
      name: "",
      email: "",
      tenant: "",
      role: "",
      status: "Ativo",
    });
  };

  // Edita usuário
  const handleEdit = (user: SystemUser) => {
    setFormData({
      name: user.name,
      email: user.email,
      tenant: user.tenant,
      role: user.role,
      status: user.status,
    });
    setEditingId(user.id);
  };

  // Inativa usuário
  const handleInactivate = (userId: number) => {
    setUsers(
      users.map((user) =>
        user.id === userId
          ? { ...user, status: user.status === "Ativo" ? "Inativo" : "Ativo" }
          : user
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Formulário de Cadastro */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border-2 border-[#7598CF]/30 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <Users className="w-6 h-6 text-[#7598CF]" />
          <h3 className="text-[#28071C] text-lg font-medium">
            {editingId ? "Editar Usuário" : "Cadastrar Novo Usuário"}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Nome *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="Ex: Beta User"
            />
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="usuario@empresa.com.br"
            />
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Tenant (Cliente) *
            </label>
            <select
              value={formData.tenant}
              onChange={(e) => handleInputChange("tenant", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
            >
              <option value="">Selecione um cliente</option>
              {clients
                .filter((client) => client.status === "Ativo")
                .map((client) => (
                  <option key={client.id} value={client.name}>
                    {client.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Cargo *
            </label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => handleInputChange("role", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="Ex: Gestor, Comprador, Analista de Estilo"
            />
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleInputChange("status", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
            >
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  name: "",
                  email: "",
                  tenant: "",
                  role: "",
                  status: "Ativo",
                });
              }}
              className="px-6 py-2 border-2 border-[#7598CF] text-[#7598CF] rounded-lg hover:bg-[#7598CF]/10 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSaveUser}
            className="flex items-center space-x-2 bg-[#28071C] text-white px-6 py-2 rounded-lg hover:bg-[#28071C]/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>{editingId ? "Atualizar Usuário" : "Criar Usuário"}</span>
          </button>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-[#7598CF]/30 overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-[#7598CF]/10 border-b-2 border-[#7598CF]/30">
          <h3 className="text-[#28071C] font-medium">Usuários Cadastrados</h3>
        </div>
        <table className="w-full">
          <thead className="bg-[#7598CF]/5 border-b-2 border-[#7598CF]/20">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Email
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Tenant
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Cargo
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Status
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-[#28071C]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-[#7598CF]/20 hover:bg-[#7598CF]/5 transition-colors"
              >
                <td className="px-6 py-4 text-[#28071C]">{user.name}</td>
                <td className="px-6 py-4 text-[#28071C]/70">{user.email}</td>
                <td className="px-6 py-4 text-[#28071C]/70">{user.tenant}</td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#7598CF]/20 text-[#7598CF] border border-[#7598CF]/30">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      user.status === "Ativo"
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-gray-200 text-gray-600 border border-gray-400"
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleInactivate(user.id)}
                      className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                      title={user.status === "Ativo" ? "Inativar" : "Ativar"}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
