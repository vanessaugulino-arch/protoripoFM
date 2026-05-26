import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LogOut, Users, Shield, Building2, User, ChevronDown, ChevronUp } from "lucide-react";
import logoExtensiva from "../../imports/Logo_extensiva.png";
import Admin_Clients from "./Admin_Clients";
import Admin_Users from "./Admin_Users";
import Admin_Permissions from "./Admin_Permissions";

interface UserData {
  name: string;
  email: string;
  profile: string;
}

// Interfaces compartilhadas
export interface Client {
  id: number;
  name: string;
  cnpj: string;
  email: string;
  status: string;
  plan: string;
}

export interface SystemUser {
  id: number;
  name: string;
  email: string;
  tenant: string;
  role: string; // Cargo - campo texto livre
  status: string;
}

interface AdminCard {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<any>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [openSection, setOpenSection] = useState<number | null>(null);
  
  // Estado compartilhado para clientes e usuários
  const [clients, setClients] = useState<Client[]>([
    {
      id: 1,
      name: "XYZ Fashion",
      cnpj: "00.000.000/0001-00",
      email: "contato@xyzfashion.com.br",
      status: "Ativo",
      plan: "Beta"
    }
  ]);
  
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([
    {
      id: 1,
      name: "Beta User",
      email: "contato@thefashionoffice.com.br",
      tenant: "XYZ Fashion",
      role: "Gestor",
      status: "Ativo"
    }
  ]);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);

      // Não redireciona mais, apenas armazena o usuário
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const toggleSection = (id: number) => {
    setOpenSection(openSection === id ? null : id);
  };

  // Array de cards administrativos
  const adminCards: AdminCard[] = [
    {
      id: 1,
      title: "Gestão de Clientes (Tenants)",
      description: "Cadastrar, editar e excluir clientes",
      icon: Building2,
      component: (props: any) => <Admin_Clients {...props} clients={clients} setClients={setClients} />,
    },
    {
      id: 2,
      title: "Gestão de Usuários e Acessos",
      description: "Gerenciar usuários e seus acessos ao sistema",
      icon: Users,
      component: (props: any) => <Admin_Users {...props} clients={clients} users={systemUsers} setUsers={setSystemUsers} />,
    },
    {
      id: 3,
      title: "Matriz de Permissões e Perfis",
      description: "Configurar perfis e suas permissões",
      icon: Shield,
      component: (props: any) => <Admin_Permissions {...props} clients={clients} users={systemUsers} />,
    },
  ];

  // Filtra cards baseado no perfil do usuário
  const visibleCards = user?.profile === "Super Admin"
    ? adminCards
    : adminCards.filter(card => card.id !== 1);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* Top Bar */}
      <header className="bg-[#d0d0cf] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img src={logoExtensiva} alt="The Fashion Office" className="h-10" />
            <div className="h-8 w-px bg-[#28071C]/20"></div>
            <div className="flex items-center space-x-3">
              <Shield className="w-7 h-7 text-[#7598CF]" />
              <span className="text-[#28071C] text-xl">Fashion Mind | Admin Dashboard</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-[#28071C]">
              <User className="w-5 h-5" />
              <span>{user?.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-[#28071C] hover:opacity-70 transition-opacity"
              aria-label="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF] mb-8">
          <h2 className="text-[#28071C] text-xl mb-2">Painel de Administração</h2>
          <p className="text-[#28071C]/70 text-sm">Gerencie clientes, usuários e permissões do sistema</p>
        </div>

        {/* Admin Accordion List */}
        <div className="flex flex-col space-y-4">
          {visibleCards.map((card) => {
            const Icon = card.icon;
            const Component = card.component;
            const isOpen = openSection === card.id;

            return (
              <div key={card.id} className="bg-white/60 backdrop-blur-sm border-2 border-[#7598CF]/30 rounded-xl overflow-hidden">
                {/* Accordion Header - Barra Horizontal */}
                <button
                  onClick={() => toggleSection(card.id)}
                  className="w-full hover:bg-[#7598CF]/5 transition-colors px-6 py-5 flex items-center justify-between bg-[#ffffffb3]"
                >
                  <div className="flex items-center space-x-4">
                    <Icon className="w-6 h-6 text-[#7598CF]" />
                    <div className="text-left">
                      <h3 className="text-[#28071C] text-lg font-medium">{card.title}</h3>
                      <p className="text-[#28071C]/60 text-[15px] m-[0px] p-[0px]">{card.description}</p>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-6 h-6 text-[#7598CF]" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-[#7598CF]" />
                  )}
                </button>

                {/* Accordion Content */}
                {isOpen && (
                  <div className="bg-[#E7E7E6] p-6">
                    <Component />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}