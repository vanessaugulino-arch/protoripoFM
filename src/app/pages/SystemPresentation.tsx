import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, X } from "lucide-react";

const SLIDES = [
  {
    label: "O Desafio",
    content: (
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-3xl text-[#28071C] mb-2">O desafio na moda</h2>
          <p className="text-[#28071C]/60 text-base leading-relaxed">
            Como estruturar uma coleção que parte de metas reais de receita e margem?
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: "⚠️", title: "OTBs e MFPs param na quantidade de compra", desc: "Não chegam à arquitetura do sortimento." },
            { icon: "⚠️", title: "PLMs assumem a arquitetura já decidida", desc: "Partem do produto, não da meta financeira." },
            { icon: "⚠️", title: "Entre o número e a criação há um vazio", desc: "Nenhuma ferramenta preenche esse gap com método." },
            { icon: "⚠️", title: "Decisões sem base de dados integrada", desc: "Estilo e comercial trabalham desconectados." },
          ].map((item, i) => (
            <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-4">
              <div className="text-xl mb-2">{item.icon}</div>
              <p className="text-[#28071C] text-sm font-semibold mb-1">{item.title}</p>
              <p className="text-[#28071C]/60 text-xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#28071C] rounded-2xl p-6 text-white">
          <p className="text-[#F6F3AA] font-semibold text-lg mb-3">A solução Fashion Mind</p>
          <div className="space-y-2">
            {[
              "Planejamento de cima para baixo — da meta ao detalhe",
              "Do estratégico até o operacional em um método claro",
              "Simule, salve e compare cenários em qualquer ponto",
              "Preenche o vazio entre finanças e criação",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-white/90">
                <span className="text-[#F6F3AA] mt-0.5 flex-shrink-0">✓</span>
                {item}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[#F6F3AA]/70 text-xs italic">
            "De uma meta de receita a um portfólio balanceado e assertivo."
          </p>
        </div>
      </div>
    ),
  },
  {
    label: "O Fluxo",
    content: (
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-3xl text-[#28071C] mb-2">Planejamento completo</h2>
          <p className="text-[#28071C]/60 text-base leading-relaxed">
            Um método em três níveis que conecta a meta macro ao detalhe do sortimento.
          </p>
        </div>

        <div className="space-y-4">
          {[
            {
              level: "Estratégico",
              color: "bg-[#7598CF]",
              textColor: "text-[#7598CF]",
              borderColor: "border-[#7598CF]",
              bgLight: "bg-[#7598CF]/8",
              desc: "Metas de receita, margem e orçamento",
              detail: 'Decidir: foco em giro? margem? crescimento? Simule cenários "Crescimento" vs "Conservador" antes de comprometer o ciclo.',
            },
            {
              level: "Tático",
              color: "bg-[#9B8CD8]",
              textColor: "text-[#9B8CD8]",
              borderColor: "border-[#9B8CD8]",
              bgLight: "bg-[#9B8CD8]/8",
              desc: "Quebra por canal, sazonalidade e grupos",
              detail: "Decidir: quanto cada divisão contribui? Compare distribuições e veja o impacto consolidado em tempo real.",
            },
            {
              level: "Operacional",
              color: "bg-[#28071C]",
              textColor: "text-[#28071C]",
              borderColor: "border-[#28071C]",
              bgLight: "bg-[#28071C]/5",
              desc: "Engenharia de sortimento e mix de produtos",
              detail: "Decidir: quantos SKUs? Qual distribuição por faixa de preço? Simule composições com base sólida em números reais.",
            },
          ].map((item, i) => (
            <div key={i} className={`${item.bgLight} border ${item.borderColor} border-opacity-20 rounded-xl p-5`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className={`text-xs font-bold uppercase tracking-widest ${item.textColor}`}>{item.level}</span>
              </div>
              <p className="text-[#28071C] font-semibold text-sm mb-1">{item.desc}</p>
              <p className="text-[#28071C]/60 text-xs leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#F6F3AA]/40 border border-[#F6F3AA] rounded-xl p-4 text-center">
          <p className="text-[#28071C] font-semibold text-sm">
            Em cada nível: simule → salve → compare → selecione o melhor cenário
          </p>
          <p className="text-[#28071C]/50 text-xs mt-1">
            Nenhuma simulação altera dados oficiais até você aplicar formalmente.
          </p>
        </div>
      </div>
    ),
  },
  {
    label: "O que você consegue",
    content: (
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-3xl text-[#28071C] mb-2">O que você consegue</h2>
          <p className="text-[#28071C]/60 text-base leading-relaxed">
            Decisões mais rápidas, coleções mais assertivas, metas que fecham.
          </p>
        </div>

        <div className="space-y-4">
          {[
            {
              perfil: "Estratégico",
              icon: "🎯",
              desc: "Vejo minha meta decomposta até o último detalhe. Simulo cenários antes de decidir. Tenho recomendações em tempo real se algo sai do trilho.",
              color: "border-[#7598CF] bg-[#7598CF]/5",
            },
            {
              perfil: "Tático",
              icon: "📊",
              desc: "Entendo como o estratégico se divide nos meus canais. Comparo diferentes distribuições e escolho a melhor. Meus ajustes se desdobram em todos os níveis com inteligência.",
              color: "border-[#9B8CD8] bg-[#9B8CD8]/5",
            },
            {
              perfil: "Operacional",
              icon: "✏️",
              desc: "Recebo um briefing claro com metas por categoria. Simulo diferentes composições de sortimento. Meu trabalho criativo tem base sólida em números.",
              color: "border-[#28071C]/20 bg-[#28071C]/3",
            },
          ].map((item, i) => (
            <div key={i} className={`border rounded-xl p-5 ${item.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{item.icon}</span>
                <span className="text-[#28071C] font-semibold text-sm">{item.perfil}</span>
              </div>
              <p className="text-[#28071C]/70 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-[#7598CF] to-[#9B8CD8] rounded-2xl p-5 text-white text-center">
          <p className="font-bold text-lg mb-1">Resultado</p>
          <p className="text-white/90 text-sm leading-relaxed">
            Menos rejeição, mais assertividade — coleções que fecham as metas e um processo até 70% mais rápido.
          </p>
        </div>
      </div>
    ),
  },
];

export default function SystemPresentation() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);

  const markSeen = () => {
    localStorage.setItem("fashionmind_presentation_seen", "true");
  };

  const handleSkip = () => {
    markSeen();
    goNext(true);
  };

  const handleNext = () => {
    if (current < SLIDES.length - 1) {
      setCurrent(current + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    markSeen();
    goNext(false);
  };

  const goNext = (skip: boolean) => {
    const onboardingDone = localStorage.getItem("fashionmind_onboarding_complete");
    if (skip || onboardingDone === "true") {
      navigate("/dashboard");
    } else {
      navigate("/onboarding");
    }
  };

  const isLast = current === SLIDES.length - 1;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#7598CF] to-[#9B8CD8] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#F2F2F2] rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-[#28071C] px-8 py-5 flex items-center justify-between">
          <div>
            <span className="text-[#F6F3AA] text-lg font-semibold">Fashion Mind</span>
            <span className="text-[#F6F3AA]/50 text-sm ml-3">Bem-vindo</span>
          </div>
          <button
            onClick={handleSkip}
            className="flex items-center gap-1.5 text-[#F6F3AA]/50 hover:text-[#F6F3AA] transition-colors text-sm"
          >
            <X className="w-4 h-4" />
            Pular
          </button>
        </div>

        {/* Slide indicator */}
        <div className="flex gap-1.5 px-8 pt-6">
          {SLIDES.map((slide, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="flex items-center gap-2 flex-1"
            >
              <div
                className={`h-1 rounded-full w-full transition-all duration-300 ${
                  i <= current ? "bg-[#28071C]" : "bg-[#28071C]/15"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="flex gap-2 px-8 pt-2 pb-1">
          {SLIDES.map((slide, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`flex-1 text-left text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                i === current ? "text-[#28071C]" : "text-[#28071C]/30"
              }`}
            >
              {slide.label}
            </button>
          ))}
        </div>

        {/* Slide content */}
        <div className="px-8 py-6 max-h-[520px] overflow-y-auto">
          {SLIDES[current].content}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 border-t border-[#28071C]/8 flex items-center justify-between">
          <span className="text-[#28071C]/40 text-sm">
            {current + 1} de {SLIDES.length}
          </span>
          <button
            onClick={isLast ? handleFinish : handleNext}
            className="flex items-center gap-2 px-6 py-3 bg-[#28071C] text-white rounded-xl font-semibold hover:bg-[#28071C]/90 transition-all shadow-md"
          >
            {isLast ? "Começar" : "Próximo"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
