import { useMemo } from "react";
import { ProductMarkdown, MarkdownSummary, ELASTICITY_MULTIPLIER, DiscountLevel } from "../types/markdown";

/**
 * Hook para cálculos em tempo real de markdown
 * Recalcula automaticamente quando produtos ou descontos mudam
 */
export function useMarkdownCalculations(
  products: ProductMarkdown[],
  verbaTotalDisponivel: number
): {
  productsWithCalculations: ProductMarkdown[];
  summary: MarkdownSummary;
} {
  // Calcula todos os valores derivados para cada produto
  const productsWithCalculations = useMemo(() => {
    return products.map((product) => {
      // Preço com desconto
      const precoComDesconto =
        product.precoOriginal * (1 - product.percentualDesconto / 100);

      // Custo do desconto = (Preço Original - Preço com Desconto) * Estoque Atual
      const custoDesconto =
        (product.precoOriginal - precoComDesconto) * product.estoqueAtual;

      // Margem final = ((Preço com Desconto - Custo Unitário) / Preço com Desconto) * 100
      const margemFinal =
        precoComDesconto > 0
          ? ((precoComDesconto - product.custoUnitario) / precoComDesconto) * 100
          : 0;

      // Venda estimada = Estoque Atual * Multiplicador de Elasticidade
      const multiplicador = ELASTICITY_MULTIPLIER[product.nivelCorte] || 1;
      const vendaEstimada = Math.round(product.estoqueAtual * multiplicador);

      // Estoque final previsto = Estoque Atual - Venda Estimada (mínimo 0)
      const estoqueFinalPrevisto = Math.max(0, product.estoqueAtual - vendaEstimada);

      return {
        ...product,
        precoComDesconto,
        custoDesconto,
        margemFinal,
        vendaEstimada,
        estoqueFinalPrevisto,
      };
    });
  }, [products]);

  // Calcula o resumo geral
  const summary = useMemo(() => {
    // Verba total utilizada = soma de todos os custos de desconto
    const verbaTotalUtilizada = productsWithCalculations.reduce(
      (total, product) => total + (product.custoDesconto || 0),
      0
    );

    // Percentual de utilização
    const percentualUtilizacao =
      verbaTotalDisponivel > 0
        ? (verbaTotalUtilizada / verbaTotalDisponivel) * 100
        : 0;

    // Margem média original (ponderada pelo estoque)
    const totalEstoque = productsWithCalculations.reduce(
      (sum, p) => sum + p.estoqueAtual,
      0
    );
    const margemMediaOriginal =
      totalEstoque > 0
        ? productsWithCalculations.reduce(
            (sum, p) => sum + p.margemOriginal * p.estoqueAtual,
            0
          ) / totalEstoque
        : 0;

    // Margem média final (ponderada pelo estoque)
    const margemMediaFinal =
      totalEstoque > 0
        ? productsWithCalculations.reduce(
            (sum, p) => sum + (p.margemFinal || 0) * p.estoqueAtual,
            0
          ) / totalEstoque
        : 0;

    // Total de unidades
    const totalUnidadesEstoque = productsWithCalculations.reduce(
      (sum, p) => sum + p.estoqueAtual,
      0
    );

    const totalUnidadesVendaEstimada = productsWithCalculations.reduce(
      (sum, p) => sum + (p.vendaEstimada || 0),
      0
    );

    const totalEstoqueFinalPrevisto = productsWithCalculations.reduce(
      (sum, p) => sum + (p.estoqueFinalPrevisto || 0),
      0
    );

    // Economia (verba não utilizada)
    const economiaVerbaNaoUtilizada = Math.max(
      0,
      verbaTotalDisponivel - verbaTotalUtilizada
    );

    return {
      verbaTotalDisponivel,
      verbaTotalUtilizada,
      percentualUtilizacao,
      margemMediaOriginal,
      margemMediaFinal,
      totalUnidadesEstoque,
      totalUnidadesVendaEstimada,
      totalEstoqueFinalPrevisto,
      economiaVerbaNaoUtilizada,
    };
  }, [productsWithCalculations, verbaTotalDisponivel]);

  return {
    productsWithCalculations,
    summary,
  };
}

/**
 * Calcula distribuição linear inicial de descontos
 * Distribui a verba igualmente entre todos os produtos
 */
export function calculateLinearDistribution(
  products: ProductMarkdown[],
  verbaTotalDisponivel: number
): ProductMarkdown[] {
  if (products.length === 0) return products;

  // Calcula verba por produto
  const verbaPorProduto = verbaTotalDisponivel / products.length;

  return products.map((product) => {
    // Calcula qual desconto percentual consumiria essa verba
    // Custo Desconto = (Preço Original * %Desconto/100) * Estoque
    // verbaPorProduto = (Preço Original * %Desconto/100) * Estoque
    // %Desconto = (verbaPorProduto / (Preço Original * Estoque)) * 100

    const descontoCalculado =
      product.precoOriginal > 0 && product.estoqueAtual > 0
        ? (verbaPorProduto / (product.precoOriginal * product.estoqueAtual)) * 100
        : 0;

    // Limita entre 0-100%
    const percentualDesconto = Math.min(100, Math.max(0, descontoCalculado));

    // Define nível de corte baseado no desconto
    let nivelCorte: DiscountLevel = "Baixo";
    if (percentualDesconto >= 40) {
      nivelCorte = "Agressivo";
    } else if (percentualDesconto >= 20) {
      nivelCorte = "Médio";
    }

    return {
      ...product,
      percentualDesconto: Math.round(percentualDesconto),
      nivelCorte,
    };
  });
}

/**
 * Aplica filtros aos produtos
 */
export function applyMarkdownFilters(
  products: ProductMarkdown[],
  filters: {
    categoria?: string;
    subcategoria?: string;
    temaColecao?: string;
    searchTerm?: string;
  }
): ProductMarkdown[] {
  return products.filter((product) => {
    if (filters.categoria && product.categoria !== filters.categoria) {
      return false;
    }
    if (filters.subcategoria && product.subcategoria !== filters.subcategoria) {
      return false;
    }
    if (filters.temaColecao && product.temaColecao !== filters.temaColecao) {
      return false;
    }
    if (
      filters.searchTerm &&
      !product.nome.toLowerCase().includes(filters.searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
}
