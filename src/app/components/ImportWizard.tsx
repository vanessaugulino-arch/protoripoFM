// ─── ImportWizard.tsx ─────────────────────────────────────────────────────────
// Wizard reutilizável de importação de planilhas.
// Etapas: upload → mapeamento de colunas → validação → concluído.
// Usado em: Onboarding (etapa 'data') e OperationSettings (card 4).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import {
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Info,
  FileSpreadsheet,
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
  /** Tipo fixo de dado. Se null, mostra seletor de tipo na primeira etapa. */
  dataType: ImportDataType | null;
  /** tenant_id do usuário ativo. */
  tenantId: string;
  /** Chamado ao concluir (com sucesso ou parcial). */
  onComplete: (result: ImportResult) => void;
  /** Chamado ao cancelar / voltar. */
  onCancel: () => void;
  /** Cor de destaque (padrão: #9B8CD8). */
  accentColor?: string;
}

type WizardStep = "type" | "upload" | "mapping" | "validating" | "done";

// ─── Componente ────────────────────────────────────────────────────────────────

export default function ImportWizard({
  dataType: initialDataType,
  tenantId,
  onComplete,
  onCancel,
  accentColor = "#9B8CD8",
}: ImportWizardProps) {
  const [step, setStep]                     = useState<WizardStep>(initialDataType ? "upload" : "type");
  const [dataType, setDataType]             = useState<ImportDataType | null>(initialDataType);
  const [parsed, setParsed]                 = useState<ParsedFile | null>(null);
  const [fileName, setFileName]             = useState("");
  const [mapping, setMapping]               = useState<Record<string, string>>({});
  const [dragging, setDragging]             = useState(false);
  const [parseError, setParseError]         = useState<string | null>(null);
  const [validation, setValidation]         = useState<ValidationResult | null>(null);
  const [importing, setImporting]           = useState(false);
  const [importResult, setImportResult]     = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = dataType ? IMPORT_CONFIG[dataType] : null;
  const fields = config?.fields ?? [];

  // Auto-map: se o header da planilha contiver o label do campo (case-insensitive)
  function autoMap(headers: string[]) {
    const m: Record<string, string> = {};
    fields.forEach(field => {
      const match = headers.find(h =>
        h.toLowerCase().includes(field.key.toLowerCase()) ||
        h.toLowerCase().includes(field.label.toLowerCase().slice(0, 6))
      );
      if (match) m[field.key] = match;
    });
    return m;
  }

  async function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    try {
      const result = await parseFile(file);
      setParsed(result);
      setMapping(autoMap(result.headers));
      setStep("mapping");
    } catch (e: any) {
      setParseError(e?.message ?? "Erro ao processar arquivo");
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

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
      const final = { ...result, fileName };
      setImportResult(final);
      setStep("done");
    } catch (e: any) {
      setParseError(e?.message ?? "Erro ao importar dados");
    } finally {
      setImporting(false);
    }
  }

  const requiredMapped = fields
    .filter(f => f.required)
    .every(f => Boolean(mapping[f.key]));

  const accentStyle = { color: accentColor };
  const accentBg    = `${accentColor}15`;
  const accentBorder= `${accentColor}40`;

  // ── Step: type selector ──────────────────────────────────────────────────────
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

  // ── Step: upload ─────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div>
        {/* Back button if type selector was shown */}
        {!initialDataType && (
          <button onClick={() => setStep("type")} className="flex items-center gap-1.5 text-xs text-[#28071C]/40 hover:text-[#28071C] mb-4 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Mudar tipo
          </button>
        )}

        {/* Context */}
        {config && (
          <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl border" style={{ background: accentBg, borderColor: accentBorder }}>
            <span className="text-xl">{config.icon}</span>
            <div>
              <p className="text-[#28071C] font-semibold text-sm">{config.label}</p>
              <p className="text-[#28071C]/55 text-xs mt-0.5">{config.description}</p>
            </div>
          </div>
        )}

        {/* Template download */}
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

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            dragging ? "border-[#7598CF] bg-[#7598CF]/8" : "border-[#28071C]/20 hover:border-[#7598CF]/50 hover:bg-[#7598CF]/4"
          }`}
        >
          <Upload className="w-8 h-8 text-[#28071C]/25 mx-auto mb-2" />
          <p className="text-[#28071C]/60 text-sm mb-1 font-medium">
            Arraste o arquivo aqui ou clique para selecionar
          </p>
          <p className="text-[#28071C]/35 text-xs mb-4">Formatos aceitos: .xlsx · .csv</p>
          <label className="inline-flex items-center gap-2 px-5 py-2 bg-[#28071C] text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-[#28071C]/90 transition-colors">
            <Upload className="w-4 h-4" /> Selecionar arquivo
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={handleFileInput}
            />
          </label>
        </div>

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

  // ── Step: mapping ─────────────────────────────────────────────────────────────
  if (step === "mapping" && parsed && config) {
    return (
      <div>
        {/* File badge */}
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
            O sistema identificou as colunas abaixo. Para cada <strong>campo do sistema</strong>, selecione qual coluna da sua planilha corresponde. Campos marcados como <span className="text-red-600 font-semibold">obrigatório</span> precisam ser mapeados.
          </p>
        </div>

        {/* Mapping table */}
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
                  <option value="">— Não importar coluna —</option>
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

  // ── Step: validating (preview de erros) ──────────────────────────────────────
  if (step === "validating" && parsed && validation && config) {
    const hasErrors = validation.invalidRows > 0;
    const maxErrors = 5;
    const shownErrors = validation.errors.slice(0, maxErrors);

    return (
      <div>
        {/* Summary */}
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
                Linhas com erro serão puladas. Você pode importar as válidas agora e corrigir o arquivo depois.
              </p>
            )}
          </div>
        </div>

        {/* Error list */}
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
                  <span className="text-red-600 truncate">
                    "{err.value || "(vazio)"}" — esperado: {err.expected}
                  </span>
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
            disabled={importing || validation.validRows === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#28071C] text-white rounded-xl text-sm font-semibold hover:bg-[#28071C]/90 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {importing ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importando…
              </span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirmar importação ({validation.validRows} linhas)
              </>
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

  // ── Step: done ────────────────────────────────────────────────────────────────
  if (step === "done" && importResult && config) {
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h3 className="text-[#28071C] font-bold text-lg mb-1">
          {config.label} importado!
        </h3>
        <p className="text-[#28071C]/55 text-sm mb-1">
          <strong>{importResult.importedRows}</strong> registros salvos com sucesso.
        </p>
        {importResult.errors > 0 && (
          <p className="text-amber-600 text-xs mb-3">
            {importResult.errors} linha(s) não importadas — verifique o arquivo e reimporte se necessário.
          </p>
        )}
        <p className="text-[#28071C]/35 text-xs mb-6">Arquivo: {fileName}</p>
        <div className="flex justify-center gap-3">
          {!initialDataType && (
            <button
              onClick={() => {
                setStep("type"); setDataType(null);
                setParsed(null); setFileName("");
                setMapping({}); setValidation(null);
                setImportResult(null); setParseError(null);
              }}
              className="px-4 py-2 border-2 border-[#28071C]/20 text-[#28071C] rounded-xl text-sm font-semibold hover:bg-[#28071C]/5 transition-all"
            >
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
