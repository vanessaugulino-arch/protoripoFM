// src/engine/clusterCompensation.ts
//
// Motor de compensação — quando a participação entre canais (M2) ou divisões
// (M3) muda, o indicador consolidado que era meta no M1 (ex: margem) se
// desvia, porque cada canal/divisão carrega sua própria taxa e a mudança de
// peso de receita desloca a média ponderada.
//
// Este motor resolve o campo absorvedor pela mesma hierarquia de cluster que
// o M1 já usa (planningEngine.ts, T3: Custo > Margem > MKD%) — ou seja, o
// Custo de cada canal/divisão fica protegido (não muda) e o MKD% absorve a
// diferença, recalculado de forma que o consolidado bata exatamente com a
// meta. É a mesma "conta inversa" descrita na Seção 3.2 do PRD, só que
// aplicada no nível consolidado (Primazia dos Absolutos) em vez de uma
// única entidade.

export interface CompensationEntity {
  id: string;
  receita: number; // RL do canal/divisão
  cpv: number;     // custo dos produtos vendidos em R$ (custoMédio × peças) — protegido
}

export interface CompensationOutcome {
  mkdPctNew: number; // novo MKD% uniforme, aplicado a todos os canais/divisões
  perEntity: Record<
    string,
    { mkdPct: number; markdown: number; margemBrutaRS: number; margemBruta: number }
  >;
  achievedMargin: number; // conferência: deve bater com targetMarginPct (salvo clamp)
  clamped: boolean;       // true quando o MKD% teórico deu negativo e foi travado em 0
}

/**
 * Margem consolidada = Σ(Receita − CPV − MKD_R$) / ΣReceita.
 * Mantendo CPV fixo por entidade, resolve o MKD% uniforme que faz a margem
 * consolidada bater exatamente com targetMarginPct.
 */
export function computeMarginCompensationViaMkd(
  entities: CompensationEntity[],
  targetMarginPct: number,
): CompensationOutcome | null {
  const totalRL = entities.reduce((s, e) => s + e.receita, 0);
  if (totalRL <= 0) return null;
  const totalCPV = entities.reduce((s, e) => s + e.cpv, 0);

  const targetFrac = targetMarginPct / 100;
  const rawMkdPct = 100 * ((totalRL - totalCPV) / totalRL - targetFrac);
  const mkdPctNew = Math.max(0, rawMkdPct);
  const clamped = rawMkdPct < 0;

  const perEntity: CompensationOutcome["perEntity"] = {};
  let achievedLucro = 0;
  for (const e of entities) {
    const markdown = (e.receita * mkdPctNew) / 100;
    const margemBrutaRS = e.receita - e.cpv - markdown;
    const margemBruta = e.receita > 0 ? (margemBrutaRS / e.receita) * 100 : 0;
    perEntity[e.id] = { mkdPct: mkdPctNew, markdown, margemBrutaRS, margemBruta };
    achievedLucro += margemBrutaRS;
  }

  return {
    mkdPctNew,
    perEntity,
    achievedMargin: totalRL > 0 ? (achievedLucro / totalRL) * 100 : 0,
    clamped,
  };
}
