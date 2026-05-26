import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { 
  ArrowLeft, 
  LogOut, 
  User,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Calendar,
  Package,
  Box,
  BarChart3,
  AlertTriangle,
  Settings,
  Home,
  Download,
  X
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart
} from "recharts";

interface User {
  name: string;
  email: string;
  profile: string;
}

export default function Tracking() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [showWelcomeBox, setShowWelcomeBox] = useState(true);

  useEffect(() => {
    // Get user from sessionStorage
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      
      // Check if user has CEO profile
      if (userData.profile !== "CEO") {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  // Data for sales evolution chart
  const salesData = [
    { week: "S1", plano: 1200, realizado: 1180, margemBruta: 85000 },
    { week: "S2", plano: 1350, realizado: 1290, margemBruta: 92000 },
    { week: "S3", plano: 1450, realizado: 1520, margemBruta: 105000 },
    { week: "S4", plano: 1680, realizado: 1820, margemBruta: 118000 },
    { week: "S5", plano: 1850, realizado: 1950, margemBruta: 128500 },
    { week: "S6", plano: 1920, realizado: 2050, margemBruta: 135000 },
  ];

  // Data for product group performance
  const productData = [
    { 
      category: "Básicos Verão", 
      pedidosProducao: 45000, 
      estoque: 12000,
      producaoBaixada: 38000 
    },
    { 
      category: "Estampados", 
      pedidosProducao: 52000, 
      estoque: 18000,
      producaoBaixada: 42000 
    },
    { 
      category: "Premium", 
      pedidosProducao: 38000, 
      estoque: 15000,
      producaoBaixada: 32000 
    },
    { 
      category: "Acessórios", 
      pedidosProducao: 28000, 
      estoque: 22000,
      producaoBaixada: 18000 
    },
    { 
      category: "Underwear", 
      pedidosProducao: 42000, 
      estoque: 16000,
      producaoBaixada: 35000 
    },
  ];

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* Topbar - Extended */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-6 shadow-lg">
        <div className="max-w-[1600px] mx-auto">
          {/* Top row - Navigation and User */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBack}
                className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-[#F6F3AA] text-base font-medium">
                Fashion Mind | Acompanhamento de Coleção
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-[#F6F3AA]">
                <User className="w-4 h-4" />
                <span className="text-sm">{user.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Welcome Section */}
          <div className="mb-4">
            <h2 className="text-[#F6F3AA] text-2xl font-bold mb-3">Bem-vindo, {user.name}!</h2>
            <p className="text-[#F6F3AA] text-sm mb-4">
              Estamos a <span className="font-bold">19 semanas</span> da coleção <span className="font-bold">Verão 2026</span>. A performance está em <span className="font-bold">-41.1% abaixo do plano</span>.
            </p>
          </div>

          {/* Performance Row */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[#F6F3AA] text-lg font-semibold mb-1">Performance de Vendas</h3>
            </div>
            <div className="bg-red-500 text-white px-5 py-2 rounded-lg flex items-center space-x-3">
              <div className="text-center">
                <span className="text-2xl font-bold block">87%</span>
                <p className="text-xs">% abaixo do plano</p>
              </div>
              <button
                onClick={() => setShowWelcomeBox(!showWelcomeBox)}
                className="text-white hover:opacity-80 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* KPI Cards Row 1 */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Vendas Acumuladas</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">R$ 1.240.000</p>
            <p className="text-green-600 text-sm mt-1">Meta: R$ 2.100.000</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Margem Bruta Acumulada</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">R$ 548.080</p>
            <p className="text-[#28071C]/60 text-sm mt-1">44.2% da receita</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <ShoppingBag className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Preço Médio da Coleção</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">R$ 179</p>
            <p className="text-[#28071C]/60 text-sm mt-1">Por peça</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Calendar className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Ritmo de Vendas</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">R$ 28.400</p>
            <p className="text-[#28071C]/60 text-sm mt-1">/dia</p>
          </div>
        </div>

        {/* Sales Evolution Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h3 className="text-[#28071C] text-lg font-semibold mb-4">
            Evolução de Vendas por Semana
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E7E6" />
              <XAxis dataKey="week" stroke="#28071C" />
              <YAxis yAxisId="left" stroke="#28071C" />
              <YAxis yAxisId="right" orientation="right" stroke="#28071C" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E7E7E6',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="plano" fill="#B8A8E0" name="Plano" />
              <Bar yAxisId="left" dataKey="realizado" fill="#7598CF" name="Realizado" />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="margemBruta" 
                stroke="#F6F3AA" 
                strokeWidth={3}
                name="Margem Bruta (R$)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Stock Info */}
        <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 mb-6">
          <p className="text-[#28071C] text-sm">
            O volume financeiro de estoque está <span className="font-bold text-red-600">+49.5% acima do plano</span>. 
            A categoria com melhor giro é <span className="font-bold">Básicos</span> com <span className="font-bold">28 dias</span> de cobertura, 
            e a com menor giro é <span className="font-bold">Acessórios</span>, com <span className="font-bold">85 dias</span>.
          </p>
        </div>

        {/* KPI Cards Row 2 */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Package className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Estoque Acumulado</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">6.820</p>
            <p className="text-red-600 text-sm mt-1">peças</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Box className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Pedidos + Produção em Carteira</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">31.000</p>
            <p className="text-[#28071C]/60 text-sm mt-1">peças</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Calendar className="w-5 h-5 text-[#28071C]/70" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Cobertura</p>
            </div>
            <p className="text-[#28071C] text-3xl font-bold">43</p>
            <p className="text-[#28071C]/60 text-sm mt-1">dias</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-green-600" />
              <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">Expectativa Sobra/Falta</p>
            </div>
            <p className="text-green-600 text-3xl font-bold">+2.400</p>
            <p className="text-green-600 text-sm mt-1">sobra de peças</p>
          </div>
        </div>

        {/* Product Performance Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
          <h3 className="text-[#28071C] text-lg font-semibold mb-4">
            Desempenho por Grupo de Produto (até 10)
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={productData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E7E6" />
              <XAxis dataKey="category" stroke="#28071C" angle={-15} textAnchor="end" height={80} />
              <YAxis yAxisId="left" stroke="#28071C" />
              <YAxis yAxisId="right" orientation="right" stroke="#28071C" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E7E7E6',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="pedidosProducao" fill="#7598CF" name="Pedidos + Produção (R$)" />
              <Bar yAxisId="left" dataKey="estoque" fill="#E7E7E6" name="Estoque no Rodapé" />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="producaoBaixada" 
                stroke="#28071C" 
                strokeWidth={3}
                name="Produção Peças Baixadas"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
            <Settings className="w-5 h-5 mr-2" />
            Definir Ajuste
          </button>

          <div className="flex space-x-4">
            <button 
              onClick={handleBack}
              className="flex items-center px-6 py-3 bg-white text-[#7598CF] border-2 border-[#7598CF] rounded-lg hover:bg-gray-50 transition-all"
            >
              <Home className="w-5 h-5 mr-2" />
              Ir para Dashboard
            </button>
            <button className="flex items-center px-6 py-3 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-md">
              <Download className="w-5 h-5 mr-2" />
              Exportar Relatório
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}