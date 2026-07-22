// ─── ImportWizard.tsx ─────────────────────────────────────────────────────────
// Wizard de importação: suporta 1 arquivo (com mapeamento manual) ou
// múltiplos arquivos em lote (mapeamento automático pelo template).
// Etapas single: upload → mapeamento → validação → concluído.
// Etapas multi:  upload N arquivos → confirmação → importação automática → sumário.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  FileSpreadsheet,
  Files,
  Loader2,
} from "lucide-react";
import {
  type ImportDataType,
  type ImportResult,
  type ParsedFile,
  type ValidationResult,
  IMPORT_CONFIG,
  downloadTemplate,
  parseFile,
  validateRows,
  persistImport,
} from "../../services/importService";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImportWizardProps {
  dataType: ImportDataType | null;
  tenantId: string;
  onComplete: (result: ImportResult) => void;
  onCancel: () => void;
  accentColor?: string;
}

type WizardStep =
  | "type"
  | "upload"
  | "sheet_select"
  | "mapping"
  | "validating"
  | "done"
  | "batch_confirm"
  | "batch_running"
  | "batch_done";

interface BatchFileResult {
  name: string;
  imported: number;
  errors: number;
  status: "pending" | "running" | "done" | "error";
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ImportWizard({
  dataType: initialDataType,
  tenantId,
  onComplete,
  onCancel,
  accentColor = "#9B8CD8",
}: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialDataType ? "upload" : "type");
  const [dataType, setDataType] = useState<ImportDataType | null>(initialDataType);

  // Single-file state
  const [parsed, setParsed]           = useState<ParsedFile | null>(null);
  const [fileName, setFileName]       = useState("");
  const [mapping, setMapping]         = useState<Record<string, string>>({});
  const [dragging, setDragging]       = useState(false);
  const [parseError, setParseError]   = useState<string | null>(null);
  const [validation, setValidation]   = useState<ValidationResult | null>(null);
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  // Sheet selection state
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [sizeWarning, setSizeWarning]   = useState<string | null>(null);
  const [parsing, setParsing]           = useState(false);

  // Multi-file state
  const [fileQueue, setFileQueue]           = useState<File[]>([]);
  const [batchResults, setBatchResults]     = useState<BatchFileResult[]>([]);
  const [batchCurrentIdx, setBatchCurrentIdx] = useState(0);
  const [batchTotalImported, setBatchTotalImported] = useState(0);
  const [batchTotalErrors, setBatchTotalErrors]     = useState(0);
  const batchRunning = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = dataType ? IMPORT_CONFIG[dataType] : null;
  const fields = config?.fields ?? [];

  const accentBg     = `${accentColor}15`;
  const accentBorder = `${accentColor}40`;

