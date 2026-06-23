import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  LogOut,
  Shield,
  Building2,
  User,
  Eye,
  Edit,
  CheckCircle,
  Save,
  AlertTriangle,
} from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface Module {
  id: string;
  name: string;
  description: string;
  category: "planning" | "tracking" | "closure";
}

interface Permission {
  moduleId: string;
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
}

interface UserPermissionConfig {
  userId: string;
  userName: string;
  userEmail: string;
  globalProfile: string;
  permissions: Permission[];
}

const modules: Module[] = [
  // Planejamento
  {
    id: "strategic_planning",
    name: "Planejamento Estratégico",
    description: "Definição de metas macro e OTB",
    category: "planning",
  },
  {
    id: "goal_breakdown",
    name: "Quebra de Metas por Grupo",
    description: "Desdobramento tático por grupos de produto",
    category: "planning",
  },
  {
    id: "collection_planning",
    name: "Planejamento de Coleção",
    description: "Temas, looks e mix de produtos",
    category: "planning",
  },
  {
    id: "product_mix",
    name: "Estrutura do Mix de Produtos",
    description: "Categorias e itens detalhados",
    category: "planning",
  },
  // Acompanhamento
  {
    id: "collection_tracking_creative",
    name: "Acompanhamento de Coleção (Dir. Criativa)",
    description: "Visão tática do desenvolvimento",
    category: "tracking",
  },
  {
    id: "collection_tracking_style",
    name: "Acompanhamento de Coleção (Estilo)",
    description: "Visão operacional do desenvolvimento",
    category: "tracking",
  },
  // Fechamento de Ciclo
  {
    id: "markdown_simulator",
    name: "Simulador de Markdown",
    description: "Cálculos de promoções e descontos",
    category: "closure",
  },
  {
    id: "cycle_closing",
    name: "Fechamento de Ciclo e Promoções",
    description: "Consolidação e análise de resultados",
    category: "closure",
  },
];

const globalProfiles = [
  { id: "ceo", name: "CEO", description: "Acesso total com poder de aprovação estratégica" },
  { id: "creative_director", name: "Direção Criativa", description: "Aprovação tática e gestão de coleções" },
  { id: "style", name: "Estilo", description: "Execução operacional e desenvolvimento" },
  { id: "commercial", name: "Comercial", description: "Visualização e análises comerciais" },
  { id: "analyst", name: "Analista", description: "Visualização e suporte analítico" },
  { id: "viewer", name: "Visualizador", description: "Apenas visualização sem edição" },
];

