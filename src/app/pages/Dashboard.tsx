import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  LogOut, Settings, TrendingUp, BarChart3, Package, FileText,
  Layers, Shield, User, Lock, ChevronRight,
} from "lucide-react";
import { getPlanCycle, getPlannedYears } from "../types/planCycle";
import { getChannelReviewedYears } from "../../services/channelScenarioService";

interface UserData {
  name: string;
  email: string;
  profile: string;
}

interface ModuleCard {
  id: number;
  title: string;
  level: string;
  levelColor: string;
  icon: React.ElementType;
  description: string;
  cta: string;
  route: string | null;
  ceoOnly: boolean;
  requiresModules: number[];
}

const MODULE_CARDS: ModuleCard[] = [
  {
    id: 1,
    title: "Planejamento Estratégico",
    level: "Estratégico",
    levelColor: "text-[#7598CF]",
    icon: TrendingUp,
    description: "Defina a meta de receita, margem e orçamento do ciclo. Simule cenários antes de comprometer qualquer número.",
    cta: "Acessar planejamento",
    route: "/planning-gateway",
    ceoOnly: true,
    requiresModules: [],
  },
  {
    id: 2,
    title: "Metas por Canal",
    level: "Estratégico",
    levelColor: "text-[#7598CF]",
    icon: Layers,
    description: "Distribua a meta macro entre seus canais de venda e verifique se a distribuição bate com os objetivos do ciclo.",
    cta: "Planejar por canal",
    route: "/channel-planning",
    ceoOnly: true,
    requiresModules: [1],
  },
  {
    id: 3,
    title: "Planejamento por Divisão",
    level: "Tático",
    levelColor: "text-[#9B8CD8]",
    icon: BarChart3,
    description: "Quebre a meta por divisão de negócio e temporada. Configure faixa de preço e matriz de risco por divisão.",
    cta: "Planejar por divisão",
    route: "/module3-division-planning",
    ceoOnly: true,
    requiresModules: [1, 2],
  },
  {
    id: 4,
    title: "Validação de Ciclo",
    level: "Tático",
    levelColor: "text-[#9B8CD8]",
    icon: Package,
    description: "Valide a sazonalidade e consolide os módulos anteriores. Identifique gaps antes de iniciar o desenvolvimento.",
    cta: "Validar ciclo",
    route: "/cycle-validation",
    ceoOnly: true,
    requiresModules: [1, 2, 3],
  },
  {
    id: 5,
    title: "Plano de Sortimento",
    level: "Operacional",
    levelColor: "text-[#28071C]",
    icon: FileText,
    description: "Desenvolva a engenharia de sortimento com base nas metas definidas. Detalhe categorias, preços e atributos.",
    cta: "Acessar sortimento",
    route: "/sortiment-plan",
    ceoOnly: false,
    requiresModules: [],
  },
  {
    id: 6,
    title: "Mix de Produtos",
    level: "Operacional",
    levelColor: "text-[#28071C]",
    icon: Shield,
    description: "Composição final de categorias, subcategorias, preços e nível de moda. Em desenvolvimento.",
    cta: "Em breve",
    route: null,
    ceoOnly: false,
    requiresModules: [],
  },
];

