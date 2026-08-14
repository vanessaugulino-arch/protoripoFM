import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, LogOut, User, Save, GitCompare, Download, Lock,
  Check, X, AlertTriangle, CheckCircle2, Info, Clock, FileDown, HelpCircle,
  SendHorizonal, ArrowRight,
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import {
  createApprovalRequest,
  getPendingApprovalsForUser,
  resolveApproval,
  hasPendingRequest,
  type PlanApprovalRequest,
  type ImpactedIndicator,
} from "../../services/supabase/planApprovalService";
import { applyChannelScenario } from "../../services/supabase/channelScenarioService";
import { recomputeOfficialMacro, advanceDetailLevel } from "../../services/supabase/officialPlanService";
import { computeMarginCompensationViaMkd } from "../../engine/clusterCompensation";

const CHANNEL_PLANNING_TOUR: TourStep[] = [
  {
    targetId: "tour-cp-title",
    title: "Módulo 2 — Metas por Canal",
    content: "Distribua a meta macro do ciclo entre seus canais de venda. Atacado, Varejo e E-commerce precisam fechar 100% da receita total definida no Módulo 1.",
  },
  {
    targetId: "tour-cp-orientation",
    title: "Ambiente de Simulação",
    content: "Você está num ambiente seguro: altere participações e drivers sem impactar nada até escolher aplicar. Simule cenários pessimista, realista e otimista para cada canal antes de decidir.",
  },
  {
    targetId: "tour-cp-channels",
    title: "Distribuição por Canal",
    content: "Cada coluna é um canal. Ajuste o % de participação e os drivers (margem, PMV, giro, cobertura) — os totais consolidados atualizam em tempo real para você ver o impacto de cada decisão.",
  },
  {
    targetId: "tour-cp-title",
    title: "Salve, Compare e Aplique",
    content: "Quando estiver satisfeito com um cenário, salve-o. Crie quantos quiser. Depois compare lado a lado e aplique o vencedor — só então o plano por canal fica registrado formalmente.",
  },
];
import { exportToPDF } from "../../utils/exportPDF";
import { getStoredProfile } from "../types/onboarding";
import type { SalesChannelId } from "../types/onboarding";
import { getPlanCycle, getPlannedYears, initPlanCycles } from "../types/planCycle";
import {
  saveChannelScenario as dbSaveChannelScenario,
  listChannelScenarios as dbListChannelScenarios,
  deleteChannelScenario as dbDeleteChannelScenario,
  getReviewedYears as dbGetReviewedYears,
} from "../../services/supabase/channelScenarioService";
import type { ChannelScenario } from "../../services/supabase/channelScenarioService";
import { exportChannelScenarios } from "../../services/channelScenarioService";
import {
  getHistoricalProfiles,
  normalizeChannelPcts,
} from "../../services/supabase/historicalProfileService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserData { id?: string; name: string; email: string; profile: string }

interface ChannelData {
  receita: number;           // computed: macroReceita × pct/100
  margemBrutaRS: number;     // computed: receita × margemBruta/100
  margemBruta: number;       // % — driver
  pmv: number;               // R$ — driver
  ticketMedio: number;       // R$ — driver
  custoMedio: number;        // R$ — driver
  giro: number;              // — driver
  cobertura: number;         // days — driver
  orcamento: number;           // computed: producao × custoMedio
  estoqueMedioRS: number;    // computed: receita / giro
  estoqueMedioPecas: number; // computed
  mkdPct: number;            // % — driver
  markdown: number;          // computed: receita × mkdPct/100
  producao: number;          // computed: receita / pmv
  totalPecas: number;        // computed: = producao
  gmroi: number;             // — driver
}

type ChannelId = "atacado" | "varejo" | "ecommerce";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_SALES_IDS: Record<ChannelId, SalesChannelId[]> = {
  atacado:   ["atacado"],
  varejo:    ["varejo_fisico", "franquia", "popup"],
  ecommerce: ["ecommerce_proprio", "marketplace", "social_commerce"],
};

const CHANNEL_LABELS: Record<ChannelId, string> = {
  atacado: "Atacado", varejo: "Varejo", ecommerce: "E-commerce",
};

const MACRO_FIELD_LABELS: Record<string, string> = {
  receitaBruta:  "Receita Bruta (R$)",
  margemBruta:   "Margem Bruta (%)",
  pmv:           "PMV (R$)",
  ticketMedio:   "Ticket Médio (R$)",
  producaoPecas: "Produção / Peças",
  orcamento:     "Orçamento Previsto (R$)",
  mkdPct:        "Markdown (%)",
  giro:          "Giro de Estoque",
  cobertura:     "Cobertura (dias)",
  gmroi:         "GMROI",
  custoMedio:    "Custo Médio (R$)",
};

const RATE_MACRO_FIELDS = new Set(["margemBruta", "mkdPct", "giro", "cobertura", "gmroi"]);

// ── Bandas bilaterais de aprovação ────────────────────────────────────────────
// higherIsBetter: true = ↑ melhor | false = ↓ melhor | null = bilateral (cobertura)
// badNeg: magnitude do gap NEGATIVO que dispara (para ↑: abaixo da meta; para ↓: abaixo tb = suspeito)
// badPos: magnitude do gap POSITIVO que dispara (para ↑: acima da banda; para ↓: acima da meta = ruim)
// mode 'pct' = % relativo ao planejado | 'abs' = unidades absolutas
const APPROVAL_BANDS: Record<string, {
  higherIsBetter: boolean | null;
  badNeg: number;
  badPos: number;
  mode: 'pct' | 'abs';
}> = {
  receitaBruta:  { higherIsBetter: true,  badNeg: 2,   badPos: 2,   mode: 'pct' },
  margemBruta:   { higherIsBetter: true,  badNeg: 0.5, badPos: 2,   mode: 'abs' },
  giro:          { higherIsBetter: true,  badNeg: 0.5, badPos: 0.5, mode: 'abs' },
  pmv:           { higherIsBetter: true,  badNeg: 5,   badPos: 7,   mode: 'pct' },
  ticketMedio:   { higherIsBetter: true,  badNeg: 5,   badPos: 7,   mode: 'pct' },
  gmroi:         { higherIsBetter: true,  badNeg: 0.3, badPos: 0.5, mode: 'abs' },
  custoMedio:    { higherIsBetter: false, badNeg: 5,   badPos: 2,   mode: 'pct' },
  mkdPct:        { higherIsBetter: false, badNeg: 2,   badPos: 0.5, mode: 'abs' },
  cobertura:     { higherIsBetter: null,  badNeg: 8,   badPos: 8,   mode: 'abs' },
  producaoPecas: { higherIsBetter: true,  badNeg: 2,   badPos: 2,   mode: 'pct' },
  orcamento:     { higherIsBetter: false, badNeg: 5,   badPos: 2,   mode: 'pct' },
};

function isOutsideBand(key: string, planned: number, projected: number): boolean {
  const band = APPROVAL_BANDS[key];
  if (!band || !planned) return false;
  const gap         = projected - planned;
  const absPlanned  = Math.abs(planned);
  const negMag      = band.mode === 'pct' ? (-gap / absPlanned) * 100 : -gap;
  const posMag      = band.mode === 'pct' ? (gap  / absPlanned) * 100 :  gap;
  if (band.higherIsBetter === null) return Math.abs(gap) > band.badNeg; // bilateral
  if (band.higherIsBetter)         return negMag > band.badNeg || posMag > band.badPos;
  /* lower is better */             return posMag > band.badPos || negMag > band.badNeg;
}

const DRIVER_FIELDS = new Set<keyof ChannelData>([
  "margemBruta", "pmv", "ticketMedio", "custoMedio", "giro", "cobertura", "mkdPct", "gmroi",
]);

// AJUSTE 4: macro key → corresponding channel ChannelData key (for ordering + impact)
const MACRO_TO_CHANNEL: Partial<Record<string, keyof ChannelData>> = {
  receitaBruta:  "receita",
  margemBruta:   "margemBruta",
  pmv:           "pmv",
  ticketMedio:   "ticketMedio",
  producaoPecas: "producao",
  orcamento:     "orcamento",
  mkdPct:        "mkdPct",
  giro:          "giro",
  cobertura:     "cobertura",
  gmroi:         "gmroi",
  custoMedio:    "custoMedio",
};

// AJUSTE 2: for driver fields, is a HIGHER value better for the macro goal?
const HIGHER_IS_BETTER: Partial<Record<keyof ChannelData, boolean>> = {
  margemBruta: true, giro: true, gmroi: true, ticketMedio: true, pmv: true,
  cobertura:   false, // lower is safer (less stock risk)
  mkdPct:      false, // lower is better (less discount)
  custoMedio:  false, // lower is better
};

// Tooltips para campos calculados (não-driver)
const COMPUTED_TOOLTIP: Partial<Record<keyof ChannelData, string>> = {
  margemBrutaRS:     "Calculado: Receita × Margem Bruta %. Para alterar, edite a Margem Bruta (%).",
  orcamento:         "Calculado: Peças × Custo Médio. Para alterar, edite o Custo Médio.",
  estoqueMedioRS:    "Calculado: Receita ÷ Giro. Para alterar, edite o Giro.",
  estoqueMedioPecas: "Calculado: Estoque Médio (R$) ÷ PMV.",
  producao:          "Calculado: Receita ÷ PMV. Para alterar o volume, ajuste o PMV ou a participação.",
  totalPecas:        "Total de peças = Produção do canal (Receita ÷ PMV).",
  markdown:          "Calculado: Receita × MKD%. Para alterar o valor em R$, edite o MKD%.",
  receita:           "Controlado pela participação (%) × Receita Total do plano macro.",
};

// Tooltips para campos driver (editáveis)
const DRIVER_TOOLTIP: Partial<Record<keyof ChannelData, string>> = {
  margemBruta:  "Percentual que sobra da receita após o custo dos produtos. Impacta diretamente a rentabilidade do canal.",
  pmv:          "Preço Médio de Venda — valor médio por peça vendida neste canal. Determina o volume de peças necessário para atingir a receita.",
  ticketMedio:  "Valor médio gasto por cliente em cada compra. Tickets maiores indicam maior mix ou volume por transação.",
  custoMedio:   "Custo unitário médio das peças vendidas neste canal. Base de cálculo do Orçamento e da margem bruta.",
  giro:         "Quantas vezes o estoque se renova no período. Giro alto = menos capital parado, mais liquidez.",
  cobertura:    "Quantos dias o estoque disponível cobre as vendas. Cobertura alta aumenta o risco de sobrestoque.",
  mkdPct:       "Percentual de desconto aplicado sobre a receita bruta. Markdown alto corrói a margem do canal.",
  gmroi:        "Lucro bruto gerado por cada R$ investido em estoque. GMROI > 1 indica retorno positivo. Benchmark saudável: acima de 2,0.",
};

