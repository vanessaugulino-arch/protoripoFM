import { useEffect, useState } from "react";
import { Plus, Edit, XCircle, Building2, Loader2, CheckCircle } from "lucide-react";
import {
  listTenants,
  createTenant,
  updateTenant,
  setTenantStatus,
  type TenantRow,
} from "../../services/supabase/adminService";

interface Props {
  tenantId: string;
  tenantName: string;
  isSupport: boolean;
}

const EMPTY_FORM = { name: "", cnpj: "", plan: "Beta", status: "active" };

export default function Admin_Clients({ isSupport }: Props) {
  const [clients, setClients] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupport) return;
    loadClients();
  }, [isSupport]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await listTenants();
      setClients(data);
    } catch (err: any) {
      showToast("Erro ao carregar clientes: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSaveClient = async () => {
    if (!formData.name) {
      showToast("Nome da empresa é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateTenant(editingId, {
          name: formData.name,
          cnpj: formData.cnpj || null,
        });
        showToast(`Cliente "${formData.name}" atualizado.`);
        setEditingId(null);
      } else {
        await createTenant(formData.name, formData.cnpj || null, null);
        showToast(`Cliente "${formData.name}" cadastrado.`);
      }
      setFormData(EMPTY_FORM);
      await loadClients();
    } catch (err: any) {
      showToast("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (client: TenantRow) => {
    setFormData({
      name: client.name,
      cnpj: client.cnpj ?? "",
      plan: client.plan_id ?? "Beta",
      status: client.status,
    });
    setEditingId(client.id);
  };

  const handleToggleStatus = async (client: TenantRow) => {
    const next = client.status === "active" ? "inactive" : "active";
    try {
      await setTenantStatus(client.id, next);
      showToast(
        `${client.name} ${next === "active" ? "ativado" : "inativado"}.`,
      );
      await loadClients();
    } catch (err: any) {
      showToast("Erro: " + err.message);
    }
  };

  if (!isSupport) {
    return (
      <div className="bg-white/80 rounded-xl p-8 text-center text-[#28071C]/50">
        Acesso restrito ao papel de Suporte.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Formulário */}
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
              CNPJ
            </label>
            <input
              type="text"
              value={formData.cnpj}
              onChange={(e) => handleInputChange("cnpj", e.target.value)}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF]"
              placeholder="00.000.000/0001-00"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          {editingId && (
            <button
              onClick={() => { setEditingId(null); setFormData(EMPTY_FORM); }}
              className="px-6 py-2 border-2 border-[#7598CF] text-[#7598CF] rounded-lg hover:bg-[#7598CF]/10 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSaveClient}
            disabled={saving}
            className="flex items-center space-x-2 bg-[#28071C] text-white px-6 py-2 rounded-lg hover:bg-[#28071C]/90 transition-colors disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            <span>{editingId ? "Atualizar" : "Salvar Cliente"}</span>
          </button>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-[#7598CF]/30 overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-[#7598CF]/10 border-b-2 border-[#7598CF]/30">
          <h3 className="text-[#28071C] font-medium">
            Clientes Cadastrados {!loading && `(${clients.length})`}
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#7598CF] animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="py-12 text-center text-[#28071C]/50">
            Nenhum cliente cadastrado ainda.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-[#7598CF]/5 border-b-2 border-[#7598CF]/20">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">Nome</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">CNPJ</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C]">Status</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-[#28071C]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-[#7598CF]/20 hover:bg-[#7598CF]/5 transition-colors"
                >
                  <td className="px-6 py-4 text-[#28071C] font-medium">{client.name}</td>
                  <td className="px-6 py-4 text-[#28071C]/70 font-mono text-sm">
                    {client.cnpj || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        client.status === "active"
                          ? "bg-green-100 text-green-700 border border-green-300"
                          : "bg-gray-200 text-gray-600 border border-gray-400"
                      }`}
                    >
                      {client.status === "active" ? "Ativo" : "Inativo"}
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
                        onClick={() => handleToggleStatus(client)}
                        className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                        title={client.status === "active" ? "Inativar" : "Ativar"}
                      >
                        {client.status === "active" ? (
                          <XCircle className="w-4 h-4" />
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 right-8 bg-[#28071C] text-white px-6 py-4 rounded-lg shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
