/**
 * Módulo 5 — Plano de Sortimento
 * Sub-módulo A: Sortiment  — estrutura de coleções por divisão
 * Sub-módulo B: Mix de Produtos — arquitetura por categoria e faixa de preço
 */

import { useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Layers,
  FileText,
  BarChart2,
  Clock,
  Info,
  Lock,
  Save,
  X,
  Bookmark,
  Download,
  GitCompare,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { listSeasonsDb } from "../../services/supabase/seasonService";
import type { Temporada } from "../../services/temporadaService";
import {
  getPlanCycle,
  getPlannedYears,
  STRATEGIC_FOCUS_LABELS,
  STRATEGIC_FOCUS_ICONS,
  STRATEGIC_FOCUS_COLORS,
} from "../types/planCycle";
import type { AnnualPlanCycle } from "../types/planCycle";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface UserData {
  name: string;
  email: string;
  profile: string;
  tenant_id: string;
  system_role?: string;
}

// LocalStorage key for collections (shared with OperationSettings)
const COLECOES_KEY = "fashionmind_colecoes";
interface LocalColecao {
  id: number;
  temporadaId: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────
interface Scenario {
  id: string;
  name: string;
  savedAt: string; // ISO string
  data: Division[];
}
const SCENARIOS_KEY = (seasonId: string) => `fashionmind_sortiment_scenarios_${seasonId}`;

type CollectionType = "colecao" | "drop";
type ProfileType = "Sustentador de Margem" | "Motor de Giro" | "Ícone de Marca";
type PriceTier = "P1" | "P2" | "P3";
type MixStatus = "nao_configurado" | "em_andamento" | "validado";
type ModuleView = "sortiment" | "mix";

interface TierLayer {
  tier: PriceTier;
  tierPct: number;   // % da receita da categoria nesta faixa
  avgPrice: number;  // Preço médio de venda (R$) — editável
  profile: ProfileType;
}

interface CategoryMix {
  id: string;
  category: string;
  participationPct: number; // % da receita da coleção
}

interface CollectionEntry {
  date: string;  // "YYYY-MM-DD"
  label: string; // "Entrada 1", "Entrada 2"...
}

interface Collection {
  id: string;
  name: string;
  type: CollectionType;
  numEntradas: number;
  revenuePct: number;   // % da meta de receita da divisão
  entries: CollectionEntry[];
  categories: CategoryMix[];
  tierLayers: Record<string, TierLayer[]>; // chave = category.id
  mixStatus: MixStatus;
}

interface Division {
  id: string;
  name: string;
  revenueTarget: number;    // Meta de receita (R$) — do Módulo 3
  participationPct: number; // % de participação — do Módulo 3
  targetMarginPct: number;  // Margem alvo (%) — do Módulo 3
  pricePyramid: { p1: number; p2: number; p3: number }; // % do Módulo 3
  avgPriceP1: number;
  avgPriceP2: number;
  avgPriceP3: number;
  collections: Collection[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Blusas", "Calças", "Vestidos", "Saias", "Shorts",
  "Jaquetas", "Casacos", "Conjuntos", "Macacões", "Acessórios",
];

const PROFILES: ProfileType[] = [
  "Sustentador de Margem", "Motor de Giro", "Ícone de Marca",
];

const COLLECTION_COLORS = [
  "#7598CF", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899",
];

const INITIAL_DIVISIONS: Division[] = [
  {
    id: "feminino",
    name: "Feminino",
    revenueTarget: 1110000,
    participationPct: 60,
    targetMarginPct: 62,
    pricePyramid: { p1: 40, p2: 40, p3: 20 },
    avgPriceP1: 120,
    avgPriceP2: 180,
    avgPriceP3: 280,
    collections: [
      {
        id: "col-fem-1",
        name: "Coleção Principal",
        type: "colecao",
        numEntradas: 2,
        revenuePct: 60,
        entries: [
          { date: "2027-01-15", label: "Entrada 1" },
          { date: "2027-02-20", label: "Entrada 2" },
        ],
        categories: [],
        tierLayers: {},
        mixStatus: "nao_configurado",
      },
      {
        id: "drop-fem-1",
        name: "Drop Verão",
        type: "drop",
        numEntradas: 1,
        revenuePct: 40,
        entries: [
          { date: "2027-03-10", label: "Entrada 1" },
        ],
        categories: [],
        tierLayers: {},
        mixStatus: "nao_configurado",
      },
    ],
  },
  {
    id: "masculino",
    name: "Masculino",
    revenueTarget: 740000,
    participationPct: 40,
    targetMarginPct: 60,
    pricePyramid: { p1: 45, p2: 40, p3: 15 },
    avgPriceP1: 110,
    avgPriceP2: 165,
    avgPriceP3: 250,
    collections: [],
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Moeda BRL — inteiros sem decimal, conforme padrão do app */
function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

/** Inteiro sem decimal */
function fmtNum(v: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(v));
}

/** Percentual com exatamente 1 casa decimal */
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

/** Data ISO → "DD/MM/AAAA" */
function fmtDateBR(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function totalColPct(collections: Collection[]) {
  return collections.reduce((s, c) => s + c.revenuePct, 0);
}

function colRevenue(div: Division, col: Collection) {
  return div.revenueTarget * col.revenuePct / 100;
}

function catRevenue(colRev: number, cat: CategoryMix) {
  return colRev * cat.participationPct / 100;
}

function tierRev(catRev: number, layer: TierLayer) {
  return catRev * layer.tierPct / 100;
}

function calcVolume(revenue: number, avgPrice: number) {
  if (avgPrice <= 0) return 0;
  return Math.ceil(revenue / avgPrice);
}

function calcMaxCost(avgPrice: number, marginPct: number) {
  return avgPrice * (1 - marginPct / 100);
}

function sumCatPct(categories: CategoryMix[]) {
  return categories.reduce((s, c) => s + c.participationPct, 0);
}

function sumTierPct(layers: TierLayer[]) {
  return layers.reduce((s, l) => s + l.tierPct, 0);
}

/** Converte "YYYY-MM-DD" ou "YYYY-MM" N meses para frente, retorna "YYYY-MM" */
function shiftMonth(dateStr: string, n: number): string {
  if (!dateStr) return "";
  const base = dateStr.slice(0, 7); // "YYYY-MM"
  const d = new Date(base + "-01T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7);
}

function monthLabel(ym: string) {
  if (!ym || ym.length < 7) return "";
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const m = parseInt(ym.slice(5, 7)) - 1;
  return `${months[m]}/${ym.slice(2, 4)}`;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function SortimentPlan() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [activeView, setActiveView] = useState<ModuleView>("sortiment");
  const [seasonId] = useState("verao-2027");

  const [divisions, setDivisions] = useState<Division[]>(() => {
    try {
      const saved = localStorage.getItem(`fashionmind_sortiment_${seasonId}`);
      return saved ? JSON.parse(saved) : INITIAL_DIVISIONS;
    } catch {
      return INITIAL_DIVISIONS;
    }
  });

  const [activeDivId, setActiveDivId] = useState<string>(divisions[0]?.id ?? "");
  const [activeMixColId, setActiveMixColId] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // ── Plano macro estratégico (Módulo 1) ───────────────────────────────────────
  const [macroPlan, setMacroPlan] = useState<AnnualPlanCycle | null>(null);

  // ── Cenários ─────────────────────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<Scenario[]>(() => {
    try { return JSON.parse(localStorage.getItem(SCENARIOS_KEY("verao-2027")) ?? "[]"); } catch { return []; }
  });
  const [showScenarioPanel, setShowScenarioPanel] = useState(false);
  const [showSaveModal,     setShowSaveModal]     = useState(false);
  const [showCompareModal,  setShowCompareModal]  = useState(false);
  const [scenarioName,      setScenarioName]      = useState("");
  const [compareScenarioId, setCompareScenarioId] = useState<string>("");

  const saveScenario = () => {
    if (!scenarioName.trim()) return;
    const newScen: Scenario = {
      id: `scen-${Date.now()}`,
      name: scenarioName.trim(),
      savedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(divisions)), // deep clone
    };
    const updated = [...scenarios, newScen];
    setScenarios(updated);
    try { localStorage.setItem(SCENARIOS_KEY(seasonId), JSON.stringify(updated)); } catch { /* */ }
    setScenarioName("");
    setShowSaveModal(false);
  };

  const loadScenario = (scen: Scenario) => {
    if (window.confirm(`Carregar o cenário "${scen.name}"? O plano atual não salvo será substituído.`)) {
      setDivisions(scen.data);
      setShowScenarioPanel(false);
    }
  };

  const deleteScenario = (id: string) => {
    const updated = scenarios.filter(s => s.id !== id);
    setScenarios(updated);
    try { localStorage.setItem(SCENARIOS_KEY(seasonId), JSON.stringify(updated)); } catch { /* */ }
  };

  const exportPDF = () => window.print();

  // ── Modal: Adicionar Coleção / Drop ─────────────────────────────────────────
  const [showAddModal, setShowAddModal]   = useState(false);
  const [modalDivId,   setModalDivId]    = useState<string>("");
  const [modalSeasonId, setModalSeasonId] = useState<string>("");
  const [modalNome,    setModalNome]     = useState("");
  const [modalTipo,    setModalTipo]     = useState<CollectionType>("colecao");
  const [modalInicio,  setModalInicio]   = useState("");
  const [modalFim,     setModalFim]      = useState("");
  const [modalSaving,  setModalSaving]   = useState(false);

  // ── Seasons (for modal selector) ────────────────────────────────────────────
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);

  // ── Coleções bloqueadas (já têm produtos em produção no ERP) ────────────────
  // Regra: se collection_name existe em products, apenas datas de entrada podem
  // ser alteradas (postergação de lançamento). Nome, tipo, peso, entradas: bloqueados.
  const [lockedCollectionNames, setLockedCollectionNames] = useState<Set<string>>(new Set());

  async function loadLockedCollections(tenantId: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("products")
        .select("collection_name")
        .eq("tenant_id", tenantId)
        .not("collection_name", "is", null);
      const names = new Set<string>(
        (data ?? [])
          .map((r: { collection_name: string }) => r.collection_name)
          .filter(Boolean)
      );
      setLockedCollectionNames(names);
    } catch (err) {
      console.warn("Erro ao verificar produtos por coleção:", err);
    }
  }

  useEffect(() => {
    const u = sessionStorage.getItem("currentUser");
    if (u) {
      const parsed = JSON.parse(u);
      setUser(parsed);
      if (parsed.tenant_id) {
        listSeasonsDb(parsed.tenant_id)
          .then(setTemporadas)
          .catch(err => console.error("Erro ao carregar temporadas:", err));
        loadLockedCollections(parsed.tenant_id);
      }
      // Carrega metas macro do planejamento estratégico (Módulo 1)
      // Perfis sem acesso ao plano macro: apenas visualizam dados de divisão
      const canSeeMacro = ["CEO", "Diretor", "Planejador"].includes(parsed.profile) ||
        parsed.system_role === "client_admin" || parsed.system_role === "support";
      if (canSeeMacro) {
        // Busca o ano fiscal mais recente planejado
        const years = getPlannedYears();
        const latestYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear() + 1;
        const cycle = getPlanCycle(latestYear);
        setMacroPlan(cycle);
      }
    } else {
      navigate("/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Persiste no localStorage quando divisions muda
  useEffect(() => {
    localStorage.setItem(`fashionmind_sortiment_${seasonId}`, JSON.stringify(divisions));
  }, [divisions, seasonId]);

  const activeDivision = divisions.find(d => d.id === activeDivId) ?? divisions[0];

  // ── KPIs do topbar ───────────────────────────────────────────────────────────
  const topbarKpis = useMemo(() => {
    const vals      = macroPlan?.versions[0]?.values ?? {};
    const macroRec  = (vals["receitaBruta"] as number | null) ?? null;
    const macroMgm  = (vals["margemBruta"]  as number | null) ?? null;
    const macroOtb  = (vals["otbCompra"]    as number | null) ?? null;
    const macroPmv  = (vals["pmv"]          as number | null) ?? null;

    // Peças + receita já planejadas nas coleções cadastradas
    let allocPieces  = 0;
    let allocRevenue = 0;
    divisions.forEach(d => {
      d.collections.forEach(col => {
        const colRev = d.revenueTarget * (col.revenuePct / 100);
        allocRevenue += colRev;
        if (d.avgPriceP1 > 0) allocPieces += colRev * (d.pricePyramid.p1 / 100) / d.avgPriceP1;
        if (d.avgPriceP2 > 0) allocPieces += colRev * (d.pricePyramid.p2 / 100) / d.avgPriceP2;
        if (d.avgPriceP3 > 0) allocPieces += colRev * (d.pricePyramid.p3 / 100) / d.avgPriceP3;
      });
    });
    allocPieces = Math.round(allocPieces);

    // Sell-through implícito: COGS_alvo / OTB_custo
    // COGS_alvo = receita × (1 – margem%)  →  ST = COGS_alvo / OTB
    let sellThrough: number | null = null;
    if (macroRec != null && macroMgm != null && macroOtb != null && macroOtb > 0) {
      sellThrough = Math.round(((macroRec * (1 - macroMgm / 100)) / macroOtb) * 1000) / 10;
    }

    // Peças de OTB disponíveis (capacidade total – peças já planejadas)
    // PMV ponderado para calcular peças alvo: usa macroPmv ou calcula das divisões
    const pmvRef = macroPmv ?? (allocPieces > 0 ? allocRevenue / allocPieces : null);
    let otbPiecesTarget: number | null = null;
    let otbPiecesRemaining: number | null = null;
    if (macroOtb != null && pmvRef != null && pmvRef > 0 && macroMgm != null) {
      const avgCost      = pmvRef * (1 - macroMgm / 100);
      otbPiecesTarget    = avgCost > 0 ? Math.round(macroOtb / avgCost) : null;
      otbPiecesRemaining = otbPiecesTarget != null ? otbPiecesTarget - allocPieces : null;
    }

    return {
      allocPieces,
      allocRevenue,
      sellThrough,
      otbPiecesTarget,
      otbPiecesRemaining,
      macroRec, macroMgm, macroOtb, macroPmv,
      focus: macroPlan?.focus ?? null,
      focusYear: macroPlan?.year ?? null,
    };
  }, [divisions, macroPlan]);

  // Coleções de todas as divisões ordenadas por data da primeira entrada (para o Mix)
  const allColsSorted = useMemo(() => {
    return divisions
      .flatMap(div =>
        div.collections.map(col => ({ col, div }))
      )
      .filter(({ col }) => col.entries.length > 0 && col.entries[0].date)
      .sort((a, b) =>
        a.col.entries[0].date < b.col.entries[0].date ? -1 : 1
      );
  }, [divisions]);

  const activeMixItem = useMemo(() => {
    if (activeMixColId) {
      const found = allColsSorted.find(item => item.col.id === activeMixColId);
      if (found) return found;
    }
    return allColsSorted[0] ?? null;
  }, [activeMixColId, allColsSorted]);

  // ── Update helpers ───────────────────────────────────────────────────────────

  const updateCollection = (
    divId: string,
    colId: string,
    updates: Partial<Collection>
  ) => {
    setDivisions(ds =>
      ds.map(d =>
        d.id !== divId
          ? d
          : {
              ...d,
              collections: d.collections.map(c =>
                c.id !== colId ? c : { ...c, ...updates }
              ),
            }
      )
    );
  };

  // ── Sortiment actions ────────────────────────────────────────────────────────

  const openAddModal = (divId: string) => {
    setModalDivId(divId);
    setModalNome("");
    setModalTipo("colecao");
    setModalInicio("");
    setModalFim("");
    setModalSeasonId(temporadas[0]?.id ?? "");
    setShowAddModal(true);
  };

  const handleSaveColecaoModal = async () => {
    if (!modalNome.trim()) { alert("Preencha o nome da coleção."); return; }
    if (!modalInicio || !modalFim) { alert("Preencha as datas de início e fim."); return; }
    if (modalInicio > modalFim) { alert("A data de início deve ser anterior à data de fim."); return; }

    setModalSaving(true);
    try {
      // 1. Save to Supabase collections table
      let supabaseId: string | null = null;
      if (user?.tenant_id && modalSeasonId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("collections")
          .insert({
            tenant_id: user.tenant_id,
            season_id: modalSeasonId,
            name: modalNome.trim(),
            start_date: modalInicio,
            end_date: modalFim,
            lead_time_days: 0,
          })
          .select("id")
          .single();
        if (!error && data) supabaseId = data.id as string;
        else if (error) console.warn("Aviso: erro ao salvar no Supabase:", error.message);
      }

      // 2. Sync to localStorage fashionmind_colecoes (shared with OperationSettings)
      try {
        const raw = localStorage.getItem(COLECOES_KEY);
        const existing: LocalColecao[] = raw ? JSON.parse(raw) : [];
        const nova: LocalColecao = {
          id: Date.now(),
          temporadaId: modalSeasonId,
          nome: modalNome.trim(),
          dataInicio: modalInicio,
          dataFim: modalFim,
        };
        localStorage.setItem(COLECOES_KEY, JSON.stringify([...existing, nova]));
      } catch { /* silent */ }

      // 3. Add to division's planning collections
      const localId = supabaseId ?? `col-${modalDivId}-${Date.now()}`;
      const newCol: Collection = {
        id: localId,
        name: modalNome.trim(),
        type: modalTipo,
        numEntradas: modalTipo === "drop" ? 1 : 2,
        revenuePct: 0,
        entries: modalTipo === "drop"
          ? [{ date: modalInicio, label: "Entrada 1" }]
          : [
              { date: modalInicio, label: "Entrada 1" },
              { date: modalFim,   label: "Entrada 2" },
            ],
        categories: [],
        tierLayers: {},
        mixStatus: "nao_configurado",
      };

      setDivisions(ds =>
        ds.map(d =>
          d.id !== modalDivId ? d : { ...d, collections: [...d.collections, newCol] }
        )
      );

      setShowAddModal(false);
    } finally {
      setModalSaving(false);
    }
  };

  const deleteCollection = (divId: string, colId: string) => {
    setDivisions(ds =>
      ds.map(d =>
        d.id !== divId
          ? d
          : { ...d, collections: d.collections.filter(c => c.id !== colId) }
      )
    );
  };

  const changeNumEntradas = (
    divId: string,
    colId: string,
    n: number,
    col: Collection
  ) => {
    const clamped = Math.max(1, Math.min(6, n));
    let entries = [...col.entries];
    if (clamped > entries.length) {
      for (let i = entries.length; i < clamped; i++) {
        entries.push({ date: "", label: `Entrada ${i + 1}` });
      }
    } else {
      entries = entries.slice(0, clamped);
    }
    updateCollection(divId, colId, { numEntradas: clamped, entries });
  };

  const updateEntryDate = (
    divId: string,
    colId: string,
    idx: number,
    date: string,
    col: Collection
  ) => {
    const entries = col.entries.map((e, i) =>
      i === idx ? { ...e, date } : e
    );
    updateCollection(divId, colId, { entries });
  };

  // ── Mix de Produtos actions ───────────────────────────────────────────────────

  const addCategoryToMix = (divId: string, colId: string, col: Collection, div: Division) => {
    const usedCats = new Set(col.categories.map(c => c.category));
    const nextCat = CATEGORIES.find(c => !usedCats.has(c)) ?? CATEGORIES[0];
    const newCat: CategoryMix = {
      id: `cat-${Date.now()}`,
      category: nextCat,
      participationPct: 0,
    };
    const defaultLayers: TierLayer[] = [
      { tier: "P1", tierPct: div.pricePyramid.p1, avgPrice: div.avgPriceP1, profile: "Motor de Giro" },
      { tier: "P2", tierPct: div.pricePyramid.p2, avgPrice: div.avgPriceP2, profile: "Motor de Giro" },
      { tier: "P3", tierPct: div.pricePyramid.p3, avgPrice: div.avgPriceP3, profile: "Ícone de Marca" },
    ];
    updateCollection(divId, colId, {
      categories: [...col.categories, newCat],
      tierLayers: { ...col.tierLayers, [newCat.id]: defaultLayers },
      mixStatus: "em_andamento",
    });
  };

  const removeCategoryFromMix = (
    divId: string,
    colId: string,
    catId: string,
    col: Collection
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [catId]: _removed, ...rest } = col.tierLayers;
    updateCollection(divId, colId, {
      categories: col.categories.filter(c => c.id !== catId),
      tierLayers: rest,
    });
  };

  const updateCategoryField = (
    divId: string,
    colId: string,
    catId: string,
    field: keyof CategoryMix,
    value: string | number,
    col: Collection
  ) => {
    updateCollection(divId, colId, {
      categories: col.categories.map(c =>
        c.id !== catId ? c : { ...c, [field]: value }
      ),
    });
  };

  const updateTierLayer = (
    divId: string,
    colId: string,
    catId: string,
    tier: PriceTier,
    field: keyof TierLayer,
    value: number | string,
    col: Collection
  ) => {
    const current = col.tierLayers[catId] ?? [];
    const updated = current.map(l =>
      l.tier === tier ? { ...l, [field]: value } : l
    );
    updateCollection(divId, colId, {
      tierLayers: { ...col.tierLayers, [catId]: updated },
    });
  };

  const validateMix = (divId: string, colId: string, col: Collection) => {
    const total = sumCatPct(col.categories);
    if (Math.abs(total - 100) > 0.01) {
      alert("A distribuição por categoria precisa somar 100% antes de validar.");
      return;
    }
    updateCollection(divId, colId, { mixStatus: "validado" });
  };

  // ── Timeline ─────────────────────────────────────────────────────────────────

  const timelineMonths = useMemo((): string[] => {
    if (!activeDivision) return [];
    const allDates = activeDivision.collections
      .flatMap(c => c.entries.map(e => e.date))
      .filter(Boolean);
    if (allDates.length === 0) return [];
    const sorted = [...allDates].sort();
    const first = shiftMonth(sorted[0], -1);
    const last  = shiftMonth(sorted[sorted.length - 1], 1);
    const months: string[] = [];
    let cur = first;
    while (cur <= last) {
      months.push(cur);
      cur = shiftMonth(cur, 1);
    }
    return months;
  }, [activeDivision]);

  // ── Budget projection (Mix view) ─────────────────────────────────────────────

  const budgetProjection = useMemo((): { month: string; cost: number }[] => {
    if (!activeMixItem) return [];
    const { col, div } = activeMixItem;
    const rev = colRevenue(div, col);
    const map: Record<string, number> = {};

    for (const cat of col.categories) {
      const cRev = catRevenue(rev, cat);
      const layers = col.tierLayers[cat.id] ?? [];
      for (const layer of layers) {
        const tRev = tierRev(cRev, layer);
        const vol  = calcVolume(tRev, layer.avgPrice);
        const cost = calcMaxCost(layer.avgPrice, div.targetMarginPct);
        const total = vol * cost;
        // Distribui entre entradas da coleção
        const perEntry = total / Math.max(col.entries.length, 1);
        for (const entry of col.entries) {
          if (!entry.date) continue;
          const mOrder    = shiftMonth(entry.date, -3);
          const mDelivery = entry.date.slice(0, 7);
          const mPost     = shiftMonth(entry.date, 1);
          map[mOrder]    = (map[mOrder]    ?? 0) + perEntry * 0.30;
          map[mDelivery] = (map[mDelivery] ?? 0) + perEntry * 0.40;
          map[mPost]     = (map[mPost]     ?? 0) + perEntry * 0.30;
        }
      }
    }

    return Object.entries(map)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, cost]) => ({ month, cost }));
  }, [activeMixItem]);

  // ── Mix summary ──────────────────────────────────────────────────────────────

  const mixSummary = useMemo(() => {
    if (!activeMixItem) return null;
    const { col, div } = activeMixItem;
    const rev = colRevenue(div, col);
    let totalPieces = 0;
    let totalInvestment = 0;

    for (const cat of col.categories) {
      const cRev = catRevenue(rev, cat);
      const layers = col.tierLayers[cat.id] ?? [];
      for (const layer of layers) {
        const tRev = tierRev(cRev, layer);
        const vol  = calcVolume(tRev, layer.avgPrice);
        const cost = calcMaxCost(layer.avgPrice, div.targetMarginPct);
        totalPieces     += vol;
        totalInvestment += vol * cost;
      }
    }

    return {
      totalPieces,
      totalInvestment,
      estimatedSkus: Math.ceil(totalPieces / 12), // base: 12 peças por SKU
    };
  }, [activeMixItem]);

  // ── Pyramid deviation (Mix view) ─────────────────────────────────────────────

  const pyramidDeviation = useMemo(() => {
    if (!activeMixItem) return null;
    const { col, div } = activeMixItem;
    const rev = colRevenue(div, col);
    const tierRevs: Record<PriceTier, number> = { P1: 0, P2: 0, P3: 0 };

    for (const cat of col.categories) {
      const cRev = catRevenue(rev, cat);
      const layers = col.tierLayers[cat.id] ?? [];
      for (const layer of layers) {
        tierRevs[layer.tier] += tierRev(cRev, layer);
      }
    }

    const total = tierRevs.P1 + tierRevs.P2 + tierRevs.P3;
    if (total === 0) return null;

    return {
      P1: { actual: (tierRevs.P1 / total) * 100, target: div.pricePyramid.p1, delta: (tierRevs.P1 / total) * 100 - div.pricePyramid.p1 },
      P2: { actual: (tierRevs.P2 / total) * 100, target: div.pricePyramid.p2, delta: (tierRevs.P2 / total) * 100 - div.pricePyramid.p2 },
      P3: { actual: (tierRevs.P3 / total) * 100, target: div.pricePyramid.p3, delta: (tierRevs.P3 / total) * 100 - div.pricePyramid.p3 },
    };
  }, [activeMixItem]);

  // ── Derived validation ────────────────────────────────────────────────────────

  const totalPct = activeDivision ? totalColPct(activeDivision.collections) : 0;
  const allDatesSet = activeDivision?.collections.every(c =>
    c.entries.every(e => e.date !== "")
  ) ?? false;
  const sortimentValid = Math.abs(totalPct - 100) < 0.01 && allDatesSet;

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser");
    navigate("/");
  };

  if (!user) return null;

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg print:hidden">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-base font-semibold">
                Fashion Mind · Módulo 5
              </span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">
                Plano de Sortimento
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Scenario actions */}
            <button
              onClick={() => setShowSaveModal(true)}
              title="Salvar simulação atual como cenário"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-[#F6F3AA] rounded-lg text-xs font-medium transition-all"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Salvar Simulação
            </button>
            <button
              onClick={() => setShowScenarioPanel(true)}
              title="Ver e comparar cenários salvos"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-[#F6F3AA] rounded-lg text-xs font-medium transition-all"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Cenários{scenarios.length > 0 && <span className="bg-[#F6F3AA]/30 text-[#F6F3AA] text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5">{scenarios.length}</span>}
            </button>
            <button
              onClick={exportPDF}
              title="Exportar esta tela em PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-[#F6F3AA] rounded-lg text-xs font-medium transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
            <div className="w-px h-6 bg-white/20" />
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── KPI strip — segunda linha do header ──────────────────────────── */}
        <div className="max-w-[1600px] mx-auto px-6 pb-2.5 flex items-center gap-1.5 overflow-x-auto print:hidden">
          {/* Foco estratégico badge */}
          {topbarKpis.focus && (
            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest bg-white/10 text-[#F6F3AA] px-2.5 py-1 rounded-full">
              {STRATEGIC_FOCUS_ICONS[topbarKpis.focus]}&nbsp;{STRATEGIC_FOCUS_LABELS[topbarKpis.focus]}&nbsp;{topbarKpis.focusYear}
            </span>
          )}
          <div className="w-px h-4 bg-white/20 mx-1 flex-shrink-0" />

          {/* Receita Alvo */}
          {topbarKpis.macroRec != null && (
            <HeaderTooltip text="Receita bruta total definida no planejamento estratégico. É o teto que todo o sortiment deve atingir somando todas as divisões.">
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-2.5 py-1 cursor-default">
                <span className="text-[10px] text-[#F6F3AA]/60 uppercase tracking-widest">Receita Alvo</span>
                <span className="text-xs font-bold text-[#F6F3AA]">{fmtCurrency(topbarKpis.macroRec)}</span>
                <Info className="w-3 h-3 text-[#F6F3AA]/40" />
              </div>
            </HeaderTooltip>
          )}

          {/* Sell-through alvo */}
          {topbarKpis.sellThrough != null && (
            <HeaderTooltip text="Sell-through implícito do plano: percentual do estoque comprado que precisa ser vendido para atingir a receita alvo com o OTB disponível. Quanto mais próximo de 100%, mais eficiente o plano.">
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-2.5 py-1 cursor-default">
                <span className="text-[10px] text-[#F6F3AA]/60 uppercase tracking-widest">Sell-through</span>
                <span className={`text-xs font-bold ${
                  topbarKpis.sellThrough >= 85 ? "text-emerald-300"
                  : topbarKpis.sellThrough >= 70 ? "text-[#F6F3AA]"
                  : "text-rose-300"
                }`}>{fmtPct(topbarKpis.sellThrough)}</span>
                <Info className="w-3 h-3 text-[#F6F3AA]/40" />
              </div>
            </HeaderTooltip>
          )}

          {/* Margem alvo */}
          {topbarKpis.macroMgm != null && (
            <HeaderTooltip text="Margem bruta alvo da organização. Define o limite de custo de produto para todo o mix — o custo máximo de cada peça deve ser calculado a partir deste percentual.">
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-2.5 py-1 cursor-default">
                <span className="text-[10px] text-[#F6F3AA]/60 uppercase tracking-widest">Margem Alvo</span>
                <span className="text-xs font-bold text-[#F6F3AA]">{fmtPct(topbarKpis.macroMgm)}</span>
                <Info className="w-3 h-3 text-[#F6F3AA]/40" />
              </div>
            </HeaderTooltip>
          )}

          {/* OTB disponível R$ */}
          {topbarKpis.macroOtb != null && (
            <HeaderTooltip text="Orçamento total de compras disponível (OTB). Cada coleção planejada consome parte deste orçamento — o saldo diminui conforme o plano é construído.">
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-2.5 py-1 cursor-default">
                <span className="text-[10px] text-[#F6F3AA]/60 uppercase tracking-widest">OTB</span>
                <span className="text-xs font-bold text-[#F6F3AA]">{fmtCurrency(topbarKpis.macroOtb)}</span>
                <Info className="w-3 h-3 text-[#F6F3AA]/40" />
              </div>
            </HeaderTooltip>
          )}

          <div className="w-px h-4 bg-white/20 mx-1 flex-shrink-0" />

          {/* Peças de OTB disponíveis — abate conforme coleções são planejadas */}
          <HeaderTooltip text={
            topbarKpis.otbPiecesRemaining != null
              ? `Saldo de peças ainda disponíveis no OTB. Total estimado: ${fmtNum(topbarKpis.otbPiecesTarget ?? 0)} peças — já planejadas: ${fmtNum(topbarKpis.allocPieces)} peças. Este número diminui à medida que as coleções são planejadas com orçamento e preço médio.`
              : "Volume de peças novas previstas para a temporada, calculado a partir das coleções planejadas com orçamento e preço médio."
          }>
            <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-lg px-2.5 py-1 cursor-default">
              <span className="text-[10px] text-[#F6F3AA]/60 uppercase tracking-widest">Peças OTB</span>
              {topbarKpis.otbPiecesRemaining != null ? (
                <span className={`text-xs font-bold ${
                  topbarKpis.otbPiecesRemaining > 0 ? "text-[#F6F3AA]" : "text-emerald-300"
                }`}>
                  {topbarKpis.otbPiecesRemaining > 0
                    ? `${fmtNum(topbarKpis.otbPiecesRemaining)} restantes`
                    : `${fmtNum(topbarKpis.allocPieces)} ✓`}
                </span>
              ) : (
                <span className="text-xs font-bold text-[#F6F3AA]">
                  {topbarKpis.allocPieces > 0 ? fmtNum(topbarKpis.allocPieces) : "—"}
                </span>
              )}
              <Info className="w-3 h-3 text-[#F6F3AA]/40" />
            </div>
          </HeaderTooltip>
        </div>
      </header>

      {/* ── Module Tab Switcher — sticky abaixo do header ──────────────────── */}
      {/* Tab bar — fica abaixo do header que agora tem ~100px (primeira linha ≈ 60px + strip ≈ 40px) */}
      <div className="sticky top-[100px] z-40 bg-white border-b border-[#28071C]/10 shadow-sm print:hidden">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between">
          <div className="flex">
            {(
              [
                { view: "sortiment" as ModuleView, label: "1 · Sortiment", sub: "Estrutura de Coleções por Divisão" },
                { view: "mix"       as ModuleView, label: "2 · Mix de Produtos", sub: "Categorias e Faixas de Preço" },
              ] as const
            ).map(({ view, label, sub }) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`px-7 py-3.5 text-sm border-b-2 transition-all text-left ${
                  activeView === view
                    ? "border-[#28071C] text-[#28071C] font-semibold"
                    : "border-transparent text-[#28071C]/40 hover:text-[#28071C]/70"
                }`}
              >
                {label}
                <span className="hidden md:inline text-xs ml-2 opacity-50">· {sub}</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-[#28071C]/30 pr-1">
            {activeView === "sortiment"
              ? "Passo 1: defina quantas coleções e quando lançá-las"
              : "Passo 2: distribua categorias e faixas de preço dentro de cada coleção"}
          </span>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 py-5">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SUB-MÓDULO A — SORTIMENT                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeView === "sortiment" && activeDivision && (
          <div>

            {/* Division tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {divisions.map(div => {
                const pct = totalColPct(div.collections);
                const ok  = Math.abs(pct - 100) < 0.01 &&
                  div.collections.every(c => c.entries.every(e => e.date));
                return (
                  <button
                    key={div.id}
                    onClick={() => setActiveDivId(div.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                      div.id === activeDivId
                        ? "bg-[#28071C] text-white"
                        : "bg-white text-[#28071C] hover:bg-[#28071C]/10 shadow-sm"
                    }`}
                  >
                    {div.name}
                    {ok ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : pct > 0 ? (
                      <span className={`text-xs font-mono ${div.id === activeDivId ? "opacity-70" : "opacity-50"}`}>
                        {pct.toFixed(0)}%
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* ── Card de Metas Macro Estratégicas — FIXO durante a rolagem ────── */}
            {/* Guide card — abaixo do header (~100px) + tab bar (~52px) */}
            <div className="sticky top-[156px] z-30 mb-4">
              <div className="bg-white rounded-xl shadow-md border border-[#28071C]/8 overflow-hidden">
                {macroPlan ? (() => {
                  // Lê valores da versão mais recente (cenário aplicado)
                  const latestVals = macroPlan.versions[0]?.values ?? {};
                  const receita    = latestVals["receitaBruta"]  as number | null ?? null;
                  const margem     = latestVals["margemBruta"]   as number | null ?? null;
                  const otb        = latestVals["otbCompra"]     as number | null ?? null;
                  const pmv        = latestVals["pmv"]           as number | null ?? null;
                  const focus      = macroPlan.focus;
                  const focusColor = STRATEGIC_FOCUS_COLORS[focus];
                  return (
                    <>
                      {/* Cabeçalho: foco estratégico do ano fiscal */}
                      <div className={`flex items-center justify-between px-4 py-2 ${focusColor.card} border-b border-[#28071C]/8`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{STRATEGIC_FOCUS_ICONS[focus]}</span>
                          <span className="text-xs font-bold text-[#28071C]/70 uppercase tracking-widest">
                            Metas Estratégicas {macroPlan.year}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${focusColor.badge}`}>
                            {STRATEGIC_FOCUS_LABELS[focus]}
                          </span>
                        </div>
                        <Tooltip text="Metas macro definidas no planejamento estratégico anual da organização. Use como balizador para o plano de sortimento de cada divisão." side="bottom">
                          <span className="flex items-center gap-1 text-[10px] text-[#28071C]/40 cursor-default">
                            Planejamento Estratégico <Info className="w-3 h-3" />
                          </span>
                        </Tooltip>
                      </div>

                      {/* Indicadores macro */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-[#28071C]/8">
                        <Tooltip text="Receita bruta total da organização definida no planejamento estratégico anual. É o teto global que todas as divisões somadas devem atingir.">
                          <div className="px-4 py-3 cursor-default">
                            <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                              Receita Bruta Alvo <Info className="w-3 h-3 opacity-40" />
                            </div>
                            <div className="text-lg font-bold text-[#28071C]">
                              {receita != null ? fmtCurrency(receita) : <span className="text-sm text-[#28071C]/30 font-normal">Não definido</span>}
                            </div>
                          </div>
                        </Tooltip>
                        <Tooltip text="Margem bruta mínima aceitável para a organização neste exercício. Define o limite de custo de produto para todo o mix.">
                          <div className="px-4 py-3 cursor-default">
                            <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                              Margem Bruta Alvo <Info className="w-3 h-3 opacity-40" />
                            </div>
                            <div className="text-lg font-bold text-[#28071C]">
                              {margem != null ? fmtPct(margem) : <span className="text-sm text-[#28071C]/30 font-normal">Não definido</span>}
                            </div>
                          </div>
                        </Tooltip>
                        <Tooltip text="Orçamento disponível para compras e produção no período. Controla o investimento total em estoque da organização.">
                          <div className="px-4 py-3 cursor-default">
                            <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                              OTB de Compra <Info className="w-3 h-3 opacity-40" />
                            </div>
                            <div className="text-lg font-bold text-[#28071C]">
                              {otb != null ? fmtCurrency(otb) : <span className="text-sm text-[#28071C]/30 font-normal">Não definido</span>}
                            </div>
                          </div>
                        </Tooltip>
                        <Tooltip text="Preço médio de venda médio esperado para a organização. Referência para calibrar a pirâmide de preços de cada divisão.">
                          <div className="px-4 py-3 cursor-default">
                            <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">
                              PMV Médio <Info className="w-3 h-3 opacity-40" />
                            </div>
                            <div className="text-lg font-bold text-[#28071C]">
                              {pmv != null ? fmtCurrency(pmv) : <span className="text-sm text-[#28071C]/30 font-normal">Não definido</span>}
                            </div>
                          </div>
                        </Tooltip>
                      </div>

                      {/* Linha secundária: referência da divisão ativa */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-[#28071C]/5 bg-[#28071C]/2 border-t border-[#28071C]/6">
                        <div className="px-4 py-2 flex items-center gap-2">
                          <span className="text-[9px] text-[#7598CF] font-bold uppercase tracking-widest">
                            ↳ {activeDivision.name}
                          </span>
                        </div>
                        <Tooltip text="Participação desta divisão na receita total e margem alvo definida no Módulo 3.">
                          <div className="px-4 py-2 cursor-default flex items-center gap-3">
                            <span className="text-[10px] text-[#28071C]/40">Participação</span>
                            <span className="text-xs font-semibold text-[#28071C]">{fmtPct(activeDivision.participationPct)}</span>
                            <span className="text-[10px] text-[#28071C]/30">·</span>
                            <span className="text-[10px] text-[#28071C]/40">Margem</span>
                            <span className="text-xs font-semibold text-[#28071C]">{fmtPct(activeDivision.targetMarginPct)}</span>
                          </div>
                        </Tooltip>
                        <Tooltip text="Pirâmide de preços da divisão: proporção de receita por faixa P1 / P2 / P3.">
                          <div className="px-4 py-2 cursor-default flex items-center gap-2">
                            <div className="flex h-2.5 rounded overflow-hidden gap-px flex-1">
                              <div className="bg-blue-400" style={{ width: `${activeDivision.pricePyramid.p1}%` }} title={`P1: ${fmtPct(activeDivision.pricePyramid.p1)}`} />
                              <div className="bg-violet-400" style={{ width: `${activeDivision.pricePyramid.p2}%` }} title={`P2: ${fmtPct(activeDivision.pricePyramid.p2)}`} />
                              <div className="bg-rose-400" style={{ width: `${activeDivision.pricePyramid.p3}%` }} title={`P3: ${fmtPct(activeDivision.pricePyramid.p3)}`} />
                            </div>
                            <span className="text-[10px] text-[#28071C]/40 whitespace-nowrap">
                              {fmtPct(activeDivision.pricePyramid.p1)} · {fmtPct(activeDivision.pricePyramid.p2)} · {fmtPct(activeDivision.pricePyramid.p3)}
                            </span>
                          </div>
                        </Tooltip>
                        <Tooltip text="PMV alvo por faixa de preço desta divisão, definido no Módulo 3.">
                          <div className="px-4 py-2 cursor-default flex items-center gap-2">
                            {([
                              { tier: "P1", price: activeDivision.avgPriceP1, color: "text-blue-600" },
                              { tier: "P2", price: activeDivision.avgPriceP2, color: "text-violet-600" },
                              { tier: "P3", price: activeDivision.avgPriceP3, color: "text-rose-600" },
                            ]).map(({ tier, price, color }) => (
                              <span key={tier} className="flex items-center gap-1">
                                <span className={`text-[9px] font-bold ${color}`}>{tier}</span>
                                <span className="text-[10px] font-medium text-[#28071C]">{fmtCurrency(price)}</span>
                              </span>
                            ))}
                          </div>
                        </Tooltip>
                      </div>
                    </>
                  );
                })() : (
                  // Fallback: sem acesso ao plano macro ou plano não criado
                  <>
                    <div className="flex items-center justify-between px-4 py-2 bg-[#28071C]/3 border-b border-[#28071C]/8">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-[#7598CF]" />
                        <span className="text-xs font-bold text-[#28071C]/60 uppercase tracking-widest">
                          Referência de Divisão — {activeDivision.name}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-[#28071C]/8">
                      <Tooltip text="Receita total planejada para esta divisão no período.">
                        <div className="px-4 py-3 cursor-default">
                          <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">Meta de Receita <Info className="w-3 h-3 opacity-40" /></div>
                          <div className="text-lg font-bold text-[#28071C]">{fmtCurrency(activeDivision.revenueTarget)}</div>
                        </div>
                      </Tooltip>
                      <Tooltip text="Peso desta divisão no total de receita da marca.">
                        <div className="px-4 py-3 cursor-default">
                          <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">Participação <Info className="w-3 h-3 opacity-40" /></div>
                          <div className="text-lg font-bold text-[#28071C]">{fmtPct(activeDivision.participationPct)}</div>
                        </div>
                      </Tooltip>
                      <Tooltip text="Margem de contribuição alvo. O custo máximo dos produtos deve respeitar este percentual.">
                        <div className="px-4 py-3 cursor-default">
                          <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-1 flex items-center gap-1">Margem Alvo <Info className="w-3 h-3 opacity-40" /></div>
                          <div className="text-lg font-bold text-[#28071C]">{fmtPct(activeDivision.targetMarginPct)}</div>
                        </div>
                      </Tooltip>
                      <Tooltip text="Pirâmide de preços: proporção de receita por faixa P1 / P2 / P3.">
                        <div className="px-4 py-3 cursor-default">
                          <div className="text-[10px] text-[#28071C]/40 uppercase tracking-widest mb-2 flex items-center gap-1">Pirâmide P1/P2/P3 <Info className="w-3 h-3 opacity-40" /></div>
                          <div className="flex h-3 rounded overflow-hidden gap-px mb-1.5">
                            <div className="bg-blue-400" style={{ width: `${activeDivision.pricePyramid.p1}%` }} />
                            <div className="bg-violet-400" style={{ width: `${activeDivision.pricePyramid.p2}%` }} />
                            <div className="bg-rose-400" style={{ width: `${activeDivision.pricePyramid.p3}%` }} />
                          </div>
                          <div className="flex gap-2 text-[10px]">
                            <span className="text-blue-600 font-semibold">{fmtPct(activeDivision.pricePyramid.p1)}</span>
                            <span className="text-violet-600 font-semibold">{fmtPct(activeDivision.pricePyramid.p2)}</span>
                            <span className="text-rose-600 font-semibold">{fmtPct(activeDivision.pricePyramid.p3)}</span>
                          </div>
                        </div>
                      </Tooltip>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Orientação passo a passo ─────────────────────────────────── */}
            {activeDivision.collections.length === 0 && (
              <div className="bg-[#7598CF]/8 border border-[#7598CF]/25 rounded-2xl p-5 mb-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#7598CF] text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                <div>
                  <p className="font-semibold text-[#28071C] mb-1">Adicione as coleções desta divisão</p>
                  <p className="text-sm text-[#28071C]/60">
                    Clique em <strong>"Adicionar Coleção / Drop"</strong> abaixo para registrar cada coleção ou drop da temporada. Para cada uma, informe o nome e as datas de lançamento.
                  </p>
                </div>
              </div>
            )}
            {activeDivision.collections.length > 0 && totalPct < 100 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                <div>
                  <p className="font-semibold text-[#28071C] mb-1">Distribua a receita entre as coleções</p>
                  <p className="text-sm text-[#28071C]/60">
                    Em cada coleção, informe o <strong>Peso de Receita (%)</strong> — a proporção da meta total que esta coleção deve gerar. A soma de todas as coleções deve ser exatamente 100%.
                  </p>
                </div>
              </div>
            )}
            {totalPct >= 100 && !allDatesSet && (
              <div className="bg-[#7598CF]/8 border border-[#7598CF]/25 rounded-2xl p-5 mb-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#7598CF] text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                <div>
                  <p className="font-semibold text-[#28071C] mb-1">Confirme as datas de lançamento</p>
                  <p className="text-sm text-[#28071C]/60">
                    Preencha a data de cada <strong>entrada</strong> de produto em loja. Essas datas geram o calendário de compras e o plano de orçamento do Mix.
                  </p>
                </div>
              </div>
            )}

            {/* Revenue allocation bar */}
            <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <Tooltip text="Soma dos pesos de receita atribuídos a cada coleção. Deve fechar em 100% para avançar ao Mix.">
                  <span className="text-sm font-medium text-[#28071C] flex items-center gap-1 cursor-default">
                    Distribuição de Receita por Coleção <Info className="w-3.5 h-3.5 text-[#28071C]/30" />
                  </span>
                </Tooltip>
                <span
                  className={`text-sm font-medium ${
                    Math.abs(totalPct - 100) < 0.01
                      ? "text-emerald-600"
                      : "text-[#28071C]/50"
                  }`}
                >
                  {fmtPct(totalPct)} alocado &nbsp;·&nbsp;{" "}
                  {fmtPct(100 - totalPct)} restante
                </span>
              </div>
              <div className="h-3 bg-[#F2F2F2] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalPct > 100
                      ? "bg-red-500"
                      : Math.abs(totalPct - 100) < 0.01
                      ? "bg-emerald-500"
                      : "bg-[#7598CF]"
                  }`}
                  style={{ width: `${Math.min(totalPct, 100)}%` }}
                />
              </div>
              {Math.abs(totalPct - 100) > 0.01 && (
                <p className="flex items-center gap-1.5 mt-2 text-amber-600 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  A soma dos pesos deve fechar exatamente em 100%
                </p>
              )}
            </div>

            {/* Collection cards */}
            <div className="space-y-4 mb-5">
              {activeDivision.collections.map((col, colIdx) => {
                const revenue    = colRevenue(activeDivision, col);
                const color      = COLLECTION_COLORS[colIdx % COLLECTION_COLORS.length];
                const allDates   = col.entries.every(e => e.date);
                const hasOverlap = col.entries.some((e, i) => {
                  if (i === 0 || !e.date || !col.entries[i - 1].date) return false;
                  const prev = new Date(col.entries[i - 1].date + "T00:00:00");
                  const curr = new Date(e.date + "T00:00:00");
                  return curr.getTime() - prev.getTime() < 14 * 86400000;
                });
                // ── Regra de bloqueio: já tem produtos cadastrados no ERP ──────
                const isLocked = lockedCollectionNames.has(col.name);

                return (
                  <div
                    key={col.id}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden"
                  >
                    {/* color top stripe */}
                    <div className="h-1" style={{ backgroundColor: color }} />

                    <div className="p-5">

                      {/* Lock banner */}
                      {isLocked && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
                          <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <p className="text-amber-800 text-xs">
                            <strong>Produtos em produção</strong> — esta coleção já possui produtos cadastrados no ERP.
                            Apenas as datas de entrada podem ser alteradas (postergação de lançamento).
                          </p>
                        </div>
                      )}

                      {/* Row 1: name + type + entradas + weight + mix status + delete */}
                      <div className="flex flex-wrap items-end gap-4 mb-4">

                        {/* Name */}
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-xs text-[#28071C]/40 uppercase tracking-wide mb-1">
                            Nome
                          </label>
                          <input
                            type="text"
                            value={col.name}
                            disabled={isLocked}
                            onChange={e =>
                              updateCollection(activeDivision.id, col.id, {
                                name: e.target.value,
                              })
                            }
                            className={`w-full rounded-lg px-3 py-2 text-[#28071C] font-medium focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 ${
                              isLocked
                                ? "bg-[#28071C]/5 text-[#28071C]/50 cursor-not-allowed"
                                : "bg-[#F2F2F2]"
                            }`}
                          />
                        </div>

                        {/* Type */}
                        <div className="w-36">
                          <label className="block text-xs text-[#28071C]/40 uppercase tracking-wide mb-1">
                            Tipo
                          </label>
                          <select
                            value={col.type}
                            disabled={isLocked}
                            onChange={e => {
                              const type = e.target.value as CollectionType;
                              const upd: Partial<Collection> = { type };
                              if (type === "drop") {
                                upd.numEntradas = 1;
                                upd.entries = [
                                  {
                                    date: col.entries[0]?.date ?? "",
                                    label: "Entrada 1",
                                  },
                                ];
                              }
                              updateCollection(activeDivision.id, col.id, upd);
                            }}
                            className={`w-full rounded-lg px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 ${
                              isLocked
                                ? "bg-[#28071C]/5 text-[#28071C]/50 cursor-not-allowed"
                                : "bg-[#F2F2F2]"
                            }`}
                          >
                            <option value="colecao">Coleção</option>
                            <option value="drop">Drop</option>
                          </select>
                        </div>

                        {/* Num Entradas (only for coleção, locked when has products) */}
                        {col.type === "colecao" && (
                          <div className="w-28">
                            <label className="block text-xs text-[#28071C]/40 uppercase tracking-wide mb-1">
                              Entradas
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={6}
                              value={col.numEntradas}
                              disabled={isLocked}
                              onChange={e =>
                                changeNumEntradas(
                                  activeDivision.id,
                                  col.id,
                                  parseInt(e.target.value) || 1,
                                  col
                                )
                              }
                              className={`w-full rounded-lg px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 ${
                                isLocked
                                  ? "bg-[#28071C]/5 text-[#28071C]/50 cursor-not-allowed"
                                  : "bg-[#F2F2F2]"
                              }`}
                            />
                          </div>
                        )}

                        {/* Weight % + Revenue */}
                        <div className="w-52">
                          <label className="block text-xs text-[#28071C]/40 uppercase tracking-wide mb-1">
                            Peso da Receita (%)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={col.revenuePct}
                              disabled={isLocked}
                              onChange={e =>
                                updateCollection(activeDivision.id, col.id, {
                                  revenuePct: parseFloat(e.target.value) || 0,
                                })
                              }
                              className={`w-20 rounded-lg px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 ${
                                isLocked
                                  ? "bg-[#28071C]/5 text-[#28071C]/50 cursor-not-allowed"
                                  : "bg-[#F2F2F2]"
                              }`}
                            />
                            <span className="text-xs text-[#28071C]/60 whitespace-nowrap">
                              = {fmtCurrency(revenue)}
                            </span>
                          </div>
                        </div>

                        {/* Mix status + delete */}
                        <div className="flex items-center gap-3 ml-auto">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              col.mixStatus === "validado"
                                ? "bg-emerald-100 text-emerald-700"
                                : col.mixStatus === "em_andamento"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-[#F2F2F2] text-[#28071C]/40"
                            }`}
                          >
                            {col.mixStatus === "validado"
                              ? "✓ Mix validado"
                              : col.mixStatus === "em_andamento"
                              ? "Mix em andamento"
                              : "Mix não configurado"}
                          </span>
                          {isLocked ? (
                            <span
                              title="Não é possível excluir — há produtos em produção vinculados a esta coleção"
                              className="text-[#28071C]/20 cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                            </span>
                          ) : (
                            <button
                              onClick={() => deleteCollection(activeDivision.id, col.id)}
                              className="text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: entry dates — sempre editáveis (postergação de lançamento) */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {col.entries.map((entry, idx) => (
                          <div key={idx}>
                            <label className="flex items-center gap-1 text-xs text-[#28071C]/40 mb-1">
                              <Calendar className="w-3 h-3" />
                              {entry.label}
                              {isLocked && (
                                <span className="ml-1 text-[9px] text-amber-600 font-semibold uppercase tracking-wide">
                                  editável
                                </span>
                              )}
                            </label>
                            <input
                              type="date"
                              value={entry.date}
                              onChange={e =>
                                updateEntryDate(
                                  activeDivision.id,
                                  col.id,
                                  idx,
                                  e.target.value,
                                  col
                                )
                              }
                              className="w-full bg-[#F2F2F2] rounded-lg px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Alerts */}
                      {!allDates && (
                        <p className="flex items-center gap-1.5 mt-3 text-amber-600 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          Preencha todas as datas de lançamento
                        </p>
                      )}
                      {hasOverlap && (
                        <p className="flex items-center gap-1.5 mt-2 text-red-500 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          Atenção: intervalo menor que 14 dias entre entradas — risco de sobreposição logística e de comunicação
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add collection button */}
            <button
              onClick={() => openAddModal(activeDivision.id)}
              className="w-full py-4 border-2 border-dashed border-[#7598CF]/40 rounded-2xl text-[#7598CF] hover:border-[#7598CF] hover:bg-[#7598CF]/5 transition-all flex items-center justify-center gap-2 text-sm font-medium mb-8"
            >
              <Plus className="w-5 h-5" />
              Adicionar Coleção / Drop
            </button>

            {/* Timeline */}
            {timelineMonths.length > 0 && (
              <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
                <h3 className="text-sm font-medium text-[#28071C] mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Mapa de Coleções — {activeDivision.name}
                </h3>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: `${timelineMonths.length * 80}px` }}>
                    {/* Month headers */}
                    <div
                      className="grid mb-1"
                      style={{
                        gridTemplateColumns: `repeat(${timelineMonths.length}, 1fr)`,
                      }}
                    >
                      {timelineMonths.map(ym => (
                        <div
                          key={ym}
                          className="text-center text-xs text-[#28071C]/40 font-medium border-l border-[#28071C]/10 py-1 px-1"
                        >
                          {monthLabel(ym)}
                        </div>
                      ))}
                    </div>

                    {/* Collection bars */}
                    {activeDivision.collections.map((col, colIdx) => {
                      const color = COLLECTION_COLORS[colIdx % COLLECTION_COLORS.length];
                      return (
                        <div
                          key={col.id}
                          className="grid mb-1"
                          style={{
                            gridTemplateColumns: `repeat(${timelineMonths.length}, 1fr)`,
                          }}
                        >
                          {timelineMonths.map(ym => {
                            const hasEntry = col.entries.some(e =>
                              e.date.startsWith(ym)
                            );
                            return (
                              <div
                                key={ym}
                                className="h-8 border-l border-[#28071C]/5 relative"
                              >
                                {hasEntry && (
                                  <div
                                    className="absolute inset-y-1 inset-x-0.5 rounded text-xs text-white flex items-center justify-center overflow-hidden font-medium"
                                    style={{ backgroundColor: color }}
                                    title={col.name}
                                  >
                                    <span className="truncate px-1 text-[10px]">
                                      {col.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-[#28071C]/10">
                      {activeDivision.collections.map((col, colIdx) => (
                        <div
                          key={col.id}
                          className="flex items-center gap-1.5 text-xs text-[#28071C]/60"
                        >
                          <div
                            className="w-3 h-3 rounded flex-shrink-0"
                            style={{ backgroundColor: COLLECTION_COLORS[colIdx % COLLECTION_COLORS.length] }}
                          />
                          {col.name}
                          {col.entries.length > 0 && col.entries[0].date && (
                            <span className="opacity-60">
                              ({col.entries.map(e =>
                                e.date
                                  ? new Date(e.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
                                  : "–"
                              ).join(", ")})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CTA — Avançar para Mix */}
            <div className="flex items-center justify-between bg-white rounded-2xl p-5 shadow-sm">
              <div>
                {!sortimentValid ? (
                  <p className="flex items-center gap-2 text-sm text-[#28071C]/60">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    Aloque 100% da receita e preencha todas as datas para avançar
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Sortiment completo — pronto para configurar o Mix de Produtos
                  </p>
                )}
              </div>
              <button
                onClick={() => { if (sortimentValid) setActiveView("mix"); }}
                disabled={!sortimentValid}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all ${
                  sortimentValid
                    ? "bg-[#28071C] text-white hover:bg-[#28071C]/90"
                    : "bg-[#F2F2F2] text-[#28071C]/30 cursor-not-allowed"
                }`}
              >
                {!sortimentValid && <Lock className="w-4 h-4" />}
                Avançar para Mix de Produtos
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SUB-MÓDULO B — MIX DE PRODUTOS                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeView === "mix" && (
          <div>
            {allColsSorted.length === 0 ? (
              <div className="text-center py-24 text-[#28071C]/40">
                <Layers className="w-14 h-14 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">Nenhuma coleção configurada</p>
                <p className="text-sm mb-5">
                  Configure pelo menos uma coleção com data de lançamento no Sortiment.
                </p>
                <button
                  onClick={() => setActiveView("sortiment")}
                  className="text-[#7598CF] hover:underline text-sm"
                >
                  ← Ir para Sortiment
                </button>
              </div>
            ) : (
              <>
                {/* Collection selector tabs */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {allColsSorted.map(({ col, div }) => {
                    const active = (activeMixItem?.col.id ?? allColsSorted[0]?.col.id) === col.id;
                    return (
                      <button
                        key={col.id}
                        onClick={() => setActiveMixColId(col.id)}
                        className={`flex flex-col items-start px-4 py-2.5 rounded-xl text-sm transition-all border ${
                          active
                            ? "border-[#28071C] bg-[#28071C] text-white"
                            : "border-[#28071C]/20 bg-white text-[#28071C] hover:border-[#28071C]/50"
                        }`}
                      >
                        <span className="font-medium">{col.name}</span>
                        <span className={`text-xs ${active ? "opacity-60" : "opacity-50"}`}>
                          {div.name} ·{" "}
                          {col.entries[0]?.date
                            ? new Date(col.entries[0].date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
                            : "–"}
                          {col.mixStatus === "validado" && " ✓"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Content for active collection */}
                {activeMixItem && (() => {
                  const { col, div } = activeMixItem;
                  const rev    = colRevenue(div, col);
                  const catPct = sumCatPct(col.categories);

                  return (
                    <div>
                      {/* Collection targets */}
                      <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
                        <p className="text-[#28071C]/40 text-xs uppercase tracking-widest mb-3">
                          Referências desta coleção — {col.name} · {div.name}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <KpiTip label="Receita da Coleção" value={fmtCurrency(rev)}
                            tip="Receita que esta coleção deve gerar, calculada sobre a meta da divisão pelo peso atribuído no Sortiment." />
                          <KpiTip label="Peso na Divisão" value={fmtPct(col.revenuePct)}
                            tip="Percentual da receita total da divisão que esta coleção representa. Definido na aba Sortiment." />
                          <KpiTip label="Margem Alvo" value={fmtPct(div.targetMarginPct)}
                            tip="Margem de contribuição mínima definida pelo financeiro. O custo máximo de cada produto é calculado a partir dela." />
                          <KpiTip label="Lançamentos" value={
                            col.entries
                              .filter(e => e.date)
                              .map(e => fmtDateBR(e.date))
                              .join(" · ") || "—"
                          } small tip="Datas de entrada dos produtos em loja. Usadas para calcular o calendário de compras com antecedência de 90 dias." />
                        </div>
                      </div>

                      {/* Category allocation */}
                      <div className="bg-white rounded-2xl shadow-sm mb-5">
                        <div className="p-5 border-b border-[#28071C]/10 flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-[#28071C]">
                              Distribuição por Categoria
                            </h3>
                            <p className="text-xs text-[#28071C]/50 mt-0.5">
                              {catPct.toFixed(1)}% alocado · {(100 - catPct).toFixed(1)}% restante
                            </p>
                          </div>
                          <button
                            onClick={() => addCategoryToMix(div.id, col.id, col, div)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#7598CF] text-white rounded-lg text-sm hover:bg-[#7598CF]/90 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Categoria
                          </button>
                        </div>

                        {/* Allocation bar */}
                        <div className="px-5 pt-3">
                          <div className="h-2 bg-[#F2F2F2] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                catPct > 100
                                  ? "bg-red-500"
                                  : Math.abs(catPct - 100) < 0.01
                                  ? "bg-emerald-500"
                                  : "bg-[#7598CF]"
                              }`}
                              style={{ width: `${Math.min(catPct, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Category rows */}
                        <div className="divide-y divide-[#28071C]/5">
                          {col.categories.length === 0 && (
                            <div className="text-center py-10 text-[#28071C]/40 text-sm">
                              Nenhuma categoria adicionada. Clique em "Categoria" para começar.
                            </div>
                          )}

                          {col.categories.map(cat => {
                            const cRev       = catRevenue(rev, cat);
                            const layers     = col.tierLayers[cat.id] ?? [];
                            const layerPct   = sumTierPct(layers);
                            const isExpanded = expandedCats.has(cat.id);
                            const catVol     = layers.reduce(
                              (s, l) => s + calcVolume(tierRev(cRev, l), l.avgPrice), 0
                            );
                            const catInvest  = layers.reduce(
                              (s, l) => s + calcVolume(tierRev(cRev, l), l.avgPrice) * calcMaxCost(l.avgPrice, div.targetMarginPct), 0
                            );

                            return (
                              <div key={cat.id}>
                                {/* Category row */}
                                <div className="px-5 py-4 flex flex-wrap items-center gap-4">
                                  <select
                                    value={cat.category}
                                    onChange={e =>
                                      updateCategoryField(div.id, col.id, cat.id, "category", e.target.value, col)
                                    }
                                    className="bg-[#F2F2F2] rounded-lg px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 w-40"
                                  >
                                    {CATEGORIES.map(c => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>

                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.5}
                                      value={cat.participationPct}
                                      onChange={e =>
                                        updateCategoryField(div.id, col.id, cat.id, "participationPct", parseFloat(e.target.value) || 0, col)
                                      }
                                      className="w-20 bg-[#F2F2F2] rounded-lg px-3 py-2 text-[#28071C] text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                                    />
                                    <span className="text-sm text-[#28071C]/50">%</span>
                                    <span className="text-sm text-[#28071C]/70 font-medium">
                                      {fmtCurrency(cRev)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-5 ml-auto">
                                    <div className="text-center">
                                      <div className="text-xs text-[#28071C]/40">Peças</div>
                                      <div className="text-sm font-semibold text-[#28071C]">
                                        {fmtNum(catVol)}
                                      </div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xs text-[#28071C]/40">Invest. máx.</div>
                                      <div className="text-sm font-semibold text-[#28071C]">
                                        {catInvest > 0 ? fmtCurrency(catInvest) : "—"}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        const next = new Set(expandedCats);
                                        isExpanded ? next.delete(cat.id) : next.add(cat.id);
                                        setExpandedCats(next);
                                      }}
                                      className="flex items-center gap-1 text-[#7598CF] text-xs hover:text-[#7598CF]/80"
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="w-4 h-4" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                      P1/P2/P3
                                    </button>
                                    <button
                                      onClick={() =>
                                        removeCategoryFromMix(div.id, col.id, cat.id, col)
                                      }
                                      className="text-red-400 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* P1/P2/P3 architecture (expanded) */}
                                {isExpanded && (
                                  <div className="px-5 pb-4 bg-[#F8F8FC]">
                                    {Math.abs(layerPct - 100) > 0.01 && (
                                      <p className="flex items-center gap-1.5 mb-2 text-amber-600 text-xs pt-3">
                                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                        Soma das faixas: {layerPct.toFixed(0)}% — deve ser 100%
                                      </p>
                                    )}
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm mt-3">
                                        <thead>
                                          <tr className="border-b border-[#28071C]/10">
                                            {["Faixa","% Categoria","Receita","PMV (R$)","Volume","Custo máx.","Perfil"].map(h => (
                                              <th key={h} className="text-left text-[#28071C]/40 text-xs py-2 pr-4 font-medium whitespace-nowrap">
                                                {h}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {layers.map(layer => {
                                            const tRev  = tierRev(cRev, layer);
                                            const vol   = calcVolume(tRev, layer.avgPrice);
                                            const cost  = calcMaxCost(layer.avgPrice, div.targetMarginPct);
                                            const tgt   = layer.tier === "P1" ? div.pricePyramid.p1 : layer.tier === "P2" ? div.pricePyramid.p2 : div.pricePyramid.p3;
                                            const delta = layer.tierPct - tgt;
                                            const deviationClass =
                                              Math.abs(delta) > 5
                                                ? "text-red-500"
                                                : Math.abs(delta) > 2
                                                ? "text-amber-500"
                                                : "text-emerald-500";

                                            return (
                                              <tr key={layer.tier} className="border-b border-[#28071C]/5">
                                                <td className="py-2.5 pr-4">
                                                  <span
                                                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                      layer.tier === "P1"
                                                        ? "bg-blue-100 text-blue-700"
                                                        : layer.tier === "P2"
                                                        ? "bg-violet-100 text-violet-700"
                                                        : "bg-rose-100 text-rose-700"
                                                    }`}
                                                  >
                                                    {layer.tier}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 pr-4">
                                                  <div className="flex items-center gap-1">
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      max={100}
                                                      step={1}
                                                      value={layer.tierPct}
                                                      onChange={e =>
                                                        updateTierLayer(div.id, col.id, cat.id, layer.tier, "tierPct", parseFloat(e.target.value) || 0, col)
                                                      }
                                                      className="w-14 bg-white border border-[#28071C]/10 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50 text-xs"
                                                    />
                                                    <span className="text-xs text-[#28071C]/40">%</span>
                                                    <span className={`text-xs ml-1 ${deviationClass}`} title={`Meta Módulo 3: ${tgt}%`}>
                                                      ({delta > 0 ? "+" : ""}{delta.toFixed(0)}pp)
                                                    </span>
                                                  </div>
                                                </td>
                                                <td className="py-2.5 pr-4 text-[#28071C]/60 text-xs whitespace-nowrap">
                                                  {fmtCurrency(tRev)}
                                                </td>
                                                <td className="py-2.5 pr-4">
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-xs text-[#28071C]/40">R$</span>
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      step={1}
                                                      value={layer.avgPrice}
                                                      onChange={e =>
                                                        updateTierLayer(div.id, col.id, cat.id, layer.tier, "avgPrice", parseFloat(e.target.value) || 0, col)
                                                      }
                                                      className="w-20 bg-white border border-[#28071C]/10 rounded px-2 py-1 text-[#28071C] focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50 text-xs"
                                                    />
                                                  </div>
                                                </td>
                                                <td className="py-2.5 pr-4 text-[#28071C] font-semibold text-xs">
                                                  {fmtNum(vol)} pç
                                                </td>
                                                <td className="py-2.5 pr-4 text-[#28071C]/60 text-xs whitespace-nowrap">
                                                  {layer.avgPrice > 0
                                                    ? fmtCurrency(cost)
                                                    : "—"}
                                                </td>
                                                <td className="py-2.5">
                                                  <select
                                                    value={layer.profile}
                                                    onChange={e =>
                                                      updateTierLayer(div.id, col.id, cat.id, layer.tier, "profile", e.target.value, col)
                                                    }
                                                    className="bg-white border border-[#28071C]/10 rounded px-2 py-1 text-[#28071C] text-xs focus:outline-none focus:ring-1 focus:ring-[#7598CF]/50"
                                                  >
                                                    {PROFILES.map(p => (
                                                      <option key={p} value={p}>
                                                        {p}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pyramid traffic light */}
                      {pyramidDeviation && (
                        <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
                          <h3 className="font-semibold text-[#28071C] mb-3 flex items-center gap-2">
                            <BarChart2 className="w-4 h-4" />
                            Validação da Pirâmide de Preços
                          </h3>
                          <div className="grid grid-cols-3 gap-4">
                            {(["P1", "P2", "P3"] as PriceTier[]).map(tier => {
                              const d = pyramidDeviation[tier];
                              const isRed    = Math.abs(d.delta) > 5;
                              const isAmber  = !isRed && Math.abs(d.delta) > 2;
                              const color    = isRed ? "red" : isAmber ? "amber" : "emerald";
                              return (
                                <div
                                  key={tier}
                                  className={`rounded-xl p-4 border ${
                                    color === "red"
                                      ? "border-red-200 bg-red-50"
                                      : color === "amber"
                                      ? "border-amber-200 bg-amber-50"
                                      : "border-emerald-200 bg-emerald-50"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span
                                      className={`font-bold text-xs px-2 py-0.5 rounded ${
                                        tier === "P1"
                                          ? "bg-blue-100 text-blue-700"
                                          : tier === "P2"
                                          ? "bg-violet-100 text-violet-700"
                                          : "bg-rose-100 text-rose-700"
                                      }`}
                                    >
                                      {tier}
                                    </span>
                                    {color === "emerald" ? (
                                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                      <AlertTriangle className={`w-4 h-4 ${color === "red" ? "text-red-500" : "text-amber-500"}`} />
                                    )}
                                  </div>
                                  <div className="text-xl font-bold text-[#28071C]">
                                    {d.actual.toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-[#28071C]/60 mt-0.5">
                                    Meta: {d.target}% · Δ {d.delta > 0 ? "+" : ""}{d.delta.toFixed(1)}pp
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="flex items-center gap-1.5 mt-3 text-xs text-[#28071C]/40">
                            <Info className="w-3.5 h-3.5 flex-shrink-0" />
                            Desvio acima de 5pp = alerta. O sistema nunca bloqueia por desvio de pirâmide — a decisão final é do estilo.
                          </p>
                        </div>
                      )}

                      {/* Budget projection */}
                      {budgetProjection.length > 0 && (
                        <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
                          <h3 className="font-semibold text-[#28071C] mb-1 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Projeção de Orçamento por Mês
                          </h3>
                          <p className="text-xs text-[#28071C]/40 mb-4">
                            Lead time estimado: 90 dias &nbsp;·&nbsp; Pagamento: 30% no pedido · 40% na entrega · 30% em 30 dias após entrega
                          </p>
                          <div className="overflow-x-auto">
                            <div className="flex gap-3 pb-1">
                              {(() => {
                                const maxCostVal = Math.max(...budgetProjection.map(b => b.cost), 1);
                                return budgetProjection.map(({ month, cost }) => (
                                  <div
                                    key={month}
                                    className="flex-shrink-0 bg-[#F2F2F2] rounded-xl p-4 min-w-[110px]"
                                  >
                                    <div className="text-xs text-[#28071C]/50 mb-1">
                                      {monthLabel(month)}
                                    </div>
                                    <div className="text-sm font-semibold text-[#28071C]">
                                      {fmtCurrency(cost)}
                                    </div>
                                    <div className="h-1.5 bg-[#28071C]/10 rounded-full mt-2 overflow-hidden">
                                      <div
                                        className="h-full bg-[#7598CF] rounded-full"
                                        style={{ width: `${(cost / maxCostVal) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                          <p className="flex items-center gap-1.5 mt-3 text-xs text-amber-600">
                            <Info className="w-3.5 h-3.5 flex-shrink-0" />
                            Estimativa com base no custo-meta. Revisada quando o PLM retornar fornecedores e condições de pagamento reais.
                          </p>
                        </div>
                      )}

                      {/* Mix summary */}
                      {mixSummary && mixSummary.totalPieces > 0 && (
                        <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
                          <h3 className="font-semibold text-[#28071C] mb-4">Resumo do Mix</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-[#F2F2F2] rounded-xl p-4">
                              <div className="text-xs text-[#28071C]/50 mb-1">Total de Peças</div>
                              <div className="text-xl font-bold text-[#28071C]">
                                {fmtNum(mixSummary.totalPieces)}
                              </div>
                            </div>
                            <div className="bg-[#F2F2F2] rounded-xl p-4">
                              <div className="text-xs text-[#28071C]/50 mb-1">SKUs Estimados</div>
                              <div className="text-xl font-bold text-[#28071C]">
                                {fmtNum(mixSummary.estimatedSkus)}
                              </div>
                              <div className="text-xs text-[#28071C]/30 mt-0.5">base: 12 pç/SKU</div>
                            </div>
                            <div className="bg-[#F2F2F2] rounded-xl p-4">
                              <div className="text-xs text-[#28071C]/50 mb-1">Investimento Máximo</div>
                              <div className="text-xl font-bold text-[#28071C]">
                                {fmtCurrency(mixSummary.totalInvestment)}
                              </div>
                              <div className="text-xs text-[#28071C]/30 mt-0.5">custo-meta × volume</div>
                            </div>
                            <div className="bg-[#F2F2F2] rounded-xl p-4">
                              <div className="text-xs text-[#28071C]/50 mb-1">Margem Alvo</div>
                              <div className="text-xl font-bold text-[#28071C]">
                                {div.targetMarginPct}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl p-5 shadow-sm">
                        <p className="flex items-center gap-1.5 text-xs text-[#28071C]/40">
                          <Info className="w-3.5 h-3.5 flex-shrink-0" />
                          Integração PLM — quando dados de fornecedor forem importados, o sistema revisará custo e margem automaticamente
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => alert("Exportar Briefing — geração de PDF em desenvolvimento")}
                            className="flex items-center gap-2 px-5 py-2.5 border border-[#28071C]/20 rounded-xl text-sm text-[#28071C] hover:bg-[#28071C]/5 transition-colors"
                          >
                            <FileText className="w-4 h-4" />
                            Exportar Briefing
                          </button>
                          <button
                            onClick={() => validateMix(div.id, col.id, col)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                              col.mixStatus === "validado"
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-[#28071C] text-white hover:bg-[#28071C]/90"
                            }`}
                          >
                            {col.mixStatus === "validado" ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                Mix Validado
                              </>
                            ) : (
                              "Validar Mix"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </main>

      {/* ── MODAL: Adicionar Coleção / Drop ──────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[9100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !modalSaving && setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">

            {/* Header */}
            <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-[#F6F3AA]" />
                <span className="text-white font-semibold">
                  Adicionar Coleção / Drop
                </span>
              </div>
              <button
                onClick={() => !modalSaving && setShowAddModal(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5">

              {/* Row 1: Temporada + Tipo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                    Temporada
                  </label>
                  {temporadas.length > 0 ? (
                    <select
                      value={modalSeasonId}
                      onChange={e => setModalSeasonId(e.target.value)}
                      className="w-full bg-white rounded-lg px-4 py-2.5 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                    >
                      <option value="">Selecione…</option>
                      {temporadas.map(t => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[#28071C]/40 text-sm py-2.5 italic">
                      Nenhuma temporada cadastrada em Configurações
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                    Tipo
                  </label>
                  <select
                    value={modalTipo}
                    onChange={e => setModalTipo(e.target.value as CollectionType)}
                    className="w-full bg-white rounded-lg px-4 py-2.5 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                  >
                    <option value="colecao">Coleção</option>
                    <option value="drop">Drop</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Nome */}
              <div>
                <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                  Nome da Coleção / Drop
                </label>
                <input
                  type="text"
                  value={modalNome}
                  onChange={e => setModalNome(e.target.value)}
                  placeholder="Ex: Drop 1 · Alto Inverno · Cápsula Verão"
                  autoFocus
                  className="w-full bg-white rounded-lg px-4 py-2.5 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50"
                />
              </div>

              {/* Row 3: Datas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    value={modalInicio}
                    onChange={e => setModalInicio(e.target.value)}
                    className="w-full bg-white rounded-lg px-4 py-2.5 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                    Data de Fim
                  </label>
                  <input
                    type="date"
                    value={modalFim}
                    onChange={e => setModalFim(e.target.value)}
                    className="w-full bg-white rounded-lg px-4 py-2.5 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer"
                  />
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                <p className="text-[#28071C]/60 text-xs">
                  Esta coleção será vinculada ao cadastro de produtos (campo <strong>collection_name</strong>) e ficará disponível em Configurações de Operação.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex items-center justify-between">
              <button
                onClick={() => setShowAddModal(false)}
                disabled={modalSaving}
                className="px-5 py-2.5 border-2 border-[#28071C]/20 text-[#28071C]/60 rounded-xl hover:bg-gray-50 transition-all text-sm font-semibold disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveColecaoModal}
                disabled={modalSaving || !modalNome.trim() || !modalInicio || !modalFim}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 transition-all shadow-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {modalSaving ? "Salvando…" : "Adicionar Coleção"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Salvar Simulação como Cenário ─────────────────────────────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[9200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSaveModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bookmark className="w-5 h-5 text-[#F6F3AA]" />
                <span className="text-white font-semibold">Salvar Simulação</span>
              </div>
              <button onClick={() => setShowSaveModal(false)} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <p className="text-[#28071C]/60 text-sm">
                Dê um nome a este cenário para consultá-lo depois sem perder o plano atual.
              </p>
              <div>
                <label className="block text-[#28071C]/70 text-xs uppercase tracking-wide mb-2">
                  Nome do Cenário
                </label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={e => setScenarioName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveScenario()}
                  placeholder="Ex.: Cenário Conservador, Revisão Abril…"
                  autoFocus
                  className="w-full border-2 border-[#28071C]/20 rounded-xl px-4 py-2.5 text-[#28071C] focus:outline-none focus:border-[#7598CF] text-sm"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-between">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-5 py-2.5 border-2 border-[#28071C]/20 text-[#28071C]/60 rounded-xl hover:bg-gray-50 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={saveScenario}
                disabled={!scenarioName.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 shadow-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAINEL: Cenários Salvos ───────────────────────────────────────────── */}
      {showScenarioPanel && (
        <div className="fixed inset-0 z-[9200] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowScenarioPanel(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitCompare className="w-5 h-5 text-[#F6F3AA]" />
                <span className="text-white font-semibold">Cenários Salvos</span>
              </div>
              <button onClick={() => setShowScenarioPanel(false)} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              {scenarios.length === 0 ? (
                <div className="text-center py-10">
                  <Bookmark className="w-10 h-10 text-[#28071C]/15 mx-auto mb-3" />
                  <p className="text-[#28071C]/40 text-sm">Nenhum cenário salvo ainda.</p>
                  <p className="text-[#28071C]/30 text-xs mt-1">
                    Use "Salvar Simulação" para guardar o plano atual.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scenarios.map(scen => (
                    <div
                      key={scen.id}
                      className="flex items-center justify-between gap-3 border border-[#28071C]/10 rounded-xl px-4 py-3 hover:bg-[#28071C]/3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#28071C] text-sm truncate">{scen.name}</p>
                        <p className="text-[#28071C]/40 text-xs mt-0.5">
                          Salvo em {new Date(scen.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setCompareScenarioId(scen.id); setShowScenarioPanel(false); setShowCompareModal(true); }}
                          className="px-3 py-1.5 text-xs font-medium text-[#7598CF] border border-[#7598CF]/30 rounded-lg hover:bg-[#7598CF]/5 transition-all"
                        >
                          Comparar
                        </button>
                        <button
                          onClick={() => loadScenario(scen)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-[#28071C] rounded-lg hover:bg-[#28071C]/80 transition-all"
                        >
                          Carregar
                        </button>
                        <button
                          onClick={() => deleteScenario(scen.id)}
                          className="p-1.5 text-[#28071C]/30 hover:text-red-500 transition-colors"
                          title="Excluir cenário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 pb-5 border-t border-[#28071C]/8 pt-4">
              <button
                onClick={() => { setShowScenarioPanel(false); setShowSaveModal(true); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-[#28071C]/20 text-[#28071C]/50 rounded-xl hover:border-[#7598CF]/40 hover:text-[#7598CF] transition-all text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Salvar simulação atual como novo cenário
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Comparar Cenários ─────────────────────────────────────────── */}
      {showCompareModal && (() => {
        const compareTo = scenarios.find(s => s.id === compareScenarioId);
        if (!compareTo) return null;
        return (
          <div className="fixed inset-0 z-[9200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompareModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
              <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitCompare className="w-5 h-5 text-[#F6F3AA]" />
                  <span className="text-white font-semibold">
                    Comparar: Plano Atual vs. {compareTo.name}
                  </span>
                </div>
                <button onClick={() => setShowCompareModal(false)} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
                {/* Header row */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-xs text-[#28071C]/40 uppercase tracking-widest font-semibold">Divisão</div>
                  <div className="text-xs text-[#28071C]/40 uppercase tracking-widest font-semibold text-center">Plano Atual</div>
                  <div className="text-xs text-[#28071C]/40 uppercase tracking-widest font-semibold text-center">
                    {compareTo.name}
                    <span className="block text-[10px] normal-case font-normal mt-0.5 text-[#28071C]/30">
                      {new Date(compareTo.savedAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {divisions.map(div => {
                    const scenDiv = compareTo.data.find(d => d.id === div.id);
                    const currCols = div.collections.length;
                    const scenCols = scenDiv?.collections.length ?? "—";
                    const currPcts = div.collections.map(c => `${fmtPct(c.revenuePct)}`).join(", ") || "—";
                    const scenPcts = scenDiv?.collections.map(c => `${fmtPct(c.revenuePct)}`).join(", ") || "—";
                    const changed = currCols !== scenCols || currPcts !== scenPcts;
                    return (
                      <div
                        key={div.id}
                        className={`grid grid-cols-3 gap-4 p-4 rounded-xl border ${changed ? "border-[#F6F3AA]/60 bg-[#F6F3AA]/10" : "border-[#28071C]/8 bg-gray-50"}`}
                      >
                        <div>
                          <p className="font-semibold text-[#28071C] text-sm">{div.name}</p>
                          <p className="text-[#28071C]/40 text-xs">{fmtCurrency(div.revenueTarget)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-[#28071C]">{currCols} coleções</p>
                          <p className="text-xs text-[#28071C]/50 mt-0.5">{currPcts}</p>
                        </div>
                        <div className="text-center">
                          <p className={`text-sm font-medium ${changed ? "text-amber-600" : "text-[#28071C]"}`}>{scenCols} coleções</p>
                          <p className="text-xs text-[#28071C]/50 mt-0.5">{scenPcts}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {divisions.some(div => {
                  const scenDiv = compareTo.data.find(d => d.id === div.id);
                  return div.collections.length !== scenDiv?.collections.length ||
                    div.collections.map(c => fmtPct(c.revenuePct)).join() !== scenDiv?.collections.map(c => fmtPct(c.revenuePct)).join();
                }) && (
                  <div className="mt-4 flex items-center gap-2 bg-[#F6F3AA]/20 border border-[#F6F3AA]/40 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-[#28071C]/70">
                      Linhas marcadas indicam diferenças entre os cenários.
                    </p>
                  </div>
                )}
              </div>
              <div className="px-6 pb-5 border-t border-[#28071C]/8 pt-4 flex items-center justify-between">
                <button
                  onClick={() => { setShowCompareModal(false); setShowScenarioPanel(true); }}
                  className="px-4 py-2 text-sm text-[#28071C]/50 hover:text-[#28071C] transition-colors"
                >
                  ← Voltar aos Cenários
                </button>
                <button
                  onClick={() => loadScenario(compareTo)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 text-sm font-semibold"
                >
                  Carregar este cenário
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ─── SUBCOMPONENT — KPI card ──────────────────────────────────────────────────

function Kpi({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[#28071C]/40 mb-1">{label}</div>
      <div className={`font-semibold text-[#28071C] ${small ? "text-sm" : "text-lg"}`}>
        {value}
      </div>
    </div>
  );
}

// ─── SUBCOMPONENT — KPI card with Tooltip ────────────────────────────────────

function KpiTip({
  label,
  value,
  tip,
  small = false,
}: {
  label: string;
  value: string;
  tip: string;
  small?: boolean;
}) {
  return (
    <Tooltip text={tip}>
      <div className="cursor-default">
        <div className="text-xs text-[#28071C]/40 mb-1 flex items-center gap-1">
          {label}
          <Info className="w-3 h-3 text-[#28071C]/20 inline-block" />
        </div>
        <div className={`font-semibold text-[#28071C] ${small ? "text-sm" : "text-lg"}`}>
          {value}
        </div>
      </div>
    </Tooltip>
  );
}

// ─── SUBCOMPONENT — Tooltip ───────────────────────────────────────────────────

function Tooltip({
  text,
  children,
  side = "bottom",
}: {
  text: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => setShow(true), 2000);
  };
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show && (
        <div
          className={`absolute z-[9000] ${
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          } left-1/2 -translate-x-1/2 w-60 bg-[#28071C] text-white text-xs rounded-xl px-3 py-2.5 shadow-xl pointer-events-none leading-relaxed whitespace-normal`}
        >
          {text}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent ${
              side === "bottom"
                ? "bottom-full border-b-[#28071C]"
                : "top-full border-t-[#28071C]"
            }`}
          />
        </div>
      )}
    </div>
  );
}

// ─── SUBCOMPONENT — HeaderTooltip (fixed, não clipado pelo header sticky) ────
//
// Usa getBoundingClientRect() + position:fixed para renderizar o balão por
// CIMA da camada do header, garantindo visibilidade independente de z-index ou
// overflow do pai.

function HeaderTooltip({ text, children }: { text: string; children: ReactNode }) {
  const [show, setShow]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0 });
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef           = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      if (wrapRef.current) {
        const r = wrapRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
      }
      setShow(true);
    }, 2000);
  };

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <>
      <div ref={wrapRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {children}
      </div>
      {show && (
        <div
          style={{
            position: "fixed",
            top:       pos.top,
            left:      pos.left,
            transform: "translateX(-50%)",
            zIndex:    99999,
          }}
          className="w-64 bg-[#28071C] text-white text-xs rounded-xl px-3 py-2.5 shadow-2xl pointer-events-none leading-relaxed whitespace-normal"
        >
          {/* seta apontando para cima */}
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-b-[#28071C]"
          />
          {text}
        </div>
      )}
    </>
  );
}