// ─── Pure functions ────────────────────────────────────────────────────────────

function applyRevenue(data: ChannelData, newReceita: number): ChannelData {
  const orcRate        = data.receita > 0 ? data.orcamento / data.receita : (data.custoMedio > 0 && data.pmv > 0 ? data.custoMedio / data.pmv : 0.365);
  const estoqueMedioRS = data.giro > 0 ? newReceita / data.giro : 0;
  const producao       = data.pmv > 0 ? newReceita / data.pmv : 0;
  return {
    ...data,
    receita:           newReceita,
    margemBrutaRS:     newReceita * data.margemBruta / 100,
    orcamento:         newReceita * orcRate,
    estoqueMedioRS,
    estoqueMedioPecas: data.pmv > 0 ? estoqueMedioRS / data.pmv : 0,
    producao,
    totalPecas:        producao,
    markdown:          newReceita * data.mkdPct / 100,
  };
}

function buildChannel(
  receita: number,
  rates: Pick<ChannelData, "margemBruta" | "pmv" | "ticketMedio" | "custoMedio" | "giro" | "cobertura" | "mkdPct" | "gmroi">
): ChannelData {
  const estoqueMedioRS = rates.giro > 0 ? receita / rates.giro : 0;
  const producao       = rates.pmv > 0 ? receita / rates.pmv : 0;
  const orcRate2       = rates.custoMedio > 0 && rates.pmv > 0 ? rates.custoMedio / rates.pmv : 0.365;
  return {
    receita,
    margemBrutaRS:     receita * rates.margemBruta / 100,
    ...rates,
    orcamento:         receita * orcRate2,
    estoqueMedioRS,
    estoqueMedioPecas: rates.pmv > 0 ? estoqueMedioRS / rates.pmv : 0,
    producao,
    totalPecas:        producao,
    markdown:          receita * rates.mkdPct / 100,
  };
}

// Taxas fallback usadas apenas quando o M1 não tem o indicador planejado.
// Quando o M1 tem o valor, ele é passado via macroRates e todos os canais
// iniciam com a mesma taxa → consolidado = exatamente o valor do M1.
const CHANNEL_FALLBACK_RATES: Record<ChannelId, Pick<ChannelData,
  "margemBruta" | "pmv" | "ticketMedio" | "custoMedio" | "giro" | "cobertura" | "mkdPct" | "gmroi"
>> = {
  atacado:   { margemBruta: 38.5, pmv: 165, ticketMedio: 320, custoMedio: 60, giro: 4.5, cobertura: 80, mkdPct: 4.0, gmroi: 1.85 },
  varejo:    { margemBruta: 48.0, pmv: 185, ticketMedio: 290, custoMedio: 72, giro: 4.6, cobertura: 75, mkdPct: 4.0, gmroi: 2.35 },
  ecommerce: { margemBruta: 52.0, pmv: 195, ticketMedio: 340, custoMedio: 75, giro: 4.8, cobertura: 70, mkdPct: 4.0, gmroi: 2.65 },
};

function initChannelData(
  macroReceita: number,
  macroRates?: Partial<Pick<ChannelData, "margemBruta" | "pmv" | "ticketMedio" | "custoMedio" | "giro" | "cobertura" | "mkdPct" | "gmroi">>
): Record<ChannelId, ChannelData> {
  // Se o M1 fornece a taxa, todos os canais iniciam com ela → agregação produz EXATAMENTE o valor do M1.
  // O usuário então ajusta por canal; desvios disparam o fluxo de aprovação.
  const ratesFor = (ch: ChannelId) => ({
    margemBruta: macroRates?.margemBruta ?? CHANNEL_FALLBACK_RATES[ch].margemBruta,
    pmv:         macroRates?.pmv         ?? CHANNEL_FALLBACK_RATES[ch].pmv,
    ticketMedio: macroRates?.ticketMedio ?? CHANNEL_FALLBACK_RATES[ch].ticketMedio,
    custoMedio:  macroRates?.custoMedio  ?? CHANNEL_FALLBACK_RATES[ch].custoMedio,
    giro:        macroRates?.giro        ?? CHANNEL_FALLBACK_RATES[ch].giro,
    cobertura:   macroRates?.cobertura   ?? CHANNEL_FALLBACK_RATES[ch].cobertura,
    mkdPct:      macroRates?.mkdPct      ?? CHANNEL_FALLBACK_RATES[ch].mkdPct,
    gmroi:       macroRates?.gmroi       ?? CHANNEL_FALLBACK_RATES[ch].gmroi,
  });
  return {
    atacado:   buildChannel(macroReceita * 0.40, ratesFor("atacado")),
    varejo:    buildChannel(macroReceita * 0.35, ratesFor("varejo")),
    ecommerce: buildChannel(macroReceita * 0.25, ratesFor("ecommerce")),
  };
}

const INIT_PERCENTS: Record<ChannelId, number> = { atacado: 40, varejo: 35, ecommerce: 25 };

// Tipo para as taxas do M1 passadas a M2
type MacroRates = Partial<Pick<ChannelData,
  "margemBruta" | "pmv" | "ticketMedio" | "custoMedio" | "giro" | "cobertura" | "mkdPct" | "gmroi"
>>;

const RATE_KEYS_FOR_DELTA: Array<keyof MacroRates> = [
  "giro", "margemBruta", "mkdPct", "pmv", "cobertura", "gmroi", "custoMedio", "ticketMedio",
];

/**
 * Calcula taxas consolidadas a partir de dados de canais salvos — sempre dos absolutos
 * acumulados, nunca média ponderada de taxas.
 * Usado para computar o delta entre o cenário salvo e o novo alvo do M1.
 */
