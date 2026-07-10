import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router";
import { 
  ArrowLeft, 
  LogOut, 
  User,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Package,
  AlertTriangle,
  AlertCircle,
  Download,
  Printer,
  BarChart3,
  Settings,
  Home,
  ArrowRight,
  TrendingDown,
  Percent
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface User {
  name: string;
  email: string;
  profile: string;
}

// Fallback data (usado quando Supabase não retornar dados)
const groupPerformanceFallback = [
  { grupo: "Feminino",   receita: 985000, performanceEstoque: 98,  giro: 2.8, margem: 49.5 },
  { grupo: "Masculino",  receita: 420000, performanceEstoque: 92,  giro: 3.2, margem: 45.8 },
  { grupo: "Acessórios", receita: 100000, performanceEstoque: 105, giro: 1.5, margem: 52.3 },
];
const themeDataFallback = [
  { tema: "Tropical Paradise", meta: 380000, realizado: 425000 },
  { tema: "Urban Minimal",     meta: 420000, realizado: 398000 },
  { tema: "Romantic Garden",   meta: 350000, realizado: 362000 },
  { tema: "Bold Geometry",     meta: 280000, realizado: 245000 },
  { tema: "Natural Essence",   meta: 120000, realizado:  75000 },
];

export default function TrackingCreative() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string>("");

  // Dados reais do Supabase (com fallback para mock)
  const [groupPerformanceState, setGroupPerformanceState] = useState<null | typeof groupPerformanceFallback>(null);
  const [themeDataState, setThemeDataState] = useState<null | typeof themeDataFallback>(null);
  const [metaTotal, setMetaTotal] = useState<number>(0);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (!storedUser) { navigate("/"); return; }
    const userData = JSON.parse(storedUser);
    setUser(userData);
    if (userData.profile !== "Direção Criativa") { navigate("/dashboard"); return; }

    const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
    setTenantId(tid);
    if (!tid) return;

    // Carrega dados reais do Supabase
    const loadRealData = async () => {
      // 0. Busca cenário aplicado do Módulo 1 para metaTotal (receitaBruta)
      const { data: scenarios } = await supabase
        .from("planning_scenarios")
        .select("values, is_applied")
        .eq("tenant_id", tid)
        .eq("is_applied", true)
        .limit(1);

      if (scenarios && scenarios.length > 0) {
        const vals = scenarios[0].values as Record<string, unknown>;
        const receita = typeof vals["receitaBruta"] === "number" ? vals["receitaBruta"] : 0;
        if (receita > 0) setMetaTotal(receita);
      }

      // 1. Receita por divisão (agrupa sales_history por category)
      const { data: salesData } = await supabase
        .from("sales_history")
        .select("category, revenue_net, quantity")
        .eq("tenant_id", tid);

      if (salesData && salesData.length > 0) {
        const byDiv: Record<string, { receita: number; qty: number }> = {};
        salesData.forEach((s: any) => {
          const div = s.category ?? "Outros";
          if (!byDiv[div]) byDiv[div] = { receita: 0, qty: 0 };
          byDiv[div].receita += Number(s.revenue_net) || 0;
          byDiv[div].qty += Number(s.quantity) || 0;
        });
        const totalReceita = Object.values(byDiv).reduce((s, d) => s + d.receita, 0);
        const perf = Object.entries(byDiv)
          .map(([grupo, d]) => ({
            grupo,
            receita: Math.round(d.receita),
            performanceEstoque: Math.round((d.receita / (totalReceita / Object.keys(byDiv).length)) * 100),
            giro: d.qty > 0 ? parseFloat((d.receita / d.qty / 100).toFixed(1)) : 1.0,
            margem: 48.0, // margem média — precisaria de cost data
          }))
          .sort((a, b) => b.receita - a.receita)
          .slice(0, 4);
        if (perf.length > 0) setGroupPerformanceState(perf);
      }

      // 2. Receita por coleção (agrupa sales_history por colecao)
      const { data: themeRaw } = await supabase
        .from("sales_history")
        .select("colecao, revenue_net")
        .eq("tenant_id", tid)
        .not("colecao", "is", null);

      if (themeRaw && themeRaw.length > 0) {
        const byTheme: Record<string, number> = {};
        themeRaw.forEach((s: any) => {
          const t = s.colecao ?? "Outros";
          byTheme[t] = (byTheme[t] ?? 0) + (Number(s.revenue_net) || 0);
        });
        const total = Object.values(byTheme).reduce((s, v) => s + v, 0);
        const themes = Object.entries(byTheme)
          .map(([tema, realizado]) => ({
            tema,
            meta: Math.round(total / Object.keys(byTheme).length),
            realizado: Math.round(realizado),
          }))
          .sort((a, b) => b.realizado - a.realizado)
          .slice(0, 5);
        if (themes.length > 0) setThemeDataState(themes);
      }
    };

    loadRealData().catch(() => {/* usa fallback */});
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  // Data for group performance comparison (real ou fallback)
  const groupPerformance = groupPerformanceState ?? groupPerformanceFallback;

  // Calculate overall performance
  const totalReceita = groupPerformance.reduce((sum, item) => sum + item.receita, 0);
  // metaTotal vem do cenário aplicado do Módulo 1 (receitaBruta); fallback = soma dos grupos (sem distorção)
  const metaEfetiva = metaTotal > 0 ? metaTotal : totalReceita || 1;
  const performanceGeral = ((totalReceita / metaEfetiva) * 100 - 100).toFixed(1);
  const performancePositiva = parseFloat(performanceGeral) >= 0;

  // Find best performing group
  const bestGroup = groupPerformance.reduce((best, current) => 
    current.performanceEstoque > best.performanceEstoque ? current : best
  );
  const bestGroupPerformance = (bestGroup.performanceEstoque - 100).toFixed(1);
  const bestGroupPositivo = parseFloat(bestGroupPerformance) >= 0;

  // Find group with high stock and low turnover
  const highStockLowTurnover = groupPerformance.reduce((worst, current) => 
    current.giro < worst.giro ? current : worst
  );

  // Data for revenue by collection theme (real ou fallback)
  const themeData = themeDataState ?? themeDataFallback;

  // Color distribution data for each group
  const colorDataFeminino = [
    { cor: "Preto", valor: 28 },
    { cor: "Branco", valor: 25 },
    { cor: "Bege", valor: 18 },
    { cor: "Rosa", valor: 15 },
    { cor: "Azul", valor: 14 },
  ];

  const colorDataMasculino = [
    { cor: "Preto", valor: 35 },
    { cor: "Branco", valor: 22 },
    { cor: "Azul Marinho", valor: 20 },
    { cor: "Cinza", valor: 15 },
    { cor: "Bege", valor: 8 },
  ];

  const colorDataAcessorios = [
    { cor: "Preto", valor: 40 },
    { cor: "Marrom", valor: 25 },
    { cor: "Dourado", valor: 18 },
    { cor: "Prata", valor: 12 },
    { cor: "Colorido", valor: 5 },
  ];

  // Function to get real color from color name
  const getColorByName = (colorName: string) => {
    const colorMap: { [key: string]: string } = {
      "Preto": "#000000",
      "Branco": "#FFFFFF",
      "Bege": "#F5DEB3",
      "Rosa": "#FFB6C1",
      "Azul": "#4169E1",
      "Azul Marinho": "#000080",
      "Cinza": "#808080",
      "Marrom": "#8B4513",
      "Dourado": "#FFD700",
      "Prata": "#C0C0C0",
      "Colorido": "#FF6B6B"
    };
    return colorMap[colorName] || "#999999";
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
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Operacional</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Acompanhamento de Coleção</span>
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
      <main className="max-w-[1600px] mx-auto px-6 py-5">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] rounded-2xl px-6 py-5 mb-6 flex items-center justify-between shadow-md">
          <div>
            <h2 className="text-[#F6F3AA] text-xl font-bold mb-1">Bem-vindo, {user.name}!</h2>
            <p className="text-[#F6F3AA]/80 text-sm">
              A coleção está performando{' '}
              <span className={`font-bold ${performancePositiva ? 'text-green-300' : 'text-red-300'}`}>
                {Math.abs(parseFloat(performanceGeral))}%{' '}
                {performancePositiva ? 'acima da meta' : 'abaixo da meta'}
              </span>
              {' '}— destaque para <span className="font-bold text-[#F6F3AA]">{bestGroup.grupo}</span>.
              Atenção ao estoque de <span className="font-bold text-[#F6F3AA]">{highStockLowTurnover.grupo}</span>.
            </p>
          </div>
          <div className={`${performancePositiva ? 'bg-green-600' : 'bg-red-600'} text-white px-5 py-2 rounded-xl`}>
            <div className="text-center">
              <span className="text-2xl font-bold block">{Math.abs(parseFloat(performanceGeral))}%</span>
              <p className="text-xs">{performancePositiva ? 'acima da meta' : 'abaixo da meta'}</p>
            </div>
          </div>
        </div>
        {/* KPI Cards Row */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Receita Total Acumulada</p>
            </div>
            <p className="text-[#28071C] text-2xl font-bold">
              {totalReceita > 0 ? `R$ ${totalReceita.toLocaleString("pt-BR")}` : "—"}
            </p>
            <p className={`text-sm mt-1 ${performancePositiva ? "text-green-600" : "text-red-500"}`}>
              Meta: {metaTotal > 0 ? `R$ ${metaTotal.toLocaleString("pt-BR")}` : "Sem plano aplicado"}{metaTotal > 0 ? ` (${(100 + parseFloat(performanceGeral)).toFixed(1)}%)` : ""}
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Margem </p>
            </div>
            <p className="text-[#28071C] text-2xl font-bold">48.3%</p>
            <p className="text-[#28071C]/60 text-sm mt-1">Margem acumulada</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Package className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Cobertura de Estoque</p>
            </div>
            <p className="text-[#28071C] text-2xl font-bold">17</p>
            <p className="text-[#28071C]/60 text-sm mt-1">dias de cobertura</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <ShoppingBag className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Preço Médio da Coleção</p>
            </div>
            <p className="text-[#28071C] text-2xl font-bold">R$ 189</p>
            <p className="text-[#28071C]/60 text-sm mt-1">por peça</p>
          </div>
        </div>

        {/* Group Performance Comparison Table */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h3 className="text-[#28071C] text-lg font-semibold mb-4">
            Performance Comparativa dos Grupos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[#F2F2F2]">
                  <th className="text-left py-3 px-4 text-[#28071C]/70 text-sm uppercase tracking-wide">Grupo</th>
                  <th className="text-right py-3 px-4 text-[#28071C]/70 text-sm uppercase tracking-wide">Volume de Receita</th>
                  <th className="text-right py-3 px-4 text-[#28071C]/70 text-sm uppercase tracking-wide">Performance sobre Estoque</th>
                  <th className="text-right py-3 px-4 text-[#28071C]/70 text-sm uppercase tracking-wide">Giro (dias)</th>
                  <th className="text-right py-3 px-4 text-[#28071C]/70 text-sm uppercase tracking-wide">Margem (%)</th>
                </tr>
              </thead>
              <tbody>
                {groupPerformance.map((item, index) => (
                  <tr key={index} className="border-b border-[#F2F2F2] hover:bg-[#F2F2F2]/30">
                    <td className="py-4 px-4 text-[#28071C] font-medium">{item.grupo}</td>
                    <td className="py-4 px-4 text-right text-[#28071C]">
                      R$ {item.receita.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={`font-semibold ${item.performanceEstoque >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                        {item.performanceEstoque}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-[#28071C]">{item.giro}</td>
                    <td className="py-4 px-4 text-right text-[#28071C]">{item.margem}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue by Collection Theme Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h3 className="text-[#28071C] text-lg font-semibold mb-4">
            Receita por Tema de Coleção
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={themeData} id="chart-revenue-theme">
              <CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />
              <XAxis dataKey="tema" stroke="#28071C" angle={-15} textAnchor="end" height={100} />
              <YAxis stroke="#28071C" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #F2F2F2',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
              />
              <Legend />
              <Bar dataKey="meta" fill="#B8A8E0" name="Meta (R$)" id="bar-meta" />
              <Bar dataKey="realizado" fill="#7598CF" name="Realizado (R$)" id="bar-realizado" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Risks and Opportunities Section */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Risks */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <h3 className="text-[#28071C] text-lg font-semibold">Riscos</h3>
            </div>
            
            {/* Risk Item 1 */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
              <div className="flex items-start space-x-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[#28071C] font-semibold text-sm mb-1">Estoque concentrado em cores escuras</p>
                  <p className="text-[#28071C]/70 text-xs mb-2">
                    38% do estoque está em peças pretas e marinhos do planejado (25%), isso pode gerar sobra ao final do ciclo.
                  </p>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-[#28071C]/60 mb-1">
                      <span>Concentração de estoque</span>
                      <span className="text-red-600 font-semibold">38% vs 25% alvo</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-red-600 h-2 rounded-full" style={{ width: '38%' }}></div>
                    </div>
                  </div>
                  <button className="text-[#7598CF] text-xs hover:underline flex items-center">
                    Ver detalhes e cenários <ArrowRight className="w-3 h-3 ml-1" />
                  </button>
                </div>
              </div>
            </div>

            {/* Risk Item 2 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-orange-500 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[#28071C] font-semibold text-sm mb-1">Nível de risco: Médio</p>
                  <p className="text-[#28071C]/70 text-xs">
                    12 itens com risco de ruptura nos próximos 10 dias.
                  </p>
                </div>
              </div>
            </div>

            {/* Items with Upcoming Stock-Out Risk Table */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-[#28071C] font-semibold text-sm mb-3">Categorias com Ruptura Próxima</p>
              <div className="text-xs">
                <div className="grid grid-cols-12 gap-2 mb-2 text-[#28071C]/60 font-semibold">
                  <div className="col-span-4">Categoria</div>
                  <div className="col-span-2">Grupo</div>
                  <div className="col-span-2 text-right">Dias</div>
                  <div className="col-span-2 text-right">Itens</div>
                  <div className="col-span-2 text-right">Ação</div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-200">
                    <div className="col-span-4 text-[#28071C] font-medium">Vestidos</div>
                    <div className="col-span-2 text-[#28071C]/70 text-xs">Feminino</div>
                    <div className="col-span-2 text-right text-red-600 font-semibold">3 dias</div>
                    <div className="col-span-2 text-right text-[#28071C]">8 itens</div>
                    <div className="col-span-2 text-right">
                      <button className="text-[#7598CF] hover:underline">Planejar</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-200">
                    <div className="col-span-4 text-[#28071C] font-medium">Blusas</div>
                    <div className="col-span-2 text-[#28071C]/70 text-xs">Feminino</div>
                    <div className="col-span-2 text-right text-orange-600 font-semibold">5 dias</div>
                    <div className="col-span-2 text-right text-[#28071C]">12 itens</div>
                    <div className="col-span-2 text-right">
                      <button className="text-[#7598CF] hover:underline">Planejar</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-200">
                    <div className="col-span-4 text-[#28071C] font-medium">Calças</div>
                    <div className="col-span-2 text-[#28071C]/70 text-xs">Feminino</div>
                    <div className="col-span-2 text-right text-orange-600 font-semibold">7 dias</div>
                    <div className="col-span-2 text-right text-[#28071C]">15 itens</div>
                    <div className="col-span-2 text-right">
                      <button className="text-[#7598CF] hover:underline">Planejar</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-200">
                    <div className="col-span-4 text-[#28071C] font-medium">Camisas</div>
                    <div className="col-span-2 text-[#28071C]/70 text-xs">Masculino</div>
                    <div className="col-span-2 text-right text-orange-600 font-semibold">8 dias</div>
                    <div className="col-span-2 text-right text-[#28071C]">18 itens</div>
                    <div className="col-span-2 text-right">
                      <button className="text-[#7598CF] hover:underline">Planejar</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center py-2">
                    <div className="col-span-4 text-[#28071C] font-medium">Blazers</div>
                    <div className="col-span-2 text-[#28071C]/70 text-xs">Masculino</div>
                    <div className="col-span-2 text-right text-orange-600 font-semibold">10 dias</div>
                    <div className="col-span-2 text-right text-[#28071C]">20 itens</div>
                    <div className="col-span-2 text-right">
                      <button className="text-[#7598CF] hover:underline">Planejar</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-right">
                <span className="text-xs text-[#28071C]/60">5 categorias em risco</span>
              </div>
            </div>
          </div>

          {/* Opportunities */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <h3 className="text-[#28071C] text-lg font-semibold">Oportunidades</h3>
            </div>
            
            {/* Opportunity Item 1 */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
              <div className="flex items-start space-x-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-600 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[#28071C] font-semibold text-sm mb-1">Vestidos lideram lucratividade</p>
                  <p className="text-[#28071C]/70 text-xs mb-3">
                    Categoria de vestidos representa 38% do faturamento bruto, com margem média de 62%. Oportunidade para ampliar mix.
                  </p>
                  <button className="text-[#7598CF] text-xs hover:underline flex items-center">
                    Simular expansão <ArrowRight className="w-3 h-3 ml-1" />
                  </button>
                </div>
              </div>
            </div>

            {/* Top Categories Chart */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
              <p className="text-[#28071C] font-semibold text-sm mb-3">Top 3 Categorias por Lucro</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#28071C]">Vestidos <span className="text-[#28071C]/60">(Feminino)</span></span>
                    <span className="text-green-600 font-semibold">R$ 155k</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#28071C]">Blusas <span className="text-[#28071C]/60">(Feminino)</span></span>
                    <span className="text-green-600 font-semibold">R$ 138k</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '89%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#28071C]">Calças <span className="text-[#28071C]/60">(Feminino)</span></span>
                    <span className="text-green-600 font-semibold">R$ 105k</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '68%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Products Ranking */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-[#28071C] font-semibold text-sm mb-3">Top 5 Produtos por Performance</p>
              <p className="text-[#28071C]/60 text-xs mb-3">Baseado em performance sobre estoque e margem ≥ meta</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 font-bold text-xs w-4">1°</span>
                    <span className="text-[#28071C] text-xs">Blusa Oversized Linho</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-green-600 text-xs font-semibold">115%</span>
                    <span className="text-[#28071C]/60 text-xs">54.2%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 font-bold text-xs w-4">2°</span>
                    <span className="text-[#28071C] text-xs">Vestido Midi Estampado</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-green-600 text-xs font-semibold">108%</span>
                    <span className="text-[#28071C]/60 text-xs">62.5%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 font-bold text-xs w-4">3°</span>
                    <span className="text-[#28071C] text-xs">Calça Wide Leg</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-green-600 text-xs font-semibold">105%</span>
                    <span className="text-[#28071C]/60 text-xs">48.8%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 font-bold text-xs w-4">4°</span>
                    <span className="text-[#28071C] text-xs">Camisa Social Slim</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-green-600 text-xs font-semibold">103%</span>
                    <span className="text-[#28071C]/60 text-xs">51.3%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 font-bold text-xs w-4">5°</span>
                    <span className="text-[#28071C] text-xs">Jaqueta Jeans Oversized</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-green-600 text-xs font-semibold">102%</span>
                    <span className="text-[#28071C]/60 text-xs">49.7%</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-300">
                <div className="flex justify-between text-xs text-[#28071C]/60">
                  <span>Perf. Estoque</span>
                  <span>Margem</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Color Distribution by Group */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
          <h3 className="text-[#28071C] text-lg font-semibold mb-4">
            Participação das Cores na Venda por Grupo
          </h3>
          <div className="grid grid-cols-3 gap-8">
            {/* Feminino */}
            <div className="text-center">
              <p className="text-[#28071C] font-semibold text-sm mb-2">Feminino</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={colorDataFeminino}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="valor"
                    id="pie-feminino"
                  >
                    {colorDataFeminino.map((entry, index) => (
                      <Cell key={`cell-fem-${index}`} fill={getColorByName(entry.cor)} stroke={getColorByName(entry.cor)} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-[#28071C]/70 space-y-1">
                {colorDataFeminino.map((item, index) => (
                  <div key={`legend-fem-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded mr-1" 
                        style={{ backgroundColor: getColorByName(item.cor) }}
                      ></div>
                      <span>{item.cor}</span>
                    </div>
                    <span className="font-semibold">{item.valor}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Masculino */}
            <div className="text-center">
              <p className="text-[#28071C] font-semibold text-sm mb-2">Masculino</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={colorDataMasculino}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="valor"
                    id="pie-masculino"
                  >
                    {colorDataMasculino.map((entry, index) => (
                      <Cell key={`cell-masc-${index}`} fill={getColorByName(entry.cor)} stroke={getColorByName(entry.cor)} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-[#28071C]/70 space-y-1">
                {colorDataMasculino.map((item, index) => (
                  <div key={`legend-masc-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded mr-1" 
                        style={{ backgroundColor: getColorByName(item.cor) }}
                      ></div>
                      <span>{item.cor}</span>
                    </div>
                    <span className="font-semibold">{item.valor}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Acessórios */}
            <div className="text-center">
              <p className="text-[#28071C] font-semibold text-sm mb-2">Acessórios</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={colorDataAcessorios}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="valor"
                    id="pie-acessorios"
                  >
                    {colorDataAcessorios.map((entry, index) => (
                      <Cell key={`cell-acess-${index}`} fill={getColorByName(entry.cor)} stroke={getColorByName(entry.cor)} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-[#28071C]/70 space-y-1">
                {colorDataAcessorios.map((item, index) => (
                  <div key={`legend-acess-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded mr-1" 
                        style={{ backgroundColor: getColorByName(item.cor) }}
                      ></div>
                      <span>{item.cor}</span>
                    </div>
                    <span className="font-semibold">{item.valor}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
            <Download className="w-5 h-5 mr-2" />
            Exportar Relatório
          </button>

          <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
            <Settings className="w-5 h-5 mr-2" />
            Ajustar Orçamento/Produção
          </button>
        </div>
      </main>
    </div>
  );
}