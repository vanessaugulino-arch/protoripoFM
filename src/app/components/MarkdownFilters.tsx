import { useState, useMemo } from "react";
import { ChevronDown, X, Search } from "lucide-react";
import { ProductMarkdown } from "../types/markdown";

interface MarkdownFiltersProps {
  products: ProductMarkdown[];
  onFilterChange: (filters: {
    categoria?: string;
    subcategoria?: string;
    temaColecao?: string;
    searchTerm?: string;
  }) => void;
  activeFilters: {
    categoria?: string;
    subcategoria?: string;
    temaColecao?: string;
    searchTerm?: string;
  };
}

export function MarkdownFilters({
  products,
  onFilterChange,
  activeFilters,
}: MarkdownFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(activeFilters.searchTerm || "");

  // Extrai valores únicos para cada filtro
  const uniqueValues = useMemo(() => {
    const categorias = [...new Set(products.map((p) => p.categoria))].sort();
    
    const subcategorias = activeFilters.categoria
      ? [...new Set(
          products
            .filter((p) => p.categoria === activeFilters.categoria)
            .map((p) => p.subcategoria)
        )].sort()
      : [];

    const temas = [...new Set(products.map((p) => p.temaColecao))].sort();

    return { categorias, subcategorias, temas };
  }, [products, activeFilters.categoria]);

  const handleCategoriaChange = (categoria: string) => {
    onFilterChange({
      ...activeFilters,
      categoria: categoria || undefined,
      subcategoria: undefined, // Reset subcategoria quando categoria muda
    });
  };

  const handleSubcategoriaChange = (subcategoria: string) => {
    onFilterChange({
      ...activeFilters,
      subcategoria: subcategoria || undefined,
    });
  };

  const handleTemaChange = (tema: string) => {
    onFilterChange({
      ...activeFilters,
      temaColecao: tema || undefined,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onFilterChange({
      ...activeFilters,
      searchTerm: value || undefined,
    });
  };

  const clearFilters = () => {
    setSearchTerm("");
    onFilterChange({});
  };

  const hasActiveFilters =
    activeFilters.categoria ||
    activeFilters.subcategoria ||
    activeFilters.temaColecao ||
    activeFilters.searchTerm;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E7E7E6] mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#28071C] font-semibold text-sm">
          Filtros Drill-down
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-[#7598CF] hover:underline text-xs flex items-center space-x-1"
          >
            <X className="w-3 h-3" />
            <span>Limpar filtros</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Busca por nome */}
        <div>
          <label className="block text-[#28071C]/70 text-xs mb-1 font-medium">
            Buscar Produto
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#28071C]/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Digite o nome..."
              className="w-full pl-10 pr-3 py-2 border border-[#E7E7E6] rounded-lg text-sm focus:border-[#7598CF] focus:outline-none"
            />
          </div>
        </div>

        {/* Categoria */}
        <div>
          <label className="block text-[#28071C]/70 text-xs mb-1 font-medium">
            Categoria
          </label>
          <div className="relative">
            <select
              value={activeFilters.categoria || ""}
              onChange={(e) => handleCategoriaChange(e.target.value)}
              className="w-full px-3 py-2 border border-[#E7E7E6] rounded-lg text-sm appearance-none focus:border-[#7598CF] focus:outline-none"
            >
              <option value="">Todas</option>
              {uniqueValues.categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#28071C]/40 pointer-events-none" />
          </div>
        </div>

        {/* Subcategoria */}
        <div>
          <label className="block text-[#28071C]/70 text-xs mb-1 font-medium">
            Subcategoria
          </label>
          <div className="relative">
            <select
              value={activeFilters.subcategoria || ""}
              onChange={(e) => handleSubcategoriaChange(e.target.value)}
              disabled={!activeFilters.categoria}
              className="w-full px-3 py-2 border border-[#E7E7E6] rounded-lg text-sm appearance-none focus:border-[#7598CF] focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
            >
              <option value="">Todas</option>
              {uniqueValues.subcategorias.map((subcat) => (
                <option key={subcat} value={subcat}>
                  {subcat}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#28071C]/40 pointer-events-none" />
          </div>
        </div>

        {/* Tema de Coleção */}
        <div>
          <label className="block text-[#28071C]/70 text-xs mb-1 font-medium">
            Tema de Coleção
          </label>
          <div className="relative">
            <select
              value={activeFilters.temaColecao || ""}
              onChange={(e) => handleTemaChange(e.target.value)}
              className="w-full px-3 py-2 border border-[#E7E7E6] rounded-lg text-sm appearance-none focus:border-[#7598CF] focus:outline-none"
            >
              <option value="">Todos</option>
              {uniqueValues.temas.map((tema) => (
                <option key={tema} value={tema}>
                  {tema}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#28071C]/40 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.categoria && (
            <div className="bg-[#7598CF]/10 text-[#7598CF] px-3 py-1 rounded-full text-xs flex items-center space-x-1">
              <span>Categoria: {activeFilters.categoria}</span>
              <button
                onClick={() => handleCategoriaChange("")}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {activeFilters.subcategoria && (
            <div className="bg-[#7598CF]/10 text-[#7598CF] px-3 py-1 rounded-full text-xs flex items-center space-x-1">
              <span>Subcategoria: {activeFilters.subcategoria}</span>
              <button
                onClick={() => handleSubcategoriaChange("")}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {activeFilters.temaColecao && (
            <div className="bg-[#7598CF]/10 text-[#7598CF] px-3 py-1 rounded-full text-xs flex items-center space-x-1">
              <span>Tema: {activeFilters.temaColecao}</span>
              <button
                onClick={() => handleTemaChange("")}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
