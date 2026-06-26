// ─── MatrizAbastecimento.tsx ──────────────────────────────────────────────────
// Tela de Matriz de Abastecimento — relaciona hierarquia de produto × fornecedor,
// define lead times (produção + trânsito) e condições de pagamento por parcela.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Plus, Edit, Trash2, X, Save, Truck, Package,
  CreditCard, ChevronDown, AlertCircle, Check, Info,
} from "lucide-react";
import {
  type Fornecedor, type CondicaoPagamento, type Parcela,
  type MatrizEntry, type TipoFornecimento, type TipoGatilho,
  listFornecedoresDb, insertFornecedorDb, updateFornecedorDb, deleteFornecedorDb,
  listCondicoesDb, insertCondicaoDb, updateCondicaoDb, deleteCondicaoDb,
  listMatrizDb, insertMatrizEntryDb, updateMatrizEntryDb, deleteMatrizEntryDb,
} from "../../services/supabase/matrizAbastecimentoService";

// ══════════════════════════════════════════════════════════════════════════════
// Helpers / constantes
// ══════════════════════════════════════════════════════════════════════════════

const TIPO_FORNECIMENTO_LABELS: Record<TipoFornecimento, string> = {
  white_label:    "White Label",
  private_label:  "Private Label",
  producao_propria: "Produção Própria",
  importado:      "Importado",
};

const TIPO_GATILHO_LABELS: Record<TipoGatilho, string> = {
  PEDIDO:       "Pedido",
  FATURAMENTO:  "Faturamento",
  ENTREGA:      "Entrega",
};

const GATILHO_COLORS: Record<TipoGatilho, string> = {
  PEDIDO:      "bg-[#7598CF]/15 text-[#7598CF]",
  FATURAMENTO: "bg-[#9B8CD8]/15 text-[#9B8CD8]",
  ENTREGA:     "bg-emerald-100 text-emerald-700",
};

const TIPO_COLORS: Record<TipoFornecimento, string> = {
  white_label:     "bg-[#F6F3AA]/60 text-[#28071C]",
  private_label:   "bg-[#7598CF]/15 text-[#7598CF]",
  producao_propria:"bg-emerald-100 text-emerald-700",
  importado:       "bg-orange-100 text-orange-700",
};

const MOEDAS = ["BRL", "USD", "EUR", "GBP", "CNY", "ARS"];

// Lê hierarquia da árvore salva no localStorage pelo OperationSettings
const HIER_STRUCT_KEY = "fashionmind_hierarchy_struct";
interface HierNode { id: string; label: string; children: HierNode[] }

function flattenHier(nodes: HierNode[], depth = 0): { divisao: string; categoria: string; subcategoria: string | null }[] {
  const result: { divisao: string; categoria: string; subcategoria: string | null }[] = [];
  for (const node of nodes) {
    if (depth === 0) {
      // Divisão
      for (const catNode of node.children) {
        if (catNode.children.length === 0) {
          result.push({ divisao: node.label, categoria: catNode.label, subcategoria: null });
        } else {
          for (const subNode of catNode.children) {
            result.push({ divisao: node.label, categoria: catNode.label, subcategoria: subNode.label });
          }
        }
      }
    }
  }
  return result;
}

function loadHierarquia() {
  try {
    const raw = localStorage.getItem(HIER_STRUCT_KEY);
    if (!raw) return [];
    return flattenHier(JSON.parse(raw));
  } catch {
    return [];
  }
}

function getTenantId(): string | null {
  try {
    const user = JSON.parse(sessionStorage.getItem("currentUser") ?? "{}");
    return user?.tenant_id ?? null;
  } catch { return null; }
}

