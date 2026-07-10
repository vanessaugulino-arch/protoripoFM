import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Calendar,
  Clock,
  Truck,
  ArrowRight,
  Edit,
  Trash2,
  Save,
  Layers,
  Lock,
  AlertCircle,
  Tag,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
  X,
  Info,
  Plus,
  ChevronDown,
  HelpCircle,
  Package,
  ShoppingCart,
  Store,
  BarChart3,
  TrendingUp,
  History,
  Palette,
  Search,
  RefreshCw,
  Shuffle,
  BookOpen,
  CheckSquare,
  Square,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  getOperationSettings,
  saveOperationSettings,
  saveTierLabels,
  saveFaixasCategoria,
  type TierLabel,
  type FaixaCategoria,
} from "../../services/supabase/operationSettingsService";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import ImportWizard from "../components/ImportWizard";
import { ColorBankCard } from "../components/ColorBankCard";
import { HierarchyConceptSlides } from "../components/HierarchyConceptSlides";
import {
  fetchHierarchyPaths,
  fetchHierDistinct,
  searchProductsForMigration,
  migrateProducts as migrateProductsDb,
  importHierarchyRows,
  saveHierLabels,
  DEFAULT_HIER_LABELS,
  type HierLabels,
  type HierarchyPath,
  type ProductForMigration,
  type HierDistinct,
} from "../../services/supabase/productHierarchyService";
import type { ImportDataType, ImportResult } from "../../services/importService";
import { IMPORT_CONFIG } from "../../services/importService";
import {
  type Temporada,
  type TemporadaRegraDefault,
  MONTHS as MONTHS_SVC,
  isTemporadaPast,
} from "../../services/temporadaService";
import {
  listSeasonsDb,
  insertSeasonDb,
  updateSeasonDb,
  deleteSeasonDb,
  getRegraDefaultDb,
  saveRegraDefaultDb,
  listCanalConfigDb,
  upsertCanalConfigDb,
  deleteCanalConfigDb,
  type CanalConfig,
} from "../../services/supabase/seasonService";

// Canais configuráveis (início antes do varejo de referência)
const CANAIS_B2B: { id: string; name: string }[] = [
  { id: "atacado",         name: "Atacado" },
  { id: "multimarca",      name: "Multimarca" },
  { id: "franquia",        name: "Franquia" },
  { id: "popup",           name: "Pop-up" },
  { id: "marketplace",     name: "Marketplace" },
  { id: "social_commerce", name: "Social Commerce" },
];

const OPERATION_SETTINGS_TOUR: TourStep[] = [
  {
    targetId: "tour-op-intro",
    title: "Configurações de Operação",
    content: "Esta tela centraliza os parâmetros que estruturam as análises e a automação do Fashion Mind. Aqui você estabelece as regras de negócio da empresa antes de iniciar o planejamento.",
  },
  {
    targetId: "tour-op-temporadas",
    title: "Temporadas de Coleções",
    content: "Defina os períodos fixos de cada temporada da marca. Uma vez criada, a temporada não pode ser alterada — ela serve como âncora temporal para toda a curva de vendas.",
  },
  {
    targetId: "tour-op-colecoes",
    title: "Coleções e Drops",
    content: "Dentro de cada temporada, cadastre os drops e coleções com suas datas exatas. As datas podem ser ajustadas a qualquer momento para refletir reagendamentos de produção.",
  },
  {
    targetId: "tour-op-faixas",
    title: "Faixas de Preço por Categoria",
    content: "Estabeleça os intervalos de preço por grupo e categoria. Essas faixas alimentam a pirâmide de preços no planejamento por divisão.",
  },
  {
    targetId: "tour-op-importacao",
    title: "Importação de Planilhas",
    content: "Caso não possua integração total com o ERP, importe o catálogo completo via planilha ou apenas os dados de hierarquia mercadológica, cruzados pelo código SKU do produto.",
  },
  {
    targetId: "tour-op-hierarquia",
    title: "Hierarquia de Produtos",
    content: "Cadastre a árvore de divisões, grupos, categorias e subcategorias da marca. Essa estrutura é usada em todo o planejamento e na importação de dados.",
  },
  {
    targetId: "tour-op-leadtimes",
    title: "Lead Times de Suprimento",
    content: "Configure os prazos de suprimento por grupo, categoria e nível de risco — seja por produção ou compra. O sistema usa esses lead times para calcular datas de entrada de mercadoria e alertar gaps de prazo.",
  },
  {
    targetId: "tour-op-basicos",
    title: "Cadastro de Básicos",
    content: "Básicos são um subgrupo dos Sustentadores de Margem — produtos que nunca mudam em estrutura, cor ou atributo. Cadastre os SKUs desses produtos para que o sistema os trate de forma diferenciada no planejamento.",
  },
  {
    targetId: "tour-op-banco-cores",
    title: "Banco de Cores",
    content: "Classifique as cores dos seus produtos por família (Azul, Verde…) e intensidade (Marinho, Claro…). O sistema guarda no banco global — cores já classificadas por outros clientes aparecem preenchidas automaticamente.",
  },
];

interface UserData {
  name: string;
  email: string;
  profile: string;
  system_role?: string;
  tenant_id: string;
}

// Temporada interface e helpers importados de temporadaService

// ─── Coleções / Drops ─────────────────────────────────────────────────────────
// Podem ser editadas a qualquer momento
interface Colecao {
  id: number;
  temporadaId: string; // uuid da season no Supabase
  nome: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string;    // YYYY-MM-DD
}

// FaixaCategoria (P1/P2/P3 por grupo/categoria) importada do serviço
// FaixaPreco é alias para compatibilidade interna
type FaixaPreco = FaixaCategoria;

