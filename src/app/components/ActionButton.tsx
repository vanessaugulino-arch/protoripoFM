import { LucideIcon } from "lucide-react";

interface ActionButtonProps {
  id?: string; // Para naming convention (ex: btn_aplicar_metas, btn_aplicar_plano)
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "outline";
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export function ActionButton({
  id,
  icon: Icon,
  label,
  onClick,
  variant = "primary",
  disabled = false,
  loading = false,
  size = "md",
  fullWidth = false,
}: ActionButtonProps) {
  const baseClasses = "flex items-center justify-center font-medium rounded-lg transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variantClasses = {
    primary: "bg-[#28071C] text-white hover:bg-[#28071C]/90",
    secondary: "bg-[#7598CF] text-white hover:bg-[#7598CF]/90",
    outline: "bg-white text-[#28071C] border-2 border-[#28071C] hover:bg-[#E7E7E6]",
  };

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const widthClass = fullWidth ? "w-full" : "";

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass}`}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          {Icon && <Icon className="w-5 h-5 mr-2" />}
          {label}
        </>
      )}
    </button>
  );
}
