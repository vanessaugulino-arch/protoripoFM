import { useState, useEffect } from "react";
import { Shield, Save } from "lucide-react";
import type { Client, SystemUser } from "./AdminDashboard";

interface Admin_PermissionsProps {
  clients: Client[];
  users: SystemUser[];
}

interface Permission {
  module: string;
  view: boolean;
  edit: boolean;
  approve: boolean;
}

// Módulos do sistema
const SYSTEM_MODULES = [
  "Módulo 1 — Planejamento Estratégico Ano Fiscal",
  "Módulo 2 — Planejamento de Metas por Canal",
  "Módulo 3 — Planejamento por Categorias",
  "Módulo 4 — Validação de Sazonalidade",
  "Módulo 5 — Plano de Sortimento 1",
  "Módulo 6 — Plano de Sortimento 2",
  "Configurações de Operação",
];

export default function Admin_Permissions({ clients, users }: Admin_PermissionsProps) {
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [showToast, setShowToast] = useState(false);

  // Atualiza lista de cargos disponíveis quando o tenant muda
  useEffect(() => {
    if (selectedTenant) {
      const roles = users
        .filter((user) => user.tenant === selectedTenant)
        .map((user) => user.role)
        .filter((role, index, self) => self.indexOf(role) === index); // Remove duplicatas
      setAvailableRoles(roles);
      setSelectedRole("");
      initializePermissions();
    } else {
      setAvailableRoles([]);
      setSelectedRole("");
      initializePermissions();
    }
  }, [selectedTenant, users]);

  // Carrega permissões do sessionStorage quando tenant e role são selecionados
  useEffect(() => {
    if (selectedTenant && selectedRole) {
      loadPermissions();
    } else {
      initializePermissions();
    }
  }, [selectedTenant, selectedRole]);

  // Inicializa matriz com todas as permissões desabilitadas
  const initializePermissions = () => {
    setPermissions(
      SYSTEM_MODULES.map((module) => ({
        module,
        view: false,
        edit: false,
        approve: false,
      }))
    );
  };

  // Carrega permissões do sessionStorage
  const loadPermissions = () => {
    const tenantSlug = selectedTenant.toLowerCase().replace(/\s+/g, "_");
    const roleSlug = selectedRole.toLowerCase().replace(/\s+/g, "_");
    const storageKey = `permissions_${tenantSlug}_${roleSlug}`;
    
    const storedPermissions = sessionStorage.getItem(storageKey);
    if (storedPermissions) {
      setPermissions(JSON.parse(storedPermissions));
    } else {
      initializePermissions();
    }
  };

  // Toggle de permissão individual
  const togglePermission = (index: number, type: "view" | "edit" | "approve") => {
    const newPermissions = [...permissions];
    newPermissions[index][type] = !newPermissions[index][type];
    setPermissions(newPermissions);
  };

  // Salva permissões no sessionStorage
  const handleSavePermissions = () => {
    if (!selectedTenant || !selectedRole) {
      alert("Por favor, selecione um Tenant e um Cargo antes de salvar.");
      return;
    }

    const tenantSlug = selectedTenant.toLowerCase().replace(/\s+/g, "_");
    const roleSlug = selectedRole.toLowerCase().replace(/\s+/g, "_");
    const storageKey = `permissions_${tenantSlug}_${roleSlug}`;
    
    sessionStorage.setItem(storageKey, JSON.stringify(permissions));
    
    // Exibe toast de confirmação
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Seletores de Tenant e Cargo */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border-2 border-[#7598CF]/30 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <Shield className="w-6 h-6 text-[#7598CF]" />
          <h3 className="text-[#28071C] text-lg font-medium">
            Matriz de Permissões por Cargo
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[#28071C] text-sm mb-2 block font-medium">
              1. Selecione o Tenant (Cliente):
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
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
            <label className="text-[#28071C] text-sm mb-2 block font-medium">
              2. Selecione o Cargo:
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              disabled={!selectedTenant || availableRoles.length === 0}
              className="w-full bg-white border-2 border-[#7598CF]/30 text-[#28071C] px-4 py-2 rounded-lg focus:outline-none focus:border-[#7598CF] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {!selectedTenant
                  ? "Selecione primeiro um tenant"
                  : availableRoles.length === 0
                  ? "Nenhum cargo cadastrado para este tenant"
                  : "Selecione um cargo"}
              </option>
              {availableRoles.map((role, index) => (
                <option key={index} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedTenant && selectedRole && (
          <div className="mt-4 p-3 bg-[#7598CF]/10 rounded-lg border border-[#7598CF]/30">
            <p className="text-[#28071C] text-sm">
              <span className="font-medium">Configurando permissões para:</span>{" "}
              <span className="text-[#7598CF] font-semibold">{selectedRole}</span> —{" "}
              <span className="text-[#7598CF] font-semibold">{selectedTenant}</span>
            </p>
          </div>
        )}
      </div>

      {/* Matriz de Permissões */}
      {selectedTenant && selectedRole && (
        <>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-[#7598CF]/30 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-[#7598CF]/10 border-b-2 border-[#7598CF]/30 flex items-center justify-between">
              <h3 className="text-[#28071C] font-medium">
                Matriz de Permissões — {selectedRole}
              </h3>
              <button
                onClick={handleSavePermissions}
                className="flex items-center space-x-2 bg-[#28071C] text-white px-4 py-2 rounded-lg hover:bg-[#28071C]/90 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Permissões</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#7598CF]/5 border-b-2 border-[#7598CF]/20">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[#28071C] min-w-[300px]">
                      Módulo
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-[#28071C] w-[120px]">
                      <div>Visualizar</div>
                      <div className="text-xs font-normal text-[#28071C]/60 mt-1">
                        Ver a tela
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-[#28071C] w-[120px]">
                      <div>Editar</div>
                      <div className="text-xs font-normal text-[#28071C]/60 mt-1">
                        Alterar campos
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-[#28071C] w-[120px]">
                      <div>Aprovar</div>
                      <div className="text-xs font-normal text-[#28071C]/60 mt-1">
                        Submeter/Aplicar
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission, index) => (
                    <tr
                      key={index}
                      className="border-b border-[#7598CF]/20 hover:bg-[#7598CF]/5 transition-colors"
                    >
                      <td className="px-6 py-4 text-[#28071C]">
                        {permission.module}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => togglePermission(index, "view")}
                          className={`w-12 h-12 rounded-lg transition-all ${
                            permission.view
                              ? "bg-green-100 text-green-700 border-2 border-green-400"
                              : "bg-gray-100 text-gray-400 border-2 border-gray-300"
                          }`}
                        >
                          {permission.view ? "✓" : "✕"}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => togglePermission(index, "edit")}
                          className={`w-12 h-12 rounded-lg transition-all ${
                            permission.edit
                              ? "bg-green-100 text-green-700 border-2 border-green-400"
                              : "bg-gray-100 text-gray-400 border-2 border-gray-300"
                          }`}
                        >
                          {permission.edit ? "✓" : "✕"}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => togglePermission(index, "approve")}
                          className={`w-12 h-12 rounded-lg transition-all ${
                            permission.approve
                              ? "bg-green-100 text-green-700 border-2 border-green-400"
                              : "bg-gray-100 text-gray-400 border-2 border-gray-300"
                          }`}
                        >
                          {permission.approve ? "✓" : "✕"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Botão Salvar Inferior */}
          <div className="flex justify-end">
            <button
              onClick={handleSavePermissions}
              className="flex items-center space-x-2 bg-[#28071C] text-white px-6 py-3 rounded-lg hover:bg-[#28071C]/90 transition-colors shadow-md"
            >
              <Save className="w-5 h-5" />
              <span>Salvar Permissões</span>
            </button>
          </div>
        </>
      )}

      {/* Mensagem quando nada está selecionado */}
      {(!selectedTenant || !selectedRole) && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-12 border-2 border-[#7598CF]/30 text-center">
          <Shield className="w-16 h-16 text-[#7598CF]/40 mx-auto mb-4" />
          <p className="text-[#28071C]/60 text-lg">
            Selecione um Tenant e um Cargo acima para configurar as permissões
          </p>
        </div>
      )}

      {/* Toast de Confirmação */}
      {showToast && (
        <div className="fixed bottom-8 right-8 bg-green-600 text-white px-6 py-4 rounded-lg shadow-xl animate-fade-in">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
              <span className="text-green-600 text-lg">✓</span>
            </div>
            <div>
              <p className="font-medium">Permissões salvas com sucesso!</p>
              <p className="text-sm opacity-90">
                {selectedRole} — {selectedTenant}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
