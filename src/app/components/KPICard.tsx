import { LucideIcon } from "lucide-react";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}

export function KPICard({
  icon: Icon,
  label,
  value,
  subtitle,
  subtitleColor = "text-[#28071C]/60",
  valuePrefix = "",
  valueSuffix = "",
}: KPICardProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center space-x-2 mb-2">
        <Icon className="w-5 h-5 text-[#28071C]/70" />
        <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className="text-[#28071C] text-3xl font-bold">
        {valuePrefix}{value}{valueSuffix}
      </p>
      {subtitle && (
        <p className={`${subtitleColor} text-sm mt-1`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