export default function SuperAdmin_PermissionMatrix() {
  const navigate = useNavigate();
  const { clientId, userId } = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");

  // Mock data
  const [clientName] = useState("Fashion Brand A");
  const [clientUsers] = useState([
    { id: "1", name: "Murilo Santos", email: "murilo@nexosee.com.br" },
    { id: "2", name: "Renata Costa", email: "renata@nexosee.com.br" },
    { id: "3", name: "Carol Oliveira", email: "carol@nexosee.com.br" },
  ]);

  const [config, setConfig] = useState<UserPermissionConfig>({
    userId: "2",
    userName: "Renata Costa",
    userEmail: "renata@nexosee.com.br",
    globalProfile: "creative_director",
    permissions: [],
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

    // Carregar permissões de Renata automaticamente
    loadUserPermissions("2");
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (
        !confirm(
          "Você tem alterações não salvas. Deseja realmente sair sem salvar?"
        )
      ) {
        return;
      }
    }
    navigate(`/superadmin/client/${clientId}/users`);
  };

  const loadUserPermissions = (userId: string) => {
    const selectedUserData = clientUsers.find((u) => u.id === userId);
    if (selectedUserData) {
      setSelectedUser(userId);

      // Aqui seria carregado do backend
      // Por enquanto, definindo permissões padrão baseadas no perfil
      const defaultPermissions = getDefaultPermissionsByProfile("creative_director");

      setConfig({
        userId: selectedUserData.id,
        userName: selectedUserData.name,
        userEmail: selectedUserData.email,
        globalProfile: "creative_director",
        permissions: defaultPermissions,
      });
    }
  };

  const getDefaultPermissionsByProfile = (profile: string): Permission[] => {
    const permissions = modules.map((m) => {
      const permission: Permission = {
        moduleId: m.id,
        canView: false,
        canEdit: false,
        canApprove: false,
      };

      // CEO - Acesso completo
      if (profile === "ceo") {
        permission.canView = true;
        permission.canEdit = true;
        permission.canApprove = true;
      }
      // Direção Criativa (Renata)
      else if (profile === "creative_director") {
        // Planejamento Estratégico: apenas Visualizar
        if (m.id === "strategic_planning") {
          permission.canView = true;
        }
        // Outros módulos de Planejamento e Acompanhamento: Visualizar, Editar e Aprovar
        else if (m.category === "planning" || m.category === "tracking") {
          permission.canView = true;
          permission.canEdit = true;
          permission.canApprove = true;
        }
        // Fechamento: sem acesso
      }
      // Estilo
      else if (profile === "style") {
        if (m.category === "planning" || m.category === "tracking") {
          permission.canView = true;
          if (
            m.id === "collection_planning" ||
            m.id === "product_mix" ||
            m.id === "collection_tracking_style"
          ) {
            permission.canEdit = true;
          }
        }
      }
      // Visualizadores
      else if (profile === "viewer" || profile === "analyst") {
        permission.canView = true;
      }

      return permission;
    });

    return permissions;
  };

  const handleUserSelect = (userId: string) => {
    if (hasUnsavedChanges) {
      if (
        !confirm(
          "Você tem alterações não salvas. Deseja realmente trocar de usuário?"
        )
      ) {
        return;
      }
    }
    loadUserPermissions(userId);
    setHasUnsavedChanges(false);
  };

  const handleGlobalProfileChange = (profile: string) => {
    setConfig({
      ...config,
      globalProfile: profile,
      permissions: getDefaultPermissionsByProfile(profile),
    });
    setHasUnsavedChanges(true);
  };

  const togglePermission = (
    moduleId: string,
    permissionType: "canView" | "canEdit" | "canApprove"
  ) => {
    setConfig({
      ...config,
      permissions: config.permissions.map((p) => {
        if (p.moduleId === moduleId) {
          const updated = { ...p };

          // Lógica de dependência: Editar requer Visualizar, Aprovar requer Editar
          if (permissionType === "canView") {
            updated.canView = !p.canView;
            if (!updated.canView) {
              updated.canEdit = false;
              updated.canApprove = false;
            }
          } else if (permissionType === "canEdit") {
            updated.canEdit = !p.canEdit;
            if (updated.canEdit) {
              updated.canView = true;
            } else {
              updated.canApprove = false;
            }
          } else if (permissionType === "canApprove") {
            updated.canApprove = !p.canApprove;
            if (updated.canApprove) {
              updated.canView = true;
              updated.canEdit = true;
            }
          }

          return updated;
        }
        return p;
      }),
    });
    setHasUnsavedChanges(true);
  };

  const savePermissions = () => {
    // Aqui seria enviado para o backend
    console.log("Salvando permissões:", config);
    alert(`Permissões salvas com sucesso para ${config.userName}!`);
    setHasUnsavedChanges(false);
  };

  const getPermissionForModule = (moduleId: string): Permission => {
    return (
      config.permissions.find((p) => p.moduleId === moduleId) || {
        moduleId,
        canView: false,
        canEdit: false,
        canApprove: false,
      }
    );
  };

  const getCategoryName = (category: string): string => {
    const names: Record<string, string> = {
      planning: "Módulo de Planejamento",
      tracking: "Módulo de Acompanhamento",
      closure: "Módulo de Fechamento de Ciclo",
    };
    return names[category] || category;
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {/* Topbar */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Super Admin</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Matriz de Permissões</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
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
        {/* Container 1: Info do Cliente */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="flex items-center">
            <Building2 className="w-8 h-8 text-[#7598CF] mr-4" />
            <div>
              <h2 className="text-[#28071C] text-2xl mb-1">{clientName}</h2>
              <p className="text-[#28071C]/60 text-sm">
                Configuração de permissões por usuário
              </p>
            </div>
          </div>
        </div>

        {/* Container 2: Seleção de Usuário */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <User className="w-6 h-6 text-[#28071C] mr-3" />
              <h3 className="text-[#28071C] text-xl">
                Configurando permissões para:
              </h3>
            </div>
            {hasUnsavedChanges && (
              <div className="flex items-center text-amber-600 text-sm">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Alterações não salvas
              </div>
            )}
          </div>

          <select
            value={selectedUser}
            onChange={(e) => handleUserSelect(e.target.value)}
            className="w-full bg-[#F2F2F2] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
          >
            <option value="">Selecione um usuário...</option>
            {clientUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {/* Container 3: Perfil Global */}
        {selectedUser && (
          <>
            <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-l-4 border-[#F6F3AA]">
              <h3 className="text-[#28071C] text-xl mb-4">
                Atribuição de Perfil Global
              </h3>
              <p className="text-[#28071C]/60 text-sm mb-6">
                Selecione um perfil base. Você pode personalizar as permissões
                específicas abaixo.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {globalProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleGlobalProfileChange(profile.id)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      config.globalProfile === profile.id
                        ? "border-[#7598CF] bg-[#7598CF]/10"
                        : "border-[#28071C]/20 hover:border-[#7598CF]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[#28071C]">{profile.name}</span>
                      {config.globalProfile === profile.id && (
                        <CheckCircle className="w-5 h-5 text-[#7598CF]" />
                      )}
                    </div>
                    <p className="text-[#28071C]/60 text-xs">
                      {profile.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Container 4: Matriz de Permissões */}
            <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[#28071C] text-xl mb-1">
                    Matriz de Permissões por Módulo
                  </h3>
                  <p className="text-[#28071C]/60 text-sm">
                    Defina permissões granulares para cada módulo do sistema
                  </p>
                </div>
                <div className="flex items-center space-x-6 text-sm">
                  <div className="flex items-center">
                    <Eye className="w-4 h-4 text-[#7598CF] mr-1" />
                    <span className="text-[#28071C]/70">Visualizar</span>
                  </div>
                  <div className="flex items-center">
                    <Edit className="w-4 h-4 text-[#28071C] mr-1" />
                    <span className="text-[#28071C]/70">Editar</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-green-600 mr-1" />
                    <span className="text-[#28071C]/70">Aprovar</span>
                  </div>
                </div>
              </div>

              {["planning", "tracking", "closure"].map((category) => (
                <div key={category} className="mb-8 last:mb-0">
                  <h4 className="text-[#28071C] text-lg mb-4 pb-2 border-b-2 border-[#7598CF]/30">
                    {getCategoryName(category)}
                  </h4>

                  <div className="space-y-3">
                    {modules
                      .filter((m) => m.category === category)
                      .map((module) => {
                        const permission = getPermissionForModule(module.id);
                        return (
                          <div
                            key={module.id}
                            className="flex items-center justify-between p-4 bg-[#F2F2F2]/30 rounded-lg hover:bg-[#F2F2F2]/50 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="text-[#28071C] mb-1">
                                {module.name}
                              </div>
                              <div className="text-[#28071C]/60 text-xs">
                                {module.description}
                              </div>
                            </div>

                            <div className="flex items-center space-x-8">
                              {/* Visualizar */}
                              <label className="flex items-center cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={permission.canView}
                                  onChange={() =>
                                    togglePermission(module.id, "canView")
                                  }
                                  className="w-5 h-5 rounded border-2 border-[#7598CF] text-[#7598CF] focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                                />
                                <Eye className="w-4 h-4 text-[#7598CF] ml-2 group-hover:scale-110 transition-transform" />
                              </label>

                              {/* Editar */}
                              <label className="flex items-center cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={permission.canEdit}
                                  onChange={() =>
                                    togglePermission(module.id, "canEdit")
                                  }
                                  className="w-5 h-5 rounded border-2 border-[#28071C] text-[#28071C] focus:ring-2 focus:ring-[#28071C]/50 cursor-pointer"
                                />
                                <Edit className="w-4 h-4 text-[#28071C] ml-2 group-hover:scale-110 transition-transform" />
                              </label>

                              {/* Aprovar */}
                              <label className="flex items-center cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={permission.canApprove}
                                  onChange={() =>
                                    togglePermission(module.id, "canApprove")
                                  }
                                  className="w-5 h-5 rounded border-2 border-green-600 text-green-600 focus:ring-2 focus:ring-green-600/50 cursor-pointer"
                                />
                                <CheckCircle className="w-4 h-4 text-green-600 ml-2 group-hover:scale-110 transition-transform" />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            {/* Botão de Salvamento */}
            <div className="flex justify-end">
              <button
                onClick={savePermissions}
                disabled={!hasUnsavedChanges}
                className="flex items-center px-8 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-5 h-5 mr-2" />
                Salvar Permissões
              </button>
            </div>
          </>
        )}

        {!selectedUser && (
          <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
            <Shield className="w-16 h-16 text-[#28071C]/20 mx-auto mb-4" />
            <p className="text-[#28071C]/50 text-lg">
              Selecione um usuário acima para configurar suas permissões
            </p>
          </div>
        )}
      </main>
    </div>
  );
}