// Gera descrição automática de condição a partir das parcelas
function gerarDescricaoCondicao(parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]): string {
  return parcelas
    .map(p =>
      `${p.percentual}% ${TIPO_GATILHO_LABELS[p.tipo_gatilho]}${p.dias_apos_gatilho > 0 ? ` +${p.dias_apos_gatilho}d` : ""}`
    )
    .join(" / ");
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-componente: Badge tipo fornecimento
// ══════════════════════════════════════════════════════════════════════════════

function TipoBadge({ tipo }: { tipo: TipoFornecimento }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${TIPO_COLORS[tipo]}`}>
      {TIPO_FORNECIMENTO_LABELS[tipo]}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-componente: Builder de parcelas
// ══════════════════════════════════════════════════════════════════════════════

type ParcelaForm = { percentual: string; tipo_gatilho: TipoGatilho; dias_apos_gatilho: string };

function ParcelasBuilder({
  parcelas, onChange,
}: {
  parcelas: ParcelaForm[];
  onChange: (p: ParcelaForm[]) => void;
}) {
  const soma = parcelas.reduce((s, p) => s + (parseFloat(p.percentual) || 0), 0);
  const restante = 100 - soma;
  const valido = Math.abs(restante) < 0.01;

  function add() {
    const nova: ParcelaForm = {
      percentual: restante > 0 ? String(Math.round(restante * 100) / 100) : "",
      tipo_gatilho: "PEDIDO",
      dias_apos_gatilho: "0",
    };
    onChange([...parcelas, nova]);
  }

  function remove(i: number) {
    onChange(parcelas.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof ParcelaForm, value: string) {
    const next = [...parcelas];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }

  return (
    <div>
      {parcelas.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <span className="text-[#28071C]/40 text-xs w-5 text-right shrink-0">{i + 1}.</span>

          {/* % */}
          <div className="relative w-24 shrink-0">
            <input
              type="number" min={0} max={100} step={0.01}
              value={p.percentual}
              onChange={e => update(i, "percentual", e.target.value)}
              placeholder="0"
              className="w-full pl-3 pr-6 py-1.5 border-2 border-[#7598CF]/30 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#28071C]/40 text-xs">%</span>
          </div>

          {/* Gatilho */}
          <div className="relative flex-1">
            <select
              value={p.tipo_gatilho}
              onChange={e => update(i, "tipo_gatilho", e.target.value)}
              className="w-full pl-3 pr-8 py-1.5 border-2 border-[#7598CF]/30 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] appearance-none bg-white cursor-pointer"
            >
              {(["PEDIDO","FATURAMENTO","ENTREGA"] as TipoGatilho[]).map(g => (
                <option key={g} value={g}>{TIPO_GATILHO_LABELS[g]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#28071C]/40 pointer-events-none" />
          </div>

          {/* Dias */}
          <div className="relative w-28 shrink-0">
            <input
              type="number" min={0} step={1}
              value={p.dias_apos_gatilho}
              onChange={e => update(i, "dias_apos_gatilho", e.target.value)}
              placeholder="0"
              className="w-full pl-3 pr-10 py-1.5 border-2 border-[#7598CF]/30 rounded-lg text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#28071C]/40 text-xs">dias</span>
          </div>

          <button
            onClick={() => remove(i)}
            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Rodapé: soma + botão adicionar */}
      <div className="flex items-center justify-between mt-3">
        <button
          type="button" onClick={add}
          className="flex items-center gap-1.5 text-[#7598CF] hover:text-[#7598CF]/80 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar parcela
        </button>

        <div className={`flex items-center gap-1.5 text-sm font-semibold ${valido ? "text-emerald-600" : "text-red-500"}`}>
          {valido
            ? <><Check className="w-4 h-4" /> 100% ✓</>
            : <><AlertCircle className="w-4 h-4" /> {soma.toFixed(0)}% de 100%</>
          }
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL BASE
// ══════════════════════════════════════════════════════════════════════════════

function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#28071C]/40 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/8 shrink-0">
          <h3 className="text-[#28071C] font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#28071C]/8 text-[#28071C]/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

type Tab = "matriz" | "fornecedores" | "condicoes";

export default function MatrizAbastecimento() {
  const navigate = useNavigate();
  const tenantId = getTenantId();

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("matriz");

  // ── Data ─────────────────────────────────────────────────────────────────
  const [hierarquia] = useState(() => loadHierarquia());
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [condicoes,    setCondicoes]    = useState<CondicaoPagamento[]>([]);
  const [matriz,       setMatriz]       = useState<MatrizEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // ── Filtro matriz ────────────────────────────────────────────────────────
  const [filterDivisao,   setFilterDivisao]   = useState("");
  const [filterFornecedor, setFilterFornecedor] = useState("");

  // ── Modals ───────────────────────────────────────────────────────────────
  // Matriz modal
  const [matrizModal, setMatrizModal] = useState<{
    mode: "add" | "edit"; entry?: MatrizEntry;
  } | null>(null);

  // Fornecedor modal
  const [fornModal, setFornModal] = useState<{
    mode: "add" | "edit"; item?: Fornecedor;
  } | null>(null);

  // Condição modal
  const [condModal, setCondModal] = useState<{
    mode: "add" | "edit"; item?: CondicaoPagamento;
  } | null>(null);

  // ── Carregamento inicial ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [f, c, m] = await Promise.all([
        listFornecedoresDb(tenantId),
        listCondicoesDb(tenantId),
        listMatrizDb(tenantId),
      ]);
      setFornecedores(f);
      setCondicoes(c);
      setMatriz(m);
      setError(null);
    } catch (e) {
      setError((e as Error).message ?? "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  // ── Divisões únicas para filtro ───────────────────────────────────────────
  const divisoesUnicas = [...new Set(hierarquia.map(h => h.divisao))];

  // ── Matriz filtrada ───────────────────────────────────────────────────────
  const matrizFiltrada = matriz.filter(m => {
    if (filterDivisao   && m.divisao !== filterDivisao) return false;
    if (filterFornecedor && m.fornecedor_id !== filterFornecedor) return false;
    return true;
  });

  // ═════════════════════════════════════════════════════════════════════════
  // HANDLERS — FORNECEDOR
  // ═════════════════════════════════════════════════════════════════════════

  async function handleSaveFornecedor(values: Omit<Fornecedor, "id" | "tenant_id" | "created_at" | "updated_at">) {
    if (!tenantId) return;
    try {
      if (fornModal?.mode === "edit" && fornModal.item) {
        const updated = await updateFornecedorDb(fornModal.item.id, values);
        setFornecedores(prev => prev.map(f => f.id === updated.id ? updated : f));
      } else {
        const created = await insertFornecedorDb(tenantId, values);
        setFornecedores(prev => [...prev, created]);
      }
      setFornModal(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteFornecedor(id: string) {
    if (!confirm("Excluir este fornecedor?")) return;
    try {
      await deleteFornecedorDb(id);
      setFornecedores(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // HANDLERS — CONDIÇÃO
  // ═════════════════════════════════════════════════════════════════════════

  async function handleSaveCondicao(descricao: string, parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]) {
    if (!tenantId) return;
    try {
      if (condModal?.mode === "edit" && condModal.item) {
        const updated = await updateCondicaoDb(condModal.item.id, descricao, parcelas);
        setCondicoes(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await insertCondicaoDb(tenantId, descricao, parcelas);
        setCondicoes(prev => [...prev, created]);
      }
      setCondModal(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteCondicao(id: string) {
    if (!confirm("Excluir esta condição de pagamento?")) return;
    try {
      await deleteCondicaoDb(id);
      setCondicoes(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // HANDLERS — MATRIZ
  // ═════════════════════════════════════════════════════════════════════════

  async function handleSaveMatriz(values: Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "updated_at" | "fornecedor" | "condicao">) {
    if (!tenantId) return;
    try {
      if (matrizModal?.mode === "edit" && matrizModal.entry) {
        await updateMatrizEntryDb(matrizModal.entry.id, values);
      } else {
        await insertMatrizEntryDb(tenantId, values);
      }
      await load();
      setMatrizModal(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteMatriz(id: string) {
    if (!confirm("Remover esta entrada da matriz?")) return;
    try {
      await deleteMatrizEntryDb(id);
      setMatriz(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F6F3AA]/20 via-white to-[#7598CF]/10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#28071C]/8 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/operation-settings")}
            className="p-2 rounded-xl hover:bg-[#28071C]/8 text-[#28071C]/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#F6F3AA] flex items-center justify-center">
              <Truck className="w-5 h-5 text-[#28071C]" />
            </div>
            <div>
              <h1 className="text-[#28071C] font-bold text-lg leading-tight">Matriz de Abastecimento</h1>
              <p className="text-[#28071C]/50 text-xs">Lead time e condições de pagamento por hierarquia × fornecedor</p>
            </div>
          </div>

          {/* Aviso sem Supabase */}
          {!tenantId && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1.5 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Sessão não encontrada — faça login novamente
            </div>
          )}
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#28071C]/8 bg-white/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {([
              { id: "matriz",      label: "Matriz",                   icon: Truck       },
              { id: "fornecedores",label: "Fornecedores",             icon: Package     },
              { id: "condicoes",   label: "Condições de Pagamento",   icon: CreditCard  },
            ] as { id: Tab; label: string; icon: React.FC<{ className?: string }> }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "border-[#28071C] text-[#28071C]"
                    : "border-transparent text-[#28071C]/40 hover:text-[#28071C]/70"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Conteúdo ───────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#28071C]/40">
            <div className="w-6 h-6 border-2 border-[#7598CF] border-t-transparent rounded-full animate-spin mr-3" />
            Carregando dados…
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={load} className="ml-auto text-xs underline">Tentar novamente</button>
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 1: MATRIZ                                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "matriz" && (
              <div>
                {/* Barra de ações */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  {/* Filtro divisão */}
                  <div className="relative">
                    <select
                      value={filterDivisao}
                      onChange={e => setFilterDivisao(e.target.value)}
                      className="pl-3 pr-8 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] appearance-none bg-white cursor-pointer"
                    >
                      <option value="">Todas as divisões</option>
                      {divisoesUnicas.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#28071C]/40 pointer-events-none" />
                  </div>

                  {/* Filtro fornecedor */}
                  <div className="relative">
                    <select
                      value={filterFornecedor}
                      onChange={e => setFilterFornecedor(e.target.value)}
                      className="pl-3 pr-8 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] appearance-none bg-white cursor-pointer"
                    >
                      <option value="">Todos os fornecedores</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#28071C]/40 pointer-events-none" />
                  </div>

                  <button
                    onClick={() => setMatrizModal({ mode: "add" })}
                    className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Nova entrada
                  </button>
                </div>

                {/* Aviso se hierarquia vazia */}
                {hierarquia.length === 0 && (
                  <div className="flex items-center gap-3 bg-[#F6F3AA]/60 border border-[#F6F3AA] text-[#28071C]/70 px-4 py-3 rounded-xl mb-4 text-sm">
                    <Info className="w-4 h-4 shrink-0 text-[#28071C]/40" />
                    Nenhuma hierarquia encontrada. Configure a estrutura de produto em{" "}
                    <button onClick={() => navigate("/operation-settings")} className="underline font-semibold">
                      Configurações de Operação
                    </button>{" "}
                    primeiro.
                  </div>
                )}

                {/* Tabela */}
                {matrizFiltrada.length === 0 ? (
                  <div className="bg-white/60 rounded-2xl border border-[#28071C]/8 py-16 text-center text-[#28071C]/40">
                    <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">Nenhuma entrada na matriz</p>
                    <p className="text-sm mt-1">Clique em "Nova entrada" para começar</p>
                  </div>
                ) : (
                  <div className="bg-white/60 rounded-2xl overflow-hidden shadow-sm border border-[#28071C]/8">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F6F3AA]/70 border-b border-[#28071C]/10">
                          <th className="px-4 py-3 text-left text-[#28071C] font-bold text-xs uppercase tracking-wide">Hierarquia</th>
                          <th className="px-4 py-3 text-left text-[#28071C] font-bold text-xs uppercase tracking-wide">Fornecedor</th>
                          <th className="px-4 py-3 text-left text-[#28071C] font-bold text-xs uppercase tracking-wide">Tipo</th>
                          <th className="px-4 py-3 text-center text-[#28071C] font-bold text-xs uppercase tracking-wide">Prod (d)</th>
                          <th className="px-4 py-3 text-center text-[#28071C] font-bold text-xs uppercase tracking-wide">Trânsito (d)</th>
                          <th className="px-4 py-3 text-center text-[#28071C] font-bold text-xs uppercase tracking-wide">Lead Total</th>
                          <th className="px-4 py-3 text-left text-[#28071C] font-bold text-xs uppercase tracking-wide">Pagamento</th>
                          <th className="px-4 py-3 text-center text-[#28071C] font-bold text-xs uppercase tracking-wide">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrizFiltrada.map((entry, i) => (
                          <tr key={entry.id} className={`border-b border-[#28071C]/6 hover:bg-[#7598CF]/4 transition-colors ${i % 2 === 0 ? "" : "bg-white/40"}`}>
                            {/* Hierarquia */}
                            <td className="px-4 py-3">
                              <div className="font-semibold text-[#28071C]">{entry.divisao}</div>
                              <div className="text-[#28071C]/50 text-xs">{entry.categoria}{entry.subcategoria ? ` › ${entry.subcategoria}` : ""}</div>
                            </td>
                            {/* Fornecedor */}
                            <td className="px-4 py-3">
                              <div className="text-[#28071C] font-medium">
                                {entry.fornecedor?.nome ?? <span className="text-[#28071C]/30 italic">—</span>}
                              </div>
                              <div className="text-[#28071C]/40 text-xs">{entry.moeda}</div>
                            </td>
                            {/* Tipo */}
                            <td className="px-4 py-3">
                              <TipoBadge tipo={entry.tipo_fornecimento} />
                            </td>
                            {/* Produção */}
                            <td className="px-4 py-3 text-center text-[#28071C]">{entry.dias_producao}</td>
                            {/* Trânsito */}
                            <td className="px-4 py-3 text-center text-[#28071C]">{entry.dias_transito}</td>
                            {/* Lead total */}
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold text-[#7598CF] bg-[#7598CF]/10 px-2 py-0.5 rounded-lg">
                                {entry.lead_time_total ?? (entry.dias_producao + entry.dias_transito)} d
                              </span>
                            </td>
                            {/* Pagamento */}
                            <td className="px-4 py-3">
                              {entry.condicao ? (
                                <div>
                                  <div className="text-[#28071C] text-xs font-medium">{entry.condicao.descricao}</div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {entry.condicao.parcelas.map(p => (
                                      <span key={p.parcela_numero} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${GATILHO_COLORS[p.tipo_gatilho]}`}>
                                        {p.percentual}% {p.tipo_gatilho}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[#28071C]/30 italic text-xs">Não definido</span>
                              )}
                            </td>
                            {/* Ações */}
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setMatrizModal({ mode: "edit", entry })}
                                  className="p-1.5 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-lg transition-colors"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMatriz(entry.id)}
                                  className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 2: FORNECEDORES                                          */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "fornecedores" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[#28071C]/60 text-sm">
                    {fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""} cadastrado{fornecedores.length !== 1 ? "s" : ""}
                  </p>
                  <button
                    onClick={() => setFornModal({ mode: "add" })}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Novo fornecedor
                  </button>
                </div>

                {fornecedores.length === 0 ? (
                  <div className="bg-white/60 rounded-2xl border border-[#28071C]/8 py-16 text-center text-[#28071C]/40">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">Nenhum fornecedor cadastrado</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {fornecedores.map(f => (
                      <div key={f.id} className="bg-white/70 rounded-2xl border border-[#28071C]/8 px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                        <div className="w-10 h-10 rounded-xl bg-[#F6F3AA]/60 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-[#28071C]/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[#28071C] font-semibold">{f.nome}</span>
                            <TipoBadge tipo={f.tipo} />
                            {!f.ativo && (
                              <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Inativo</span>
                            )}
                          </div>
                          <div className="text-[#28071C]/50 text-xs mt-0.5 flex flex-wrap gap-3">
                            {f.pais_origem && <span>🌍 {f.pais_origem}</span>}
                            <span>💱 {f.moeda_padrao}</span>
                            {f.contato_nome  && <span>👤 {f.contato_nome}</span>}
                            {f.contato_email && <span>✉ {f.contato_email}</span>}
                          </div>
                          {f.observacoes && (
                            <p className="text-[#28071C]/40 text-xs mt-1 truncate">{f.observacoes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setFornModal({ mode: "edit", item: f })}
                            className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-xl transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFornecedor(f.id)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                          >
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
            {/* TAB 3: CONDIÇÕES DE PAGAMENTO                                */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === "condicoes" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[#28071C]/60 text-sm">
                    Templates reutilizáveis de condição de pagamento com gatilhos por evento
                  </p>
                  <button
                    onClick={() => setCondModal({ mode: "add" })}
                    className="flex items-center gap-2 px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/85 transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Nova condição
                  </button>
                </div>

                {condicoes.length === 0 ? (
                  <div className="bg-white/60 rounded-2xl border border-[#28071C]/8 py-16 text-center text-[#28071C]/40">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">Nenhuma condição cadastrada</p>
                    <p className="text-sm mt-1">Crie templates de pagamento para reutilizar na matriz</p>
                  </div>
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
                                  {i < c.parcelas.length - 1 && (
                                    <span className="text-[#28071C]/20 text-xs">→</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setCondModal({ mode: "edit", item: c })}
                              className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded-xl transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCondicao(c.id)}
                              className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                            >
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

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: FORNECEDOR                                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {fornModal && (
        <FornecedorModal
          initial={fornModal.item}
          onSave={handleSaveFornecedor}
          onClose={() => setFornModal(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: CONDIÇÃO DE PAGAMENTO                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {condModal && (
        <CondicaoModal
          initial={condModal.item}
          onSave={handleSaveCondicao}
          onClose={() => setCondModal(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ENTRADA DA MATRIZ                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {matrizModal && (
        <MatrizModal
          initial={matrizModal.entry}
          hierarquia={hierarquia}
          fornecedores={fornecedores}
          condicoes={condicoes}
          onSave={handleSaveMatriz}
          onClose={() => setMatrizModal(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: FORNECEDOR
// ══════════════════════════════════════════════════════════════════════════════

function FornecedorModal({
  initial, onSave, onClose,
}: {
  initial?: Fornecedor;
  onSave: (v: Omit<Fornecedor, "id" | "tenant_id" | "created_at" | "updated_at">) => Promise<void>;
  onClose: () => void;
}) {
  const [nome,    setNome]    = useState(initial?.nome           ?? "");
  const [tipo,    setTipo]    = useState<TipoFornecimento>(initial?.tipo ?? "white_label");
  const [pais,    setPais]    = useState(initial?.pais_origem     ?? "");
  const [moeda,   setMoeda]   = useState(initial?.moeda_padrao   ?? "BRL");
  const [cNome,   setCNome]   = useState(initial?.contato_nome   ?? "");
  const [cEmail,  setCEmail]  = useState(initial?.contato_email  ?? "");
  const [obs,     setObs]     = useState(initial?.observacoes    ?? "");
  const [ativo,   setAtivo]   = useState(initial?.ativo          ?? true);
  const [saving,  setSaving]  = useState(false);

  async function submit() {
    if (!nome.trim()) return alert("Informe o nome do fornecedor.");
    setSaving(true);
    await onSave({ nome: nome.trim(), tipo, pais_origem: pais || null, moeda_padrao: moeda,
      contato_nome: cNome || null, contato_email: cEmail || null, observacoes: obs || null, ativo });
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
          <Field label="Tipo *">
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

function CondicaoModal({
  initial, onSave, onClose,
}: {
  initial?: CondicaoPagamento;
  onSave: (desc: string, parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]) => Promise<void>;
  onClose: () => void;
}) {
  const initParcelas: ParcelaForm[] = (initial?.parcelas ?? []).map(p => ({
    percentual: String(p.percentual),
    tipo_gatilho: p.tipo_gatilho,
    dias_apos_gatilho: String(p.dias_apos_gatilho),
  }));

  const [parcelas, setParcelas] = useState<ParcelaForm[]>(
    initParcelas.length > 0 ? initParcelas : [{ percentual: "100", tipo_gatilho: "PEDIDO", dias_apos_gatilho: "0" }]
  );
  const [descManual, setDescManual] = useState(initial?.descricao ?? "");
  const [autoDesc,   setAutoDesc]   = useState(!initial);
  const [saving,     setSaving]     = useState(false);

  // Auto-gera descrição
  const gerada = gerarDescricaoCondicao(
    parcelas.map((p, i) => ({
      parcela_numero: i + 1,
      percentual: parseFloat(p.percentual) || 0,
      tipo_gatilho: p.tipo_gatilho,
      dias_apos_gatilho: parseInt(p.dias_apos_gatilho) || 0,
    }))
  );
  const descricao = autoDesc ? gerada : descManual;

  const somaValida = Math.abs(
    parcelas.reduce((s, p) => s + (parseFloat(p.percentual) || 0), 0) - 100
  ) < 0.01;

  async function submit() {
    if (!somaValida) return alert("A soma dos percentuais deve ser 100%.");
    if (!descricao.trim()) return alert("Informe a descrição da condição.");
    setSaving(true);
    const p = parcelas.map((p, i) => ({
      parcela_numero: i + 1,
      percentual: parseFloat(p.percentual),
      tipo_gatilho: p.tipo_gatilho,
      dias_apos_gatilho: parseInt(p.dias_apos_gatilho) || 0,
    }));
    await onSave(descricao.trim(), p);
    setSaving(false);
  }

  return (
    <Modal title={initial ? "Editar Condição de Pagamento" : "Nova Condição de Pagamento"} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Parcelas builder */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-3">Parcelas</p>
          <div className="bg-[#F6F3AA]/20 rounded-xl p-4 border border-[#F6F3AA]">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-2 mb-2 px-5">
              <span />
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#28071C]/40">%</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#28071C]/40">Evento gatilho</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#28071C]/40">Dias após</span>
              <span />
            </div>
            <ParcelasBuilder parcelas={parcelas} onChange={setParcelas} />
          </div>
        </div>

        {/* Descrição */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide">Descrição</p>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#28071C]/50">
              <input type="checkbox" checked={autoDesc} onChange={e => {
                setAutoDesc(e.target.checked);
                if (e.target.checked) setDescManual(gerada);
              }} className="accent-[#7598CF]" />
              Gerar automaticamente
            </label>
          </div>
          <input
            value={autoDesc ? gerada : descManual}
            onChange={e => { setDescManual(e.target.value); setAutoDesc(false); }}
            readOnly={autoDesc}
            placeholder="Ex: 50% Pedido / 50% Faturamento"
            className={`w-full px-3 py-2 border-2 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] ${
              autoDesc ? "border-[#28071C]/10 bg-[#28071C]/3 text-[#28071C]/60" : "border-[#7598CF]/30"
            }`}
          />
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} disabled={!somaValida} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: ENTRADA DA MATRIZ
// ══════════════════════════════════════════════════════════════════════════════

function MatrizModal({
  initial, hierarquia, fornecedores, condicoes, onSave, onClose,
}: {
  initial?: MatrizEntry;
  hierarquia: { divisao: string; categoria: string; subcategoria: string | null }[];
  fornecedores: Fornecedor[];
  condicoes: CondicaoPagamento[];
  onSave: (v: Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "updated_at" | "fornecedor" | "condicao">) => Promise<void>;
  onClose: () => void;
}) {
  const [divisao,      setDivisao]      = useState(initial?.divisao         ?? "");
  const [categoria,    setCategoria]    = useState(initial?.categoria        ?? "");
  const [subcategoria, setSubcategoria] = useState(initial?.subcategoria     ?? "");
  const [fornId,       setFornId]       = useState(initial?.fornecedor_id    ?? "");
  const [tipo,         setTipo]         = useState<TipoFornecimento>(initial?.tipo_fornecimento ?? "white_label");
  const [diasProd,     setDiasProd]     = useState(String(initial?.dias_producao  ?? 0));
  const [diasTrans,    setDiasTrans]    = useState(String(initial?.dias_transito  ?? 0));
  const [condId,       setCondId]       = useState(initial?.condicao_pagamento_id ?? "");
  const [moeda,        setMoeda]        = useState(initial?.moeda             ?? "BRL");
  const [obs,          setObs]          = useState(initial?.observacoes       ?? "");
  const [saving,       setSaving]       = useState(false);

  // Divisões únicas
  const divisoes  = [...new Set(hierarquia.map(h => h.divisao))];
  const categorias = [...new Set(
    hierarquia.filter(h => !divisao || h.divisao === divisao).map(h => h.categoria)
  )];
  const subcategorias = hierarquia
    .filter(h => h.divisao === divisao && h.categoria === categoria && h.subcategoria)
    .map(h => h.subcategoria as string);

  // Ao trocar divisão, limpa categoria e subcategoria
  function handleDivisao(v: string) {
    setDivisao(v); setCategoria(""); setSubcategoria("");
  }
  function handleCategoria(v: string) {
    setCategoria(v); setSubcategoria("");
  }

  const leadTotal = (parseInt(diasProd) || 0) + (parseInt(diasTrans) || 0);

  async function submit() {
    if (!divisao || !categoria) return alert("Selecione pelo menos Divisão e Categoria.");
    setSaving(true);
    await onSave({
      hierarquia_id: null,
      divisao, categoria,
      subcategoria: subcategoria || null,
      fornecedor_id: fornId || null,
      tipo_fornecimento: tipo,
      dias_producao: parseInt(diasProd) || 0,
      dias_transito: parseInt(diasTrans) || 0,
      condicao_pagamento_id: condId || null,
      moeda,
      observacoes: obs || null,
      ativo: true,
    });
    setSaving(false);
  }

  return (
    <Modal title={initial ? "Editar Entrada" : "Nova Entrada na Matriz"} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Hierarquia */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-3">Hierarquia de Produto</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Divisão *">
              <SelectField value={divisao} onChange={handleDivisao} placeholder="Selecione"
                options={divisoes.map(d => ({ value: d, label: d }))}
                allowManual />
            </Field>
            <Field label="Categoria *">
              <SelectField value={categoria} onChange={handleCategoria} placeholder="Selecione"
                options={categorias.map(c => ({ value: c, label: c }))}
                allowManual />
            </Field>
            <Field label="Subcategoria">
              <SelectField value={subcategoria} onChange={setSubcategoria} placeholder="Todas"
                options={subcategorias.map(s => ({ value: s, label: s }))}
                allowManual allowEmpty="Todas (sem filtro)" />
            </Field>
          </div>
        </div>

        {/* Fornecedor */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-3">Fornecedor</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fornecedor">
              <SelectField value={fornId} onChange={setFornId} placeholder="Nenhum"
                options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                allowEmpty="Nenhum / Produção Própria" />
            </Field>
            <Field label="Tipo de fornecimento">
              <SelectField value={tipo} onChange={v => setTipo(v as TipoFornecimento)}
                options={Object.entries(TIPO_FORNECIMENTO_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
            </Field>
          </div>
        </div>

        {/* Lead time */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-3">Lead Time</p>
          <div className="grid grid-cols-3 gap-3 items-end">
            <Field label="Produção (dias)">
              <input type="number" min={0} value={diasProd} onChange={e => setDiasProd(e.target.value)}
                className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
            </Field>
            <Field label="Trânsito (dias)">
              <input type="number" min={0} value={diasTrans} onChange={e => setDiasTrans(e.target.value)}
                className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
            </Field>
            <div className="pb-1">
              <div className="bg-[#7598CF]/10 rounded-xl px-4 py-2.5 text-center">
                <div className="text-[10px] text-[#7598CF]/70 uppercase tracking-wide font-bold">Total</div>
                <div className="text-[#7598CF] font-bold text-lg">{leadTotal} dias</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pagamento */}
        <div>
          <p className="text-xs font-bold text-[#28071C]/60 uppercase tracking-wide mb-3">Condição de Pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Condição">
              <SelectField value={condId} onChange={setCondId} placeholder="Nenhuma"
                options={condicoes.map(c => ({ value: c.id, label: c.descricao }))}
                allowEmpty="Não definida" />
            </Field>
            <Field label="Moeda">
              <SelectField value={moeda} onChange={setMoeda}
                options={MOEDAS.map(m => ({ value: m, label: m }))} />
            </Field>
          </div>
        </div>

        {/* Observações */}
        <Field label="Observações">
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            placeholder="Informações adicionais sobre este fornecimento..."
            className="w-full px-3 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] resize-none" />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Micro-componentes de formulário
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
  value, onChange, options, placeholder, allowEmpty, allowManual,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allowEmpty?: string;   // label da opção vazia
  allowManual?: boolean; // permite digitar valor não listado
}) {
  const [manual, setManual] = useState(
    allowManual && value && !options.find(o => o.value === value) ? true : false
  );

  if (manual) {
    return (
      <div className="flex gap-1">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="flex-1 px-3 py-2 border-2 border-[#7598CF]/50 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF]" />
        <button type="button" onClick={() => setManual(false)}
          className="px-2 py-1.5 border-2 border-[#7598CF]/30 rounded-xl text-xs text-[#28071C]/50 hover:bg-[#7598CF]/5">
          ↩
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full pl-3 pr-8 py-2 border-2 border-[#7598CF]/30 rounded-xl text-sm text-[#28071C] focus:outline-none focus:border-[#7598CF] appearance-none bg-white cursor-pointer">
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {placeholder && !allowEmpty && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        {allowManual && <option value="__manual__">✏️ Digitar manualmente…</option>}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#28071C]/40 pointer-events-none" />
      {/* Detecta seleção de "manual" */}
      {allowManual && value === "__manual__" && (() => { onChange(""); setManual(true); return null; })()}
    </div>
  );
}

function ModalFooter({
  onClose, onSave, saving, disabled = false,
}: {
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
          : <><Save className="w-4 h-4" /> Salvar</>
        }
      </button>
    </div>
  );
}
