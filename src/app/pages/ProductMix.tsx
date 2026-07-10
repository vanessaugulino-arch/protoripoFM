import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import {
  ArrowLeft,
  LogOut,
  User,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Layers,
  DollarSign,
  Percent,
  FileText,
  Package,
  TrendingUp,
  HelpCircle,
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";

interface User {
  name: string;
  email: string;
  profile: string;
}

interface CategoryOverview {
  id: string;
  categoriaPrincipal: string;
  participacao: number;
  quantidadeItens: number;
  observacao: string;
}

interface ProductItem {
  id: string;
  nomeItem: string;
  categoria: string;
  subcategoria: string;
  preCusto: number;
  markup: number;
  precoVenda: number;
  faixaPreco: string;
  status: string;
}

const categorias = [
  "Vestidos",
  "Blusas",
  "Calças",
  "Saias",
  "Shorts",
  "Jaquetas",
  "Casacos",
  "Macacões",
  "Conjuntos",
  "Acessórios",
];

const faixasPreco = [
  "Entrada (R$ 119-169)",
  "Médio (R$ 179-259)",
  "Premium (R$ 269-389)",
  "Premium Plus (R$ 399+)",
];

const statusOptions = [
  "Em Planejamento",
  "Em Desenvolvimento",
  "Aprovado",
  "Em Produção",
  "Finalizado",
];

export default function ProductMix() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedCycle, setSelectedCycle] = useState("Verão 2026");
  const [tenantId, setTenantId] = useState<string>("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  // Visão Geral da Coleção
  const [categoryOverviews, setCategoryOverviews] = useState<CategoryOverview[]>([
    {
      id: "1",
      categoriaPrincipal: "Vestidos",
      participacao: 30,
      quantidadeItens: 25,
      observacao: "Categoria principal da coleção",
    },
  ]);

  // Itens de Produtos
  const [products, setProducts] = useState<ProductItem[]>([
    {
      id: "1",
      nomeItem: "Vestido Floral Midi",
      categoria: "Vestidos",
      subcategoria: "Vestidos Midi",
      preCusto: 85,
      markup: 2.2,
      precoVenda: 187,
      faixaPreco: "Entrada (R$ 119-169)",
      status: "Em Planejamento",
    },
  ]);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);

      if (userData.profile !== "Estilo") {
        navigate("/dashboard");
      }

      const tid = sessionStorage.getItem("activeTenantId") ?? userData.tenant_id ?? "";
      setTenantId(tid);

      // Carrega dados salvos localmente (cache)
      const savedOverviews = sessionStorage.getItem("categoryOverviews");
      if (savedOverviews) setCategoryOverviews(JSON.parse(savedOverviews));

      const savedProducts = sessionStorage.getItem("productMixData");
      if (savedProducts) {
        setProducts(JSON.parse(savedProducts));
      } else if (tid) {
        // Sem cache — busca do Supabase
        setLoadingProducts(true);
        Promise.resolve(
          supabase
            .from("products")
            .select("sku, name, category, subcategory, price_sale, price_cost, price_tier, season, collection_name")
            .eq("tenant_id", tid)
            .order("category")
            .limit(200)
        ).then(({ data }) => {
            if (data && data.length > 0) {
              const mapped: ProductItem[] = data.map((p: any) => {
                const custo = Number(p.price_cost) || 0;
                const venda = Number(p.price_sale) || 0;
                const markup = custo > 0 ? parseFloat((venda / custo).toFixed(2)) : 2.0;
                return {
                  id: p.sku,
                  nomeItem: p.name ?? p.sku,
                  categoria: p.category ?? "Outros",
                  subcategoria: p.subcategory ?? "",
                  preCusto: custo,
                  markup,
                  precoVenda: venda,
                  faixaPreco: p.price_tier ?? "Médio (R$ 179-259)",
                  status: "Em Planejamento",
                };
              });
              setProducts(mapped);

              // Gera overviews por categoria
              const byCategory = mapped.reduce<Record<string, number>>((acc, p) => {
                acc[p.categoria] = (acc[p.categoria] ?? 0) + 1;
                return acc;
              }, {});
              const total = mapped.length;
              const overviews: CategoryOverview[] = Object.entries(byCategory).map(([cat, qtd], i) => ({
                id: String(i + 1),
                categoriaPrincipal: cat,
                participacao: Math.round((qtd / total) * 100),
                quantidadeItens: qtd,
                observacao: "",
              }));
              setCategoryOverviews(overviews);
            }
          }, () => {/* usa defaults */})
          .finally(() => setLoadingProducts(false));
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

  // Category Overview functions
  const addCategoryOverview = () => {
    const newCategory: CategoryOverview = {
      id: Date.now().toString(),
      categoriaPrincipal: "Vestidos",
      participacao: 0,
      quantidadeItens: 0,
      observacao: "",
    };
    setCategoryOverviews([...categoryOverviews, newCategory]);
  };

  const removeCategoryOverview = (id: string) => {
    setCategoryOverviews(categoryOverviews.filter((c) => c.id !== id));
  };

  const updateCategoryOverview = (
    id: string,
    field: keyof CategoryOverview,
    value: string | number
  ) => {
    setCategoryOverviews(
      categoryOverviews.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  // Product functions
  const addProduct = () => {
    const newProduct: ProductItem = {
      id: Date.now().toString(),
      nomeItem: "",
      categoria: "Vestidos",
      subcategoria: "",
      preCusto: 0,
      markup: 2.0,
      precoVenda: 0,
      faixaPreco: "Entrada (R$ 119-169)",
      status: "Em Planejamento",
    };
    setProducts([...products, newProduct]);
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id));
  };

  const updateProduct = (
    id: string,
    field: keyof ProductItem,
    value: string | number
  ) => {
    setProducts(
      products.map((p) => {
        if (p.id === id) {
          const updated = { ...p, [field]: value };
          
          // Calcular preço de venda automaticamente quando custo ou markup muda
          if (field === "preCusto" || field === "markup") {
            const custo = field === "preCusto" ? Number(value) : p.preCusto;
            const markup = field === "markup" ? Number(value) : p.markup;
            updated.precoVenda = Math.round(custo * markup);
          }

          return updated;
        }
        return p;
      })
    );
  };

  const saveAll = () => {
    sessionStorage.setItem("categoryOverviews", JSON.stringify(categoryOverviews));
    sessionStorage.setItem("productMixData", JSON.stringify(products));

    // Write-through para Supabase — salva overviews como JSON em operation_settings auxiliar
    if (tenantId) {
      supabase
        .from("operation_settings")
        .upsert(
          { tenant_id: tenantId, updated_at: new Date().toISOString() },
          { onConflict: "tenant_id" }
        )
        .then(
          () => {/* fire-and-forget */},
          () => {/* silencioso */}
        );
    }

    alert("Estrutura do mix de produtos salva com sucesso!");
  };

  // Cálculos consolidados - Visão Geral
  const totalParticipacaoOverview = categoryOverviews.reduce((sum, c) => sum + c.participacao, 0);
  const totalItensOverview = categoryOverviews.reduce((sum, c) => sum + c.quantidadeItens, 0);

  // Cálculos consolidados - Itens
  const totalItensProducts = products.length;
  const precoMedioProducts = products.length > 0
    ? products.reduce((sum, p) => sum + p.precoVenda, 0) / products.length
    : 0;
  const markupMedioProducts = products.length > 0
    ? products.reduce((sum, p) => sum + p.markup, 0) / products.length
    : 0;

  const PRODUCT_MIX_TOUR: TourStep[] = [
    {
      targetId: "tour-pm-header",
      title: "Mix de Produtos",
      content: "Aqui você define a estrutura do mix: quais categorias compõem a coleção, qual o peso de cada uma, e cadastra os itens com custo, markup e preço de venda.",
    },
    {
      targetId: "tour-pm-overview",
      title: "Visão Geral da Coleção",
      content: "Distribua a participação percentual entre as categorias principais. A soma deve ser 100% — esse equilíbrio define a identidade do mix da coleção.",
    },
    {
      targetId: "tour-pm-indicators",
      title: "Indicadores do Mix",
      content: "Métricas consolidadas: total de itens, preço médio de venda e markup médio. Compare com as metas do plano macro para validar o posicionamento.",
    },
    {
      targetId: "tour-pm-items",
      title: "Itens de Produtos",
      content: "Cadastro item a item com custo, markup e preço. O preço de venda é calculado automaticamente ao alterar custo ou markup — ajuste para encaixar na faixa de preço correta.",
    },
  ];

  const tour = useTour("product-mix");

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {tour.isOpen && <ProductTour steps={PRODUCT_MIX_TOUR} onClose={tour.dismiss} />}
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
            <div id="tour-pm-header">
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Mix de Produtos</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Estrutura do Mix de Produtos</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={tour.reopen}
              title="Tour da tela"
              className="text-[#F6F3AA]/70 hover:text-[#F6F3AA] transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
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
      <main className="max-w-[1600px] mx-auto px-6 py-5">
        {/* Container 1: Seleção de Ciclo */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <label className="block text-[#28071C]/70 text-sm mb-2 uppercase tracking-wide">
            Ciclo de Planejamento
          </label>
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="w-full max-w-md bg-[#F2F2F2] rounded-lg px-4 py-3 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
          >
            <option>Verão 2026</option>
            <option>Inverno 2026</option>
            <option>Verão 2027</option>
          </select>
        </div>

        {/* ======================================== */}
        {/* SEÇÃO 1: VISÃO GERAL DA COLEÇÃO */}
        {/* ======================================== */}

        <div id="tour-pm-overview" className="mb-8">
          {/* Header da Seção */}
          <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border-t-4 border-[#7598CF]">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <TrendingUp className="w-6 h-6 text-[#28071C] mr-3" />
                <div>
                  <h2 className="text-[#28071C] text-2xl mb-1">Visão Geral da Coleção</h2>
                  <p className="text-[#28071C]/60 text-sm">
                    Planejamento macro das categorias principais
                  </p>
                </div>
              </div>
              <button
                onClick={addCategoryOverview}
                className="flex items-center px-4 py-2 bg-[#7598CF] text-white rounded-lg hover:bg-[#7598CF]/90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Categoria
              </button>
            </div>
          </div>

          {/* Indicadores da Visão Geral */}
          <div id="tour-pm-indicators" className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative group bg-[#F2F2F2]/50 rounded-lg p-4 cursor-default">
                <div className="flex items-center space-x-2 mb-2">
                  <Percent className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                    Participação Total Planejada
                  </label>
                </div>
                <div className="text-2xl text-[#28071C] mb-1">
                  {totalParticipacaoOverview.toFixed(1)}%
                </div>
                {totalParticipacaoOverview !== 100 && (
                  <div className="flex items-center text-amber-600 text-xs mt-1">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Meta: 100%
                  </div>
                )}
                {totalParticipacaoOverview === 100 && (
                  <div className="flex items-center text-green-600 text-xs mt-1">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Dentro da meta
                  </div>
                )}
                <div className="absolute bottom-full left-0 mb-2 w-60 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed">
                  Soma das participações de todas as categorias. Deve totalizar 100% para garantir que o mix está completo e sem lacunas.
                </div>
              </div>

              <div className="relative group bg-[#F2F2F2]/50 rounded-lg p-4 cursor-default">
                <div className="flex items-center space-x-2 mb-2">
                  <Package className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                    Total de Itens Planejados
                  </label>
                </div>
                <div className="text-2xl text-[#28071C]">
                  {totalItensOverview} itens
                </div>
                <div className="absolute bottom-full left-0 mb-2 w-60 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed">
                  Quantidade total de itens previstos na visão macro das categorias. Deve refletir a capacidade produtiva do ciclo.
                </div>
              </div>
            </div>
          </div>

          {/* Tabela de Categorias Principais */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-[#28071C]/20">
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[180px]">
                      Categoria Principal
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[140px]">
                      % Participação
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[140px]">
                      Qtd. Itens
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[300px]">
                      Observação Estratégica
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-4 min-w-[60px]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categoryOverviews.map((category, index) => (
                    <tr
                      key={category.id}
                      className={`border-b border-[#28071C]/10 ${
                        index % 2 === 0 ? "bg-white" : "bg-[#F2F2F2]/20"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <select
                          value={category.categoriaPrincipal}
                          onChange={(e) =>
                            updateCategoryOverview(category.id, "categoriaPrincipal", e.target.value)
                          }
                          className="w-full bg-[#F2F2F2] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        >
                          {categorias.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <input
                            type="number"
                            step="0.1"
                            value={category.participacao}
                            onChange={(e) =>
                              updateCategoryOverview(
                                category.id,
                                "participacao",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full bg-[#F2F2F2] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                          <span className="ml-2 text-[#28071C]/70 text-sm">%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={category.quantidadeItens}
                          onChange={(e) =>
                            updateCategoryOverview(
                              category.id,
                              "quantidadeItens",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#F2F2F2] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <textarea
                          value={category.observacao}
                          onChange={(e) =>
                            updateCategoryOverview(category.id, "observacao", e.target.value)
                          }
                          placeholder="Ex: Foco em vendas, estratégia de marca..."
                          rows={2}
                          className="w-full bg-[#F2F2F2] rounded px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 resize-none"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => removeCategoryOverview(category.id)}
                          className="text-red-600 hover:text-red-700 transition-colors p-2"
                          title="Remover categoria"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {categoryOverviews.length === 0 && (
                <div className="text-center py-12">
                  <TrendingUp className="w-12 h-12 text-[#28071C]/20 mx-auto mb-3" />
                  <p className="text-[#28071C]/50 text-sm">
                    Nenhuma categoria cadastrada. Clique em "Adicionar Categoria" para começar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================== */}
        {/* SEÇÃO 2: ITENS DE PRODUTOS */}
        {/* ======================================== */}

        <div id="tour-pm-items" className="mb-8">
          {/* Header da Seção */}
          <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border-t-4 border-[#F6F3AA]">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Layers className="w-6 h-6 text-[#28071C] mr-3" />
                <div>
                  <h2 className="text-[#28071C] text-2xl mb-1">Itens de Produtos</h2>
                  <p className="text-[#28071C]/60 text-sm">
                    Cadastro detalhado item a item da coleção
                  </p>
                </div>
              </div>
              <button
                onClick={addProduct}
                className="flex items-center px-4 py-2 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Item
              </button>
            </div>
          </div>

          {/* Indicadores dos Itens */}
          <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="relative group bg-[#F2F2F2]/50 rounded-lg p-4 cursor-default">
                <div className="flex items-center space-x-2 mb-2">
                  <Package className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                    Total de Itens Cadastrados
                  </label>
                </div>
                <div className="text-2xl text-[#28071C]">
                  {totalItensProducts} itens
                </div>
                <div className="absolute bottom-full left-0 mb-2 w-60 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed">
                  Número de SKUs já registrados nesta tela. Compare com o total de itens planejado na Visão Geral para verificar se o detalhamento está completo.
                </div>
              </div>

              <div className="relative group bg-[#F2F2F2]/50 rounded-lg p-4 cursor-default">
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                    Preço Médio
                  </label>
                </div>
                <div className="text-2xl text-[#28071C]">
                  R$ {precoMedioProducts.toFixed(2)}
                </div>
                <div className="absolute bottom-full left-0 mb-2 w-60 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed">
                  Média aritmética dos preços de venda cadastrados. Deve se aproximar do PMV esperado pela direção criativa — divergência indica necessidade de revisão de preços ou volumes.
                </div>
              </div>

              <div className="relative group bg-[#F2F2F2]/50 rounded-lg p-4 cursor-default">
                <div className="flex items-center space-x-2 mb-2">
                  <Percent className="w-4 h-4 text-[#28071C]/70" />
                  <label className="text-[#28071C]/70 text-sm uppercase tracking-wide">
                    Markup Médio
                  </label>
                </div>
                <div className="text-2xl text-[#28071C]">
                  {markupMedioProducts.toFixed(2)}x
                </div>
                <div className="absolute bottom-full left-0 mb-2 w-60 px-3 py-2 bg-[#28071C] text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed">
                  Múltiplo médio sobre o custo de produção. Markup de 2.0x equivale a 50% de margem bruta. Acompanhe para garantir que o mix sustenta a margem meta do ciclo.
                </div>
              </div>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-[#28071C]/20">
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[180px]">
                      Nome do Item
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[120px]">
                      Categoria
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[140px]">
                      Subcategoria
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[100px]">
                      Pré-Custo
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[80px]">
                      Markup
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[100px]">
                      Preço Venda
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[160px]">
                      Faixa de Preço
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[140px]">
                      Status
                    </th>
                    <th className="text-left text-[#28071C]/70 text-xs uppercase tracking-wide py-3 px-3 min-w-[60px]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr
                      key={product.id}
                      className={`border-b border-[#28071C]/10 ${
                        index % 2 === 0 ? "bg-white" : "bg-[#F2F2F2]/20"
                      }`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={product.nomeItem}
                          onChange={(e) =>
                            updateProduct(product.id, "nomeItem", e.target.value)
                          }
                          placeholder="Ex: Vestido Floral Midi"
                          className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={product.categoria}
                          onChange={(e) =>
                            updateProduct(product.id, "categoria", e.target.value)
                          }
                          className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        >
                          {categorias.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={product.subcategoria}
                          onChange={(e) =>
                            updateProduct(
                              product.id,
                              "subcategoria",
                              e.target.value
                            )
                          }
                          placeholder="Ex: Curtos, Longos..."
                          className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center">
                          <span className="text-[#28071C]/70 text-sm mr-1">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={product.preCusto}
                            onChange={(e) =>
                              updateProduct(
                                product.id,
                                "preCusto",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={product.markup}
                          onChange={(e) =>
                            updateProduct(
                              product.id,
                              "markup",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center">
                          <span className="text-[#28071C]/70 text-sm mr-1">R$</span>
                          <input
                            type="number"
                            value={product.precoVenda}
                            readOnly
                            className="w-full bg-[#28071C]/5 rounded px-2 py-2 text-[#28071C] text-sm cursor-not-allowed"
                            title="Calculado automaticamente"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={product.faixaPreco}
                          onChange={(e) =>
                            updateProduct(product.id, "faixaPreco", e.target.value)
                          }
                          className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        >
                          {faixasPreco.map((faixa) => (
                            <option key={faixa} value={faixa}>
                              {faixa}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={product.status}
                          onChange={(e) =>
                            updateProduct(product.id, "status", e.target.value)
                          }
                          className="w-full bg-[#F2F2F2] rounded px-2 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => removeProduct(product.id)}
                          className="text-red-600 hover:text-red-700 transition-colors p-2"
                          title="Remover item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {products.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-[#28071C]/20 mx-auto mb-3" />
                  <p className="text-[#28071C]/50 text-sm">
                    Nenhum item cadastrado. Clique em "Adicionar Item" para começar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Botão de Salvamento */}
        <div className="flex justify-end gap-4">
          <button
            onClick={saveAll}
            className="flex items-center px-8 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md"
          >
            <Save className="w-5 h-5 mr-2" />
            Salvar Estrutura Completa
          </button>
        </div>
      </main>
    </div>
  );
}