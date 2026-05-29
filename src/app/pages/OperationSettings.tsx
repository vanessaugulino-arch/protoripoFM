import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  LogOut,
  User,
  Calendar,
  Clock,
  Edit,
  Trash2,
  Save,
  Layers,
  Lock,
  AlertCircle,
} from "lucide-react";

interface UserData {
  name: string;
  email: string;
  profile: string;
}

// ─── Temporadas ───────────────────────────────────────────────────────────────
// Imutáveis após criação — nome e datas não podem ser alterados
interface Temporada {
  id: number;
  nome: string;
  mesInicio: string;
  mesFim: string;
  criadaEm: string;
}

// ─── Coleções / Drops ─────────────────────────────────────────────────────────
// Podem ser editadas a qualquer momento
interface Colecao {
  id: number;
  temporadaId: number;
  nome: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string;    // YYYY-MM-DD
}

// ─── Lead Times ───────────────────────────────────────────────────────────────
interface LeadTimeRule {
  id: number;
  type: "producao" | "pedido";
  grupo: string;
  categoria: string;
  subcategoria: string;
  nivelRisco: string;
  faixaPreco: string;
  leadTime: number;
  unit: "dias" | "meses";
}

// ─── Constants ────────────────────────────────────────────────────────────────
const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const grupos        = ["Vestuário", "Acessórios", "Calçados", "Joias"];
const categorias    = ["Blusas", "Vestidos", "Calças", "Saias", "Jaquetas"];
const subcategorias = ["Casual", "Formal", "Esportivo", "Festa"];
const niveisRisco   = ["Básico", "Moda", "Alta Moda"];
const faixasPreco   = ["Econômico", "Médio", "Premium", "Luxo"];

const TEMPORADAS_KEY = "fashionmind_temporadas";
const COLECOES_KEY   = "fashionmind_colecoes";

