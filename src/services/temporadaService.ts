// ─── temporadaService.ts ──────────────────────────────────────────────────────
// Helpers de cálculo e tipos para temporadas de coleção.
// Persistência delegada a: src/services/supabase/seasonService.ts
// ─────────────────────────────────────────────────────────────────────────────

// Mantido para compatibilidade com imports existentes que verificam a chave
// (ex.: limpeza de localStorage legada na inicialização do app).
export const TEMPORADAS_KEY       = "fashionmind_temporadas";
export const TEMPORADAS_REGRA_KEY = "fashionmind_temporadas_regra";

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Temporada {
  /** UUID gerado pelo Supabase */
  id: string;
  nome: string;
  mesInicio: string;
  mesFim: string;
  criadaEm: string;
  /** Ano fiscal ao qual esta temporada pertence (preenchido nas auto-geradas). */
  anoFiscal?: number;
  /** True se criada automaticamente pelo sistema ao salvar um Planejamento. */
  autoGerada?: boolean;
  /** Tipo canônico — permite re-sincronizar com a regra padrão. */
  tipo?: "verao" | "inverno";
}

export interface TemporadaRegraDefault {
  verao:   { mesInicio: string; mesFim: string };
  inverno: { mesInicio: string; mesFim: string };
}

// ─── Regra padrão ─────────────────────────────────────────────────────────────

export const DEFAULT_REGRA: TemporadaRegraDefault = {
  verao:   { mesInicio: "Agosto", mesFim: "Fevereiro" },
  inverno: { mesInicio: "Março",  mesFim: "Julho"     },
};

// ─── Helpers de cálculo (puros, síncronos) ───────────────────────────────────

/**
 * Calcula o mês de fim como o mês imediatamente anterior ao mês de início da
 * próxima temporada (circular, cruza o ano-calendário se necessário).
 */
export function computeMesFim(mesInicioProxima: string): string {
  const idx = MONTHS.indexOf(mesInicioProxima);
  if (idx < 0) return "Dezembro";
  return MONTHS[(idx - 1 + 12) % 12];
}

/**
 * Deriva os meses de fim a partir dos meses de início das duas temporadas,
 * garantindo que se complementem sem sobreposição.
 */
export function deriveRegra(
  veraoInicio:   string,
  invernoInicio: string,
): TemporadaRegraDefault {
  return {
    verao:   { mesInicio: veraoInicio,   mesFim: computeMesFim(invernoInicio) },
    inverno: { mesInicio: invernoInicio, mesFim: computeMesFim(veraoInicio)   },
  };
}

/**
 * Gera os dados das 2 temporadas padrão para um ano fiscal.
 * Não persiste — use autoGenerateForYearDb para salvar no Supabase.
 */
export function generateTemporadasForYear(
  anoFiscal: number,
  regra: TemporadaRegraDefault,
): Omit<Temporada, "id" | "criadaEm">[] {
  return [
    {
      nome:       `Verão ${anoFiscal}`,
      mesInicio:  regra.verao.mesInicio,
      mesFim:     regra.verao.mesFim,
      anoFiscal,
      autoGerada: true,
      tipo:       "verao",
    },
    {
      nome:       `Inverno ${anoFiscal}`,
      mesInicio:  regra.inverno.mesInicio,
      mesFim:     regra.inverno.mesFim,
      anoFiscal,
      autoGerada: true,
      tipo:       "inverno",
    },
  ];
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

/**
 * Retorna true se a temporada pertence a um ano fiscal já encerrado.
 * Temporadas passadas não podem ser excluídas nem editadas.
 */
export function isTemporadaPast(t: Temporada): boolean {
  const currentYear = new Date().getFullYear();
  if (t.anoFiscal !== undefined) return t.anoFiscal < currentYear;
  // Fallback para temporadas sem anoFiscal: heurística pela data de criação
  try {
    return new Date(t.criadaEm).getFullYear() < currentYear - 1;
  } catch {
    return false;
  }
}

// ─── Re-exports das funções de persistência (Supabase) ───────────────────────
// Importar diretamente de seasonService quando possível; estes re-exports
// facilitam a migração gradual dos callers existentes.

export {
  listSeasonsDb         as getTemporadas,
  insertSeasonDb        as addTemporada,
  updateSeasonDb        as updateTemporada,
  deleteSeasonDb        as deleteTemporada,
  getRegraDefaultDb     as getRegraDefault,
  saveRegraDefaultDb    as saveRegraDefault,
  autoGenerateForYearDb as autoGenerateForYear,
} from "./supabase/seasonService";
