import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Calendar,
  Clock,
  Edit,
  Trash2,
  Save
} from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface PlanningCycle {
  id: number;
  name: string;
  startMonth: string;
  endMonth: string;
}

interface LeadTimeRule {
  id: number;
  type: 'producao' | 'pedido';
  grupo: string;
  categoria: string;
  subcategoria: string;
  nivelRisco: string;
  faixaPreco: string;
  leadTime: number;
  unit: 'dias' | 'meses';
}

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const grupos = ["Vestuário", "Acessórios", "Calçados", "Joias"];
const categorias = ["Blusas", "Vestidos", "Calças", "Saias", "Jaquetas"];
const subcategorias = ["Casual", "Formal", "Esportivo", "Festa"];
const niveisRisco = ["Básico", "Moda", "Alta Moda"];
const faixasPreco = ["Econômico", "Médio", "Premium", "Luxo"];

export default function OperationSettings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  // Estados para Ciclos de Planejamento
  const [cycleName, setCycleName] = useState("");
  const [startMonth, setStartMonth] = useState("Janeiro");
  const [endMonth, setEndMonth] = useState("Dezembro");
  const [planningCycles, setPlanningCycles] = useState<PlanningCycle[]>([
    { id: 1, name: "Verão 2027", startMonth: "Outubro", endMonth: "Março" },
    { id: 2, name: "Inverno 2027", startMonth: "Abril", endMonth: "Setembro" },
  ]);

  // Estados para Lead Times
  const [leadTimeType, setLeadTimeType] = useState<'producao' | 'pedido'>('producao');
  const [selectedGrupo, setSelectedGrupo] = useState("");
  const [selectedCategoria, setSelectedCategoria] = useState("");
  const [selectedSubcategoria, setSelectedSubcategoria] = useState("");
  const [selectedNivelRisco, setSelectedNivelRisco] = useState("");
  const [selectedFaixaPreco, setSelectedFaixaPreco] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState(30);
  const [leadTimeUnit, setLeadTimeUnit] = useState<'dias' | 'meses'>('dias');

  const [leadTimeRules, setLeadTimeRules] = useState<LeadTimeRule[]>([
    {
      id: 1,
      type: 'producao',
      grupo: "Vestuário",
      categoria: "Blusas",
      subcategoria: "Casual",
      nivelRisco: "Moda",
      faixaPreco: "Médio",
      leadTime: 45,
      unit: 'dias'
    },
    {
      id: 2,
      type: 'pedido',
      grupo: "Acessórios",
      categoria: "Vestidos",
      subcategoria: "Formal",
      nivelRisco: "Alta Moda",
      faixaPreco: "Premium",
      leadTime: 60,
      unit: 'dias'
    },
  ]);

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

  const handleSaveCycle = () => {
    if (!cycleName.trim()) {
      alert("Por favor, preencha o nome do ciclo.");
      return;
    }

    const newCycle: PlanningCycle = {
      id: planningCycles.length + 1,
      name: cycleName,
      startMonth,
      endMonth,
    };

    setPlanningCycles([...planningCycles, newCycle]);
    setCycleName("");
    setStartMonth("Janeiro");
    setEndMonth("Dezembro");
  };

  const handleDeleteCycle = (id: number) => {
    setPlanningCycles(planningCycles.filter(cycle => cycle.id !== id));
  };

  const handleSaveLeadTimeRule = () => {
    if (!selectedGrupo || !selectedCategoria || !selectedNivelRisco) {
      alert("Por favor, preencha pelo menos Grupo, Categoria e Nível de Risco.");
      return;
    }

    const newRule: LeadTimeRule = {
      id: leadTimeRules.length + 1,
      type: leadTimeType,
      grupo: selectedGrupo,
      categoria: selectedCategoria,
      subcategoria: selectedSubcategoria,
      nivelRisco: selectedNivelRisco,
      faixaPreco: selectedFaixaPreco,
      leadTime: leadTimeDays,
      unit: leadTimeUnit,
    };

    setLeadTimeRules([...leadTimeRules, newRule]);

    // Reset form
    setSelectedGrupo("");
    setSelectedCategoria("");
    setSelectedSubcategoria("");
    setSelectedNivelRisco("");
    setSelectedFaixaPreco("");
    setLeadTimeDays(30);
  };

  const handleDeleteRule = (id: number) => {
    setLeadTimeRules(leadTimeRules.filter(rule => rule.id !== id));
  };

  if (!user) {
    return null;
  }

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
              <span className="text-[#F6F3AA] text-xl">Fashion Mind | Configurações de Operação</span>
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
        {/* Card 1: Ciclos de Planejamento */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="flex items-center space-x-3 mb-6">
            <Calendar className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Ciclos de Planejamento</h2>
          </div>

          <p className="text-[#28071C]/70 text-sm mb-6">
            Defina os períodos de início e fim das coleções e estações
          </p>

          {/* Campos de Entrada */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Nome do Ciclo
              </label>
              <input
                type="text"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                placeholder="Ex: Verão 2027"
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
              />
            </div>

            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Mês de Início
              </label>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                {months.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Mês de Fim
              </label>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                {months.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleSaveCycle}
            className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md mb-6"
          >
            <Save className="w-5 h-5 mr-2" />
            Salvar Ciclo
          </button>

          {/* Tabela de Ciclos Ativos */}
          <div className="bg-white rounded-lg overflow-hidden border border-[#7598CF]/20">
            <table className="w-full">
              <thead className="bg-[#7598CF]">
                <tr>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Nome</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Início</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Fim</th>
                  <th className="px-4 py-3 text-center text-white text-sm uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {planningCycles.map((cycle) => (
                  <tr key={cycle.id} className="border-b border-[#28071C]/10 hover:bg-gray-50">
                    <td className="px-4 py-3 text-[#28071C]">{cycle.name}</td>
                    <td className="px-4 py-3 text-[#28071C]">{cycle.startMonth}</td>
                    <td className="px-4 py-3 text-[#28071C]">{cycle.endMonth}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center space-x-2">
                        <button className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCycle(cycle.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 2: Configuração de Lead Times */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
          <div className="flex items-center space-x-3 mb-6">
            <Clock className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Configuração de Lead Times</h2>
          </div>

          {/* Toggle de Tipo */}
          <div className="mb-6">
            <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">
              Tipo de Lead Time
            </label>
            <div className="flex space-x-4">
              <button
                onClick={() => setLeadTimeType('producao')}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  leadTimeType === 'producao'
                    ? 'bg-[#7598CF] text-white shadow-md'
                    : 'bg-white text-[#28071C] border-2 border-[#7598CF]/30'
                }`}
              >
                Produção
              </button>
              <button
                onClick={() => setLeadTimeType('pedido')}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  leadTimeType === 'pedido'
                    ? 'bg-[#7598CF] text-white shadow-md'
                    : 'bg-white text-[#28071C] border-2 border-[#7598CF]/30'
                }`}
              >
                Pedido
              </button>
            </div>
          </div>

          {/* Filtros de Nível (Hierarquia) */}
          <div className="mb-6">
            <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">
              Filtros de Nível
            </label>
            <div className="grid grid-cols-5 gap-4">
              <div>
                <label className="block text-[#28071C]/70 text-xs mb-2">Grupo</label>
                <select
                  value={selectedGrupo}
                  onChange={(e) => setSelectedGrupo(e.target.value)}
                  className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                >
                  <option value="">Selecione</option>
                  {grupos.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-xs mb-2">Categoria</label>
                <select
                  value={selectedCategoria}
                  onChange={(e) => setSelectedCategoria(e.target.value)}
                  className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                >
                  <option value="">Selecione</option>
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-xs mb-2">Subcategoria</label>
                <select
                  value={selectedSubcategoria}
                  onChange={(e) => setSelectedSubcategoria(e.target.value)}
                  className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                >
                  <option value="">Selecione</option>
                  {subcategorias.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-xs mb-2">Nível de Risco</label>
                <select
                  value={selectedNivelRisco}
                  onChange={(e) => setSelectedNivelRisco(e.target.value)}
                  className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                >
                  <option value="">Selecione</option>
                  {niveisRisco.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#28071C]/70 text-xs mb-2">Faixa de Preço</label>
                <select
                  value={selectedFaixaPreco}
                  onChange={(e) => setSelectedFaixaPreco(e.target.value)}
                  className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                >
                  <option value="">Selecione</option>
                  {faixasPreco.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Valor do Lead Time */}
          <div className="mb-6">
            <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">
              Prazo (Lead Time)
            </label>
            <div className="flex space-x-4">
              <input
                type="number"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(Number(e.target.value))}
                className="flex-1 bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                min="0"
              />
              <select
                value={leadTimeUnit}
                onChange={(e) => setLeadTimeUnit(e.target.value as 'dias' | 'meses')}
                className="bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                <option value="dias">Dias</option>
                <option value="meses">Meses</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSaveLeadTimeRule}
            className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md mb-6"
          >
            <Save className="w-5 h-5 mr-2" />
            Salvar Regra de Suprimento
          </button>

          {/* Tabela de Regras Ativas */}
          <div className="bg-white rounded-lg overflow-hidden border border-[#7598CF]/20">
            <table className="w-full">
              <thead className="bg-[#F6F3AA]">
                <tr>
                  <th className="px-4 py-3 text-left text-[#28071C] text-sm uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-left text-[#28071C] text-sm uppercase tracking-wide">Grupo</th>
                  <th className="px-4 py-3 text-left text-[#28071C] text-sm uppercase tracking-wide">Categoria</th>
                  <th className="px-4 py-3 text-left text-[#28071C] text-sm uppercase tracking-wide">Nível</th>
                  <th className="px-4 py-3 text-left text-[#28071C] text-sm uppercase tracking-wide">Lead Time</th>
                  <th className="px-4 py-3 text-center text-[#28071C] text-sm uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {leadTimeRules.map((rule) => (
                  <tr key={rule.id} className="border-b border-[#28071C]/10 hover:bg-gray-50">
                    <td className="px-4 py-3 text-[#28071C] capitalize">{rule.type}</td>
                    <td className="px-4 py-3 text-[#28071C]">{rule.grupo}</td>
                    <td className="px-4 py-3 text-[#28071C]">{rule.categoria}</td>
                    <td className="px-4 py-3 text-[#28071C]">{rule.nivelRisco}</td>
                    <td className="px-4 py-3 text-[#28071C]">{rule.leadTime} {rule.unit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center space-x-2">
                        <button className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
