import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router";
import {
  LogOut, Settings, TrendingUp, BarChart3, Package, FileText,
  Layers, Shield, User, Lock, ChevronRight, Globe, Users,
  MonitorPlay, ClipboardList, SlidersHorizontal, Bug, HelpCircle,
  FlaskConical,
} from "lucide-react";
import { getPlanCycle, getPlannedYears, initPlanCycles } from "../types/planCycle";
import { getReviewedYears } from "../../services/supabase/channelScenarioService";
import { getM3AppliedYears } from "../../services/supabase/divisionScenarioService";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";

const DASHBOARD_TOUR: TourStep[] = [
  {
    targetId: "tour-dashboard-greeting",
    title: "Bem-vindo ao Fashion Mind",
    content: "Esses 5 módulos te levam da meta de receita até o sortimento final, em sequência. Comece pelo Planejamento Estratégico — os próximos se desbloqueiam conforme você avança.",
  },
  {
    targetId: "tour-module-1",
    title: "Planejamento Estratégico",
    content: "É aqui que tudo começa: a meta de receita e margem que vai guiar a coleção inteira. Defina quais indicadores guiarão os resultados do ano. Simule, salve e compare cenários lado a lado antes de decidir os números de cada indicador. Essa decisão abre os módulos seguintes.",
  },
  {
    targetId: "tour-module-2",
    title: "Metas por Canal",
    content: "Aqui a meta vira números por canal: loja física, e-commerce, atacado. Você vê na hora se a soma das partes ainda fecha com a meta que definiu no módulo anterior em todos os indicadores que você definiu para o ano.",
  },
  {
    targetId: "tour-module-3",
    title: "Planejamento por Divisão",
    content: "Cada canal se divide por linha de produto e Coleção. Você define a pirâmide de preço de cada divisão e visualiza o risco antes de aprovar a distribuição.",
  },
  {
    targetId: "tour-module-4",
    title: "Sazonalidade",
    content: "Aqui você valida o ritmo da coleção: distribua a receita mês a mês por canal e confira se a curva está alinhada ao calendário da temporada. A distribuição mensal ancora o planejamento de abastecimento e previne rupturas.",
  },
  {
    targetId: "tour-module-5",
    title: "Plano de Sortimento",
    content: "Desenvolva a engenharia de sortimento com base nas metas definidas. Detalhe categorias, preços e atributos.",
  },
  {
    targetId: "tour-settings-btn",
    title: "Configurações de Operação",
    content: "Gerencie sua estrutura ou complemente os dados do seu sistema. Defina o período de suas coleções, drops, faixas de preço, sinalize básicos e importe dados se necessário.",
  },
  {
    targetId: "tour-user-management",
    title: "Perfil e Acessos",
    content: "Aqui você pode gerenciar suas credenciais e definir os níveis de acesso de cada membro da equipe, garantindo a segurança e a governança das suas decisões estratégicas.",
  },
];