  // ── Auto-map ──────────────────────────────────────────────────────────────────
  // Normaliza: minúsculo, sem acentos, alfanumérico+espaço
  function normH(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  // Alias com espaços → substring (frase longa é específica o suficiente)
  // Alias sem espaços → word-boundary (evita "subcategoria" matchear "categoria")
  function matchAlias(hn: string, alias: string): boolean {
    const an = normH(alias);
    if (!an) return false;
    if (an.includes(" ")) return hn.includes(an);
    return hn.split(/\s+/).includes(an);
  }

  function autoMap(headers: string[]): Record<string, string> {
    const m: Record<string, string> = {};
    fields.forEach(field => {
      const match = headers.find(h => {
        const hn = normH(h);
        // 1. key do campo (underscores → espaços)
        const kn = normH(field.key).replace(/_/g, " ");
        if (kn.length >= 3 && hn.includes(kn)) return true;
        // 2. aliases explícitos (definidos no IMPORT_CONFIG)
        if (field.match?.some(alias => matchAlias(hn, alias))) return true;
        // 3. fallback: primeiros 6 chars do label (apenas para campos SEM aliases)
        if (!field.match?.length) {
          const labelNorm = normH(field.label);
          if (labelNorm.length >= 6 && hn.includes(labelNorm.slice(0, 6))) return true;
        }
        return false;
      });
      if (match) m[field.key] = match;
    });
    return m;
  }

  // ── Handlers de arquivo ──────────────────────────────────────────────────────
  const MB = 1024 * 1024;

  async function handleFiles(files: File[]) {
    setParseError(null);
    setSizeWarning(null);
    if (files.length === 0) return;

    if (files.length === 1) {
      const file = files[0];
      setFileName(file.name);

      // Aviso informativo para arquivos grandes (não bloqueia)
      if (file.size > 50 * MB) {
        setSizeWarning(
          `Arquivo grande (${(file.size / MB).toFixed(0)} MB) — pode levar alguns segundos. ` +
          `Para agilizar, exporte apenas a aba necessária.`
        );
      }

      setParsing(true);
      try {
        const result = await parseFile(file);
        setParsed(result);
        setMapping(autoMap(result.headers));
        setStep("mapping");
      } catch (e: unknown) {
        const err = e as Error & { sheets?: string[] };
        if (err.message === "MULTIPLE_SHEETS" && err.sheets?.length) {
          setPendingFile(file);
          setAvailableSheets(err.sheets);
          setStep("sheet_select");
        } else {
          setParseError(err?.message ?? "Erro ao processar arquivo");
        }
      } finally {
        setParsing(false);
      }
    } else {
      setFileQueue(files);
      setBatchResults(files.map(f => ({ name: f.name, imported: 0, errors: 0, status: "pending" })));
      setStep("batch_confirm");
    }
  }

  async function handleSheetSelect(sheetName: string) {
    if (!pendingFile) return;
    setParseError(null);
    setParsing(true);
    try {
      // parseFile reutiliza o buffer em cache — não relê o arquivo do disco
      const result = await parseFile(pendingFile, sheetName);
      setParsed(result);
      setMapping(autoMap(result.headers));
      setStep("mapping");
    } catch (e: unknown) {
      setParseError((e as Error)?.message ?? "Erro ao processar aba");
    } finally {
      setParsing(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) handleFiles(files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) handleFiles(files);
  }

  // ── Importação em lote ───────────────────────────────────────────────────────
  const runBatch = useCallback(async () => {
    if (!dataType || batchRunning.current) return;
    batchRunning.current = true;
    setStep("batch_running");

    let totalImported = 0;
    let totalErrors   = 0;

    for (let i = 0; i < fileQueue.length; i++) {
      setBatchCurrentIdx(i);
      setBatchResults(prev =>
        prev.map((r, idx) => idx === i ? { ...r, status: "running" } : r)
      );

      try {
        const p = await parseFile(fileQueue[i]);
        const m = autoMap(p.headers);
        const result = await persistImport(tenantId, dataType, p, m);
        totalImported += result.importedRows;
        totalErrors   += result.errors;
        setBatchTotalImported(totalImported);
        setBatchTotalErrors(totalErrors);
        setBatchResults(prev =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, imported: result.importedRows, errors: result.errors, status: "done" }
              : r
          )
        );
      } catch (e: unknown) {
        setBatchResults(prev =>
          prev.map((r, idx) => idx === i ? { ...r, status: "error" } : r)
        );
      }
    }

    batchRunning.current = false;
    setStep("batch_done");
  }, [dataType, fileQueue, tenantId]);

  // ── Single: validação e confirmação ──────────────────────────────────────────
  const requiredMapped = fields
    .filter(f => f.required)
    .every(f => Boolean(mapping[f.key]));

  function runValidation() {
    if (!parsed || !dataType) return;
    const vr = validateRows(parsed.rows, parsed.headers, mapping, fields);
    setValidation(vr);
    setStep("validating");
  }

  async function confirmImport() {
    if (!parsed || !dataType) return;
    setImporting(true);
    try {
      const result = await persistImport(tenantId, dataType, parsed, mapping);
      setImportResult({ ...result, fileName });
      setStep("done");
    } catch (e: unknown) {
      setParseError((e as Error)?.message ?? "Erro ao importar dados");
    } finally {
      setImporting(false);
    }
  }

