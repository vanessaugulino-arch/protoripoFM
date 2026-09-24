// src/engine/sortimentGate.ts
// ─── Trava de aprovação do Sortimento (M6) ──────────────────────────────────
// NOVA — ao contrário de M2/M3/M4/M5, o M6 nunca teve nenhuma checagem
// automática de divergência antes de aplicar (confirmado por auditoria).
// Decisão da usuária: construir o mesmo padrão das outras telas — comparar a
// receita do mix de collections de cada divisão contra a meta (100% do
// revenueTarget da divisão), fora da banda → sinaliza para pedir aprovação.
//
// Mix revenue de uma divisão = Σ colRevenue(col) = revenueTarget × Σ(revenuePct)/100
// — como revenueTarget é comum a todas as collections da divisão, a
// divergência real está inteiramente em quanto Σ(revenuePct) se afasta de
// 100%. Mesma tolerância (2%) já usada no M5.

export const SORTIMENT_TOLERANCE_PCT = 2

export interface SortimentDivisionCheck {
  divId: string
  mixPct: number // soma de revenuePct das collections desta divisão
  gapPct: number // mixPct - 100
  outsideTolerance: boolean
}

export function computeSortimentDivergence(
  divisions: { id: string; collections: { revenuePct: number }[] }[],
): SortimentDivisionCheck[] {
  return divisions.map(div => {
    const mixPct = div.collections.reduce((s, c) => s + c.revenuePct, 0)
    const gapPct = mixPct - 100
    return { divId: div.id, mixPct, gapPct, outsideTolerance: Math.abs(gapPct) > SORTIMENT_TOLERANCE_PCT }
  })
}