interface UserData {
  name: string;
  email: string;
  profile: string;
  system_role?: string;
  tenant_id?: string;
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
    requiresModules: [2],
  },
  {
    id: 4,
    title: "Sazonalidade",
    level: "Tático",
    levelColor: "text-[#9B8CD8]",
    icon: Package,
    description: "Distribua a receita mês a mês e valide a curva da coleção por canal. A distribuição mensal ancora o planejamento de abastecimento e previne rupturas.",
    cta: "Planejar sazonalidade",
    route: "/cycle-validation",
    ceoOnly: true,
    requiresModules: [2],
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
    requiresModules: [3],
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

// Regras de desbloqueio por módulo:
// Card 1         → sempre liberado (ponto de entrada)
// isDemoMode     → sem planos salvos: navegação livre com dados mock
// req 1          → Estratégico aplicado (tem versão salva)
// req 2          → Metas por Canal aplicadas (ano revisado via channelScenario)
// req 3          → Planejamento por Divisão aplicado (cenário ativo no M3)
function isModuleUnlocked(
  card: ModuleCard,
  plannedYears: number[],
  reviewedYears: number[],
  m3ActiveYears: number[],
  isDemoMode: boolean,
): boolean {
  if (card.id === 1) return true;
  if (isDemoMode) return true;
  if (card.requiresModules.length === 0) return true;

  const latestYear = Math.max(...plannedYears);

  return card.requiresModules.every((req) => {
    if (req === 1) return Boolean(getPlanCycle(latestYear)?.versions?.length);
    if (req === 2) return reviewedYears.includes(latestYear);
    // M3 só conta como "ativo" se o cenário aplicado for do MESMO ciclo/ano que
    // está sendo avaliado — um M3 aplicado num ano anterior não pode liberar
    // M5 para um ciclo novo que ainda não passou por M3.
    if (req === 3) return m3ActiveYears.includes(latestYear);
    return true;
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [activeTenantName, setActiveTenantName] = useState<string>("");
  const [kpis, setKpis] = useState<{
    products: number; sales: number; inventory: number; orders: number; loaded: boolean;
  }>({ products: 0, sales: 0, inventory: 0, orders: 0, loaded: false });
  const tour = useTour("dashboard");

  const plannedYears = getPlannedYears();
  const [reviewedYears, setReviewedYears] = useState<number[]>([]);
  const [m3ActiveYears, setM3ActiveYears] = useState<number[]>([]);

  // Modo Desenvolvimento: bypassa todos os locks — disponível para client_admin e support
  const [devMode, setDevMode] = useState<boolean>(() => {
    return localStorage.getItem("fashionmind_dev_mode") === "true";
  });

  const toggleDevMode = () => {
    const next = !devMode;
    setDevMode(next);
    localStorage.setItem("fashionmind_dev_mode", String(next));
  };

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate("/");
      return;
    }
    setActiveTenantName(sessionStorage.getItem("activeTenantName") ?? "");

    // Carregar KPIs reais do Supabase
    const storedUserStr = sessionStorage.getItem("currentUser");
    if (storedUserStr) {
      const u = JSON.parse(storedUserStr);
      const tid = sessionStorage.getItem("activeTenantId") ?? u.tenant_id ?? "";
      if (tid) {
        // Carrega anos revisados (M2) e anos com M3 aplicado, do Supabase
        getReviewedYears(tid).then(setReviewedYears).catch(() => {});
        getM3AppliedYears(tid).then(setM3ActiveYears).catch(() => {});

        Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
          // sales_history costuma ter centenas de milhares de linhas — count "exact"
          // nessa escala é a prática não recomendada pelo Supabase para tabelas
          // grandes (retorno inconsistente/zerado observado em produção aqui).
          // "estimated" usa estatística do planner, muito mais previsível em escala.
          supabase.from("sales_history").select("id", { count: "estimated", head: true }).eq("tenant_id", tid),
          supabase.from("inventory_snapshots").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
          supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        ]).then(([p, s, i, o]) => {
          setKpis({
            products: p.count ?? 0,
            sales: s.count ?? 0,
            inventory: i.count ?? 0,
            orders: o.count ?? 0,
            loaded: true,
          });
        }).catch(() => setKpis(k => ({ ...k, loaded: true })));
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/");
  };

  const isSupport = user?.system_role === "support";
  const isClientAdmin = user?.system_role === "client_admin";

  // Suporte e client_admin têm acesso estratégico completo
  const effectiveProfile = (isSupport || isClientAdmin) ? "CEO" : (user?.profile ?? "");

  // Sem plano: apenas M1 fica disponível — nunca libera tudo automaticamente
  const isDemoMode = plannedYears.length === 0;

  // Dev mode disponível apenas para support (suporte@thefashionoffice.com.br)
  const canUseDevMode = isSupport;
  // Somente dev mode explícito libera todos os módulos
  const allUnlocked = canUseDevMode && devMode;

  const handleCardClick = (card: ModuleCard) => {
    if (!card.route) return;
    if (!isModuleUnlocked(card, plannedYears, reviewedYears, m3ActiveYears, allUnlocked)) return;
    navigate(card.route);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen w-full" style={{ background: 'radial-gradient(ellipse 120% 100% at 55% 40%, #87A7E7 0%, #6281B2 40%, #1F416C 70%, #0F2545 90%), radial-gradient(ellipse 60% 60% at 5% 100%, #2E1325 0%, transparent 60%)' }}>
      {/* Banner de Modo Desenvolvimento */}
      {canUseDevMode && devMode && (
        <div className="bg-violet-600 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-sm font-medium">
            <FlaskConical className="w-4 h-4" />
            Modo Desenvolvimento ativo — todos os módulos desbloqueados
          </div>
          <button
            onClick={toggleDevMode}
            className="text-white/80 hover:text-white text-xs underline"
          >
            Desativar
          </button>
        </div>
      )}

      {/* Banner de Suporte */}
      {isSupport && (
        <div className="bg-amber-500 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-950 text-sm font-medium">
            <Globe className="w-4 h-4" />
            Modo Suporte — Visualizando:
            <span className="font-bold">{activeTenantName || "cliente não identificado"}</span>
          </div>
          <button
            onClick={() => navigate("/tenant-selector")}
            className="text-amber-950 hover:text-amber-900 text-xs underline"
          >
            Trocar cliente
          </button>
        </div>
      )}

      {/* Top Bar */}
      <header className="bg-[#28071C] px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div id="tour-user-profile" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#7598CF]/30 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-[#F6F3AA]" />
            </div>
            <div>
              <p className="text-[#F6F3AA] text-sm font-medium">{user.name}</p>
              <p className="text-[#F6F3AA]/50 text-xs">
                {isSupport ? "Suporte TFO" : isClientAdmin ? "Administrador" : user.profile}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Botão Modo Dev — visível para client_admin e support */}
            {canUseDevMode && (
              <button
                onClick={toggleDevMode}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                  devMode
                    ? "bg-violet-500/30 text-violet-300 hover:bg-violet-500/40"
                    : "text-[#F6F3AA]/70 hover:text-[#F6F3AA] hover:bg-white/10"
                }`}
                title={devMode ? "Desativar modo desenvolvimento" : "Ativar modo desenvolvimento (desbloqueia todos os módulos)"}
              >
                <FlaskConical className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {devMode ? "Dev Mode ON" : "Dev Mode"}
                </span>
              </button>
            )}

            {/* Ícone de admin — visível apenas para client_admin */}
            {isClientAdmin && (
              <button
                onClick={() => navigate("/admin")}
                id="tour-user-management"
                className="flex items-center gap-2 px-3 py-2 text-[#F6F3AA]/70 hover:text-[#F6F3AA] hover:bg-white/10 rounded-lg transition-all text-sm"
                title="Gerenciar usuários e permissões"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Gestão de usuários</span>
              </button>
            )}
            <button
              onClick={() => navigate("/operation-settings")}
              id="tour-settings-btn"
              className="flex items-center gap-2 px-3 py-2 text-[#F6F3AA]/70 hover:text-[#F6F3AA] hover:bg-white/10 rounded-lg transition-all text-sm"
              title="Configurações do sistema"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurações</span>
            </button>
            <button
              onClick={tour.reopen}
              className="p-2 text-[#F6F3AA]/50 hover:text-[#F6F3AA] transition-colors"
              title="Ver tour de apresentação"
              aria-label="Abrir tour"
            >
              <HelpCircle className="w-4 h-4" />
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

      {/* Main Content — pb-44 garante scroll suficiente para o tour centralizar cards inferiores */}
      <main className="max-w-7xl mx-auto px-6 py-5 pb-20">
        <div id="tour-dashboard-greeting" className="text-center mb-5">
          <h1 className="text-2xl font-semibold text-[#F6F3AA] mb-1">
            Bem-vindo ao Fashion Mind, {user.name}!
          </h1>
          <p className="text-white/65 text-sm max-w-lg mx-auto leading-relaxed">
            Inteligência de dados e clareza estratégica para guiar a evolução da sua marca.
          </p>
        </div>

        {/* Module Cards — 3 colunas, tamanho compacto */}
        <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
          {MODULE_CARDS.map((card) => {
            const IconComponent = card.icon;
            const hasRoute = card.route !== null;
            const unlocked = isModuleUnlocked(card, plannedYears, reviewedYears, m3ActiveYears, allUnlocked);
            // Desbloqueado = acessível para clique; apenas route=null permanece desabilitado
            const isLocked = hasRoute && !unlocked;
            const isDisabled = !hasRoute || !unlocked;

            return (
              <button
                key={card.id}
                id={`tour-module-${card.id}`}
                onClick={() => handleCardClick(card)}
                disabled={isDisabled}
                className={`
                  bg-[#F2F2F2] rounded-xl p-4 text-left flex flex-col gap-2
                  transition-all duration-300 group relative
                  ${isDisabled
                    ? "opacity-55 cursor-not-allowed"
                    : "hover:scale-[1.02] hover:shadow-xl cursor-pointer"
                  }
                `}
              >
                {/* Lock icon */}
                {isLocked && (
                  <div className="absolute top-2.5 right-2.5">
                    <div className="w-5 h-5 bg-[#28071C]/10 rounded-full flex items-center justify-center">
                      <Lock className="w-3 h-3 text-[#28071C]/35" />
                    </div>
                  </div>
                )}

                {/* Ícone + badge de nível */}
                <div className="flex items-start justify-between">
                  <div className="bg-[#28071C] p-2 rounded-lg group-hover:bg-[#28071C]/90 transition-colors">
                    <IconComponent className="w-4 h-4 text-[#F6F3AA]" />
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${card.levelColor} mt-0.5`}>
                    {card.level}
                  </span>
                </div>

                {/* Título + descrição */}
                <div className="flex flex-col gap-0.5 flex-1">
                  <h3 className="text-xs font-semibold text-[#28071C] leading-snug">
                    {card.title}
                  </h3>
                  <p className="text-[#28071C]/55 text-[11px] leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* CTA */}
                <div className={`flex items-center gap-1 text-[11px] font-semibold mt-auto ${
                  isDisabled ? "text-[#28071C]/30" : "text-[#7598CF]"
                }`}>
                  {!hasRoute ? (
                    <span className="text-[#28071C]/30">Em breve</span>
                  ) : isLocked ? (
                    <span className="text-[#28071C]/40">Conclua os módulos anteriores</span>
                  ) : (
                    <>
                      {card.cta}
                      <ChevronRight className="w-3 h-3" />
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* KPI Strip — dados reais do banco */}
        {kpis.loaded && (kpis.products > 0 || kpis.sales > 0) && (
          <div className="max-w-4xl mx-auto mt-4 grid grid-cols-4 gap-3">
            {[
              { label: "Produtos", value: kpis.products.toLocaleString("pt-BR"), icon: "📦",
                tip: "Total de produtos cadastrados no catálogo. Cada produto é uma referência única identificada por SKU — base para o planejamento de sortimento." },
              { label: "Ordens",   value: kpis.orders.toLocaleString("pt-BR"),   icon: "🚚",
                tip: "Total de ordens de produção e compra registradas. Cada ordem representa um pedido de mercadoria para o ciclo — usado no calendário de demanda financeira." },
              { label: "Estoques", value: kpis.inventory.toLocaleString("pt-BR"),icon: "📊",
                tip: "Snapshots de estoque importados. Representa o inventário físico disponível em um dado momento — base para calcular cobertura e giro." },
              { label: "Vendas",   value: kpis.sales.toLocaleString("pt-BR"),    icon: "📈",
                tip: "Registros de vendas importados. Usados para calcular histórico de receita, giro, sell-through e comparar com as metas do planejamento." },
            ].map(({ label, value, icon, tip }) => (
              <div key={label} className="relative group bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 cursor-default">
                <span className="text-xl">{icon}</span>
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-wide">{label}</p>
                  <p className="text-white font-bold text-lg leading-tight">{value}</p>
                </div>
                <div className="absolute bottom-full left-0 mb-2 w-60 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed">
                  {tip}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Painel de debug — visível apenas para Suporte */}
        {isSupport && (
          <div className="max-w-5xl mx-auto mt-4">
            <div className="bg-amber-500/15 border border-amber-400/30 backdrop-blur-sm rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bug className="w-4 h-4 text-amber-300" />
                <h3 className="text-amber-200 text-sm font-semibold uppercase tracking-widest">
                  Acesso de Suporte — Fluxo do cliente
                </h3>
              </div>
              <p className="text-amber-200/70 text-xs mb-5">
                Navegue pelas telas que o cliente vê durante o onboarding para diagnosticar erros.
                Os dados exibidos são do localStorage do dispositivo atual (não do banco do cliente selecionado).
              </p>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => navigate("/presentation")}
                  className="bg-white/10 hover:bg-white/20 transition-colors rounded-xl p-4 text-left group"
                >
                  <MonitorPlay className="w-5 h-5 text-amber-300 mb-2" />
                  <p className="text-white text-sm font-medium">Apresentação</p>
                  <p className="text-white/50 text-xs mt-0.5">Slides de boas-vindas do sistema</p>
                </button>
                <button
                  onClick={() => navigate("/onboarding")}
                  className="bg-white/10 hover:bg-white/20 transition-colors rounded-xl p-4 text-left group"
                >
                  <ClipboardList className="w-5 h-5 text-amber-300 mb-2" />
                  <p className="text-white text-sm font-medium">Onboarding</p>
                  <p className="text-white/50 text-xs mt-0.5">Configuração inicial do perfil da empresa</p>
                </button>
                <button
                  onClick={() => navigate("/profile-adjust")}
                  className="bg-white/10 hover:bg-white/20 transition-colors rounded-xl p-4 text-left group"
                >
                  <SlidersHorizontal className="w-5 h-5 text-amber-300 mb-2" />
                  <p className="text-white text-sm font-medium">Ajuste de Perfil</p>
                  <p className="text-white/50 text-xs mt-0.5">Editar segmentos, matérias-primas e canais</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress hint when no plan exists */}
        {plannedYears.length === 0 && user.profile === "CEO" && (
          <div className="max-w-5xl mx-auto mt-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl px-5 py-4 text-center">
              <p className="text-white/90 text-sm">
                💡 Comece pelo <strong>Planejamento Estratégico</strong> para definir as metas do ciclo e desbloquear os módulos seguintes.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Product Tour */}
      {tour.isOpen && (
        <ProductTour steps={DASHBOARD_TOUR} onClose={tour.dismiss} />
      )}

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
