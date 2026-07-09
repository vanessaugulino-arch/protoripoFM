// src/app/components/HierarchyConceptSlides.tsx
// Carrossel de slides explicando hierarquia mercadológica

import { useState } from "react";
import { ChevronLeft, ChevronRight, X, Layers, BarChart3, Tag, FileSpreadsheet, Shuffle } from "lucide-react";

interface Props {
  onClose: () => void;
}

const SLIDES = [
  {
    id: 1,
    icon: Layers,
    color: "#7598CF",
    title: "O que é a Hierarquia Mercadológica?",
    content: (
      <div className="space-y-4">
        <p className="text-[#28071C]/70 text-sm leading-relaxed">
          Toda marca organiza seus produtos em grupos analíticos. Essa estrutura — da mais ampla (Divisão) à mais específica (Linha) — é o que chamamos de <strong>hierarquia mercadológica</strong>.
        </p>
        {/* Pirâmide visual */}
        <div className="flex flex-col items-center gap-1 py-3">
          {[
            { label: "Divisão", example: "Feminino · Masculino · Infantil", w: "w-32", bg: "bg-[#7598CF]" },
            { label: "Categoria", example: "Sapatos · Bolsas · Vestuário", w: "w-48", bg: "bg-[#7598CF]/70" },
            { label: "Subcategoria", example: "Salto Alto · Loafer · Tênis", w: "w-64", bg: "bg-[#7598CF]/45" },
            { label: "Linha", example: "Casual · Festa · Sport · Básicos", w: "w-80", bg: "bg-[#7598CF]/25" },
          ].map(({ label, example, w, bg }) => (
            <div key={label} className={`${w} ${bg} rounded-lg px-4 py-2 text-center`}>
              <p className="text-[#28071C] font-bold text-xs">{label}</p>
              <p className="text-[#28071C]/60 text-[10px] mt-0.5">{example}</p>
            </div>
          ))}
        </div>
        <p className="text-[#28071C]/50 text-xs text-center">
          Cada produto tem: <strong>material</strong> e <strong>nome/descrição</strong>
        </p>
      </div>
    ),
  },
  {
    id: 2,
    icon: Layers,
    color: "#7598CF",
    title: "Os 4 Níveis em Detalhes",
    content: (
      <div className="space-y-3">
        {[
          {
            nivel: "Divisão",
            desc: "O maior agrupamento. Geralmente reflete o público-alvo ou canal de venda.",
            ex: "Feminino, Masculino, Infantil, Unissex",
            icon: "🏢",
          },
          {
            nivel: "Categoria",
            desc: "Tipo de produto dentro de uma divisão.",
            ex: "Sapatos, Bolsas, Acessórios, Roupas",
            icon: "🗂",
          },
          {
            nivel: "Subcategoria",
            desc: "Especificação da categoria — usada para análises mais granulares.",
            ex: "Salto Alto, Loafer, Scarpin, Oxford",
            icon: "📦",
          },
          {
            nivel: "Linha",
            desc: "Nível mais específico. Pode representar coleções, acabamentos ou faixa de uso.",
            ex: "Casual, Festa, Sport, Executivo",
            icon: "📋",
          },
        ].map(({ nivel, desc, ex, icon }) => (
          <div key={nivel} className="flex gap-3 bg-[#28071C]/4 rounded-xl px-4 py-3">
            <span className="text-xl shrink-0">{icon}</span>
            <div>
              <p className="text-[#28071C] font-bold text-sm">{nivel}</p>
              <p className="text-[#28071C]/60 text-xs mt-0.5">{desc}</p>
              <p className="text-[#7598CF] text-xs mt-1 font-medium">Ex: {ex}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 3,
    icon: BarChart3,
    color: "#4CAF82",
    title: "Por que isso importa para o seu negócio?",
    content: (
      <div className="space-y-4">
        <p className="text-[#28071C]/70 text-sm leading-relaxed">
          Com a hierarquia bem mapeada, você consegue analisar qualquer indicador em qualquer profundidade — do total da marca até o nível de subcategoria específica.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { emoji: "📊", label: "Sell-through por categoria", desc: "Quais grupos vendem mais rápido?" },
            { emoji: "💰", label: "Margem por linha", desc: "Onde estão as margens mais altas?" },
            { emoji: "🔄", label: "Giro de estoque", desc: "O que precisa de promoção?" },
            { emoji: "📅", label: "Sazonalidade", desc: "Quais categorias vendem em qual temporada?" },
          ].map(({ emoji, label, desc }) => (
            <div key={label} className="bg-white border border-[#4CAF82]/20 rounded-xl p-3">
              <p className="text-xl mb-1">{emoji}</p>
              <p className="text-[#28071C] font-semibold text-xs">{label}</p>
              <p className="text-[#28071C]/50 text-[10px] mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <div className="bg-[#4CAF82]/8 border border-[#4CAF82]/20 rounded-xl px-4 py-3">
          <p className="text-[#28071C]/70 text-xs">
            ✅ Quando uma categoria cresce demais, você pode <strong>criar uma subcategoria nova</strong> e migrar os produtos — mantendo o histórico e afinando a análise.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    icon: Tag,
    color: "#E8A838",
    title: "Seus Termos, Sua Marca",
    content: (
      <div className="space-y-4">
        <p className="text-[#28071C]/70 text-sm leading-relaxed">
          Cada marca tem seu vocabulário. O sistema usa <strong>Divisão, Categoria, Subcategoria e Linha</strong> internamente — mas você pode renomear cada nível para o termo que a sua equipe usa.
        </p>
        <div className="space-y-2">
          {[
            { interno: "Divisão",      externo: "Departamento" },
            { interno: "Categoria",    externo: "Grupo" },
            { interno: "Subcategoria", externo: "Família" },
            { interno: "Linha",        externo: "Linha (manteve)" },
          ].map(({ interno, externo }) => (
            <div key={interno} className="flex items-center gap-3 bg-[#28071C]/4 rounded-lg px-4 py-2.5">
              <span className="text-[#28071C]/40 text-xs w-24 shrink-0">{interno}</span>
              <span className="text-[#E8A838] text-xs">→</span>
              <span className="text-[#28071C] text-sm font-semibold">{externo}</span>
            </div>
          ))}
        </div>
        <p className="text-[#28071C]/50 text-xs">
          Configure esses rótulos no campo <strong>"Seus Rótulos"</strong> logo abaixo. Eles serão usados em todos os relatórios e planilhas exportadas.
        </p>
      </div>
    ),
  },
  {
    id: 5,
    icon: FileSpreadsheet,
    color: "#9B8CD8",
    title: "Importando do ERP",
    content: (
      <div className="space-y-4">
        <p className="text-[#28071C]/70 text-sm leading-relaxed">
          Muitos ERPs não exportam hierarquia — ou exportam com nomes diferentes. Se for o seu caso, prepare uma planilha de cruzamento:
        </p>
        <div className="bg-white border border-[#9B8CD8]/20 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#9B8CD8]/15">
              <tr>
                {["SKU", "Divisão", "Categoria", "Subcategoria", "Linha"].map(h => (
                  <th key={h} className="px-3 py-2 text-[#28071C] font-semibold text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["001234", "Feminino", "Sapatos", "Loafer", "Casual"],
                ["001235", "Feminino", "Sapatos", "Salto Alto", "Festa"],
                ["001236", "Masculino", "Bolsas", "", ""],
              ].map((row, i) => (
                <tr key={i} className="border-t border-[#28071C]/8">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 ${cell ? "text-[#28071C]" : "text-[#28071C]/25"}`}>
                      {cell || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2 bg-[#9B8CD8]/8 border border-[#9B8CD8]/20 rounded-xl px-4 py-3">
          <Shuffle className="w-4 h-4 text-[#9B8CD8] shrink-0 mt-0.5" />
          <p className="text-[#28071C]/70 text-xs">
            Após importar, o sistema atualiza a hierarquia de cada produto pelo SKU. Produtos não encontrados são reportados separadamente.
          </p>
        </div>
      </div>
    ),
  },
];

export function HierarchyConceptSlides({ onClose }: Props) {
  const [current, setCurrent] = useState(0);
  const slide = SLIDES[current];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[#28071C]/8 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${slide.color}20` }}>
              <Icon className="w-5 h-5" style={{ color: slide.color }} />
            </div>
            <div>
              <p className="text-[#28071C]/40 text-xs font-semibold uppercase tracking-widest">
                Conceito · {current + 1}/{SLIDES.length}
              </p>
              <h3 className="text-[#28071C] font-bold text-base leading-tight">{slide.title}</h3>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#28071C]/40 hover:text-[#28071C] hover:bg-[#28071C]/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {slide.content}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#28071C]/8 shrink-0">
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#28071C]/15 text-[#28071C]/60 text-sm font-semibold disabled:opacity-30 hover:enabled:bg-[#28071C]/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />Anterior
          </button>

          {/* Dots */}
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === current ? "bg-[#7598CF] w-5" : "bg-[#28071C]/20"}`} />
            ))}
          </div>

          {current < SLIDES.length - 1 ? (
            <button
              onClick={() => setCurrent(c => Math.min(SLIDES.length - 1, c + 1))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7598CF] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Próximo<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#28071C] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              Entendido ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
