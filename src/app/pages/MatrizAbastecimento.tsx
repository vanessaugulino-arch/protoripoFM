// ─── MatrizAbastecimento.tsx — v2 ─────────────────────────────────────────────
// Novo modelo: entrada começa pelo tipo de fornecedor
// (Matéria Prima / Serviço / Produto Acabado) — não pela hierarquia de produto.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Plus, Edit2, Trash2, X, Save, Truck, Package,
  Factory, Globe, MapPin, Info, AlertCircle,
  BarChart3, Calendar, CreditCard, ChevronRight,
  Upload, FileSpreadsheet, Download, CheckCircle2, Clock, Loader2, ChevronLeft,
} from "lucide-react";
import {
  type SupplyFornecedor, type SupplyCategoria, type SupplyEtapa,
  type TipoFornecedorV2, type OrigemFornecedor,
  type PagamentoGatilho, type PagamentoModalidade, type PagamentoParcela, type TipoEntregaEtapa,
  listSupplyFornecedores, insertSupplyFornecedor, updateSupplyFornecedor,
  deleteSupplyFornecedor, replaceSupplyCategorias, replaceSupplyEtapas,
  calcBudgetProjection, aggregateReceita, checkCompleteness, getAvgPurchaseCost,
} from "../../services/supabase/supplyService";
import { parseFile } from "../../services/importService";
import { fetchHierDistinct } from "../../services/supabase/productHierarchyService";
import { getCycle, listScenarios } from "../../services/supabase/planningScenarioService";
import { supabase } from "../../lib/supabase";

// ── Tipos locais ───────────────────────────────────────────────────────────────

interface UserData { tenant_id: string; email?: string }
function getUser(): UserData | null {
  try { return JSON.parse(sessionStorage.getItem("currentUser") ?? "null"); } catch { return null; }
}

interface HierDistinct {
  divisions: string[]; categories: string[]; subcategories: string[]
  linhas: string[]; materials: string[]
}

interface CatRow {
  _key: string;
  divisao: string;
  categoria: string;
  subcategoria: string;
  pct_custo_medio: string;
}