  function resetAll() {
    setStep(initialDataType ? "upload" : "type");
    setDataType(initialDataType);
    setParsed(null); setFileName(""); setMapping({});
    setValidation(null); setImportResult(null); setParseError(null);
    setFileQueue([]); setBatchResults([]); setBatchCurrentIdx(0);
    setBatchTotalImported(0); setBatchTotalErrors(0);
    batchRunning.current = false;
    setPendingFile(null); setAvailableSheets([]); setSizeWarning(null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Seleção de aba (arquivo XLSX com múltiplas abas) ─────────────────────────
  if (step === "sheet_select") {
    return (
      <div>
        <div className="mb-4">
          <p className="text-[#28071C] font-semibold text-sm">
            📋 {fileName}
          </p>
          <p className="text-[#28071C]/60 text-xs mt-1">
            Esta planilha tem {availableSheets.length} abas. Selecione qual deseja importar:
          </p>
          {sizeWarning && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{sizeWarning}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {availableSheets.map(sheet => (
            <button
              key={sheet}
              onClick={() => handleSheetSelect(sheet)}
              className="flex items-center gap-3 px-4 py-3 border-2 border-[#28071C]/10 hover:border-[#7598CF]/50 rounded-xl text-left transition-all hover:bg-[#7598CF]/4 group"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#28071C]/40 group-hover:text-[#7598CF] flex-shrink-0" />
              <span className="flex-1 text-sm text-[#28071C] font-medium">{sheet}</span>
              <ChevronRight className="w-4 h-4 text-[#28071C]/30 group-hover:text-[#7598CF] transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
        {parsing && (
          <div className="flex items-center justify-center gap-3 py-4 text-[#28071C]/50">
            <Loader2 className="w-5 h-5 animate-spin text-[#7598CF]" />
            <span className="text-sm">Lendo aba selecionada{sizeWarning ? " (arquivo grande, aguarde…)" : "…"}</span>
          </div>
        )}
        {parseError && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{parseError}</p>
          </div>
        )}
        <div className="mt-4 text-center">
          <button
            onClick={() => { setPendingFile(null); setAvailableSheets([]); setStep("upload"); }}
            className="text-sm text-[#28071C]/40 hover:text-[#28071C] underline transition-colors"
          >
            ← Escolher outro arquivo
          </button>
        </div>
      </div>
    );
  }

  // ── Seletor de tipo ───────────────────────────────────────────────────────────
  if (step === "type") {
    const types = Object.entries(IMPORT_CONFIG) as [ImportDataType, typeof IMPORT_CONFIG[ImportDataType]][];
    return (
      <div>
        <p className="text-[#28071C]/60 text-sm mb-4">Selecione o tipo de dados a importar:</p>
        <div className="grid grid-cols-1 gap-3">
          {types.map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => { setDataType(key); setStep("upload"); }}
              className="flex items-center gap-4 px-4 py-3.5 border-2 border-[#28071C]/10 hover:border-[#7598CF]/50 rounded-xl text-left transition-all hover:bg-[#7598CF]/4 group"
            >
              <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
              <div className="flex-1">
                <p className="text-[#28071C] font-semibold text-sm">{cfg.label}</p>
                <p className="text-[#28071C]/50 text-xs mt-0.5">{cfg.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#28071C]/30 group-hover:text-[#7598CF] transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
        <div className="mt-4 text-center">
          <button onClick={onCancel} className="text-sm text-[#28071C]/40 hover:text-[#28071C] underline transition-colors">Cancelar</button>
        </div>
      </div>
    );
  }

  // ── Upload ────────────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div>
        {!initialDataType && (
          <button onClick={() => setStep("type")} className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Mudar tipo
          </button>
        )}

        {config && (
          <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl border" style={{ background: accentBg, borderColor: accentBorder }}>
            <span className="text-xl">{config.icon}</span>
            <div>
              <p className="text-[#28071C] font-semibold text-sm">{config.label}</p>
              <p className="text-[#28071C]/55 text-xs mt-0.5">{config.description}</p>
            </div>
          </div>
        )}

        {dataType && (
          <button
            onClick={() => downloadTemplate(dataType)}
            className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-[#28071C]/15 rounded-xl mb-4 hover:border-[#7598CF]/50 hover:bg-[#7598CF]/4 transition-all text-left group"
          >
            <Download className="w-4 h-4 text-[#28071C]/40 group-hover:text-[#7598CF] transition-colors flex-shrink-0" />
            <div>
              <p className="text-[#28071C]/70 text-sm font-medium">Baixar modelo de planilha</p>
              <p className="text-[#28071C]/40 text-xs">CSV com cabeçalhos e dados de exemplo</p>
            </div>
          </button>
        )}

        {/* Loading durante parse */}
        {parsing && (
          <div className="flex items-center justify-center gap-3 py-6 text-[#28071C]/50">
            <Loader2 className="w-5 h-5 animate-spin text-[#7598CF]" />
            <span className="text-sm">Lendo arquivo{sizeWarning ? " (arquivo grande, aguarde…)" : "…"}</span>
          </div>
        )}

        {/* Drop zone com dica de múltiplos arquivos */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            dragging ? "border-[#7598CF] bg-[#7598CF]/8" : "border-[#28071C]/20 hover:border-[#7598CF]/50 hover:bg-[#7598CF]/4"
          }`}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Upload className="w-7 h-7 text-[#28071C]/25" />
            <Files className="w-5 h-5 text-[#28071C]/20" />
          </div>
          <p className="text-[#28071C]/60 text-sm mb-1 font-medium">
            Arraste um ou vários arquivos aqui
          </p>
          <p className="text-[#28071C]/35 text-xs mb-1">Formatos aceitos: .xlsx · .csv</p>
          <p className="text-[#7598CF]/70 text-xs mb-4">
            Selecione múltiplos arquivos para importação em lote automática
          </p>
          <label className="inline-flex items-center gap-2 px-5 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-[#28071C]/90 transition-colors">
            <Upload className="w-4 h-4" /> Selecionar arquivo(s)
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              multiple
              className="sr-only"
              onChange={handleFileInput}
            />
          </label>
        </div>

        {!tenantId && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-amber-700 text-sm">Tenant não identificado — faça login novamente para importar dados.</p>
          </div>
        )}
        {sizeWarning && !parseError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-amber-700 text-sm">{sizeWarning}</p>
          </div>
        )}
        {parseError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-3">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-red-700 text-sm">{parseError}</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#28071C]/10">
          <button onClick={onCancel} className="text-sm text-[#28071C]/40 hover:text-[#28071C] transition-colors">Cancelar</button>
        </div>
      </div>
    );
  }

  // ── Batch confirm ─────────────────────────────────────────────────────────────
  if (step === "batch_confirm") {
    return (
      <div>
        <div className="flex items-start gap-3 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 mb-5">
          <Files className="w-5 h-5 text-[#7598CF] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#28071C] font-semibold text-sm">{fileQueue.length} arquivos selecionados</p>
            <p className="text-[#28071C]/55 text-xs mt-0.5">
              Os arquivos serão importados em sequência automaticamente usando o mapeamento do modelo padrão.
            </p>
          </div>
        </div>

        <div className="border border-[#28071C]/10 rounded-xl overflow-hidden mb-5">
          <div className="bg-[#28071C]/5 px-4 py-2">
            <span className="text-[10px] text-[#28071C]/50 font-bold uppercase tracking-widest">Fila de importação</span>
          </div>
          <div className="divide-y divide-[#28071C]/6 max-h-64 overflow-y-auto">
            {fileQueue.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <FileSpreadsheet className="w-4 h-4 text-[#28071C]/30 flex-shrink-0" />
                <span className="text-[#28071C]/70 text-sm truncate flex-1">{f.name}</span>
                <span className="text-[#28071C]/35 text-xs flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs">
            Use arquivos no formato do modelo padrão para que o mapeamento automático funcione corretamente.
            Arquivos grandes podem demorar alguns minutos.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => { setFileQueue([]); setBatchResults([]); setStep("upload"); }}
            className="flex items-center gap-1.5 text-sm text-[#28071C]/50 hover:text-[#28071C] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <button
            onClick={runBatch}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 transition-all shadow-sm"
          >
            <Files className="w-4 h-4" />
            Importar {fileQueue.length} arquivos
          </button>
        </div>
      </div>
    );
  }

  // ── Batch running ─────────────────────────────────────────────────────────────
  if (step === "batch_running" || step === "batch_done") {
    const done = step === "batch_done";
    const progress = done
      ? batchResults.length
      : batchResults.filter(r => r.status === "done" || r.status === "error").length;

    return (
      <div>
        {/* Progresso geral */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#28071C]/60 font-medium">
              {done ? "Importação concluída" : `Importando arquivo ${batchCurrentIdx + 1} de ${batchResults.length}…`}
            </span>
            <span className="text-sm text-[#28071C]/60">{progress}/{batchResults.length}</span>
          </div>
          <div className="h-2 bg-[#28071C]/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(progress / batchResults.length) * 100}%`,
                background: done ? "#10b981" : accentColor,
              }}
            />
          </div>
        </div>

        {/* Lista de arquivos com status */}
        <div className="border border-[#28071C]/10 rounded-xl overflow-hidden mb-5">
          <div className="divide-y divide-[#28071C]/6 max-h-72 overflow-y-auto">
            {batchResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-shrink-0">
                  {r.status === "pending" && <div className="w-4 h-4 rounded-full border-2 border-[#28071C]/20" />}
                  {r.status === "running" && <Loader2 className="w-4 h-4 text-[#7598CF] animate-spin" />}
                  {r.status === "done"    && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {r.status === "error"   && <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>
                <span className="text-[#28071C]/70 text-sm truncate flex-1">{r.name}</span>
                {r.status === "done" && (
                  <span className="text-emerald-600 text-xs flex-shrink-0">{r.imported.toLocaleString()} importados</span>
                )}
                {r.status === "error" && (
                  <span className="text-red-500 text-xs flex-shrink-0">erro</span>
                )}
                {r.status === "running" && (
                  <span className="text-[#7598CF] text-xs flex-shrink-0">processando…</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Totais */}
        {(batchTotalImported > 0 || done) && (
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-4 ${done ? "bg-emerald-50 border border-emerald-200" : "bg-[#7598CF]/8 border border-[#7598CF]/20"}`}>
            <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${done ? "text-emerald-600" : "text-[#7598CF]"}`} />
            <div>
              <p className={`font-semibold text-sm ${done ? "text-emerald-800" : "text-[#28071C]"}`}>
                {batchTotalImported.toLocaleString()} registros importados
              </p>
              {batchTotalErrors > 0 && (
                <p className="text-amber-600 text-xs mt-0.5">{batchTotalErrors.toLocaleString()} linhas com erro</p>
              )}
            </div>
          </div>
        )}

        {done && (
          <div className="flex justify-end gap-3">
            <button
              onClick={resetAll}
              className="px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C] rounded-xl text-sm font-semibold hover:bg-[#28071C]/5 transition-all"
            >
              Nova importação
            </button>
            <button
              onClick={() => onComplete({
                dataType: dataType!,
                fileName: `${batchResults.length} arquivos`,
                totalRows: batchTotalImported + batchTotalErrors,
                importedRows: batchTotalImported,
                errors: batchTotalErrors,
              })}
              className="px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 transition-all"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Single: mapping ───────────────────────────────────────────────────────────
  if (step === "mapping" && parsed && config) {
    return (
      <div>
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-emerald-800 text-sm font-semibold truncate">{fileName}</p>
            <p className="text-emerald-700 text-xs">{parsed.headers.length} colunas · {parsed.totalRows} linhas de dados</p>
          </div>
          <button onClick={() => setStep("upload")} className="text-emerald-600 hover:text-emerald-800 text-xs underline flex-shrink-0">Trocar</button>
        </div>

        <div className="flex items-start gap-2 bg-[#7598CF]/8 border border-[#7598CF]/20 rounded-xl px-4 py-3 mb-4">
          <Info className="w-4 h-4 text-[#7598CF] flex-shrink-0 mt-0.5" />
          <p className="text-[#28071C]/60 text-xs leading-relaxed">
            Para cada <strong>campo do sistema</strong>, selecione a coluna da sua planilha. Campos <span className="text-red-600 font-semibold">obrigatórios</span> precisam ser mapeados.
          </p>
        </div>

        <div className="border border-[#28071C]/10 rounded-2xl overflow-hidden mb-5">
          <div className="grid grid-cols-2 gap-0 bg-[#28071C]/5 px-5 py-2.5">
            <span className="text-[10px] text-[#28071C]/50 font-bold uppercase tracking-widest">Campo do sistema</span>
            <span className="text-[10px] text-[#28071C]/50 font-bold uppercase tracking-widest">Coluna na planilha</span>
          </div>
          <div className="divide-y divide-[#28071C]/6">
            {fields.map(field => (
              <div key={field.key} className="grid grid-cols-2 gap-4 items-center px-5 py-3">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#28071C]/80 text-sm">{field.label}</span>
                    {field.required && (
                      <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 rounded-full px-1.5 py-0.5 font-semibold">obrigatório</span>
                    )}
                  </div>
                  <p className="text-[#28071C]/40 text-xs mt-0.5">{field.description}</p>
                </div>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className={`bg-white border-2 rounded-lg px-3 py-2 text-sm text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#7598CF]/40 ${
                    field.required && !mapping[field.key] ? "border-red-200" : "border-[#28071C]/15 focus:border-[#7598CF]"
                  }`}
                >
                  <option value="">— Não importar —</option>
                  {parsed.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-[#28071C]/40">
            {!requiredMapped
              ? <span className="text-red-500">{fields.filter(f => f.required && !mapping[f.key]).length} campo(s) obrigatório(s) sem mapeamento</span>
              : <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Campos obrigatórios mapeados</span>
            }
          </div>
          <button
            onClick={runValidation}
            disabled={!requiredMapped}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Verificar dados <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Single: validating ────────────────────────────────────────────────────────
  if (step === "validating" && parsed && validation && config) {
    const hasErrors = validation.invalidRows > 0;
    const maxErrors = 5;
    const shownErrors = validation.errors.slice(0, maxErrors);

    return (
      <div>
        <div className={`flex items-start gap-3 rounded-xl px-4 py-4 mb-5 border ${
          hasErrors ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
        }`}>
          {hasErrors
            ? <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          }
          <div>
            <p className={`font-semibold text-sm ${hasErrors ? "text-amber-800" : "text-emerald-800"}`}>
              {hasErrors
                ? `${validation.invalidRows} linha(s) com problemas encontradas`
                : "Todos os dados estão no formato correto!"
              }
            </p>
            <p className={`text-xs mt-0.5 ${hasErrors ? "text-amber-700" : "text-emerald-700"}`}>
              {validation.validRows} linha(s) válidas · {validation.invalidRows} com erro(s) · Total: {parsed.totalRows}
            </p>
            {hasErrors && (
              <p className="text-amber-600 text-xs mt-1">
                Linhas com erro serão puladas. Você pode importar as válidas agora.
              </p>
            )}
          </div>
        </div>

        {hasErrors && shownErrors.length > 0 && (
          <div className="border border-[#28071C]/10 rounded-xl overflow-hidden mb-5">
            <div className="bg-[#28071C]/5 px-4 py-2 flex items-center justify-between">
              <span className="text-[10px] text-[#28071C]/50 font-bold uppercase tracking-widest">Detalhes dos erros</span>
              {validation.errors.length > maxErrors && (
                <span className="text-[10px] text-[#28071C]/40">{validation.errors.length - maxErrors} erros adicionais não mostrados</span>
              )}
            </div>
            <div className="divide-y divide-[#28071C]/6">
              {shownErrors.map((err, i) => (
                <div key={i} className="grid grid-cols-3 gap-3 px-4 py-2.5 text-xs">
                  <span className="text-[#28071C]/50">Linha {err.row}</span>
                  <span className="text-[#28071C]/70 font-medium truncate">{err.field}</span>
                  <span className="text-red-600 truncate">"{err.value || "(vazio)"}" — esperado: {err.expected}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep("mapping")}
            className="flex items-center gap-1.5 text-sm text-[#28071C]/50 hover:text-[#28071C] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Rever mapeamento
          </button>
          <button
            onClick={confirmImport}
            disabled={importing || validation.validRows === 0 || !tenantId}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {importing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Importando…
              </span>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Confirmar ({validation.validRows} linhas)</>
            )}
          </button>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-3">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-red-700 text-sm">{parseError}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Single: done ──────────────────────────────────────────────────────────────
  if (step === "done" && importResult && config) {
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h3 className="text-[#28071C] font-bold text-lg mb-1">{config.label} importado!</h3>
        <p className="text-[#28071C]/55 text-sm mb-1">
          <strong>{importResult.importedRows}</strong> registros salvos com sucesso.
        </p>
        {importResult.errors > 0 && (
          <p className="text-amber-600 text-xs mb-3">{importResult.errors} linha(s) não importadas.</p>
        )}
        <p className="text-[#28071C]/35 text-xs mb-6">Arquivo: {fileName}</p>
        <div className="flex justify-center gap-3">
          {!initialDataType && (
            <button onClick={resetAll} className="px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C] rounded-xl text-sm font-semibold hover:bg-[#28071C]/5 transition-all">
              Nova importação
            </button>
          )}
          <button
            onClick={() => onComplete(importResult)}
            className="px-4 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 transition-all"
          >
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return null;
}
