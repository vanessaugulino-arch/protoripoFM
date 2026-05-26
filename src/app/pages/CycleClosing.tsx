import { useState, useEffect, useMemo } from "react";
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

  // Verba disponível (vem da Direção Criativa - Renata)
  const [verbaTotalDisponivel] = useState(150000); // R$ 150.000,00

  // Profile group do usuário (RBAC)
  const userProfileGroup = currentUser?.profile === "Estilo" ? "Feminino" : "Feminino"; // Mock - em produção vem do user

  // Inicializa produtos (mock data - em produção vem do backend filtrado por profile_group)
  useEffect(() => {
    if (!isInitialized) {
      const mockProducts: ProductMarkdown[] = [
        {
          id: "1",
          nome: "Blusa Oversized Linho",
          foto: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400",
          grupo: "Feminino",
          categoria: "Blusas",
          subcategoria: "Blusa manga curta",
          temaColecao: "Minimalista Urbano",
          estoqueAtual: 250,
          precoOriginal: 189.90,
          custoUnitario: 75.00,
          margemOriginal: 60.5,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "2",
          nome: "Vestido Midi Estampado",
          foto: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400",
          grupo: "Feminino",
          categoria: "Vestidos",
          subcategoria: "Vestido midi",
          temaColecao: "Verão Vibrante",
          estoqueAtual: 180,
          precoOriginal: 299.90,
          custoUnitario: 120.00,
          margemOriginal: 60.0,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "3",
          nome: "Calça Wide Leg Alfaiataria",
          foto: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400",
          grupo: "Feminino",
          categoria: "Calças",
          subcategoria: "Calça wide leg",
          temaColecao: "Minimalista Urbano",
          estoqueAtual: 150,
          precoOriginal: 349.90,
          custoUnitario: 140.00,
          margemOriginal: 60.0,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "4",
          nome: "Saia Plissada Midi",
          foto: "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=400",
          grupo: "Feminino",
          categoria: "Saias",
          subcategoria: "Saia midi",
          temaColecao: "Verão Vibrante",
          estoqueAtual: 200,
          precoOriginal: 229.90,
          custoUnitario: 90.00,
          margemOriginal: 60.8,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "5",
          nome: "Top Cropped Linho",
          foto: "https://images.unsplash.com/photo-1594633313593-bab3825d0caf?w=400",
          grupo: "Feminino",
          categoria: "Blusas",
          subcategoria: "Top cropped",
          temaColecao: "Verão Vibrante",
          estoqueAtual: 300,
          precoOriginal: 139.90,
          custoUnitario: 55.00,
          margemOriginal: 60.7,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "6",
          nome: "Jaqueta Jeans Oversized",
          foto: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400",
          grupo: "Feminino",
          categoria: "Jaquetas",
          subcategoria: "Jaqueta jeans",
          temaColecao: "Minimalista Urbano",
          estoqueAtual: 120,
          precoOriginal: 399.90,
          custoUnitario: 160.00,
          margemOriginal: 60.0,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "7",
          nome: "Regata Ribana Básica",
          foto: "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=400",
          grupo: "Feminino",
          categoria: "Blusas",
          subcategoria: "Regata",
          temaColecao: "Minimalista Urbano",
          estoqueAtual: 400,
          precoOriginal: 89.90,
          custoUnitario: 35.00,
          margemOriginal: 61.1,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
        {
          id: "8",
          nome: "Vestido Longo Floral",
          foto: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400",
          grupo: "Feminino",
          categoria: "Vestidos",
          subcategoria: "Vestido longo",
          temaColecao: "Verão Vibrante",
          estoqueAtual: 90,
          precoOriginal: 449.90,
          custoUnitario: 180.00,
          margemOriginal: 60.0,
          continuidade: false,
          percentualDesconto: 0,
          nivelCorte: "Baixo",
        },
      ];

      // Filtra por grupo do usuário (RBAC)
      const filteredByGroup = mockProducts.filter(
        (p) => p.grupo === userProfileGroup
      );

      // Ordena por estoque (DESC) - produtos com mais estoque primeiro
      const sortedProducts = [...filteredByGroup].sort(
        (a, b) => b.estoqueAtual - a.estoqueAtual
      );

      // Aplica distribuição linear inicial
      const withInitialDistribution = calculateLinearDistribution(
        sortedProducts,
        verbaTotalDisponivel
      );

      setAllProducts(withInitialDistribution);
      setIsInitialized(true);
    }
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

      <main className="max-w-[1600px] mx-auto px-6 py-8">
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
        <div className="mt-6 bg-white rounded-lg p-4 border border-[#E7E7E6]">
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