function computeConsolidatedFromRaw(
  chData: Record<string, Record<string, number>>,
  channels: ChannelId[]
): MacroRates {
  const totalR        = channels.reduce((s, ch) => s + (chData[ch]?.receita       ?? 0), 0);
  const totalEstMedio = channels.reduce((s, ch) => s + (chData[ch]?.estoqueMedioRS  ?? 0), 0);
  const totalLucro    = channels.reduce((s, ch) => s + (chData[ch]?.margemBrutaRS  ?? 0), 0);
  const totalOrc      = channels.reduce((s, ch) => s + (chData[ch]?.orcamento      ?? 0), 0);
  const totalMkd      = channels.reduce((s, ch) => s + (chData[ch]?.markdown       ?? 0), 0);
  const totalProd     = channels.reduce((s, ch) => s + (chData[ch]?.producao       ?? 0), 0);
  const wAvg = (key: string) => totalR > 0
    ? channels.reduce((s, ch) => s + (chData[ch]?.receita ?? 0) * (chData[ch]?.[key] ?? 0), 0) / totalR
    : undefined;
  return {
    giro:        totalEstMedio > 0 ? totalR / totalEstMedio          : undefined,
    cobertura:   totalR > 0       ? (totalEstMedio / totalR) * 365   : undefined,
    gmroi:       totalEstMedio > 0 ? totalLucro / totalEstMedio      : undefined,
    margemBruta: totalR > 0       ? (totalLucro / totalR) * 100      : undefined,
    mkdPct:      totalR > 0       ? (totalMkd / totalR) * 100        : undefined,
    pmv:         totalProd > 0    ? totalR / totalProd               : undefined,
    custoMedio:  totalProd > 0    ? totalOrc / totalProd             : undefined,
    ticketMedio: wAvg("ticketMedio"),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChannelPlanning() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [, setCyclesReady] = useState(0); // força re-render após initPlanCycles resolver
  const tour = useTour("channel-planning");

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      const tid = sessionStorage.getItem("activeTenantId") ?? u.tenant_id ?? "";
      setTenantId(tid);
      const hasAccess = u.profile === "CEO" || u.system_role === "support" || u.system_role === "client_admin";
      if (!hasAccess) navigate("/dashboard");

      // Carregar cenários, anos revisados e pedidos de aprovação do Supabase
      if (tid) {
        // Cache de ciclos só é populado no login/PlanningSetup — sem isto, um
        // reload nesta tela faz hasM1Version ficar sempre falso mesmo com o
        // M1 salvo de verdade no banco.
        initPlanCycles(tid).then(() => setCyclesReady(v => v + 1)).catch(() => {});
        // Carrega perfis históricos para inicializar proporções reais de canal
        getHistoricalProfiles(tid)
          .then(hp => setHistChannelProfiles(hp.channels))
          .catch(() => {});

        dbListChannelScenarios(tid, defaultYear)
          .then(rows => setSavedScenarios(rows))
          .catch(() => {/* fallback to localStorage state */});
        dbGetReviewedYears(tid)
          .then(years => setReviewedYears(years))
          .catch(() => {/* fallback */});

        // Verificar se já tem pedido pendente de M2→M1 (para este usuário)
        hasPendingRequest(tid, 2, defaultYear)
          .then(has => setAlreadyPending(has))
          .catch(() => {});

        // Verificar pedidos de aprovação direcionados a M2 (de M3 ou M4)
        const isCeoOrAdmin = u.profile === "CEO" || u.system_role === "support" || u.system_role === "client_admin";
        getPendingApprovalsForUser(tid, 2, u.email, isCeoOrAdmin)
          .then(reqs => {
            setIncomingApprovals(reqs);
            if (reqs.length > 0) {
              setActiveIncoming(reqs[0]);
              setShowIncomingApproval(true);
            }
          })
          .catch(() => {});
      }
    } else navigate("/");
  }, [navigate]);

  const profile      = getStoredProfile();
  const plannedYears = getPlannedYears();
  const defaultYear  = plannedYears.length > 0 ? Math.max(...plannedYears) : new Date().getFullYear() + 1;
  const [selectedYear, setSelectedYear]         = useState<number>(defaultYear);
  const [reviewedYears, setReviewedYears]       = useState<number[]>([]);
  const [histChannelProfiles, setHistChannelProfiles] = useState<import("../../services/supabase/historicalProfileService").HistoricalChannelProfile[]>([]);

  const planCycle    = getPlanCycle(selectedYear);
  // Trava real (não só a do card do Dashboard): sem M1 salvo para este ano,
  // o M2 não pode aplicar nada — evita canal aplicado "no vácuo", destravando
  // M3/M4 sem o macro que deveriam refinar.
  const hasM1Version = Boolean(planCycle?.versions?.length);
  const macroValues: Record<string, unknown> | null = planCycle?.versions?.[0]?.values ?? null;
  const macroReceita: number = (macroValues?.receitaBruta as number | null) ?? 3_120_000;

  const activeMacroKeys = useMemo(() => {
    if (!planCycle?.fieldPriorities) return [];
    return planCycle.fieldPriorities
      .filter(fp => fp.status !== "inactive" && fp.status !== "dismissed")
      .map(fp => fp.key);
  }, [planCycle]);

  const visibleChannels = useMemo((): ChannelId[] => {
    const all: ChannelId[] = ["atacado", "varejo", "ecommerce"];
    if (!profile?.salesChannels?.length) return all;
    return all.filter(ch => CHANNEL_SALES_IDS[ch].some(id => profile!.salesChannels.includes(id)));
  }, [profile]);

  // Inicializa percentuais distribuídos igualmente entre os canais visíveis
  const initPercents = useMemo((): Record<ChannelId, number> => {
    const all: ChannelId[] = ["atacado", "varejo", "ecommerce"];
    if (visibleChannels.length === 3) return INIT_PERCENTS;
    const each = Math.floor(100 / visibleChannels.length);
    const rem  = 100 - each * visibleChannels.length;
    const result = { atacado: 0, varejo: 0, ecommerce: 0 };
    visibleChannels.forEach((ch, i) => { result[ch] = each + (i === 0 ? rem : 0); });
    all.filter(ch => !visibleChannels.includes(ch)).forEach(ch => { result[ch] = 0; });
    return result;
  }, [visibleChannels]);

  // Extrai taxas do M1 para inicializar M2 com valores que produzem o consolidado = M1 exato.
  const macroRatesForChannels = useMemo(() => ({
    margemBruta: (macroValues?.margemBruta as number | null)  ?? undefined,
    pmv:         (macroValues?.pmv         as number | null)  ?? undefined,
    ticketMedio: (macroValues?.ticketMedio as number | null)  ?? undefined,
    custoMedio:  (macroValues?.custoMedio  as number | null)  ?? undefined,
    giro:        (macroValues?.giro        as number | null)  ?? undefined,
    cobertura:   (macroValues?.cobertura   as number | null)  ?? undefined,
    mkdPct:      (macroValues?.mkdPct      as number | null)  ?? undefined,
    gmroi:       (macroValues?.gmroi       as number | null)  ?? undefined,
  }), [macroValues]);

  const [percents, setPercents]       = useState<Record<ChannelId, number>>(initPercents);
  const [channelData, setChannelData] = useState<Record<ChannelId, ChannelData>>(
    () => initChannelData(macroReceita, macroRatesForChannels)
  );

  // Rastreia PMV/Custo tocados manualmente por canal, nesta sessão de edição.
  // Regra: markdown só absorve automaticamente a diferença de margem quando o
  // usuário NÃO mexeu em preço/custo — se já mexeu, ele assumiu outro caminho
  // pra chegar na margem (aumentar preço, baixar custo), e o sistema não deve
  // sobrepor isso empurrando o markdown sozinho.
  const [touchedPriceOrCost, setTouchedPriceOrCost] = useState<Partial<Record<ChannelId, true>>>({});

  useEffect(() => {
    const plan      = getPlanCycle(selectedYear);
    const vals      = plan?.versions?.[0]?.values ?? null;
    const newMacroR = (vals?.receitaBruta as number | null) ?? 3_120_000;
    const newRates: MacroRates = {
      margemBruta: (vals?.margemBruta as number | null) ?? undefined,
      pmv:         (vals?.pmv         as number | null) ?? undefined,
      ticketMedio: (vals?.ticketMedio as number | null) ?? undefined,
      custoMedio:  (vals?.custoMedio  as number | null) ?? undefined,
      giro:        (vals?.giro        as number | null) ?? undefined,
      cobertura:   (vals?.cobertura   as number | null) ?? undefined,
      mkdPct:      (vals?.mkdPct      as number | null) ?? undefined,
      gmroi:       (vals?.gmroi       as number | null) ?? undefined,
    };

    // Helper: aplica delta do M1 sobre os canais salvos e retorna channelData ajustado.
    // Se o M1 mudou após o último save, cada canal tem sua taxa multiplicada pelo mesmo
    // fator → o consolidado emergirá EXATAMENTE igual ao novo alvo do M1.
    const applyDeltaToSaved = (
      chData: Record<string, Record<string, number>>,
      channels: ChannelId[],
      targetRates: MacroRates
    ): Record<ChannelId, ChannelData> => {
      const savedCons = computeConsolidatedFromRaw(chData, channels);

      // delta[key] = target_M1 / consolidado_salvo — 1 quando não há mudança
      const deltas: Partial<Record<string, number>> = {};
      for (const key of RATE_KEYS_FOR_DELTA) {
        const base   = savedCons[key];
        const target = targetRates[key];
        if (base != null && target != null && base > 0 && Math.abs(target / base - 1) > 0.001) {
          deltas[key] = target / base;
        }
      }

      return Object.fromEntries(
        channels.map(ch => {
          const base = { ...(chData[ch] ?? {}) } as Record<string, unknown>;
          for (const [key, factor] of Object.entries(deltas)) {
            const v = base[key];
            if (typeof v === "number" && v > 0) base[key] = v * (factor as number);
          }
          const asChannelData = base as unknown as ChannelData;
          return [ch, applyRevenue(asChannelData, (base.receita as number) ?? 0)];
        })
      ) as Record<ChannelId, ChannelData>;
    };

    setPercents(initPercents);
    setTouchedPriceOrCost({});

    if (!tenantId) {
      setChannelData(initChannelData(newMacroR, newRates));
      return;
    }

    dbListChannelScenarios(tenantId, selectedYear)
      .then(rows => {
        setSavedScenarios(rows);
        const last = rows.length > 0 ? rows[rows.length - 1] : null;

        if (!last) {
          // Sem cenário salvo → inicializa com proporções históricas reais (fallback: iguais)
          const channels = visibleChannels.length > 0 ? visibleChannels : (["atacado", "varejo", "ecommerce"] as ChannelId[]);
          const histPcts = normalizeChannelPcts(histChannelProfiles, channels);
          const initPcts = { atacado: 0, varejo: 0, ecommerce: 0, ...histPcts };
          setPercents(prev => ({ ...prev, ...initPcts }));
          const data: Record<ChannelId, ChannelData> = {} as any;
          for (const ch of channels) {
            const pct = initPcts[ch] ?? 0;
            data[ch]  = buildChannel(Math.round(newMacroR * pct / 100), {
              ...(newRates as any),
              ...(CHANNEL_FALLBACK_RATES[ch]),
              // sobrescreve drivers do M1 onde disponíveis
              margemBruta: newRates.margemBruta ?? CHANNEL_FALLBACK_RATES[ch].margemBruta,
              pmv:         newRates.pmv         ?? CHANNEL_FALLBACK_RATES[ch].pmv,
              custoMedio:  newRates.custoMedio  ?? CHANNEL_FALLBACK_RATES[ch].custoMedio,
            });
          }
          setChannelData(data);
          return;
        }

        const chData    = last.channel_data as unknown as Record<string, Record<string, number>>;
        const savedPcts = last.percents as unknown as Record<ChannelId, number>;
        const channels  = visibleChannels.length > 0 ? visibleChannels : (["atacado", "varejo", "ecommerce"] as ChannelId[]);

        // Propaga delta proporcional do M1 sobre o cenário salvo.
        // Caso não haja delta (M1 não mudou), restaura o cenário exatamente.
        setChannelData(applyDeltaToSaved(chData, channels, newRates));
        setPercents({ ...initPercents, ...savedPcts });
      })
      .catch(() => {
        setSavedScenarios([]);
        setChannelData(initChannelData(newMacroR, newRates));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, tenantId]);

  // Scenarios
  const [savedScenarios, setSavedScenarios]         = useState<ChannelScenario[]>([]);
  const [showSaveDialog, setShowSaveDialog]         = useState(false);
  const [saveNameInput, setSaveNameInput]           = useState("");
  const [toast, setToast]                           = useState<string | null>(null);

  // Estado de célula em edição — exibe valor cru enquanto foca, formatado ao sair
  const [focusedCell, setFocusedCell] = useState<{ ch: ChannelId; key: keyof ChannelData } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [showCompareModal, setShowCompareModal]     = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [compareResults, setCompareResults]         = useState<{ name: string; receita: number; margem: number; pmv: number; giro: number }[] | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Handlers
  const handlePercentChange = (ch: ChannelId, newPct: number) => {
    setPercents(prev => ({ ...prev, [ch]: newPct }));
    setChannelData(prev => ({ ...prev, [ch]: applyRevenue(prev[ch], Math.round(macroReceita * newPct / 100)) }));
  };

  const handleDriverFocus = (ch: ChannelId, field: keyof ChannelData) => {
    setFocusedCell({ ch, key: field });
    // Mostra o número cru (sem formatação) para edição limpa
    const rawVal = channelData[ch][field] as number;
    setEditingValue(isNaN(rawVal) ? "" : String(rawVal));
  };

  const handleDriverChange = (ch: ChannelId, field: keyof ChannelData, raw: string) => {
    // Permite digitar livremente, incluindo ponto/vírgula intermediários
    setEditingValue(raw);
    const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
    const value = parseFloat(normalized);
    if (isNaN(value)) return;
    if (field === "pmv" || field === "custoMedio") {
      setTouchedPriceOrCost(prev => ({ ...prev, [ch]: true }));
    }
    setChannelData(prev => {
      const updated: ChannelData = { ...prev[ch], [field]: value };
      return { ...prev, [ch]: DRIVER_FIELDS.has(field) ? applyRevenue(updated, updated.receita) : updated };
    });
  };

  const handleDriverBlur = () => {
    setFocusedCell(null);
    setEditingValue("");
  };

  const handleConfirmSave = () => {
    if (!tenantId) return;
    const name = saveNameInput.trim() || `Cenário ${new Date().toLocaleDateString("pt-BR")}`;
    dbSaveChannelScenario(tenantId, selectedYear, name,
      { percents, channelData: channelData as unknown as Record<string, Record<string, number>> },
      user?.email
    ).then(sc => {
      setSavedScenarios(prev => [...prev, sc]);
      showToast(`Cenário "${sc.name}" salvo.`);
    }).catch(err => showToast("Erro ao salvar: " + err.message));
    setShowSaveDialog(false);
    setSaveNameInput("");
  };

  const handleExport = () => {
    if (!savedScenarios.length) { showToast("Salve ao menos um cenário antes de exportar."); return; }
    // Cast Supabase ChannelScenario to legacy export format
    const legacyScenarios = savedScenarios.map(sc => ({
      id: sc.id,
      name: sc.name,
      year: sc.year,
      savedAt: sc.saved_at,
      data: { percents: sc.percents, channelData: sc.channel_data as Record<string, Record<string, number>> },
    }));
    exportChannelScenarios(selectedYear, legacyScenarios as any);
    showToast("Exportação iniciada.");
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // ── Approval flow state ───────────────────────────────────────────────────
  const [showPostApplyModal, setShowPostApplyModal]           = useState(false);
  const [showSubmitApprovalDialog, setShowSubmitApprovalDialog] = useState(false);
  const [approvalJustification, setApprovalJustification]    = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval]      = useState(false);
  const [alreadyPending, setAlreadyPending]                  = useState(false);
  // Pedidos direcionados a M2 (de M3 ou M4)
  const [incomingApprovals, setIncomingApprovals]            = useState<PlanApprovalRequest[]>([]);
  const [showIncomingApproval, setShowIncomingApproval]      = useState(false);
  const [activeIncoming, setActiveIncoming]                  = useState<PlanApprovalRequest | null>(null);
  const [isResolvingApproval, setIsResolvingApproval]        = useState(false);

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    await exportToPDF({
      elementId: "channel-scenarios-pdf",
      fileName:  `cenarios_canais_${selectedYear}`,
      title:     `Comparação de Cenários — Planejamento por Canal ${selectedYear}`,
    });
    setIsExportingPDF(false);
  };

  const handleApplyMetas = async () => {
    if (!tenantId) return;
    if (!hasM1Version) {
      showToast(`O Planejamento Estratégico (M1) de ${selectedYear} ainda não foi salvo. Complete o M1 antes de aplicar as metas por canal.`);
      return;
    }
    const last = savedScenarios[savedScenarios.length - 1];
    if (last) {
      // A aplicação do cenário precisa mesmo funcionar — se falhar, avisa e
      // PARA aqui (antes só o recompute era tolerante a falha; um catch único
      // também engolia erro real de applyChannelScenario e mostrava "sucesso"
      // mesmo sem nada ter sido aplicado).
      try {
        await applyChannelScenario(tenantId, selectedYear, last.id);
      } catch (err) {
        showToast(`Não foi possível aplicar as metas: ${err instanceof Error ? err.message : "erro desconhecido"}`);
        return;
      }
      try {
        // Plano Oficial: recalcula o macro a partir do canal aplicado (primazia
        // dos absolutos, na função Postgres) e avança o nível de detalhe para 2.
        await recomputeOfficialMacro(tenantId, selectedYear);
        await advanceDetailLevel(tenantId, selectedYear, 2);
      } catch {
        // Falha no recompute não bloqueia a aplicação do cenário de canal.
      }
    }
    setReviewedYears(prev => prev.includes(selectedYear) ? prev : [...prev, selectedYear]);
    showToast(`Metas do ciclo ${selectedYear} aplicadas.`);
    setShowPostApplyModal(true);
  };

  const handleSubmitApproval = async () => {
    if (!tenantId || !user) return;
    setIsSubmittingApproval(true);
    try {
      // Quem aplicou M1? Lemos created_by do cenário mais recente do planCycle
      const m1ApplierEmail: string | undefined = undefined; // planCycle não expõe o email do aplicador por hora
      await createApprovalRequest({
        tenantId,
        year:                selectedYear,
        fromModule:          2,
        toModule:            1,
        requesterEmail:      user.email,
        approverEmail:       m1ApplierEmail,
        justification:       approvalJustification,
        proposedData:        consolidated as unknown as Record<string, unknown>,
        originalData:        (macroValues ?? {}) as Record<string, unknown>,
        impactedIndicators:  impactedMacro as ImpactedIndicator[],
        scenarioId:          savedScenarios[savedScenarios.length - 1]?.id,
      });
      setAlreadyPending(true);
      showToast("Solicitação de revisão enviada ao responsável pelo plano macro.");
      setShowSubmitApprovalDialog(false);
      setApprovalJustification("");
    } catch {
      showToast("Erro ao enviar solicitação. Tente novamente.");
    }
    setIsSubmittingApproval(false);
  };

  const handleResolveIncoming = async (req: PlanApprovalRequest, decision: 'approved' | 'denied') => {
    if (!user) return;
    setIsResolvingApproval(true);
    try {
      await resolveApproval(req.id, decision, user.email);
      setIncomingApprovals(prev => prev.filter(r => r.id !== req.id));
      const next = incomingApprovals.find(r => r.id !== req.id) ?? null;
      setActiveIncoming(next);
      if (!next) setShowIncomingApproval(false);
      showToast(decision === 'approved' ? "Revisão aprovada." : "Revisão negada.");
    } catch {
      showToast("Erro ao resolver solicitação.");
    }
    setIsResolvingApproval(false);
  };

  const handleCompare = () => {
    const sel = savedScenarios.filter(sc => selectedForCompare.includes(sc.id));

    // Para cada cenário, recalcula o consolidado de todos os indicadores
    type ScenarioSummary = {
      name: string;
      savedAt: string;
      channels: Record<string, Record<string, number>>;
      consolidated: Record<string, number>;
    };

    const summary: ScenarioSummary[] = sel.map(sc => {
      const chs    = visibleChannels;
      const chData = (sc.channel_data as unknown as Record<string, Record<string, number>>);
      const sum    = (key: string) => chs.reduce((s, ch) => s + (chData[ch]?.[key] ?? 0), 0);
      // Média ponderada por receita — usada apenas para ticketMedio (sem base absoluta de transações)
      const totalR          = sum('receita');
      const wAvg = (key: string) =>
        totalR > 0 ? chs.reduce((s, ch) => s + (chData[ch]?.receita ?? 0) * (chData[ch]?.[key] ?? 0), 0) / totalR : 0;

      // Absolutos acumulados
      const totalEstMedio   = sum('estoqueMedioRS');
      const totalLucroBruto = sum('margemBrutaRS');
      const totalOrcamento  = sum('orcamento');
      const totalMkd        = sum('markdown');
      const totalProd       = sum('producao');

      return {
        name: sc.name,
        savedAt: sc.saved_at,
        channels: Object.fromEntries(chs.map(ch => [ch, chData[ch] ?? {}])),
        consolidated: {
          receita:       totalR,
          // Margem derivada dos absolutos
          margemBrutaRS: totalLucroBruto,
          margemBruta:   totalR > 0 ? (totalLucroBruto / totalR) * 100 : 0,
          // PMV e CustoMédio derivados dos absolutos
          pmv:           totalProd > 0 ? totalR / totalProd : 0,
          custoMedio:    totalProd > 0 ? totalOrcamento / totalProd : 0,
          // TicketMédio sem base absoluta — média ponderada
          ticketMedio:   wAvg('ticketMedio'),
          // Giro, Cobertura e GMROI derivados dos absolutos
          giro:          totalEstMedio > 0 ? totalR / totalEstMedio : 0,
          cobertura:     totalR > 0 ? (totalEstMedio / totalR) * 365 : 0,
          gmroi:         totalEstMedio > 0 ? totalLucroBruto / totalEstMedio : 0,
          // Somas diretas
          orcamento:     totalOrcamento,
          mkdPct:        totalR > 0 ? (totalMkd / totalR) * 100 : 0,
          markdown:      totalMkd,
          producao:      totalProd,
          totalPecas:    sum('totalPecas'),
        },
      };
    });
    setCompareResults(summary as never);
  };

  // ── Consolidated ──────────────────────────────────────────────────────────────
  const consolidated = useMemo(() => {
    const chs             = visibleChannels.map(ch => channelData[ch]);
    const totalR          = chs.reduce((s, c) => s + c.receita, 0);
    const totalEstMedio   = chs.reduce((s, c) => s + c.estoqueMedioRS, 0);
    const totalLucroBruto = chs.reduce((s, c) => s + c.margemBrutaRS, 0);
    const totalOrcamento  = chs.reduce((s, c) => s + c.orcamento, 0);
    const totalMkd        = chs.reduce((s, c) => s + c.markdown, 0);
    const totalProd       = chs.reduce((s, c) => s + c.producao, 0);
    // Média ponderada por receita — usada apenas para drivers sem base absoluta (ticketMédio)
    const w = (fn: (c: ChannelData) => number) => totalR > 0 ? chs.reduce((s, c) => s + c.receita * fn(c), 0) / totalR : 0;
    return {
      receita:           totalR,
      // Margem derivada dos absolutos acumulados
      margemBrutaRS:     totalLucroBruto,
      margemBruta:       totalR > 0 ? (totalLucroBruto / totalR) * 100 : 0,
      // PMV e CustoMédio derivados dos absolutos (Receita/Peças e Orçamento/Peças)
      pmv:               totalProd > 0 ? totalR / totalProd : 0,
      custoMedio:        totalProd > 0 ? totalOrcamento / totalProd : 0,
      // TicketMédio não tem base absoluta de transações — mantém média ponderada
      ticketMedio:       w(c => c.ticketMedio),
      // Giro, Cobertura e GMROI derivados dos absolutos acumulados
      giro:              totalEstMedio > 0 ? totalR / totalEstMedio : 0,
      cobertura:         totalR > 0 ? (totalEstMedio / totalR) * 365 : 0,
      gmroi:             totalEstMedio > 0 ? totalLucroBruto / totalEstMedio : 0,
      // Somas diretas
      orcamento:         totalOrcamento,
      estoqueMedioRS:    totalEstMedio,
      estoqueMedioPecas: chs.reduce((s, c) => s + c.estoqueMedioPecas, 0),
      mkdPct:            totalR > 0 ? (totalMkd / totalR) * 100 : 0,
      markdown:          totalMkd,
      producao:          totalProd,
      totalPecas:        totalProd,
    };
  }, [channelData, visibleChannels]);

  // ── Macro impact (AJUSTE 1/2/6) ───────────────────────────────────────────────
  const visibleTotalPct = visibleChannels.reduce((s, ch) => s + percents[ch], 0);

  const impactedMacro = useMemo(() => {
    if (!macroValues || visibleTotalPct !== 100 || !activeMacroKeys.length) return [];
    const projected: Record<string, number> = {
      receitaBruta: consolidated.receita, margemBruta: consolidated.margemBruta,
      pmv: consolidated.pmv, ticketMedio: consolidated.ticketMedio,
      producaoPecas: consolidated.producao, orcamento: consolidated.orcamento,
      mkdPct: consolidated.mkdPct, giro: consolidated.giro,
      cobertura: consolidated.cobertura, gmroi: consolidated.gmroi,
      custoMedio: consolidated.custoMedio,
    };
    return activeMacroKeys.filter(key => {
      const planned = macroValues[key] as number | null;
      const proj    = projected[key];
      if (planned == null || proj == null) return false;
      return isOutsideBand(key, planned as number, proj);
    }).map(key => ({
      key, label: MACRO_FIELD_LABELS[key] ?? key,
      planned: macroValues[key] as number,
      projected: projected[key],
      gap: projected[key] - (macroValues[key] as number),
      isRate: RATE_MACRO_FIELDS.has(key),
    }));
  }, [activeMacroKeys, macroValues, consolidated, visibleTotalPct]);

  // ── Compensação: quando a Margem (indicador-alvo do M1) diverge por causa da
  // participação, sugere o MKD% que fecha a conta de volta na meta — mesma
  // hierarquia de cluster do M1 (Custo protegido, MKD absorve).
  const marginCompensation = useMemo(() => {
    const item = impactedMacro.find(i => i.key === "margemBruta");
    if (!item) return null;
    // Se o usuário já mexeu em preço/custo de algum canal envolvido, ele já
    // escolheu outro caminho pra chegar na margem — o sistema não sugere
    // mexer no markdown por cima disso.
    if (visibleChannels.some(ch => touchedPriceOrCost[ch])) return null;
    const entities = visibleChannels.map(ch => ({
      id: ch,
      receita: channelData[ch].receita,
      cpv: channelData[ch].orcamento, // orcamento = producao × custoMedio = CPV do canal
    }));
    return computeMarginCompensationViaMkd(entities, item.planned);
  }, [impactedMacro, visibleChannels, channelData, touchedPriceOrCost]);

  const handleApplyMarginCompensation = () => {
    if (!marginCompensation) return;
    setChannelData(prev => {
      const next = { ...prev };
      for (const ch of visibleChannels) {
        const result = marginCompensation.perEntity[ch];
        if (!result) continue;
        next[ch] = {
          ...next[ch],
          mkdPct: result.mkdPct,
          markdown: result.markdown,
          margemBrutaRS: result.margemBrutaRS,
          margemBruta: result.margemBruta,
        };
      }
      return next;
    });
  };

  // AJUSTE 2: per-channel impact — is this channel's value for this field pulling the avg the wrong way?
  const isChannelDragging = (ch: ChannelId, fieldKey: keyof ChannelData): boolean => {
    const macroKey = Object.entries(MACRO_TO_CHANNEL).find(([, ck]) => ck === fieldKey)?.[0];
    if (!macroKey) return false;
    const item = impactedMacro.find(i => i.key === macroKey);
    if (!item) return false;
    const chVal = channelData[ch][fieldKey] as number;
    const higherBetter = HIGHER_IS_BETTER[fieldKey];
    if (higherBetter === undefined) return false;
    return higherBetter ? chVal < item.planned : chVal > item.planned;
  };

  // ── KPI field definitions — must be before early return (hooks rule) ──────────
  const kpiFieldsBase: Array<{
    label: string; key: keyof ChannelData; format: string;
    isDriver: boolean; macroKey?: string;
  }> = [
    { label: "Receita Bruta (R$)",   key: "receita",       format: "currency",   isDriver: false, macroKey: "receitaBruta"  },
    { label: "Margem Bruta (R$)",    key: "margemBrutaRS", format: "currency",   isDriver: false, macroKey: "margemBruta"   },
    { label: "Margem Bruta (%)",     key: "margemBruta",   format: "percent",    isDriver: true,  macroKey: "margemBruta"   },
    { label: "PMV (R$)",             key: "pmv",           format: "currency",   isDriver: true,  macroKey: "pmv"           },
    { label: "Ticket Médio (R$)",    key: "ticketMedio",   format: "currency",   isDriver: true,  macroKey: "ticketMedio"   },
    { label: "Giro",                 key: "giro",          format: "multiplier", isDriver: true,  macroKey: "giro"          },
    { label: "Cobertura (dias)",     key: "cobertura",     format: "days",       isDriver: true,  macroKey: "cobertura"     },
    { label: "Orçamento (R$)",       key: "orcamento",     format: "currency",   isDriver: false, macroKey: "orcamento"     },
    { label: "Produção (peças)",     key: "producao",      format: "number",     isDriver: false, macroKey: "producaoPecas" },
    { label: "MKD (%)",              key: "mkdPct",        format: "percent",    isDriver: true,  macroKey: "mkdPct"        },
    { label: "MKD (R$)",             key: "markdown",      format: "currency",   isDriver: false                           },
    { label: "Total Peças",          key: "totalPecas",    format: "number",     isDriver: false                           },
    { label: "GMROI",                key: "gmroi",         format: "multiplier", isDriver: true,  macroKey: "gmroi"         },
    { label: "Custo Médio (R$)",     key: "custoMedio",    format: "currency",   isDriver: true,  macroKey: "custoMedio"    },
  ];

  // AJUSTE 4: Sort — macro focus indicators first (in activeMacroKeys order), then secondary
  const macroKeyOrder = new Map<string, number>(activeMacroKeys.map((k, i) => [k, i]));

  // useMemo MUST be before `if (!user) return null` — React rules of hooks
  const kpiFields = useMemo(() => {
    // Quando M1 tem prioridades configuradas, oculta campos cujo macroKey foi explicitamente
    // marcado como inativo/dismissed. Campos sem macroKey (markdown, totalPecas, estoqueMedio*,
    // receita) são sempre exibidos — são derivados essenciais independentes de prioridade.
    const hasPriorities = activeMacroKeys.length > 0 && !!planCycle?.fieldPriorities;
    const inactiveKeys = hasPriorities
      ? new Set(
          (planCycle!.fieldPriorities ?? [])
            .filter(fp => fp.status === "inactive" || fp.status === "dismissed")
            .map(fp => fp.key)
        )
      : new Set<string>();

    return [...kpiFieldsBase]
      .filter(f => {
        // Sem macroKey: sempre mostra (cálculos derivados essenciais)
        if (!f.macroKey) return true;
        // Com macroKey: oculta só se explicitamente inativo no M1
        return !inactiveKeys.has(f.macroKey);
      })
      .sort((a, b) => {
        const ra = a.macroKey != null && macroKeyOrder.has(a.macroKey) ? macroKeyOrder.get(a.macroKey)! * 2 : 999;
        const rb = b.macroKey != null && macroKeyOrder.has(b.macroKey) ? macroKeyOrder.get(b.macroKey)! * 2 : 999;
        const ra2 = a.key === "margemBrutaRS" && macroKeyOrder.has("margemBruta") ? macroKeyOrder.get("margemBruta")! * 2 + 1 : ra;
        const rb2 = b.key === "margemBrutaRS" && macroKeyOrder.has("margemBruta") ? macroKeyOrder.get("margemBruta")! * 2 + 1 : rb;
        return ra2 - rb2;
      });
  }, [activeMacroKeys, planCycle]);

  if (!user) return null;

  const totalPercent  = visibleChannels.reduce((s, ch) => s + percents[ch], 0);
  const macroOk       = impactedMacro.length === 0 && visibleTotalPct === 100;
  const hasMacroCheck = activeMacroKeys.length > 0 && macroValues != null;
  const isPending     = plannedYears.includes(selectedYear) && !reviewedYears.includes(selectedYear);

  const fmt = (value: number, format: string) => {
    switch (format) {
      case "currency":   return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
      case "percent":    return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      case "days":       return `${Math.round(value)} dias`;
      case "multiplier": return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      default:           return Math.round(value).toLocaleString("pt-BR");
    }
  };

  const consolidatedKpi = (key: keyof ChannelData): number =>
    ({ receita: consolidated.receita, margemBrutaRS: consolidated.margemBrutaRS,
       margemBruta: consolidated.margemBruta, pmv: consolidated.pmv,
       ticketMedio: consolidated.ticketMedio, custoMedio: consolidated.custoMedio,
       giro: consolidated.giro, cobertura: consolidated.cobertura,
       orcamento: consolidated.orcamento, estoqueMedioRS: consolidated.estoqueMedioRS,
       estoqueMedioPecas: consolidated.estoqueMedioPecas, mkdPct: consolidated.mkdPct,
       markdown: consolidated.markdown, producao: consolidated.producao,
       totalPecas: consolidated.totalPecas, gmroi: consolidated.gmroi,
    } as Record<keyof ChannelData, number>)[key] ?? 0;

  // Is this consolidated field off-target?
  const CHANNEL_TO_MACRO: Partial<Record<keyof ChannelData, string>> = {
    orcamento: "orcamento", producao: "producaoPecas", totalPecas: "producaoPecas", margemBrutaRS: "margemBruta",
  };
  const isConsolidatedImpacted = (key: keyof ChannelData) => {
    const mk = CHANNEL_TO_MACRO[key] ?? (key as string);
    return impactedMacro.some(i => i.key === mk);
  };
  // Returns the macro plan target for a channel field when it is off-target
  const getMacroTarget = (key: keyof ChannelData): number | null => {
    const mk = CHANNEL_TO_MACRO[key] ?? (key as string);
    return impactedMacro.find(i => i.key === mk)?.planned ?? null;
  };

  const gridStyle = { gridTemplateColumns: `155px repeat(${visibleChannels.length + 1}, 1fr)` };

  const getFieldTooltip = (key: keyof ChannelData, isDriver: boolean): string | undefined => {
    if (isDriver) return DRIVER_TOOLTIP[key];
    return COMPUTED_TOOLTIP[key];
  };

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">

      {/* ── TOAST ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-[#28071C] text-white px-5 py-3 rounded-xl shadow-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />{toast}
        </div>
      )}

      {/* ── HEADER (sticky) ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div id="tour-cp-title">
              <p className="text-[#F6F3AA]/70 text-xs uppercase tracking-widest">Módulo 2</p>
              <p className="text-[#F6F3AA] font-semibold text-lg">Planejamento de Metas por Canal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isPending && (
              <span className="flex items-center gap-1.5 text-[11px] bg-amber-400/25 text-[#F6F3AA] border border-amber-400/40 rounded-full px-3 py-1 font-semibold">
                <Clock className="w-3 h-3" />Revisão pendente
              </span>
            )}
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" /><span className="text-sm">{user.name}</span>
            </div>
            <button onClick={tour.reopen} className="text-[#F6F3AA]/60 hover:text-[#F6F3AA] transition-opacity" title="Ver tour de apresentação">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }}
              className="text-[#F6F3AA] hover:opacity-80"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5">

        {/* ── Orientation + year selector ───────────────────────────────────── */}
        <div id="tour-cp-orientation" className="bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-2xl px-5 py-4 mb-4">
          <div className="flex items-start gap-3 mb-3">
            <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#28071C]/70 leading-relaxed">
              <strong className="text-[#28071C]/80">Simule a distribuição de receita pelos canais de venda e compare os cenários.</strong>
              {" "}Ajuste participação e drivers por canal, salve versões alternativas e aplique as metas quando estiver seguro.
            </p>
          </div>
          <div className="flex items-center gap-3 pl-7 flex-wrap">
            <label className="text-xs text-[#28071C]/50 font-semibold uppercase tracking-widest whitespace-nowrap">Ciclo:</label>
            {plannedYears.length > 0 ? (
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-white border-2 border-[#7598CF]/30 text-[#28071C] font-semibold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#7598CF] cursor-pointer">
                {plannedYears.map(y => (
                  <option key={y} value={y}>{y}{!reviewedYears.includes(y) ? " — revisão pendente" : " ✓"}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold text-[#28071C]/60">{selectedYear} — nenhum plano macro encontrado</span>
            )}
            {macroValues && (
              <span className="text-xs text-[#7598CF] bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-full px-3 py-1 font-medium">
                Meta macro: R$ {macroReceita.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>

        {/* ── STICKY: Participation + Banner (AJUSTE 3) ─────────────────────── */}
        <div id="tour-cp-channels" className="sticky top-[72px] z-30 space-y-3 mb-5">

          {/* Participation cards */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-md border-t-4 border-[#7598CF] overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[#28071C]/8 flex items-center justify-between">
              <div>
                <span className="text-[#28071C] font-bold text-xs uppercase tracking-wide">Distribuição por Canal</span>
                <span className="text-[#28071C]/40 text-xs ml-3">Receita Total: R$ {macroReceita.toLocaleString("pt-BR")}</span>
              </div>
              {totalPercent === 100
                ? <span className="flex items-center gap-1 text-emerald-700 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />100% ✓</span>
                : <span className="flex items-center gap-1 text-red-600 text-xs"><X className="w-3.5 h-3.5" />{totalPercent}% — deve somar 100%</span>
              }
            </div>
            <div className="px-5 py-3">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${visibleChannels.length}, 1fr)` }}>
                {visibleChannels.map(ch => (
                  <div key={ch} className="bg-[#7598CF]/5 border border-[#7598CF]/20 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#28071C]/55 text-xs font-semibold uppercase tracking-widest">{CHANNEL_LABELS[ch]}</span>
                      <span className="text-[10px] text-[#28071C]/35 font-mono">R$ {Math.round(macroReceita * percents[ch] / 100).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={100} value={percents[ch]}
                        onChange={e => handlePercentChange(ch, Number(e.target.value))}
                        className="flex-1 text-center text-[#28071C] text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 rounded-lg px-2 py-1 border-2 border-[#7598CF]/15 bg-white"
                      />
                      <span className="text-[#28071C]/40 font-bold">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AJUSTE 1: Compact impact banner — names only, no values */}
          {hasMacroCheck && totalPercent === 100 && (
            <div className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${macroOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-300"}`}>
              {macroOk ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-emerald-800 text-sm font-medium">
                    Todos os indicadores macro do plano estão sendo atingidos com a distribuição atual.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 text-sm font-medium">
                      A distribuição por canal impacta indicadores macro do plano.
                      Ajuste os indicadores destacados abaixo para recuperar a meta.
                    </p>
                    {/* AJUSTE 1: just names, no values */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {impactedMacro.map(item => (
                        <span key={item.key} className="text-[11px] bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-semibold">
                          {item.label}
                        </span>
                      ))}
                    </div>

                    {/* Compensação sugerida: só para Margem, via MKD% (mesma hierarquia do M1) */}
                    {marginCompensation && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap bg-white/60 border border-red-200 rounded-lg px-3 py-2">
                        <span className="text-[12px] text-red-800">
                          A participação mudou a Margem para <strong>{consolidated.margemBruta.toFixed(1)}%</strong>{" "}
                          (meta: {impactedMacro.find(i => i.key === "margemBruta")?.planned.toFixed(1)}%).
                          Compensar com{" "}
                          <strong>MKD% {marginCompensation.mkdPctNew.toFixed(1)}%</strong>
                          {marginCompensation.clamped ? " (mínimo possível — não alcança a meta só com MKD)" : ""}?
                        </span>
                        <button
                          onClick={handleApplyMarginCompensation}
                          className="text-[11px] font-semibold bg-red-600 text-white rounded-full px-3 py-1 hover:bg-red-700 transition-colors flex-shrink-0"
                        >
                          Aplicar sugestão
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Aviso: sem plano macro ────────────────────────────────────────── */}
        {!macroValues && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Nenhum cenário salvo no Módulo 1 para <strong>{selectedYear}</strong>.
              A sinalização de impacto ficará disponível após salvar um cenário no Módulo 1.
            </p>
          </div>
        )}

        {/* ── Simulator grid (AJUSTE 2: per-row highlighting) ──────────────── */}
        <div id="channel-export-content" className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4 border-[#F6F3AA] mb-5">
          <div className="px-5 py-3 border-b border-[#28071C]/8 flex items-center justify-between">
            <div>
              <h2 className="text-[#28071C] font-bold text-sm uppercase tracking-wide">Indicadores por Canal</h2>
              <p className="text-[#28071C]/40 text-xs mt-0.5">
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF] inline-block" />driver editável
                </span>
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#28071C]/20 inline-block" />calculado
                </span>
                {!macroOk && <span className="inline-flex items-center gap-1 text-red-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />canal contribuindo negativamente
                </span>}
              </p>
            </div>
            {activeMacroKeys.length > 0 && (
              <span className="text-[10px] bg-[#7598CF]/10 text-[#7598CF] border border-[#7598CF]/20 rounded-full px-2 py-0.5 font-semibold">
                Indicadores foco no topo
              </span>
            )}
          </div>

          <div className="p-4 overflow-x-auto">
            <div className="grid gap-1.5 min-w-[520px]" style={gridStyle}>

              {/* Header */}
              <div className="flex items-center px-2.5 bg-[#28071C]/5 rounded-lg h-9">
                <span className="text-[#28071C]/50 text-[10px] uppercase tracking-widest font-semibold">Indicador</span>
              </div>
              {visibleChannels.map(ch => (
                <div key={ch} className="flex items-center justify-center bg-[#7598CF] rounded-lg h-9">
                  <span className="text-white text-xs font-semibold uppercase tracking-wide">{CHANNEL_LABELS[ch]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center bg-[#28071C] rounded-lg h-9">
                <span className="text-white text-[10px] font-semibold uppercase tracking-widest">Consolidado</span>
              </div>

              {/* KPI rows — AJUSTE 4: sorted by macro priority, AJUSTE 2: highlighted */}
              {kpiFields.map((field, idx) => {
                const isMacroFocus = field.macroKey != null && macroKeyOrder.has(field.macroKey);
                const isLastFocus  = isMacroFocus && (idx === kpiFields.length - 1 || !macroKeyOrder.has(kpiFields[idx + 1]?.macroKey ?? ""));
                const fieldTooltip = getFieldTooltip(field.key, field.isDriver);
                const consImpacted = isConsolidatedImpacted(field.key);
                const macroTarget  = consImpacted ? getMacroTarget(field.key) : null;
                // When impacted, allow the row to grow to show "meta X" below the value
                const rowH = consImpacted ? "min-h-[2.5rem] h-auto py-1.5" : "h-10";

                return (
                  <>
                    {/* Divider after last macro-focus row */}
                    {isLastFocus && (
                      <div key={`div-${field.key}`} className="col-span-full my-0.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-[#28071C]/10" />
                          <span className="text-[9px] text-[#28071C]/30 uppercase tracking-widest font-semibold whitespace-nowrap">Indicadores secundários</span>
                          <div className="flex-1 h-px bg-[#28071C]/10" />
                        </div>
                      </div>
                    )}

                    {/* Label */}
                    <div key={`lbl-${field.key}`} className={`relative flex items-center gap-1.5 px-2.5 rounded-lg ${rowH} ${isMacroFocus ? "bg-[#7598CF]/6" : "bg-white/50"}`}>
                      {field.isDriver
                        ? <span className="w-1.5 h-1.5 rounded-full bg-[#7598CF] flex-shrink-0" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-[#28071C]/20 flex-shrink-0" />
                      }
                      <span className="text-[#28071C]/65 text-xs leading-tight">{field.label}</span>
                      {/* AJUSTE 5: tooltip for non-driver fields */}
                      {fieldTooltip && (
                        <span className="relative group ml-auto flex-shrink-0">
                          <Info className="w-3 h-3 text-[#28071C]/20 group-hover:text-[#7598CF] transition-colors cursor-help" />
                          <span className="absolute left-0 bottom-full mb-2 w-52 px-3 py-2 bg-[#28071C] text-white text-[10px] rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity delay-0 group-hover:delay-[2000ms] pointer-events-none z-50 leading-relaxed font-normal">
                            {fieldTooltip}
                            <span className="absolute top-full left-3 border-4 border-transparent border-t-[#28071C]" />
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Channel cells */}
                    {visibleChannels.map(ch => {
                      const dragging = field.isDriver && isChannelDragging(ch, field.key);
                      return (
                        <div key={`${ch}-${field.key}`}
                          className={`flex items-center px-2.5 rounded-lg ${rowH} border transition-colors ${
                            dragging
                              ? "bg-red-50 border-red-300 ring-1 ring-red-200"
                              : field.isDriver
                                ? "bg-white border-[#7598CF]/35 ring-1 ring-[#7598CF]/10"
                                : "bg-[#28071C]/3 border-[#28071C]/8"
                          }`}
                        >
                          {field.isDriver ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                focusedCell?.ch === ch && focusedCell?.key === field.key
                                  ? editingValue
                                  : fmt(channelData[ch][field.key], field.format)
                              }
                              onFocus={() => handleDriverFocus(ch, field.key)}
                              onChange={e => handleDriverChange(ch, field.key, e.target.value)}
                              onBlur={handleDriverBlur}
                              onClick={e => (e.target as HTMLInputElement).select()}
                              className={`w-full bg-transparent text-xs font-medium focus:outline-none rounded px-0.5 ${dragging ? "text-red-700" : "text-[#28071C]"}`}
                            />
                          ) : (
                            <span className="text-[#28071C]/55 text-xs font-mono">{fmt(channelData[ch][field.key], field.format)}</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Consolidated cell — shows "meta X" below when off-target */}
                    <div key={`cons-${field.key}`}
                      className={`flex flex-col justify-center px-2.5 rounded-lg ${rowH} border ${consImpacted ? "bg-red-50 border-red-200" : "bg-[#28071C]/4 border-[#28071C]/10"}`}
                    >
                      <span className={`text-xs font-semibold font-mono leading-tight ${consImpacted ? "text-red-700" : "text-[#28071C]"}`}>
                        {fmt(consolidatedKpi(field.key), field.format)}
                      </span>
                      {macroTarget != null && (
                        <span className="text-[9px] text-red-400 font-mono leading-tight mt-0.5">
                          meta {fmt(macroTarget, field.format)}
                        </span>
                      )}
                    </div>
                  </>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Cenários salvos ───────────────────────────────────────────────── */}
        {savedScenarios.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-[#28071C]/8">
              <h3 className="text-[#28071C] font-semibold text-sm">Cenários Salvos — {selectedYear}</h3>
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-2">
              {savedScenarios.map(sc => (
                <div key={sc.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border-2 bg-white border-[#28071C]/10 text-[#28071C]/65">
                  <Check className="w-3 h-3 text-[#7598CF]" />
                  <span className="font-medium">{sc.name}</span>
                  <span className="text-[10px] text-[#28071C]/30">{new Date(sc.saved_at).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Barra de ações ────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button onClick={() => { setSaveNameInput(""); setShowSaveDialog(true); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl font-semibold text-sm hover:opacity-90 shadow-sm">
                <Save className="w-4 h-4" />Salvar cenário
              </button>
              <button onClick={() => { setSelectedForCompare([]); setShowCompareModal(true); }}
                disabled={savedScenarios.length < 2}
                className="flex items-center gap-2 px-5 py-2.5 border-2 border-[#7598CF]/30 text-[#28071C]/70 rounded-xl font-semibold text-sm hover:bg-[#7598CF]/8 disabled:opacity-35 disabled:cursor-not-allowed">
                <GitCompare className="w-4 h-4" />Comparar
                {savedScenarios.length >= 2 && <span className="bg-[#7598CF] text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{savedScenarios.length}</span>}
              </button>
              <button onClick={handleExportPDF} disabled={isExportingPDF}
                className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/15 text-[#28071C]/60 rounded-xl text-sm hover:bg-white/60 disabled:opacity-35 disabled:cursor-not-allowed">
                <FileDown className="w-4 h-4" />{isExportingPDF ? "Gerando PDF…" : "Exportar PDF"}
              </button>
            </div>
            {/* ── Botão direito: depende do número de desvios macro ── */}
            {impactedMacro.length === 0 ? (
              /* 0 desvios → Aplicar normal */
              <button onClick={handleApplyMetas}
                disabled={totalPercent !== 100 || savedScenarios.length === 0 || !hasM1Version}
                title={!hasM1Version ? `Complete o Planejamento Estratégico (M1) de ${selectedYear} antes de aplicar` : totalPercent !== 100 ? "Participação deve somar 100%" : savedScenarios.length === 0 ? "Salve um cenário antes de aplicar" : "Aplicar metas e concluir revisão"}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm ${
                  totalPercent === 100 && savedScenarios.length > 0 && hasM1Version
                    ? "bg-[#28071C] text-[#F6F3AA] hover:opacity-90"
                    : "bg-[#28071C]/15 text-[#28071C]/35 cursor-not-allowed"
                }`}>
                <Lock className="w-4 h-4" />Aplicar Metas
              </button>
            ) : impactedMacro.length <= 2 ? (
              /* 1-2 desvios → Submeter para Aprovação */
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => {
                    if (alreadyPending) {
                      showToast("Já existe uma solicitação pendente para este ciclo.");
                      return;
                    }
                    if (savedScenarios.length === 0) {
                      showToast("Salve um cenário antes de submeter.");
                      return;
                    }
                    setShowSubmitApprovalDialog(true);
                  }}
                  disabled={totalPercent !== 100}
                  title={totalPercent !== 100 ? "Participação deve somar 100%" : alreadyPending ? "Solicitação já enviada" : "Submeter para aprovação do plano macro"}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm ${
                    totalPercent === 100
                      ? alreadyPending
                        ? "bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed"
                        : "bg-[#7598CF] text-white hover:opacity-90"
                      : "bg-[#28071C]/15 text-[#28071C]/35 cursor-not-allowed"
                  }`}>
                  <SendHorizonal className="w-4 h-4" />
                  {alreadyPending ? "Aguardando aprovação…" : "Submeter para Aprovação"}
                </button>
                <span className="text-[9px] text-amber-700 font-medium">
                  {impactedMacro.length} indicador{impactedMacro.length > 1 ? 'es' : ''} com desvio — requer aprovação do plano macro
                </span>
              </div>
            ) : (
              /* 3+ desvios → Bloqueado */
              <div className="flex flex-col items-end gap-1">
                <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-red-100 text-red-400 cursor-not-allowed">
                  <Lock className="w-4 h-4" />Aplicar Metas
                </button>
                <span className="text-[9px] text-red-600 font-medium">
                  {impactedMacro.length} desvios — ajuste os indicadores destacados para continuar
                </span>
              </div>
            )}
          </div>
          <p className="text-[9px] text-[#28071C]/25 mt-2">
            Cenários não alteram dados oficiais até "Aplicar Metas" ser acionado.
          </p>
        </div>
      </main>

      {/* ── SAVE DIALOG ──────────────────────────────────────────────────────── */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-6 py-5 w-[420px] mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#28071C] font-bold text-base">Nomear Cenário</h3>
              <button onClick={() => setShowSaveDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]"><X className="w-5 h-5" /></button>
            </div>
            <input type="text" autoFocus value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirmSave()}
              placeholder={`Ex: Mix Atacado 45% — ${selectedYear}`}
              className="w-full px-4 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm text-[#28071C] placeholder-[#28071C]/30 focus:border-[#7598CF] focus:outline-none mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm font-semibold text-[#28071C]/60 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleConfirmSave}
                className="flex-1 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold hover:opacity-90">Salvar cenário</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARE MODAL ────────────────────────────────────────────────────── */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-xl w-full mx-4">
            {compareResults ? (
              /* ── Resultados da comparação — todos os indicadores em colunas ── */
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[#28071C] font-bold text-base">Comparação de Cenários</h3>
                    <p className="text-[#28071C]/50 text-xs mt-0.5">
                      Consolidado ponderado · {(compareResults as never as { name: string }[]).length} cenários
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowCompareModal(false); setCompareResults(null); setSelectedForCompare([]); }}
                    className="text-[#28071C]/40 hover:text-[#28071C] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  {(() => {
                    type R = { name: string; savedAt: string; consolidated: Record<string, number> };
                    const rows = compareResults as never as R[];
                    const COMPARE_FIELDS: { key: string; label: string; format: string }[] = [
                      { key: 'receita',      label: 'Receita Total (R$)',   format: 'currency'   },
                      { key: 'margemBruta',  label: 'Margem Bruta (%)',     format: 'percent'    },
                      { key: 'margemBrutaRS',label: 'Margem Bruta (R$)',    format: 'currency'   },
                      { key: 'pmv',          label: 'PMV (R$)',             format: 'currency'   },
                      { key: 'ticketMedio',  label: 'Ticket Médio (R$)',    format: 'currency'   },
                      { key: 'custoMedio',   label: 'Custo Médio (R$)',     format: 'currency'   },
                      { key: 'giro',         label: 'Giro',                 format: 'multiplier' },
                      { key: 'cobertura',    label: 'Cobertura (dias)',     format: 'days'       },
                      { key: 'orcamento',    label: 'Orçamento (R$)',       format: 'currency'   },
                      { key: 'mkdPct',       label: 'Markdown (%)',         format: 'percent'    },
                      { key: 'markdown',     label: 'Markdown (R$)',        format: 'currency'   },
                      { key: 'producao',     label: 'Produção (peças)',     format: 'number'     },
                      { key: 'gmroi',        label: 'GMROI',                format: 'multiplier' },
                    ];
                    return (
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr>
                            <th className="text-left px-3 py-2.5 text-[#28071C]/50 font-semibold uppercase tracking-widest bg-[#28071C]/4 rounded-tl-lg min-w-[140px]">
                              Indicador
                            </th>
                            {rows.map((r, i) => (
                              <th key={i} className="text-right px-3 py-2.5 font-bold text-[#28071C] bg-[#7598CF]/10 min-w-[130px]">
                                <div>{r.name}</div>
                                <div className="text-[10px] font-normal text-[#28071C]/40 mt-0.5">
                                  {new Date(r.savedAt).toLocaleDateString('pt-BR')}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#28071C]/6">
                          {COMPARE_FIELDS.map(field => (
                            <tr key={field.key} className="hover:bg-[#28071C]/3 transition-colors">
                              <td className="px-3 py-2 text-[#28071C]/65 font-medium">{field.label}</td>
                              {rows.map((r, i) => {
                                const v = r.consolidated[field.key] ?? 0;
                                const fmtV = field.format === 'currency'
                                  ? `R$ ${Math.round(v).toLocaleString('pt-BR')}`
                                  : field.format === 'percent'
                                    ? `${v.toFixed(1)}%`
                                    : field.format === 'multiplier'
                                      ? `${v.toFixed(2)}x`
                                      : field.format === 'days'
                                        ? `${Math.round(v)} dias`
                                        : Math.round(v).toLocaleString('pt-BR');
                                return (
                                  <td key={i} className="px-3 py-2 text-right font-mono text-[#28071C] font-semibold">
                                    {fmtV}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>

                <div className="mt-4 flex gap-3 pt-3 border-t border-[#28071C]/8">
                  <button
                    onClick={() => { setCompareResults(null); setSelectedForCompare([]); }}
                    className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/20 rounded-xl text-sm font-semibold text-[#28071C] hover:bg-gray-50"
                  >
                    Nova comparação
                  </button>
                  <button
                    onClick={() => { setShowCompareModal(false); setCompareResults(null); setSelectedForCompare([]); }}
                    className="flex-1 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:opacity-90"
                  >
                    Fechar
                  </button>
                </div>
              </>
            ) : (
              /* ── Seleção de cenários ── */
              <>
                <h3 className="text-[#28071C] font-bold text-base mb-1">Comparar Cenários</h3>
                <p className="text-[#28071C]/50 text-sm mb-5">Selecione ao menos 2 cenários para comparar.</p>
                <div className="space-y-2 mb-6 max-h-52 overflow-y-auto">
                  {savedScenarios.map(sc => {
                    const isSel = selectedForCompare.includes(sc.id);
                    return (
                      <label key={sc.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 transition-colors ${isSel ? "border-[#7598CF] bg-[#7598CF]/6" : "border-transparent hover:bg-gray-50"}`}>
                        <input type="checkbox" className="w-4 h-4 accent-[#7598CF]" checked={isSel}
                          onChange={e => setSelectedForCompare(prev => e.target.checked ? [...prev, sc.id] : prev.filter(id => id !== sc.id))} />
                        <div className="flex-1">
                          <p className="text-[#28071C] text-sm font-semibold">{sc.name}</p>
                          <p className="text-[#28071C]/40 text-xs">{new Date(sc.saved_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setShowCompareModal(false); setSelectedForCompare([]); }}
                    className="flex-1 px-5 py-2.5 border-2 border-[#28071C]/20 rounded-xl text-sm font-semibold text-[#28071C] hover:bg-gray-50">Cancelar</button>
                  <button onClick={handleCompare} disabled={selectedForCompare.length < 2}
                    className="flex-1 px-5 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:opacity-90">
                    Comparar ({selectedForCompare.length})
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tour.isOpen && (
        <ProductTour steps={CHANNEL_PLANNING_TOUR} onClose={tour.dismiss} />
      )}

      {/* ── POST-APPLY MODAL ─────────────────────────────────────────────────── */}
      {showPostApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-7 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-[#28071C] font-bold text-base">Metas por Canal aplicadas!</p>
                <p className="text-[#28071C]/50 text-xs">Módulo 2 — {selectedYear} concluído</p>
              </div>
            </div>
            <p className="text-[#28071C]/60 text-sm mb-6 leading-relaxed">
              O plano por canal está registrado. O próximo passo é detalhar as metas por divisão de produto dentro de cada canal.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { setShowPostApplyModal(false); navigate("/module3-division-planning"); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#28071C] text-[#F6F3AA] rounded-xl font-semibold text-sm hover:opacity-90">
                Ir para Módulo 3 — Planejamento por Divisão <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowPostApplyModal(false); navigate("/dashboard"); }}
                className="w-full py-2.5 border-2 border-[#28071C]/15 text-[#28071C]/60 rounded-xl font-semibold text-sm hover:bg-gray-50">
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUBMIT APPROVAL DIALOG ───────────────────────────────────────────── */}
      {showSubmitApprovalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-6 py-5 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[#28071C] font-bold text-base">Submeter Plano para Aprovação</h3>
                <p className="text-[#28071C]/45 text-xs mt-0.5">O responsável pelo plano macro receberá um aviso de revisão</p>
              </div>
              <button onClick={() => setShowSubmitApprovalDialog(false)} className="text-[#28071C]/40 hover:text-[#28071C]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Indicadores impactados */}
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-800 text-xs font-semibold uppercase tracking-wide mb-2">
                {impactedMacro.length} indicador{impactedMacro.length > 1 ? 'es' : ''} com desvio do plano macro
              </p>
              <div className="space-y-1.5">
                {impactedMacro.map(item => (
                  <div key={item.key} className="flex justify-between text-xs text-amber-900">
                    <span className="font-medium">{item.label}</span>
                    <span className="font-mono text-amber-700">
                      Meta {fmt(item.planned, item.isRate ? "percent" : "currency")} →&nbsp;
                      Proposto {fmt(item.projected, item.isRate ? "percent" : "currency")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <label className="block text-xs font-semibold text-[#28071C]/70 mb-1.5 uppercase tracking-wide">
              Justificativa *
            </label>
            <textarea
              autoFocus
              value={approvalJustification}
              onChange={e => setApprovalJustification(e.target.value)}
              placeholder="Explique por que o desvio proposto é necessário e como a nova distribuição atende melhor ao negócio…"
              className="w-full px-4 py-3 border-2 border-[#28071C]/15 rounded-xl text-sm focus:border-[#7598CF] focus:outline-none resize-none mb-5"
              rows={5}
            />

            <div className="flex gap-3">
              <button onClick={() => setShowSubmitApprovalDialog(false)}
                className="flex-1 py-2.5 border-2 border-[#28071C]/15 rounded-xl text-sm font-semibold text-[#28071C]/60 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleSubmitApproval}
                disabled={!approvalJustification.trim() || isSubmittingApproval}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#7598CF] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:opacity-90">
                <SendHorizonal className="w-4 h-4" />
                {isSubmittingApproval ? "Enviando…" : "Enviar solicitação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INCOMING APPROVAL MODAL (de M3 ou M4 → M2) ──────────────────────── */}
      {showIncomingApproval && activeIncoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-[#F6F3AA] font-bold text-base">
                  Pedido de Revisão — Módulo {activeIncoming.from_module}
                </p>
                <p className="text-[#F6F3AA]/60 text-xs mt-0.5">
                  Solicitado por {activeIncoming.requester_email} · {new Date(activeIncoming.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {incomingApprovals.length > 1 && (
                <span className="text-[10px] bg-white/20 text-[#F6F3AA] rounded-full px-2 py-0.5 font-semibold">
                  {incomingApprovals.length} pendentes
                </span>
              )}
            </div>

            <div className="overflow-y-auto p-6 flex-1">
              {/* Comparativo original vs proposto */}
              <h4 className="text-[#28071C] font-semibold text-sm mb-3 uppercase tracking-wide">
                Comparativo de Indicadores
              </h4>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 bg-[#28071C]/5 text-[#28071C]/50 font-semibold uppercase tracking-widest rounded-tl-lg">Indicador</th>
                      <th className="text-right px-3 py-2 bg-[#28071C]/5 text-[#28071C]/50 font-semibold uppercase tracking-widest">Plano Atual (M2)</th>
                      <th className="text-right px-3 py-2 bg-[#7598CF]/10 text-[#7598CF] font-semibold uppercase tracking-widest rounded-tr-lg">Proposto (M{activeIncoming.from_module})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#28071C]/6">
                    {(activeIncoming.impacted_indicators as ImpactedIndicator[]).map(item => (
                      <tr key={item.key} className="hover:bg-[#28071C]/2">
                        <td className="px-3 py-2 text-[#28071C]/70 font-medium">{item.label}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#28071C]">
                          {fmt(item.planned, item.isRate ? "percent" : "currency")}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-[#7598CF]">
                          {fmt(item.projected, item.isRate ? "percent" : "currency")}
                          <span className={`ml-1.5 text-[9px] font-normal ${item.gap >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {item.gap >= 0 ? "+" : ""}{item.isRate ? `${item.gap.toFixed(1)}pp` : `R$${Math.round(item.gap).toLocaleString("pt-BR")}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Justificativa */}
              {activeIncoming.justification && (
                <div className="mb-5">
                  <h4 className="text-[#28071C] font-semibold text-sm mb-2 uppercase tracking-wide">Justificativa</h4>
                  <div className="bg-[#7598CF]/6 border border-[#7598CF]/20 rounded-xl px-4 py-3 text-sm text-[#28071C]/80 leading-relaxed italic">
                    "{activeIncoming.justification}"
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#28071C]/8 flex gap-3 flex-shrink-0">
              <button
                onClick={() => handleResolveIncoming(activeIncoming, 'denied')}
                disabled={isResolvingApproval}
                className="flex-1 py-2.5 border-2 border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-40">
                Negar revisão
              </button>
              <button
                onClick={() => handleResolveIncoming(activeIncoming, 'approved')}
                disabled={isResolvingApproval}
                className="flex-1 py-2.5 bg-[#28071C] text-[#F6F3AA] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40">
                {isResolvingApproval ? "Processando…" : "Aceitar e aplicar ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF hidden element — scenario comparison cards ────────────────── */}
      <div
        id="channel-scenarios-pdf"
        style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, width: '1120px', padding: '28px', background: '#F2F2F2', fontFamily: 'system-ui, sans-serif' }}
      >
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#28071C', marginBottom: '4px' }}>
          Planejamento por Canal {selectedYear}
        </p>
        <p style={{ fontSize: '11px', color: '#28071C', opacity: 0.4, marginBottom: '20px' }}>
          Comparação de Cenários — Consolidado Ponderado
        </p>
        {savedScenarios.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#28071C', opacity: 0.5 }}>Nenhum cenário salvo.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            {savedScenarios.map(sc => {
              const chData = sc.channel_data as Record<string, Record<string, number>>;
              const chs = visibleChannels;
              const totalR = chs.reduce((s, ch) => s + (chData[ch]?.receita ?? 0), 0);
              const wAvg = (key: string) =>
                totalR > 0 ? chs.reduce((s, ch) => s + (chData[ch]?.receita ?? 0) * (chData[ch]?.[key] ?? 0), 0) / totalR : 0;
              const sum = (key: string) => chs.reduce((s, ch) => s + (chData[ch]?.[key] ?? 0), 0);
              const cons = {
                receita:    totalR,
                margemBruta: +wAvg('margemBruta').toFixed(1),
                orcamento:  sum('orcamento'),
                pmv:        +wAvg('pmv').toFixed(0),
                giro:       +wAvg('giro').toFixed(2),
                cobertura:  +wAvg('cobertura').toFixed(0),
                mkdPct:     +wAvg('mkdPct').toFixed(1),
                producao:   sum('producao'),
              };
              const PDF_ROWS: { label: string; val: string }[] = [
                { label: 'Receita Total (R$)',  val: `R$ ${Math.round(cons.receita).toLocaleString('pt-BR')}` },
                { label: 'Margem Bruta (%)',    val: `${cons.margemBruta}%` },
                { label: 'PMV (R$)',            val: `R$ ${Math.round(cons.pmv).toLocaleString('pt-BR')}` },
                { label: 'Orçamento (R$)',      val: `R$ ${Math.round(cons.orcamento).toLocaleString('pt-BR')}` },
                { label: 'Giro',               val: `${cons.giro}x` },
                { label: 'Cobertura (dias)',    val: `${Math.round(cons.cobertura)} dias` },
                { label: 'Markdown (%)',        val: `${cons.mkdPct}%` },
                { label: 'Produção (peças)',    val: Math.round(cons.producao).toLocaleString('pt-BR') },
              ];
              const isActive = sc.is_applied;
              return (
                <div key={sc.id} style={{ flex: '1 1 200px', minWidth: '180px', maxWidth: '240px', background: 'white', borderRadius: '12px', padding: '14px', borderTop: `4px solid ${isActive ? '#7598CF' : '#28071C'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#28071C' }}>{sc.name}</span>
                    {isActive && <span style={{ fontSize: '9px', background: '#7598CF', color: 'white', borderRadius: '999px', padding: '2px 6px', fontWeight: 700 }}>ATIVO</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px', padding: '4px 0', fontSize: '9px', fontWeight: 700, color: 'rgba(40,7,28,0.4)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #F2F2F2' }}>
                    <span>Indicador</span><span style={{ textAlign: 'right' }}>Valor</span>
                  </div>
                  {PDF_ROWS.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px', padding: '5px 0', borderBottom: '1px solid #F2F2F2', fontSize: '10px', color: '#28071C' }}>
                      <span style={{ opacity: 0.6 }}>{row.label}</span>
                      <span style={{ textAlign: 'right', fontWeight: 600 }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