interface EtapaRow {
  _key: string;
  sequencia: string;
  nome_etapa: string;
  prazo_etapa_dias: string;
  tipo_entrega: TipoEntregaEtapa;
  divisao: string;
  categoria: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<TipoFornecedorV2, string> = {
  materia_prima:    "Matéria Prima",
  servico:          "Serviço / Facção",
  produto_acabado:  "Produto Acabado",
};

const TIPO_ICONS: Record<TipoFornecedorV2, React.ReactNode> = {
  materia_prima:   <Package className="w-4 h-4" />,
  servico:         <Factory className="w-4 h-4" />,
  produto_acabado: <Truck className="w-4 h-4" />,
};

const TIPO_COLORS: Record<TipoFornecedorV2, string> = {
  materia_prima:   "bg-blue-100 text-blue-700",
  servico:         "bg-violet-100 text-violet-700",
  produto_acabado: "bg-emerald-100 text-emerald-700",
};

const GATILHO_LABELS: Record<PagamentoGatilho, string> = {
  pedido:      "Pedido confirmado",
  faturamento: "Faturamento",
  entrega:     "Entrega",
};

const MODALIDADE_LABELS: Record<string, string> = {
  avista: "À vista",
  aprazo: "A prazo",
};

const ENTREGA_LABELS: Record<TipoEntregaEtapa, string> = {
  semi_acabado:  "Semi-acabado",
  acabado:       "Acabado",
  white_label:   "White Label",
  private_label: "Private Label",
};

const ETAPAS_SUGERIDAS = [
  "Modelagem","Plotagem","Corte","Costura","Montagem","Bordado",
  "Estamparia","Lavanderia","Tingimento","Acabamento","Revisão de qualidade","Embalagem",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function uid() { return Math.random().toString(36).slice(2, 10); }

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════

export default function MatrizAbastecimento() {
  const navigate = useNavigate();
  const user     = getUser();

  const [fornecedores, setFornecedores] = useState<SupplyFornecedor[]>([]);
  const [hier,         setHier]         = useState<HierDistinct>({ divisions:[], categories:[], subcategories:[], linhas:[], materials:[] });
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState<SupplyFornecedor | null | "new">(null);
  const [importOpen,   setImportOpen]   = useState(false);

  // Budget projection
  const [budgetData, setBudgetData] = useState<Array<{ mes: string; valor: number }>>([]);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user?.tenant_id) return;
    setLoading(true);
    try {
      const [fList, hierData] = await Promise.all([
        listSupplyFornecedores(user.tenant_id),
        fetchHierDistinct(user.tenant_id),
      ]);
      setFornecedores(fList);
      setHier(hierData);

      // Tenta carregar curva de receita do cenário aplicado
      const year = new Date().getFullYear();
      const cycle = await getCycle(user.tenant_id, year).catch(() => null);
      if (cycle) {
        const scenarios = await listScenarios(user.tenant_id, year).catch(() => []);
        const applied = scenarios.find(s => s.is_applied);
        if (applied) {
          const vals = applied.values as Record<string, unknown>;
          const plannedRevenue = vals?.plannedRevenue as Array<{ month: string; atacado: number; varejo: number; ecommerce: number }>;
          if (plannedRevenue?.length) {
            const { months, receita } = aggregateReceita(plannedRevenue);
            // Prévia simplificada: essa tela não tem a curva de entrada em peças
            // calculada (isso só existe no M4, com estoque/cobertura reais) —
            // aproxima peças via PMV médio real do catálogo. O custo de compra
            // segue a mesma fonte real do M4 (pedidos ou, na falta, estoque).
            const { data: prodRows } = await supabase
              .from("products")
              .select("price_sale")
              .eq("tenant_id", user.tenant_id)
              .not("price_sale", "is", null)
              .gt("price_sale", 0);
            const avgPmv = prodRows && prodRows.length > 0
              ? prodRows.reduce((s: number, r: { price_sale: number }) => s + r.price_sale, 0) / prodRows.length
              : 0;
            const pecas = avgPmv > 0 ? receita.map(r => r / avgPmv) : receita.map(() => 0);
            const { value: custoCompra } = await getAvgPurchaseCost(user.tenant_id);
            const proj = calcBudgetProjection(months, pecas, custoCompra, fList);
            setBudgetData(proj.map(p => ({ mes: p.mes, valor: p.valor })));
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id]);

  useEffect(() => { load(); }, [load]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este fornecedor da matriz?")) return;
    await deleteSupplyFornecedor(id);
    setFornecedores(prev => prev.filter(f => f.id !== id));
  };

  // ── Save from modal ────────────────────────────────────────────────────────

  const handleSave = async (forn: SupplyFornecedor) => {
    setFornecedores(prev => {
      const exists = prev.find(f => f.id === forn.id);
      return exists ? prev.map(f => f.id === forn.id ? forn : f) : [...prev, forn];
    });
    setModal(null);
    // Recarrega para ter categorias + etapas joined
    load();
  };

  // ── Agrupamento ────────────────────────────────────────────────────────────

  const byTipo = (tipo: TipoFornecedorV2) => fornecedores.filter(f => f.tipo_fornecedor === tipo);

  // ── Logout ─────────────────────────────────────────────────────────────────

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2]">
      {/* Header */}
      <header className="bg-[#28071C] text-white px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="w-px h-4 bg-white/20" />
        <h1 className="font-semibold text-sm tracking-wide">Matriz de Abastecimento</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 text-white border border-white/30 rounded-lg text-xs font-semibold hover:bg-white/25 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Importar planilha
          </button>
          <button
            onClick={() => setModal("new")}
            className="flex items-center gap-2 px-4 py-2 bg-[#F6F3AA] text-[#28071C] rounded-lg text-xs font-semibold hover:bg-[#F6F3AA]/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Fornecedor
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-8">

        {/* Budget strip — só mostra se tiver dados */}
        {budgetData.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#28071C]/10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-[#7598CF]" />
              <h2 className="text-sm font-semibold text-[#28071C]">Previsão de Orçamento por Período</h2>
              <div className="group relative ml-1">
                <Info className="w-3.5 h-3.5 text-[#28071C]/30 cursor-help" />
                <div className="absolute left-5 top-0 w-72 bg-[#28071C] text-white text-[11px] rounded-lg p-3 hidden group-hover:block z-10 leading-relaxed">
                  Estimativa baseada na curva de vendas do cenário aplicado × margem bruta do plano × % de custo médio de cada fornecedor. Representa quando os pagamentos devem sair do caixa.
                </div>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {budgetData.map(d => (
                <div key={d.mes} className="flex-shrink-0 bg-[#F2F2F2] rounded-xl p-3 min-w-[100px] text-center">
                  <p className="text-[10px] text-[#28071C]/50 font-medium mb-1">{d.mes}</p>
                  <p className="text-sm font-bold text-[#28071C]">{fmtCurrency(d.valor)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && fornecedores.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-[#28071C]/20 p-16 text-center">
            <Truck className="w-10 h-10 text-[#28071C]/20 mx-auto mb-3" />
            <p className="text-sm text-[#28071C]/50 mb-4">Nenhum fornecedor cadastrado ainda.</p>
            <button
              onClick={() => setModal("new")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-lg text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar primeiro fornecedor
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-sm text-[#28071C]/40">Carregando…</div>
        )}

        {/* Groups */}
        {!loading && (["materia_prima", "servico", "produto_acabado"] as TipoFornecedorV2[]).map(tipo => {
          const list = byTipo(tipo);
          if (list.length === 0) return null;
          return (
            <section key={tipo}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${TIPO_COLORS[tipo]}`}>
                  {TIPO_ICONS[tipo]}
                  {TIPO_LABELS[tipo]}
                </span>
                <span className="text-xs text-[#28071C]/40">{list.length} fornecedor{list.length !== 1 ? "es" : ""}</span>
              </div>
              <div className="space-y-3">
                {list.map(forn => (
                  <FornecedorCard
                    key={forn.id}
                    forn={forn}
                    onEdit={() => setModal(forn)}
                    onDelete={() => handleDelete(forn.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Modal edição/criação */}
      {modal !== null && (
        <FornecedorModal
          initial={modal === "new" ? null : modal}
          hier={hier}
          tenantId={user.tenant_id}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Modal importação */}
      {importOpen && (
        <SupplyImportModal
          tenantId={user.tenant_id}
          onDone={() => { setImportOpen(false); load(); }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Card de fornecedor
// ══════════════════════════════════════════════════════════════════════════════

function FornecedorCard({
  forn, onEdit, onDelete,
}: { forn: SupplyFornecedor; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cats  = forn.categorias ?? [];
  const etapas = forn.etapas ?? [];
  const { complete, missing } = checkCompleteness(forn);

  const parcelas = forn.pagamento_parcelas ?? [];
  const pagLabel = parcelas.length === 0
    ? "—"
    : parcelas.length === 1
      ? `${parcelas[0].pct}% ${MODALIDADE_LABELS[parcelas[0].modalidade ?? "aprazo"]} — ${GATILHO_LABELS[parcelas[0].gatilho]}${parcelas[0].dias > 0 ? ` +${parcelas[0].dias}d` : ""}`
      : `${parcelas.length} parcelas`;

  return (
    <div className="bg-white rounded-2xl border border-[#28071C]/8 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[#28071C] truncate">{forn.nome}</span>
            {!complete && (
              <span
                className="inline-flex items-center gap-1 text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold cursor-help"
                title={`Pendente: ${missing.join(", ")}`}
              >
                <Clock className="w-2.5 h-2.5" />
                Pendente
              </span>
            )}
            {forn.codigo_erp && (
              <span className="text-[10px] font-mono bg-[#F2F2F2] text-[#28071C]/50 px-1.5 py-0.5 rounded">
                {forn.codigo_erp}
              </span>
            )}
            {forn.origem && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${forn.origem === "nacional" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                {forn.origem === "nacional" ? <MapPin className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                {forn.origem === "nacional" ? "Nacional" : "Internacional"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-[#28071C]/50 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {forn.prazo_entrega_dias}d de prazo
            </span>
            <span className="text-xs text-[#28071C]/50 flex items-center gap-1">
              <CreditCard className="w-3 h-3" />
              {pagLabel}
            </span>
            {cats.length > 0 && (
              <span className="text-xs text-[#28071C]/50">
                {cats.length} escopo{cats.length !== 1 ? "s" : ""}
                {cats.reduce((s, c) => s + c.pct_custo_medio, 0) > 0 && (
                  <> · ø {(cats.reduce((s, c) => s + c.pct_custo_medio, 0) / cats.length).toFixed(1)}% custo</>
                )}
              </span>
            )}
            {etapas.length > 0 && (
              <span className="text-xs text-[#28071C]/50">
                {etapas.length} etapa{etapas.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(cats.length > 0 || etapas.length > 0) && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg text-[#28071C]/30 hover:text-[#28071C] hover:bg-[#F2F2F2] transition-colors"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          )}
          <button onClick={onEdit}   className="p-1.5 rounded-lg text-[#28071C]/30 hover:text-[#7598CF] hover:bg-[#7598CF]/10 transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-[#28071C]/30 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#28071C]/6 px-5 py-4 space-y-4">
          {cats.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#28071C]/40 uppercase tracking-wider mb-2">Escopo de Categorias</p>
              <div className="space-y-1">
                {cats.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-[#28071C]/70">
                    <span className="font-medium">{[c.divisao, c.categoria, c.subcategoria].filter(Boolean).join(" › ") || "Todas as categorias"}</span>
                    {c.pct_custo_medio > 0 && (
                      <span className="text-[#7598CF] font-semibold">{c.pct_custo_medio}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {etapas.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#28071C]/40 uppercase tracking-wider mb-2">Etapas de Serviço</p>
              <div className="space-y-1">
                {etapas.sort((a, b) => a.sequencia - b.sequencia).map((e, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-[#28071C]/70">
                    <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                      {e.sequencia}
                    </span>
                    <span className="font-medium">{e.nome_etapa}</span>
                    <span className="text-[#28071C]/40">{e.prazo_etapa_dias}d</span>
                    <span className="text-[10px] bg-[#F2F2F2] px-1.5 py-0.5 rounded text-[#28071C]/50">
                      {ENTREGA_LABELS[e.tipo_entrega]}
                    </span>
                    {(e.divisao || e.categoria) && (
                      <span className="text-[#28071C]/40">{[e.divisao, e.categoria].filter(Boolean).join(" / ")}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal de criação / edição
// ══════════════════════════════════════════════════════════════════════════════

function FornecedorModal({
  initial, hier, tenantId, onSave, onClose,
}: {
  initial: SupplyFornecedor | null;
  hier: HierDistinct;
  tenantId: string;
  onSave: (f: SupplyFornecedor) => void;
  onClose: () => void;
}) {
  // ── Campos principais ──────────────────────────────────────────────────────
  const [tipo,    setTipo]    = useState<TipoFornecedorV2>(initial?.tipo_fornecedor ?? "materia_prima");
  const [nome,    setNome]    = useState(initial?.nome ?? "");
  const [erpCode, setErpCode] = useState(initial?.codigo_erp ?? "");
  const [origem,  setOrigem]  = useState<OrigemFornecedor>(initial?.origem ?? "nacional");
  const [prazo,   setPrazo]   = useState(String(initial?.prazo_entrega_dias ?? "30"));
  const [obs,     setObs]     = useState(initial?.observacoes ?? "");

  // ── Parcelas de pagamento ──────────────────────────────────────────────────
  interface ParcRow { _key: string; modalidade: PagamentoModalidade; pct: string; gatilho: PagamentoGatilho; dias: string }
  const [parcRows, setParcRows] = useState<ParcRow[]>(() => {
    const existing = initial?.pagamento_parcelas ?? [];
    if (existing.length === 0) return [{ _key: uid(), modalidade: "avista", pct: "100", gatilho: "pedido", dias: "0" }];
    return existing.map(p => ({ _key: uid(), modalidade: p.modalidade ?? "aprazo", pct: String(p.pct), gatilho: p.gatilho, dias: String(p.dias) }));
  });

  // ── Escopo de categorias ───────────────────────────────────────────────────
  const [catRows, setCatRows] = useState<CatRow[]>(() => {
    const cats = initial?.categorias ?? [];
    if (cats.length === 0) return [{ _key: uid(), divisao: "", categoria: "", subcategoria: "", pct_custo_medio: "0" }];
    return cats.map(c => ({
      _key: uid(),
      divisao: c.divisao ?? "",
      categoria: c.categoria ?? "",
      subcategoria: c.subcategoria ?? "",
      pct_custo_medio: String(c.pct_custo_medio),
    }));
  });

  // ── Etapas de serviço ──────────────────────────────────────────────────────
  const [etapaRows, setEtapaRows] = useState<EtapaRow[]>(() => {
    const etapas = initial?.etapas ?? [];
    if (tipo !== "servico" && etapas.length === 0) return [newEtapa(1)];
    return etapas.map(e => ({
      _key: uid(),
      sequencia: String(e.sequencia),
      nome_etapa: e.nome_etapa,
      prazo_etapa_dias: String(e.prazo_etapa_dias),
      tipo_entrega: e.tipo_entrega,
      divisao: e.divisao ?? "",
      categoria: e.categoria ?? "",
    }));
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function newEtapa(seq: number): EtapaRow {
    return { _key: uid(), sequencia: String(seq), nome_etapa: "", prazo_etapa_dias: "15", tipo_entrega: "semi_acabado", divisao: "", categoria: "" };
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!nome.trim()) { setError("Nome do fornecedor é obrigatório."); return; }
    setSaving(true);
    setError("");
    try {
      // Valida parcelas: soma deve ser 100%
      const somaParc = parcRows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
      if (Math.abs(somaParc - 100) > 0.5) {
        setError(`A soma dos percentuais deve ser 100%. Atual: ${somaParc.toFixed(1)}%`);
        setSaving(false);
        return;
      }

      const pagamentoParcelas: PagamentoParcela[] = parcRows.map(r => ({
        modalidade: r.modalidade,
        pct: parseFloat(r.pct) || 0,
        gatilho: r.gatilho,
        dias: parseInt(r.dias) || 0,
      }));

      const payload = {
        nome: nome.trim(),
        codigo_erp: erpCode.trim() || null,
        tipo_fornecedor: tipo,
        origem: tipo === "materia_prima" ? origem : null,
        prazo_entrega_dias: parseInt(prazo) || 30,
        pagamento_parcelas: pagamentoParcelas,
        observacoes: obs.trim() || null,
        ativo: true,
      };

      let saved: SupplyFornecedor;
      if (initial?.id) {
        saved = await updateSupplyFornecedor(initial.id, payload);
      } else {
        saved = await insertSupplyFornecedor(tenantId, payload);
      }

      // Salva categorias (filtra linhas vazias)
      const validCats = catRows.filter(r => r.divisao || r.categoria || Number(r.pct_custo_medio) > 0);
      const catData = await replaceSupplyCategorias(
        tenantId, saved.id,
        validCats.map(r => ({
          divisao: r.divisao || null,
          categoria: r.categoria || null,
          subcategoria: r.subcategoria || null,
          pct_custo_medio: parseFloat(r.pct_custo_medio) || 0,
        }))
      );

      // Salva etapas (somente para tipo=serviço)
      let etapasData: SupplyEtapa[] = [];
      if (tipo === "servico") {
        const validEtapas = etapaRows.filter(r => r.nome_etapa.trim());
        etapasData = await replaceSupplyEtapas(
          tenantId, saved.id,
          validEtapas.map(r => ({
            sequencia: parseInt(r.sequencia) || 1,
            nome_etapa: r.nome_etapa.trim(),
            prazo_etapa_dias: parseInt(r.prazo_etapa_dias) || 15,
            tipo_entrega: r.tipo_entrega,
            divisao: r.divisao || null,
            categoria: r.categoria || null,
          }))
        );
      }

      onSave({ ...saved, categorias: catData, etapas: etapasData });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/8">
          <h2 className="font-semibold text-sm text-[#28071C]">
            {initial ? "Editar Fornecedor" : "Novo Fornecedor"}
          </h2>
          <button onClick={onClose} className="text-[#28071C]/30 hover:text-[#28071C] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Tipo */}
          <div>
            <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider mb-2">
              Tipo de Fornecedor
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["materia_prima","servico","produto_acabado"] as TipoFornecedorV2[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 text-xs font-medium transition-colors ${
                    tipo === t
                      ? "border-[#28071C] bg-[#28071C] text-white"
                      : "border-[#28071C]/15 text-[#28071C]/60 hover:border-[#28071C]/40"
                  }`}
                >
                  {TIPO_ICONS[t]}
                  {TIPO_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Origem — só para matéria prima */}
          {tipo === "materia_prima" && (
            <div>
              <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider mb-2">
                Origem
              </label>
              <div className="flex gap-2">
                {(["nacional","internacional"] as OrigemFornecedor[]).map(o => (
                  <button
                    key={o}
                    onClick={() => setOrigem(o)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      origem === o
                        ? "border-[#28071C] bg-[#28071C] text-white"
                        : "border-[#28071C]/15 text-[#28071C]/50 hover:border-[#28071C]/40"
                    }`}
                  >
                    {o === "nacional" ? <MapPin className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                    {o === "nacional" ? "Nacional" : "Internacional"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nome + ERP */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider mb-1.5">
                Nome do Fornecedor *
              </label>
              <input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Tecidos São Paulo Ltda"
                className="w-full border border-[#28071C]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider mb-1.5">
                Código ERP
              </label>
              <input
                value={erpCode}
                onChange={e => setErpCode(e.target.value)}
                placeholder="FM-ABC123"
                className="w-full border border-[#28071C]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
              />
            </div>
          </div>

          {/* Prazo */}
          <div>
            <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider mb-1.5">
              Prazo de Entrega (dias)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                value={prazo}
                onChange={e => setPrazo(e.target.value)}
                className="w-28 border border-[#28071C]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
              />
              <span className="text-xs text-[#28071C]/40 flex items-center gap-1">
                <Info className="w-3 h-3" />
                após pedido recebido pelo fornecedor
              </span>
            </div>
          </div>

          {/* Pagamento — múltiplas parcelas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider">
                Condição de Pagamento
              </label>
              <button
                onClick={() => setParcRows(r => [...r, { _key: uid(), modalidade: "aprazo", pct: "0", gatilho: "pedido", dias: "0" }])}
                className="text-[10px] text-[#7598CF] hover:text-[#28071C] font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar parcela
              </button>
            </div>
            <p className="text-[11px] text-[#28071C]/40 mb-3">
              Defina quantas parcelas quiser. A soma dos % deve ser 100. O gatilho indica a partir de quando conta o prazo.
            </p>
            {/* Cabeçalho da tabela */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-1 mb-1">
              <span className="text-[10px] text-[#28071C]/40 font-medium w-24">Modalidade</span>
              <span className="text-[10px] text-[#28071C]/40 font-medium">Gatilho</span>
              <span className="text-[10px] text-[#28071C]/40 font-medium text-right w-20">Dias após</span>
              <span className="text-[10px] text-[#28071C]/40 font-medium text-right w-16">%</span>
              <span className="w-6" />
            </div>
            <div className="space-y-2">
              {parcRows.map((row) => (
                <div key={row._key} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center">
                  {/* Modalidade: à vista / a prazo */}
                  <select
                    value={row.modalidade}
                    onChange={e => setParcRows(rows => rows.map(r => r._key === row._key ? { ...r, modalidade: e.target.value as PagamentoModalidade } : r))}
                    className="w-24 border border-[#28071C]/20 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                  >
                    <option value="avista">À vista</option>
                    <option value="aprazo">A prazo</option>
                  </select>
                  {/* Gatilho */}
                  <select
                    value={row.gatilho}
                    onChange={e => setParcRows(rows => rows.map(r => r._key === row._key ? { ...r, gatilho: e.target.value as PagamentoGatilho } : r))}
                    className="border border-[#28071C]/20 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                  >
                    <option value="pedido">No pedido</option>
                    <option value="faturamento">No faturamento</option>
                    <option value="entrega">Na entrega</option>
                  </select>
                  {/* Dias após */}
                  <div className="flex items-center gap-1.5 w-24">
                    <input
                      type="number"
                      min="0"
                      value={row.dias}
                      onChange={e => setParcRows(rows => rows.map(r => r._key === row._key ? { ...r, dias: e.target.value } : r))}
                      className="w-16 border border-[#28071C]/20 rounded-lg px-2 py-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-[#28071C]/40 flex-shrink-0">d</span>
                  </div>
                  {/* % */}
                  <div className="flex items-center gap-1 w-20">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={row.pct}
                      onChange={e => setParcRows(rows => rows.map(r => r._key === row._key ? { ...r, pct: e.target.value } : r))}
                      className="w-14 border border-[#28071C]/20 rounded-lg px-2 py-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
                    />
                    <span className="text-[10px] text-[#28071C]/40">%</span>
                  </div>
                  {parcRows.length > 1 ? (
                    <button
                      onClick={() => setParcRows(rows => rows.filter(r => r._key !== row._key))}
                      className="p-1 rounded text-[#28071C]/20 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : <div className="w-6" />}
                </div>
              ))}
            </div>
            {/* Barra de soma */}
            {(() => {
              const soma = parcRows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
              const ok = Math.abs(soma - 100) < 0.5;
              return (
                <div className={`flex items-center justify-between mt-3 px-1 text-xs font-semibold ${ok ? "text-emerald-600" : "text-orange-600"}`}>
                  <span>Total</span>
                  <span>{soma.toFixed(0)}%{ok ? " ✓" : " — deve ser 100%"}</span>
                </div>
              );
            })()}
          </div>

          {/* Escopo de categorias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider">
                Escopo de Categorias
              </label>
              <button
                onClick={() => setCatRows(r => [...r, { _key: uid(), divisao: "", categoria: "", subcategoria: "", pct_custo_medio: "0" }])}
                className="text-[10px] text-[#7598CF] hover:text-[#28071C] font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar linha
              </button>
            </div>
            <p className="text-[11px] text-[#28071C]/40 mb-3">
              Deixe vazio para indicar que o fornecedor atende todas as categorias. O % de custo médio representa quanto este insumo representa no custo de um produto.
            </p>
            <div className="space-y-2">
              {catRows.map((row, i) => (
                <CatRowEditor
                  key={row._key}
                  row={row}
                  hier={hier}
                  onChange={updated => setCatRows(rows => rows.map(r => r._key === row._key ? updated : r))}
                  onRemove={catRows.length > 1 ? () => setCatRows(rows => rows.filter(r => r._key !== row._key)) : undefined}
                />
              ))}
            </div>
          </div>

          {/* Etapas de produção — somente tipo=serviço */}
          {tipo === "servico" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider">
                  Etapas de Produção
                </label>
                <button
                  onClick={() => setEtapaRows(r => [...r, newEtapa(r.length + 1)])}
                  className="text-[10px] text-[#7598CF] hover:text-[#28071C] font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar etapa
                </button>
              </div>
              <div className="space-y-3">
                {etapaRows.map((row) => (
                  <EtapaRowEditor
                    key={row._key}
                    row={row}
                    hier={hier}
                    onChange={updated => setEtapaRows(rows => rows.map(r => r._key === row._key ? updated : r))}
                    onRemove={etapaRows.length > 1 ? () => setEtapaRows(rows => rows.filter(r => r._key !== row._key)) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-[10px] font-semibold text-[#28071C]/50 uppercase tracking-wider mb-1.5">
              Observações
            </label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={2}
              placeholder="Informações adicionais, contato, notas…"
              className="w-full border border-[#28071C]/20 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#28071C]/8 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs text-[#28071C]/50 hover:text-[#28071C] transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-[#28071C] text-white rounded-lg text-xs font-semibold hover:bg-[#28071C]/85 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Linha de categoria
// ══════════════════════════════════════════════════════════════════════════════

function CatRowEditor({
  row, hier, onChange, onRemove,
}: { row: CatRow; hier: HierDistinct; onChange: (r: CatRow) => void; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={row.divisao}
        onChange={e => onChange({ ...row, divisao: e.target.value })}
        className="flex-1 border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
      >
        <option value="">Todas as divisões</option>
        {hier.divisions.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select
        value={row.categoria}
        onChange={e => onChange({ ...row, categoria: e.target.value })}
        className="flex-1 border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
      >
        <option value="">Todas as categorias</option>
        {hier.categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={row.pct_custo_medio}
          onChange={e => onChange({ ...row, pct_custo_medio: e.target.value })}
          className="w-16 border border-[#28071C]/20 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
        />
        <span className="text-[10px] text-[#28071C]/40">%</span>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="p-1 rounded text-[#28071C]/20 hover:text-red-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// IMPORTAÇÃO VIA PLANILHA
// ══════════════════════════════════════════════════════════════════════════════

interface SIField { key: string; label: string; required: boolean; match: string[] }

const SI_FIELDS: SIField[] = [
  { key: "nome",                label: "Nome do Fornecedor",     required: true,  match: ["nome","fornecedor","name","supplier"] },
  { key: "tipo_fornecedor",     label: "Tipo de Fornecedor",     required: true,  match: ["tipo","type","tipo_fornecedor","tipo fornecedor"] },
  { key: "prazo_entrega_dias",  label: "Prazo de Entrega (dias)",required: true,  match: ["prazo","lead","leadtime","lead time","prazo_entrega","prazo entrega"] },
  { key: "pct_custo_medio",     label: "% Custo Médio",          required: true,  match: ["custo","pct_custo","pct custo","cost","custo medio","custo médio"] },
  { key: "codigo_erp",          label: "Código ERP",             required: false, match: ["codigo","erp","code","cod","codigo_erp"] },
  { key: "origem",              label: "Origem",                 required: false, match: ["origem","origin"] },
  { key: "divisao",             label: "Divisão",                required: false, match: ["divisao","divisão","division"] },
  { key: "categoria",           label: "Categoria",              required: false, match: ["categoria","category"] },
  { key: "subcategoria",        label: "Subcategoria",           required: false, match: ["subcategoria","subcategory"] },
  { key: "pagamento_pct_1",     label: "Pagamento % Parcela 1",  required: false, match: ["pct 1","pct1","pagamento_pct_1","pagamento pct 1","parcela 1 pct"] },
  { key: "pagamento_gatilho_1", label: "Pagamento Gatilho 1",    required: false, match: ["gatilho 1","gatilho1","pagamento_gatilho_1","pagamento gatilho 1"] },
  { key: "pagamento_dias_1",    label: "Pagamento Dias 1",       required: false, match: ["dias 1","dias1","pagamento_dias_1","pagamento dias 1"] },
  { key: "pagamento_pct_2",     label: "Pagamento % Parcela 2",  required: false, match: ["pct 2","pct2","pagamento_pct_2","pagamento pct 2","parcela 2 pct"] },
  { key: "pagamento_gatilho_2", label: "Pagamento Gatilho 2",    required: false, match: ["gatilho 2","gatilho2","pagamento_gatilho_2","pagamento gatilho 2"] },
  { key: "pagamento_dias_2",    label: "Pagamento Dias 2",       required: false, match: ["dias 2","dias2","pagamento_dias_2","pagamento dias 2"] },
  { key: "pagamento_pct_3",     label: "Pagamento % Parcela 3",  required: false, match: ["pct 3","pct3","pagamento_pct_3","pagamento pct 3","parcela 3 pct"] },
  { key: "pagamento_gatilho_3", label: "Pagamento Gatilho 3",    required: false, match: ["gatilho 3","gatilho3","pagamento_gatilho_3","pagamento gatilho 3"] },
  { key: "pagamento_dias_3",    label: "Pagamento Dias 3",       required: false, match: ["dias 3","dias3","pagamento_dias_3","pagamento dias 3"] },
  { key: "observacoes",         label: "Observações",            required: false, match: ["obs","observ","notes","nota","observacoes","observações"] },
];

function downloadSupplyTemplate() {
  const headers = ["nome","tipo_fornecedor","prazo_entrega_dias","pct_custo_medio",
    "codigo_erp","origem","divisao","categoria","subcategoria",
    "pagamento_pct_1","pagamento_gatilho_1","pagamento_dias_1",
    "pagamento_pct_2","pagamento_gatilho_2","pagamento_dias_2",
    "pagamento_pct_3","pagamento_gatilho_3","pagamento_dias_3","observacoes"];
  const example = ["Tecidos SP Ltda","materia_prima","30","35",
    "FM-001","nacional","Feminino","Vestuário","",
    "100","pedido","0","","","","","","","Fornecedor principal de tecidos"];
  const csv = [headers.join(","), example.map(v => `"${v}"`).join(",")].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "modelo_fornecedores.csv"; a.click();
  URL.revokeObjectURL(url);
}

function normSI(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function autoMapSI(headers: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  SI_FIELDS.forEach(field => {
    const h = headers.find(header => {
      const hn = normSI(header);
      return field.match.some(alias => {
        const an = normSI(alias);
        return an.includes(" ") ? hn.includes(an) : hn.split(/\s+/).includes(an);
      });
    });
    if (h) m[field.key] = h;
  });
  return m;
}

interface SIPreviewRow {
  rawRow: string[];
  nome: string;
  tipo: TipoFornecedorV2 | "";
  prazo: number;
  pctCusto: number;
  pagamentoParcelas: PagamentoParcela[];
  complete: boolean;
  missing: string[];
}

const TIPO_NORM: Record<string, TipoFornecedorV2> = {
  materia_prima: "materia_prima", "materia prima": "materia_prima", "matéria prima": "materia_prima",
  mp: "materia_prima",
  servico: "servico", "serviço": "servico", "servico faccao": "servico", "serviço / facção": "servico",
  produto_acabado: "produto_acabado", "produto acabado": "produto_acabado", pa: "produto_acabado",
};

const GATILHO_NORM: Record<string, PagamentoGatilho> = {
  pedido: "pedido", "no pedido": "pedido",
  faturamento: "faturamento", "no faturamento": "faturamento",
  entrega: "entrega", "na entrega": "entrega",
};

function buildSIPreview(headers: string[], rows: string[][], mapping: Record<string, string>): SIPreviewRow[] {
  const hIdx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const get = (row: string[], fkey: string) => {
    const h = mapping[fkey];
    if (!h) return "";
    const i = hIdx[h];
    return i != null ? (row[i] ?? "").trim() : "";
  };
  return rows.map(row => {
    const nome = get(row, "nome");
    if (!nome) return null;
    const tipoRaw = nome ? get(row, "tipo_fornecedor").toLowerCase().replace(/\s+/g, " ").trim() : "";
    const tipo: TipoFornecedorV2 | "" = TIPO_NORM[tipoRaw] || "";
    const prazo = parseInt(get(row, "prazo_entrega_dias")) || 0;
    const pctCusto = parseFloat(get(row, "pct_custo_medio")) || 0;
    const parcelas: PagamentoParcela[] = [];
    for (let n = 1; n <= 3; n++) {
      const pct = parseFloat(get(row, `pagamento_pct_${n}`));
      if (!pct) continue;
      const gatilhoRaw = get(row, `pagamento_gatilho_${n}`).toLowerCase();
      const gatilho: PagamentoGatilho = GATILHO_NORM[gatilhoRaw] ?? "pedido";
      const dias = parseInt(get(row, `pagamento_dias_${n}`)) || 0;
      parcelas.push({ pct, gatilho, dias });
    }
    const missing: string[] = [];
    if (!nome) missing.push("nome");
    if (!tipo) missing.push("tipo_fornecedor (valores: materia_prima | servico | produto_acabado)");
    if (!prazo) missing.push("prazo_entrega_dias");
    if (!pctCusto) missing.push("pct_custo_medio");
    return { rawRow: row, nome, tipo, prazo, pctCusto, pagamentoParcelas: parcelas, complete: missing.length === 0, missing };
  }).filter(Boolean) as SIPreviewRow[];
}

type ImportStep = "upload" | "mapping" | "preview" | "done";

function SupplyImportModal({ tenantId, onDone, onClose }: {
  tenantId: string; onDone: () => void; onClose: () => void;
}) {
  const [step, setStep]               = useState<ImportStep>("upload");
  const [fileName, setFileName]       = useState("");
  const [parsedHdr, setParsedHdr]     = useState<string[]>([]);
  const [parsedRows, setParsedRows]   = useState<string[][]>([]);
  const [mapping, setMapping]         = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<SIPreviewRow[]>([]);
  const [importing, setImporting]     = useState(false);
  const [result, setResult]           = useState<{ imported: number; pending: number; errors: string[] } | null>(null);
  const [parseError, setParseError]   = useState<string | null>(null);
  const [dragging, setDragging]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(null);
    try {
      const pf = await parseFile(file);
      setFileName(file.name);
      setParsedHdr(pf.headers);
      setParsedRows(pf.rows);
      setMapping(autoMapSI(pf.headers));
      setStep("mapping");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Erro ao ler arquivo.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirmMapping = () => {
    setPreviewRows(buildSIPreview(parsedHdr, parsedRows, mapping));
    setStep("preview");
  };

  const handleImport = async () => {
    setImporting(true);
    let imported = 0, pending = 0;
    const errors: string[] = [];
    const hIdx = Object.fromEntries(parsedHdr.map((h, i) => [h, i]));
    const get = (row: string[], fkey: string) => {
      const h = mapping[fkey]; const i = h != null ? hIdx[h] : -1;
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    for (const pr of previewRows) {
      try {
        const tipoFinal: TipoFornecedorV2 = pr.tipo || "produto_acabado";
        const origemRaw = get(pr.rawRow, "origem").toLowerCase();
        const origem: OrigemFornecedor | null = origemRaw === "nacional" ? "nacional" : origemRaw === "internacional" ? "internacional" : null;
        const forn = await insertSupplyFornecedor(tenantId, {
          nome: pr.nome,
          codigo_erp: get(pr.rawRow, "codigo_erp") || null,
          tipo_fornecedor: tipoFinal,
          origem,
          prazo_entrega_dias: pr.prazo || 30,
          pagamento_parcelas: pr.pagamentoParcelas,
          observacoes: get(pr.rawRow, "observacoes") || null,
          ativo: true,
        });
        const divisao   = get(pr.rawRow, "divisao") || null;
        const categoria = get(pr.rawRow, "categoria") || null;
        const subcategoria = get(pr.rawRow, "subcategoria") || null;
        if (pr.pctCusto > 0 || divisao || categoria) {
          await replaceSupplyCategorias(tenantId, forn.id, [{
            divisao, categoria, subcategoria, pct_custo_medio: pr.pctCusto,
          }]);
        }
        if (pr.complete) imported++; else pending++;
      } catch (e) {
        errors.push(`${pr.nome}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    setResult({ imported, pending, errors });
    setImporting(false);
    setStep("done");
    onDone();
  };

  const requiredMapped = SI_FIELDS.filter(f => f.required).every(f => !!mapping[f.key]);
  const STEPS: ImportStep[] = ["upload","mapping","preview","done"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#28071C]/8">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-4 h-4 text-[#7598CF]" />
            <h2 className="font-semibold text-sm text-[#28071C]">Importar Fornecedores</h2>
            <div className="flex items-center gap-0.5 ml-2">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center">
                  {i > 0 && <div className="w-6 h-px bg-[#28071C]/15" />}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    step === s ? "bg-[#28071C] text-white"
                    : STEPS.indexOf(step) > i ? "bg-[#7598CF] text-white"
                    : "bg-[#28071C]/10 text-[#28071C]/30"
                  }`}>{i + 1}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-[#28071C]/30 hover:text-[#28071C] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between bg-[#F2F2F2] rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-[#28071C]">Não tem o modelo?</p>
                  <p className="text-[11px] text-[#28071C]/50 mt-0.5">Baixe o template CSV com todos os campos</p>
                </div>
                <button
                  onClick={downloadSupplyTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#28071C]/20 rounded-lg text-xs font-medium text-[#28071C] hover:bg-[#F2F2F2] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar modelo
                </button>
              </div>

              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragging ? "border-[#7598CF] bg-[#7598CF]/5" : "border-[#28071C]/20 hover:border-[#7598CF]/60"
                }`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-[#28071C]/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-[#28071C]/50">
                  Arraste o arquivo ou <span className="text-[#7598CF] font-semibold">clique para selecionar</span>
                </p>
                <p className="text-[11px] text-[#28071C]/30 mt-1">CSV ou XLSX — primeira linha deve ser o cabeçalho</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {parseError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {parseError}
                </div>
              )}

              <div className="bg-[#7598CF]/8 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-[#28071C] mb-2">Campos obrigatórios para o cálculo de orçamento</p>
                <div className="flex flex-wrap gap-1.5">
                  {SI_FIELDS.filter(f => f.required).map(f => (
                    <span key={f.key} className="text-[11px] bg-white border border-[#28071C]/15 px-2 py-0.5 rounded text-[#28071C]">
                      {f.label}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#28071C]/50 mt-2">
                  Fornecedores sem esses campos serão importados com pendência e não entrarão no cálculo automaticamente.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Mapping ── */}
          {step === "mapping" && (
            <div className="space-y-4">
              <p className="text-xs text-[#28071C]/60">
                Arquivo: <span className="font-medium text-[#28071C]">{fileName}</span> · {parsedRows.length} linhas
              </p>
              <p className="text-[11px] text-[#28071C]/40">
                O sistema mapeou automaticamente as colunas que reconheceu. Ajuste se necessário.
              </p>
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_1fr] gap-3 px-2 pb-1">
                  <span className="text-[10px] font-semibold text-[#28071C]/40 uppercase tracking-wider">Campo do Sistema</span>
                  <span className="text-[10px] font-semibold text-[#28071C]/40 uppercase tracking-wider">Coluna do Arquivo (de → para)</span>
                </div>
                {SI_FIELDS.map(field => (
                  <div
                    key={field.key}
                    className={`grid grid-cols-[1fr_1fr] gap-3 items-center px-2 py-1.5 rounded-lg ${field.required ? "bg-[#F6F3AA]/30" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#28071C]">{field.label}</span>
                      {field.required && (
                        <span className="text-[9px] bg-[#F6F3AA] text-[#28071C]/70 px-1.5 py-0.5 rounded font-semibold">obrig.</span>
                      )}
                    </div>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        setMapping(m => { const n = { ...m }; if (val) n[field.key] = val; else delete n[field.key]; return n; });
                      }}
                      className="border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 w-full"
                    >
                      <option value="">— ignorar —</option>
                      {parsedHdr.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!requiredMapped && (
                <div className="flex items-center gap-2 text-orange-600 bg-orange-50 rounded-lg p-3 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Mapeie os campos obrigatórios (destacados em amarelo) para prosseguir.
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#F2F2F2] rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-[#28071C]">{previewRows.length}</p>
                  <p className="text-[10px] text-[#28071C]/50 mt-0.5">Total</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">{previewRows.filter(r => r.complete).length}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Completos</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-orange-600">{previewRows.filter(r => !r.complete).length}</p>
                  <p className="text-[10px] text-orange-500 mt-0.5">Com pendência</p>
                </div>
              </div>
              <p className="text-[11px] text-[#28071C]/50">
                Todos serão importados. Os com pendência podem ser completados manualmente depois — o cálculo usa apenas os 100% preenchidos.
              </p>
              <div className="border border-[#28071C]/10 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F2F2F2] border-b border-[#28071C]/10">
                      <th className="px-3 py-2 text-left font-semibold text-[#28071C]/50">Nome</th>
                      <th className="px-3 py-2 text-left font-semibold text-[#28071C]/50">Tipo</th>
                      <th className="px-3 py-2 text-right font-semibold text-[#28071C]/50">Prazo</th>
                      <th className="px-3 py-2 text-right font-semibold text-[#28071C]/50">% Custo</th>
                      <th className="px-3 py-2 text-center font-semibold text-[#28071C]/50">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#28071C]/6">
                    {previewRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={r.complete ? "" : "bg-orange-50/50"}>
                        <td className="px-3 py-2 font-medium text-[#28071C] max-w-[160px] truncate" title={r.nome}>{r.nome}</td>
                        <td className="px-3 py-2 text-[#28071C]/60">
                          {r.tipo ? TIPO_LABELS[r.tipo] : <span className="text-orange-500 font-medium">?</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-[#28071C]/60">
                          {r.prazo ? `${r.prazo}d` : <span className="text-orange-500">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-[#28071C]/60">
                          {r.pctCusto ? `${r.pctCusto}%` : <span className="text-orange-500">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.complete
                            ? <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                <CheckCircle2 className="w-3 h-3" />OK
                              </span>
                            : <span className="inline-flex items-center gap-1 text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium cursor-help" title={r.missing.join(", ")}>
                                <Clock className="w-3 h-3" />Pendente
                              </span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length > 50 && (
                  <div className="px-3 py-2 text-center text-[11px] text-[#28071C]/40 border-t border-[#28071C]/10">
                    Mostrando 50 de {previewRows.length} linhas
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === "done" && result && (
            <div className="py-4 space-y-5">
              <div className="text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-[#28071C]">Importação concluída</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{result.imported}</p>
                  <p className="text-xs text-emerald-600 mt-1">Completos</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">{result.pending}</p>
                  <p className="text-xs text-orange-500 mt-1">Com pendência</p>
                </div>
              </div>
              {result.pending > 0 && (
                <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700">
                  <p className="font-semibold mb-1">Fornecedores com pendência</p>
                  <p>Foram importados mas não entrarão no cálculo de orçamento. Complete o cadastro de cada um clicando no ícone de edição.</p>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700">
                  <p className="font-semibold mb-1">{result.errors.length} erro(s) durante a importação:</p>
                  <ul className="space-y-0.5 mt-1">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#28071C]/8 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-[#28071C]/50 hover:text-[#28071C] transition-colors"
          >
            {step === "done" ? "Fechar" : "Cancelar"}
          </button>
          <div className="flex items-center gap-2">
            {(step === "mapping" || step === "preview") && (
              <button
                onClick={() => setStep(step === "mapping" ? "upload" : "mapping")}
                className="flex items-center gap-1.5 px-3 py-2 border border-[#28071C]/20 rounded-lg text-xs text-[#28071C] hover:bg-[#F2F2F2] transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Voltar
              </button>
            )}
            {step === "mapping" && (
              <button
                onClick={handleConfirmMapping}
                disabled={!requiredMapped}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#28071C] text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#28071C]/85 transition-colors"
              >
                Pré-visualizar <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {step === "preview" && (
              <button
                onClick={handleImport}
                disabled={importing || previewRows.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#28071C] text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#28071C]/85 transition-colors"
              >
                {importing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando…</>
                  : <><Upload className="w-3.5 h-3.5" /> Importar {previewRows.length} fornecedor{previewRows.length !== 1 ? "es" : ""}</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Linha de etapa de serviço
// ══════════════════════════════════════════════════════════════════════════════

function EtapaRowEditor({
  row, hier, onChange, onRemove,
}: { row: EtapaRow; hier: HierDistinct; onChange: (r: EtapaRow) => void; onRemove?: () => void }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = ETAPAS_SUGERIDAS.filter(s => !row.nome_etapa || s.toLowerCase().includes(row.nome_etapa.toLowerCase()));

  return (
    <div className="bg-[#F2F2F2] rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          value={row.sequencia}
          onChange={e => onChange({ ...row, sequencia: e.target.value })}
          className="w-12 border border-[#28071C]/20 rounded-lg px-2 py-1.5 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
          title="Sequência"
        />
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={row.nome_etapa}
            onChange={e => { onChange({ ...row, nome_etapa: e.target.value }); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
            placeholder="Nome da etapa"
            className="w-full border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-[#28071C]/15 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filtered.map(s => (
                <button
                  key={s}
                  onMouseDown={() => { onChange({ ...row, nome_etapa: s }); setShowSuggestions(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F2F2F2] text-[#28071C]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="1"
            value={row.prazo_etapa_dias}
            onChange={e => onChange({ ...row, prazo_etapa_dias: e.target.value })}
            className="w-16 border border-[#28071C]/20 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
            placeholder="Dias"
          />
          <span className="text-[10px] text-[#28071C]/40">d</span>
        </div>
        {onRemove && (
          <button onClick={onRemove} className="p-1 rounded text-[#28071C]/20 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={row.tipo_entrega}
          onChange={e => onChange({ ...row, tipo_entrega: e.target.value as TipoEntregaEtapa })}
          className="flex-1 border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
        >
          {(["semi_acabado","acabado","white_label","private_label"] as TipoEntregaEtapa[]).map(t => (
            <option key={t} value={t}>{ENTREGA_LABELS[t]}</option>
          ))}
        </select>
        <select
          value={row.divisao}
          onChange={e => onChange({ ...row, divisao: e.target.value })}
          className="flex-1 border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
        >
          <option value="">Todas as divisões</option>
          {hier.divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={row.categoria}
          onChange={e => onChange({ ...row, categoria: e.target.value })}
          className="flex-1 border border-[#28071C]/20 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40"
        >
          <option value="">Todas as categorias</option>
          {hier.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}
