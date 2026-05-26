import { ChevronDown } from "lucide-react";
import { ProductMarkdown, DiscountLevel, SUGGESTED_DISCOUNT } from "../types/markdown";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface MarkdownTableProps {
  products: ProductMarkdown[];
  onProductUpdate: (productId: string, updates: Partial<ProductMarkdown>) => void;
}

export function MarkdownTable({ products, onProductUpdate }: MarkdownTableProps) {
  const handleDiscountChange = (productId: string, value: string) => {
    const percentual = Math.min(100, Math.max(0, Number(value) || 0));
    onProductUpdate(productId, { percentualDesconto: percentual });
  };

  const handleNivelCorteChange = (productId: string, nivel: DiscountLevel) => {
    // Ao mudar o nível de corte, sugere um desconto padrão
    const descontoSugerido = SUGGESTED_DISCOUNT[nivel];
    onProductUpdate(productId, {
      nivelCorte: nivel,
      percentualDesconto: descontoSugerido,
    });
  };

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-[#E7E7E6]">
        <p className="text-[#28071C]/60 text-lg">
          Nenhum produto encontrado com os filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E7E7E6] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#7598CF] text-[#F6F3AA]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Foto
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Produto
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Categoria
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Estoque Atual
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Preço Original
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                % Desconto
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Preço Final
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Nível de Corte
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Venda Est.
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Estoque Final
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Custo Desc.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E7E6]">
            {products.map((product) => (
              <tr
                key={product.id}
                className="hover:bg-[#E7E7E6]/30 transition-colors"
              >
                {/* Foto */}
                <td className="px-4 py-3">
                  <ImageWithFallback
                    src={product.foto}
                    alt={product.nome}
                    className="w-12 h-12 object-cover rounded"
                  />
                </td>

                {/* Produto */}
                <td className="px-4 py-3">
                  <div>
                    <p className="text-[#28071C] font-medium text-sm">
                      {product.nome}
                    </p>
                    <p className="text-[#28071C]/60 text-xs">
                      {product.temaColecao}
                    </p>
                  </div>
                </td>

                {/* Categoria */}
                <td className="px-4 py-3">
                  <div>
                    <p className="text-[#28071C] text-sm">{product.categoria}</p>
                    <p className="text-[#28071C]/60 text-xs">
                      {product.subcategoria}
                    </p>
                  </div>
                </td>

                {/* Estoque Atual */}
                <td className="px-4 py-3 text-right">
                  <p className="text-[#28071C] font-semibold text-sm">
                    {product.estoqueAtual}
                  </p>
                  <p className="text-[#28071C]/60 text-xs">unidades</p>
                </td>

                {/* Preço Original */}
                <td className="px-4 py-3 text-right">
                  <p className="text-[#28071C] font-semibold text-sm">
                    R$ {product.precoOriginal.toFixed(2)}
                  </p>
                  <p className="text-[#28071C]/60 text-xs">
                    Margem: {product.margemOriginal.toFixed(0)}%
                  </p>
                </td>

                {/* % Desconto (Input) */}
                <td className="px-4 py-3 text-right">
                  <div className="relative inline-block">
                    <input
                      id={`input_desconto_${product.id}`}
                      type="number"
                      min="0"
                      max="100"
                      value={product.percentualDesconto}
                      onChange={(e) =>
                        handleDiscountChange(product.id, e.target.value)
                      }
                      className="w-20 px-2 py-1 border-2 border-[#7598CF] rounded text-right font-bold text-[#28071C] focus:border-[#7598CF] focus:outline-none"
                    />
                    <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#28071C]/60 text-xs pointer-events-none">
                      %
                    </span>
                  </div>
                </td>

                {/* Preço Final (Calculado) */}
                <td className="px-4 py-3 text-right">
                  <p className="text-green-600 font-bold text-sm">
                    R$ {product.precoComDesconto?.toFixed(2)}
                  </p>
                  <p className="text-[#28071C]/60 text-xs">
                    Margem: {product.margemFinal?.toFixed(0)}%
                  </p>
                </td>

                {/* Nível de Corte (Dropdown) */}
                <td className="px-4 py-3">
                  <div className="relative">
                    <select
                      id={`select_nivel_${product.id}`}
                      value={product.nivelCorte}
                      onChange={(e) =>
                        handleNivelCorteChange(
                          product.id,
                          e.target.value as DiscountLevel
                        )
                      }
                      className={`w-full px-3 py-2 border-2 rounded-lg text-xs font-semibold appearance-none focus:outline-none cursor-pointer
                        ${
                          product.nivelCorte === "Baixo"
                            ? "border-green-500 bg-green-50 text-green-700"
                            : product.nivelCorte === "Médio"
                            ? "border-orange-500 bg-orange-50 text-orange-700"
                            : "border-red-500 bg-red-50 text-red-700"
                        }
                      `}
                    >
                      <option value="Baixo">Baixo</option>
                      <option value="Médio">Médio</option>
                      <option value="Agressivo">Agressivo</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" />
                  </div>
                  <p className="text-[#28071C]/60 text-xs mt-1 text-center">
                    {product.nivelCorte === "Baixo" && "+10% vendas"}
                    {product.nivelCorte === "Médio" && "+25% vendas"}
                    {product.nivelCorte === "Agressivo" && "+50% vendas"}
                  </p>
                </td>

                {/* Venda Estimada (Calculado) */}
                <td className="px-4 py-3 text-right">
                  <p className="text-green-600 font-semibold text-sm">
                    {product.vendaEstimada}
                  </p>
                  <p className="text-[#28071C]/60 text-xs">unidades</p>
                </td>

                {/* Estoque Final (Calculado) */}
                <td className="px-4 py-3 text-right">
                  <p
                    className={`font-semibold text-sm ${
                      (product.estoqueFinalPrevisto || 0) > 0
                        ? "text-orange-600"
                        : "text-green-600"
                    }`}
                  >
                    {product.estoqueFinalPrevisto}
                  </p>
                  <p className="text-[#28071C]/60 text-xs">unidades</p>
                </td>

                {/* Custo Desconto (Calculado) */}
                <td className="px-4 py-3 text-right">
                  <p className="text-red-600 font-semibold text-sm">
                    R$ {product.custoDesconto?.toFixed(2)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="bg-[#E7E7E6] px-4 py-3 border-t-2 border-[#7598CF]">
        <div className="flex justify-between items-center text-sm">
          <p className="text-[#28071C] font-semibold">
            Total: {products.length} produto(s) selecionado(s) para markdown
          </p>
          <p className="text-[#28071C]/60 text-xs">
            💡 Dica: Ajuste os descontos e níveis de corte para otimizar a verba e margem
          </p>
        </div>
      </div>
    </div>
  );
}
