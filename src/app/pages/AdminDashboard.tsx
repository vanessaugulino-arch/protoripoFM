import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  LogOut, Users, Shield, Building2, User,
  ChevronDown, ChevronUp, ArrowLeft, Globe,
} from "lucide-react";
import Admin_Clients from "./Admin_Clients";
import Admin_Users from "./Admin_Users";
import Admin_Permissions from "./Admin_Permissions";
import { listTenants, type TenantRow } from "../../services/supabase/adminService";
import { signOut } from "../../services/supabase/authService";
import type { CurrentUser } from "./Login";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [openSection, setOpenSection] = useState<number | null>(null);

  // Tenant selecionado pelo Suporte (para client_admin é sempre o próprio tenant)
  const [allTenants, setAllTenants] = useState<TenantRow[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string>("");
  const [activeTenantName, setActiveTenantName] = useState<string>("");
  const [loadingTenants, setLoadingTenants] = useState(false);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (!storedUser) {
      navigate("/");
      return;
    }

    const userData: CurrentUser = JSON.parse(storedUser);
    setUser(userData);

    // Usuário convidado não chega aqui
    if (userData.system_role === "invited_user") {
      navigate("/dashboard");
      return;
    }

    if (userData.system_role === "client_admin") {
      // Admin do cliente opera sempre no próprio tenant
      setActiveTenantId(userData.tenant_id);
      setActiveTenantName(userData.tenant_name);
    } else if (userData.system_role === "support") {
      // Suporte carrega lista de tenants para seleção
      setLoadingTenants(true);
      listTenants()
        .then((tenants) => {
          setAllTenants(tenants);
          if (tenants.length > 0) {
            setActiveTenantId(tenants[0].id);
            setActiveTenantName(tenants[0].name);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingTenants(false));
    }
  }, [navigate]);

  const handleLogout = async () => {
    try { await signOut(); } catch { /* ignora */ }
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const toggleSection = (id: number) => {
    setOpenSection(openSection === id ? null : id);
  };

  const handleTenantChange = (tenantId: string) => {
    const t = allTenants.find((t) => t.id === tenantId);
    setActiveTenantId(tenantId);
    setActiveTenantName(t?.name ?? "");
    setOpenSection(null); // fecha seção ao trocar tenant para evitar estado inconsistente
  };

  const isSupport = user?.system_role === "support";

  interface AdminCard {
    id: number;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    Component: React.ComponentType<{ tenantId: string; tenantName: string; isSupport: boolean }>;
    onlySupportRole?: boolean;
  }

  const adminCards: AdminCard[] = [
    {
      id: 1,
      title: "Gestão de Clientes (Tenants)",
      description: "Cadastrar, editar e gerenciar clientes no sistema",
      icon: Building2,
      Component: Admin_Clients,
      onlySupportRole: true,
    },
    {
      id: 2,
      title: "Gestão de Usuários e Acessos",
      description: "Gerenciar usuários, cargos e convites",
      icon: Users,
      Component: Admin_Users,
    },
    {
      id: 3,
      title: "Matriz de Permissões e Perfis",
      description: "Configurar permissões por usuário individual",
      icon: Shield,
      Component: Admin_Permissions,
    },
  ];

  const visibleCards = adminCards.filter(
    (card) => !card.onlySupportRole || isSupport,
  );

  if (!user) return null;

  const tenantReady = activeTenantId !== "";

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Admin</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">
                {isSupport ? "Painel de Suporte" : "Painel do Administrador"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Seletor de Tenant — visível apenas para Suporte */}
            {isSupport && (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                <Globe className="w-4 h-4 text-[#F6F3AA]" />
                <span className="text-[#F6F3AA]/70 text-xs mr-1">Tenant:</span>
                {loadingTenants ? (
                  <span className="text-[#F6F3AA] text-sm">Carregando...</span>
                ) : (
                  <select
                    value={activeTenantId}
                    onChange={(e) => handleTenantChange(e.target.value)}
                    className="bg-transparent text-[#F6F3AA] text-sm border-none outline-none cursor-pointer"
                    aria-label="Selecionar tenant ativo"
                  >
                    {allTenants.length === 0 && (
                      <option value="">Nenhum cliente cadastrado</option>
                    )}
                    {allTenants.map((t) => (
                      <option key={t.id} value={t.id} className="text-[#28071C] bg-white">
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Info do usuário logado */}
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <div className="text-right">
                <div className="text-sm leading-tight">{user.name}</div>
                {!isSupport && activeTenantName && (
                  <div className="text-[#F6F3AA]/60 text-xs leading-tight">{activeTenantName}</div>
                )}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
              aria-label="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Cabeçalho do painel */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF] mb-8">
          <h2 className="text-[#28071C] text-xl mb-1">
            {isSupport ? "Suporte — Visão Geral" : "Administração do Cliente"}
          </h2>
          <p className="text-[#28071C]/70 text-sm">
            {isSupport
              ? `Gerenciando: ${activeTenantName || "selecione um tenant acima"}`
              : `Gerencie usuários e permissões de ${activeTenantName}`}
          </p>
        </div>

        {/* Aviso se não há tenant selecionado (suporte sem clientes) */}
        {isSupport && !tenantReady && !loadingTenants && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-6 mb-6">
            <p className="font-medium">Nenhum cliente cadastrado ainda.</p>
            <p className="text-sm mt-1">Expanda "Gestão de Clientes" abaixo para cadastrar o primeiro cliente.</p>
          </div>
        )}

        {/* Accordion de seções admin */}
        <div className="flex flex-col space-y-4">
          {visibleCards.map((card) => {
            const Icon = card.icon;
            const isOpen = openSection === card.id;
            const canOpen = card.id === 1 || tenantReady;

            return (
              <div
                key={card.id}
                className="bg-white/60 backdrop-blur-sm border-2 border-[#7598CF]/30 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => canOpen && toggleSection(card.id)}
                  disabled={!canOpen}
                  className="w-full hover:bg-[#7598CF]/5 transition-colors px-6 py-5 flex items-center justify-between bg-[#ffffffb3] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center space-x-4">
                    <Icon className="w-6 h-6 text-[#7598CF]" />
                    <div className="text-left">
                      <h3 className="text-[#28071C] text-lg font-medium">{card.title}</h3>
                      <p className="text-[#28071C]/60 text-[15px] m-0 p-0">{card.description}</p>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-6 h-6 text-[#7598CF]" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-[#7598CF]" />
                  )}
                </button>

                {isOpen && (
                  <div className="bg-[#F2F2F2] p-6">
                    <card.Component
                      tenantId={activeTenantId}
                      tenantName={activeTenantName}
                      isSupport={isSupport}
                    />
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
