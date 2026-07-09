// ─── MatrizAbastecimento.tsx — Phase B + C ────────────────────────────────────
// Fase B: Modelo Fornecedor — multi-categoria, peso/participação, média ponderada
// Fase C: Modelo Produção/Facção — etapas com DnD de grupos paralelos
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Plus, Edit, Trash2, X, Save, Truck, Package,
  CreditCard, ChevronDown, AlertCircle, Info, GripVertical,
  Factory, Scissors, RefreshCw, Check,
} from "lucide-react";
import {
  type Fornecedor, type CondicaoPagamento, type Parcela,
  type MatrizEntry, type TipoFornecimento, type TipoGatilho,
  type ProducaoModelo, type ProducaoEtapa,
  listFornecedoresDb, insertFornecedorDb, updateFornecedorDb, deleteFornecedorDb,
  listCondicoesDb, insertCondicaoDb, updateCondicaoDb, deleteCondicaoDb,
  listMatrizDb, insertMatrizEntryDb, updateMatrizEntryDb, deleteMatrizEntryDb,
  listModelosProducaoDb, upsertModeloProducaoDb, deleteModeloProducaoDb,
  listEtapasByModeloDb, replaceEtapasDb,
  calcPrazoTotal,
} from "../../services/supabase/matrizAbastecimentoService";

// ══════════════════════════════════════════════════════════════════════════════
// Constantes
// ══════════════════════════════════════════════════════════════════════════════

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const TIPO_FORNECIMENTO_LABELS: Record<TipoFornecimento, string> = {
  white_label:      "White Label",
  private_label:    "Private Label",
  producao_propria: "Produção Própria",
  importado:        "Importado",
};

const TIPO_GATILHO_LABELS: Record<TipoGatilho, string> = {
  PEDIDO:      "Pedido",
  FATURAMENTO: "Faturamento",
  ENTREGA:     "Entrega",
};

const GATILHO_COLORS: Record<TipoGatilho, string> = {
  PEDIDO:      "bg-[#7598CF]/15 text-[#7598CF]",
  FATURAMENTO: "bg-[#9B8CD8]/15 text-[#9B8CD8]",
  ENTREGA:     "bg-emerald-100 text-emerald-700",
};

const MOEDAS = ["BRL", "USD", "EUR", "GBP", "CNY", "ARS"];

// Cores por grupo de etapa (para DnD visual)
const GRUPO_BORDER_COLORS = [
  "border-l-blue-400",   "border-l-violet-400", "border-l-emerald-400",
  "border-l-orange-400", "border-l-pink-400",   "border-l-teal-400",
  "border-l-yellow-500", "border-l-red-400",
];
const GRUPO_BG_COLORS = [
  "bg-blue-50",   "bg-violet-50", "bg-emerald-50",
  "bg-orange-50", "bg-pink-50",   "bg-teal-50",
  "bg-yellow-50", "bg-red-50",
];

// ══════════════════════════════════════════════════════════════════════════════
// Helpers: leitura de hierarquia do localStorage
// ══════════════════════════════════════════════════════════════════════════════

const HIER_STRUCT_KEY = "fashionmind_hierarchy_struct";
interface HierNode { id: string; label: string; children: HierNode[] }

interface HierItem {
  divisao: string;
  categoria: string;
  subcategoria: string | null;
}

function flattenHier(nodes: HierNode[]): HierItem[] {
  const result: HierItem[] = [];
  for (const div of nodes) {
    for (const cat of div.children) {
      if (cat.children.length === 0) {
        result.push({ divisao: div.label, categoria: cat.label, subcategoria: null });
      } else {
        for (const sub of cat.children) {
          result.push({ divisao: div.label, categoria: cat.label, subcategoria: sub.label });
        }
      }
    }
  }
  return result;
}

function loadHierarquia(): HierItem[] {
  try {
    const raw = localStorage.getItem(HIER_STRUCT_KEY);
    if (!raw) return [];
    return flattenHier(JSON.parse(raw) as HierNode[]);
  } catch { return []; }
}

