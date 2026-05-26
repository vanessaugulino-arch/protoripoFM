import { ArrowLeft, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router";

interface DashboardHeaderProps {
  userName: string;
  userProfile: string;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  onLogout: () => void;
  children?: React.ReactNode; // Para conteúdo adicional no header (ex: performance indicators)
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
}: DashboardHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-6 shadow-lg">
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
