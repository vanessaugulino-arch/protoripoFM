import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Plus,
  Search,
  Edit,
  Power,
  Building2,
  CheckCircle,
  XCircle,
  Users,
  Shield,
} from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface Client {
  id: string;
  brandName: string;
  cnpj: string;
  plan: string;
  status: "active" | "inactive";
  createdAt: string;
  usersCount: number;
}

export default function SuperAdmin_ClientManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Mock data - será substituído por dados reais do backend
  const [clients, setClients] = useState<Client[]>([
    {
      id: "1",
      brandName: "Fashion Brand A",
      cnpj: "12.345.678/0001-90",
      plan: "Enterprise",
      status: "active",
      createdAt: "2025-01-15",
      usersCount: 12,
    },
    {
      id: "2",
      brandName: "Moda Style B",
      cnpj: "98.765.432/0001-10",
      plan: "Professional",
      status: "active",
      createdAt: "2025-02-20",
      usersCount: 5,
    },
    {
      id: "3",
      brandName: "Boutique C",
      cnpj: "11.222.333/0001-44",
      plan: "Starter",
      status: "inactive",
      createdAt: "2024-11-10",
      usersCount: 3,
    },
  ]);

  // Novo cliente (formulário)
  const [newClient, setNewClient] = useState({
    brandName: "",
    cnpj: "",
    plan: "Professional",
    status: "active" as "active" | "inactive",
  });

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);

      // Verificar se é Super Admin
      if (userData.profile !== "Super Admin") {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  const toggleClientStatus = (clientId: string) => {
    setClients(
      clients.map((client) =>
        client.id === clientId
          ? {
              ...client,
              status: client.status === "active" ? "inactive" : "active",
            }
          : client
      )
    );
  };

  const createNewClient = () => {
    if (!newClient.brandName || !newClient.cnpj) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    const client: Client = {
      id: Date.now().toString(),
      brandName: newClient.brandName,
      cnpj: newClient.cnpj,
      plan: newClient.plan,
      status: newClient.status,
      createdAt: new Date().toISOString().split("T")[0],
      usersCount: 0,
    };

    setClients([...clients, client]);
    setShowNewClientModal(false);
    setNewClient({
      brandName: "",
      cnpj: "",
      plan: "Professional",
      status: "active",
    });
  };

  const filteredClients = clients.filter(
    (client) =>
      client.brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.cnpj.includes(searchTerm)
  );

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* Topbar */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-[#F6F3AA] text-xl">
              Fashion Mind | Gestão de Clientes (Tenants)
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-[#F6F3AA]">
              <Shield className="w-5 h-5" />
              <span>{user.name} - Super Admin</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Container 1: Header e Busca */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <Building2 className="w-6 h-6 text-[#28071C] mr-3" />
              <div>
                <h2 className="text-[#28071C] text-2xl mb-1">
                  Clientes Cadastrados
                </h2>
                <p className="text-[#28071C]/60 text-sm">
                  Gerenciamento de marcas e tenants do sistema
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowNewClientModal(true)}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md"
            >
              <Plus className="w-5 h-5 mr-2" />
              Novo Cliente
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#28071C]/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome da marca ou CNPJ..."
              className="w-full bg-[#E7E7E6] rounded-lg pl-12 pr-4 py-3 text-[#28071C] placeholder:text-[#28071C]/40 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
            />
          </div>
        </div>

        {/* Container 2: Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Total de Clientes
              </span>
              <Building2 className="w-5 h-5 text-[#7598CF]" />
            </div>
            <div className="text-3xl text-[#28071C]">{clients.length}</div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Clientes Ativos
              </span>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl text-[#28071C]">
              {clients.filter((c) => c.status === "active").length}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Clientes Inativos
              </span>
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-3xl text-[#28071C]">
              {clients.filter((c) => c.status === "inactive").length}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Total de Usuários
              </span>
              <Users className="w-5 h-5 text-[#7598CF]" />
            </div>
            <div className="text-3xl text-[#28071C]">
              {clients.reduce((sum, c) => sum + c.usersCount, 0)}
            </div>
          </div>
        </div>

        {/* Container 3: Tabela de Clientes */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[#28071C]/20">
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Nome da Marca
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    CNPJ
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Plano Assinado
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Usuários
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Data Cadastro
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Status
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client, index) => (
                  <tr
                    key={client.id}
                    className={`border-b border-[#28071C]/10 ${
                      index % 2 === 0 ? "bg-white" : "bg-[#E7E7E6]/20"
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        <Building2 className="w-5 h-5 text-[#7598CF] mr-2" />
                        <span className="text-[#28071C]">
                          {client.brandName}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[#28071C]/70">
                      {client.cnpj}
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-3 py-1 bg-[#7598CF]/10 text-[#7598CF] rounded-full text-sm">
                        {client.plan}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-[#28071C]">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 text-[#28071C]/70 mr-1" />
                        {client.usersCount}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[#28071C]/70">
                      {new Date(client.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-4 px-4">
                      {client.status === "active" ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span className="text-sm">Ativo</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600">
                          <XCircle className="w-4 h-4 mr-1" />
                          <span className="text-sm">Inativo</span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() =>
                            navigate(
                              `/superadmin/client/${client.id}/users`
                            )
                          }
                          className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                          title="Gerenciar Usuários"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            navigate(
                              `/superadmin/client/${client.id}/edit`
                            )
                          }
                          className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                          title="Editar Cliente"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleClientStatus(client.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            client.status === "active"
                              ? "text-red-600 hover:bg-red-50"
                              : "text-green-600 hover:bg-green-50"
                          }`}
                          title={
                            client.status === "active"
                              ? "Suspender Cliente"
                              : "Ativar Cliente"
                          }
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredClients.length === 0 && (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-[#28071C]/20 mx-auto mb-3" />
                <p className="text-[#28071C]/50 text-sm">
                  Nenhum cliente encontrado
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal: Novo Cliente */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl max-w-2xl w-full">
            <div className="border-b border-[#28071C]/10 px-6 py-4">
              <h2 className="text-[#28071C] text-xl">Cadastrar Novo Cliente</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  Nome da Marca *
                </label>
                <input
                  type="text"
                  value={newClient.brandName}
                  onChange={(e) =>
                    setNewClient({ ...newClient, brandName: e.target.value })
                  }
                  placeholder="Ex: Fashion Brand"
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                />
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  CNPJ *
                </label>
                <input
                  type="text"
                  value={newClient.cnpj}
                  onChange={(e) =>
                    setNewClient({ ...newClient, cnpj: e.target.value })
                  }
                  placeholder="00.000.000/0000-00"
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                />
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  Plano Assinado
                </label>
                <select
                  value={newClient.plan}
                  onChange={(e) =>
                    setNewClient({ ...newClient, plan: e.target.value })
                  }
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                >
                  <option value="Starter">Starter</option>
                  <option value="Professional">Professional</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  Status Inicial
                </label>
                <select
                  value={newClient.status}
                  onChange={(e) =>
                    setNewClient({
                      ...newClient,
                      status: e.target.value as "active" | "inactive",
                    })
                  }
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>

            <div className="border-t border-[#28071C]/10 px-6 py-4 flex justify-end space-x-4">
              <button
                onClick={() => setShowNewClientModal(false)}
                className="px-6 py-2 bg-white text-[#28071C] border-2 border-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={createNewClient}
                className="px-6 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all"
              >
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
