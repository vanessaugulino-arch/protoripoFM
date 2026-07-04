import { useEffect, useState } from "react";
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
} from "lucide-react";
import { ProductTour, type TourStep } from "../components/ProductTour";
import { useTour } from "../hooks/useTour";
import ImportWizard from "../components/ImportWizard";
import { ColorBankCard } from "../components/ColorBankCard";
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
} from "../../services/supabase/seasonService";

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
    content: "Configure os prazos de suprimento por grupo, categoria e nível de risco — seja por produção ou pedido. O sistema usa esses lead times para calcular datas de entrada de mercadoria e alertar gaps de prazo.",
  },
  {
    targetId: "tour-op-basicos",
    title: "Sustentador de Margem",
    content: "Sinalize os produtos classificados como Sustentador de Margem — básicos com variações de cor ou detalhe. Podem vir do estoque existente ou ser definidos no plano de sortimento.",
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

// ─── Faixas de Preço por Categoria ────────────────────────────────────────────
interface FaixaPreco {
  id: number;
  grupo: string;
  divisao?: string;
  categoria: string;
  faixas: {
    P1: { inicio: number; fim: number };
    P2: { inicio: number; fim: number };
    P3: { inicio: number; fim: number };
  };
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

  // ── Sustentador de Margem ────────────────────────────────────────────────────
  const [basicosAtivos, setBasicosAtivos] = useState<boolean>(() => {
    try { const r = localStorage.getItem("fashionmind_basicos_sustentador"); return r ? JSON.parse(r).basicosAtivos ?? false : false; } catch { return false; }
  });
  const [basicosTipo, setBasicosTipo] = useState<"estoque" | "novos">(() => {
    try { const r = localStorage.getItem("fashionmind_basicos_sustentador"); return r ? JSON.parse(r).basicosTipo ?? "novos" : "novos"; } catch { return "novos"; }
  });
  const [basicosSkus, setBasicosSkus] = useState<string>(() => {
    try { const r = localStorage.getItem("fashionmind_basicos_sustentador"); return r ? JSON.parse(r).basicosSkus ?? "" : ""; } catch { return ""; }
  });
  const [basicosSavedOk, setBasicosSavedOk] = useState(false);

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

  // ── Importação de Planilhas (novo — via ImportWizard) ────────────────────
  const [activeImportType, setActiveImportType] = useState<ImportDataType | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);

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
      );
      persistTemporadas([...temporadas, nova]);
      setTemporadaNome(""); setTemporadaInicio("Janeiro"); setTemporadaFim("Dezembro");
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
    setFaixasPreco(updated);
    try { localStorage.setItem("fashionmind_faixas_preco", JSON.stringify(updated)); } catch { /* */ }
    setFpGrupo(""); setFpCategoria(""); setFpDivisao("");
    setFpP1Inicio(0); setFpP1Fim(0); setFpP2Inicio(0); setFpP2Fim(0); setFpP3Inicio(0); setFpP3Fim(0);
    setFpSavedOk(true);
    setTimeout(() => setFpSavedOk(false), 2500);
  };

  const handleDeleteFaixa = (id: number) => {
    const updated = faixasPreco.filter(f => f.id !== id);
    setFaixasPreco(updated);
    try { localStorage.setItem("fashionmind_faixas_preco", JSON.stringify(updated)); } catch { /* */ }
  };

  // ── Handlers: Sustentador de Margem ─────────────────────────────────────────
  const handleSaveBasicos = () => {
    try { localStorage.setItem("fashionmind_basicos_sustentador", JSON.stringify({ basicosAtivos, basicosTipo, basicosSkus })); } catch { /* */ }
    setBasicosSavedOk(true);
    setTimeout(() => setBasicosSavedOk(false), 2500);
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
        <div id="tour-op-temporadas" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Temporadas de Coleções</h2>
          </div>
          <div className="flex items-start gap-2 mb-4 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <p className="text-[#28071C]/70 text-sm">
              O sistema cria automaticamente as temporadas padrão ao salvar um Planejamento Estratégico.
              Temporadas marcadas com <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7598CF] bg-[#7598CF]/10 px-1.5 py-0.5 rounded-full uppercase">Auto</span> podem ser editadas com escolha de impacto.
              Temporadas de anos encerrados são somente leitura.
            </p>
          </div>

          {/* Formulário — adicionar nova temporada manual */}
          <p className="text-[#28071C]/50 text-xs font-semibold uppercase tracking-widest mb-3">Adicionar temporada manual</p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Nome da Temporada</label>
              <input type="text" value={temporadaNome} onChange={e => setTemporadaNome(e.target.value)}
                placeholder="Ex: Resort 2026"
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
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Início</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Fim</th>
                  <th className="px-4 py-3 text-left text-white text-sm uppercase tracking-wide">Coleções</th>
                  <th className="px-4 py-3 text-center text-white text-sm uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {temporadas.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-[#28071C]/40 text-sm">Nenhuma temporada cadastrada.</td></tr>
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
                            {t.anoFiscal && (
                              <span className="text-[10px] text-[#28071C]/35 bg-[#28071C]/6 px-1.5 py-0.5 rounded-full">
                                {isPast ? `${t.anoFiscal} · encerrado` : `Fiscal ${t.anoFiscal}`}
                              </span>
                            )}
                          </div>
                        )}
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
        </div>

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
        <div id="tour-op-colecoes" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#28071C]">
          <div className="flex items-center gap-3 mb-2">
            <Layers className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Coleções / Drops</h2>
          </div>
          <p className="text-[#28071C]/60 text-sm mb-6">
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
        </div>

        {/* ── CARD 3 (NEW): Faixas de Preço por Categoria ────────────────────── */}
        <div id="tour-op-faixas" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
          <div className="flex items-center gap-3 mb-2">
            <Tag className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Faixas de Preço por Categoria</h2>
          </div>

          {/* Section A: Selectors */}
          <div className={`grid gap-4 mb-6 mt-4 ${hierDivisaoAtiva ? "grid-cols-3" : "grid-cols-2"}`}>
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

          {/* Section B: Band inputs */}
          <div className="space-y-3 mb-6">
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

          {/* Section C: Info banner */}
          <div className="flex items-start gap-2 mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-amber-800 text-sm">
              Alterações nas faixas valem apenas para produtos novos. O histórico de vendas mantém a faixa original de cada produto.
            </p>
          </div>

          {/* Section D: Save + Table */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={handleSaveFaixaPreco}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
              <Save className="w-5 h-5 mr-2" />Salvar Faixa
            </button>
            {fpSavedOk && (
              <span className="text-green-700 text-sm font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Faixa salva com sucesso!
              </span>
            )}
          </div>

          {faixasPreco.length > 0 && (
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          <button onClick={() => handleDeleteFaixa(f.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── CARD 4: Importação de Planilhas ──────────────────────────────────── */}
        <div id="tour-op-importacao" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#9B8CD8]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-[#28071C]" />
              <div>
                <h2 className="text-[#28071C] text-xl font-bold">Importação de Planilhas</h2>
                <p className="text-[#28071C]/50 text-sm mt-0.5">
                  Importe catálogo, vendas, pedidos, estoque ou hierarquia de códigos
                </p>
              </div>
            </div>
            {activeImportType && (
              <button
                onClick={() => setActiveImportType(null)}
                className="flex items-center gap-1.5 text-[#28071C]/40 hover:text-[#28071C] text-sm transition-colors"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>

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
        </div>

        {/* ── CARD 5: Configuração de Hierarquia de Produtos (editor completo) ── */}
        <div id="tour-op-hierarquia" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="flex items-center gap-3 mb-2">
            <Layers className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Configuração de Hierarquia de Produtos</h2>
          </div>
          <p className="text-[#28071C]/50 text-sm mb-6">
            Cadastre as divisões, grupos, categorias e subcategorias que estruturam o sortimento da marca.
            A hierarquia é usada no planejamento e na importação de dados.
          </p>

          {/* Toggle Divisão */}
          <div className="mb-5 p-4 bg-[#28071C]/5 rounded-xl border border-[#28071C]/10 flex items-center justify-between">
            <div>
              <p className="text-[#28071C] font-semibold text-sm">Usar nível Divisão</p>
              <p className="text-[#28071C]/50 text-xs mt-0.5">Ex: Feminino, Masculino, Infantil — nível acima do Grupo</p>
            </div>
            <button onClick={() => setHierDivisaoAtiva(!hierDivisaoAtiva)}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${hierDivisaoAtiva ? "bg-[#7598CF]" : "bg-[#28071C]/20"}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${hierDivisaoAtiva ? "translate-x-7" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Árvore de hierarquia */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[#28071C]/70 text-xs font-semibold uppercase tracking-widest">
                Estrutura cadastrada
              </p>
              <button onClick={() => { setHierAddTarget('root'); setHierAddLabel(''); }}
                className="flex items-center gap-1.5 text-xs text-[#7598CF] font-semibold hover:text-[#28071C] transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Nova {hierDivisaoAtiva ? 'Divisão' : 'Grupo'}
              </button>
            </div>

            {/* Input de adição na raiz */}
            {hierAddTarget === 'root' && (
              <div className="flex gap-2 mb-3">
                <input autoFocus type="text" value={hierAddLabel} onChange={e => setHierAddLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') hierAddNode(null); if (e.key === 'Escape') setHierAddTarget(null); }}
                  placeholder={`Nome da ${hierDivisaoAtiva ? 'divisão' : 'grupo'}…`}
                  className="flex-1 px-3 py-2 border-2 border-[#7598CF]/50 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
                <button onClick={() => hierAddNode(null)} className="px-4 py-2 bg-[#7598CF] text-white rounded-lg text-sm font-semibold hover:opacity-90">Adicionar</button>
                <button onClick={() => setHierAddTarget(null)} className="px-3 py-2 border border-[#28071C]/20 text-[#28071C]/50 rounded-lg text-sm hover:bg-gray-50"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Árvore recursiva */}
            {hierStruct.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-[#28071C]/10 rounded-xl text-[#28071C]/40 text-sm">
                Nenhum item cadastrado. Clique em "Nova {hierDivisaoAtiva ? 'Divisão' : 'Grupo'}" para começar.
              </div>
            ) : (
              <div className="border border-[#28071C]/10 rounded-xl overflow-hidden">
                {hierStruct.map((node, idx) => (
                  <HierNodeRow
                    key={node.id} node={node} depth={0}
                    expanded={hierExpanded} onToggle={toggleExpand}
                    editId={hierEditId} editLabel={hierEditLabel}
                    onEditStart={(id, label) => { setHierEditId(id); setHierEditLabel(label); }}
                    onEditChange={setHierEditLabel} onEditSave={hierSaveEdit}
                    onEditCancel={() => setHierEditId(null)}
                    addTarget={hierAddTarget} addLabel={hierAddLabel}
                    onAddStart={(id) => { setHierAddTarget(id); setHierAddLabel(''); }}
                    onAddChange={setHierAddLabel} onAddConfirm={hierAddNode}
                    onAddCancel={() => setHierAddTarget(null)}
                    onDelete={hierDeleteNode}
                    levelLabels={LEVEL_LABELS}
                    isLast={idx === hierStruct.length - 1}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-[#28071C]/8">
            <button onClick={handleSaveHierarquia}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md text-sm">
              <Save className="w-4 h-4 mr-2" />Salvar Configurações
            </button>
            {(hierSavedOk || hierSavedStructOk) && (
              <span className="text-green-700 text-sm font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Salvo!
              </span>
            )}
          </div>
        </div>

        {/* ── CARD 5: Matriz de Abastecimento ──────────────────────────────────── */}
        <div id="tour-op-leadtimes" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F6F3AA] flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-[#28071C]" />
              </div>
              <div>
                <h2 className="text-[#28071C] text-xl font-bold">Matriz de Abastecimento</h2>
                <p className="text-[#28071C]/50 text-sm mt-0.5">
                  Lead time e condições de pagamento por hierarquia de produto × fornecedor
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/matriz-abastecimento")}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm shrink-0"
            >
              Acessar <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
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
        </div>

        {/* ── CARD 6 (NEW): Sustentador de Margem ─────────────────────────────── */}
        <div id="tour-op-basicos" className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#28071C]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-[#28071C] text-xl font-bold">Sustentador de Margem</h2>
              <p className="text-[#28071C]/50 text-sm mt-0.5">Perfil de produto recorrente</p>
            </div>
            <button
              onClick={() => setBasicosAtivos(!basicosAtivos)}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${basicosAtivos ? "bg-[#28071C]" : "bg-[#28071C]/20"}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${basicosAtivos ? "translate-x-7" : "translate-x-1"}`} />
            </button>
          </div>

          <p className="text-[#28071C]/60 text-sm mb-4">
            Incluir produtos Sustentador de Margem na coleção
            <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${basicosAtivos ? "bg-green-100 text-green-700" : "bg-[#28071C]/10 text-[#28071C]/40"}`}>
              {basicosAtivos ? "Ativo" : "Inativo"}
            </span>
          </p>

          {basicosAtivos && (
            <div className="border-t border-[#28071C]/10 pt-4 space-y-4">
              <p className="text-[#28071C]/70 text-sm uppercase tracking-wide font-semibold">Origem dos produtos</p>
              <div className="flex flex-col gap-3">
                {([
                  { value: "estoque" as const, label: "Informar produtos do estoque" },
                  { value: "novos"   as const, label: "Serão produtos novos" },
                ]).map(opt => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="basicosTipo" value={opt.value}
                      checked={basicosTipo === opt.value}
                      onChange={() => setBasicosTipo(opt.value)}
                      className="accent-[#28071C]" />
                    <span className="text-[#28071C] text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>

              {basicosTipo === "estoque" ? (
                <div>
                  <label className="block text-[#28071C]/70 text-xs uppercase tracking-wide mb-2">
                    SKUs ou nomes de produtos (separados por vírgula)
                  </label>
                  <textarea
                    value={basicosSkus}
                    onChange={e => setBasicosSkus(e.target.value)}
                    placeholder="Ex: SKU-001, Blusa Branca Básica, SKU-045"
                    rows={3}
                    className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/20 focus:outline-none focus:ring-2 focus:ring-[#28071C]/40 text-sm resize-none"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-[#7598CF]/10 border border-[#7598CF]/20 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-[#7598CF] flex-shrink-0" />
                  <p className="text-[#28071C]/70 text-sm">Os produtos serão definidos no plano de sortimento</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            <button onClick={handleSaveBasicos}
              className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md">
              <Save className="w-5 h-5 mr-2" />Salvar Configuração
            </button>
            {basicosSavedOk && (
              <span className="text-green-700 text-sm font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Configuração salva!
              </span>
            )}
          </div>
        </div>

        {/* ── CARD 7: Banco de Cores ──────────────────────────────────────────── */}
        <div id="tour-op-banco-cores">
          {user.tenant_id && (
            <ColorBankCard tenantId={user.tenant_id} />
          )}
        </div>

        {/* Card de importação movido para antes da Hierarquia — ver Card 4 acima */}
        <div className="hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-[#28071C]" />
              <div>
                <h2 className="text-[#28071C] text-xl font-bold">Importação de Planilhas</h2>
                <p className="text-[#28071C]/50 text-sm mt-0.5">Carregue dados de produtos ou hierarquia de códigos do seu sistema</p>
              </div>
            </div>
            {importStep !== "select" && (
              <button onClick={handleImportReset} className="flex items-center gap-1.5 text-[#28071C]/40 hover:text-[#28071C] text-sm transition-colors">
                <X className="w-4 h-4" />Reiniciar
              </button>
            )}
          </div>

          {/* Step 1 — Seleção do fluxo */}
          {importStep === "select" && (
            <div className="mt-6">
              <p className="text-[#28071C]/60 text-sm mb-4">
                Selecione o fluxo que melhor descreve sua situação:
              </p>
              <div className="grid grid-cols-2 gap-4">

                {/* Opção A — Importação Completa */}
                <button
                  onClick={() => { setImportMode("completa"); setImportStep("upload"); }}
                  className="text-left border-2 border-[#9B8CD8]/30 hover:border-[#9B8CD8] rounded-2xl p-5 transition-all group hover:bg-[#9B8CD8]/4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-[#9B8CD8]/15 rounded-lg flex items-center justify-center">
                      <Upload className="w-4 h-4 text-[#9B8CD8]" />
                    </div>
                    <span className="text-xs font-bold text-[#9B8CD8] uppercase tracking-widest">Sem ERP</span>
                  </div>
                  <h3 className="text-[#28071C] font-bold text-base mb-2">Importação Completa</h3>
                  <p className="text-[#28071C]/55 text-sm leading-relaxed">
                    Todos os dados de produtos são gerenciados em planilha. Faça upload do catálogo completo com código, descrição, preço, custo e hierarquia.
                  </p>
                  <div className="flex items-center gap-1 mt-4 text-[#9B8CD8] text-xs font-semibold">
                    Selecionar este fluxo <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>

                {/* Opção B — Complemento de Hierarquia */}
                <button
                  onClick={() => { setImportMode("hierarquia"); setImportStep("upload"); }}
                  className="text-left border-2 border-[#7598CF]/30 hover:border-[#7598CF] rounded-2xl p-5 transition-all group hover:bg-[#7598CF]/4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-[#7598CF]/15 rounded-lg flex items-center justify-center">
                      <Layers className="w-4 h-4 text-[#7598CF]" />
                    </div>
                    <span className="text-xs font-bold text-[#7598CF] uppercase tracking-widest">Com ERP</span>
                  </div>
                  <h3 className="text-[#28071C] font-bold text-base mb-2">Complemento de Hierarquia</h3>
                  <p className="text-[#28071C]/55 text-sm leading-relaxed">
                    O ERP já possui os produtos cadastrados mas não armazena a hierarquia de códigos. Faça upload de uma planilha de hierarquia para enriquecer os dados — o cruzamento é feito pelo código do produto.
                  </p>
                  <div className="flex items-center gap-1 mt-4 text-[#7598CF] text-xs font-semibold">
                    Selecionar este fluxo <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* Step 2 — Upload do arquivo */}
          {importStep === "upload" && importMode && (
            <div className="mt-6">
              {/* Contexto do fluxo escolhido */}
              <div className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-5 border ${
                importMode === "completa"
                  ? "bg-[#9B8CD8]/8 border-[#9B8CD8]/25"
                  : "bg-[#7598CF]/8 border-[#7598CF]/25"
              }`}>
                <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 ${importMode === "completa" ? "text-[#9B8CD8]" : "text-[#7598CF]"}`} />
                <div>
                  <p className="text-[#28071C] text-sm font-semibold mb-0.5">
                    {importMode === "completa" ? "Importação Completa — catálogo via planilha" : "Complemento de Hierarquia — enriquecimento via join pelo código"}
                  </p>
                  <p className="text-[#28071C]/55 text-xs leading-relaxed">
                    {importMode === "completa"
                      ? "Faça upload do arquivo com os produtos. Na próxima etapa você indicará qual coluna da planilha corresponde a cada campo do sistema."
                      : "Faça upload da planilha com a hierarquia de códigos. O sistema cruzará os dados pelo código do produto como chave de join."
                    }
                  </p>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
                onDragLeave={() => setImportDragging(false)}
                onDrop={handleImportDrop}
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  importDragging
                    ? "border-[#7598CF] bg-[#7598CF]/8 scale-[1.01]"
                    : "border-[#28071C]/20 hover:border-[#7598CF]/60 hover:bg-[#7598CF]/4"
                }`}
              >
                <Upload className="w-10 h-10 text-[#28071C]/25 mx-auto mb-3" />
                <p className="text-[#28071C]/60 text-sm mb-1 font-medium">
                  Arraste o arquivo aqui ou clique para selecionar
                </p>
                <p className="text-[#28071C]/35 text-xs mb-4">Formatos aceitos: .xlsx · .csv</p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-[#28071C]/90 transition-colors">
                  <Upload className="w-4 h-4" />
                  Selecionar arquivo
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="sr-only"
                    onChange={handleImportFileChange}
                  />
                </label>
              </div>

              {/* Dica de modelo */}
              <div className="mt-4 flex items-center gap-2 text-xs text-[#28071C]/40">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Não tem o arquivo pronto?{" "}
                  <button className="underline text-[#7598CF] hover:text-[#28071C] transition-colors">
                    Baixar modelo de planilha {importMode === "completa" ? "(Catálogo completo)" : "(Hierarquia de códigos)"}
                  </button>
                </span>
              </div>
            </div>
          )}

          {/* Step 3 — Mapeamento de colunas */}
          {importStep === "mapping" && importMode && (
            <div className="mt-6">
              {/* Arquivo carregado */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-emerald-800 text-sm font-semibold">{importFileName}</p>
                  <p className="text-emerald-700 text-xs mt-0.5">
                    {importHeaders.length} colunas detectadas · Mapeie os campos abaixo
                  </p>
                </div>
                <button
                  onClick={() => setImportStep("upload")}
                  className="text-emerald-600 hover:text-emerald-800 text-xs underline"
                >
                  Trocar arquivo
                </button>
              </div>

              {/* Orientação de mapeamento */}
              {importMode === "hierarquia" && (
                <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 mb-5">
                  <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
                  <p className="text-[#28071C]/60 text-xs leading-relaxed">
                    O sistema usará o <strong className="text-[#28071C]">Código do Produto</strong> como chave de join entre os dados do ERP e a hierarquia da planilha. Certifique-se de que os códigos são idênticos nas duas fontes.
                  </p>
                </div>
              )}

              {/* Tabela de mapeamento */}
              <div className="border border-[#28071C]/10 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-2 gap-0 bg-[#28071C]/5 px-5 py-2.5">
                  <span className="text-[10px] text-[#28071C]/50 font-bold uppercase tracking-widest">Campo do sistema</span>
                  <span className="text-[10px] text-[#28071C]/50 font-bold uppercase tracking-widest">Coluna na planilha</span>
                </div>
                <div className="divide-y divide-[#28071C]/6">
                  {activeSystemFields.map(field => (
                    <div key={field.key} className="grid grid-cols-2 gap-4 items-center px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[#28071C]/70 text-sm">{field.label}</span>
                        {field.required && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">
                            Obrigatório
                          </span>
                        )}
                      </div>
                      <select
                        value={columnMapping[field.key] ?? ""}
                        onChange={e => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className={`bg-white border-2 rounded-lg px-3 py-2 text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 transition-colors ${
                          field.required && !columnMapping[field.key]
                            ? "border-red-200 focus:border-red-400"
                            : "border-[#28071C]/15 focus:border-[#7598CF]"
                        }`}
                      >
                        <option value="">— Não mapear —</option>
                        {importHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validação e CTA */}
              <div className="flex items-center justify-between mt-5">
                <div className="text-xs text-[#28071C]/40">
                  {activeSystemFields.filter(f => f.required && !columnMapping[f.key]).length === 0
                    ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Todos os campos obrigatórios mapeados</span>
                    : <span className="text-red-500">
                        {activeSystemFields.filter(f => f.required && !columnMapping[f.key]).length} campo(s) obrigatório(s) sem mapeamento
                      </span>
                  }
                </div>
                <button
                  onClick={() => setImportStep("done")}
                  disabled={!requiredFieldsMapped}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {importMode === "completa" ? "Confirmar importação" : "Aplicar hierarquia"}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Confirmação */}
          {importStep === "done" && importMode && (
            <div className="mt-6 text-center py-8">
              <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-[#28071C] font-bold text-lg mb-2">
                {importMode === "completa" ? "Catálogo importado com sucesso!" : "Hierarquia aplicada com sucesso!"}
              </h3>
              <p className="text-[#28071C]/55 text-sm mb-1">
                Arquivo: <strong>{importFileName}</strong>
              </p>
              <p className="text-[#28071C]/40 text-xs mb-6">
                {importMode === "completa"
                  ? "Os produtos foram registrados no sistema com as colunas mapeadas."
                  : "A hierarquia de códigos foi cruzada pelo código do produto e aplicada ao cadastro do ERP."
                }
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleImportReset}
                  className="px-5 py-2.5 border-2 border-[#28071C]/20 text-[#28071C] rounded-xl text-sm font-semibold hover:bg-[#28071C]/5 transition-all"
                >
                  Nova importação
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 transition-all shadow-sm"
                >
                  Ir para o Dashboard <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </div>

      </main>

      {/* Product Tour */}
      {tour.isOpen && (
        <ProductTour steps={OPERATION_SETTINGS_TOUR} onClose={tour.dismiss} />
      )}
    </div>
  );
}
