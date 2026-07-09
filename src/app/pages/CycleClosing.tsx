import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router";
import { Download, Check, RefreshCw } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { ActionButton } from "../components/ActionButton";
import { ApprovalModal } from "../components/ApprovalModal";
import { MarkdownControlPanel } from "../components/MarkdownControlPanel";
import { MarkdownFilters } from "../components/MarkdownFilters";
import { MarkdownTable } from "../components/MarkdownTable";
import { useWorkflow } from "../contexts/WorkflowContext";
import { ProductMarkdown, MarkdownFilters as Filters } from "../types/markdown";
import {
  useMarkdownCalculations,
  calculateLinearDistribution,
  applyMarkdownFilters,
} from "../hooks/useMarkdownCalculations";

export default function CycleClosing() {
  const navigate = useNavigate();
  const { currentUser, permissions, approveCycle } = useWorkflow();

  // Estado: produtos e filtros
  const [allProducts, setAllProducts] = useState<ProductMarkdown[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [showModal, setShowModal] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [tenantId, setTenantId] = useState<string>("");

  // Verba disponível (vem da Direção Criativa - Renata)
  const [verbaTotalDisponivel] = useState(150000); // R$ 150.000,00

  // Profile group do usuário (RBAC)
  const userProfileGroup = currentUser?.profile === "Estilo" ? "Feminino" : "Feminino"; // Mock - em produção vem do user

  // Inicializa produtos a partir do Supabase (products + inventory_snapshots)
  useEffect(() => {
    if (isInitialized) return;

    // Resolve tenant
    const storedUser = sessionStorage.getItem("currentUser");
    const userData = storedUser ? JSON.parse(storedUser) : null;
    const tid = sessionStorage.getItem("activeTenantId") ?? userData?.tenant_id ?? "";
    if (tid) setTenantId(tid);

    const loadFromSupabase = async () => {
      if (!tid) return null;

      // Busca produtos do tenant
      const { data: prods } = await supabase
        .from("products")
        .select("sku, name, division, category, subcategory, price_sale, price_cost, collection_name, risk_level, linha")
        .eq("tenant_id", tid)
        .limit(500);

      if (!prods || prods.length === 0) return null;

      // Busca snapshots de estoque mais recentes por sku
      const skus = prods.map((p: any) => p.sku);
      const { data: snaps } = await supabase
        .from("inventory_snapshots")
        .select("sku, quantity, snapshot_date")
        .eq("tenant_id", tid)
        .in("sku", skus)
        .order("snapshot_date", { ascending: false });

      // Pega o snapshot mais recente por sku
      const latestSnap: Record<string, number> = {};
      (snaps ?? []).forEach((s: any) => {
        if (latestSnap[s.sku] === undefined) latestSnap[s.sku] = Number(s.quantity) || 0;
      });

      const mapped: ProductMarkdown[] = prods.map((p: any, i: number) => {
        const venda = Number(p.price_sale) || 0;
        const custo = Number(p.price_cost) || 0;
        const margem = venda > 0 ? parseFloat((((venda - custo) / venda) * 100).toFixed(1)) : 0;
        const estoque = latestSnap[p.sku] ?? 0;
        return {
          id: p.sku ?? String(i),
          nome: p.name ?? p.sku,
          foto: "",
          grupo: p.division ?? "Feminino",
          categoria: p.category ?? "Outros",
          subcategoria: p.subcategory ?? "",
          temaColecao: p.collection_name ?? "",
          estoqueAtual: estoque,
          precoOriginal: venda,
          custoUnitario: custo,
          margemOriginal: margem,
          continuidade: p.linha === "Básicos",
          percentualDesconto: 0,
          nivelCorte: p.risk_level ?? "Baixo",
        };
      });

      return mapped;
    };

    const useFallback = () => {
      const fallback: ProductMarkdown[] = [
        { id: "1", nome: "Blusa Oversized Linho", foto: "", grupo: "Feminino", categoria: "Blusas", subcategoria: "Blusa manga curta", temaColecao: "Minimalista Urbano", estoqueAtual: 250, precoOriginal: 189.90, custoUnitario: 75, margemOriginal: 60.5, continuidade: false, percentualDesconto: 0, nivelCorte: "Baixo" },
        { id: "2", nome: "Vestido Midi Estampado", foto: "", grupo: "Feminino", categoria: "Vestidos", subcategoria: "Vestido midi", temaColecao: "Verão Vibrante", estoqueAtual: 180, precoOriginal: 299.90, custoUnitario: 120, margemOriginal: 60, continuidade: false, percentualDesconto: 0, nivelCorte: "Baixo" },
        { id: "3", nome: "Calça Wide Leg Alfaiataria", foto: "", grupo: "Feminino", categoria: "Calças", subcategoria: "Calça wide leg", temaColecao: "Minimalista Urbano", estoqueAtual: 150, precoOriginal: 349.90, custoUnitario: 140, margemOriginal: 60, continuidade: false, percentualDesconto: 0, nivelCorte: "Baixo" },
        { id: "4", nome: "Saia Plissada Midi", foto: "", grupo: "Feminino", categoria: "Saias", subcategoria: "Saia midi", temaColecao: "Verão Vibrante", estoqueAtual: 200, precoOriginal: 229.90, custoUnitario: 90, margemOriginal: 60.8, continuidade: false, percentualDesconto: 0, nivelCorte: "Baixo" },
        { id: "5", nome: "Jaqueta Jeans Oversized", foto: "", grupo: "Feminino", categoria: "Jaquetas", subcategoria: "Jaqueta jeans", temaColecao: "Minimalista Urbano", estoqueAtual: 120, precoOriginal: 399.90, custoUnitario: 160, margemOriginal: 60, continuidade: false, percentualDesconto: 0, nivelCorte: "Baixo" },
      ];
      return fallback;
    };

    loadFromSupabase()
      .then((loaded) => {
        const source = loaded ?? useFallback();
        const filtered = source.filter((p) => p.grupo === userProfileGroup || loaded === null);
        const sorted = [...filtered].sort((a, b) => b.estoqueAtual - a.estoqueAtual);
        const withDist = calculateLinearDistribution(sorted, verbaTotalDisponivel);
        setAllProducts(withDist);
        setIsInitialized(true);
      })
      .catch(() => {
        const fallback = useFallback();
        const withDist = calculateLinearDistribution(fallback, verbaTotalDisponivel);
        setAllProducts(withDist);
        setIsInitialized(true);
      });
  }, [isInitialized, userProfileGroup, verbaTotalDisponivel]);

  // Produtos filtrados
  const filteredProducts = useMemo(() => {
    return applyMarkdownFilters(allProducts, filters);
  }, [allProducts, filters]);

  // Cálculos em tempo real
  const { productsWithCalculations, summary } = useMarkdownCalculations(
    filteredProducts,
    verbaTotalDisponivel
  );

  // Atualiza produto
  const handleProductUpdate = (
    productId: string,
    updates: Partial<ProductMarkdown>
  ) => {
    setAllProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, ...updates } : p))
    );
  };

  // Reaplica distribuição linear
  const handleResetDistribution = () => {
    const redistributed = calculateLinearDistribution(
      allProducts,
      verbaTotalDisponivel
    );
    setAllProducts(redistributed);
  };

  // Aprovação
  const handleApprove = async (observations: string) => {
    await approveCycle(observations);
    setShowModal(false);
    navigate("/dashboard");
  };

  // Exportar relatório
  const handleExport = () => {
    // TODO: Implementar exportação para Excel/PDF
    console.log("Exportando relatório...", {
      products: productsWithCalculations,
      summary,
    });
    alert("Relatório exportado com sucesso! (funcionalidade em desenvolvimento)");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#7598CF]/10 to-[#B8A8E0]/10">
      <DashboardHeader
        userName={currentUser.name}
        userProfile={currentUser.profile}
        title={`Fashion Mind | Fechamento de Ciclo - ${userProfileGroup}`}
        subtitle="Planeje promoções e markdown para produtos descontinuados"
        showBackButton
        onLogout={handleLogout}
      >
        {/* Info da verba */}
        <div className="mt-4 bg-[#F6F3AA] rounded-lg px-4 py-3">
          <p className="text-[#28071C] text-sm">
            <span className="font-semibold">Verba Total Disponível:</span>{" "}
            R$ {verbaTotalDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span className="ml-4 text-[#28071C]/70">
              (Definida por Renata - Direção Criativa)
            </span>
          </p>
        </div>
      </DashboardHeader>

      <main className="max-w-[1600px] mx-auto px-6 py-5">
        {/* Painel de Controle Sticky */}
        <MarkdownControlPanel summary={summary} />

        {/* Filtros Drill-down */}
        <MarkdownFilters
          products={allProducts}
          onFilterChange={setFilters}
          activeFilters={filters}
        />

        {/* Tabela de Decisão */}
        <MarkdownTable
          products={productsWithCalculations}
          onProductUpdate={handleProductUpdate}
        />

        {/* Botões de Ação */}
        <div className="mt-6 flex justify-between items-center">
          <div className="flex space-x-4">
            <ActionButton
              icon={RefreshCw}
              label="Redistribuir Verba"
              onClick={handleResetDistribution}
              variant="outline"
              size="sm"
            />
            <ActionButton
              icon={Download}
              label="Exportar Relatório"
              onClick={handleExport}
              variant="secondary"
              size="sm"
            />
          </div>

          {permissions.canApprove && (
            <ActionButton
              id="btn_aplicar_plano"
              icon={Check}
              label="Aplicar Plano de Markdown"
              onClick={() => setShowModal(true)}
              variant="primary"
              size="md"
              disabled={summary.percentualUtilizacao > 100}
            />
          )}
        </div>

        {/* Legendas e Ajuda */}
        <div className="mt-6 bg-white rounded-lg p-4 border border-[#F2F2F2]">
          <h4 className="text-[#28071C] font-semibold text-sm mb-3">
            📊 Como Funciona o Plano de Markdown
          </h4>
          <div className="grid grid-cols-3 gap-4 text-xs text-[#28071C]/70">
            <div>
              <p className="font-semibold text-[#28071C] mb-1">Níveis de Corte:</p>
              <ul className="space-y-1">
                <li><span className="text-green-600">● Baixo:</span> 15% desc, +10% vendas</li>
                <li><span className="text-orange-600">● Médio:</span> 30% desc, +25% vendas</li>
                <li><span className="text-red-600">● Agressivo:</span> 50% desc, +50% vendas</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-[#28071C] mb-1">Cálculos Automáticos:</p>
              <ul className="space-y-1">
                <li>• Preço Final = Preço × (1 - %Desc)</li>
                <li>• Custo Desc = (Preço - Preço Final) × Estoque</li>
                <li>• Venda Est = Estoque × Elasticidade</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-[#28071C] mb-1">Regras de Negócio:</p>
              <ul className="space-y-1">
                <li>✓ Apenas produtos descontinuados</li>
                <li>✓ Filtrado por {userProfileGroup}</li>
                <li>✓ Ordenado por maior estoque</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Aprovação */}
      <ApprovalModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onApprove={handleApprove}
        title="Aprovar Plano de Markdown"
        currentUser={currentUser.name}
        summaryData={[
          {
            label: "Verba Utilizada",
            value: `R$ ${summary.verbaTotalUtilizada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${summary.percentualUtilizacao.toFixed(1)}%)`,
          },
          {
            label: "Margem Final Estimada",
            value: `${summary.margemMediaFinal.toFixed(1)}%`,
          },
          {
            label: "Venda Estimada",
            value: `${summary.totalUnidadesVendaEstimada.toLocaleString('pt-BR')} unidades`,
          },
          {
            label: "Estoque Final Previsto",
            value: `${summary.totalEstoqueFinalPrevisto.toLocaleString('pt-BR')} unidades`,
          },
          {
            label: "Produtos em Promoção",
            value: productsWithCalculations.length,
          },
        ]}
      />
    </div>
  );
}
