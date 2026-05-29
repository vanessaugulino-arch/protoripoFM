import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LogOut, Settings, TrendingUp, BarChart3, Package, FileText, Layers, Shield } from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

const actionCards = [
  {
    id: 1,
    title: "Módulo 1",
    icon: TrendingUp,
    description: "Planejamento Estratégico - Ano Fiscal",
  },
  {
    id: 2,
    title: "Módulo 2",
    icon: Layers,
    description: "Planejamento de Metas por Canal",
  },
  {
    id: 3,
    title: "Módulo 3",
    icon: BarChart3,
    description: "Planejamento por Divisão de Negócio (Temporada)",
  },
  {
    id: 4,
    title: "Módulo 4",
    icon: Package,
    description: "Validação de Sazonalidade",
  },
  {
    id: 5,
    title: "Módulo 5",
    icon: FileText,
    description: "Plano de Sortimento 1",
  },
  {
    id: 6,
    title: "Módulo 6",
    icon: Shield,
    description: "Plano de Sortimento 2",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Get user from sessionStorage
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      // Redirect to login if no user is found
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleSettingsClick = () => {
    navigate("/operation-settings");
  };

  const handleCardClick = (cardId: number, cardTitle: string) => {
    console.log(`Card clicked: ${cardId} - ${cardTitle}`);

    // Navigate to planning gateway if card 1 and user is CEO
    if (cardId === 1 && user?.profile === "CEO") {
      navigate("/planning-gateway");
    } else if (cardId === 1) {
      alert("Acesso restrito. Apenas usuários com perfil CEO podem acessar esta funcionalidade.");
    }

    // Navigate to channel planning page if card 2 and user is CEO
    if (cardId === 2 && user?.profile === "CEO") {
      navigate("/channel-planning");
    } else if (cardId === 2) {
      alert("Acesso restrito. Apenas usuários com perfil CEO podem acessar esta funcionalidade.");
    }

    // Navigate to module 3 division planning if card 3 and user is CEO
    if (cardId === 3 && user?.profile === "CEO") {
      navigate("/module3-division-planning");
    } else if (cardId === 3) {
      alert("Acesso restrito. Apenas usuários com perfil CEO podem acessar esta funcionalidade.");
    }

    // Navigate to cycle validation page if card 4 and user is CEO
    if (cardId === 4 && user?.profile === "CEO") {
      navigate("/cycle-validation");
    } else if (cardId === 4) {
      alert("Acesso restrito. Apenas usuários com perfil CEO podem acessar esta funcionalidade.");
    }

    // Navigate to sortiment plan page if card 5
    if (cardId === 5) {
      navigate("/sortiment-plan");
    }

    // Module 6 not yet implemented
    if (cardId === 6) {
      alert("Módulo em desenvolvimento.");
    }
  };

  if (!user) {
    return null; // or a loading spinner
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#7598CF] to-[#9B8CD8]">
      {/* Top Bar */}
      <header className="bg-[#F6F3AA] px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#28071C] rounded-full flex items-center justify-center">
              <span className="text-[#F6F3AA] text-lg">
                {user.name.charAt(0)}
              </span>
            </div>
            <div>
              <p className="text-[#28071C] text-sm">
                {user.profile.replace("_", " ")}
              </p>
              <p className="text-[#28071C]/70 text-xs">{user.email}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSettingsClick}
              className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
              aria-label="Configurações"
            >
              <Settings className="w-6 h-6" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded-lg transition-colors"
              aria-label="Sair"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl text-white mb-4 text-[#f6f3aa]">
            Bem-vindo, {user.name}!
          </h1>
          <p className="text-white text-xl opacity-90 text-[#f6f3aa]">
            O que você gostaria de fazer hoje?
          </p>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-3 gap-6 max-w-5xl mx-auto">
          {actionCards.map((card) => {
            const IconComponent = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id, card.title)}
                className="bg-[#E7E7E6] rounded-2xl p-5 text-center hover:scale-105 hover:shadow-2xl transition-all duration-300 group flex flex-col items-center justify-center"
              >
                <div className="bg-[#28071C] p-4 rounded-xl group-hover:bg-[#28071C]/90 transition-colors mb-3">
                  <IconComponent className="w-8 h-8 text-[#F6F3AA]" />
                </div>
                <h3 className="text-base text-[#28071C] mb-2 font-semibold">
                  {card.title}
                </h3>
                <p className="text-[#28071C]/70 text-xs leading-tight">
                  {card.description}
                </p>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}