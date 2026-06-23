import { DollarSign, TrendingDown, TrendingUp, Package, AlertCircle } from "lucide-react";
import { MarkdownSummary } from "../types/markdown";

interface MarkdownControlPanelProps {
  summary: MarkdownSummary;
}

export function MarkdownControlPanel({ summary }: MarkdownControlPanelProps) {
  const {
    verbaTotalDisponivel,
    verbaTotalUtilizada,
    percentualUtilizacao,
    margemMediaOriginal,
    margemMediaFinal,
    totalUnidadesEstoque,
    totalUnidadesVendaEstimada,
    totalEstoqueFinalPrevisto,
  } = summary;

  // Determina cor do card de utilização de verba
  const getUsageColor = () => {
    if (percentualUtilizacao > 100) return "text-red-600";
    if (percentualUtilizacao > 90) return "text-orange-600";
    return "text-green-600";
  };

  // Determina cor da margem final
  const getMarginColor = () => {
    if (margemMediaFinal < 30) return "text-red-600";
    if (margemMediaFinal < 40) return "text-orange-600";
    return "text-green-600";
  };

  return (
    <div className="sticky top-0 z-20 bg-white shadow-lg rounded-xl p-6 mb-6 border-2 border-[#7598CF]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#28071C] text-lg font-bold">
          Painel de Controle - Recálculo em Tempo Real
        </h2>
        <div className="flex items-center space-x-2 text-[#7598CF] text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Atualizando automaticamente</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Card 1: Utilização da Verba */}
        <div className="bg-[#F2F2F2] rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <DollarSign className="w-5 h-5 text-[#28071C]/70" />
            <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">
              Utilização da Verba
            </p>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${getUsageColor()}`}>
              {percentualUtilizacao.toFixed(1)}%
            </p>
            <p className="text-[#28071C]/60 text-xs">
              R$ {verbaTotalUtilizada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[#28071C]/60 text-xs">
              de R$ {verbaTotalDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          {percentualUtilizacao > 100 && (
            <div className="mt-2 flex items-center space-x-1 text-red-600 text-xs">
              <AlertCircle className="w-3 h-3" />
              <span>Verba excedida!</span>
            </div>
          )}
        </div>

        {/* Card 2: Margem Final Estimada */}
        <div className="bg-[#F2F2F2] rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingDown className="w-5 h-5 text-[#28071C]/70" />
            <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">
              Margem Final Estimada
            </p>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${getMarginColor()}`}>
              {margemMediaFinal.toFixed(1)}%
            </p>
            <p className="text-[#28071C]/60 text-xs">
              Original: {margemMediaOriginal.toFixed(1)}%
            </p>
            <p className="text-[#28071C]/60 text-xs">
              Redução: {(margemMediaOriginal - margemMediaFinal).toFixed(1)}pp
            </p>
          </div>
        </div>

        {/* Card 3: Venda Estimada */}
        <div className="bg-[#F2F2F2] rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="w-5 h-5 text-[#28071C]/70" />
            <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">
              Venda Estimada
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[#28071C] text-2xl font-bold">
              {totalUnidadesVendaEstimada.toLocaleString('pt-BR')}
            </p>
            <p className="text-[#28071C]/60 text-xs">
              unidades
            </p>
            <p className="text-green-600 text-xs font-semibold">
              +{((totalUnidadesVendaEstimada / totalUnidadesEstoque - 1) * 100).toFixed(0)}% 
              vs estoque atual
            </p>
          </div>
        </div>

        {/* Card 4: Estoque Final Previsto */}
        <div className="bg-[#F2F2F2] rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Package className="w-5 h-5 text-[#28071C]/70" />
            <p className="text-[#28071C]/60 text-xs uppercase tracking-wide">
              Estoque Final Previsto
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[#28071C] text-2xl font-bold">
              {totalEstoqueFinalPrevisto.toLocaleString('pt-BR')}
            </p>
            <p className="text-[#28071C]/60 text-xs">
              unidades
            </p>
            <p className="text-[#28071C]/60 text-xs">
              Atual: {totalUnidadesEstoque.toLocaleString('pt-BR')} un
            </p>
          </div>
        </div>
      </div>

      {/* Alertas e Recomendações */}
      {percentualUtilizacao > 100 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm font-semibold">
            ⚠️ Atenção: Você está excedendo a verba disponível em R$ {(verbaTotalUtilizada - verbaTotalDisponivel).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-red-600 text-xs mt-1">
            Reduza os descontos ou remova produtos do plano de markdown.
          </p>
        </div>
      )}

      {margemMediaFinal < 30 && (
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
          <p className="text-orange-800 text-sm font-semibold">
            ⚠️ Margem final abaixo do recomendado ({margemMediaFinal.toFixed(1)}%)
          </p>
          <p className="text-orange-600 text-xs mt-1">
            Considere ajustar os descontos para manter a margem acima de 30%.
          </p>
        </div>
      )}
    </div>
  );
}
