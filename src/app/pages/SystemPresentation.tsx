// ─── SystemPresentation.tsx — full-screen, sem rolagem ───────────────────────
// Mesmo padrão visual do Onboarding: topbar escuro + área cinza full-width.
// Tabs (O Desafio / O Fluxo / O que você consegue) ficam no topbar.
// Conteúdo compactado para caber sem rolagem em qualquer tela ≥ 768px.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, X } from "lucide-react";

// ── Dados dos slides ──────────────────────────────────────────────────────────
const SLIDES = [
  {
    label:    "O Desafio",
    title:    "O desafio na moda",
    subtitle: "Como estruturar uma coleção que parte de metas reais de receita e margem?",
  },
  {
    label:    "O Fluxo",
    title:    "Planejamento completo",
    subtitle: "Um método em três níveis que conecta a meta macro ao detalhe do sortimento.",
  },
  {
    label:    "O que você consegue",
    title:    "O que você consegue",
    subtitle: "Decisões mais rápidas, coleções mais assertivas, metas que fecham.",
  },
];

// ── Componente ────────────────────────────────────────────────────────────────
export default function SystemPresentation() {
  const navigate  = useNavigate();
  const [current, setCurrent] = useState(0);
  const isLast    = current === SLIDES.length - 1;

  const markSeen = () => localStorage.setItem("fashionmind_presentation_seen", "true");

  function handleSkip() {
    markSeen();
    goNext(true);
  }
  function handleNext() {
    if (current < SLIDES.length - 1) {
      setCurrent(current + 1);
    } else {
      markSeen();
      goNext(false);
    }
  }
  function goNext(skip: boolean) {
    const done = localStorage.getItem("fashionmind_onboarding_complete");
    navigate(skip || done === "true" ? "/dashboard" : "/onboarding");
  }

  const slide = SLIDES[current];

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#28071C]">

      {/* ══════════════════════════════════════════════════════════════════════
          TOPBAR
      ══════════════════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 h-[72px] flex items-center px-8 gap-6">

        {/* Logo */}
        <div className="flex items-baseline gap-1.5 w-44 flex-shrink-0">
          <span className="text-[#F6F3AA] text-sm font-semibold select-none">Fashion Mind</span>
          <span className="text-[#F6F3AA]/35 text-[10px] select-none">Bem-vindo</span>
        </div>

        {/* Tabs — centro */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {SLIDES.map((s, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className="flex flex-col items-center gap-1 px-4 group">
              <div className={`h-0.5 w-16 rounded-full transition-all duration-300 ${
                i <= current ? "bg-[#F6F3AA]/80" : "bg-white/15"
              }`} />
              <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${
                i === current ? "text-white" : "text-white/25 group-hover:text-white/50"
              }`}>
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Pular */}
        <div className="w-44 flex justify-end flex-shrink-0">
          <button onClick={handleSkip}
            className="flex items-center gap-1.5 text-[#F6F3AA]/40 hover:text-[#F6F3AA] transition-colors text-sm">
            <X className="w-3.5 h-3.5" /> Pular
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          ÁREA PRINCIPAL
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-[#F2F2F2] rounded-t-2xl overflow-hidden">

        {/* Título da etapa */}
        <div className="flex-shrink-0 px-12 pt-7 pb-4">
          <h2 className="text-[#28071C] text-2xl font-bold tracking-tight">{slide.title}</h2>
          <p className="text-[#28071C]/50 text-sm mt-1 leading-relaxed">{slide.subtitle}</p>
        </div>

        <div className="flex-shrink-0 h-px bg-[#28071C]/8 mx-12" />

        {/* Conteúdo do slide */}
        <div className="flex-1 overflow-hidden px-12 py-5">

          {/* ──────────────────────────────────────────────────────────
              SLIDE 1 — O Desafio
          ────────────────────────────────────────────────────────── */}
          {current === 0 && (
            <div className="h-full flex flex-col gap-4">
              {/* 4 cards de problema */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: "Orçamentos e MFPs param na quantidade de compra", desc: "Não chegam à arquitetura do sortimento." },
                  { title: "PLMs assumem a arquitetura já decidida",        desc: "Partem do produto, não da meta financeira." },
                  { title: "Entre o número e a criação há um vazio",       desc: "Nenhuma ferramenta preenche esse gap com método." },
                  { title: "Decisões sem base de dados integrada",          desc: "Estilo e comercial trabalham desconectados." },
                ].map((item, i) => (
                  <div key={i} className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
                    <div>
                      <p className="text-[#28071C] text-sm font-semibold leading-snug">{item.title}</p>
                      <p className="text-[#28071C]/55 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Card da solução */}
              <div className="bg-[#28071C] rounded-2xl px-6 py-4 text-white">
                <p className="text-[#F6F3AA] font-semibold text-base mb-3">A solução Fashion Mind</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {[
                    "Planejamento de cima para baixo — da meta ao detalhe",
                    "Do estratégico até o operacional em um método claro",
                    "Simule, salve e compare cenários em qualquer ponto",
                    "Preenche o vazio entre finanças e criação",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-white/80">
                      <span className="text-[#F6F3AA] flex-shrink-0 mt-0.5">✓</span>
                      {item}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[#F6F3AA]/55 text-xs italic">
                  "De uma meta de receita a um portfólio balanceado e assertivo."
                </p>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────
              SLIDE 2 — O Fluxo
          ────────────────────────────────────────────────────────── */}
          {current === 1 && (
            <div className="h-full flex flex-col gap-3">
              {/* 3 níveis */}
              {[
                {
                  level: "Estratégico",
                  color: "bg-[#7598CF]", text: "text-[#7598CF]",
                  border: "border-[#7598CF]/25", bg: "bg-[#7598CF]/6",
                  desc: "Metas de receita, margem e orçamento",
                  detail: 'Foco em giro? Margem? Crescimento? Simule cenários "Crescimento" vs "Conservador" antes de comprometer o ciclo.',
                },
                {
                  level: "Tático",
                  color: "bg-[#9B8CD8]", text: "text-[#9B8CD8]",
                  border: "border-[#9B8CD8]/25", bg: "bg-[#9B8CD8]/6",
                  desc: "Quebra por canal, sazonalidade e grupos",
                  detail: "Quanto cada divisão contribui? Compare distribuições e veja o impacto consolidado em tempo real.",
                },
                {
                  level: "Operacional",
                  color: "bg-[#28071C]", text: "text-[#28071C]",
                  border: "border-[#28071C]/15", bg: "bg-[#28071C]/4",
                  desc: "Engenharia de sortimento e mix de produtos",
                  detail: "Quantos SKUs? Qual distribuição por faixa de preço? Simule composições com base sólida em números reais.",
                },
              ].map((item, i) => (
                <div key={i} className={`${item.bg} border ${item.border} rounded-xl px-5 py-3.5`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.color}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${item.text}`}>{item.level}</span>
                  </div>
                  <p className="text-[#28071C] font-semibold text-sm">{item.desc}</p>
                  <p className="text-[#28071C]/55 text-xs mt-0.5 leading-relaxed">{item.detail}</p>
                </div>
              ))}

              {/* Banner */}
              <div className="bg-[#F6F3AA]/50 border border-[#F6F3AA] rounded-xl px-5 py-3 text-center">
                <p className="text-[#28071C] font-semibold text-sm">
                  Em cada nível: simule → salve → compare → selecione o melhor cenário
                </p>
                <p className="text-[#28071C]/45 text-xs mt-0.5">
                  Nenhuma simulação altera dados oficiais até você aplicar formalmente.
                </p>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────
              SLIDE 3 — O que você consegue
          ────────────────────────────────────────────────────────── */}
          {current === 2 && (
            <div className="h-full flex flex-col gap-3">
              {/* 3 perfis */}
              {[
                {
                  perfil: "Estratégico", icon: "🎯",
                  desc: "Vejo minha meta decomposta até o último detalhe. Simulo cenários antes de decidir. Tenho recomendações em tempo real se algo sai do trilho.",
                  color: "border-[#7598CF]/30 bg-[#7598CF]/5",
                },
                {
                  perfil: "Tático", icon: "📊",
                  desc: "Entendo como o estratégico se divide nos meus canais. Comparo diferentes distribuições e escolho a melhor. Meus ajustes se desdobram em todos os níveis.",
                  color: "border-[#9B8CD8]/30 bg-[#9B8CD8]/5",
                },
                {
                  perfil: "Operacional", icon: "✏️",
                  desc: "Recebo um briefing claro com metas por categoria. Simulo diferentes composições de sortimento. Meu trabalho criativo tem base sólida em números.",
                  color: "border-[#28071C]/12 bg-[#28071C]/3",
                },
              ].map((item, i) => (
                <div key={i} className={`border rounded-xl px-5 py-3.5 ${item.color}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-[#28071C] font-semibold text-sm">{item.perfil}</span>
                  </div>
                  <p className="text-[#28071C]/65 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}

              {/* Resultado */}
              <div className="bg-[#28071C] rounded-xl px-5 py-3.5">
                <p className="font-bold text-sm mb-0.5 text-[#F6F3AA]">Resultado</p>
                <p className="text-white/80 text-xs leading-relaxed">
                  Menos rejeição, mais assertividade — coleções que fecham as metas e um processo até 70% mais rápido.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer nav ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-12 py-4 border-t border-[#28071C]/8 bg-[#EBEBEB]/60 flex items-center justify-between">
          <span className="text-[#28071C]/40 text-sm">{current + 1} de {SLIDES.length}</span>

          <div className="flex items-center gap-3">
            {current > 0 && (
              <button onClick={() => setCurrent(current - 1)}
                className="text-sm text-[#28071C]/40 hover:text-[#28071C] transition-colors">
                Voltar
              </button>
            )}
            <button onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl font-semibold text-sm hover:bg-[#28071C]/90 transition-all shadow-sm">
              {isLast ? "Começar" : "Próximo"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
