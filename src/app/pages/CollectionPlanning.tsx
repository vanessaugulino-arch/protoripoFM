import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Save,
  Edit3,
  Plus,
  Trash2,
  CheckCircle,
  Download,
  AlertTriangle,
  TrendingUp,
  Package,
  DollarSign,
} from "lucide-react";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface Theme {
  id: string;
  name: string;
  participation: number;
  looksQuantity: number;
  colors: ThemeColor[];
}

interface ThemeColor {
  id: string;
  name: string;
  family: string;
  intensity: string;
  participation: number;
}

interface Subcategory {
  id: string;
  name: string;
  participation: number;
  avgPrice: number;
  volume: number;
  margin: number;
}

interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}


export default function CollectionPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedCycle, setSelectedCycle] = useState("Verão 2026");
  const [hasThemes, setHasThemes] = useState(false);
  const [showSKUPlan, setShowSKUPlan] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Temas e looks
  const [themes, setThemes] = useState<Theme[]>([
    { id: "1", name: "", participation: 0, looksQuantity: 0, colors: [] }
  ]);

  // Metas da Direção Criativa (vindo da tela anterior)
  const creativeMetas = {
    priceRanges: { p1: "119-169", p2: "179-259", p3: "269-389" },
    avgPrice: 195,
    volume: 7706,
    otb: 1368000,
    expectedMargin: 48,
  };

  // Categorias do grupo Feminino
  const [categories, setCategories] = useState<Category[]>([
    {
      id: "vestidos",
      name: "Vestidos",
      subcategories: [
        { id: "curtos", name: "Vestidos Curtos", participation: 40, avgPrice: 189, volume: 1234, margin: 46 },
        { id: "longos", name: "Vestidos Longos", participation: 35, avgPrice: 229, volume: 1080, margin: 48 },
        { id: "midi", name: "Vestidos Midi", participation: 25, avgPrice: 199, volume: 772, margin: 47 }
      ]
    },
    {
      id: "blusas",
      name: "Blusas",
      subcategories: [
        { id: "manga-curta", name: "Manga Curta", participation: 50, avgPrice: 159, volume: 1541, margin: 45 },
        { id: "manga-longa", name: "Manga Longa", participation: 30, avgPrice: 179, volume: 925, margin: 46 },
        { id: "regata", name: "Regatas", participation: 20, avgPrice: 139, volume: 617, margin: 44 }
      ]
    }
  ]);


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

    // Check if themes are already configured
    const storedThemes = sessionStorage.getItem("collectionThemes");
    if (storedThemes) {
      setThemes(JSON.parse(storedThemes));
      setHasThemes(true);
    }
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  const addTheme = () => {
    if (themes.length < 4) {
      setThemes([...themes, { id: Date.now().toString(), name: "", participation: 0, looksQuantity: 0, colors: [] }]);
    }
  };

  const removeTheme = (themeId: string) => {
    setThemes(themes.filter(t => t.id !== themeId));
  };

  const updateTheme = (themeId: string, field: string, value: string | number) => {
    setThemes(themes.map(t => t.id === themeId ? { ...t, [field]: value } : t));
  };

  const addColorToTheme = (themeId: string) => {
    setThemes(themes.map(t =>
      t.id === themeId
        ? { ...t, colors: [...t.colors, { id: Date.now().toString(), name: "", family: "Azul", intensity: "Médio", participation: 0 }] }
        : t
    ));
  };

  const removeColorFromTheme = (themeId: string, colorId: string) => {
    setThemes(themes.map(t =>
      t.id === themeId
        ? { ...t, colors: t.colors.filter(c => c.id !== colorId) }
        : t
    ));
  };

  const updateColor = (themeId: string, colorId: string, field: string, value: string | number) => {
    setThemes(themes.map(t =>
      t.id === themeId
        ? {
            ...t,
            colors: t.colors.map(c => c.id === colorId ? { ...c, [field]: value } : c)
          }
        : t
    ));
  };

  const saveThemes = () => {
    sessionStorage.setItem("collectionThemes", JSON.stringify(themes));
    setHasThemes(true);
  };

  const updateSubcategory = (categoryId: string, subcategoryId: string, field: string, value: number) => {
    setCategories(categories.map(cat =>
      cat.id === categoryId
        ? {
            ...cat,
            subcategories: cat.subcategories.map(sub =>
              sub.id === subcategoryId ? { ...sub, [field]: value } : sub
            )
          }
        : cat
    ));
  };

  // Cálculos consolidados
  const calculateConsolidated = () => {
    let totalVolume = 0;
    let totalRevenue = 0;

    categories.forEach(cat => {
      cat.subcategories.forEach(sub => {
        totalVolume += sub.volume;
        totalRevenue += sub.volume * sub.avgPrice;
      });
    });

    const avgPrice = totalVolume > 0 ? totalRevenue / totalVolume : 0;
    const totalMargin = categories.reduce((sum, cat) => {
      const catMargin = cat.subcategories.reduce((s, sub) => s + sub.margin, 0) / cat.subcategories.length;
      return sum + catMargin;
    }, 0) / categories.length;

    return {
      currentPMV: avgPrice,
      currentVolume: totalVolume,
      currentMargin: totalMargin,
      gapPMV: avgPrice - creativeMetas.avgPrice,
      gapVolume: totalVolume - creativeMetas.volume,
      gapMargin: totalMargin - creativeMetas.expectedMargin,
    };
  };

  const consolidated = calculateConsolidated();

  if (!user) {
    return null;
  }

  const colorFamilies = ["Azul", "Vermelho", "Verde", "Amarelo", "Laranja", "Rosa", "Roxo", "Marrom", "Preto", "Branco", "Cinza", "Bege"];
  const colorIntensities = ["Claro", "Médio", "Escuro", "Pastel", "Neon"];

  // Tela 1: Cadastro de Temas e Looks
  if (!hasThemes) {
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
                <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Coleção</span>
                <span className="text-[#F6F3AA]/70 text-sm ml-3">Definição de Temas e Looks</span>
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
        <main className="max-w-[1600px] mx-auto px-6 py-8">
          {/* Seleção de Ciclo */}
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
              Ciclo de Planejamento
            </label>
            <select
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value)}
              className="w-full bg-[#F2F2F2] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
            >
              <option>Verão 2026</option>
              <option>Inverno 2026</option>
              <option>Verão 2027</option>
            </select>
          </div>

          {/* Container 1: Cadastro de Temas */}
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[#28071C] text-xl">Temas da Coleção</h2>
              {themes.length < 4 && (
                <button
                  onClick={addTheme}
                  className="flex items-center px-4 py-2 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Tema
                </button>
              )}
            </div>

            <div className="space-y-4">
              {themes.map((theme, index) => (
                <div key={theme.id} className="flex items-center gap-4 pb-4 border-b border-[#28071C]/10">
                  <div className="flex-1">
                    <label className="block text-[#28071C]/70 text-sm mb-2">
                      Nome do Tema {index + 1}
                    </label>
                    <input
                      type="text"
                      value={theme.name}
                      onChange={(e) => updateTheme(theme.id, 'name', e.target.value)}
                      placeholder="Ex: Tropical, Minimalista, Boho..."
                      className="w-full bg-[#F2F2F2] rounded-lg px-4 py-2 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-[#28071C]/70 text-sm mb-2">
                      Participação %
                    </label>
                    <input
                      type="number"
                      value={theme.participation}
                      onChange={(e) => updateTheme(theme.id, 'participation', parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#F2F2F2] rounded-lg px-4 py-2 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                    />
                  </div>
                  {themes.length > 1 && (
                    <button
                      onClick={() => removeTheme(theme.id)}
                      className="mt-7 text-red-600 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {themes.reduce((sum, t) => sum + t.participation, 0) !== 100 && (
              <div className="mt-4 flex items-center text-amber-600 text-sm">
                <AlertTriangle className="w-4 h-4 mr-2" />
                A soma das participações deve ser 100%. Atual: {themes.reduce((sum, t) => sum + t.participation, 0)}%
              </div>
            )}
          </div>

          {/* Container 2: Quantidades de Looks por Tema */}
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-[#28071C] text-xl mb-6">Quantidades de Looks por Tema</h2>

            <div className="space-y-4">
              {themes.filter(t => t.name).map((theme) => (
                <div key={theme.id} className="border-l-4 border-[#7598CF] pl-6 py-4 bg-[#F2F2F2]/30 rounded-r-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[#28071C] text-lg mb-2">{theme.name}</h3>
                    <div className="flex items-center gap-3">
                      <label className="text-[#28071C]/70 text-sm">
                        Quantidade de Looks:
                      </label>
                      <input
                        type="number"
                        value={theme.looksQuantity}
                        onChange={(e) => updateTheme(theme.id, 'looksQuantity', parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-24 bg-white rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                      />
                      <span className="text-[#28071C]/70 text-sm">looks</span>
                    </div>
                  </div>
                  <p className="text-[#28071C]/50 text-xs mt-2">
                    Participação: {theme.participation}% da coleção
                  </p>
                </div>
              ))}

              {themes.filter(t => t.name).length === 0 && (
                <p className="text-[#28071C]/50 text-sm italic text-center py-8">
                  Cadastre os temas acima para definir as quantidades de looks
                </p>
              )}
            </div>

            {themes.filter(t => t.name).length > 0 && (
              <div className="mt-6 p-4 bg-[#7598CF]/10 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[#28071C]/70 text-sm">Total de Looks Planejados:</span>
                  <span className="text-[#28071C] text-xl">
                    {themes.reduce((sum, t) => sum + (t.looksQuantity || 0), 0)} looks
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Container 3: Cadastro de Cores por Tema */}
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-[#28071C] text-xl mb-6">Cores por Tema</h2>

            <div className="space-y-6">
              {themes.filter(t => t.name).map((theme) => (
                <div key={theme.id} className="border-l-4 border-[#7598CF] pl-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[#28071C] text-lg">{theme.name}</h3>
                    <button
                      onClick={() => addColorToTheme(theme.id)}
                      className="flex items-center px-3 py-1 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all text-sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Adicionar Cor
                    </button>
                  </div>

                  {theme.colors.length === 0 ? (
                    <p className="text-[#28071C]/50 text-sm italic">
                      Nenhuma cor cadastrada para este tema
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {theme.colors.map((color) => (
                        <div key={color.id} className="flex items-center gap-3 bg-[#F2F2F2]/50 rounded-lg p-3">
                          <input
                            type="text"
                            value={color.name}
                            onChange={(e) => updateColor(theme.id, color.id, 'name', e.target.value)}
                            placeholder="Nome da cor"
                            className="flex-1 bg-white rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                          <select
                            value={color.family}
                            onChange={(e) => updateColor(theme.id, color.id, 'family', e.target.value)}
                            className="w-36 bg-white rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          >
                            {colorFamilies.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                          <select
                            value={color.intensity}
                            onChange={(e) => updateColor(theme.id, color.id, 'intensity', e.target.value)}
                            className="w-32 bg-white rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          >
                            {colorIntensities.map(i => (
                              <option key={i} value={i}>{i}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={color.participation}
                            onChange={(e) => updateColor(theme.id, color.id, 'participation', parseFloat(e.target.value) || 0)}
                            placeholder="%"
                            className="w-20 bg-white rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                          <button
                            onClick={() => removeColorFromTheme(theme.id, color.id)}
                            className="text-red-600 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Container 4: Botão de Salvamento */}
          <div className="flex justify-end">
            <button
              onClick={saveThemes}
              disabled={themes.reduce((sum, t) => sum + t.participation, 0) !== 100}
              className="flex items-center px-8 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Salvar e Continuar para Planejamento
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Tela 2: Planejamento de Coleção
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
              <span className="text-[#F6F3AA] text-xl font-semibold">Fashion Mind · Coleção</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Planejamento de Coleção</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setHasThemes(false)}
              className="flex items-center px-4 py-2 bg-white/20 text-[#F6F3AA] rounded-lg hover:bg-white/30 transition-all text-sm"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Revisar Temas
            </button>
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
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Container 1: Metas da Direção Criativa */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-[#7598CF]">
          <h2 className="text-[#28071C] text-xl mb-6">Metas Definidas pela Direção Criativa - Grupo Feminino</h2>

          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                  Faixas de Preço
                </label>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#28071C]/70">Entrada:</span>
                  <span className="text-[#28071C]">R$ {creativeMetas.priceRanges.p1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#28071C]/70">Médio:</span>
                  <span className="text-[#28071C]">R$ {creativeMetas.priceRanges.p2}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#28071C]/70">Premium:</span>
                  <span className="text-[#28071C]">R$ {creativeMetas.priceRanges.p3}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-4 h-4 text-[#28071C]/70" />
                <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                  PMV Esperado
                </label>
              </div>
              <div className="text-2xl text-[#28071C]">
                R$ {creativeMetas.avgPrice}
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Package className="w-4 h-4 text-[#28071C]/70" />
                <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                  Volume de Produção
                </label>
              </div>
              <div className="text-2xl text-[#28071C]">
                {creativeMetas.volume.toLocaleString('pt-BR')} pçs
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                  Margem Esperada
                </label>
              </div>
              <div className="text-2xl text-[#28071C]">
                {creativeMetas.expectedMargin}%
              </div>
            </div>
          </div>
        </div>

        {/* Container 2: Status Atual da Categoria */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-t-4 border-[#F6F3AA]">
          <h2 className="text-[#28071C] text-xl mb-6">Status Atual do Planejamento</h2>

          <div className="grid grid-cols-4 gap-6">
            <div>
              <label className="text-[#28071C]/70 text-sm uppercase tracking-wide mb-2 block">
                PMV Consolidado Atual
              </label>
              <div className="text-2xl text-[#28071C] mb-1">
                R$ {consolidated.currentPMV.toFixed(2)}
              </div>
              <div className={`text-sm flex items-center ${consolidated.gapPMV >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {consolidated.gapPMV >= 0 ? '+' : ''}{consolidated.gapPMV.toFixed(2)} vs meta
              </div>
            </div>

            <div>
              <label className="text-[#28071C]/70 text-sm uppercase tracking-wide mb-2 block">
                Volume Planejado
              </label>
              <div className="text-2xl text-[#28071C] mb-1">
                {consolidated.currentVolume.toLocaleString('pt-BR')} pçs
              </div>
              <div className={`text-sm flex items-center ${consolidated.gapVolume >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {consolidated.gapVolume >= 0 ? '+' : ''}{consolidated.gapVolume.toLocaleString('pt-BR')} vs meta
              </div>
            </div>

            <div>
              <label className="text-[#28071C]/70 text-sm uppercase tracking-wide mb-2 block">
                Margem Projetada
              </label>
              <div className="text-2xl text-[#28071C] mb-1">
                {consolidated.currentMargin.toFixed(1)}%
              </div>
              <div className={`text-sm flex items-center ${consolidated.gapMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {consolidated.gapMargin >= 0 ? '+' : ''}{consolidated.gapMargin.toFixed(1)}% vs meta
              </div>
            </div>

            <div className="flex items-center justify-center">
              {Math.abs(consolidated.gapPMV) < 5 && Math.abs(consolidated.gapVolume) < 200 && Math.abs(consolidated.gapMargin) < 2 ? (
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                  <span className="text-green-600 text-sm">Dentro da Meta</span>
                </div>
              ) : (
                <div className="text-center">
                  <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-2" />
                  <span className="text-amber-600 text-sm">Ajustes Necessários</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Container 3+: Planejamento das Categorias */}
        {categories.map((category) => (
          <div key={category.id} className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[#28071C] text-xl">{category.name}</h2>
              <button
                onClick={() => {
                  setSelectedCategory(category.id);
                  setShowSKUPlan(true);
                }}
                className="flex items-center px-4 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-sm"
              >
                <Package className="w-4 h-4 mr-2" />
                Plano de SKU
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-[#28071C]/20">
                    <th className="text-left text-[#28071C]/70 text-sm uppercase tracking-wide py-3 px-4">Subcategoria</th>
                    <th className="text-left text-[#28071C]/70 text-sm uppercase tracking-wide py-3 px-4">Participação %</th>
                    <th className="text-left text-[#28071C]/70 text-sm uppercase tracking-wide py-3 px-4">Preço Médio</th>
                    <th className="text-left text-[#28071C]/70 text-sm uppercase tracking-wide py-3 px-4">Volume (pçs)</th>
                    <th className="text-left text-[#28071C]/70 text-sm uppercase tracking-wide py-3 px-4">Margem %</th>
                    <th className="text-left text-[#28071C]/70 text-sm uppercase tracking-wide py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {category.subcategories.map((sub) => (
                    <tr key={sub.id} className="border-b border-[#28071C]/10">
                      <td className="py-3 px-4 text-[#28071C]">{sub.name}</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={sub.participation}
                          onChange={(e) => updateSubcategory(category.id, sub.id, 'participation', parseFloat(e.target.value) || 0)}
                          className="w-20 bg-[#F2F2F2] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={sub.avgPrice}
                          onChange={(e) => updateSubcategory(category.id, sub.id, 'avgPrice', parseFloat(e.target.value) || 0)}
                          className="w-24 bg-[#F2F2F2] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={sub.volume}
                          onChange={(e) => updateSubcategory(category.id, sub.id, 'volume', parseFloat(e.target.value) || 0)}
                          className="w-24 bg-[#F2F2F2] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={sub.margin}
                          onChange={(e) => updateSubcategory(category.id, sub.id, 'margin', parseFloat(e.target.value) || 0)}
                          className="w-20 bg-[#F2F2F2] rounded px-3 py-1 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-4">
                        {sub.margin < creativeMetas.expectedMargin - 2 ? (
                          <div className="flex items-center text-amber-600 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Margem baixa
                          </div>
                        ) : (
                          <div className="flex items-center text-green-600 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            OK
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Botões de Ação */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button className="flex items-center px-6 py-3 bg-white text-[#28071C] border-2 border-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-all shadow-sm">
              <Save className="w-5 h-5 mr-2" />
              Salvar Plano
            </button>
            <button className="flex items-center px-6 py-3 bg-white text-[#28071C] border-2 border-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-all shadow-sm">
              <Download className="w-5 h-5 mr-2" />
              Exportar Plano
            </button>
          </div>

          <button className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
            <CheckCircle className="w-5 h-5 mr-2" />
            Aplicar Plano
          </button>
        </div>
      </main>

      {/* Modal de Plano de SKU */}
      {showSKUPlan && selectedCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#28071C]/10 px-6 py-4 flex items-center justify-between">
              <h2 className="text-[#28071C] text-xl">
                Plano de SKU - {categories.find(c => c.id === selectedCategory)?.name}
              </h2>
              <button
                onClick={() => setShowSKUPlan(false)}
                className="text-[#28071C]/70 hover:text-[#28071C] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {categories.find(c => c.id === selectedCategory)?.subcategories.map((sub) => (
                <div key={sub.id} className="mb-8 pb-8 border-b border-[#28071C]/10 last:border-b-0">
                  <h3 className="text-[#28071C] text-lg mb-4">{sub.name}</h3>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F2F2F2]">
                        <th className="text-left text-[#28071C]/70 py-2 px-3">Modelo</th>
                        <th className="text-left text-[#28071C]/70 py-2 px-3">Tema</th>
                        <th className="text-left text-[#28071C]/70 py-2 px-3">Cores</th>
                        <th className="text-left text-[#28071C]/70 py-2 px-3">Faixa de Preço</th>
                        <th className="text-left text-[#28071C]/70 py-2 px-3">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#28071C]/10">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="Ex: Modelo A"
                            className="w-full bg-white border border-[#28071C]/20 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select className="w-full bg-white border border-[#28071C]/20 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50">
                            {themes.map(t => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="Ex: Azul, Verde"
                            className="w-full bg-white border border-[#28071C]/20 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select className="w-full bg-white border border-[#28071C]/20 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50">
                            <option>P1 - Entrada</option>
                            <option>P2 - Médio</option>
                            <option>P3 - Premium</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            placeholder="0"
                            className="w-full bg-white border border-[#28071C]/20 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <button className="mt-3 flex items-center text-[#7598CF] hover:text-[#7598CF]/80 text-sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Modelo
                  </button>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-[#28071C]/10 px-6 py-4 flex justify-end space-x-4">
              <button
                onClick={() => setShowSKUPlan(false)}
                className="px-6 py-2 bg-white text-[#28071C] border-2 border-[#28071C] rounded-lg hover:bg-[#28071C]/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => setShowSKUPlan(false)}
                className="px-6 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all"
              >
                Salvar SKUs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}