const DEFAULT_TEMPORADAS: Temporada[] = [
  { id: 1, nome: "Verão 2027",   mesInicio: "Outubro", mesFim: "Março",    criadaEm: new Date().toISOString() },
  { id: 2, nome: "Inverno 2027", mesInicio: "Abril",   mesFim: "Setembro", criadaEm: new Date().toISOString() },
];

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
  const [user, setUser] = useState<UserData | null>(null);

  // ── Temporadas ──────────────────────────────────────────────────────────────
  const [temporadas, setTemporadas] = useState<Temporada[]>(() => {
    try {
      const raw = localStorage.getItem(TEMPORADAS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_TEMPORADAS;
    } catch { return DEFAULT_TEMPORADAS; }
  });
  const [temporadaNome,    setTemporadaNome]    = useState("");
  const [temporadaInicio,  setTemporadaInicio]  = useState("Janeiro");
  const [temporadaFim,     setTemporadaFim]     = useState("Dezembro");

  // ── Coleções / Drops ─────────────────────────────────────────────────────────
  const [colecoes, setColecoes] = useState<Colecao[]>(() => {
    try {
      const raw = localStorage.getItem(COLECOES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [selectedTemporadaId, setSelectedTemporadaId] = useState<number | "">("");
  const [colNome,     setColNome]     = useState("");
  const [colInicio,   setColInicio]   = useState("");
  const [colFim,      setColFim]      = useState("");
  const [editingColId, setEditingColId] = useState<number | null>(null);

  // ── Lead Times ───────────────────────────────────────────────────────────────
  const [leadTimeType,          setLeadTimeType]          = useState<"producao" | "pedido">("producao");
  const [selectedGrupo,         setSelectedGrupo]         = useState("");
  const [selectedCategoria,     setSelectedCategoria]     = useState("");
  const [selectedSubcategoria,  setSelectedSubcategoria]  = useState("");
  const [selectedNivelRisco,    setSelectedNivelRisco]    = useState("");
  const [selectedFaixaPreco,    setSelectedFaixaPreco]    = useState("");
  const [leadTimeDays,          setLeadTimeDays]          = useState(30);
  const [leadTimeUnit,          setLeadTimeUnit]          = useState<"dias" | "meses">("dias");
  const [leadTimeRules, setLeadTimeRules] = useState<LeadTimeRule[]>([
    { id: 1, type: "producao", grupo: "Vestuário",  categoria: "Blusas",   subcategoria: "Casual",  nivelRisco: "Moda",      faixaPreco: "Médio",   leadTime: 45, unit: "dias" },
    { id: 2, type: "pedido",   grupo: "Acessórios", categoria: "Vestidos", subcategoria: "Formal",  nivelRisco: "Alta Moda", faixaPreco: "Premium", leadTime: 60, unit: "dias" },
  ]);

  useEffect(() => {
    const stored = sessionStorage.getItem("currentUser");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      if (u.profile !== "CEO") navigate("/dashboard");
    } else {
      navigate("/");
    }
  }, [navigate]);

  // ── Persistência helpers ──────────────────────────────────────────────────────
  const persistTemporadas = (data: Temporada[]) => {
    try { localStorage.setItem(TEMPORADAS_KEY, JSON.stringify(data)); } catch { /* silent */ }
  };
  const persistColecoes = (data: Colecao[]) => {
    try { localStorage.setItem(COLECOES_KEY, JSON.stringify(data)); } catch { /* silent */ }
  };

  // ── Handlers: Temporadas ──────────────────────────────────────────────────────
  const handleSaveTemporada = () => {
    if (!temporadaNome.trim()) {
      alert("Preencha o nome da temporada.");
      return;
    }
    const nova: Temporada = {
      id:         Date.now(),
      nome:       temporadaNome.trim(),
      mesInicio:  temporadaInicio,
      mesFim:     temporadaFim,
      criadaEm:   new Date().toISOString(),
    };
    const updated = [...temporadas, nova];
    setTemporadas(updated);
    persistTemporadas(updated);
    setTemporadaNome(""); setTemporadaInicio("Janeiro"); setTemporadaFim("Dezembro");
  };

  const handleDeleteTemporada = (id: number) => {
    const linked = colecoes.some(c => c.temporadaId === id);
    if (linked) {
      alert("Esta temporada possui coleções vinculadas. Remova as coleções antes de excluir a temporada.");
      return;
    }
    const updated = temporadas.filter(t => t.id !== id);
    setTemporadas(updated);
    persistTemporadas(updated);
  };

  // ── Handlers: Coleções ────────────────────────────────────────────────────────
  const handleSaveColecao = () => {
    if (!selectedTemporadaId) { alert("Selecione uma temporada."); return; }
    if (!colNome.trim())      { alert("Preencha o nome da coleção."); return; }
    if (!colInicio || !colFim){ alert("Preencha as datas de início e fim."); return; }
    if (colInicio > colFim)   { alert("A data de início deve ser anterior à data de fim."); return; }

    const temporada = temporadas.find(t => t.id === Number(selectedTemporadaId));
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
        temporadaId: Number(selectedTemporadaId),
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

  // ── Handlers: Lead Times ──────────────────────────────────────────────────────
  const handleSaveLeadTimeRule = () => {
    if (!selectedGrupo || !selectedCategoria || !selectedNivelRisco) {
      alert("Preencha pelo menos Grupo, Categoria e Nível de Risco.");
      return;
    }
    const nova: LeadTimeRule = {
      id: leadTimeRules.length + 1,
      type: leadTimeType,
      grupo: selectedGrupo, categoria: selectedCategoria, subcategoria: selectedSubcategoria,
      nivelRisco: selectedNivelRisco, faixaPreco: selectedFaixaPreco,
      leadTime: leadTimeDays, unit: leadTimeUnit,
    };
    setLeadTimeRules([...leadTimeRules, nova]);
    setSelectedGrupo(""); setSelectedCategoria(""); setSelectedSubcategoria("");
    setSelectedNivelRisco(""); setSelectedFaixaPreco(""); setLeadTimeDays(30);
  };

  const handleDeleteRule = (id: number) =>
    setLeadTimeRules(leadTimeRules.filter(r => r.id !== id));

  const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const colecoesVisíveis = colecoes.filter(c => c.temporadaId === Number(selectedTemporadaId));

  if (!user) return null;

  // ─── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#E7E7E6]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <span className="text-[#F6F3AA] text-xl">Fashion Mind | Configurações de Operação</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F6F3AA]">
              <User className="w-5 h-5" /><span>{user.name}</span>
            </div>
            <button onClick={() => { sessionStorage.removeItem("currentUser"); navigate("/"); }}
              className="text-[#F6F3AA] hover:opacity-80 transition-opacity">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">

        {/* ── CARD 1: Temporadas de Coleções ─────────────────────────────────── */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#7598CF]">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Temporadas de Coleções</h2>
          </div>
          <div className="flex items-start gap-2 mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-amber-800 text-sm">
              Defina os períodos fixos de cada temporada da sua marca.
              <strong className="ml-1">Após salva, a temporada não pode ser alterada</strong> —
              ela serve como base fixa para o planejamento da curva de vendas.
            </p>
          </div>

          {/* Formulário */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Nome da Temporada</label>
              <input type="text" value={temporadaNome} onChange={e => setTemporadaNome(e.target.value)}
                placeholder="Ex: Outono/Inverno 2025"
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

          {/* Tabela — sem botão Editar (temporadas são imutáveis) */}
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
                  const n = colecoes.filter(c => c.temporadaId === t.id).length;
                  return (
                    <tr key={t.id} className="border-b border-[#28071C]/10 hover:bg-gray-50">
                      <td className="px-4 py-3 text-[#28071C] font-medium">{t.nome}</td>
                      <td className="px-4 py-3 text-[#28071C]">{t.mesInicio}</td>
                      <td className="px-4 py-3 text-[#28071C]">{t.mesFim}</td>
                      <td className="px-4 py-3">
                        {n > 0
                          ? <span className="text-[11px] bg-[#7598CF]/15 text-[#7598CF] border border-[#7598CF]/30 rounded-full px-2 py-0.5 font-semibold">{n} coleç{n === 1 ? "ão" : "ões"}</span>
                          : <span className="text-[#28071C]/30 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {/* Botão Editar removido — temporadas são imutáveis após criação */}
                          <span title="Temporadas não podem ser editadas após criação"
                            className="p-2 text-[#28071C]/20 cursor-not-allowed">
                            <Lock className="w-4 h-4" />
                          </span>
                          <button onClick={() => handleDeleteTemporada(t.id)}
                            title={n > 0 ? "Remova as coleções antes de excluir" : "Excluir temporada"}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── CARD 2: Coleções / Drops ────────────────────────────────────────── */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#28071C]">
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

          {/* Formulário */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Temporada</label>
              <select value={selectedTemporadaId} onChange={e => setSelectedTemporadaId(Number(e.target.value) as number | "")}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 cursor-pointer">
                <option value="">Selecione…</option>
                {temporadas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Nome da Coleção / Drop</label>
              <input type="text" value={colNome} onChange={e => setColNome(e.target.value)}
                placeholder="Ex: Drop 1 · Alto Inverno · Cápsula"
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50" />
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Data de Início</label>
              <input type="date" value={colInicio} onChange={e => setColInicio(e.target.value)}
                className="w-full bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#28071C]/30 focus:outline-none focus:ring-2 focus:ring-[#28071C]/50 cursor-pointer" />
            </div>
            <div>
              <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-2">Data de Fim</label>
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
                {temporadas.find(t => t.id === Number(selectedTemporadaId))?.nome}
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
                  const temp = temporadas.find(t => t.id === c.temporadaId);
                  return (
                    <tr key={c.id} className={`border-b border-[#28071C]/10 hover:bg-gray-50 ${editingColId === c.id ? "bg-gray-50" : ""}`}>
                      <td className="px-4 py-3 text-[#28071C] font-medium">{c.nome}</td>
                      <td className="px-4 py-3 text-[#28071C]/70 text-sm">{temp?.nome ?? "—"}</td>
                      <td className="px-4 py-3 text-[#28071C]">{fmtDate(c.dataInicio)}</td>
                      <td className="px-4 py-3 text-[#28071C]">{fmtDate(c.dataFim)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEditColecao(c)}
                            title="Editar datas da coleção"
                            className="p-2 text-[#28071C] hover:bg-[#28071C]/10 rounded transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteColecao(c.id)}
                            title="Excluir coleção"
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── CARD 3: Configuração de Lead Times (inalterado) ─────────────────── */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border-t-4 border-[#F6F3AA]">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-6 h-6 text-[#28071C]" />
            <h2 className="text-[#28071C] text-xl font-bold">Configuração de Lead Times</h2>
          </div>

          <div className="mb-6">
            <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">Tipo de Lead Time</label>
            <div className="flex gap-4">
              {(["producao", "pedido"] as const).map(t => (
                <button key={t} onClick={() => setLeadTimeType(t)}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${leadTimeType === t ? "bg-[#7598CF] text-white shadow-md" : "bg-white text-[#28071C] border-2 border-[#7598CF]/30"}`}>
                  {t === "producao" ? "Produção" : "Pedido"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">Filtros de Nível</label>
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: "Grupo",        value: selectedGrupo,        set: setSelectedGrupo,        opts: grupos        },
                { label: "Categoria",    value: selectedCategoria,    set: setSelectedCategoria,    opts: categorias    },
                { label: "Subcategoria", value: selectedSubcategoria, set: setSelectedSubcategoria, opts: subcategorias },
                { label: "Nível de Risco",value: selectedNivelRisco, set: setSelectedNivelRisco,   opts: niveisRisco   },
                { label: "Faixa de Preço",value: selectedFaixaPreco, set: setSelectedFaixaPreco,   opts: faixasPreco   },
              ].map(({ label, value, set, opts }) => (
                <div key={label}>
                  <label className="block text-[#28071C]/70 text-xs mb-2">{label}</label>
                  <select value={value} onChange={e => set(e.target.value)}
                    className="w-full bg-white rounded-lg px-3 py-2 text-[#28071C] text-sm border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer">
                    <option value="">Selecione</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[#28071C]/70 text-sm uppercase tracking-wide mb-3">Prazo (Lead Time)</label>
            <div className="flex gap-4">
              <input type="number" value={leadTimeDays} onChange={e => setLeadTimeDays(Number(e.target.value))} min={0}
                className="flex-1 bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50" />
              <select value={leadTimeUnit} onChange={e => setLeadTimeUnit(e.target.value as "dias" | "meses")}
                className="bg-white rounded-lg px-4 py-2 text-[#28071C] border-2 border-[#7598CF]/30 focus:outline-none focus:ring-2 focus:ring-[#7598CF]/50 cursor-pointer">
                <option value="dias">Dias</option>
                <option value="meses">Meses</option>
              </select>
            </div>
          </div>

          <button onClick={handleSaveLeadTimeRule}
            className="flex items-center px-6 py-3 bg-[#28071C] text-white rounded-lg hover:bg-[#28071C]/90 transition-all shadow-md mb-6">
            <Save className="w-5 h-5 mr-2" />Salvar Regra de Suprimento
          </button>

          <div className="bg-white rounded-lg overflow-hidden border border-[#7598CF]/20">
            <table className="w-full">
              <thead className="bg-[#F6F3AA]">
                <tr>
                  {["Tipo","Grupo","Categoria","Nível","Lead Time","Ações"].map(h => (
                    <th key={h} className={`px-4 py-3 text-[#28071C] text-sm uppercase tracking-wide ${h === "Ações" ? "text-center" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leadTimeRules.map(r => (
                  <tr key={r.id} className="border-b border-[#28071C]/10 hover:bg-gray-50">
                    <td className="px-4 py-3 text-[#28071C] capitalize">{r.type}</td>
                    <td className="px-4 py-3 text-[#28071C]">{r.grupo}</td>
                    <td className="px-4 py-3 text-[#28071C]">{r.categoria}</td>
                    <td className="px-4 py-3 text-[#28071C]">{r.nivelRisco}</td>
                    <td className="px-4 py-3 text-[#28071C]">{r.leadTime} {r.unit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 text-[#7598CF] hover:bg-[#7598CF]/10 rounded transition-colors"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteRule(r.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
