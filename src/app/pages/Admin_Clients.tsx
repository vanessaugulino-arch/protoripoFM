import { useState } from "react";
import { Plus, Edit, XCircle, Building2 } from "lucide-react";
import type { Client } from "./AdminDashboard";

interface Admin_ClientsProps {
  clients: Client[];
  setClients: (clients: Client[]) => void;
}

export default function Admin_Clients({ clients, setClients }: Admin_ClientsProps) {
  // Estado do formulário
  const [formData, setFormData] = useState({
    name: "",
    cnpj: "",
    email: "",
    plan: "Beta",
    status: "Ativo",
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  // Atualiza campos do formulário
  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  // Salva cliente (criar novo ou editar existente)
  const handleSaveClient = () => {
    if (!formData.name || !formData.cnpj || !formData.email) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (editingId) {
      // Modo edição
      setClients(
        clients.map((client) =>
          client.id === editingId
            ? { ...client, ...formData }
            : client
        )
      );
      setEditingId(null);
    } else {
      // Modo criação
      const newClient: Client = {
        id: Math.max(0, ...clients.map((c) => c.id)) + 1,
        ...formData,
      };
      setClients([...clients, newClient]);
    }

    // Limpa formulário
    setFormData({
      name: "",
      cnpj: "",
      email: "",
      plan: "Beta",
      status: "Ativo",
    });
  };

  // Edita cliente
  const handleEdit = (client: Client) => {
    setFormData({
      name: client.name,
      cnpj: client.cnpj,
      email: client.email,
      plan: client.plan,
      status: client.status,
    });
    setEditingId(client.id);
  };

  // Inativa cliente
  const handleInactivate = (clientId: number) => {
    setClients(
      clients.map((client) =>
        client.id === clientId
          ? { ...client, status: client.status === "Ativo" ? "Inativo" : "Ativo" }
          : client
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Formulário de Cadastro */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border-2 border-[#7598CF]/30 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <Building2 className="w-6 h-6 text-[#7598CF]" />
          <h3 className="text-[#28071C] text-lg font-medium">
            {editingId ? "Editar Cliente" : "Cadastrar Novo Cliente"}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Nome da Empresa *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="Ex: XYZ Fashion"
            />
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              CNPJ *
            </label>
            <input
              type="text"
              value={formData.cnpj}
              onChange={(e) => handleInputChange("cnpj", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="00.000.000/0001-00"
            />
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Email de Contato *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="contato@empresa.com.br"
            />
          </div>

          <div>
            <label className="text-[#28071C] text-sm mb-1 block font-medium">
              Plano
            </label>
            <select
              value={formData.plan}
              onChange={(e) => handleInputChange("plan", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
            >
              <option value="Beta">Beta</option>
              <option value="Standard">Standard</option>
              <option value="Enterprise">Enterprise</option>
            </select>
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
                  cnpj: "",
                  email: "",
                  plan: "Beta",
                  status: "Ativo",
                });
              }}
              className="px-6 py-2 border-2 border-[#7598CF] text-[#7598CF] rounded-lg hover:bg-[#7598CF]/10 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSaveClient}
            className="flex items-center space-x-2 bg-[#28071C] text-white px-6 py-2 rounded-lg hover:bg-[#28071C]/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>{editingId ? "Atualizar Cliente" : "Salvar Cliente"}</span>
          </button>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-[#7598CF]/30 overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-[#7598CF]/10 border-b-2 border-[#7598CF]/30">
          <h3 className="text-[#28071C] font-medium">Clientes Cadastrados</h3>
        </div>
        <table className="w-full">
          <thead className="bg-[#7598CF]/5 border-b-2 border-[#7598CF]/20">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                CNPJ
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Email
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">
                Plano
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
            {clients.map((client) => (
              <tr
                key={client.id}
                className="border-b border-[#7598CF]/20 hover:bg-[#7598CF]/5 transition-colors"
              >
                <td className="px-6 py-4 text-[#28071C]">{client.name}</td>
                <td className="px-6 py-4 text-[#28071C]/70">{client.cnpj}</td>
                <td className="px-6 py-4 text-[#28071C]/70">{client.email}</td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#7598CF]/20 text-[#7598CF] border border-[#7598CF]/30">
                    {client.plan}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      client.status === "Ativo"
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-gray-200 text-gray-600 border border-gray-400"
                    }`}
                  >
                    {client.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => handleEdit(client)}
                      className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleInactivate(client.id)}
                      className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                      title={client.status === "Ativo" ? "Inativar" : "Ativar"}
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