// ── Lê usuário do sessionStorage ─────────────────────────────────────────────
interface UserData { tenant_id: string; email?: string; system_role?: string; }
function getUser(): UserData | null {
  try { return JSON.parse(sessionStorage.getItem("currentUser") ?? "null"); } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// Tipos locais
// ══════════════════════════════════════════════════════════════════════════════

type Tab = "modelo_fornecedor" | "modelo_producao" | "fornecedores" | "condicoes";

interface StageForm {
  _key: string;
  id?: string;
  ordem_grupo: number;
  nome_etapa: string;
  faccao_nome: string;
  dias_prazo: number;
  condicao_pagamento_id: string;
  observacoes: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════

export default function MatrizAbastecimento() {
  const navigate   = useNavigate();
  const user       = getUser();
  const hierarquia = useState(() => loadHierarquia())[0];

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("modelo_fornecedor");

  // ── Data ───────────────────────────────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [condicoes,    setCondicoes]    = useState<CondicaoPagamento[]>([]);
  const [matriz,       setMatriz]       = useState<MatrizEntry[]>([]);
  const [modelos,      setModelos]      = useState<ProducaoModelo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterDivisao,   setFilterDivisao]   = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [matrizModal,   setMatrizModal]   = useState<{ entry?: MatrizEntry } | null>(null);
  const [fornModal,     setFornModal]     = useState<{ item?: Fornecedor } | null>(null);
  const [condModal,     setCondModal]     = useState<{ item?: CondicaoPagamento } | null>(null);
  const [producaoModal, setProducaoModal] = useState<{ modelo?: ProducaoModelo } | null>(null);

  // ── Etapas expandidas ──────────────────────────────────────────────────────
  const [expandedModelo, setExpandedModelo] = useState<string | null>(null);
  const [etapasCache, setEtapasCache] = useState<Record<string, ProducaoEtapa[]>>({});

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user?.tenant_id) return;
    setLoading(true);
    setError(null);
    try {
      const [f, c, m, mod] = await Promise.all([
        listFornecedoresDb(user.tenant_id),
        listCondicoesDb(user.tenant_id),
        listMatrizDb(user.tenant_id),
        listModelosProducaoDb(user.tenant_id),
      ]);
      setFornecedores(f);
      setCondicoes(c);
      setMatriz(m);
      setModelos(mod);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id]);

  useEffect(() => { load(); }, [load]);

  const loadEtapas = useCallback(async (modeloId: string) => {
    if (etapasCache[modeloId]) return;
    try {
      const etapas = await listEtapasByModeloDb(modeloId);
      setEtapasCache(prev => ({ ...prev, [modeloId]: etapas }));
    } catch { /* ignore */ }
  }, [etapasCache]);

  const toggleExpandModelo = (modeloId: string) => {
    if (expandedModelo === modeloId) {
      setExpandedModelo(null);
    } else {
      setExpandedModelo(modeloId);
      loadEtapas(modeloId);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const divisoes = [...new Set(hierarquia.map(h => h.divisao))];

  const filteredMatriz = matriz.filter(m => {
    if (filterDivisao && m.divisao !== filterDivisao) return false;
    if (filterCategoria && m.categoria !== filterCategoria) return false;
    return true;
  });

  const filteredModelos = modelos.filter(m => {
    if (filterDivisao && m.divisao !== filterDivisao) return false;
    if (filterCategoria && m.categoria !== filterCategoria) return false;
    return true;
  });

  const categoriasFiltro = [...new Set(
    hierarquia
      .filter(h => !filterDivisao || h.divisao === filterDivisao)
      .map(h => h.categoria)
  )];

  // ── Handlers: Fornecedores ─────────────────────────────────────────────────
  async function handleSaveFornecedor(
    values: Omit<Fornecedor, "id" | "tenant_id" | "created_at" | "updated_at">
  ) {
    if (!user?.tenant_id) return;
    if (fornModal?.item) {
      const updated = await updateFornecedorDb(fornModal.item.id, values);
      setFornecedores(prev => prev.map(f => f.id === updated.id ? updated : f));
    } else {
      const created = await insertFornecedorDb(user.tenant_id, values);
      setFornecedores(prev => [...prev, created]);
    }
    setFornModal(null);
  }

  async function handleDeleteFornecedor(id: string) {
    if (!confirm("Excluir este fornecedor?")) return;
    await deleteFornecedorDb(id);
    setFornecedores(prev => prev.filter(f => f.id !== id));
  }

  // ── Handlers: Condições ────────────────────────────────────────────────────
  async function handleSaveCondicao(
    desc: string,
    parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]
  ) {
    if (!user?.tenant_id) return;
    if (condModal?.item) {
      const updated = await updateCondicaoDb(condModal.item.id, desc, parcelas);
      setCondicoes(prev => prev.map(c => c.id === updated.id ? updated : c));
    } else {
      const created = await insertCondicaoDb(user.tenant_id, desc, parcelas);
      setCondicoes(prev => [...prev, created]);
    }
    setCondModal(null);
  }

  async function handleDeleteCondicao(id: string) {
    if (!confirm("Excluir esta condição de pagamento?")) return;
    await deleteCondicaoDb(id);
    setCondicoes(prev => prev.filter(c => c.id !== id));
  }

  // ── Handlers: Matriz (Modelo Fornecedor) ──────────────────────────────────
  async function handleSaveMatriz(
    values: Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "updated_at" | "fornecedor" | "condicao">,
    extraCategorias?: HierItem[]
  ) {
    if (!user?.tenant_id) return;
    if (matrizModal?.entry) {
      const updated = await updateMatrizEntryDb(matrizModal.entry.id, values);
      setMatriz(prev => prev.map(m => m.id === updated.id ? { ...updated } : m));
    } else {
      const targets = extraCategorias && extraCategorias.length > 0 ? extraCategorias : [{
        divisao: values.divisao,
        categoria: values.categoria,
        subcategoria: values.subcategoria,
      }];
      const created: MatrizEntry[] = [];
      for (const t of targets) {
        const entry = await insertMatrizEntryDb(user.tenant_id, { ...values, ...t });
        created.push(entry);
      }
      setMatriz(prev => [...prev, ...created]);
    }
    setMatrizModal(null);
  }

  async function handleDeleteMatriz(id: string) {
    if (!confirm("Remover esta entrada?")) return;
    await deleteMatrizEntryDb(id);
    setMatriz(prev => prev.filter(m => m.id !== id));
  }

  // ── Handlers: Modelos de Produção ─────────────────────────────────────────
  async function handleSaveModelo(
    values: Omit<ProducaoModelo, "id" | "tenant_id" | "created_at" | "updated_at">,
    etapas: Omit<ProducaoEtapa, "id" | "modelo_id" | "tenant_id" | "created_at">[],
    existingId?: string
  ) {
    if (!user?.tenant_id) return;
    const savedModelo = await upsertModeloProducaoDb(user.tenant_id, { ...values, id: existingId });
    const savedEtapas = await replaceEtapasDb(savedModelo.id, user.tenant_id, etapas);
    if (existingId) {
      setModelos(prev => prev.map(m => m.id === existingId ? savedModelo : m));
    } else {
      setModelos(prev => [...prev, savedModelo]);
    }
    setEtapasCache(prev => ({ ...prev, [savedModelo.id]: savedEtapas }));
    setExpandedModelo(savedModelo.id);
    setProducaoModal(null);
  }

  async function handleDeleteModelo(id: string) {
    if (!confirm("Excluir este modelo de produção?")) return;
    await deleteModeloProducaoDb(id);
    setModelos(prev => prev.filter(m => m.id !== id));
    setEtapasCache(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (expandedModelo === id) setExpandedModelo(null);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#F7F5F0]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-[#28071C] px-6 py-4 flex items-center gap-4 shadow-lg">
        <button onClick={() => navigate("/operation-settings")}
          className="p-2 text-white/60 hover:text-white rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg leading-none">Matriz de Abastecimento</h1>
          <p className="text-white/50 text-xs mt-0.5">Fornecedores, lead times, modelos de produção e condições de pagamento</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-white/60 rounded-2xl border border-[#28071C]/8 mb-6 overflow-x-auto">
          {([
            { id: "modelo_fornecedor", label: "Modelo Fornecedor",       icon: Truck   },
            { id: "modelo_producao",   label: "Modelo Produção / Facção", icon: Factory },
            { id: "fornecedores",      label: "Fornecedores",            icon: Package },
            { id: "condicoes",         label: "Condições de Pagamento",  icon: CreditCard },
          ] as { id: Tab; label: string; icon: React.FC<{ className?: string }> }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-[#28071C] text-white shadow-sm"
                  : "text-[#28071C]/60 hover:bg-[#28071C]/5 hover:text-[#28071C]"
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Filters (shared for tabs 1-2) ────────────────────────────────── */}
        {(activeTab === "modelo_fornecedor" || activeTab === "modelo_producao") && (
          <div className="flex gap-3 mb-5">
            <div className="flex-1">
              <select value={filterDivisao}
                onChange={e => { setFilterDivisao(e.target.value); setFilterCategoria(""); }}
                className="w-full px-3 py-2 border-2 border-[#28071C]/10 rounded-xl text-sm text-[#28071C] bg-white focus:outline-none focus:border-[#7598CF]/50 cursor-pointer">
                <option value="">Todas as divisões</option>
                {divisoes.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
                className="w-full px-3 py-2 border-2 border-[#28071C]/10 rounded-xl text-sm text-[#28071C] bg-white focus:outline-none focus:border-[#7598CF]/50 cursor-pointer">
                <option value="">Todas as categorias</option>
                {categoriasFiltro.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Loading / Error ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[#28071C]/40">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 1: MODELO FORNECEDOR                                       */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "modelo_fornecedor" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-[#7598CF]" />
                    <p className="text-sm text-[#28071C]/60">
                      O fornecedor entrega o produto <strong>pronto</strong> (inclui matéria-prima).
                      Um fornecedor pode atender múltiplas categorias.
                    </p>
                  </div>
                  <button onClick={() => setMatrizModal({})}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm shrink-0 ml-4">
                    <Plus className="w-4 h-4" /> Adicionar fornecedor
                  </button>
                </div>

                {filteredMatriz.length === 0 ? (
                  <EmptyState icon={Truck} title="Nenhuma entrada cadastrada"
                    desc="Adicione fornecedores e suas condições por categoria." />
                ) : (
                  <div className="bg-white rounded-2xl border border-[#28071C]/8 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-[#28071C]/4 border-b border-[#28071C]/8">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Divisão / Categoria</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Fornecedor</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Peso %</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Produção</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Entrega</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Condição</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-[#28071C]/60 uppercase tracking-wide">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#28071C]/5">
                        {filteredMatriz.map((entry, idx) => {
                          const nextEntry = filteredMatriz[idx + 1];
                          const isLastOfCat = !nextEntry ||
                            nextEntry.categoria !== entry.categoria ||
                            nextEntry.divisao   !== entry.divisao;
                          const catEntries = filteredMatriz.filter(
                            e => e.divisao === entry.divisao && e.categoria === entry.categoria
                          );
                          const totalPeso = catEntries.reduce((s, e) => s + (e.peso_participacao ?? 0), 0);
                          const pesoOk    = Math.abs(totalPeso - 100) < 0.1;

                          return (
                            <MatrizRowFragment
                              key={entry.id}
                              entry={entry}
                              isLastOfCat={isLastOfCat}
                              catEntries={catEntries}
                              totalPeso={totalPeso}
                              pesoOk={pesoOk}
                              onEdit={() => setMatrizModal({ entry })}
                              onDelete={() => handleDeleteMatriz(entry.id)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 2: MODELO PRODUÇÃO / FACÇÃO                               */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "modelo_producao" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-[#7598CF]" />
                    <p className="text-sm text-[#28071C]/60">
                      A facção fornece apenas <strong>serviço de produção</strong>; matéria-prima comprada separadamente.
                    </p>
                  </div>
                  <button onClick={() => setProducaoModal({})}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm shrink-0 ml-4">
                    <Plus className="w-4 h-4" /> Novo modelo
                  </button>
                </div>

                {filteredModelos.length === 0 ? (
                  <EmptyState icon={Factory} title="Nenhum modelo de produção"
                    desc="Cadastre modelos com etapas, facções e prazos de produção." />
                ) : (
                  <div className="space-y-3">
                    {filteredModelos.map(modelo => {
                      const etapas     = etapasCache[modelo.id] ?? [];
                      const expanded   = expandedModelo === modelo.id;
                      const prazoTotal = calcPrazoTotal(etapas);
                      return (
                        <div key={modelo.id} className="bg-white rounded-2xl border border-[#28071C]/8 shadow-sm overflow-hidden">
                          <div className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-[#28071C]">{modelo.nome_modelo}</span>
                                <span className="text-[10px] bg-[#28071C]/8 text-[#28071C]/60 px-2 py-0.5 rounded-full font-medium">
                                  {modelo.categoria}{modelo.subcategoria ? ` › ${modelo.subcategoria}` : ""}
                                </span>
                                <span className="text-[10px] text-[#28071C]/40">{modelo.divisao}</span>
                              </div>
                              <div className="flex items-center gap-4 mt-1.5 text-xs text-[#28071C]/50">
                                <span>MP: <strong className="text-[#28071C]">{modelo.pct_materia_prima}%</strong></span>
                                {modelo.mes_corte && (
                                  <span className="flex items-center gap-1">
                                    <Scissors className="w-3 h-3" />
                                    Corte: <strong className="text-[#28071C]">{modelo.mes_corte}</strong>
                                  </span>
                                )}
                                {expanded && etapas.length > 0 && (
                                  <span className="text-[#7598CF] font-semibold">
                                    Prazo total: {prazoTotal}d
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => toggleExpandModelo(modelo.id)}
                                className="px-3 py-1.5 text-xs text-[#28071C]/60 hover:text-[#28071C] hover:bg-[#28071C]/5 rounded-lg transition-colors font-medium">
                                {expanded ? "Fechar" : (etapas.length > 0 ? `${etapas.length} etapas` : "Ver etapas")}
                              </button>
                              <button onClick={() => setProducaoModal({ modelo })}
                                className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-xl transition-colors">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteModelo(modelo.id)}
                                className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {expanded && (
                            <div className="border-t border-[#28071C]/6 px-5 py-4 bg-[#28071C]/2">
                              {etapas.length === 0 ? (
                                <p className="text-[#28071C]/40 text-sm text-center py-4">
                                  Nenhuma etapa cadastrada. Edite o modelo para adicionar.
                                </p>
                              ) : (
                                <EtapasReadOnly etapas={etapas} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 3: FORNECEDORES (catálogo)                                */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "fornecedores" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[#28071C]/60 text-sm">Catálogo de fornecedores — reutilizável na Matriz e em Pedidos de Compra</p>
                  <button onClick={() => setFornModal({})}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm">
                    <Plus className="w-4 h-4" /> Novo fornecedor
                  </button>
                </div>
                {fornecedores.length === 0 ? (
                  <EmptyState icon={Package} title="Nenhum fornecedor cadastrado"
                    desc="Cadastre fornecedores para usar na Matriz e em Pedidos de Compra." />
                ) : (
                  <div className="grid gap-3">
                    {fornecedores.map(f => (
                      <div key={f.id} className="bg-white/70 rounded-2xl border border-[#28071C]/8 px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#28071C]">{f.nome}</span>
                            {f.pais_origem && <span className="text-[#28071C]/40 text-xs">{f.pais_origem}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-[#28071C]/50">
                            <span>{f.moeda_padrao}</span>
                            {f.contato_email && <span>{f.contato_email}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setFornModal({ item: f })}
                            className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-xl transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteFornecedor(f.id)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 4: CONDIÇÕES DE PAGAMENTO                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "condicoes" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[#28071C]/60 text-sm">Templates reutilizáveis com gatilhos por evento (Pedido, Faturamento, Entrega)</p>
                  <button onClick={() => setCondModal({})}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm">
                    <Plus className="w-4 h-4" /> Nova condição
                  </button>
                </div>
                {condicoes.length === 0 ? (
                  <EmptyState icon={CreditCard} title="Nenhuma condição cadastrada"
                    desc="Crie templates de pagamento para reutilizar na Matriz." />
                ) : (
                  <div className="grid gap-3">
                    {condicoes.map(c => (
                      <div key={c.id} className="bg-white/70 rounded-2xl border border-[#28071C]/8 px-5 py-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[#28071C] mb-2">{c.descricao}</div>
                            <div className="flex flex-wrap gap-2">
                              {c.parcelas.map((p, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${GATILHO_COLORS[p.tipo_gatilho]}`}>
                                    {p.percentual}% {TIPO_GATILHO_LABELS[p.tipo_gatilho]}
                                    {p.dias_apos_gatilho > 0 && ` +${p.dias_apos_gatilho}d`}
                                  </span>
                                  {i < c.parcelas.length - 1 && <span className="text-[#28071C]/20 text-xs">→</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setCondModal({ item: c })}
                              className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-xl transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteCondicao(c.id)}
                              className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {fornModal && (
        <FornecedorModal initial={fornModal.item} onSave={handleSaveFornecedor} onClose={() => setFornModal(null)} />
      )}
      {condModal && (
        <CondicaoModal initial={condModal.item} onSave={handleSaveCondicao} onClose={() => setCondModal(null)} />
      )}
      {matrizModal && (
        <MatrizEntradaModal
          initial={matrizModal.entry}
          hierarquia={hierarquia}
          fornecedores={fornecedores}
          condicoes={condicoes}
          onSave={handleSaveMatriz}
          onClose={() => setMatrizModal(null)}
        />
      )}
      {producaoModal && (
        <ProducaoModal
          initial={producaoModal.modelo}
          hierarquia={hierarquia}
          condicoes={condicoes}
          etapasIniciais={producaoModal.modelo ? (etapasCache[producaoModal.modelo.id] ?? []) : []}
          onSave={handleSaveModelo}
          onClose={() => setProducaoModal(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Linha da tabela de Matriz (extraída para evitar o Fragment aninhado)
// ══════════════════════════════════════════════════════════════════════════════

function MatrizRowFragment({
  entry, isLastOfCat, catEntries, totalPeso, pesoOk, onEdit, onDelete,
}: {
  entry: MatrizEntry;
  isLastOfCat: boolean;
  catEntries: MatrizEntry[];
  totalPeso: number;
  pesoOk: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-[#28071C]/2 transition-colors">
        <td className="px-4 py-3">
          <div className="font-semibold text-[#28071C] text-sm">{entry.categoria}</div>
          <div className="text-[#28071C]/40 text-xs">
            {entry.divisao}{entry.subcategoria ? ` › ${entry.subcategoria}` : ""}
          </div>
        </td>
        <td className="px-4 py-3 text-[#28071C]">
          {entry.fornecedor?.nome ?? <span className="text-[#28071C]/30 italic">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`text-sm font-semibold ${(entry.peso_participacao ?? 100) < 100 ? "text-[#7598CF]" : "text-[#28071C]/50"}`}>
            {entry.peso_participacao ?? 100}%
          </span>
        </td>
        <td className="px-4 py-3 text-center text-[#28071C]">{entry.dias_producao}d</td>
        <td className="px-4 py-3 text-center text-[#28071C]">{entry.dias_transito}d</td>
        <td className="px-4 py-3 text-center">
          <span className="font-semibold text-[#7598CF]">
            {entry.lead_time_total ?? (entry.dias_producao + entry.dias_transito)}d
          </span>
        </td>
        <td className="px-4 py-3">
          {entry.condicao ? (
            <div className="flex flex-wrap gap-1">
              {entry.condicao.parcelas.slice(0, 2).map((p, i) => (
                <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${GATILHO_COLORS[p.tipo_gatilho]}`}>
                  {p.percentual}%{p.dias_apos_gatilho > 0 ? ` +${p.dias_apos_gatilho}d` : ""}
                </span>
              ))}
              {entry.condicao.parcelas.length > 2 && (
                <span className="text-[10px] text-[#28071C]/40">+{entry.condicao.parcelas.length - 2}</span>
              )}
            </div>
          ) : (
            <span className="text-[#28071C]/25 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-1">
            <button onClick={onEdit}
              className="p-1.5 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors">
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {isLastOfCat && catEntries.length > 1 && (
        <tr className="bg-[#7598CF]/5 border-t border-[#7598CF]/15">
          <td className="px-4 py-2" colSpan={2}>
            <span className="text-[10px] font-bold text-[#7598CF] uppercase tracking-wide">Média ponderada</span>
          </td>
          <td className="px-4 py-2 text-center">
            <span className={`text-xs font-bold ${pesoOk ? "text-emerald-600" : "text-orange-500"}`}>
              {pesoOk ? "✓ 100%" : `${totalPeso.toFixed(0)}% ≠ 100`}
            </span>
          </td>
          <td className="px-4 py-2 text-center text-xs text-[#7598CF] font-semibold">
            {(catEntries.reduce((s, e) => s + e.dias_producao * (e.peso_participacao ?? 100), 0) / 100).toFixed(0)}d
          </td>
          <td className="px-4 py-2 text-center text-xs text-[#7598CF] font-semibold">
            {(catEntries.reduce((s, e) => s + e.dias_transito * (e.peso_participacao ?? 100), 0) / 100).toFixed(0)}d
          </td>
          <td className="px-4 py-2 text-center text-xs text-[#7598CF] font-semibold">
            {(catEntries.reduce((s, e) => s + (e.lead_time_total ?? e.dias_producao + e.dias_transito) * (e.peso_participacao ?? 100), 0) / 100).toFixed(0)}d
          </td>
          <td colSpan={2} />
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTE: Leitura de etapas (view-only)
// ══════════════════════════════════════════════════════════════════════════════

function EtapasReadOnly({ etapas }: { etapas: ProducaoEtapa[] }) {
  const grupos = [...new Set(etapas.map(e => e.ordem_grupo))].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {grupos.map((grupo, gi) => {
        const etapasDoGrupo = etapas.filter(e => e.ordem_grupo === grupo);
        const isParalelo    = etapasDoGrupo.length > 1;
        const maxPrazo      = Math.max(...etapasDoGrupo.map(e => e.dias_prazo));
        const ci            = gi % GRUPO_BORDER_COLORS.length;
        return (
          <div key={grupo}>
            {gi > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-[#28071C]/10" />
                <span className="text-[10px] text-[#28071C]/30 font-medium">depois</span>
                <div className="flex-1 h-px bg-[#28071C]/10" />
              </div>
            )}
            {isParalelo && (
              <div className="text-[10px] font-bold text-[#28071C]/40 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <span className="text-blue-400">∥</span> Paralelas — prazo: {maxPrazo}d
              </div>
            )}
            <div className={`flex gap-2 ${isParalelo ? "flex-row" : "flex-col"}`}>
              {etapasDoGrupo.map(etapa => (
                <div key={etapa.id}
                  className={`flex-1 px-4 py-3 rounded-xl border-l-4 ${GRUPO_BG_COLORS[ci]} ${GRUPO_BORDER_COLORS[ci]} border border-[#28071C]/8`}>
                  <div className="font-semibold text-[#28071C] text-sm">{etapa.faccao_nome}</div>
                  {etapa.nome_etapa && <div className="text-xs text-[#28071C]/50">{etapa.nome_etapa}</div>}
                  <div className="text-xs font-bold text-[#28071C]/60 mt-1">{etapa.dias_prazo}d</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end pt-1">
        <span className="text-xs font-bold text-[#7598CF] bg-[#7598CF]/10 px-3 py-1 rounded-full">
          Prazo total: {calcPrazoTotal(etapas)}d
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: ENTRADA DA MATRIZ — multi-categoria + peso_participacao
// ══════════════════════════════════════════════════════════════════════════════

function MatrizEntradaModal({
  initial, hierarquia, fornecedores, condicoes, onSave, onClose,
}: {
  initial?: MatrizEntry;
  hierarquia: HierItem[];
  fornecedores: Fornecedor[];
  condicoes: CondicaoPagamento[];
  onSave: (
    values: Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "updated_at" | "fornecedor" | "condicao">,
    extraCategorias?: HierItem[]
  ) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!initial;

  // ── Picker de nova categoria ──────────────────────────────────────────────
  const [pickDiv,  setPickDiv]  = useState("");
  const [pickCat,  setPickCat]  = useState("");
  const [pickSub,  setPickSub]  = useState("");

  // Lista de categorias selecionadas
  const [selectedCats, setSelectedCats] = useState<HierItem[]>(
    isEdit
      ? [{ divisao: initial.divisao, categoria: initial.categoria, subcategoria: initial.subcategoria }]
      : []
  );

  // ── Campos do fornecedor ──────────────────────────────────────────────────
  const [fornId,    setFornId]    = useState(initial?.fornecedor_id ?? "");
  const [tipo,      setTipo]      = useState<TipoFornecimento>(initial?.tipo_fornecimento ?? "white_label");
  const [diasProd,  setDiasProd]  = useState(String(initial?.dias_producao  ?? "30"));
  const [diasTrans, setDiasTrans] = useState(String(initial?.dias_transito  ?? "0"));
  const [condId,    setCondId]    = useState(initial?.condicao_pagamento_id ?? "");
  const [peso,      setPeso]      = useState(String(initial?.peso_participacao ?? "100"));
  const [moeda,     setMoeda]     = useState(initial?.moeda ?? "BRL");
  const [obs,       setObs]       = useState(initial?.observacoes ?? "");
  const [saving,    setSaving]    = useState(false);

  const leadTotal = (Number(diasProd) || 0) + (Number(diasTrans) || 0);

  // Derived pickers
  const divisoes   = [...new Set(hierarquia.map(h => h.divisao))];
  const categorias = [...new Set(
    hierarquia.filter(h => !pickDiv || h.divisao === pickDiv).map(h => h.categoria)
  )];
  const subcats    = [...new Set(
    hierarquia.filter(h => h.categoria === pickCat).map(h => h.subcategoria).filter(Boolean) as string[]
  )];

  function addCategoria() {
    if (!pickDiv || !pickCat) return;
    const item: HierItem = { divisao: pickDiv, categoria: pickCat, subcategoria: pickSub || null };
    if (!selectedCats.some(c =>
      c.divisao === item.divisao && c.categoria === item.categoria && c.subcategoria === item.subcategoria
    )) {
      setSelectedCats(prev => [...prev, item]);
    }
    setPickDiv(""); setPickCat(""); setPickSub("");
  }

  async function submit() {
    if (selectedCats.length === 0 && !isEdit) {
      alert("Selecione ao menos uma categoria."); return;
    }
    setSaving(true);
    const baseValues: Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "updated_at" | "fornecedor" | "condicao"> = {
      hierarquia_id:       null,
      divisao:             selectedCats[0]?.divisao    ?? initial?.divisao    ?? "",
      categoria:           selectedCats[0]?.categoria  ?? initial?.categoria  ?? "",
      subcategoria:        selectedCats[0]?.subcategoria ?? initial?.subcategoria ?? null,
      fornecedor_id:       fornId || null,
      tipo_fornecimento:   tipo,
      dias_producao:       Number(diasProd)  || 0,
      dias_transito:       Number(diasTrans) || 0,
      condicao_pagamento_id: condId || null,
      peso_participacao:   Number(peso) || 100,
      moeda,
      observacoes:         obs || null,
      ativo:               true,
    };
    await onSave(baseValues, isEdit ? undefined : selectedCats);
    setSaving(false);
  }

  return (
    <Modal title={isEdit ? "Editar Fornecedor na Matriz" : "Adicionar Fornecedor"} onClose={onClose} wide>
      <div className="space-y-5">

        {/* ── Categorias ──────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-2">
            {isEdit ? "Categoria" : "Categorias atendidas"}
          </p>
          {!isEdit && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <SelectField value={pickDiv}
                  onChange={v => { setPickDiv(v); setPickCat(""); setPickSub(""); }}
                  options={divisoes.map(d => ({ value: d, label: d }))}
                  placeholder="Divisão" />
              </div>
              <div className="flex-1">
                <SelectField value={pickCat}
                  onChange={v => { setPickCat(v); setPickSub(""); }}
                  options={categorias.map(c => ({ value: c, label: c }))}
                  placeholder="Categoria" />
              </div>
              {subcats.length > 0 && (
                <div className="flex-1">
                  <SelectField value={pickSub} onChange={setPickSub}
                    options={subcats.map(s => ({ value: s, label: s }))}
                    placeholder="Subcategoria" allowEmpty="Todas" />
                </div>
              )}
              <button type="button" onClick={addCategoria}
                disabled={!pickDiv || !pickCat}
                className="flex items-center gap-1 px-3 py-2 bg-[#7598CF] text-white rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          )}
          {selectedCats.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedCats.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5 bg-[#7598CF]/10 text-[#7598CF] text-xs font-semibold px-3 py-1.5 rounded-full">
                  {c.categoria}{c.subcategoria ? ` › ${c.subcategoria}` : ""}
                  <span className="text-[#28071C]/30 text-[10px] ml-0.5">{c.divisao}</span>
                  {!isEdit && (
                    <button type="button"
                      onClick={() => setSelectedCats(prev => prev.filter((_, j) => j !== i))}
                      className="ml-0.5 text-[#7598CF]/60 hover:text-[#7598CF]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#28071C]/35 italic">Nenhuma categoria selecionada</p>
          )}
        </div>

        {/* ── Fornecedor e peso ────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-2">Fornecedor</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <SelectField value={fornId} onChange={setFornId}
                options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                allowEmpty="Nenhum / Produção Própria" />
            </div>
            <Field label="Peso/participação (%)">
              <input type="number" min={0} max={100} step={1} value={peso}
                onChange={e => setPeso(e.target.value)}
                className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]"
                placeholder="100" />
            </Field>
          </div>
        </div>

        {/* ── Tipo de fornecimento ─────────────────────────────────────────── */}
        <Field label="Tipo de fornecimento">
          <SelectField value={tipo} onChange={v => setTipo(v as TipoFornecimento)}
            options={Object.entries(TIPO_FORNECIMENTO_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
        </Field>

        {/* ── Lead time ─────────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-2">Lead Time</p>
          <div className="grid grid-cols-3 gap-3 items-end">
            <Field label="Produção (dias)">
              <input type="number" min={0} value={diasProd} onChange={e => setDiasProd(e.target.value)}
                className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
            </Field>
            <Field label="Entrega / trânsito (dias)">
              <input type="number" min={0} value={diasTrans} onChange={e => setDiasTrans(e.target.value)}
                className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
            </Field>
            <div>
              <div className="bg-[#7598CF]/10 rounded-xl px-4 py-2.5 text-center">
                <div className="text-[10px] text-[#7598CF]/70 uppercase tracking-wide font-bold">Total</div>
                <div className="text-[#7598CF] font-bold text-lg">{leadTotal}d</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Condição e moeda ──────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-2">Condição de Pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            <SelectField value={condId} onChange={setCondId}
              options={condicoes.map(c => ({ value: c.id, label: c.descricao }))}
              allowEmpty="Não definida" />
            <SelectField value={moeda} onChange={setMoeda}
              options={MOEDAS.map(m => ({ value: m, label: m }))} />
          </div>
        </div>

        <Field label="Observações">
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] resize-none" />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: MODELO PRODUÇÃO / FACÇÃO (com DnD de etapas)
// ══════════════════════════════════════════════════════════════════════════════

let _stageKey = 0;
const newKey = () => `s${++_stageKey}`;

function ProducaoModal({
  initial, hierarquia, condicoes, etapasIniciais, onSave, onClose,
}: {
  initial?: ProducaoModelo;
  hierarquia: HierItem[];
  condicoes: CondicaoPagamento[];
  etapasIniciais: ProducaoEtapa[];
  onSave: (
    values: Omit<ProducaoModelo, "id" | "tenant_id" | "created_at" | "updated_at">,
    etapas: Omit<ProducaoEtapa, "id" | "modelo_id" | "tenant_id" | "created_at">[],
    existingId?: string
  ) => Promise<void>;
  onClose: () => void;
}) {
  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  const [divisao,      setDivisao]      = useState(initial?.divisao       ?? "");
  const [categoria,    setCategoria]    = useState(initial?.categoria     ?? "");
  const [subcategoria, setSubcategoria] = useState(initial?.subcategoria  ?? "");
  const [nomeModelo,   setNomeModelo]   = useState(initial?.nome_modelo   ?? "Modelo Produção 1");
  const [pctMP,        setPctMP]        = useState(String(initial?.pct_materia_prima ?? "0"));
  const [condMpId,     setCondMpId]     = useState(initial?.condicao_mp_id ?? "");
  const [mesCorteBool, setMesCorteBool] = useState(!!initial?.mes_corte);
  const [mesCorte,     setMesCorte]     = useState(initial?.mes_corte     ?? "Janeiro");
  const [obsModelo,    setObsModelo]    = useState(initial?.observacoes   ?? "");

  // ── Etapas ────────────────────────────────────────────────────────────────
  const [stages, setStages] = useState<StageForm[]>(() =>
    etapasIniciais.length > 0
      ? etapasIniciais.map(e => ({
          _key: newKey(),
          id:   e.id,
          ordem_grupo:         e.ordem_grupo,
          nome_etapa:          e.nome_etapa ?? "",
          faccao_nome:         e.faccao_nome,
          dias_prazo:          e.dias_prazo,
          condicao_pagamento_id: e.condicao_pagamento_id ?? "",
          observacoes:         e.observacoes ?? "",
        }))
      : [{ _key: newKey(), ordem_grupo: 1, nome_etapa: "", faccao_nome: "", dias_prazo: 30, condicao_pagamento_id: "", observacoes: "" }]
  );

  const [dragIdx,    setDragIdx]    = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [saving,     setSaving]     = useState(false);

  const prazoTotal = calcPrazoTotal(stages.map(s => ({ ordem_grupo: s.ordem_grupo, dias_prazo: s.dias_prazo })));

  // Derived
  const divisoes   = [...new Set(hierarquia.map(h => h.divisao))];
  const categorias = [...new Set(hierarquia.filter(h => !divisao || h.divisao === divisao).map(h => h.categoria))];
  const subcats    = [...new Set(
    hierarquia.filter(h => h.categoria === categoria).map(h => h.subcategoria).filter(Boolean) as string[]
  )];

  // ── DnD Handlers ──────────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDropTarget(idx);
  }

  function handleDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null); setDropTarget(null); return;
    }
    const next    = [...stages];
    const dragged = { ...next[dragIdx] };
    const target  = next[dropIdx];

    // Dropa sobre etapa de outro grupo → une (paralelo)
    if (dragged.ordem_grupo !== target.ordem_grupo) {
      dragged.ordem_grupo = target.ordem_grupo;
    }
    next.splice(dragIdx, 1);
    const at = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
    next.splice(at, 0, dragged);
    setStages(next);
    setDragIdx(null); setDropTarget(null);
  }

  function handleDragEnd() { setDragIdx(null); setDropTarget(null); }

  // ── Mutations ─────────────────────────────────────────────────────────────
  function addStage() {
    const maxG = stages.length > 0 ? Math.max(...stages.map(s => s.ordem_grupo)) : 0;
    setStages(prev => [...prev, {
      _key: newKey(), ordem_grupo: maxG + 1,
      nome_etapa: "", faccao_nome: "", dias_prazo: 30, condicao_pagamento_id: "", observacoes: "",
    }]);
  }

  function removeStage(idx: number) {
    setStages(prev => renormGrupos(prev.filter((_, i) => i !== idx)));
  }

  function splitStage(idx: number) {
    setStages(prev => {
      const next = [...prev];
      const maxG = Math.max(...next.map(s => s.ordem_grupo));
      next[idx]  = { ...next[idx], ordem_grupo: maxG + 1 };
      return renormGrupos(next);
    });
  }

  function mergeWithPrev(idx: number) {
    if (idx === 0) return;
    setStages(prev => {
      const next = [...prev];
      next[idx]  = { ...next[idx], ordem_grupo: next[idx - 1].ordem_grupo };
      return next;
    });
  }

  function renormGrupos(arr: StageForm[]): StageForm[] {
    const groups = [...new Set(arr.map(s => s.ordem_grupo))].sort((a, b) => a - b);
    const map    = new Map(groups.map((g, i) => [g, i + 1]));
    return arr.map(s => ({ ...s, ordem_grupo: map.get(s.ordem_grupo) ?? s.ordem_grupo }));
  }

  function updateStage(idx: number, patch: Partial<StageForm>) {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!divisao || !categoria) { alert("Selecione divisão e categoria."); return; }
    if (!nomeModelo.trim())     { alert("Informe o nome do modelo.");       return; }
    if (stages.some(s => !s.faccao_nome.trim())) {
      alert("Todas as etapas precisam ter o nome da facção."); return;
    }
    setSaving(true);
    const modeloValues: Omit<ProducaoModelo, "id" | "tenant_id" | "created_at" | "updated_at"> = {
      divisao,
      categoria,
      subcategoria:     subcategoria || null,
      nome_modelo:      nomeModelo.trim(),
      pct_materia_prima: Number(pctMP) || 0,
      condicao_mp_id:   (mesCorteBool && condMpId) ? condMpId : null,
      mes_corte:        mesCorteBool ? mesCorte : null,
      observacoes:      obsModelo || null,
      ativo:            true,
    };
    const etapasValues = stages.map(s => ({
      ordem_grupo:          s.ordem_grupo,
      nome_etapa:           s.nome_etapa || null,
      faccao_nome:          s.faccao_nome.trim(),
      dias_prazo:           s.dias_prazo,
      condicao_pagamento_id: s.condicao_pagamento_id || null,
      observacoes:          s.observacoes || null,
    }));
    await onSave(modeloValues, etapasValues, initial?.id);
    setSaving(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal title={initial ? "Editar Modelo de Produção" : "Novo Modelo de Produção"} onClose={onClose} wide>
      <div className="space-y-6">

        {/* Identificação */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-2">Identificação</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <SelectField value={divisao}
              onChange={v => { setDivisao(v); setCategoria(""); setSubcategoria(""); }}
              options={divisoes.map(d => ({ value: d, label: d }))} placeholder="Divisão *" />
            <SelectField value={categoria}
              onChange={v => { setCategoria(v); setSubcategoria(""); }}
              options={categorias.map(c => ({ value: c, label: c }))} placeholder="Categoria *" />
            <SelectField value={subcategoria} onChange={setSubcategoria}
              options={subcats.map(s => ({ value: s, label: s }))}
              placeholder="Subcategoria" allowEmpty="Todas" />
          </div>
          <Field label="Nome do modelo">
            <input value={nomeModelo} onChange={e => setNomeModelo(e.target.value)}
              placeholder="Ex: Modelo Produção 1"
              className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
          </Field>
        </div>

        {/* Matéria-prima */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-2">Matéria-Prima</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="% do custo que é matéria-prima">
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} step={1} value={pctMP}
                  onChange={e => setPctMP(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
                <span className="text-[#28071C]/40 text-sm font-medium">%</span>
              </div>
            </Field>
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={mesCorteBool} onChange={e => setMesCorteBool(e.target.checked)}
                  className="accent-[#7598CF] w-4 h-4 cursor-pointer" />
                <span className="text-xs font-semibold text-[#28071C]/70">Mês de corte fixo</span>
              </label>
              {mesCorteBool && (
                <div className="space-y-2">
                  <SelectField value={mesCorte} onChange={setMesCorte}
                    options={MONTHS.map(m => ({ value: m, label: m }))} />
                  <SelectField value={condMpId} onChange={setCondMpId}
                    options={condicoes.map(c => ({ value: c.id, label: c.descricao }))}
                    allowEmpty="Sem condição de MP" />
                </div>
              )}
            </div>
          </div>
          {mesCorteBool && (
            <div className="mt-2 flex items-start gap-2 bg-[#F6F3AA]/40 border border-[#F6F3AA] rounded-xl px-3 py-2">
              <Info className="w-3.5 h-3.5 text-[#28071C]/50 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#28071C]/60">
                MP importada paga à vista em mês fixo. A facção (mão de obra) segue prazos normais das etapas.
              </p>
            </div>
          )}
        </div>

        {/* Etapas com DnD */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide">Etapas de Produção</p>
            {stages.length > 0 && (
              <span className="text-xs font-semibold text-[#7598CF] bg-[#7598CF]/10 px-3 py-1 rounded-full">
                Prazo total: {prazoTotal}d
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 bg-[#7598CF]/6 border border-[#7598CF]/20 rounded-xl px-3 py-2 mb-3">
            <Info className="w-3.5 h-3.5 text-[#7598CF] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#28071C]/60">
              <strong>Arraste</strong> uma etapa sobre outra para torná-las paralelas (mesmo grupo).
              Use <strong>✂ Separar</strong> para criar novo grupo sequencial.
              Use <strong>↑ Juntar</strong> para agrupar com a etapa acima.
            </p>
          </div>

          <div className="space-y-1.5">
            {stages.map((stage, idx) => {
              const prevStage  = idx > 0 ? stages[idx - 1] : null;
              const isNewGroup = !prevStage || prevStage.ordem_grupo !== stage.ordem_grupo;
              const isParalelo = stages.filter(s => s.ordem_grupo === stage.ordem_grupo).length > 1;
              const ci         = (stage.ordem_grupo - 1) % GRUPO_BORDER_COLORS.length;
              const isDragging  = dragIdx === idx;
              const isDropTgt   = dropTarget === idx && dragIdx !== null && dragIdx !== idx;

              return (
                <div key={stage._key}>
                  {isNewGroup && idx > 0 && (
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-[#28071C]/10" />
                      <span className="text-[10px] text-[#28071C]/30 font-medium">depois</span>
                      <div className="flex-1 h-px bg-[#28071C]/10" />
                    </div>
                  )}
                  {isParalelo && isNewGroup && (
                    <div className="text-[10px] font-bold text-[#28071C]/40 mb-1 flex items-center gap-1">
                      <span className="text-blue-400">∥</span> Paralelas
                    </div>
                  )}
                  <div
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e  => handleDragOver(e, idx)}
                    onDrop={e      => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-l-4 border transition-all cursor-grab active:cursor-grabbing
                      ${isDragging ? "opacity-40 scale-95" : ""}
                      ${isDropTgt  ? "ring-2 ring-[#7598CF]/40 scale-[1.01]" : ""}
                      ${GRUPO_BG_COLORS[ci]} ${GRUPO_BORDER_COLORS[ci]} border-[#28071C]/8`}
                  >
                    <GripVertical className="w-4 h-4 text-[#28071C]/25 flex-shrink-0" />
                    <input value={stage.faccao_nome} onChange={e => updateStage(idx, { faccao_nome: e.target.value })}
                      placeholder="Facção *"
                      className="flex-1 min-w-0 px-2 py-1.5 bg-white/70 border border-[#28071C]/10 rounded-lg text-sm text-[#28071C] focus:outline-none focus:ring-1 focus:ring-[#7598CF]/40" />
                    <input value={stage.nome_etapa} onChange={e => updateStage(idx, { nome_etapa: e.target.value })}
                      placeholder="Nome etapa (opcional)"
                      className="flex-1 min-w-0 px-2 py-1.5 bg-white/70 border border-[#28071C]/10 rounded-lg text-sm text-[#28071C] focus:outline-none focus:ring-1 focus:ring-[#7598CF]/40" />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" min={0} value={stage.dias_prazo}
                        onChange={e => updateStage(idx, { dias_prazo: Number(e.target.value) })}
                        className="w-16 px-2 py-1.5 bg-white/70 border border-[#28071C]/10 rounded-lg text-sm text-center text-[#28071C] focus:outline-none focus:ring-1 focus:ring-[#7598CF]/40" />
                      <span className="text-[#28071C]/40 text-xs">d</span>
                    </div>
                    <div className="shrink-0 w-36">
                      <select value={stage.condicao_pagamento_id}
                        onChange={e => updateStage(idx, { condicao_pagamento_id: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white/70 border border-[#28071C]/10 rounded-lg text-xs text-[#28071C] focus:outline-none focus:ring-1 focus:ring-[#7598CF]/40 cursor-pointer">
                        <option value="">Sem condição</option>
                        {condicoes.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {idx > 0 && (
                        <button type="button" onClick={() => mergeWithPrev(idx)}
                          title="Juntar com etapa acima (paralela)"
                          className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg text-xs transition-colors font-bold">↑</button>
                      )}
                      <button type="button" onClick={() => splitStage(idx)}
                        title="Separar em grupo sequencial"
                        className="p-1.5 text-[#28071C]/30 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => removeStage(idx)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={addStage}
            className="mt-3 flex items-center gap-2 px-4 py-2 border-2 border-dashed border-[#28071C]/15 text-[#28071C]/50 rounded-xl text-sm hover:border-[#7598CF]/40 hover:text-[#7598CF] transition-all w-full justify-center font-medium">
            <Plus className="w-4 h-4" /> Adicionar etapa
          </button>
        </div>

        <Field label="Observações do modelo">
          <textarea value={obsModelo} onChange={e => setObsModelo(e.target.value)} rows={2}
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] resize-none" />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: FORNECEDOR (catálogo)
// ══════════════════════════════════════════════════════════════════════════════

function FornecedorModal({
  initial, onSave, onClose,
}: {
  initial?: Fornecedor;
  onSave: (v: Omit<Fornecedor, "id" | "tenant_id" | "created_at" | "updated_at">) => Promise<void>;
  onClose: () => void;
}) {
  const [nome,   setNome]   = useState(initial?.nome          ?? "");
  const [tipo,   setTipo]   = useState<TipoFornecimento>(initial?.tipo ?? "white_label");
  const [pais,   setPais]   = useState(initial?.pais_origem   ?? "");
  const [moeda,  setMoeda]  = useState(initial?.moeda_padrao  ?? "BRL");
  const [cNome,  setCNome]  = useState(initial?.contato_nome  ?? "");
  const [cEmail, setCEmail] = useState(initial?.contato_email ?? "");
  const [obs,    setObs]    = useState(initial?.observacoes   ?? "");
  const [ativo,  setAtivo]  = useState(initial?.ativo         ?? true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!nome.trim()) return alert("Informe o nome do fornecedor.");
    setSaving(true);
    await onSave({
      nome: nome.trim(), tipo,
      pais_origem:   pais  || null,
      moeda_padrao:  moeda,
      contato_nome:  cNome  || null,
      contato_email: cEmail || null,
      observacoes:   obs    || null,
      ativo,
    });
    setSaving(false);
  }

  return (
    <Modal title={initial ? "Editar Fornecedor" : "Novo Fornecedor"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nome *">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Têxtil Sul S.A."
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo">
            <SelectField value={tipo} onChange={v => setTipo(v as TipoFornecimento)}
              options={Object.entries(TIPO_FORNECIMENTO_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
          </Field>
          <Field label="Moeda padrão">
            <SelectField value={moeda} onChange={setMoeda}
              options={MOEDAS.map(m => ({ value: m, label: m }))} />
          </Field>
        </div>
        <Field label="País de origem">
          <input value={pais} onChange={e => setPais(e.target.value)} placeholder="Ex: Brasil, China, Itália"
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contato — nome">
            <input value={cNome} onChange={e => setCNome(e.target.value)} placeholder="João Silva"
              className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
          </Field>
          <Field label="Contato — e-mail">
            <input value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="joao@fornecedor.com"
              className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
          </Field>
        </div>
        <Field label="Observações">
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] resize-none" />
        </Field>
        {initial && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)}
              className="accent-[#28071C] w-4 h-4" />
            <span className="text-sm text-[#28071C]">Fornecedor ativo</span>
          </label>
        )}
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CONDIÇÃO DE PAGAMENTO
// ══════════════════════════════════════════════════════════════════════════════

interface ParcelaForm { tipo_gatilho: TipoGatilho; percentual: string; dias_apos_gatilho: string; }

function CondicaoModal({
  initial, onSave, onClose,
}: {
  initial?: CondicaoPagamento;
  onSave: (desc: string, parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]) => Promise<void>;
  onClose: () => void;
}) {
  const initParcelas: ParcelaForm[] = (initial?.parcelas ?? []).map(p => ({
    tipo_gatilho:      p.tipo_gatilho,
    percentual:        String(p.percentual),
    dias_apos_gatilho: String(p.dias_apos_gatilho),
  }));
  const [desc,     setDesc]     = useState(initial?.descricao ?? "");
  const [parcelas, setParcelas] = useState<ParcelaForm[]>(
    initParcelas.length
      ? initParcelas
      : [{ tipo_gatilho: "PEDIDO", percentual: "100", dias_apos_gatilho: "0" }]
  );
  const [saving, setSaving] = useState(false);

  const totalPct = parcelas.reduce((s, p) => s + (Number(p.percentual) || 0), 0);

  function updateParcela(i: number, patch: Partial<ParcelaForm>) {
    setParcelas(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }

  function addParcela() {
    setParcelas(prev => [...prev, { tipo_gatilho: "FATURAMENTO", percentual: "0", dias_apos_gatilho: "30" }]);
  }

  async function submit() {
    if (!desc.trim()) return alert("Informe a descrição da condição.");
    if (Math.abs(totalPct - 100) > 0.01) {
      return alert(`Soma dos percentuais deve ser 100%. Atual: ${totalPct.toFixed(2)}%`);
    }
    setSaving(true);
    await onSave(
      desc.trim(),
      parcelas.map((p, i) => ({
        parcela_numero:    i + 1,
        tipo_gatilho:      p.tipo_gatilho,
        percentual:        Number(p.percentual),
        dias_apos_gatilho: Number(p.dias_apos_gatilho),
      }))
    );
    setSaving(false);
  }

  return (
    <Modal title={initial ? "Editar Condição" : "Nova Condição de Pagamento"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Descrição *">
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: 30% pedido + 70% faturamento 30d"
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide">Parcelas</p>
            <span className={`text-xs font-bold flex items-center gap-1 ${Math.abs(totalPct - 100) < 0.01 ? "text-emerald-600" : "text-orange-500"}`}>
              {totalPct.toFixed(0)}% {Math.abs(totalPct - 100) < 0.01 && <Check className="w-3 h-3" />}
            </span>
          </div>
          <div className="space-y-2">
            {parcelas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={p.tipo_gatilho}
                  onChange={e => updateParcela(i, { tipo_gatilho: e.target.value as TipoGatilho })}
                  className="px-2 py-1.5 border-2 border-[#7598CF]/30 rounded-lg text-xs text-[#28071C] focus:outline-none bg-white cursor-pointer">
                  {(["PEDIDO","FATURAMENTO","ENTREGA"] as TipoGatilho[]).map(g => (
                    <option key={g} value={g}>{TIPO_GATILHO_LABELS[g]}</option>
                  ))}
                </select>
                <input type="number" min={0} max={100} value={p.percentual}
                  onChange={e => updateParcela(i, { percentual: e.target.value })}
                  className="w-16 px-2 py-1.5 border-2 border-[#7598CF]/30 rounded-lg text-xs text-center text-[#28071C] focus:outline-none" />
                <span className="text-[#28071C]/40 text-xs">% +</span>
                <input type="number" min={0} value={p.dias_apos_gatilho}
                  onChange={e => updateParcela(i, { dias_apos_gatilho: e.target.value })}
                  className="w-16 px-2 py-1.5 border-2 border-[#7598CF]/30 rounded-lg text-xs text-center text-[#28071C] focus:outline-none" />
                <span className="text-[#28071C]/40 text-xs">d</span>
                {parcelas.length > 1 && (
                  <button type="button" onClick={() => setParcelas(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 text-red-400 hover:bg-red-50 rounded">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addParcela}
            className="mt-2 flex items-center gap-1 text-xs text-[#7598CF] hover:underline font-medium">
            <Plus className="w-3.5 h-3.5" /> Adicionar parcela
          </button>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Micro-componentes reutilizáveis
// ══════════════════════════════════════════════════════════════════════════════

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#28071C]/60 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SelectField({
  value, onChange, options, placeholder, allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allowEmpty?: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full pl-3 pr-8 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] appearance-none bg-white cursor-pointer">
        {allowEmpty !== undefined
          ? <option value="">{allowEmpty}</option>
          : placeholder && <option value="">{placeholder}</option>
        }
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#28071C]/40 pointer-events-none" />
    </div>
  );
}

function Modal({ title, children, onClose, wide = false }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-6 py-4 bg-[#28071C] shrink-0">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, disabled = false }: {
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#28071C]/8">
      <button onClick={onClose}
        className="px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C]/60 rounded-xl text-sm font-semibold hover:border-[#28071C]/40 transition-colors">
        Cancelar
      </button>
      <button onClick={onSave} disabled={saving || disabled}
        className="flex items-center gap-2 px-5 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
        {saving
          ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando…</>
          : <><Save className="w-4 h-4" /> Salvar</>}
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: {
  icon: React.FC<{ className?: string }>; title: string; desc: string;
}) {
  return (
    <div className="bg-white/60 rounded-2xl border border-[#28071C]/8 py-16 text-center text-[#28071C]/40">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-semibold">{title}</p>
      <p className="text-sm mt-1">{desc}</p>
    </div>
  );
}
