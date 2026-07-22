import { supabase } from "../../lib/supabase";

/**
 * Histórico de importações de planilhas.
 *
 * Antes ficava apenas no localStorage do navegador — o resumo desaparecia ao
 * trocar de máquina, limpar o cache ou abrir em aba anônima. Agora a fonte de
 * verdade é a tabela public.spreadsheet_imports; o localStorage permanece como
 * cache de leitura para a tela abrir instantaneamente e como rede de segurança
 * caso o banco esteja indisponível no momento da gravação.
 */

const CACHE_KEY = "fm_import_history_v1";
const MAX_ENTRIES = 50;

export interface ImportHistoryEntry {
  id: string;
  dataType: string;
  label: string;
  importedRows: number;
  errors: number;
  fileName: string;
  timestamp: string; // ISO
}

// ─── Cache local ──────────────────────────────────────────────────────────────

export function readCachedHistory(): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ImportHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCache(entries: ImportHistoryEntry[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* cota cheia — o banco continua sendo a fonte de verdade */
  }
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Busca o histórico no Supabase. Em caso de falha devolve o cache local,
 * para que a tela nunca fique vazia por um problema momentâneo de rede.
 */
export async function listImportHistory(tenantId: string): Promise<ImportHistoryEntry[]> {
  if (!tenantId) return readCachedHistory();

  try {
    const { data, error } = await supabase
      .from("spreadsheet_imports")
      .select("id, mode, file_name, rows_imported, rows_skipped, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(MAX_ENTRIES);

    if (error || !data) return readCachedHistory();

    const entries: ImportHistoryEntry[] = (data as Record<string, unknown>[]).map(r => ({
      id:           String(r.id),
      dataType:     String(r.mode ?? ""),
      label:        labelForMode(String(r.mode ?? "")),
      importedRows: Number(r.rows_imported ?? 0),
      errors:       Number(r.rows_skipped ?? 0),
      fileName:     String(r.file_name ?? ""),
      timestamp:    String(r.created_at ?? new Date().toISOString()),
    }));

    writeCache(entries);
    return entries;
  } catch {
    return readCachedHistory();
  }
}

// ─── Gravação ─────────────────────────────────────────────────────────────────

/**
 * Registra uma importação. Grava no banco e atualiza o cache local.
 * Nunca lança: uma falha ao registrar o histórico não pode derrubar um import
 * que já gravou os dados com sucesso.
 */
export async function recordImport(
  tenantId: string,
  entry: Omit<ImportHistoryEntry, "id"> & { columnMapping?: Record<string, string>; totalRows?: number },
): Promise<ImportHistoryEntry[]> {
  const local: ImportHistoryEntry = {
    id: `local-${Date.now()}`,
    dataType:     entry.dataType,
    label:        entry.label,
    importedRows: entry.importedRows,
    errors:       entry.errors,
    fileName:     entry.fileName,
    timestamp:    entry.timestamp,
  };

  // Atualiza o cache imediatamente para a UI responder na hora
  const updated = [local, ...readCachedHistory()].slice(0, MAX_ENTRIES);
  writeCache(updated);

  if (!tenantId) return updated;

  try {
    const { data } = await supabase
      .from("spreadsheet_imports")
      .insert({
        tenant_id:      tenantId,
        mode:           entry.dataType,
        file_name:      entry.fileName,
        column_mapping: entry.columnMapping ?? {},
        rows_total:     entry.totalRows ?? entry.importedRows + entry.errors,
        rows_imported:  entry.importedRows,
        rows_skipped:   entry.errors,
        status:         entry.errors > 0 ? "partial" : "success",
      })
      .select("id")
      .maybeSingle();

    if (data?.id) {
      // Substitui o id provisório pelo id real do banco
      const withId = updated.map(e => (e.id === local.id ? { ...e, id: String(data.id) } : e));
      writeCache(withId);
      return withId;
    }
  } catch {
    /* silencioso — o cache local já preserva a entrada */
  }

  return updated;
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  catalog:          "Cadastro de Produtos",
  sales:            "Histórico de Vendas",
  inventory:        "Estoque Histórico",
  orders:           "Ordens de Produção/Compra",
  hierarchy:        "Hierarquia de Códigos ERP",
  color_enrichment: "Enriquecimento de Cor",
};

function labelForMode(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}
