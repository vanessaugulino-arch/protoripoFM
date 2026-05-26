import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  DollarSign,
  TrendingUp,
  Package,
  AlertTriangle,
  Save,
  GitCompare,
  CheckCircle,
  Download,
} from "lucide-react";
import logoTFO from "figma:asset/518a2b0fbf767e7d53e8db6869b3fce6e2473ef2.png";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface ProductGroup {
  id: string;
  name: string;
  revenuePercent: number;
  avgPrice: number;
  volumePercent: number;
  otbPercent: number;
  priceRanges: {
    p1: string;
    p2: string;
    p3: string;
  };
  riskMatrix: {
    basics: number;
    fashion: number;
    highFashion: number;
  };
}

interface HistoricalData {
  revenuePercent: number;
  avgPrice: number;
  volumePercent: number;
  otbPercent: number;
}

export default function CyclePlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedCycle, setSelectedCycle] = useState("Verão 2026");
  const [selectedHistorical, setSelectedHistorical] = useState("Verão 2025");
  const [savedScenarios, setSavedScenarios] = useState(0);

  // Metas globais (vindas do CEO)
  const [globalRevenue] = useState(2850000);
  const [globalOTB] = useState(1140000);
  const [globalVolume] = useState(18349);

  const [productGroups, setProductGroups] = useState<ProductGroup[]>([
    {
      id: "feminino",
      name: "Feminino",
      revenuePercent: 45,
      avgPrice: 195,
      volumePercent: 42,
      otbPercent: 48,
      priceRanges: { p1: "119-169", p2: "179-259", p3: "269-389" },
      riskMatrix: { basics: 40, fashion: 45, highFashion: 15 }
    },
    {
      id: "masculino",
      name: "Masculino",
      revenuePercent: 35,
      avgPrice: 185,
      volumePercent: 38,
      otbPercent: 32,
      priceRanges: { p1: "99-149", p2: "159-229", p3: "239-349" },
      riskMatrix: { basics: 50, fashion: 40, highFashion: 10 }
    },
    {
      id: "acessorios",
      name: "Acessórios",
      revenuePercent: 20,
      avgPrice: 89,
      volumePercent: 20,
      otbPercent: 20,
      priceRanges: { p1: "39-69", p2: "79-119", p3: "129-189" },
      riskMatrix: { basics: 60, fashion: 30, highFashion: 10 }
    }
  ]);

  // Dados históricos
  const historicalData: Record<string, HistoricalData> = {
    feminino: { revenuePercent: 42, avgPrice: 175, volumePercent: 40, otbPercent: 45 },
    masculino: { revenuePercent: 38, avgPrice: 165, volumePercent: 40, otbPercent: 35 },
    acessorios: { revenuePercent: 20, avgPrice: 75, volumePercent: 20, otbPercent: 20 }
  };

  useEffect(() => {
    // Get user from sessionStorage
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);

      // Acesso aberto para qualquer perfil
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

  const handleSaveScenario = () => {
    // Incrementa o contador de cenários salvos
    setSavedScenarios(prev => prev + 1);
    // Aqui você pode adicionar lógica adicional para salvar o cenário
    alert(`Cenário ${savedScenarios + 1} salvo com sucesso!`);
  };

  const updateGroup = (groupId: string, field: string, value: number | object) => {
    setProductGroups(groups =>
      groups.map(g => g.id === groupId ? { ...g, [field]: value } : g)
    );
  };

  const getTotalPercent = (field: 'revenuePercent' | 'volumePercent' | 'otbPercent') => {
    return productGroups.reduce((sum, g) => sum + g[field], 0);
  };

  const calculateValue = (percent: number, total: number) => {
    return (percent / 100) * total;
  };

  const calculateVolumePieces = (group: ProductGroup) => {
    const volumeValue = calculateValue(group.volumePercent, globalVolume);
    return Math.round(volumeValue);
  };

  const isDistributionValid = (total: number) => total >= 99.9 && total <= 100.1;

  if (!user) {
    return null;
  }

  const revenueTotal = getTotalPercent('revenuePercent');
  const volumeTotal = getTotalPercent('volumePercent');
  const otbTotal = getTotalPercent('otbPercent');

  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* Topbar */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-3">
              
              <span className="text-[#F6F3AA] text-xl"><span className="">Fashion Mind</span> | Planejamento por Categorias</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span>{user.name}</span>
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
        {/* Filtros e Cabeçalho */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                Ciclo Alvo
              </label>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                <option>Verão 2026</option>
                <option>Inverno 2026</option>
                <option>Verão 2027</option>
              </select>
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                Período Histórico Base
              </label>
              <select
                value={selectedHistorical}
                onChange={(e) => setSelectedHistorical(e.target.value)}
                className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                <option>Verão 2025</option>
                <option>Inverno 2025</option>
                <option>Verão 2024</option>
              </select>
            </div>
          </div>
        </div>

        {/* Grid de Grupos de Produto */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {productGroups.map((group) => {
            const historical = historicalData[group.id];
            const revenueValue = calculateValue(group.revenuePercent, globalRevenue);
            const otbValue = calculateValue(group.otbPercent, globalOTB);
            const volumePieces = calculateVolumePieces(group);

            return (
              <div key={group.id} className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="text-[#28071C] text-xl mb-6 pb-3 border-b-2 border-[#7598CF]">
                  {group.name}
                </h3>

                {/* Receita */}
                <div className="mb-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                    <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                      Receita (%)
                    </label>
                  </div>
                  <input
                    type="number"
                    value={group.revenuePercent}
                    onChange={(e) => updateGroup(group.id, 'revenuePercent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#E7E7E6] rounded-lg px-4 py-2 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                  />
                  <div className="mt-2 text-sm">
                    <span className="text-[#28071C]/70">Valor: </span>
                    <span className="text-[#28071C]">
                      R$ {revenueValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  {!isDistributionValid(revenueTotal) && (
                    <div className="mt-2 flex items-center text-red-600 text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Distribuição incompleta
                    </div>
                  )}
                </div>

                {/* Preço Médio de Venda */}
                <div className="mb-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-[#28071C]/70" />
                    <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                      Preço Médio de Venda (R$)
                    </label>
                  </div>
                  <input
                    type="number"
                    value={group.avgPrice}
                    onChange={(e) => updateGroup(group.id, 'avgPrice', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#E7E7E6] rounded-lg px-4 py-2 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                  />
                  <div className="mt-2 text-sm text-[#28071C]/70">
                    Base histórica: R$ {historical.avgPrice}
                  </div>
                </div>

                {/* Faixas de Preço */}
                <div className="mb-6 pb-6 border-b border-[#28071C]/10">
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">
                    Faixas de Preço
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#28071C]/70 text-sm">Entrada (P1)</span>
                      <input
                        type="text"
                        value={group.priceRanges.p1}
                        onChange={(e) => updateGroup(group.id, 'priceRanges', { ...group.priceRanges, p1: e.target.value })}
                        className="w-32 bg-[#E7E7E6] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#28071C]/70 text-sm">Médio (P2)</span>
                      <input
                        type="text"
                        value={group.priceRanges.p2}
                        onChange={(e) => updateGroup(group.id, 'priceRanges', { ...group.priceRanges, p2: e.target.value })}
                        className="w-32 bg-[#E7E7E6] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#28071C]/70 text-sm">Premium (P3)</span>
                      <input
                        type="text"
                        value={group.priceRanges.p3}
                        onChange={(e) => updateGroup(group.id, 'priceRanges', { ...group.priceRanges, p3: e.target.value })}
                        className="w-32 bg-[#E7E7E6] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Volume de Produção */}
                <div className="mb-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <Package className="w-4 h-4 text-[#28071C]/70" />
                    <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                      Volume de Produção (%)
                    </label>
                  </div>
                  <input
                    type="number"
                    value={group.volumePercent}
                    onChange={(e) => updateGroup(group.id, 'volumePercent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#E7E7E6] rounded-lg px-4 py-2 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                  />
                  <div className="mt-2 text-sm">
                    <span className="text-[#28071C]/70">Peças previstas: </span>
                    <span className="text-[#28071C]">
                      {volumePieces.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {!isDistributionValid(volumeTotal) && (
                    <div className="mt-2 flex items-center text-red-600 text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Distribuição incompleta
                    </div>
                  )}
                </div>

                {/* OTB */}
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                    <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                      OTB - Orçamento (%)
                    </label>
                  </div>
                  <input
                    type="number"
                    value={group.otbPercent}
                    onChange={(e) => updateGroup(group.id, 'otbPercent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#E7E7E6] rounded-lg px-4 py-2 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                  />
                  <div className="mt-2 text-sm">
                    <span className="text-[#28071C]/70">Valor: </span>
                    <span className="text-[#28071C]">
                      R$ {otbValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  {!isDistributionValid(otbTotal) && (
                    <div className="mt-2 flex items-center text-red-600 text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Distribuição incompleta
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Matriz de Risco */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="text-[#28071C] text-lg mb-6">
            Matriz de Risco por Grupo de Produto
          </h3>
          <div className="grid grid-cols-3 gap-6">
            {productGroups.map((group) => (
              <div key={group.id}>
                <h4 className="text-[#28071C] mb-4 pb-2 border-b border-[#28071C]/20">
                  {group.name}
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#28071C]/70 text-sm">Básicos (Baixo)</span>
                    <input
                      type="number"
                      value={group.riskMatrix.basics}
                      onChange={(e) => updateGroup(group.id, 'riskMatrix', {
                        ...group.riskMatrix,
                        basics: parseFloat(e.target.value) || 0
                      })}
                      className="w-20 bg-[#E7E7E6] rounded px-3 py-1 text-[#28071C] text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#28071C]/70 text-sm">Moda (Médio)</span>
                    <input
                      type="number"
                      value={group.riskMatrix.fashion}
                      onChange={(e) => updateGroup(group.id, 'riskMatrix', {
                        ...group.riskMatrix,
                        fashion: parseFloat(e.target.value) || 0
                      })}
                      className="w-20 bg-[#E7E7E6] rounded px-3 py-1 text-[#28071C] text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#28071C]/70 text-sm">Alta Moda (Alto)</span>
                    <input
                      type="number"
                      value={group.riskMatrix.highFashion}
                      onChange={(e) => updateGroup(group.id, 'riskMatrix', {
                        ...group.riskMatrix,
                        highFashion: parseFloat(e.target.value) || 0
                      })}
                      className="w-20 bg-[#E7E7E6] rounded px-3 py-1 text-[#28071C] text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparativo Histórico */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h3 className="text-[#28071C] text-lg mb-6">
            Dados de Suporte - Comparativo com <span className="text-[#7598CF] font-semibold">{selectedHistorical}</span>
          </h3>

          <div className="grid grid-cols-3 gap-6">
            {productGroups.map((group) => {
              const historical = historicalData[group.id];

              const metrics = [
                {
                  label: 'Receita %',
                  current: group.revenuePercent,
                  historical: historical.revenuePercent
                },
                {
                  label: 'PMV (R$)',
                  current: group.avgPrice,
                  historical: historical.avgPrice
                },
                {
                  label: 'Volume %',
                  current: group.volumePercent,
                  historical: historical.volumePercent
                },
                {
                  label: 'OTB %',
                  current: group.otbPercent,
                  historical: historical.otbPercent
                }
              ];

              return (
                <div key={group.id} className="space-y-3">
                  <h4 className="text-[#28071C] mb-3 pb-2 border-b border-[#28071C]/20">
                    {group.name}
                  </h4>
                  {metrics.map((metric, idx) => {
                    const diff = metric.current - metric.historical;
                    const isHigher = diff > 0;
                    const isEqual = Math.abs(diff) < 0.01;
                    const percentDiff = isEqual ? '0.0' : ((diff / metric.historical) * 100).toFixed(1);

                    return (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-[#28071C]/70">{metric.label}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[#28071C]">
                            {metric.current}
                          </span>
                          {!isEqual && (
                            <>
                              {isHigher ? (
                                <div className="flex items-center text-green-600">
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  <span className="text-xs">+{percentDiff}%</span>
                                </div>
                              ) : (
                                <div className="flex items-center text-red-600">
                                  <TrendingUp className="w-3 h-3 mr-1 rotate-180" />
                                  <span className="text-xs">{percentDiff}%</span>
                                </div>
                              )}
                            </>
                          )}
                          {isEqual && <div className="w-16" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              onClick={handleSaveScenario}
              className="flex items-center px-6 py-3 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-sm"
            >
              <Save className="w-5 h-5 mr-2" />
              Salvar Cenário
            </button>
            <button
              disabled={savedScenarios < 2}
              className={`flex items-center px-6 py-3 border-2 rounded-lg transition-all shadow-sm ${
                savedScenarios < 2
                  ? 'bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-white text-[#28071C] border-[#28071C] hover:bg-[#28071C]/5'
              }`}
            >
              <GitCompare className="w-5 h-5 mr-2" />
              Comparar Cenários
            </button>
            <button
              disabled={savedScenarios < 1}
              className={`flex items-center px-6 py-3 border-2 rounded-lg transition-all shadow-sm ${
                savedScenarios < 1
                  ? 'bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-white text-[#28071C] border-[#28071C] hover:bg-[#28071C]/5'
              }`}
            >
              <Download className="w-5 h-5 mr-2" />
              Exportar Dados
            </button>
          </div>

          <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
            <CheckCircle className="w-5 h-5 mr-2" />
            Aplicar Metas
          </button>
        </div>
      </main>
    </div>
  );
}