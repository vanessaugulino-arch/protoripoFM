import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { 
  ArrowLeft, 
  LogOut, 
  User, 
  DollarSign,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Package,
  TrendingUp,
  Percent,
  Grid3x3,
  Lock
} from "lucide-react";
import logoTFO from "figma:asset/518a2b0fbf767e7d53e8db6869b3fce6e2473ef2.png";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface Variant {
  id: string;
  category: string;
  subcategory: string;
  skuQuantity: number; // Quantidade de SKUs/variantes
}

interface Look {
  id: string;
  name: string;
  variants: Variant[];
}

interface Family {
  id: string;
  name: string;
  looks: Look[];
}

export default function SortimentPlan() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedCycle, setSelectedCycle] = useState("Verão 2026");
  const [selectedDepartment, setSelectedDepartment] = useState("Feminino");
  
  // Indicadores expandidos
  const [pmvExpanded, setPmvExpanded] = useState(false);
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  
  // Metas recebidas
  const [targets] = useState({
    receita: 1850000,
    pmv: 165,
    pmvP1: 120,
    pmvP2: 165,
    pmvP3: 220,
    volumeProducao: 11200,
    volumeCompra: 3800,
    volumeTotal: 15000,
    basicoCores: 4500,
    basicoColeção: 2800,
    moda: 5200,
    altaModa: 2500
  });

  // Famílias e Looks
  const [families, setFamilies] = useState<Family[]>([
    {
      id: "1",
      name: "História 1 - Essenciais",
      looks: [
        {
          id: "l1",
          name: "Look Básico Casual",
          variants: [
            { id: "v1", category: "Blusas", subcategory: "T-Shirts", skuQuantity: 150 },
            { id: "v2", category: "Calças", subcategory: "Jeans", skuQuantity: 120 },
          ]
        }
      ]
    }
  ]);

  const [allocatedVolume, setAllocatedVolume] = useState(0);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      
      if (userData.profile !== "Estilo") {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    // Calcular volume alocado
    let total = 0;
    families.forEach(family => {
      family.looks.forEach(look => {
        look.variants.forEach(variant => {
          total += variant.skuQuantity;
        });
      });
    });
    setAllocatedVolume(total);
  }, [families]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  const addFamily = () => {
    const newFamily: Family = {
      id: Date.now().toString(),
      name: `História ${families.length + 1}`,
      looks: []
    };
    setFamilies([...families, newFamily]);
  };

  const addLook = (familyId: string) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        const newLook: Look = {
          id: Date.now().toString(),
          name: `Look ${family.looks.length + 1}`,
          variants: []
        };
        return { ...family, looks: [...family.looks, newLook] };
      }
      return family;
    }));
  };

  const addVariant = (familyId: string, lookId: string) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        return {
          ...family,
          looks: family.looks.map(look => {
            if (look.id === lookId) {
              const newVariant: Variant = {
                id: Date.now().toString(),
                category: "Selecione",
                subcategory: "",
                skuQuantity: 0
              };
              return { ...look, variants: [...look.variants, newVariant] };
            }
            return look;
          })
        };
      }
      return family;
    }));
  };

  const updateVariant = (familyId: string, lookId: string, variantId: string, field: string, value: any) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        return {
          ...family,
          looks: family.looks.map(look => {
            if (look.id === lookId) {
              return {
                ...look,
                variants: look.variants.map(variant => {
                  if (variant.id === variantId) {
                    return { ...variant, [field]: value };
                  }
                  return variant;
                })
              };
            }
            return look;
          })
        };
      }
      return family;
    }));
  };

  const deleteVariant = (familyId: string, lookId: string, variantId: string) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        return {
          ...family,
          looks: family.looks.map(look => {
            if (look.id === lookId) {
              return {
                ...look,
                variants: look.variants.filter(v => v.id !== variantId)
              };
            }
            return look;
          })
        };
      }
      return family;
    }));
  };

  const deleteLook = (familyId: string, lookId: string) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        return {
          ...family,
          looks: family.looks.filter(l => l.id !== lookId)
        };
      }
      return family;
    }));
  };

  const deleteFamily = (familyId: string) => {
    setFamilies(families.filter(f => f.id !== familyId));
  };

  const updateFamilyName = (familyId: string, name: string) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        return { ...family, name };
      }
      return family;
    }));
  };

  const updateLookName = (familyId: string, lookId: string, name: string) => {
    setFamilies(families.map(family => {
      if (family.id === familyId) {
        return {
          ...family,
          looks: family.looks.map(look => {
            if (look.id === lookId) {
              return { ...look, name };
            }
            return look;
          })
        };
      }
      return family;
    }));
  };

  const checkMOQ = (variant: Variant): boolean => {
    if (variant.skuQuantity === 0) return true;
    const avgVolume = variant.skuQuantity;
    return avgVolume >= 50; // MOQ fixo em 50
  };

  const progressPercentage = (allocatedVolume / targets.volumeTotal) * 100;

  const saveProposal = () => {
    sessionStorage.setItem("sortimentPlan", JSON.stringify(families));
    alert("Proposta Inicial salva com sucesso!");
  };

  if (!user) {
    return null;
  }

  // Média de venda por SKU por categoria (mock data - deve vir do backend)
  const avgSalesPerSKU: { [key: string]: number } = {
    "Blusas": 100,
    "Calças": 80,
    "Vestidos": 120,
    "Saias": 90,
    "Jaquetas": 70,
    "Acessórios": 150,
  };

  // Calcular volume de vendas estimado
  const calculateSalesVolume = (category: string, skuQuantity: number): number => {
    const avgSales = avgSalesPerSKU[category] || 100;
    return skuQuantity * avgSales;
  };

  // Calcular volume total de vendas
  const calculateTotalSalesVolume = (): number => {
    let total = 0;
    families.forEach(family => {
      family.looks.forEach(look => {
        look.variants.forEach(variant => {
          total += calculateSalesVolume(variant.category, variant.skuQuantity);
        });
      });
    });
    return total;
  };

  const totalSalesVolume = calculateTotalSalesVolume();

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
              
              <span className="text-[#F6F3AA] text-xl">Fashion Mind | Plano de Sortimento</span>
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
        {/* Container 1: Seleção de Ciclo e Departamento */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                Ciclo de Planejamento
              </label>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
              >
                <option value="Verão 2026">Verão 2026</option>
                <option value="Inverno 2026">Inverno 2026</option>
                <option value="Verão 2027">Verão 2027</option>
              </select>
            </div>

            <div>
              <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
                Departamento
              </label>
              <div className="w-full bg-[#E7E7E6] rounded-lg px-4 py-3 text-[#28071C] font-medium">
                {selectedDepartment}
              </div>
            </div>
          </div>
        </div>

        {/* Container 2: Metas Recebidas */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[#28071C] text-xl mb-4">Metas Recebidas do Ciclo</h2>
          <div className="grid grid-cols-4 gap-4">
            {/* Card 1: Receita */}
            <div className="bg-[#E7E7E6]/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                <label className="text-[#28071C]/70 text-xs uppercase tracking-wide">Receita</label>
              </div>
              <div className="text-2xl text-[#28071C]">
                R$ {targets.receita.toLocaleString('pt-BR')}
              </div>
            </div>

            {/* Card 2: PMV com Expansão */}
            <div className="bg-[#E7E7E6]/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-xs uppercase tracking-wide">PMV</label>
                </div>
                <button
                  onClick={() => setPmvExpanded(!pmvExpanded)}
                  className="text-[#7598CF] hover:text-[#7598CF]/70"
                >
                  {pmvExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-2xl text-[#28071C] mb-2">
                R$ {targets.pmv}
              </div>
              {pmvExpanded && (
                <div className="mt-3 pt-3 border-t border-[#28071C]/20 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#28071C]/70">P1:</span>
                    <span className="text-[#28071C]">R$ {targets.pmvP1}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#28071C]/70">P2:</span>
                    <span className="text-[#28071C]">R$ {targets.pmvP2}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#28071C]/70">P3:</span>
                    <span className="text-[#28071C]">R$ {targets.pmvP3}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Volume Total */}
            <div className="bg-[#E7E7E6]/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Package className="w-4 h-4 text-[#28071C]/70" />
                <label className="text-[#28071C]/70 text-xs uppercase tracking-wide">Volume Total</label>
              </div>
              <div className="text-2xl text-[#28071C] mb-1">
                {targets.volumeTotal.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-[#28071C]/60">
                Prod: {targets.volumeProducao.toLocaleString('pt-BR')} + Compra: {targets.volumeCompra.toLocaleString('pt-BR')}
              </div>
            </div>

            {/* Card 4: Matriz de Risco com Expansão */}
            <div className="bg-[#E7E7E6]/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-xs uppercase tracking-wide">Matriz de Risco</label>
                </div>
                <button
                  onClick={() => setMatrixExpanded(!matrixExpanded)}
                  className="text-[#7598CF] hover:text-[#7598CF]/70"
                >
                  {matrixExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-sm text-[#28071C]">
                <div>Básico: {targets.basicoCores + targets.basicoColeção}</div>
                <div>Moda: {targets.moda}</div>
                <div>Alta: {targets.altaModa}</div>
              </div>
              {matrixExpanded && (
                <div className="mt-3 pt-3 border-t border-[#28071C]/20 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#28071C]/70">Básicos Cores:</span>
                    <span className="text-[#28071C]">{targets.basicoCores}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#28071C]/70">Básicos Coleção:</span>
                    <span className="text-[#28071C]">{targets.basicoColeção}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Container 3: Barra de Ocupação Global - STICKY */}
        <div className="sticky top-0 z-10 bg-white rounded-2xl p-6 mb-6 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[#28071C] text-lg mb-1">Ocupação de Volume em SKUs</h3>
              <p className="text-[#28071C]/60 text-sm">
                {allocatedVolume.toLocaleString('pt-BR')} SKUs alocados | Volume de Vendas: {totalSalesVolume.toLocaleString('pt-BR')} peças
              </p>
            </div>
            <div className="text-right">
              <span className={`text-3xl ${progressPercentage > 100 ? 'text-red-600' : 'text-[#7598CF]'}`}>
                {progressPercentage.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="w-full bg-[#E7E7E6] rounded-full h-6 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progressPercentage > 100 ? 'bg-red-500' : 'bg-gradient-to-r from-[#7598CF] to-[#B8A8E0]'
              }`}
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* ======================================== */}
        {/* SEÇÃO: WORKSPACE DE SORTIMENTO */}
        {/* ======================================== */}

        <div className="mb-8">
          {/* Header da Seção */}
          <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border-t-4 border-[#7598CF]">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Grid3x3 className="w-6 h-6 text-[#28071C] mr-3" />
                <div>
                  <h2 className="text-[#28071C] text-2xl mb-1">Engenharia de Sortimento</h2>
                  <p className="text-[#28071C]/60 text-sm">
                    Distribua o volume em Histórias, Looks e Variantes de Produto
                  </p>
                </div>
              </div>
              <button
                onClick={addFamily}
                className="flex items-center px-4 py-2 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar História/Família
              </button>
            </div>
          </div>

          {/* Famílias/Histórias */}
          {families.map((family) => (
            <div key={family.id} className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
              {/* Cabeçalho da Família */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-[#28071C]/10">
                <input
                  type="text"
                  value={family.name}
                  onChange={(e) => updateFamilyName(family.id, e.target.value)}
                  className="text-xl font-bold text-[#28071C] bg-[#E7E7E6] rounded-lg px-4 py-2 border-2 border-transparent hover:border-[#7598CF] focus:border-[#7598CF] focus:outline-none"
                  placeholder="Nome da História/Família"
                />
                <button
                  onClick={() => deleteFamily(family.id)}
                  className="text-red-500 hover:text-red-700 transition-colors p-2"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Looks */}
              <div className="space-y-4">
                {family.looks.map((look) => (
                  <div key={look.id} className="bg-[#E7E7E6]/50 rounded-xl p-5">
                    {/* Cabeçalho do Look */}
                    <div className="flex items-center justify-between mb-4">
                      <input
                        type="text"
                        value={look.name}
                        onChange={(e) => updateLookName(family.id, look.id, e.target.value)}
                        className="text-lg font-semibold text-[#28071C] bg-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#7598CF]"
                        placeholder="Nome do Look"
                      />
                      <button
                        onClick={() => deleteLook(family.id, look.id)}
                        className="text-red-500 hover:text-red-700 transition-colors p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Tabela de Variantes */}
                    {look.variants.length > 0 && (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b-2 border-[#28071C]/20">
                              <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[180px]">
                                Categoria
                              </th>
                              <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[180px]">
                                Subcategoria
                              </th>
                              <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[100px]">
                                Variantes
                              </th>
                              <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[120px]">
                                Vol. Vendas
                              </th>
                              <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[60px]">
                                Ações
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {look.variants.map((variant, index) => {
                              const isViable = checkMOQ(variant);
                              const avgVolume = variant.skuQuantity;
                              
                              return (
                                <tr
                                  key={variant.id}
                                  className={`border-b border-[#28071C]/10 ${
                                    index % 2 === 0 ? "bg-white" : "bg-[#E7E7E6]/20"
                                  }`}
                                >
                                  <td className="py-3 px-4">
                                    <select
                                      value={variant.category}
                                      onChange={(e) => updateVariant(family.id, look.id, variant.id, 'category', e.target.value)}
                                      className="w-full bg-[#E7E7E6] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                                    >
                                      <option value="Selecione">Selecione</option>
                                      <option value="Blusas">Blusas</option>
                                      <option value="Calças">Calças</option>
                                      <option value="Vestidos">Vestidos</option>
                                      <option value="Saias">Saias</option>
                                      <option value="Jaquetas">Jaquetas</option>
                                      <option value="Acessórios">Acessórios</option>
                                    </select>
                                  </td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={variant.subcategory}
                                      onChange={(e) => updateVariant(family.id, look.id, variant.id, 'subcategory', e.target.value)}
                                      className="w-full bg-[#E7E7E6] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                                    >
                                      <option value="">Selecione</option>
                                      {variant.category === "Blusas" && (
                                        <>
                                          <option value="T-Shirts">T-Shirts</option>
                                          <option value="Camisas">Camisas</option>
                                          <option value="Regatas">Regatas</option>
                                        </>
                                      )}
                                      {variant.category === "Calças" && (
                                        <>
                                          <option value="Jeans">Jeans</option>
                                          <option value="Alfaiataria">Alfaiataria</option>
                                          <option value="Legging">Legging</option>
                                        </>
                                      )}
                                      {variant.category === "Vestidos" && (
                                        <>
                                          <option value="Curtos">Curtos</option>
                                          <option value="Midi">Midi</option>
                                          <option value="Longos">Longos</option>
                                        </>
                                      )}
                                    </select>
                                  </td>
                                  <td className="py-3 px-4">
                                    <input
                                      type="number"
                                      value={variant.skuQuantity || ''}
                                      onChange={(e) => updateVariant(family.id, look.id, variant.id, 'skuQuantity', parseInt(e.target.value) || 0)}
                                      className="w-full bg-[#E7E7E6] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                                      min="0"
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    <input
                                      type="number"
                                      value={calculateSalesVolume(variant.category, variant.skuQuantity)} // Volume de vendas estimado
                                      className="w-full bg-[#E7E7E6] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                                      readOnly
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    <button
                                      onClick={() => deleteVariant(family.id, look.id, variant.id)}
                                      className="text-red-500 hover:text-red-700 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Botão Adicionar Variante */}
                    <button
                      onClick={() => addVariant(family.id, look.id)}
                      className="w-full flex items-center justify-center px-4 py-3 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Variante
                    </button>
                  </div>
                ))}

                {/* Botão Adicionar Look */}
                <button
                  onClick={() => addLook(family.id)}
                  className="w-full flex items-center justify-center px-4 py-3 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Look
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Botão de Ação Final */}
        <div className="flex justify-end">
          <button 
            onClick={saveProposal}
            className="flex items-center px-8 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-lg"
          >
            <Package className="w-5 h-5 mr-2" />
            Salvar Proposta Inicial
          </button>
        </div>
      </main>
    </div>
  );
}