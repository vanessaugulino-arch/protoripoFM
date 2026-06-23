import { ArrowLeft, LogOut, User, Users, Globe } from "lucide-react";
import { useNavigate } from "react-router";

interface DashboardHeaderProps {
  userName: string;
  userProfile: string;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  onLogout: () => void;
  children?: React.ReactNode;
  systemRole?: string;
}

export function DashboardHeader({
  userName,
  userProfile,
  title,
  subtitle,
  showBackButton = false,
  onBack,
  onLogout,
  children,
  systemRole,
}: DashboardHeaderProps) {
  const navigate = useNavigate();
  const activeTenantName = sessionStorage.getItem("activeTenantName") ?? "";
  const isSupport = systemRole === "support";
  const isClientAdmin = systemRole === "client_admin";

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-6 shadow-lg">
      {/* Banner de Suporte */}
      {isSupport && (
        <div className="bg-amber-500/90 -mx-6 -mt-6 mb-4 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-950 text-xs font-medium">
            <Globe className="w-3.5 h-3.5" />
            Modo Suporte — {activeTenantName}
          </div>
          <button
            onClick={() => navigate("/tenant-selector")}
            className="text-amber-950 text-xs underline hover:opacity-80"
          >
            Trocar cliente
          </button>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto">
        {/* Top row - Navigation and User */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            {showBackButton && (
              <button
                onClick={handleBack}
                className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
                aria-label="Voltar"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-[#F6F3AA] text-base font-medium">
              {title}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            {/* Botão de admin — visível apenas para client_admin */}
            {isClientAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-[#F6F3AA] rounded-lg transition-colors text-xs"
                title="Gerenciar usuários e permissões"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Gestão de usuários</span>
              </button>
            )}
            <div className="flex items-center space-x-2 text-[#F6F3AA]">
              <User className="w-4 h-4" />
              <div className="text-right">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs opacity-80">{userProfile}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
              aria-label="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Welcome/Subtitle Section */}
        {subtitle && (
          <div className="mb-4">
            <h2 className="text-[#F6F3AA] text-2xl font-bold mb-3">
              Bem-vindo, {userName}!
            </h2>
            <p className="text-[#F6F3AA] text-sm">
              {subtitle}
            </p>
          </div>
        )}

        {/* Additional content (like performance indicators) */}
        {children}
      </div>
    </header>
  );
}