function isModuleUnlocked(card: ModuleCard, plannedYears: number[], reviewedYears: number[]): boolean {
  if (card.requiresModules.length === 0) return true;
  const latestYear = plannedYears.length > 0 ? Math.max(...plannedYears) : null;
  if (!latestYear) return false;

  return card.requiresModules.every((req) => {
    if (req === 1) {
      const cycle = getPlanCycle(latestYear);
      return Boolean(cycle?.versions?.length);
    }
    if (req === 2) return reviewedYears.includes(latestYear);
    return true;
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);

  const plannedYears = getPlannedYears();
  const reviewedYears = getChannelReviewedYears();

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleCardClick = (card: ModuleCard) => {
    if (card.ceoOnly && user?.profile !== "CEO") {
      return;
    }
    if (!card.route) return;

    const unlocked = isModuleUnlocked(card, plannedYears, reviewedYears);
    if (!unlocked) return;

    navigate(card.route);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#7598CF] to-[#9B8CD8]">
      {/* Top Bar */}
      <header className="bg-[#28071C] px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#7598CF]/30 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-[#F6F3AA]" />
            </div>
            <div>
              <p className="text-[#F6F3AA] text-sm font-medium">{user.name}</p>
              <p className="text-[#F6F3AA]/50 text-xs">{user.profile}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigate("/operation-settings")}
              className="flex items-center gap-2 px-3 py-2 text-[#F6F3AA]/70 hover:text-[#F6F3AA] hover:bg-white/10 rounded-lg transition-all text-sm"
              title="Configurações do sistema"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurações</span>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-[#F6F3AA]/60 hover:text-[#F6F3AA] transition-colors"
              aria-label="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl text-[#F6F3AA] mb-2">
            Olá, {user.name}
          </h1>
          <p className="text-white/80 text-base">
            Por onde você quer começar hoje?
          </p>
        </div>

        {/* Module Cards Grid */}
        <div className="grid grid-cols-3 gap-5 max-w-5xl mx-auto">
          {MODULE_CARDS.map((card) => {
            const IconComponent = card.icon;
            const unlocked = isModuleUnlocked(card, plannedYears, reviewedYears);
            const accessible = (!card.ceoOnly || user.profile === "CEO") && card.route !== null;
            const isLocked = accessible && !unlocked;
            const isDisabled = !accessible || !unlocked;

            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card)}
                disabled={isDisabled}
                className={`
                  bg-[#F2F2F2] rounded-2xl p-5 text-left flex flex-col gap-3
                  transition-all duration-300 group relative
                  ${isDisabled
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:scale-[1.02] hover:shadow-2xl cursor-pointer"
                  }
                `}
              >
                {/* Lock overlay for modules awaiting prerequisites */}
                {isLocked && (
                  <div className="absolute top-3 right-3">
                    <div className="w-6 h-6 bg-[#28071C]/10 rounded-full flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5 text-[#28071C]/40" />
                    </div>
                  </div>
                )}

                {/* Icon + level */}
                <div className="flex items-start justify-between">
                  <div className="bg-[#28071C] p-3 rounded-xl group-hover:bg-[#28071C]/90 transition-colors">
                    <IconComponent className="w-6 h-6 text-[#F6F3AA]" />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${card.levelColor} mt-1`}>
                    {card.level}
                  </span>
                </div>

                {/* Title + description */}
                <div className="flex flex-col gap-1 flex-1">
                  <h3 className="text-sm text-[#28071C] font-semibold leading-snug">
                    {card.title}
                  </h3>
                  <p className="text-[#28071C]/60 text-xs leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* CTA */}
                <div className={`flex items-center gap-1 text-xs font-semibold mt-auto ${
                  isDisabled ? "text-[#28071C]/30" : "text-[#7598CF]"
                }`}>
                  {isLocked ? (
                    <span className="text-[#28071C]/40">Conclua os módulos anteriores</span>
                  ) : !accessible ? (
                    <span className="text-[#28071C]/30">Acesso restrito</span>
                  ) : (
                    <>
                      {card.cta}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Progress hint when no plan exists */}
        {plannedYears.length === 0 && user.profile === "CEO" && (
          <div className="max-w-5xl mx-auto mt-6">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-5 py-4 text-center">
              <p className="text-white/90 text-sm">
                💡 Comece pelo <strong>Planejamento Estratégico</strong> para definir as metas do ciclo e desbloquear os módulos seguintes.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Powered by tfo */}
      <div className="fixed bottom-3 right-4 flex items-center gap-1.5 opacity-20 pointer-events-none select-none">
        <span className="text-white text-[9px] uppercase tracking-widest">powered by</span>
        <img
          src="/tfo-logo.png"
          alt="tfo"
          className="h-4 w-auto object-contain"
          onError={(e) => {
            const t = e.currentTarget;
            t.style.display = "none";
            const fallback = t.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "block";
          }}
        />
        <span className="text-white font-bold text-sm tracking-tight hidden" style={{ fontFamily: "serif" }}>
          tfo
        </span>
      </div>
    </div>
  );
}