// ─── Faixas import history ────────────────────────────────────────────────────
const FAIXAS_IMPORT_HISTORY_KEY = 'fm_faixas_import_history_v1';
interface FaixasImportEntry {
  id: string;
  timestamp: string; // ISO
  fileName: string;
  rows: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
// months re-exportado do serviço para uso nos formulários locais
const months = MONTHS_SVC;
const grupos               = ["Vestuário", "Acessórios", "Calçados", "Joias"];
const categorias           = ["Blusas", "Vestidos", "Calças", "Saias", "Jaquetas"];
const SUBCATEGORIAS_DEFAULT = ["Casual", "Formal", "Esportivo", "Festa"];

// ─── Hierarquia estruturada ───────────────────────────────────────────────────
export interface HierNode { id: string; label: string; children: HierNode[] }
const HIER_STRUCT_KEY = 'fashionmind_hierarchy_struct'
const LEVEL_LABELS = ['Divisão', 'Grupo', 'Categoria', 'Subcategoria']

// ─── Importação de Planilhas ─────────────────────────────────────────────────
type ImportMode = "completa" | "hierarquia";
type ImportStep = "select" | "upload" | "mapping" | "done";

interface SystemField {
  key: string;
  label: string;
  required: boolean;
}

const SYSTEM_FIELDS_COMPLETA: SystemField[] = [
  { key: "sku",         label: "Código do Produto (SKU)",   required: true  },
  { key: "name",        label: "Descrição / Nome",           required: true  },
  { key: "division",    label: "Divisão",                    required: false },
  { key: "group",       label: "Grupo / Categoria",          required: false },
  { key: "category",    label: "Subcategoria",               required: false },
  { key: "salePrice",   label: "Preço de Venda",             required: true  },
  { key: "cost",        label: "Custo",                      required: true  },
  { key: "color",       label: "Cor",                        required: false },
  { key: "season",      label: "Temporada / Coleção",        required: false },
];

const SYSTEM_FIELDS_HIERARQUIA: SystemField[] = [
  { key: "sku",        label: "Código do Produto (chave de join)", required: true  },
  { key: "hierLevel1", label: "Nível Hierárquico 1",               required: true  },
  { key: "hierLevel2", label: "Nível Hierárquico 2",               required: false },
  { key: "hierLevel3", label: "Nível Hierárquico 3",               required: false },
  { key: "hierLevel4", label: "Nível Hierárquico 4",               required: false },
];

const COLECOES_KEY = "fashionmind_colecoes";

// ─── Componente recursivo da árvore de hierarquia ────────────────────────────
function HierNodeRow({
  node, depth, expanded, onToggle,
  editId, editLabel, onEditStart, onEditChange, onEditSave, onEditCancel,
  addTarget, addLabel, onAddStart, onAddChange, onAddConfirm, onAddCancel,
  onDelete, levelLabels, isLast,
}: {
  node: HierNode; depth: number;
  expanded: Set<string>; onToggle: (id: string) => void;
  editId: string | null; editLabel: string;
  onEditStart: (id: string, label: string) => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  addTarget: string | null; addLabel: string;
  onAddStart: (id: string) => void;
  onAddChange: (v: string) => void;
  onAddConfirm: (parentId: string | null) => void;
  onAddCancel: () => void;
  onDelete: (id: string) => void;
  levelLabels: string[];
  isLast: boolean;
}) {
  const isExpanded = expanded.has(node.id);
  const isEditing  = editId === node.id;
  const isAdding   = addTarget === node.id;
  const childLevel = Math.min(depth + 1, levelLabels.length - 1);
  const canAddChild = depth < levelLabels.length - 1;

  return (
    <div className={`${isLast ? '' : 'border-b border-[#28071C]/6'}`}>
      {/* Row */}
      <div className={`flex items-center gap-2 px-4 py-2.5 hover:bg-[#28071C]/3 transition-colors`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}>
        {/* Expand/collapse */}
        {node.children.length > 0 ? (
          <button onClick={() => onToggle(node.id)} className="text-[#28071C]/30 hover:text-[#28071C] transition-colors flex-shrink-0">
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : <span className="w-3.5 flex-shrink-0" />}

        {/* Level badge */}
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0 ${
          depth === 0 ? 'bg-[#7598CF]/15 text-[#7598CF]'
            : depth === 1 ? 'bg-[#9B8CD8]/15 text-[#9B8CD8]'
            : depth === 2 ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-100 text-emerald-700'
        }`}>
          {levelLabels[depth]}
        </span>

        {/* Label or edit input */}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input autoFocus type="text" value={editLabel} onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel(); }}
              className="flex-1 px-2 py-1 border-2 border-[#7598CF]/50 rounded text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
            <button onClick={onEditSave} className="text-emerald-600 hover:text-emerald-700 text-xs font-semibold">OK</button>
            <button onClick={onEditCancel} className="text-[#28071C]/40 hover:text-[#28071C]"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <span className="text-[#28071C] text-sm flex-1 truncate">{node.label}</span>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
            {canAddChild && (
              <button onClick={() => onAddStart(node.id)} title={`Adicionar ${levelLabels[childLevel]}`}
                className="p-1 text-[#7598CF] hover:bg-[#7598CF]/10 rounded transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => onEditStart(node.id, node.label)} title="Editar"
              className="p-1 text-[#28071C]/40 hover:text-[#28071C] hover:bg-[#28071C]/8 rounded transition-colors">
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(node.id)} title="Excluir"
              className="p-1 text-[#28071C]/30 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Inline add-child input */}
      {isAdding && (
        <div className="flex gap-2 px-4 py-2 bg-[#7598CF]/5 border-b border-[#28071C]/6"
          style={{ paddingLeft: `${16 + (depth + 1) * 20}px` }}>
          <input autoFocus type="text" value={addLabel} onChange={e => onAddChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAddConfirm(node.id); if (e.key === 'Escape') onAddCancel(); }}
            placeholder={`Nome da ${levelLabels[childLevel]}…`}
            className="flex-1 px-2 py-1.5 border-2 border-[#7598CF]/50 rounded text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] bg-white" />
          <button onClick={() => onAddConfirm(node.id)} className="px-3 py-1.5 bg-[#7598CF] text-white rounded text-xs font-semibold hover:opacity-90">Adicionar</button>
          <button onClick={onAddCancel} className="px-2 py-1.5 border border-[#28071C]/20 text-[#28071C]/50 rounded text-xs hover:bg-gray-50"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Children */}
      {isExpanded && node.children.map((child, i) => (
        <HierNodeRow key={child.id} node={child} depth={depth + 1}
          expanded={expanded} onToggle={onToggle}
          editId={editId} editLabel={editLabel}
          onEditStart={onEditStart} onEditChange={onEditChange}
          onEditSave={onEditSave} onEditCancel={onEditCancel}
          addTarget={addTarget} addLabel={addLabel}
          onAddStart={onAddStart} onAddChange={onAddChange}
          onAddConfirm={onAddConfirm} onAddCancel={onAddCancel}
          onDelete={onDelete} levelLabels={levelLabels}
          isLast={i === node.children.length - 1}
        />
      ))}
    </div>
  );
}

// ─── Tipos: histórico de importação ─────────────────────────────────────────
const IMPORT_HISTORY_KEY = 'fm_import_history_v1';
export interface ImportHistoryEntry {
  id: string;
  dataType: ImportDataType;
  label: string;
  importedRows: number;
  errors: number;
  fileName: string;
  timestamp: string; // ISO
}

// ─── SettingsCard: accordion card reutilizável ────────────────────────────────
function SettingsCard({
  id, icon, title, summary, accentColor = "#7598CF",
  children, defaultOpen = false,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  accentColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      id={id}
      className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border-t-4"
      style={{ borderColor: accentColor }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#28071C]/2 transition-colors text-left group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0">{icon}</div>
          <div className="min-w-0">
            <p className="text-[#28071C] font-bold text-lg leading-tight">{title}</p>
            {summary && (
              <div className="mt-0.5">{summary}</div>
            )}
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-[#28071C]/40 transition-transform shrink-0 ml-4 group-hover:text-[#28071C]/60 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-6 pb-6 pt-1 border-t border-[#28071C]/6">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Month-range validation ───────────────────────────────────────────────────
function monthInRange(testIdx: number, startIdx: number, endIdx: number): boolean {
  if (startIdx <= endIdx) return testIdx >= startIdx && testIdx <= endIdx;
  // Cross-year (e.g., Outubro → Março)
  return testIdx >= startIdx || testIdx <= endIdx;
}

function dateInTemporada(dateStr: string, t: Temporada): boolean {
  const d        = new Date(dateStr + "T00:00:00");
  const testIdx  = d.getMonth(); // 0–11
  const startIdx = months.indexOf(t.mesInicio);
  const endIdx   = months.indexOf(t.mesFim);
  return monthInRange(testIdx, startIdx, endIdx);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OperationSettings() {
  const navigate = useNavigate();
  const tour = useTour("operation-settings");
  const [user, setUser] = useState<UserData | null>(null);

  // ── Temporadas ──────────────────────────────────────────────────────────────
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaNome,    setTemporadaNome]    = useState("");
  const [temporadaInicio,  setTemporadaInicio]  = useState("Janeiro");
  const [temporadaFim,     setTemporadaFim]     = useState("Dezembro");
  const [temporadaAno,     setTemporadaAno]     = useState<number | "">("");

  // ── Modal de impacto (editar/excluir temporada automática) ──────────────────
  type ModalAction = "delete" | "edit";
  interface TemporadaModal {
    action: ModalAction;
    temporada: Temporada;
    editNome: string;
    editMesInicio: string;
    editMesFim: string;
    hasLinkedColecoes: boolean;
  }
  const [modal, setModal] = useState<TemporadaModal | null>(null);
  // Estado de edição inline para temporadas auto-geradas
  const [editingAutoId,     setEditingAutoId]     = useState<string | null>(null);
  const [editingAutoNome,   setEditingAutoNome]   = useState("");
  const [editingAutoInicio, setEditingAutoInicio] = useState("");
  const [editingAutoFim,    setEditingAutoFim]    = useState("");

  // ── Canal × Temporada Config (Phase F) ──────────────────────────────────────
  const [canalPanelId,    setCanalPanelId]    = useState<string | null>(null);
  const [canalConfigs,    setCanalConfigs]    = useState<CanalConfig[]>([]);
  const [canalLoading,    setCanalLoading]    = useState(false);
  const [editingCanalId,  setEditingCanalId]  = useState<string | null>(null);
  const [editingCanalMes, setEditingCanalMes] = useState("");

  // ── Coleções / Drops ─────────────────────────────────────────────────────────
  const [colecoes, setColecoes] = useState<Colecao[]>(() => {
    try {
      const raw = localStorage.getItem(COLECOES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [selectedTemporadaId, setSelectedTemporadaId] = useState<string | "">("");
  const [colNome,     setColNome]     = useState("");
  const [colInicio,   setColInicio]   = useState("");
  const [colFim,      setColFim]      = useState("");
  const [editingColId, setEditingColId] = useState<number | null>(null);

  // ── Regra de bloqueio: coleções com produtos em produção ───────────────────
  // Apenas datas de entrada podem ser alteradas quando a coleção já tem produtos.
  const [lockedColNames, setLockedColNames] = useState<Set<string>>(new Set());


  // ── Hierarquia de Produtos ───────────────────────────────────────────────────
  const [hierDivisaoAtiva, setHierDivisaoAtiva] = useState<boolean>(() => {
    try { const r = localStorage.getItem("fashionmind_hierarquia"); return r ? JSON.parse(r).hierDivisaoAtiva ?? false : false; } catch { return false; }
  });
  const [hierOrdem, setHierOrdem] = useState<"divisao_primeiro" | "grupo_primeiro">(() => {
    try { const r = localStorage.getItem("fashionmind_hierarquia"); return r ? JSON.parse(r).hierOrdem ?? "grupo_primeiro" : "grupo_primeiro"; } catch { return "grupo_primeiro"; }
  });
  const [subcategorias, setSubcategorias] = useState<string[]>(() => {
    try { const r = localStorage.getItem("fashionmind_hierarquia"); return r ? JSON.parse(r).subcategorias ?? SUBCATEGORIAS_DEFAULT : SUBCATEGORIAS_DEFAULT; } catch { return SUBCATEGORIAS_DEFAULT; }
  });
  const [novaSubcategoria, setNovaSubcategoria] = useState("");
  const [hierSavedOk, setHierSavedOk] = useState(false);

  // ── Faixas de Preço por Categoria ────────────────────────────────────────────
  const [faixasPreco, setFaixasPreco] = useState<FaixaPreco[]>(() => {
    try { const r = localStorage.getItem("fashionmind_faixas_preco"); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [fpGrupo,    setFpGrupo]    = useState("");
  const [fpDivisao,  setFpDivisao]  = useState("");
  const [fpCategoria, setFpCategoria] = useState("");
  const [fpP1Inicio, setFpP1Inicio] = useState<number>(0);
  const [fpP1Fim,    setFpP1Fim]    = useState<number>(0);
  const [fpP2Inicio, setFpP2Inicio] = useState<number>(0);
  const [fpP2Fim,    setFpP2Fim]    = useState<number>(0);
  const [fpP3Inicio, setFpP3Inicio] = useState<number>(0);
  const [fpP3Fim,    setFpP3Fim]    = useState<number>(0);
  const [fpSavedOk,  setFpSavedOk]  = useState(false);

  // ── Faixas de Preço — aba ativa no card unificado ────────────────────────────
  const [faixasTab, setFaixasTab] = useState<"categoria" | "catalogo">("categoria");

  // ── Faixas de Preço — histórico de importação ────────────────────────────────
  const [faixasImportHistory, setFaixasImportHistory] = useState<FaixasImportEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAIXAS_IMPORT_HISTORY_KEY) ?? '[]'); } catch { return []; }
  });
  const [showFaixasHistoryModal, setShowFaixasHistoryModal] = useState(false);

  // ── Faixas de Preço — Catálogo (tier labels simples: nome, min, max) ─────────
  const TIER_LABELS_KEY = "fashionmind_tier_labels";
  const [tierLabels, setTierLabels] = useState<TierLabel[]>(() => {
    try { const r = localStorage.getItem("fashionmind_tier_labels"); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [tlNome,      setTlNome]      = useState("");
  const [tlMin,       setTlMin]       = useState<number>(0);
  const [tlMax,       setTlMax]       = useState<number>(0);
  const [tlSavedOk,   setTlSavedOk]   = useState(false);
  const [tlImporting, setTlImporting] = useState(false);

  // ── Cadastro de Básicos ──────────────────────────────────────────────────────
  const [basicosSkus, setBasicosSkus] = useState<string>(() => {
    try { const r = localStorage.getItem("fashionmind_basicos_sustentador"); return r ? JSON.parse(r).basicosSkus ?? "" : ""; } catch { return ""; }
  });
  const [basicosSavedOk, setBasicosSavedOk] = useState(false);

  // Básicos — busca e seleção de produtos do DB
  const [basicosSkuArr, setBasicosSkuArr] = useState<string[]>(() => {
    try {
      const r = localStorage.getItem("fashionmind_basicos_sustentador");
      const raw = r ? JSON.parse(r).basicosSkus ?? "" : "";
      if (!raw) return [];
      if (raw.startsWith("[")) return JSON.parse(raw) as string[];
      return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
    } catch { return []; }
  });
  const [basicosProds, setBasicosProds]     = useState<ProductForMigration[]>([]); // detalhes dos SKUs selecionados
  const [basicosSearch, setBasicosSearch]   = useState("");
  const [basicosResults, setBasicosResults] = useState<ProductForMigration[]>([]);
  const [basicosSearching, setBasicosSearching] = useState(false);
  const [basicosShowDrop, setBasicosShowDrop]   = useState(false);

  // ── Hierarquia estruturada (árvore de Divisão → Grupo → Categoria → Subcat.) ──
  const [hierStruct, setHierStruct] = useState<HierNode[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIER_STRUCT_KEY) ?? '[]') } catch { return [] }
  });
  const [hierExpanded, setHierExpanded] = useState<Set<string>>(new Set());
  const [hierAddTarget, setHierAddTarget] = useState<string | null>(null); // 'root' | nodeId
  const [hierAddLabel,  setHierAddLabel]  = useState('');
  const [hierEditId,    setHierEditId]    = useState<string | null>(null);
  const [hierEditLabel, setHierEditLabel] = useState('');
  const [hierSavedStructOk, setHierSavedStructOk] = useState(false);

  // ── Hierarquia: rótulos "de × para" ──────────────────────────────────────────
  const [hierLabels, setHierLabels] = useState<HierLabels>(DEFAULT_HIER_LABELS);
  const [hierLabelsPending, setHierLabelsPending] = useState(true);
  const [hierLabelsSavedOk, setHierLabelsSavedOk] = useState(false);

  // ── Hierarquia: árvore derivada dos produtos reais ───────────────────────────
  const [hierPaths, setHierPaths]       = useState<HierarchyPath[]>([]);
  const [hierDistinctVals, setHierDistinctVals] = useState<HierDistinct>({
    divisions: [], categories: [], subcategories: [], linhas: [], materials: [],
  });
  const [hierLoading, setHierLoading]   = useState(false);

  // ── Hierarquia: slides conceito ──────────────────────────────────────────────
  const [showConceptSlides, setShowConceptSlides] = useState(false);

  // ── Hierarquia: migração inline ──────────────────────────────────────────────
  const [showMigration, setShowMigration] = useState(false);
  const [migStep, setMigStep]   = useState<1 | 2 | 3>(1);
  const [migNewDiv,  setMigNewDiv]  = useState("");
  const [migNewCat,  setMigNewCat]  = useState("");
  const [migNewSub,  setMigNewSub]  = useState("");
  const [migNewLinha, setMigNewLinha] = useState("");
  const [migMode, setMigMode]   = useState<"manual" | "keyword" | "material">("manual");
  const [migKeyword, setMigKeyword] = useState("");
  const [migMaterial, setMigMaterial] = useState("");
  const [migFilterDiv, setMigFilterDiv] = useState("");
  const [migFilterCat, setMigFilterCat] = useState("");
  const [migFilterSub, setMigFilterSub] = useState("");
  const [migResults, setMigResults]   = useState<ProductForMigration[]>([]);
  const [migSelected, setMigSelected] = useState<Set<string>>(new Set());
  const [migSearching, setMigSearching] = useState(false);
  const [migSaving,    setMigSaving]   = useState(false);
  const [migDoneCount, setMigDoneCount] = useState<number | null>(null);

  // ── Hierarquia: import de planilha ERP ───────────────────────────────────────
  const [hierImporting, setHierImporting] = useState(false);
  const [hierImportResult, setHierImportResult] = useState<{ updated: number; notFound: number; errors: number } | null>(null);

  // ── Importação de Planilhas (novo — via ImportWizard) ────────────────────
  const [activeImportType, setActiveImportType] = useState<ImportDataType | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);

  // ── DB Counts (resumo do banco de dados) ────────────────────────────────────
  const [dbCounts, setDbCounts] = useState<{
    products: number; orders: number; inventory: number; sales: number; loaded: boolean;
  }>({ products: 0, orders: 0, inventory: 0, sales: 0, loaded: false });

  // ── Import History (log de importações, persistido no localStorage) ─────────
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) ?? '[]'); } catch { return []; }
  });
  const [historyDetailId, setHistoryDetailId] = useState<string | null>(null);

  const saveImportHistory = useCallback((entry: ImportHistoryEntry) => {
    setImportHistory(prev => {
      const updated = [entry, ...prev].slice(0, 50); // keep last 50
      localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Fetch DB counts — usa RPC SECURITY DEFINER para bypassar RLS em tabelas grandes
  const fetchDbCounts = useCallback(() => {
    const tid = user?.tenant_id;
    if (!tid) return;
    setDbCounts(c => ({ ...c, loaded: false }));
    Promise.resolve(
      (supabase as any).rpc('get_import_summary', { p_tenant_id: tid })
    ).then(({ data, error }: { data: any; error: any }) => {
      if (error || !data || !data[0]) {
        setDbCounts(c => ({ ...c, loaded: true }));
        return;
      }
      const row = data[0];
      setDbCounts({
        products:  Number(row.products_count)  || 0,
        orders:    Number(row.orders_count)    || 0,
        inventory: Number(row.inventory_count) || 0,
        sales:     Number(row.sales_count)     || 0,
        loaded: true,
      });
    }).catch(() => setDbCounts(c => ({ ...c, loaded: true })));
  }, [user?.tenant_id]);

  // Dispara fetch sempre que user.tenant_id ficar disponível (mount + mudança)
  useEffect(() => {
    if (user?.tenant_id) fetchDbCounts();
  }, [user?.tenant_id, fetchDbCounts]);

  // Estado legado mantido para não quebrar referências que ainda existem no JSX antigo (card hidden)
  const [importMode, setImportMode]           = useState<ImportMode | null>(null);
  const [importStep, setImportStep]           = useState<ImportStep>("select");
  const [importFileName, setImportFileName]   = useState<string>("");
  const [importHeaders, setImportHeaders]     = useState<string[]>([]);
  const [columnMapping, setColumnMapping]     = useState<Record<string, string>>({});
  const [importDragging, setImportDragging]   = useState(false);
  const handleImportReset = () => { setImportMode(null); setImportStep("select"); setImportFileName(""); setImportHeaders([]); setColumnMapping({}); };
  const handleImportFileChange = (_e: React.ChangeEvent<HTMLInputElement>) => {};
  const handleImportDrop = (_e: React.DragEvent<HTMLDivElement>) => {};
  const activeSystemFields = importMode === "completa" ? SYSTEM_FIELDS_COMPLETA : SYSTEM_FIELDS_HIERARQUIA;
  const requiredFieldsMapped = activeSystemFields.filter(f => f.required).every(f => Boolean(columnMapping[f.key]));

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      const effectiveProfile =
        u.system_role === "support" || u.system_role === "client_admin"
          ? "CEO"
          : u.profile;
      if (effectiveProfile !== "CEO") { navigate("/dashboard"); return; }
      if (u.tenant_id) {
        // Carrega temporadas do Supabase
        listSeasonsDb(u.tenant_id)
          .then(setTemporadas)
          .catch(err => console.error("Erro ao carregar temporadas:", err));

        // Carrega operation_settings do Supabase
        getOperationSettings(u.tenant_id).then(row => {
          if (!row) return;
          // Hierarquia
          try {
            const nodes = JSON.parse(row.hier_ordem);
            if (Array.isArray(nodes) && nodes.length > 0) {
              setHierStruct(nodes);
              try { localStorage.setItem(HIER_STRUCT_KEY, JSON.stringify(nodes)); } catch { /* */ }
            }
          } catch { /* format mismatch — keep localStorage */ }
          setHierDivisaoAtiva(row.hier_divisao_ativa);
          setSubcategorias(row.subcategorias ?? SUBCATEGORIAS_DEFAULT);
          // Básicos — carrega SKUs do DB
          if (row.basicos_skus) setBasicosSkus(row.basicos_skus);
          // Faixas de preço — catálogo (tier labels)
          if (Array.isArray(row.faixas_preco) && row.faixas_preco.length > 0) {
            const labels = row.faixas_preco as TierLabel[];
            setTierLabels(labels);
            try { localStorage.setItem("fashionmind_tier_labels", JSON.stringify(labels)); } catch { /* */ }
          }
          // Faixas de preço — por categoria (P1/P2/P3)
          if (Array.isArray(row.faixas_categoria) && row.faixas_categoria.length > 0) {
            const cats = row.faixas_categoria as FaixaPreco[];
            setFaixasPreco(cats);
            try { localStorage.setItem("fashionmind_faixas_preco", JSON.stringify(cats)); } catch { /* */ }
          }
          // Rótulos de hierarquia
          if (row.hier_labels) setHierLabels(row.hier_labels as HierLabels);
          setHierLabelsPending(row.hier_labels_pending ?? true);

          // Básicos — carrega detalhes dos produtos cadastrados
          const rawSkus = row.basicos_skus ?? "";
          let skuArr: string[] = [];
          try {
            skuArr = rawSkus.startsWith("[")
              ? JSON.parse(rawSkus)
              : rawSkus.split(",").map((s: string) => s.trim()).filter(Boolean);
          } catch { /* ignore */ }
          if (skuArr.length > 0) {
            setBasicosSkuArr(skuArr);
            supabase.from("products")
              .select("id, sku, name, division, category, subcategory, linha, material")
              .eq("tenant_id", u.tenant_id)
              .in("sku", skuArr)
              .then(({ data }) => { if (data) setBasicosProds(data as ProductForMigration[]); });
          }
        }).catch(() => { /* fallback to localStorage already loaded in useState init */ });

        // Carrega hierarquia dos produtos reais
        const tid = u.tenant_id;
        setHierLoading(true);
        Promise.all([fetchHierarchyPaths(tid), fetchHierDistinct(tid)])
          .then(([paths, distinct]) => {
            setHierPaths(paths);
            setHierDistinctVals(distinct);
          })
          .catch(() => { /* silently ignore — hierarchy is optional */ })
          .finally(() => setHierLoading(false));
        // Carrega nomes de coleções que já têm produtos em produção
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (import("../../lib/supabase") as Promise<{ supabase: any }>).then(({ supabase }) => {
          supabase
            .from("products")
            .select("collection_name")
            .eq("tenant_id", u.tenant_id)
            .not("collection_name", "is", null)
            .then(({ data }: { data: { collection_name: string }[] | null }) => {
              const names = new Set<string>(
                (data ?? []).map(r => r.collection_name).filter(Boolean)
              );
              setLockedColNames(names);
            });
        });
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  // ── Persistência helpers ──────────────────────────────────────────────────────
  const persistTemporadas = (data: Temporada[]) => {
    setTemporadas(data);
  };
  const persistColecoes = (data: Colecao[]) => {
    try { localStorage.setItem(COLECOES_KEY, JSON.stringify(data)); } catch { /* silent */ }
  };

  // ── Handlers: Temporadas ──────────────────────────────────────────────────────
  const handleSaveTemporada = async () => {
    if (!user?.tenant_id) return;
    if (!temporadaNome.trim()) {
      alert("Preencha o nome da temporada.");
      return;
    }
    try {
      const nova = await insertSeasonDb(
        user.tenant_id,
        temporadaNome.trim(),
        temporadaInicio,
        temporadaFim,
        temporadaAno !== "" ? Number(temporadaAno) : undefined,
      );
      persistTemporadas([...temporadas, nova]);
      setTemporadaNome(""); setTemporadaInicio("Janeiro"); setTemporadaFim("Dezembro"); setTemporadaAno("");
    } catch (err) {
      console.error("Erro ao salvar temporada:", err);
      alert("Erro ao salvar temporada. Tente novamente.");
    }
  };

  // Executa a exclusão efetiva após confirmação (modal ou direta)
  const executeDeleteTemporada = async (id: string, deleteLinkedColecoes: boolean) => {
    try {
      await deleteSeasonDb(id);
      let updatedColecoes = colecoes;
      if (deleteLinkedColecoes) {
        updatedColecoes = colecoes.filter(c => c.temporadaId !== id);
        setColecoes(updatedColecoes);
        persistColecoes(updatedColecoes);
      }
      persistTemporadas(temporadas.filter(t => t.id !== id));
      if (editingColId && colecoes.find(c => c.id === editingColId)?.temporadaId === id) {
        setEditingColId(null); setColNome(""); setColInicio(""); setColFim("");
      }
    } catch (err) {
      console.error("Erro ao excluir temporada:", err);
      alert("Erro ao excluir temporada. Tente novamente.");
    }
  };

  const handleDeleteTemporada = (t: Temporada) => {
    // Proteção: temporadas passadas nunca podem ser excluídas
    if (isTemporadaPast(t)) {
      alert("Temporadas de anos fiscais encerrados não podem ser excluídas.");
      return;
    }
    const linkedColecoes = colecoes.filter(c => c.temporadaId === t.id);

    // Temporada auto-gerada → modal de impacto
    if (t.autoGerada) {
      setModal({
        action:           "delete",
        temporada:        t,
        editNome:         t.nome,
        editMesInicio:    t.mesInicio,
        editMesFim:       t.mesFim,
        hasLinkedColecoes: linkedColecoes.length > 0,
      });
      return;
    }

    // Manual → comportamento original (bloqueia se há coleções)
    if (linkedColecoes.length > 0) {
      alert("Esta temporada possui coleções vinculadas. Remova as coleções antes de excluir a temporada.");
      return;
    }
    executeDeleteTemporada(t.id, false);
  };

  // Abre formulário de edição para temporada auto-gerada
  const handleStartEditAuto = (t: Temporada) => {
    if (isTemporadaPast(t)) {
      alert("Temporadas de anos fiscais encerrados não podem ser editadas.");
      return;
    }
    setEditingAutoId(t.id);
    setEditingAutoNome(t.nome);
    setEditingAutoInicio(t.mesInicio);
    setEditingAutoFim(t.mesFim);
  };

  const handleSaveEditAuto = () => {
    const t = temporadas.find(x => x.id === editingAutoId);
    if (!t) return;
    setModal({
      action:           "edit",
      temporada:        t,
      editNome:         editingAutoNome.trim() || t.nome,
      editMesInicio:    editingAutoInicio,
      editMesFim:       editingAutoFim,
      hasLinkedColecoes: colecoes.some(c => c.temporadaId === t.id),
    });
  };

  // Confirmação do modal — aplica a mudança com o escopo escolhido
  const confirmModal = async (scope: "pontual" | "regra_geral") => {
    if (!modal || !user?.tenant_id) return;
    const { action, temporada, editNome, editMesInicio, editMesFim, hasLinkedColecoes } = modal;

    if (action === "delete") {
      const proceed = !hasLinkedColecoes || window.confirm(
        `Esta temporada possui coleções vinculadas. Elas também serão excluídas. Confirmar?`
      );
      if (!proceed) { setModal(null); return; }
      await executeDeleteTemporada(temporada.id, hasLinkedColecoes);

      if (scope === "regra_geral" && temporada.tipo) {
        const regra = await getRegraDefaultDb(user.tenant_id);
        const newRegra: TemporadaRegraDefault = temporada.tipo === "verao"
          ? { ...regra, verao: { mesInicio: "", mesFim: "" } }
          : { ...regra, inverno: { mesInicio: "", mesFim: "" } };
        await saveRegraDefaultDb(user.tenant_id, newRegra);
      }
    }

    if (action === "edit") {
      try {
        await updateSeasonDb(temporada.id, editNome, editMesInicio, editMesFim);
        persistTemporadas(temporadas.map(t =>
          t.id === temporada.id
            ? { ...t, nome: editNome, mesInicio: editMesInicio, mesFim: editMesFim }
            : t
        ));
        if (scope === "regra_geral" && temporada.tipo) {
          const regra = await getRegraDefaultDb(user.tenant_id);
          const newRegra: TemporadaRegraDefault = temporada.tipo === "verao"
            ? { ...regra, verao: { mesInicio: editMesInicio, mesFim: editMesFim } }
            : { ...regra, inverno: { mesInicio: editMesInicio, mesFim: editMesFim } };
          await saveRegraDefaultDb(user.tenant_id, newRegra);
        }
      } catch (err) {
        console.error("Erro ao editar temporada:", err);
        alert("Erro ao salvar edição. Tente novamente.");
      }
      setEditingAutoId(null);
    }

    setModal(null);
  };

  // ── Handlers: Canal × Temporada (Phase F) ────────────────────────────────────
  const loadCanalConfigs = async (seasonId: string) => {
    if (!user?.tenant_id) return;
    setCanalLoading(true);
    try {
      const configs = await listCanalConfigDb(user.tenant_id, seasonId);
      setCanalConfigs(configs);
    } catch (err) {
      console.error("Erro ao carregar config de canais:", err);
    } finally {
      setCanalLoading(false);
    }
  };

  const toggleCanalPanel = (seasonId: string) => {
    if (canalPanelId === seasonId) {
      setCanalPanelId(null);
      setCanalConfigs([]);
      setEditingCanalId(null);
    } else {
      setCanalPanelId(seasonId);
      setEditingCanalId(null);
      loadCanalConfigs(seasonId);
    }
  };

  const handleSaveCanalConfig = async (canalId: string) => {
    if (!user?.tenant_id || !canalPanelId) return;
    try {
      await upsertCanalConfigDb(user.tenant_id, canalPanelId, canalId, editingCanalMes);
      await loadCanalConfigs(canalPanelId);
    } catch (err) {
      console.error("Erro ao salvar config de canal:", err);
    } finally {
      setEditingCanalId(null);
    }
  };

  const handleDeleteCanalConfig = async (canalId: string) => {
    if (!user?.tenant_id || !canalPanelId) return;
    try {
      await deleteCanalConfigDb(user.tenant_id, canalPanelId, canalId);
      await loadCanalConfigs(canalPanelId);
    } catch (err) {
      console.error("Erro ao remover config de canal:", err);
    }
  };

  // ── Handlers: Coleções ────────────────────────────────────────────────────────
  const handleSaveColecao = () => {
    if (!selectedTemporadaId) { alert("Selecione uma temporada."); return; }
    if (!colNome.trim())      { alert("Preencha o nome da coleção."); return; }
    if (!colInicio || !colFim){ alert("Preencha as datas de início e fim."); return; }
    if (colInicio > colFim)   { alert("A data de início deve ser anterior à data de fim."); return; }

    const temporada = temporadas.find(t => t.id === selectedTemporadaId);
    if (!temporada) return;

    if (!dateInTemporada(colInicio, temporada)) {
      alert(`A data de início está fora do período da temporada "${temporada.nome}" (${temporada.mesInicio} a ${temporada.mesFim}).`);
      return;
    }
    if (!dateInTemporada(colFim, temporada)) {
      alert(`A data de fim está fora do período da temporada "${temporada.nome}" (${temporada.mesInicio} a ${temporada.mesFim}).`);
      return;
    }

    let updated: Colecao[];
    if (editingColId !== null) {
      updated = colecoes.map(c =>
        c.id === editingColId
          ? { ...c, nome: colNome.trim(), dataInicio: colInicio, dataFim: colFim }
          : c
      );
      setEditingColId(null);
    } else {
      const nova: Colecao = {
        id:          Date.now(),
        temporadaId: selectedTemporadaId,
        nome:        colNome.trim(),
        dataInicio:  colInicio,
        dataFim:     colFim,
      };
      updated = [...colecoes, nova];
    }

    setColecoes(updated);
    persistColecoes(updated);
    setColNome(""); setColInicio(""); setColFim("");
  };

  const handleEditColecao = (c: Colecao) => {
    setSelectedTemporadaId(c.temporadaId);
    setColNome(c.nome);
    setColInicio(c.dataInicio);
    setColFim(c.dataFim);
    setEditingColId(c.id);
    // Scroll para o formulário de edição
    document.getElementById("tour-op-colecoes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteColecao = (id: number) => {
    const updated = colecoes.filter(c => c.id !== id);
    setColecoes(updated);
    persistColecoes(updated);
    if (editingColId === id) { setEditingColId(null); setColNome(""); setColInicio(""); setColFim(""); }
  };

  const handleCancelEdit = () => {
    setEditingColId(null);
    setColNome(""); setColInicio(""); setColFim("");
  };

  // ── Handlers: Hierarquia ─────────────────────────────────────────────────────
  const handleAddSubcategoria = () => {
    const val = novaSubcategoria.trim();
    if (!val || subcategorias.includes(val)) return;
    setSubcategorias([...subcategorias, val]);
    setNovaSubcategoria("");
  };
  const handleDeleteSubcategoria = (s: string) =>
    setSubcategorias(subcategorias.filter(x => x !== s));

  const handleSaveHierarquia = () => {
    try { localStorage.setItem("fashionmind_hierarquia", JSON.stringify({ hierDivisaoAtiva, hierOrdem, subcategorias })); } catch { /* */ }
    setHierSavedOk(true);
    setTimeout(() => setHierSavedOk(false), 2500);
    // Write-through → Supabase
    if (user?.tenant_id) {
      saveOperationSettings(user.tenant_id, {
        hier_divisao_ativa: hierDivisaoAtiva,
        hier_struct: hierStruct,
        hier_ordem: hierOrdem,
        subcategorias,
        basicos_ativos: false,
        basicos_tipo: null,
        basicos_skus: basicosSkus,
      }).catch(err => console.warn("[OpSettings] Supabase save hier:", err));
    }
  };

  // ── Handlers: Hierarquia estruturada ─────────────────────────────────────────
  function hierNodeDepth(nodes: HierNode[], id: string, depth = 0): number {
    for (const n of nodes) {
      if (n.id === id) return depth;
      const d = hierNodeDepth(n.children, id, depth + 1);
      if (d >= 0) return d;
    }
    return -1;
  }

  function persistHierStruct(nodes: HierNode[]) {
    setHierStruct(nodes);
    try { localStorage.setItem(HIER_STRUCT_KEY, JSON.stringify(nodes)); } catch { /* */ }
    setHierSavedStructOk(true);
    setTimeout(() => setHierSavedStructOk(false), 2000);
    // Write-through → Supabase
    if (user?.tenant_id) {
      saveOperationSettings(user.tenant_id, {
        hier_divisao_ativa: hierDivisaoAtiva,
        hier_struct: nodes,
        hier_ordem: hierOrdem,
        subcategorias,
        basicos_ativos: false,
        basicos_tipo: null,
        basicos_skus: basicosSkus,
      }).catch(err => console.warn("[OpSettings] Supabase save struct:", err));
    }
  }

  function hierAddNode(parentId: string | null) {
    const label = hierAddLabel.trim();
    if (!label) return;
    const newNode: HierNode = { id: `${Date.now()}`, label, children: [] };
    function addTo(nodes: HierNode[]): HierNode[] {
      if (parentId === null) return [...nodes, newNode];
      return nodes.map(n => ({
        ...n,
        children: n.id === parentId ? [...n.children, newNode] : addTo(n.children),
      }));
    }
    persistHierStruct(addTo(hierStruct));
    setHierAddTarget(null);
    setHierAddLabel('');
    setHierExpanded(prev => new Set([...prev, ...(parentId ? [parentId] : [])]));
  }

  function hierDeleteNode(id: string) {
    function deleteFrom(nodes: HierNode[]): HierNode[] {
      return nodes.filter(n => n.id !== id).map(n => ({ ...n, children: deleteFrom(n.children) }));
    }
    persistHierStruct(deleteFrom(hierStruct));
  }

  function hierSaveEdit() {
    const label = hierEditLabel.trim();
    if (!label || !hierEditId) return;
    function editIn(nodes: HierNode[]): HierNode[] {
      return nodes.map(n => n.id === hierEditId
        ? { ...n, label }
        : { ...n, children: editIn(n.children) }
      );
    }
    persistHierStruct(editIn(hierStruct));
    setHierEditId(null);
    setHierEditLabel('');
  }

  function toggleExpand(id: string) {
    setHierExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Handlers: Hierarquia — rótulos ──────────────────────────────────────────
  const handleSaveHierLabels = async () => {
    if (!user?.tenant_id) return;
    try {
      await saveHierLabels(user.tenant_id, hierLabels);
      setHierLabelsPending(false);
      setHierLabelsSavedOk(true);
      setTimeout(() => setHierLabelsSavedOk(false), 2500);
    } catch { /* silently ignore */ }
  };

  // ── Handlers: Hierarquia — recarregar árvore ─────────────────────────────────
  const handleRefreshHierarchy = async () => {
    if (!user?.tenant_id) return;
    setHierLoading(true);
    try {
      const [paths, distinct] = await Promise.all([
        fetchHierarchyPaths(user.tenant_id),
        fetchHierDistinct(user.tenant_id),
      ]);
      setHierPaths(paths);
      setHierDistinctVals(distinct);
    } catch { /* ignore */ }
    finally { setHierLoading(false); }
  };

  // ── Handlers: Hierarquia — pesquisa para migração ────────────────────────────
  const handleMigSearch = async () => {
    if (!user?.tenant_id) return;
    setMigSearching(true);
    try {
      const results = await searchProductsForMigration(user.tenant_id, {
        division:    migFilterDiv  || undefined,
        category:    migFilterCat  || undefined,
        subcategory: migFilterSub  || undefined,
        keyword:     migMode === "keyword"  ? migKeyword  : undefined,
        material:    migMode === "material" ? migMaterial : undefined,
      });
      setMigResults(results);
      setMigSelected(new Set(results.map(r => r.sku)));
    } catch { /* ignore */ }
    finally { setMigSearching(false); }
  };

  const toggleMigSku = (sku: string) => {
    setMigSelected(prev => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  };

  const toggleMigAll = () => {
    if (migSelected.size === migResults.length) {
      setMigSelected(new Set());
    } else {
      setMigSelected(new Set(migResults.map(r => r.sku)));
    }
  };

  // ── Handlers: Hierarquia — executar migração ──────────────────────────────────
  const handleExecuteMigration = async () => {
    if (!user?.tenant_id || migSelected.size === 0) return;
    if (!migNewCat.trim()) { alert("Defina ao menos a Categoria de destino."); return; }
    setMigSaving(true);
    try {
      const count = await migrateProductsDb(
        user.tenant_id,
        Array.from(migSelected),
        {
          division:    migNewDiv   || undefined,
          category:    migNewCat   || undefined,
          subcategory: migNewSub   || undefined,
          linha:       migNewLinha || undefined,
        }
      );
      setMigDoneCount(count);
      setMigStep(3);
      // Recarrega a árvore
      const [paths, distinct] = await Promise.all([
        fetchHierarchyPaths(user.tenant_id),
        fetchHierDistinct(user.tenant_id),
      ]);
      setHierPaths(paths);
      setHierDistinctVals(distinct);
    } catch { alert("Erro ao migrar produtos. Tente novamente."); }
    finally { setMigSaving(false); }
  };

  const resetMigration = () => {
    setShowMigration(false);
    setMigStep(1);
    setMigNewDiv(""); setMigNewCat(""); setMigNewSub(""); setMigNewLinha("");
    setMigMode("manual");
    setMigKeyword(""); setMigMaterial("");
    setMigFilterDiv(""); setMigFilterCat(""); setMigFilterSub("");
    setMigResults([]); setMigSelected(new Set());
    setMigDoneCount(null);
  };

  // ── Handlers: Hierarquia — importar planilha ERP ──────────────────────────────
  const handleImportHierFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.tenant_id) return;
    e.target.value = "";
    setHierImporting(true);
    setHierImportResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

      // Detecta separador
      const sep = lines[0].includes("\t") ? "\t" : ",";
      const headers = lines[0].split(sep).map(h => h.trim().toLowerCase()
        .replace(/[áàâã]/g, "a").replace(/[éêè]/g, "e")
        .replace(/[íì]/g, "i").replace(/[óôõò]/g, "o").replace(/[úù]/g, "u")
        .replace(/ç/g, "c").replace(/\s+/g, "_")
      );

      const col = (names: string[]) => {
        for (const n of names) {
          const idx = headers.indexOf(n);
          if (idx >= 0) return idx;
        }
        return -1;
      };
      const skuIdx = col(["sku", "codigo", "cod", "code"]);
      const divIdx = col(["divisao", "divisão", "division", "departamento"]);
      const catIdx = col(["categoria", "categoria", "category", "grupo"]);
      const subIdx = col(["subcategoria", "subcategory", "familia", "subfamily"]);
      const linIdx = col(["linha", "line", "collection"]);

      if (skuIdx < 0) { alert("Coluna SKU não encontrada. Use cabeçalho: SKU, Codigo, Code..."); return; }

      const rows = lines.slice(1).map(line => {
        const cells = line.split(sep);
        const r: { sku: string; division?: string; category?: string; subcategory?: string; linha?: string } = {
          sku: (cells[skuIdx] ?? "").trim().replace(/^["']|["']$/g, ""),
        };
        if (divIdx >= 0 && cells[divIdx]?.trim()) r.division    = cells[divIdx].trim();
        if (catIdx >= 0 && cells[catIdx]?.trim()) r.category    = cells[catIdx].trim();
        if (subIdx >= 0 && cells[subIdx]?.trim()) r.subcategory = cells[subIdx].trim();
        if (linIdx >= 0 && cells[linIdx]?.trim()) r.linha       = cells[linIdx].trim();
        return r;
      }).filter(r => r.sku);

      const result = await importHierarchyRows(user.tenant_id, rows);
      setHierImportResult(result);
      // Recarrega a árvore
      const [paths, distinct] = await Promise.all([
        fetchHierarchyPaths(user.tenant_id),
        fetchHierDistinct(user.tenant_id),
      ]);
      setHierPaths(paths);
      setHierDistinctVals(distinct);
    } catch { alert("Erro ao processar arquivo."); }
    finally { setHierImporting(false); }
  };

  // ── Handlers: Faixas de Preço ────────────────────────────────────────────────
  const handleSaveFaixaPreco = () => {
    if (!fpGrupo || !fpCategoria) { alert("Selecione Grupo e Categoria."); return; }
    if (fpP1Fim >= fpP2Inicio) { alert("P1 Fim deve ser menor que P2 Início — faixas não podem se sobrepor."); return; }
    if (fpP2Fim >= fpP3Inicio) { alert("P2 Fim deve ser menor que P3 Início — faixas não podem se sobrepor."); return; }
    const nova: FaixaPreco = {
      id: Date.now(),
      grupo: fpGrupo,
      divisao: hierDivisaoAtiva && fpDivisao ? fpDivisao : undefined,
      categoria: fpCategoria,
      faixas: {
        P1: { inicio: fpP1Inicio, fim: fpP1Fim },
        P2: { inicio: fpP2Inicio, fim: fpP2Fim },
        P3: { inicio: fpP3Inicio, fim: fpP3Fim },
      },
    };
    const key = `${fpGrupo}|${fpCategoria}`;
    const updated = faixasPreco.some(f => `${f.grupo}|${f.categoria}` === key)
      ? faixasPreco.map(f => `${f.grupo}|${f.categoria}` === key ? { ...nova, id: f.id } : f)
      : [...faixasPreco, nova];
    persistFaixasCategoria(updated);
    setFpGrupo(""); setFpCategoria(""); setFpDivisao("");
    setFpP1Inicio(0); setFpP1Fim(0); setFpP2Inicio(0); setFpP2Fim(0); setFpP3Inicio(0); setFpP3Fim(0);
    setFpSavedOk(true);
    setTimeout(() => setFpSavedOk(false), 2500);
  };

  const persistFaixasCategoria = (updated: FaixaPreco[]) => {
    setFaixasPreco(updated);
    try { localStorage.setItem("fashionmind_faixas_preco", JSON.stringify(updated)); } catch { /* */ }
    if (user?.tenant_id) {
      saveFaixasCategoria(user.tenant_id, updated)
        .catch(err => console.warn("[OpSettings] saveFaixasCategoria:", err));
    }
  };

  const handleDeleteFaixa = (id: number) => {
    persistFaixasCategoria(faixasPreco.filter(f => f.id !== id));
  };

  // ── Handler: importar planilha de faixas por categoria ───────────────────────
  const [fpImporting, setFpImporting] = useState(false);

  const handleImportFaixasFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFpImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const rows = lines.slice(1); // pula cabeçalho
        const parsed: FaixaPreco[] = [];
        for (const line of rows) {
          const cols = line.split(/[,;\t]/);
          const parseNum = (v: string) => parseFloat((v ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));
          // Colunas: Divisão(opt), Grupo, Categoria, P1_min, P1_max, P2_min, P2_max, P3_min, P3_max
          const hasDiv = cols.length >= 9;
          const offset = hasDiv ? 1 : 0;
          const divisao   = hasDiv ? (cols[0] ?? "").replace(/"/g, "").trim() || undefined : undefined;
          const grupo     = (cols[offset]     ?? "").replace(/"/g, "").trim();
          const categoria = (cols[offset + 1] ?? "").replace(/"/g, "").trim();
          const p1min = parseNum(cols[offset + 2] ?? "");
          const p1max = parseNum(cols[offset + 3] ?? "");
          const p2min = parseNum(cols[offset + 4] ?? "");
          const p2max = parseNum(cols[offset + 5] ?? "");
          const p3min = parseNum(cols[offset + 6] ?? "");
          const p3max = parseNum(cols[offset + 7] ?? "");
          if (!grupo || !categoria || isNaN(p1min) || isNaN(p1max)) continue;
          parsed.push({
            id: Date.now() + Math.floor(Math.random() * 10000),
            grupo, categoria, divisao,
            faixas: {
              P1: { inicio: p1min, fim: p1max },
              P2: { inicio: isNaN(p2min) ? 0 : p2min, fim: isNaN(p2max) ? 0 : p2max },
              P3: { inicio: isNaN(p3min) ? 0 : p3min, fim: isNaN(p3max) ? 0 : p3max },
            },
          });
        }
        if (parsed.length === 0) {
          alert("Nenhuma linha válida. Verifique o formato do modelo.");
          return;
        }
        // Merge: atualiza existentes, adiciona novos
        const merged = [...faixasPreco];
        for (const p of parsed) {
          const key = `${p.grupo}|${p.categoria}`;
          const idx = merged.findIndex(f => `${f.grupo}|${f.categoria}` === key);
          if (idx >= 0) merged[idx] = { ...p, id: merged[idx].id };
          else merged.push(p);
        }
        persistFaixasCategoria(merged);
        // Salva no histórico
        const entry: FaixasImportEntry = {
          id: `${Date.now()}`,
          timestamp: new Date().toISOString(),
          fileName: file.name,
          rows: parsed.length,
        };
        setFaixasImportHistory(prev => {
          const updated = [entry, ...prev].slice(0, 20);
          try { localStorage.setItem(FAIXAS_IMPORT_HISTORY_KEY, JSON.stringify(updated)); } catch { /* */ }
          return updated;
        });
        setFpSavedOk(true);
        setTimeout(() => setFpSavedOk(false), 2500);
      } catch (err) {
        console.error(err);
        alert("Erro ao processar arquivo. Use o modelo fornecido (CSV com cabeçalho).");
      } finally {
        setFpImporting(false);
        e.target.value = "";
      }
    };
    reader.onerror = () => { setFpImporting(false); alert("Erro ao ler arquivo."); };
    reader.readAsText(file, "utf-8");
  };

  // ── Helpers: TierLabels persistence ─────────────────────────────────────────
  const persistTierLabels = (labels: TierLabel[]) => {
    setTierLabels(labels);
    try { localStorage.setItem(TIER_LABELS_KEY, JSON.stringify(labels)); } catch { /* */ }
    if (user?.tenant_id) {
      saveTierLabels(user.tenant_id, labels)
        .catch(err => console.warn("[OpSettings] saveTierLabels:", err));
    }
  };

  const handleAddTierLabel = () => {
    const nome = tlNome.trim();
    if (!nome) { alert("Informe o nome da faixa."); return; }
    if (tlMin >= tlMax) { alert("O valor mínimo deve ser menor que o máximo."); return; }
    const nova: TierLabel = { id: `${Date.now()}`, nome, min: tlMin, max: tlMax };
    const updated = tierLabels.some(t => t.nome.toLowerCase() === nome.toLowerCase())
      ? tierLabels.map(t => t.nome.toLowerCase() === nome.toLowerCase() ? nova : t)
      : [...tierLabels, nova];
    persistTierLabels(updated);
    setTlNome(""); setTlMin(0); setTlMax(0);
    setTlSavedOk(true);
    setTimeout(() => setTlSavedOk(false), 2500);
  };

  const handleDeleteTierLabel = (id: string) => {
    persistTierLabels(tierLabels.filter(t => t.id !== id));
  };

  const handleImportTierLabelsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTlImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        // Skip header row (first line)
        const rows = lines.slice(1);
        const parsed: TierLabel[] = [];
        for (const line of rows) {
          const cols = line.split(/[,;\t]/);
          const nome = (cols[0] ?? "").replace(/"/g, "").trim();
          const min  = parseFloat((cols[1] ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));
          const max  = parseFloat((cols[2] ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));
          if (nome && !isNaN(min) && !isNaN(max) && min < max) {
            parsed.push({ id: `${Date.now()}_${Math.random()}`, nome, min, max });
          }
        }
        if (parsed.length === 0) { alert("Nenhuma linha válida encontrada. Use colunas: Nome, Preço Mínimo, Preço Máximo"); return; }
        // Merge: keep existing not in CSV, add/update from CSV
        const merged = [...tierLabels];
        for (const p of parsed) {
          const idx = merged.findIndex(t => t.nome.toLowerCase() === p.nome.toLowerCase());
          if (idx >= 0) merged[idx] = { ...p, id: merged[idx].id };
          else merged.push(p);
        }
        persistTierLabels(merged);
        alert(`${parsed.length} faixa(s) importada(s) com sucesso.`);
      } catch (err) {
        console.error(err);
        alert("Erro ao processar o arquivo. Verifique o formato (CSV com colunas: Nome, Mínimo, Máximo).");
      } finally {
        setTlImporting(false);
        e.target.value = "";
      }
    };
    reader.onerror = () => { setTlImporting(false); alert("Erro ao ler o arquivo."); };
    reader.readAsText(file, "utf-8");
  };

  // ── Handlers: Cadastro de Básicos ───────────────────────────────────────────

  // Serializa array → string para o campo basicos_skus no DB
  const basicosSkusSerial = (arr: string[]) => JSON.stringify(arr);

  // Busca produtos por SKU ou nome
  const handleBasicosSearch = async (query: string) => {
    setBasicosSearch(query);
    if (query.trim().length < 2) { setBasicosResults([]); setBasicosShowDrop(false); return; }
    if (!user?.tenant_id) return;
    setBasicosSearching(true);
    try {
      const { data } = await supabase
        .from("products")
        .select("id, sku, name, division, category, subcategory, linha, material")
        .eq("tenant_id", user.tenant_id)
        .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(20);
      setBasicosResults((data ?? []) as ProductForMigration[]);
      setBasicosShowDrop(true);
    } catch { /* ignore */ }
    finally { setBasicosSearching(false); }
  };

  // Adiciona produto à lista de básicos
  const handleAddBasico = (prod: ProductForMigration) => {
    if (basicosSkuArr.includes(prod.sku)) return;
    const newArr = [...basicosSkuArr, prod.sku];
    setBasicosSkuArr(newArr);
    setBasicosProds(prev => [...prev, prod]);
    setBasicosSkus(basicosSkusSerial(newArr));
    setBasicosSearch(""); setBasicosResults([]); setBasicosShowDrop(false);
  };

  // Remove produto da lista
  const handleRemoveBasico = (sku: string) => {
    const newArr = basicosSkuArr.filter(s => s !== sku);
    setBasicosSkuArr(newArr);
    setBasicosProds(prev => prev.filter(p => p.sku !== sku));
    setBasicosSkus(basicosSkusSerial(newArr));
  };

  // Importa lista de SKUs (paste em bulk)
  const handleImportBasicosBulk = async (raw: string) => {
    if (!user?.tenant_id) return;
    const skus = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (skus.length === 0) return;
    const newSkus = skus.filter(s => !basicosSkuArr.includes(s));
    if (newSkus.length === 0) return;
    const { data } = await supabase
      .from("products")
      .select("id, sku, name, division, category, subcategory, linha, material")
      .eq("tenant_id", user.tenant_id)
      .in("sku", newSkus);
    const found = (data ?? []) as ProductForMigration[];
    const foundSkus = found.map(p => p.sku);
    const newArr = [...basicosSkuArr, ...foundSkus];
    setBasicosSkuArr(newArr);
    setBasicosProds(prev => [...prev, ...found]);
    setBasicosSkus(basicosSkusSerial(newArr));
  };

  const handleSaveBasicos = () => {
    const serial = basicosSkusSerial(basicosSkuArr);
    setBasicosSkus(serial);
    try { localStorage.setItem("fashionmind_basicos_sustentador", JSON.stringify({ basicosSkus: serial })); } catch { /* */ }
    setBasicosSavedOk(true);
    setTimeout(() => setBasicosSavedOk(false), 2500);
    // Write-through → Supabase
    if (user?.tenant_id) {
      saveOperationSettings(user.tenant_id, {
        hier_divisao_ativa: hierDivisaoAtiva,
        hier_struct: hierStruct,
        hier_ordem: hierOrdem,
        subcategorias,
        basicos_ativos: false,
        basicos_tipo: null,
        basicos_skus: serial,
      }).catch(err => console.warn("[OpSettings] Supabase save basicos:", err));
    }
  };

  const fmtBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const colecoesVisíveis = colecoes.filter(c => c.temporadaId === selectedTemporadaId);

  if (!user) return null;

  // ─── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#F2F2F2]">
      {/* Header */}
      <header id="tour-op-intro" className="sticky top-0 z-50 bg-gradient-to-r from-[#28071C] to-[#7598CF] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <span className="text-[#F6F3AA] text-base font-semibold">Fashion Mind · Configurações</span>
              <span className="text-[#F6F3AA]/70 text-sm ml-3">Configurações de Operação</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" />
              <span className="text-sm">{user.name}</span>
            </div>
            <button
              onClick={tour.reopen}
              className="text-[#F6F3AA]/50 hover:text-[#F6F3AA] transition-opacity"
              title="Ver tour desta tela"
              aria-label="Abrir tour"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">

        {/* ── CARD 1: Temporadas de Coleções ─────────────────────────────────── */}
        <SettingsCard
          id="tour-op-temporadas"
          icon={<Calendar className="w-6 h-6 text-[#28071C]" />}
          title="Temporadas de Coleções"
          accentColor="#7598CF"
          summary={
            <span className="text-[#28071C]/50 text-sm">
              {temporadas.length > 0 ? `${temporadas.length} temporada${temporadas.length !== 1 ? 's' : ''} cadastrada${temporadas.length !== 1 ? 's' : ''}` : 'Nenhuma temporada cadastrada'}
            </span>
          }
        >
          <div className="flex items-start gap-2 mb-4 mt-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <p className="text-[#28071C]/70 text-sm">
              O sistema cria automaticamente as temporadas padrão ao salvar um Planejamento Estratégico.
              Temporadas marcadas com <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7598CF] bg-[#7598CF]/10 px-1.5 py-0.5 rounded-full uppercase">Auto</span> podem ser editadas com escolha de impacto.
              Temporadas de anos encerrados são somente leitura.
            </p>
          </div>

          {/* Formulário — adicionar nova temporada manual */}
          <p className="text-[#28071C]/50 text-xs font-semibold uppercase tracking-widest mb-3">Adicionar temporada manual</p>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Nome da Temporada</label>
              <input type="text" value={temporadaNome} onChange={e => setTemporadaNome(e.target.value)}
                placeholder="Ex: Resort 2026"
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50" />
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Ano</label>
              <input
                type="number"
                value={temporadaAno}
                onChange={e => setTemporadaAno(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Ex: 2027"
                min={2000} max={2100}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50" />
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Mês de Início</label>
              <select value={temporadaInicio} onChange={e => setTemporadaInicio(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer">
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Mês de Fim</label>
              <select value={temporadaFim} onChange={e => setTemporadaFim(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer">
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <button onClick={handleSaveTemporada}
            className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md mb-6">
            <Save className="w-5 h-5 mr-2" />Salvar Temporada
          </button>

          {/* Tabela de temporadas */}
          <div className="bg-white rounded-lg overflow-hidden border border-[#7598CF]/20">
            <table className="w-full">
              <thead className="bg-[#7598CF]">
                <tr>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Nome</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Ano</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Início</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Fim</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Coleções</th>
                  <th className="px-4 py-3 text-center text-white text-sm uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {temporadas.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-[#28071C]/40 text-sm">Nenhuma temporada cadastrada.</td></tr>
                )}
                {temporadas.map(t => {
                  const n      = colecoes.filter(c => c.temporadaId === t.id).length;
                  const isPast = isTemporadaPast(t);
                  const isEditingThis = editingAutoId === t.id;
                  return (
                    <tr key={t.id} className={`border-b border-[#28071C]/10 ${isPast ? "bg-[#28071C]/3" : "hover:bg-gray-50"}`}>

                      {/* Nome + badges */}
                      <td className="px-4 py-3">
                        {isEditingThis ? (
                          <input autoFocus type="text" value={editingAutoNome}
                            onChange={e => setEditingAutoNome(e.target.value)}
                            className="w-full px-2 py-1 border-2 border-[#7598CF]/50 rounded text-sm text-[#28071C] focus:outline-none" />
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium text-sm ${isPast ? "text-[#28071C]/40" : "text-[#28071C]"}`}>{t.nome}</span>
                            {t.autoGerada && (
                              <span className="text-[10px] font-bold text-[#7598CF] bg-[#7598CF]/10 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                                Auto
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Ano */}
                      <td className="px-4 py-3">
                        {t.anoFiscal
                          ? <span className={`text-sm font-semibold ${isPast ? "text-[#28071C]/35" : "text-[#28071C]"}`}>{t.anoFiscal}{isPast && <span className="ml-1 text-[10px] text-[#28071C]/30 font-normal">enc.</span>}</span>
                          : <span className="text-[#28071C]/25 text-sm">—</span>
                        }
                      </td>

                      {/* Início */}
                      <td className="px-4 py-3">
                        {isEditingThis ? (
                          <select value={editingAutoInicio} onChange={e => setEditingAutoInicio(e.target.value)}
                            className="bg-white border-2 border-[#7598CF]/40 rounded px-2 py-1 text-sm text-[#28071C] focus:outline-none cursor-pointer">
                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <span className={isPast ? "text-[#28071C]/40 text-sm" : "text-[#28071C] text-sm"}>{t.mesInicio}</span>
                        )}
                      </td>

                      {/* Fim */}
                      <td className="px-4 py-3">
                        {isEditingThis ? (
                          <select value={editingAutoFim} onChange={e => setEditingAutoFim(e.target.value)}
                            className="bg-white border-2 border-[#7598CF]/40 rounded px-2 py-1 text-sm text-[#28071C] focus:outline-none cursor-pointer">
                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <span className={isPast ? "text-[#28071C]/40 text-sm" : "text-[#28071C] text-sm"}>{t.mesFim}</span>
                        )}
                      </td>

                      {/* Coleções */}
                      <td className="px-4 py-3">
                        {n > 0
                          ? <span className="text-[11px] bg-[#7598CF]/15 text-[#7598CF] border border-[#7598CF]/30 rounded-full px-2 py-0.5 font-semibold">{n} coleç{n === 1 ? "ão" : "ões"}</span>
                          : <span className="text-[#28071C]/30 text-xs">—</span>
                        }
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {isPast ? (
                            <span title="Ano encerrado — somente leitura" className="p-2 text-[#28071C]/20 cursor-not-allowed">
                              <Lock className="w-4 h-4" />
                            </span>
                          ) : isEditingThis ? (
                            <>
                              <button onClick={handleSaveEditAuto}
                                className="px-3 py-1.5 bg-[#7598CF] text-white rounded text-xs font-semibold hover:opacity-90">
                                Salvar
                              </button>
                              <button onClick={() => setEditingAutoId(null)}
                                className="p-2 text-[#28071C]/40 hover:text-[#28071C] rounded transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Editar: disponível para auto-geradas; imutável para manuais */}
                              {t.autoGerada ? (
                                <button onClick={() => handleStartEditAuto(t)} title="Editar temporada"
                                  className="p-2 text-[#28071C]/50 hover:text-[#28071C] hover:bg-[#28071C]/8 rounded transition-colors">
                                  <Edit className="w-4 h-4" />
                                </button>
                              ) : (
                                <span title="Temporadas manuais são imutáveis após criação"
                                  className="p-2 text-[#28071C]/15 cursor-not-allowed">
                                  <Lock className="w-3.5 h-3.5" />
                                </span>
                              )}
                              <button
                                onClick={() => toggleCanalPanel(t.id)}
                                title="Configurar mês de início por canal"
                                className={`p-2 rounded transition-colors ${
                                  canalPanelId === t.id
                                    ? "text-[#7598CF] bg-[#7598CF]/12"
                                    : "text-[#28071C]/40 hover:text-[#28071C] hover:bg-[#28071C]/8"
                                }`}>
                                <Store className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteTemporada(t)}
                                title="Excluir temporada"
                                className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Painel Canal × Temporada ──────────────────────────────────────── */}
          {canalPanelId && (() => {
            const season = temporadas.find(t => t.id === canalPanelId);
            if (!season) return null;
            const configMap = new Map(canalConfigs.map(c => [c.canal_id, c.mes_inicio]));
            return (
              <div className="mt-4 bg-white border border-[#7598CF]/25 rounded-xl overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-[#7598CF]/8 border-b border-[#7598CF]/15">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#7598CF]" />
                    <p className="text-sm font-semibold text-[#28071C]">
                      Início de vendas por canal — <span className="text-[#7598CF]">{season.nome}</span>
                    </p>
                  </div>
                  <button onClick={() => { setCanalPanelId(null); setEditingCanalId(null); }}
                    className="p-1.5 text-[#28071C]/30 hover:text-[#28071C] rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Linha de referência: Varejo */}
                <div className="flex items-center gap-4 px-5 py-3 border-b border-[#28071C]/6 bg-[#7598CF]/4">
                  <span className="text-[10px] text-[#7598CF] font-bold uppercase tracking-widest w-32 flex-shrink-0">Referência</span>
                  <span className="text-sm text-[#28071C]/70 flex-1">Varejo Físico / E-commerce</span>
                  <span className="text-sm font-semibold text-[#7598CF]">{season.mesInicio}</span>
                  <span className="text-[10px] text-[#28071C]/30 italic">definido na temporada</span>
                </div>

                {/* Canais configuráveis */}
                {canalLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-[#28071C]/40 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
                  </div>
                ) : (
                  <div className="divide-y divide-[#28071C]/5">
                    {CANAIS_B2B.map(canal => {
                      const configured = configMap.get(canal.id);
                      const isEditing  = editingCanalId === canal.id;
                      return (
                        <div key={canal.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#28071C]/2 transition-colors">
                          <span className="text-xs text-[#28071C]/45 font-semibold uppercase tracking-wide w-32 flex-shrink-0">
                            {canal.name}
                          </span>

                          {isEditing ? (
                            <select
                              value={editingCanalMes}
                              onChange={e => setEditingCanalMes(e.target.value)}
                              className="text-sm border-2 border-[#7598CF]/40 rounded-lg px-2 py-1 text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/30 flex-1 max-w-[140px] cursor-pointer">
                              {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : (
                            <span className={`text-sm flex-1 ${configured ? "text-[#28071C] font-semibold" : "text-[#28071C]/30 italic"}`}>
                              {configured ?? "mesmo que varejo"}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSaveCanalConfig(canal.id)}
                                  className="px-3 py-1 bg-[#7598CF] text-white text-xs rounded-lg hover:opacity-90 font-semibold transition-opacity">
                                  Salvar
                                </button>
                                <button onClick={() => setEditingCanalId(null)}
                                  className="p-1.5 text-[#28071C]/40 hover:text-[#28071C] rounded transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingCanalId(canal.id);
                                    setEditingCanalMes(configured ?? season.mesInicio);
                                  }}
                                  title="Alterar mês de início"
                                  className="p-1.5 text-[#28071C]/40 hover:text-[#28071C] hover:bg-[#28071C]/8 rounded transition-colors">
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                {configured && (
                                  <button
                                    onClick={() => handleDeleteCanalConfig(canal.id)}
                                    title="Remover configuração"
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </SettingsCard>

        {/* ── MODAL: Impacto da alteração de temporada automática ─────────────── */}
        {modal && (
          <div className="fixed inset-0 z-[9100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* Cabeçalho */}
              <div className="bg-gradient-to-r from-[#28071C] to-[#7598CF] px-5 py-4 flex items-center justify-between">
                <span className="text-white font-semibold text-sm">
                  {modal.action === "delete" ? "Excluir temporada automática" : "Editar temporada automática"}
                </span>
                <button onClick={() => setModal(null)} className="text-white/60 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Corpo */}
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-center gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
                  <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0" />
                  <p className="text-[#28071C]/70 text-sm">
                    A temporada <strong className="text-[#28071C]">{modal.temporada.nome}</strong> foi criada automaticamente pelo sistema.
                    Escolha o impacto desta alteração:
                  </p>
                </div>

                {modal.hasLinkedColecoes && modal.action === "delete" && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <p className="text-amber-800 text-xs">
                      Esta temporada possui coleções vinculadas. Ao confirmar, as coleções também serão excluídas.
                    </p>
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  {/* Opção A — Pontual */}
                  <button
                    onClick={() => confirmModal("pontual")}
                    className="w-full text-left border-2 border-[#28071C]/12 hover:border-[#7598CF] rounded-xl p-4 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#7598CF]/10 border-2 border-[#7598CF]/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#7598CF]/20">
                        <span className="text-[10px] font-bold text-[#7598CF]">A</span>
                      </div>
                      <div>
                        <p className="text-[#28071C] font-semibold text-sm">
                          Apenas para {modal.temporada.anoFiscal ? `o ano fiscal ${modal.temporada.anoFiscal}` : "esta temporada"}
                        </p>
                        <p className="text-[#28071C]/50 text-xs mt-0.5">
                          A regra padrão permanece intacta. Os próximos anos continuarão sendo gerados com o modelo atual.
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Opção B — Regra geral */}
                  <button
                    onClick={() => confirmModal("regra_geral")}
                    className="w-full text-left border-2 border-[#28071C]/12 hover:border-[#9B8CD8] rounded-xl p-4 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#9B8CD8]/10 border-2 border-[#9B8CD8]/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#9B8CD8]/20">
                        <span className="text-[10px] font-bold text-[#9B8CD8]">B</span>
                      </div>
                      <div>
                        <p className="text-[#28071C] font-semibold text-sm">Alterar a regra padrão</p>
                        <p className="text-[#28071C]/50 text-xs mt-0.5">
                          {modal.action === "edit"
                            ? "Adota este novo modelo como padrão para os próximos anos automaticamente gerados."
                            : "Remove este tipo de temporada do modelo padrão — não será mais gerada automaticamente."}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Rodapé */}
              <div className="px-5 pb-4 flex justify-end">
                <button onClick={() => setModal(null)}
                  className="px-4 py-2 text-sm text-[#28071C]/50 hover:text-[#28071C] transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CARD 2: Coleções / Drops ────────────────────────────────────────── */}
        <SettingsCard
          id="tour-op-colecoes"
          icon={<Layers className="w-6 h-6 text-[#28071C]" />}
          title="Coleções / Drops"
          accentColor="#28071C"
          summary={
            <span className="text-[#28071C]/50 text-sm">
              {colecoes.length > 0 ? `${colecoes.length} coleção${colecoes.length !== 1 ? 'ões' : ''} cadastrada${colecoes.length !== 1 ? 's' : ''}` : 'Nenhuma coleção cadastrada'}
            </span>
          }
        >
          <p className="text-[#28071C]/60 text-sm mt-2 mb-6">
            Cadastre as coleções e drops dentro de cada temporada. As datas podem ser ajustadas
            a qualquer momento para refletir reagendamentos ou atrasos de produção.
          </p>

          {temporadas.length === 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-amber-800 text-sm">Cadastre ao menos uma temporada antes de adicionar coleções.</p>
            </div>
          )}

          {/* Aviso de bloqueio quando editando coleção com produtos */}
          {editingColId !== null && lockedColNames.has(colNome) && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-amber-800 text-sm">
                <strong>Produtos em produção</strong> — esta coleção já possui produtos cadastrados no ERP.
                Apenas as datas de início e fim podem ser alteradas (postergação de lançamento).
              </p>
            </div>
          )}

          {/* Formulário */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Temporada</label>
              <select
                value={selectedTemporadaId}
                onChange={e => setSelectedTemporadaId(e.target.value)}
                disabled={editingColId !== null && lockedColNames.has(colNome)}
                className={`w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 ${
                  editingColId !== null && lockedColNames.has(colNome)
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}>
                <option value="">Selecione…</option>
                {temporadas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Nome da Coleção / Drop</label>
              <input
                type="text"
                value={colNome}
                onChange={e => setColNome(e.target.value)}
                disabled={editingColId !== null && lockedColNames.has(colNome)}
                placeholder="Ex: Drop 1 · Alto Inverno · Cápsula"
                className={`w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 ${
                  editingColId !== null && lockedColNames.has(colNome)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`} />
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Data de Início
                {editingColId !== null && lockedColNames.has(colNome) && (
                  <span className="ml-2 text-[10px] text-amber-600 font-semibold uppercase tracking-wide">editável</span>
                )}
              </label>
              <input type="date" value={colInicio} onChange={e => setColInicio(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 cursor-pointer" />
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">
                Data de Fim
                {editingColId !== null && lockedColNames.has(colNome) && (
                  <span className="ml-2 text-[10px] text-amber-600 font-semibold uppercase tracking-wide">editável</span>
                )}
              </label>
              <input type="date" value={colFim} onChange={e => setColFim(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 cursor-pointer" />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <button onClick={handleSaveColecao}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
              <Save className="w-5 h-5 mr-2" />
              {editingColId !== null ? "Salvar Alterações" : "Adicionar Coleção"}
            </button>
            {editingColId !== null && (
              <button onClick={handleCancelEdit}
                className="px-5 py-3 border-2 border-[#28071C]/20 text-[#28071C]/60 rounded-lg hover:bg-white/60 transition-all text-sm font-semibold">
                Cancelar edição
              </button>
            )}
          </div>

          {/* Selector hint */}
          {selectedTemporadaId && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-[#28071C] bg-[#28071C]/10 border border-[#28071C]/30 rounded-full px-3 py-1 font-semibold">
                {temporadas.find(t => t.id === selectedTemporadaId)?.nome}
              </span>
              <span className="text-xs text-[#28071C]/40">
                — exibindo {colecoesVisíveis.length} coleç{colecoesVisíveis.length === 1 ? "ão" : "ões"}
              </span>
            </div>
          )}

          {/* Tabela de coleções */}
          <div className="bg-white rounded-lg overflow-hidden border border-[#28071C]/20">
            <table className="w-full">
              <thead className="bg-[#28071C]">
                <tr>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Coleção / Drop</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Temporada</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Início</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Fim</th>
                  <th className="px-4 py-3 text-center text-white text-sm uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(selectedTemporadaId ? colecoesVisíveis : colecoes).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[#28071C]/40 text-sm">
                      {selectedTemporadaId
                        ? "Nenhuma coleção nesta temporada. Preencha o formulário acima para adicionar."
                        : "Selecione uma temporada acima ou cadastre coleções para exibi-las aqui."}
                    </td>
                  </tr>
                )}
                {(selectedTemporadaId ? colecoesVisíveis : colecoes).map(c => {
                  const temp     = temporadas.find(t => t.id === c.temporadaId);
                  const isLocked = lockedColNames.has(c.nome);
                  return (
                    <tr key={c.id} className={`border-b border-[#28071C]/10 hover:bg-gray-50 ${editingColId === c.id ? "bg-gray-50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[#28071C] font-medium">{c.nome}</span>
                          {isLocked && (
                            <span
                              title="Há produtos em produção vinculados — apenas datas podem ser alteradas"
                              className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                            >
                              <Lock className="w-2.5 h-2.5" />
                              Em produção
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#28071C]/70 text-sm">{temp?.nome ?? "—"}</td>
                      <td className="px-4 py-3 text-[#28071C]">{fmtDate(c.dataInicio)}</td>
                      <td className="px-4 py-3 text-[#28071C]">{fmtDate(c.dataFim)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditColecao(c)}
                            title={isLocked ? "Apenas datas de entrada podem ser alteradas" : "Editar coleção"}
                            className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {isLocked ? (
                            <span
                              title="Não é possível excluir — há produtos em produção vinculados"
                              className="p-2 text-[#28071C]/20 cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDeleteColecao(c.id)}
                              title="Excluir coleção"
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SettingsCard>

        {/* ── CARD 3: Faixas de Preço (unificado) ─────────────────────────────── */}

        {/* Modal histórico de importação */}
        {showFaixasHistoryModal && (
          <div className="fixed inset-0 z-[9200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowFaixasHistoryModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-gradient-to-r from-[#28071C] to-[#F6F3AA] px-5 py-4 flex items-center justify-between">
                <span className="text-[#28071C] font-semibold text-sm">Histórico de importação — Faixas de Preço</span>
                <button onClick={() => setShowFaixasHistoryModal(false)} className="text-[#28071C]/60 hover:text-[#28071C]"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-5 py-4 space-y-2 max-h-80 overflow-y-auto">
                {faixasImportHistory.length === 0 ? (
                  <p className="text-[#28071C]/40 text-sm text-center py-6">Nenhuma importação registrada.</p>
                ) : faixasImportHistory.map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-[#28071C]/6 last:border-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#28071C] text-sm font-medium truncate">{e.fileName}</p>
                      <p className="text-[#28071C]/40 text-xs">{new Date(e.timestamp).toLocaleString('pt-BR')}</p>
                    </div>
                    <span className="text-[#28071C] text-sm font-semibold shrink-0">{e.rows} linhas</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <SettingsCard
          id="tour-op-faixas"
          icon={<Tag className="w-6 h-6 text-[#28071C]" />}
          title="Faixas de Preço"
          accentColor="#F6F3AA"
          summary={
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              {faixasImportHistory.length > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setShowFaixasHistoryModal(true); }}
                  className="text-[#28071C]/40 hover:text-[#7598CF] text-xs underline underline-offset-2 transition-colors"
                >
                  Última importação: {new Date(faixasImportHistory[0].timestamp).toLocaleDateString('pt-BR')}
                </button>
              )}
              <span className="text-[#28071C]/40 text-xs">·</span>
              <span className="text-[#28071C]/50 text-xs">
                {faixasPreco.length} por categoria · {tierLabels.length} catálogo
              </span>
            </div>
          }
        >

          {/* Abas */}
          <div className="flex gap-1 mt-3 mb-5 bg-[#28071C]/5 rounded-xl p-1 w-fit">
            {(["categoria", "catalogo"] as const).map(tab => (
              <button key={tab} type="button"
                onClick={() => setFaixasTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  faixasTab === tab
                    ? "bg-white text-[#28071C] shadow-sm"
                    : "text-[#28071C]/50 hover:text-[#28071C]"
                }`}
              >
                {tab === "categoria" ? "Por Categoria (P1/P2/P3)" : "Catálogo"}
              </button>
            ))}
          </div>

          {/* ── ABA: Por Categoria ───────────────────────────────────────────── */}
          {faixasTab === "categoria" && (
            <div>
              {/* Ações topo */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <label className={`flex items-center gap-2 px-4 py-2.5 bg-[#28071C] text-white rounded-lg cursor-pointer hover:bg-[#28071C]/85 transition-all text-sm font-semibold shadow-sm ${fpImporting ? "opacity-60 pointer-events-none" : ""}`}>
                  <Upload className="w-4 h-4" />
                  {fpImporting ? "Importando…" : "Importar Planilha"}
                  <input type="file" accept=".csv,.tsv,.txt,.xlsx" className="hidden" onChange={handleImportFaixasFile} />
                </label>
                <a
                  href="data:text/csv;charset=utf-8,Grupo,Categoria,P1_Min,P1_Max,P2_Min,P2_Max,P3_Min,P3_Max%0AVestuário,Blusas,50,150,151,300,301,600%0AVestuário,Vestidos,80,200,201,400,401,800"
                  download="modelo_faixas_preco.csv"
                  className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-[#28071C]/20 text-[#28071C]/60 rounded-lg hover:border-[#28071C]/40 hover:text-[#28071C] transition-all text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Baixar Modelo CSV
                </a>
                {fpSavedOk && (
                  <span className="text-green-700 text-sm font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    Salvo com sucesso!
                  </span>
                )}
              </div>

              <div className="flex items-start gap-2 mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-amber-800 text-sm">
                  Colunas do modelo: <strong>Divisão (opcional), Grupo, Categoria, P1_Min, P1_Max, P2_Min, P2_Max, P3_Min, P3_Max</strong>.
                  Alterações valem apenas para produtos novos.
                </p>
              </div>

              {/* Formulário manual */}
              <p className="text-[#28071C]/50 text-xs font-semibold uppercase tracking-widest mb-3">Adicionar manualmente</p>
              <div className={`grid gap-4 mb-4 ${hierDivisaoAtiva ? "grid-cols-3" : "grid-cols-2"}`}>
                {hierDivisaoAtiva && (
                  <div>
                    <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Divisão</label>
                    <input type="text" value={fpDivisao} onChange={e => setFpDivisao(e.target.value)}
                      placeholder="Ex: Feminino Adulto"
                      className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#F6F3AA] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50" />
                  </div>
                )}
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Grupo</label>
                  <select value={fpGrupo} onChange={e => setFpGrupo(e.target.value)}
                    className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#F6F3AA] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer">
                    <option value="">Selecione…</option>
                    {grupos.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Categoria</label>
                  <select value={fpCategoria} onChange={e => setFpCategoria(e.target.value)}
                    className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#F6F3AA] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer">
                    <option value="">Selecione…</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-3 mb-5">
                {([
                  { label: "P1", color: "bg-green-100 text-green-800",   inicio: fpP1Inicio, setInicio: setFpP1Inicio, fim: fpP1Fim, setFim: setFpP1Fim },
                  { label: "P2", color: "bg-yellow-100 text-yellow-800", inicio: fpP2Inicio, setInicio: setFpP2Inicio, fim: fpP2Fim, setFim: setFpP2Fim },
                  { label: "P3", color: "bg-purple-100 text-purple-800", inicio: fpP3Inicio, setInicio: setFpP3Inicio, fim: fpP3Fim, setFim: setFpP3Fim },
                ] as const).map(({ label, color, inicio, setInicio, fim, setFim }) => (
                  <div key={label} className="flex items-center gap-4">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full w-10 text-center shrink-0 ${color}`}>{label}</span>
                    <div className="flex items-center gap-3 flex-1">
                      <label className="text-[#28071C]/60 text-sm whitespace-nowrap">R$ Início</label>
                      <input type="number" value={inicio} onChange={e => setInicio(Number(e.target.value))} min={0}
                        className="w-28 bg-white rounded-lg px-3 py-2 text-[#28071C] border-2 border-[#F6F3AA] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 text-sm" />
                      <span className="text-[#28071C]/30 font-bold">→</span>
                      <label className="text-[#28071C]/60 text-sm whitespace-nowrap">R$ Fim</label>
                      <input type="number" value={fim} onChange={e => setFim(Number(e.target.value))} min={0}
                        className="w-28 bg-white rounded-lg px-3 py-2 text-[#28071C] border-2 border-[#F6F3AA] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleSaveFaixaPreco}
                className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md mb-6">
                <Save className="w-5 h-5 mr-2" />Salvar Faixa
              </button>

              {/* Tabela */}
              {faixasPreco.length > 0 ? (
                <div className="bg-white rounded-lg overflow-hidden border border-[#F6F3AA]/80">
                  <table className="w-full">
                    <thead className="bg-[#F6F3AA]">
                      <tr>
                        {["Grupo","Categoria","P1","P2","P3","Ações"].map(h => (
                          <th key={h} className={`px-4 py-3 text-[#28071C] text-sm uppercase tracking-wide ${h === "Ações" ? "text-center" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {faixasPreco.map(f => (
                        <tr key={f.id} className="border-b border-[#28071C]/10 hover:bg-gray-50">
                          <td className="px-4 py-3 text-[#28071C] font-medium">{f.grupo}</td>
                          <td className="px-4 py-3 text-[#28071C]">{f.categoria}</td>
                          <td className="px-4 py-3 text-[#28071C] text-sm">{fmtBrl(f.faixas.P1.inicio)} – {fmtBrl(f.faixas.P1.fim)}</td>
                          <td className="px-4 py-3 text-[#28071C] text-sm">{fmtBrl(f.faixas.P2.inicio)} – {fmtBrl(f.faixas.P2.fim)}</td>
                          <td className="px-4 py-3 text-[#28071C] text-sm">{fmtBrl(f.faixas.P3.inicio)} – {fmtBrl(f.faixas.P3.fim)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleDeleteFaixa(f.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-[#28071C]/30 text-sm bg-white rounded-lg border border-dashed border-[#28071C]/15">
                  Nenhuma faixa cadastrada. Importe o modelo ou adicione manualmente.
                </div>
              )}
            </div>
          )}

          {/* ── ABA: Catálogo ────────────────────────────────────────────────── */}
          {faixasTab === "catalogo" && (
            <div>
              <div className="flex items-start gap-2 mb-5 bg-[#9B8CD8]/8 border border-[#9B8CD8]/20 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-[#9B8CD8] flex-shrink-0 mt-0.5" />
                <p className="text-[#28071C]/70 text-sm">
                  Rótulos de faixa usados no catálogo de produtos (campo <code className="bg-[#28071C]/6 px-1 rounded text-xs">price_tier</code>).
                  Exemplos: <em>Entrada</em>, <em>Médio</em>, <em>Premium</em>.
                </p>
              </div>

              <p className="text-[#28071C]/50 text-xs font-semibold uppercase tracking-widest mb-3">Adicionar manualmente</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Nome da Faixa</label>
                  <input type="text" value={tlNome} onChange={e => setTlNome(e.target.value)}
                    placeholder="Ex: Entrada"
                    className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#9B8CD8]/30 focus:outline-none focus:ring-2 focus:ring-[#9B8CD8]/50" />
                </div>
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Preço Mínimo (R$)</label>
                  <input type="number" min={0} value={tlMin} onChange={e => setTlMin(Number(e.target.value))}
                    className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#9B8CD8]/30 focus:outline-none focus:ring-2 focus:ring-[#9B8CD8]/50" />
                </div>
                <div>
                  <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Preço Máximo (R$)</label>
                  <input type="number" min={0} value={tlMax} onChange={e => setTlMax(Number(e.target.value))}
                    className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#9B8CD8]/30 focus:outline-none focus:ring-2 focus:ring-[#9B8CD8]/50" />
                </div>
              </div>
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <button onClick={handleAddTierLabel}
                  className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
                  <Plus className="w-5 h-5 mr-2" />Adicionar Faixa
                </button>
                <label className={`flex items-center gap-2 px-5 py-3 border-2 border-[#9B8CD8]/40 text-[#28071C]/70 rounded-lg cursor-pointer hover:border-[#9B8CD8] hover:text-[#9B8CD8] transition-all ${tlImporting ? "opacity-60 pointer-events-none" : ""}`}>
                  <Upload className="w-4 h-4" />
                  {tlImporting ? "Importando…" : "Importar CSV"}
                  <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleImportTierLabelsFile} />
                </label>
                <span className="text-[#28071C]/35 text-xs">CSV: Nome, Preço Mínimo, Preço Máximo</span>
                {tlSavedOk && (
                  <span className="text-green-700 text-sm font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">Faixa salva!</span>
                )}
              </div>

              {tierLabels.length > 0 ? (
                <div className="bg-white rounded-lg overflow-hidden border border-[#9B8CD8]/20">
                  <table className="w-full">
                    <thead className="bg-[#9B8CD8]/15">
                      <tr>
                        {["Nome da Faixa","Preço Mínimo","Preço Máximo","Ações"].map(h => (
                          <th key={h} className={`px-4 py-3 text-[#28071C] text-sm uppercase tracking-wide ${h === "Ações" ? "text-center" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tierLabels.slice().sort((a, b) => a.min - b.min).map(t => (
                        <tr key={t.id} className="border-b border-[#28071C]/8 hover:bg-gray-50">
                          <td className="px-4 py-3 text-[#28071C] font-semibold">{t.nome}</td>
                          <td className="px-4 py-3 text-[#28071C] text-sm">{fmtBrl(t.min)}</td>
                          <td className="px-4 py-3 text-[#28071C] text-sm">{fmtBrl(t.max)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleDeleteTierLabel(t.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-[#28071C]/30 text-sm bg-white rounded-lg border border-dashed border-[#28071C]/15">
                  Nenhuma faixa cadastrada.
                </div>
              )}
            </div>
          )}
        </SettingsCard>

        {/* ── CARD 4: Importação de Planilhas ──────────────────────────────────── */}
        <SettingsCard
          id="tour-op-importacao"
          icon={<FileSpreadsheet className="w-6 h-6 text-[#28071C]" />}
          title="Importação de Planilhas"
          accentColor="#9B8CD8"
          summary={
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              {!dbCounts.loaded ? (
                <span className="text-xs text-[#28071C]/30 animate-pulse">carregando…</span>
              ) : (
                <>
                  <span className="flex items-center gap-1 text-xs text-[#28071C]/50">
                    <Package className="w-3.5 h-3.5" />{dbCounts.products.toLocaleString('pt-BR')} produtos
                  </span>
                  <span className="text-[#28071C]/20 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-[#28071C]/50">
                    <ShoppingCart className="w-3.5 h-3.5" />{dbCounts.orders.toLocaleString('pt-BR')} ordens
                  </span>
                  <span className="text-[#28071C]/20 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-[#28071C]/50">
                    <BarChart3 className="w-3.5 h-3.5" />{dbCounts.inventory.toLocaleString('pt-BR')} estoques
                  </span>
                  <span className="text-[#28071C]/20 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-[#28071C]/50">
                    <TrendingUp className="w-3.5 h-3.5" />{dbCounts.sales.toLocaleString('pt-BR')} vendas
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); fetchDbCounts(); }}
                    className="text-[#28071C]/25 hover:text-[#9B8CD8] transition-colors ml-1"
                    title="Atualizar contagens"
                  >
                    <History className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          }
        >
          <div className="flex items-center justify-between mt-1 mb-4">
            <p className="text-[#28071C]/50 text-sm">
              Importe catálogo, vendas, ordens de produção/compra, estoque ou hierarquia de códigos
            </p>
            {activeImportType && (
              <button
                onClick={() => setActiveImportType(null)}
                className="flex items-center gap-1.5 text-[#28071C]/40 hover:text-[#28071C] text-sm transition-colors"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>

          {/* Histórico de importações */}
          {!activeImportType && importHistory.length > 0 && (
            <div className="mb-5">
              <p className="text-[#28071C]/50 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Histórico de importações
              </p>
              <div className="border border-[#9B8CD8]/20 rounded-xl overflow-hidden divide-y divide-[#28071C]/6">
                {importHistory.slice(0, 5).map(entry => (
                  <div key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setHistoryDetailId(historyDetailId === entry.id ? null : entry.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#9B8CD8]/4 transition-colors group"
                    >
                      {entry.errors === 0
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[#28071C] text-sm font-medium truncate">{entry.label}</p>
                        <p className="text-[#28071C]/40 text-xs truncate">{entry.fileName}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[#28071C] text-sm font-semibold">{entry.importedRows.toLocaleString('pt-BR')} registros</p>
                        <p className="text-[#28071C]/40 text-xs">{new Date(entry.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-[#28071C]/20 group-hover:text-[#9B8CD8] transition-all shrink-0 ml-1 ${historyDetailId === entry.id ? 'rotate-90' : ''}`} />
                    </button>
                    {historyDetailId === entry.id && (
                      <div className="px-4 pb-3 bg-[#9B8CD8]/4 border-t border-[#9B8CD8]/10">
                        <div className="grid grid-cols-3 gap-3 pt-3">
                          <div>
                            <p className="text-[#28071C]/50 text-xs uppercase tracking-wide">Tipo</p>
                            <p className="text-[#28071C] text-sm font-medium mt-0.5">{entry.label}</p>
                          </div>
                          <div>
                            <p className="text-[#28071C]/50 text-xs uppercase tracking-wide">Importados</p>
                            <p className="text-emerald-600 text-sm font-semibold mt-0.5">{entry.importedRows.toLocaleString('pt-BR')}</p>
                          </div>
                          <div>
                            <p className="text-[#28071C]/50 text-xs uppercase tracking-wide">Erros</p>
                            <p className={`text-sm font-semibold mt-0.5 ${entry.errors > 0 ? 'text-amber-600' : 'text-[#28071C]/30'}`}>{entry.errors}</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-[#28071C]/50 text-xs uppercase tracking-wide">Arquivo</p>
                            <p className="text-[#28071C] text-sm mt-0.5 truncate">{entry.fileName}</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-[#28071C]/50 text-xs uppercase tracking-wide">Data / Hora</p>
                            <p className="text-[#28071C] text-sm mt-0.5">{new Date(entry.timestamp).toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Último resultado importado */}
          {!activeImportType && lastImportResult && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 mt-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-emerald-800 text-sm font-semibold">
                  {IMPORT_CONFIG[lastImportResult.dataType]?.label} — {lastImportResult.importedRows} registros importados
                </p>
                <p className="text-emerald-700 text-xs">{lastImportResult.fileName}</p>
              </div>
              <button
                onClick={() => setLastImportResult(null)}
                className="text-emerald-400 hover:text-emerald-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Wizard ativo */}
          {activeImportType ? (
            <div className="mt-4">
              <ImportWizard
                dataType={activeImportType}
                tenantId={(() => {
                  const cu = sessionStorage.getItem("currentUser");
                  if (!cu) return "";
                  const u = JSON.parse(cu);
                  return sessionStorage.getItem("activeTenantId") ?? u.tenant_id ?? "";
                })()}
                onComplete={(result) => {
                  setLastImportResult({ ...result });
                  setActiveImportType(null);
                  saveImportHistory({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    dataType: result.dataType,
                    label: IMPORT_CONFIG[result.dataType]?.label ?? result.dataType,
                    importedRows: result.importedRows,
                    errors: result.errors,
                    fileName: result.fileName,
                    timestamp: new Date().toISOString(),
                  });
                  // Refresh DB counts after import
                  fetchDbCounts();
                }}
                onCancel={() => setActiveImportType(null)}
              />
            </div>
          ) : (
            /* Seletor de tipo de importação */
            <div className="mt-5 grid grid-cols-1 gap-3">
              {(Object.entries(IMPORT_CONFIG) as [ImportDataType, typeof IMPORT_CONFIG[ImportDataType]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setActiveImportType(key)}
                  className="flex items-center gap-4 px-4 py-3.5 border-2 border-[#28071C]/10 hover:border-[#9B8CD8]/50 rounded-xl text-left transition-all hover:bg-[#9B8CD8]/4 group"
                >
                  <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
                  <div className="flex-1">
                    <p className="text-[#28071C] font-semibold text-sm">{cfg.label}</p>
                    <p className="text-[#28071C]/50 text-xs mt-0.5">{cfg.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#28071C]/30 group-hover:text-[#9B8CD8] transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </SettingsCard>

        {/* ── CARD 5: Hierarquia de Produtos ───────────────────────────────────── */}
        {showConceptSlides && <HierarchyConceptSlides onClose={() => setShowConceptSlides(false)} />}

        <SettingsCard
          id="tour-op-hierarquia"
          icon={<Layers className="w-6 h-6 text-[#28071C]" />}
          title="Hierarquia de Produtos"
          accentColor="#7598CF"
          summary={(() => {
            const divs  = new Set(hierPaths.map(p => p.division).filter(Boolean)).size;
            const cats  = new Set(hierPaths.map(p => p.category).filter(Boolean)).size;
            const total = hierPaths.reduce((s, p) => s + p.count, 0);
            if (total === 0) return <span className="text-[#28071C]/40 text-sm">Nenhum produto com hierarquia cadastrada</span>;
            return <span className="text-[#28071C]/50 text-sm">{divs} {hierLabels.divisao.toLowerCase()}s · {cats} {hierLabels.categoria.toLowerCase()}s · {total} produtos</span>;
          })()}
        >
          {/* Conceito + aviso de rótulos pendentes */}
          <div className="flex items-center gap-3 mt-1 mb-4">
            <button onClick={() => setShowConceptSlides(true)}
              className="flex items-center gap-1.5 text-xs text-[#7598CF] font-semibold hover:text-[#28071C] transition-colors">
              <BookOpen className="w-3.5 h-3.5" />Entender a hierarquia
            </button>
            {hierLabelsPending && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                <AlertCircle className="w-3 h-3" />Configure os rótulos dos níveis abaixo
              </span>
            )}
          </div>

          {/* ── Rótulos "de × para" ──────────────────────────────────────────────── */}
          <div className="mb-5 bg-[#7598CF]/6 border border-[#7598CF]/20 rounded-xl p-4">
            <p className="text-[#28071C] font-semibold text-sm mb-1">Seus Rótulos</p>
            <p className="text-[#28071C]/50 text-xs mb-4">
              Como cada nível da hierarquia aparece na sua marca. O sistema usa os nomes internos (Divisão, Categoria…) mas você pode personalizar a exibição.
            </p>
            <div className="grid grid-cols-4 gap-3 mb-3">
              {(["divisao","categoria","subcategoria","linha"] as const).map((key, i) => {
                const placeholders = ["Ex: Departamento","Ex: Grupo","Ex: Família","Ex: Linha"];
                const defaults     = ["Divisão","Categoria","Subcategoria","Linha"];
                return (
                  <div key={key}>
                    <label className="block text-[#28071C]/50 text-xs font-semibold uppercase tracking-wider mb-1.5">{defaults[i]}</label>
                    <input
                      type="text"
                      value={hierLabels[key]}
                      onChange={e => setHierLabels(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholders[i]}
                      className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/25 focus:outline-none focus:border-[#7598CF]/60"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveHierLabels}
                className="flex items-center px-4 py-2 bg-[#7598CF] text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
                <Save className="w-3.5 h-3.5 mr-1.5" />Salvar Rótulos
              </button>
              {hierLabelsSavedOk && <span className="text-green-700 text-xs font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">Salvo!</span>}
            </div>
          </div>

          {/* ── Toggle Divisão ───────────────────────────────────────────────────── */}
          <div className="mb-5 p-4 bg-[#28071C]/5 rounded-xl border border-[#28071C]/10 flex items-center justify-between">
            <div>
              <p className="text-[#28071C] font-semibold text-sm">Usar nível {hierLabels.divisao}</p>
              <p className="text-[#28071C]/50 text-xs mt-0.5">Nível acima de {hierLabels.categoria} — Ex: Feminino, Masculino, Infantil</p>
            </div>
            <button onClick={() => setHierDivisaoAtiva(!hierDivisaoAtiva)}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${hierDivisaoAtiva ? "bg-[#7598CF]" : "bg-[#28071C]/20"}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${hierDivisaoAtiva ? "translate-x-7" : "translate-x-1"}`} />
            </button>
          </div>

          {/* ── Árvore de produtos reais ─────────────────────────────────────────── */}
          {(() => {
            // Construir árvore a partir dos caminhos
            type TNode = { label: string; count: number; path: Partial<{ division: string; category: string; subcategory: string; linha: string }>; children: Map<string, TNode> };
            const makeNode = (label: string, path: TNode["path"]): TNode => ({ label, count: 0, path, children: new Map() });

            const root = new Map<string, TNode>();
            for (const p of hierPaths) {
              const d = p.division  ?? "(sem divisão)";
              const c = p.category  ?? "(sem categoria)";
              const s = p.subcategory ?? "(sem subcategoria)";
              const l = p.linha     ?? "(sem linha)";

              if (hierDivisaoAtiva) {
                if (!root.has(d)) root.set(d, makeNode(d, { division: p.division ?? undefined }));
                const dn = root.get(d)!; dn.count += p.count;
                if (!dn.children.has(c)) dn.children.set(c, makeNode(c, { division: p.division ?? undefined, category: p.category ?? undefined }));
                const cn = dn.children.get(c)!; cn.count += p.count;
                if (!cn.children.has(s)) cn.children.set(s, makeNode(s, { division: p.division ?? undefined, category: p.category ?? undefined, subcategory: p.subcategory ?? undefined }));
                const sn = cn.children.get(s)!; sn.count += p.count;
                if (!sn.children.has(l)) sn.children.set(l, makeNode(l, { division: p.division ?? undefined, category: p.category ?? undefined, subcategory: p.subcategory ?? undefined, linha: p.linha ?? undefined }));
                sn.children.get(l)!.count += p.count;
              } else {
                if (!root.has(c)) root.set(c, makeNode(c, { category: p.category ?? undefined }));
                const cn = root.get(c)!; cn.count += p.count;
                if (!cn.children.has(s)) cn.children.set(s, makeNode(s, { category: p.category ?? undefined, subcategory: p.subcategory ?? undefined }));
                const sn = cn.children.get(s)!; sn.count += p.count;
                if (!sn.children.has(l)) sn.children.set(l, makeNode(l, { category: p.category ?? undefined, subcategory: p.subcategory ?? undefined, linha: p.linha ?? undefined }));
                sn.children.get(l)!.count += p.count;
              }
            }

            // Gera chave única por nó para controle de expansão
            const nodeKey = (node: TNode) =>
              [node.path.division, node.path.category, node.path.subcategory, node.path.linha]
                .filter(Boolean).join("|");

            const renderNode = (node: TNode, depth: number): React.ReactNode => {
              const isLeaf = node.children.size === 0;
              const key    = nodeKey(node);
              const isOpen = hierExpanded.has(key);
              const indent = depth * 20;
              return (
                <div key={key}>
                  <div
                    className="flex items-center gap-2 py-2.5 border-b border-[#28071C]/6 hover:bg-[#7598CF]/4 group transition-colors cursor-pointer select-none"
                    style={{ paddingLeft: `${16 + indent}px`, paddingRight: "16px" }}
                    onClick={() => !isLeaf && toggleExpand(key)}
                  >
                    {/* Ícone de expansão */}
                    {!isLeaf ? (
                      <ChevronRight className={`w-3.5 h-3.5 text-[#28071C]/40 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}

                    {/* Label */}
                    <span className={`text-[#28071C] text-sm ${depth === 0 ? "font-bold" : depth === 1 ? "font-semibold" : "font-normal"}`}>
                      {node.label}
                    </span>

                    {/* Contagem */}
                    <span className="ml-auto text-[#28071C]/30 text-xs shrink-0 tabular-nums">{node.count} pç</span>

                    {/* Botão migrar — visível ao hover */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setShowMigration(true); setMigStep(1);
                        setMigFilterDiv(node.path.division ?? "");
                        setMigFilterCat(node.path.category ?? "");
                        setMigFilterSub(node.path.subcategory ?? "");
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-3 shrink-0 flex items-center gap-1 text-[10px] text-[#7598CF] font-semibold px-2 py-0.5 rounded border border-[#7598CF]/40 hover:bg-[#7598CF]/10"
                    >
                      <Shuffle className="w-3 h-3" />Migrar
                    </button>
                  </div>

                  {/* Filhos — só renderiza se expandido */}
                  {isOpen && !isLeaf && (
                    <div>
                      {Array.from(node.children.values()).map(child => renderNode(child, depth + 1))}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[#28071C]/70 text-xs font-semibold uppercase tracking-widest">
                    Estrutura de produtos
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={handleRefreshHierarchy} disabled={hierLoading}
                      className="flex items-center gap-1 text-xs text-[#28071C]/50 hover:text-[#7598CF] transition-colors disabled:opacity-40">
                      <RefreshCw className={`w-3.5 h-3.5 ${hierLoading ? "animate-spin" : ""}`} />
                      {hierLoading ? "Carregando…" : "Atualizar"}
                    </button>
                  </div>
                </div>

                {hierLoading ? (
                  <div className="text-center py-10 text-[#28071C]/30 text-sm">Carregando hierarquia…</div>
                ) : root.size === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-[#28071C]/10 rounded-xl">
                    <Layers className="w-8 h-8 text-[#28071C]/15 mx-auto mb-2" />
                    <p className="text-[#28071C]/40 text-sm">Nenhum produto com hierarquia cadastrada.</p>
                    <p className="text-[#28071C]/30 text-xs mt-1">Importe a planilha do ERP para preencher automaticamente.</p>
                  </div>
                ) : (
                  <div className="border border-[#28071C]/10 rounded-xl overflow-hidden bg-white">
                    {Array.from(root.values()).map(node => renderNode(node, 0))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Ações: migrar / importar ─────────────────────────────────────────── */}
          {!showMigration && (
            <div className="flex items-center gap-3 pt-4 border-t border-[#28071C]/8 flex-wrap">
              <button onClick={() => { setShowMigration(true); setMigStep(1); setMigFilterDiv(""); setMigFilterCat(""); setMigFilterSub(""); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm">
                <Plus className="w-4 h-4" />Nova Categoria / Migrar Produtos
              </button>
              <label className={`flex items-center gap-2 px-4 py-2.5 border-2 border-[#7598CF]/40 text-[#28071C]/70 rounded-lg cursor-pointer hover:border-[#7598CF] hover:text-[#7598CF] transition-all text-sm ${hierImporting ? "opacity-60 pointer-events-none" : ""}`}>
                <Upload className="w-4 h-4" />
                {hierImporting ? "Importando…" : "Importar Planilha ERP"}
                <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleImportHierFile} />
              </label>
              <a href="data:text/csv;charset=utf-8,SKU,Divisao,Categoria,Subcategoria,Linha%0A001234,Feminino,Sapatos,Loafer,Casual%0A001235,Feminino,Sapatos,Salto Alto,Festa"
                download="modelo_hierarquia.csv"
                className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C]/70 transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5" />Baixar modelo CSV
              </a>
            </div>
          )}

          {/* Resultado da importação */}
          {hierImportResult && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 font-semibold">{hierImportResult.updated} atualizados</span>
              {hierImportResult.notFound > 0 && <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">{hierImportResult.notFound} SKUs não encontrados</span>}
              <button onClick={() => setHierImportResult(null)} className="text-[#28071C]/30 hover:text-[#28071C]/60"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ── Painel de Migração inline ────────────────────────────────────────── */}
          {showMigration && (
            <div className="mt-4 border-2 border-[#7598CF]/25 rounded-2xl bg-[#7598CF]/4 p-5">
              {/* Cabeçalho do painel */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shuffle className="w-5 h-5 text-[#7598CF]" />
                  <p className="text-[#28071C] font-bold text-sm">Nova Categoria / Migração de Produtos</p>
                </div>
                <button onClick={resetMigration} className="p-1 text-[#28071C]/40 hover:text-[#28071C]/70 rounded-lg"><X className="w-4 h-4" /></button>
              </div>

              {/* Passos */}
              <div className="flex items-center gap-2 mb-5 text-xs font-semibold">
                {[1,2,3].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${migStep === s ? "bg-[#7598CF] border-[#7598CF] text-white" : migStep > s ? "bg-green-500 border-green-500 text-white" : "border-[#28071C]/20 text-[#28071C]/30"}`}>{migStep > s ? "✓" : s}</span>
                    <span className={migStep === s ? "text-[#7598CF]" : migStep > s ? "text-green-600" : "text-[#28071C]/30"}>
                      {s === 1 ? "Destino" : s === 2 ? "Produtos" : "Confirmar"}
                    </span>
                    {s < 3 && <span className="text-[#28071C]/20">→</span>}
                  </div>
                ))}
              </div>

              {/* ── Passo 1: Definir destino ── */}
              {migStep === 1 && (
                <div>
                  <p className="text-[#28071C]/60 text-xs mb-3">Defina o caminho de hierarquia de destino. Deixe em branco os níveis que não serão alterados.</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {hierDivisaoAtiva && (
                      <div>
                        <label className="block text-[#28071C]/60 text-xs font-semibold uppercase tracking-wider mb-1.5">{hierLabels.divisao}</label>
                        <input type="text" value={migNewDiv} onChange={e => setMigNewDiv(e.target.value)}
                          list="mig-div-list" placeholder={`Ex: Feminino`}
                          className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#28071C] border-2 border-[#7598CF]/25 focus:outline-none focus:border-[#7598CF]/60" />
                        <datalist id="mig-div-list">{hierDistinctVals.divisions.map(v => <option key={v} value={v} />)}</datalist>
                      </div>
                    )}
                    <div>
                      <label className="block text-[#28071C]/60 text-xs font-semibold uppercase tracking-wider mb-1.5">{hierLabels.categoria} <span className="text-red-400">*</span></label>
                      <input type="text" value={migNewCat} onChange={e => setMigNewCat(e.target.value)}
                        list="mig-cat-list" placeholder={`Ex: Loafer`}
                        className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#28071C] border-2 border-[#7598CF]/25 focus:outline-none focus:border-[#7598CF]/60" />
                      <datalist id="mig-cat-list">{hierDistinctVals.categories.map(v => <option key={v} value={v} />)}</datalist>
                    </div>
                    <div>
                      <label className="block text-[#28071C]/60 text-xs font-semibold uppercase tracking-wider mb-1.5">{hierLabels.subcategoria}</label>
                      <input type="text" value={migNewSub} onChange={e => setMigNewSub(e.target.value)}
                        list="mig-sub-list" placeholder={`Ex: Salto Baixo`}
                        className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#28071C] border-2 border-[#7598CF]/25 focus:outline-none focus:border-[#7598CF]/60" />
                      <datalist id="mig-sub-list">{hierDistinctVals.subcategories.map(v => <option key={v} value={v} />)}</datalist>
                    </div>
                    <div>
                      <label className="block text-[#28071C]/60 text-xs font-semibold uppercase tracking-wider mb-1.5">{hierLabels.linha}</label>
                      <input type="text" value={migNewLinha} onChange={e => setMigNewLinha(e.target.value)}
                        list="mig-lin-list" placeholder={`Ex: Casual`}
                        className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#28071C] border-2 border-[#7598CF]/25 focus:outline-none focus:border-[#7598CF]/60" />
                      <datalist id="mig-lin-list">{hierDistinctVals.linhas.map(v => <option key={v} value={v} />)}</datalist>
                    </div>
                  </div>
                  <button onClick={() => { setMigStep(2); handleMigSearch(); }}
                    disabled={!migNewCat.trim()}
                    className="px-5 py-2.5 bg-[#7598CF] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
                    Próximo: Selecionar Produtos →
                  </button>
                </div>
              )}

              {/* ── Passo 2: Selecionar produtos ── */}
              {migStep === 2 && (
                <div>
                  {/* Filtros */}
                  <div className="mb-3">
                    <div className="flex gap-1 mb-3 bg-[#28071C]/8 rounded-xl p-1 w-fit">
                      {(["manual","keyword","material"] as const).map(m => (
                        <button key={m} onClick={() => { setMigMode(m); if (m !== migMode) { setMigResults([]); setMigSelected(new Set()); } }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${migMode === m ? "bg-white shadow text-[#28071C]" : "text-[#28071C]/50 hover:text-[#28071C]"}`}>
                          {m === "manual" ? "Por Hierarquia" : m === "keyword" ? "Por Descrição" : "Por Material"}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {migMode === "manual" && (
                        <>
                          {hierDivisaoAtiva && (
                            <select value={migFilterDiv} onChange={e => setMigFilterDiv(e.target.value)}
                              className="bg-white border-2 border-[#7598CF]/20 rounded-lg px-3 py-2 text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF]/50">
                              <option value="">Todas as {hierLabels.divisao}s</option>
                              {hierDistinctVals.divisions.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          )}
                          <select value={migFilterCat} onChange={e => setMigFilterCat(e.target.value)}
                            className="bg-white border-2 border-[#7598CF]/20 rounded-lg px-3 py-2 text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF]/50">
                            <option value="">Todas as {hierLabels.categoria}s</option>
                            {hierDistinctVals.categories.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                          <select value={migFilterSub} onChange={e => setMigFilterSub(e.target.value)}
                            className="bg-white border-2 border-[#7598CF]/20 rounded-lg px-3 py-2 text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF]/50">
                            <option value="">Todas as {hierLabels.subcategoria}s</option>
                            {hierDistinctVals.subcategories.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </>
                      )}
                      {migMode === "keyword" && (
                        <input type="text" value={migKeyword} onChange={e => setMigKeyword(e.target.value)}
                          placeholder="Termo na descrição do produto…"
                          className="flex-1 min-w-48 bg-white border-2 border-[#7598CF]/20 rounded-lg px-3 py-2 text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF]/50" />
                      )}
                      {migMode === "material" && (
                        <select value={migMaterial} onChange={e => setMigMaterial(e.target.value)}
                          className="bg-white border-2 border-[#7598CF]/20 rounded-lg px-3 py-2 text-xs text-[#28071C] focus:outline-none focus:border-[#7598CF]/50 flex-1">
                          <option value="">Selecione o material…</option>
                          {hierDistinctVals.materials.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      )}
                      <button onClick={handleMigSearch} disabled={migSearching}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#7598CF] text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                        <Search className="w-3.5 h-3.5" />{migSearching ? "Buscando…" : "Buscar"}
                      </button>
                    </div>
                  </div>

                  {/* Lista de produtos */}
                  {migResults.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-[#28071C]/60">{migResults.length} produto{migResults.length !== 1 ? "s" : ""} encontrado{migResults.length !== 1 ? "s" : ""}</p>
                        <button onClick={toggleMigAll} className="flex items-center gap-1 text-xs text-[#7598CF] font-semibold hover:opacity-70 transition-opacity">
                          {migSelected.size === migResults.length
                            ? <><CheckSquare className="w-3.5 h-3.5" />Desmarcar todos</>
                            : <><Square className="w-3.5 h-3.5" />Selecionar todos</>
                          }
                        </button>
                      </div>
                      <div className="max-h-56 overflow-y-auto border border-[#28071C]/10 rounded-xl bg-white">
                        {migResults.map(p => (
                          <label key={p.sku} className="flex items-center gap-3 px-3 py-2 hover:bg-[#7598CF]/5 cursor-pointer border-b border-[#28071C]/5 last:border-0">
                            <input type="checkbox" checked={migSelected.has(p.sku)} onChange={() => toggleMigSku(p.sku)}
                              className="w-3.5 h-3.5 accent-[#7598CF] shrink-0" />
                            <span className="text-xs text-[#28071C]/50 font-mono w-20 shrink-0">{p.sku}</span>
                            <span className="text-xs text-[#28071C] truncate flex-1">{p.name}</span>
                            <span className="text-[10px] text-[#28071C]/30 shrink-0">{[p.division, p.category, p.subcategory].filter(Boolean).join(" › ")}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {migResults.length === 0 && !migSearching && (
                    <p className="text-center py-6 text-[#28071C]/30 text-xs">Clique em "Buscar" para encontrar produtos.</p>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={() => setMigStep(1)} className="px-4 py-2 border border-[#28071C]/20 text-[#28071C]/60 rounded-lg text-xs font-semibold hover:bg-white/60 transition-colors">← Voltar</button>
                    <button onClick={handleExecuteMigration}
                      disabled={migSelected.size === 0 || migSaving}
                      className="flex items-center gap-1.5 px-5 py-2 bg-[#28071C] text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
                      {migSaving ? "Migrando…" : `Migrar ${migSelected.size} produto${migSelected.size !== 1 ? "s" : ""} →`}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Passo 3: Confirmação ── */}
              {migStep === 3 && (
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-[#28071C] font-bold text-base mb-1">{migDoneCount} produto{migDoneCount !== 1 ? "s" : ""} migrado{migDoneCount !== 1 ? "s" : ""}!</p>
                  <p className="text-[#28071C]/50 text-sm mb-4">
                    Movidos para <strong>{[migNewDiv, migNewCat, migNewSub, migNewLinha].filter(Boolean).join(" › ")}</strong>
                  </p>
                  <button onClick={resetMigration}
                    className="px-6 py-2.5 bg-[#7598CF] text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
                    Concluir
                  </button>
                </div>
              )}
            </div>
          )}
        </SettingsCard>

        {/* ── CARD 6: Matriz de Abastecimento ──────────────────────────────────── */}
        <SettingsCard
          id="tour-op-leadtimes"
          icon={<Truck className="w-6 h-6 text-[#28071C]" />}
          title="Matriz de Abastecimento"
          accentColor="#F6F3AA"
          summary={<span className="text-[#28071C]/50 text-sm">Lead time e condições de pagamento por hierarquia × fornecedor</span>}
        >
          <div className="flex items-center justify-between mt-1 mb-5">
            <p className="text-[#28071C]/50 text-sm">Configure fornecedores, lead times e condições de pagamento.</p>
            <button
              onClick={() => navigate("/matriz-abastecimento")}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm shrink-0"
            >
              Acessar <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Truck,       label: "Fornecedores",            desc: "White label, private label, importados e produção própria" },
              { icon: Clock,       label: "Lead Time",               desc: "Produção + Trânsito por combinação de hierarquia e fornecedor" },
              { icon: Save,        label: "Condições de Pagamento",  desc: "Parcelas com gatilhos: Pedido, Faturamento ou Entrega" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-[#F6F3AA]/30 rounded-xl p-4 border border-[#F6F3AA]">
                <Icon className="w-4 h-4 text-[#28071C]/50 mb-2" />
                <div className="text-[#28071C] font-semibold text-sm">{label}</div>
                <div className="text-[#28071C]/50 text-xs mt-1 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </SettingsCard>

        {/* ── CARD 7: Cadastro de Básicos ────────────────────────────────────── */}
        <SettingsCard
          id="tour-op-basicos"
          icon={<Package className="w-6 h-6 text-[#28071C]" />}
          title="Cadastro de Básicos"
          accentColor="#28071C"
          summary={
            basicosSkuArr.length > 0
              ? <span className="text-[#28071C]/50 text-sm">{basicosSkuArr.length} produto{basicosSkuArr.length !== 1 ? "s" : ""} cadastrado{basicosSkuArr.length !== 1 ? "s" : ""}</span>
              : <span className="text-[#28071C]/35 text-sm">Nenhum básico cadastrado</span>
          }
        >
          {/* Conceito */}
          <p className="text-[#28071C]/65 text-sm leading-relaxed mt-1 mb-5">
            <strong>Sustentadores de Margem</strong> são produtos com estruturas consagradas e alta aceitação — margem mais alta por previsão de venda mais segura, atualizados a cada coleção em cor e poucos atributos.{" "}
            <strong>Básicos</strong> são o subgrupo que <em>nunca muda</em> em estrutura, cor ou atributo. Cadastre aqui os SKUs desse perfil.
          </p>

          <div className="space-y-4">
            {/* Campo de busca */}
            <div className="relative">
              <div className="flex items-center gap-2 bg-white border-2 border-[#28071C]/20 rounded-xl px-3 py-2.5 focus-within:border-[#28071C]/50 transition-colors">
                <Search className="w-4 h-4 text-[#28071C]/40 shrink-0" />
                <input
                  type="text"
                  value={basicosSearch}
                  onChange={e => handleBasicosSearch(e.target.value)}
                  onFocus={() => basicosResults.length > 0 && setBasicosShowDrop(true)}
                  onBlur={() => setTimeout(() => setBasicosShowDrop(false), 200)}
                  placeholder="Buscar por SKU ou nome do produto…"
                  className="flex-1 bg-transparent text-[#28071C] text-sm focus:outline-none placeholder:text-[#28071C]/30"
                />
                {basicosSearching && <RefreshCw className="w-3.5 h-3.5 text-[#28071C]/30 animate-spin shrink-0" />}
              </div>

              {/* Dropdown de resultados */}
              {basicosShowDrop && basicosResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[#28071C]/15 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                  {basicosResults.map(p => {
                    const already = basicosSkuArr.includes(p.sku);
                    return (
                      <button key={p.sku}
                        onMouseDown={() => handleAddBasico(p)}
                        disabled={already}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#28071C]/5 transition-colors ${already ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        <span className="font-mono text-xs text-[#28071C]/50 w-20 shrink-0">{p.sku}</span>
                        <span className="text-[#28071C] text-sm truncate flex-1">{p.name}</span>
                        <span className="text-[10px] text-[#28071C]/30 shrink-0">{[p.category, p.subcategory].filter(Boolean).join(" › ")}</span>
                        {already && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Import bulk colapsável */}
            <details className="group">
              <summary className="text-xs text-[#28071C]/40 hover:text-[#28071C]/70 cursor-pointer select-none flex items-center gap-1">
                <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                Importar lista de SKUs em bloco
              </summary>
              <div className="mt-2 flex gap-2">
                <textarea
                  id="basicos-bulk-input"
                  rows={3}
                  placeholder={"SKU-001\nSKU-002, SKU-003\nSKU-004"}
                  className="flex-1 bg-white rounded-lg px-3 py-2 text-[#28071C] border-2 border-[#28071C]/15 focus:outline-none focus:border-[#28071C]/40 text-xs font-mono resize-none"
                />
                <button
                  onClick={() => {
                    const el = document.getElementById("basicos-bulk-input") as HTMLTextAreaElement | null;
                    if (el?.value) { handleImportBasicosBulk(el.value); el.value = ""; }
                  }}
                  className="self-start px-4 py-2 bg-[#28071C] text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Adicionar
                </button>
              </div>
            </details>

            {/* Lista de produtos */}
            {basicosSkuArr.length > 0 ? (
              <div className="border border-[#28071C]/10 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-2 bg-[#28071C]/5 border-b border-[#28071C]/10 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#28071C]/60 uppercase tracking-wider">{basicosSkuArr.length} produto{basicosSkuArr.length !== 1 ? "s" : ""}</p>
                  <button onClick={() => { setBasicosSkuArr([]); setBasicosProds([]); setBasicosSkus("[]"); }}
                    className="text-[10px] text-red-500 hover:text-red-700 transition-colors">Limpar todos</button>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[#28071C]/6">
                  {basicosSkuArr.map(sku => {
                    const prod = basicosProds.find(p => p.sku === sku);
                    return (
                      <div key={sku} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#28071C]/3 group/row transition-colors">
                        <span className="font-mono text-xs text-[#28071C]/50 w-24 shrink-0">{sku}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#28071C] text-sm truncate">{prod?.name ?? <span className="text-[#28071C]/30 italic">carregando…</span>}</p>
                          {prod && <p className="text-[10px] text-[#28071C]/35 mt-0.5">{[prod.division, prod.category, prod.subcategory].filter(Boolean).join(" › ")}</p>}
                        </div>
                        <button onClick={() => handleRemoveBasico(sku)}
                          className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-50 rounded-lg">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-[#28071C]/10 rounded-xl text-[#28071C]/30 text-sm">
                Nenhum produto básico cadastrado. Use a busca acima ou importe uma lista de SKUs.
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[#28071C]/8">
            <button onClick={handleSaveBasicos}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md text-sm">
              <Save className="w-4 h-4 mr-2" />Salvar Configuração
            </button>
            {basicosSavedOk && (
              <span className="text-green-700 text-sm font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Configuração salva!
              </span>
            )}
          </div>
        </SettingsCard>

        {/* ── CARD 8: Banco de Cores ──────────────────────────────────────────── */}
        <SettingsCard
          id="tour-op-banco-cores"
          icon={<Palette className="w-6 h-6 text-[#28071C]" />}
          title="Banco de Cores"
          accentColor="#7598CF"
          summary={
            <span className="text-[#28071C]/50 text-sm">
              Classifique cores brutas em família e intensidade para análises por grupo de cor
            </span>
          }
        >
          <div className="mt-2">
            <ColorBankCard tenantId={user.tenant_id} />
          </div>
        </SettingsCard>


      </main>

      {/* Product Tour */}
      {tour.isOpen && (
        <ProductTour steps={OPERATION_SETTINGS_TOUR} onClose={tour.dismiss} />
      )}
    </div>
  );
}
