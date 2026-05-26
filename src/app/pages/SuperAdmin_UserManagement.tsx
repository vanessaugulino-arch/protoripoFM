import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Plus,
  Search,
  Mail,
  Shield,
  Building2,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Send,
} from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface ClientUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: "active" | "invited" | "inactive";
  invitedAt: string;
  lastAccess?: string;
}

export default function SuperAdmin_UserManagement() {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Mock client data
  const [clientName] = useState("Fashion Brand A");

  // Mock users data
  const [users, setUsers] = useState<ClientUser[]>([
    {
      id: "1",
      name: "Murilo Santos",
      email: "murilo@nexosee.com.br",
      department: "Diretoria",
      role: "CEO",
      status: "active",
      invitedAt: "2025-01-15",
      lastAccess: "2025-03-31",
    },
    {
      id: "2",
      name: "Renata Costa",
      email: "renata@nexosee.com.br",
      department: "Criativo",
      role: "Direção Criativa",
      status: "active",
      invitedAt: "2025-01-16",
      lastAccess: "2025-03-30",
    },
    {
      id: "3",
      name: "Carol Oliveira",
      email: "carol@nexosee.com.br",
      department: "Estilo",
      role: "Operacional",
      status: "active",
      invitedAt: "2025-01-17",
      lastAccess: "2025-03-31",
    },
  ]);

  // Novo usuário (formulário)
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    department: "",
    role: "Estilo",
  });

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);

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
    navigate("/superadmin/clients");
  };

  const inviteUser = () => {
    if (!newUser.name || !newUser.email || !newUser.department) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    const user: ClientUser = {
      id: Date.now().toString(),
      name: newUser.name,
      email: newUser.email,
      department: newUser.department,
      role: newUser.role,
      status: "invited",
      invitedAt: new Date().toISOString().split("T")[0],
    };

    setUsers([...users, user]);
    setShowInviteModal(false);
    setNewUser({
      name: "",
      email: "",
      department: "",
      role: "Estilo",
    });

    alert(`Convite enviado para ${newUser.email}`);
  };

  const deleteUser = (userId: string) => {
    if (
      confirm("Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.")
    ) {
      setUsers(users.filter((u) => u.id !== userId));
    }
  };

  const resendInvite = (userEmail: string) => {
    alert(`Convite reenviado para ${userEmail}`);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.department.toLowerCase().includes(searchTerm.toLowerCase())
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
              Fashion Mind | Gestão de Usuários - {clientName}
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
        {/* Container 1: Header com Info do Cliente */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Building2 className="w-8 h-8 text-[#7598CF] mr-4" />
              <div>
                <h2 className="text-[#28071C] text-2xl mb-1">{clientName}</h2>
                <p className="text-[#28071C]/60 text-sm">
                  Cliente ID: {clientId} • Plano: Enterprise
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                navigate(`/superadmin/client/${clientId}/permissions`)
              }
              className="flex items-center px-6 py-3 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-md"
            >
              <Shield className="w-5 h-5 mr-2" />
              Configurar Permissões
            </button>
          </div>
        </div>

        {/* Container 2: Header de Usuários e Busca */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[#28071C] text-2xl mb-1">
                Usuários Cadastrados
              </h2>
              <p className="text-[#28071C]/60 text-sm">
                Gerencie os usuários com acesso ao sistema
              </p>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md"
            >
              <Plus className="w-5 h-5 mr-2" />
              Convidar Usuário
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#28071C]/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, e-mail ou setor..."
              className="w-full bg-[#E7E7E6] rounded-lg pl-12 pr-4 py-3 text-[#28071C] placeholder:text-[#28071C]/40 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
            />
          </div>
        </div>

        {/* Container 3: Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Total de Usuários
              </span>
              <User className="w-5 h-5 text-[#7598CF]" />
            </div>
            <div className="text-3xl text-[#28071C]">{users.length}</div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Usuários Ativos
              </span>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl text-[#28071C]">
              {users.filter((u) => u.status === "active").length}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                Convites Pendentes
              </span>
              <Mail className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-3xl text-[#28071C]">
              {users.filter((u) => u.status === "invited").length}
            </div>
          </div>
        </div>

        {/* Container 4: Tabela de Usuários */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[#28071C]/20">
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Nome
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    E-mail
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Setor
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Perfil/Função
                  </th>
                  <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-4 px-4">
                    Último Acesso
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
                {filteredUsers.map((clientUser, index) => (
                  <tr
                    key={clientUser.id}
                    className={`border-b border-[#28071C]/10 ${
                      index % 2 === 0 ? "bg-white" : "bg-[#E7E7E6]/20"
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        <User className="w-5 h-5 text-[#7598CF] mr-2" />
                        <span className="text-[#28071C]">
                          {clientUser.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[#28071C]/70">
                      {clientUser.email}
                    </td>
                    <td className="py-4 px-4 text-[#28071C]">
                      {clientUser.department}
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-3 py-1 bg-[#7598CF]/10 text-[#7598CF] rounded-full text-sm">
                        {clientUser.role}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-[#28071C]/70">
                      {clientUser.lastAccess
                        ? new Date(clientUser.lastAccess).toLocaleDateString(
                            "pt-BR"
                          )
                        : "-"}
                    </td>
                    <td className="py-4 px-4">
                      {clientUser.status === "active" && (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span className="text-sm">Ativo</span>
                        </div>
                      )}
                      {clientUser.status === "invited" && (
                        <div className="flex items-center text-amber-600">
                          <Mail className="w-4 h-4 mr-1" />
                          <span className="text-sm">Convite Enviado</span>
                        </div>
                      )}
                      {clientUser.status === "inactive" && (
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
                              `/superadmin/client/${clientId}/user/${clientUser.id}/permissions`
                            )
                          }
                          className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                          title="Configurar Permissões"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
                          title="Editar Usuário"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {clientUser.status === "invited" && (
                          <button
                            onClick={() => resendInvite(clientUser.email)}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Reenviar Convite"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteUser(clientUser.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remover Usuário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <User className="w-12 h-12 text-[#28071C]/20 mx-auto mb-3" />
                <p className="text-[#28071C]/50 text-sm">
                  Nenhum usuário encontrado
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal: Convidar Usuário */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl max-w-2xl w-full">
            <div className="border-b border-[#28071C]/10 px-6 py-4">
              <h2 className="text-[#28071C] text-xl">Convidar Novo Usuário</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  placeholder="Ex: João Silva"
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                />
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  E-mail *
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  placeholder="joao@empresa.com"
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                />
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  Setor/Departamento *
                </label>
                <input
                  type="text"
                  value={newUser.department}
                  onChange={(e) =>
                    setNewUser({ ...newUser, department: e.target.value })
                  }
                  placeholder="Ex: Criação, Comercial, Diretoria"
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                />
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                  Perfil/Função Inicial
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value })
                  }
                  className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                >
                  <option value="CEO">CEO</option>
                  <option value="Direção Criativa">Direção Criativa</option>
                  <option value="Estilo">Estilo</option>
                  <option value="Gerente Comercial">Gerente Comercial</option>
                  <option value="Analista">Analista</option>
                  <option value="Visualizador">Visualizador</option>
                </select>
              </div>

              <div className="bg-[#7598CF]/10 rounded-lg p-4 text-sm text-[#28071C]/70">
                <p>
                  <strong>Importante:</strong> Um e-mail de convite será enviado
                  para o endereço fornecido. O usuário deverá aceitar o convite
                  e criar uma senha para acessar o sistema.
                </p>
              </div>
            </div>

            <div className="border-t border-[#28071C]/10 px-6 py-4 flex justify-end space-x-4">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-6 py-2 bg-white text-[#28071C] border-2 border-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={inviteUser}
                className="px-6 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all"
              >
                Enviar Convite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}