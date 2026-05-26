import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { 
  ArrowLeft, 
  LogOut, 
  User,
  Save,
  GitCompare,
  Download,
  Lock,
  Check,
  X
} from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface ChannelData {
  receita: number;
  margemBruta: number;
  pmv: number;
  otb: number;
  estoqueMedioRS: number;
  estoqueMedioPecas: number;
  giro: number;
  cobertura: number;
  markdown: number;
  producao: number;
  gmroi: number;
}

export default function ChannelPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Participação por canal (%)
  const [atacadoPercent, setAtacadoPercent] = useState(40);
  const [varejoPercent, setVarejoPercent] = useState(35);
  const [ecommercePercent, setEcommercePercent] = useState(25);

  // Dados de cada canal
  const [atacadoData, setAtacadoData] = useState<ChannelData>({
    receita: 1248000,
    margemBruta: 38.5,
    pmv: 165,
    otb: 456000,
    estoqueMedioRS: 280000,
    estoqueMedioPecas: 1697,
    giro: 4.5,
    cobertura: 80,
    markdown: 50000,
    producao: 7560,
    gmroi: 1.85,
  });

  const [varejoData, setVarejoData] = useState<ChannelData>({
    receita: 1092000,
    margemBruta: 48.0,
    pmv: 185,
    otb: 399000,
    estoqueMedioRS: 238000,
    estoqueMedioPecas: 1286,
    giro: 4.6,
    cobertura: 75,
    markdown: 43750,
    producao: 5902,
    gmroi: 2.35,
  });

  const [ecommerceData, setEcommerceData] = useState<ChannelData>({
    receita: 780000,
    margemBruta: 52.0,
    pmv: 195,
    otb: 285000,
    estoqueMedioRS: 162000,
    estoqueMedioPecas: 831,
    giro: 4.8,
    cobertura: 70,
    markdown: 31250,
    producao: 4000,
    gmroi: 2.65,
  });

  // Cenários para comparação
  const [selectedScenarios, setSelectedScenarios] = useState({
    scenarioA: false,
    scenarioB: false,
    scenarioC: false,
  });

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      
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

  // Calcula a soma total de participação
  const totalPercent = atacadoPercent + varejoPercent + ecommercePercent;

  // Calcula totais consolidados
  const calcularTotal = (field: keyof ChannelData): number => {
    return atacadoData[field] + varejoData[field] + ecommerceData[field];
  };

  // Meta da CIA (valores do módulo 1)
  const metaCIA = {
    receita: 3120000,
    margemBruta: 46.5,
  };

  // Diferença para meta
  const totalReceita = calcularTotal('receita');
  const diferencaReceita = totalReceita - metaCIA.receita;
  const diferencaPercent = (diferencaReceita / metaCIA.receita) * 100;

  const handleUpdateChannelData = (
    channel: 'atacado' | 'varejo' | 'ecommerce',
    field: keyof ChannelData,
    value: number
  ) => {
    if (channel === 'atacado') {
      setAtacadoData({ ...atacadoData, [field]: value });
    } else if (channel === 'varejo') {
      setVarejoData({ ...varejoData, [field]: value });
    } else {
      setEcommerceData({ ...ecommerceData, [field]: value });
    }
  };

  if (!user) {
    return null;
  }

  const kpiFields = [
    { label: "Receita (R$)", key: "receita", format: "currency" },
    { label: "Margem Bruta (%)", key: "margemBruta", format: "percent" },
    { label: "PMV (R$)", key: "pmv", format: "pmv" },
    { label: "OTB (R$)", key: "otb", format: "currency" },
    { label: "Estoque Médio (R$)", key: "estoqueMedioRS", format: "currency" },
    { label: "Estoque Médio (peças)", key: "estoqueMedioPecas", format: "number" },
    { label: "Giro", key: "giro", format: "multiplier" },
    { label: "Cobertura (dias)", key: "cobertura", format: "days" },
    { label: "Markdown (R$)", key: "markdown", format: "currency" },
    { label: "Produção (peças)", key: "producao", format: "number" },
    { label: "GMROI", key: "gmroi", format: "multiplier" },
  ];

  const formatValue = (value: number, format: string): string => {
    switch (format) {
      case "currency":
        return `R$ ${value.toLocaleString('pt-BR')}`;
      case "percent":
        return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      case "pmv":
        return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
      case "days":
        return `${value} dias`;
      case "multiplier":
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      default:
        return value.toLocaleString('pt-BR');
    }
  };

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
              <span className="text-[#F6F3AA] text-xl">Fashion Mind | Planejamento de Metas por Canal</span>
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
        {/* Section 1: Desdobramento por Canal */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-sm border-t-4 border-[#7598CF] mx-[0px] mt-[0px] mb-[20px] px-[24px] py-[14px]">
          <h2 className="text-[#28071C] mb-6 text-[16px]">Desdobramento por Canal</h2>
          
          <div className="grid grid-cols-3 gap-6 mb-4">
            {/* Atacado */}
            <div className="bg-white rounded-xl p-4 shadow-md border-2 border-[#7598CF]/30">
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Atacado - Participação (%)
              </label>
              <input
                type="number"
                value={atacadoPercent}
                onChange={(e) => setAtacadoPercent(Number(e.target.value))}
                className="w-full bg-transparent text-[#28071C] text-[14px] font-normal focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 rounded px-3 py-1.5 text-center border-2 border-[#7598CF]/20"
              />
            </div>

            {/* Varejo */}
            <div className="bg-white rounded-xl p-4 shadow-md border-2 border-[#7598CF]/30">
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Varejo - Participação (%)
              </label>
              <input
                type="number"
                value={varejoPercent}
                onChange={(e) => setVarejoPercent(Number(e.target.value))}
                className="w-full bg-transparent text-[#28071C] text-[14px] font-normal focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 rounded px-3 py-1.5 text-center border-2 border-[#7598CF]/20"
              />
            </div>

            {/* E-commerce */}
            <div className="bg-white rounded-xl p-4 shadow-md border-2 border-[#7598CF]/30">
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                E-commerce - Participação (%)
              </label>
              <input
                type="number"
                value={ecommercePercent}
                onChange={(e) => setEcommercePercent(Number(e.target.value))}
                className="w-full bg-transparent text-[#28071C] text-[14px] font-normal focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 rounded px-3 py-1.5 text-center border-2 border-[#7598CF]/20"
              />
            </div>
          </div>

          {/* Indicador de soma */}
          <div className="flex items-center justify-center space-x-2">
            {totalPercent === 100 ? (
              <>
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-green-600 text-[14px]">Total: {totalPercent}% ✓</span>
              </>
            ) : (
              <>
                <X className="w-5 h-5 text-red-600" />
                <span className="text-red-600">Total: {totalPercent}% (deve somar 100%)</span>
              </>
            )}
          </div>
        </div>

        {/* Barra de Status - Diferença para Meta */}
        <div className={`rounded-lg p-3 mb-6 text-center ${
          Math.abs(diferencaReceita) < 1000 
            ? 'bg-green-100 border border-green-300' 
            : 'bg-yellow-100 border border-yellow-300'
        }`}>
          <span className="text-[#28071C] text-sm">
            Diferença para a Meta da CIA: <strong>{formatValue(diferencaReceita, 'currency')}</strong> | <strong>{diferencaPercent >= 0 ? '+' : ''}{diferencaPercent.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Section 2: Simulador de Canais - Grid com 3 colunas */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-[#F6F3AA]">
          <h2 className="text-[#28071C] text-xl mb-6">Simulador de Canais</h2>

          <div className="grid grid-cols-4 gap-4">
            {/* Coluna de Labels */}
            <div className="space-y-2">
              <div className="h-12 flex items-center justify-center bg-[#28071C]/5 rounded-t-lg">
                <span className="text-[#28071C]/70 text-sm uppercase tracking-wide">KPI</span>
              </div>
              {kpiFields.map((field, idx) => (
                <div key={idx} className="h-16 flex items-center px-3 bg-white/50 rounded-lg">
                  <span className="text-[#28071C]/70 text-xs">{field.label}</span>
                </div>
              ))}
            </div>

            {/* Coluna Atacado */}
            <div className="space-y-2">
              <div className="h-12 flex items-center justify-center bg-[#7598CF] rounded-t-lg">
                <span className="text-white uppercase tracking-wide text-[14px]">Atacado</span>
              </div>
              {kpiFields.map((field, idx) => (
                <div key={idx} className="h-16 flex items-center px-3 bg-white rounded-lg border border-[#7598CF]/20">
                  <input
                    type="text"
                    value={formatValue(atacadoData[field.key as keyof ChannelData], field.format)}
                    onChange={(e) => {
                      const numValue = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                      if (!isNaN(numValue)) {
                        handleUpdateChannelData('atacado', field.key as keyof ChannelData, numValue);
                      }
                    }}
                    className="w-full bg-transparent text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 rounded px-2 py-1"
                  />
                </div>
              ))}
            </div>

            {/* Coluna Varejo */}
            <div className="space-y-2">
              <div className="h-12 flex items-center justify-center bg-[#7598CF] rounded-t-lg">
                <span className="text-white uppercase tracking-wide text-[14px]">Varejo</span>
              </div>
              {kpiFields.map((field, idx) => (
                <div key={idx} className="h-16 flex items-center px-3 bg-white rounded-lg border border-[#7598CF]/20">
                  <input
                    type="text"
                    value={formatValue(varejoData[field.key as keyof ChannelData], field.format)}
                    onChange={(e) => {
                      const numValue = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                      if (!isNaN(numValue)) {
                        handleUpdateChannelData('varejo', field.key as keyof ChannelData, numValue);
                      }
                    }}
                    className="w-full bg-transparent text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 rounded px-2 py-1"
                  />
                </div>
              ))}
            </div>

            {/* Coluna E-commerce */}
            <div className="space-y-2">
              <div className="h-12 flex items-center justify-center bg-[#7598CF] rounded-t-lg">
                <span className="text-white uppercase tracking-wide text-[14px]">E-commerce</span>
              </div>
              {kpiFields.map((field, idx) => (
                <div key={idx} className="h-16 flex items-center px-3 bg-white rounded-lg border border-[#7598CF]/20">
                  <input
                    type="text"
                    value={formatValue(ecommerceData[field.key as keyof ChannelData], field.format)}
                    onChange={(e) => {
                      const numValue = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                      if (!isNaN(numValue)) {
                        handleUpdateChannelData('ecommerce', field.key as keyof ChannelData, numValue);
                      }
                    }}
                    className="w-full bg-transparent text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 rounded px-2 py-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Barra de Ações */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button className="flex items-center px-6 py-3 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-md">
              <Save className="w-5 h-5 mr-2" />
              Salvar Cenário
            </button>
            <button 
              onClick={() => setShowCompareModal(true)}
              className="flex items-center px-6 py-3 bg-white text-[#7598CF] border-2 border-[#7598CF] rounded-lg hover:bg-[#7598CF]/10 transition-all shadow-md"
            >
              <GitCompare className="w-5 h-5 mr-2" />
              Comparar Cenários
            </button>
            <button className="flex items-center px-6 py-3 bg-white text-[#7598CF] border-2 border-[#7598CF] rounded-lg hover:bg-[#7598CF]/10 transition-all shadow-md">
              <Download className="w-5 h-5 mr-2" />
              Exportar
            </button>
          </div>

          <button 
            className={`flex items-center px-6 py-3 rounded-lg transition-all shadow-md ${
              Math.abs(diferencaReceita) < 1000 
                ? 'bg-[#28071C] text-white hover:bg-[#28071C]/90' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={Math.abs(diferencaReceita) >= 1000}
          >
            <Lock className="w-5 h-5 mr-2" />
            Aplicar Metas
          </button>
        </div>
      </main>

      {/* Modal de Comparação */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-[#28071C] text-2xl mb-6">Selecione os cenários para comparar</h3>
            
            <div className="space-y-4 mb-6">
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={selectedScenarios.scenarioA}
                  onChange={(e) => setSelectedScenarios({ ...selectedScenarios, scenarioA: e.target.checked })}
                  className="w-5 h-5 border-2 border-[#28071C] rounded accent-[#28071C] cursor-pointer"
                />
                <span className="text-[#28071C]">Cenário A - Conservador</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={selectedScenarios.scenarioB}
                  onChange={(e) => setSelectedScenarios({ ...selectedScenarios, scenarioB: e.target.checked })}
                  className="w-5 h-5 border-2 border-[#28071C] rounded accent-[#28071C] cursor-pointer"
                />
                <span className="text-[#28071C]">Cenário B - Moderado</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={selectedScenarios.scenarioC}
                  onChange={(e) => setSelectedScenarios({ ...selectedScenarios, scenarioC: e.target.checked })}
                  className="w-5 h-5 border-2 border-[#28071C] rounded accent-[#28071C] cursor-pointer"
                />
                <span className="text-[#28071C]">Cenário C - Agressivo</span>
              </label>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => setShowCompareModal(false)}
                className="flex-1 px-6 py-3 bg-white text-[#28071C] border-2 border-[#28071C] rounded-lg hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  // Aqui você implementaria a lógica de comparação
                  setShowCompareModal(false);
                }}
                className="flex-1 px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all"
              >
                Gerar Visão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}