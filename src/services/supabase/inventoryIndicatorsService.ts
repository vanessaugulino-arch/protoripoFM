// ─── inventoryIndicatorsService.ts ─────────────────────────────────────────
// Posição real de estoque (inventory_snapshots) e reposições/pedidos em
// carteira (purchase_orders) — DESACOPLADOS de propósito.
//
// Giro, GMROI, Cobertura (Forward Coverage) e Estoque Médio/Inicial usam
// SOMENTE inventory_snapshots — nunca dependem de purchase_orders existir.
// "Sem pedido em carteira ou em produção" é um estado real e válido do
// negócio (não é "dado faltando"): Reposições = 0 nesse caso, e o resto do
// cálculo segue normal, baseado só na posição de estoque.
//
// purchase_orders só entra pra responder "quanto tem em carteira/produção
// pra chegar" (Reposições) — informação ADITIVA sobre o estoque, nunca um
// pré-requisito pra calcular o resto.
//
// A única dependência de fato obrigatória é inventory_snapshots ter pelo
// menos 1 linha real pro tenant/filtro pedido — sem isso, hasData: false e
// quem chama mostra "sem dado real" (nunca fabrica um número).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface StockPosition {
  pecas:      number
  valorCusto: number
  valorVenda: number
}

export interface InventoryPosition {
  /** Posição no snapshot mais recente com data <= dateFrom — "foto do dia 1". */
  estoqueInicial: StockPosition
  /** Média dos snapshots com data dentro de [dateFrom, dateTo]. */
  estoqueMedio:   StockPosition
  /** false = nenhum snapshot real encontrado (tenant ainda não importou estoque, ou filtro sem SKU correspondente) — nunca fabricar um número nesse caso. */
  hasData: boolean
}

const emptyPosition = (): InventoryPosition => ({
  estoqueInicial: { pecas: 0, valorCusto: 0, valorVenda: 0 },
  estoqueMedio:   { pecas: 0, valorCusto: 0, valorVenda: 0 },
  hasData: false,
})

const sumRows = (rows: { quantity: number | null; value_cost: number | null; value_sale: number | null }[]): StockPosition => ({
  pecas:      rows.reduce((s, r) => s + (r.quantity ?? 0), 0),
  valorCusto: rows.reduce((s, r) => s + (r.value_cost ?? 0), 0),
  valorVenda: rows.reduce((s, r) => s + (r.value_sale ?? 0), 0),
})

/**
 * Posição real de estoque (peças e R$ a custo/venda) no início e na média de
 * um período — lida direto de inventory_snapshots, nunca de purchase_orders.
 * @param skus  opcional — restringe a um conjunto de SKUs (ex.: os de uma divisão). Sem filtro, usa todo o catálogo do tenant.
 */
export async function getInventoryPosition(
  tenantId: string,
  dateFrom: string, // YYYY-MM-DD
  dateTo:   string, // YYYY-MM-DD
  skus?:    string[],
): Promise<InventoryPosition> {
  if (!tenantId || !dateFrom || !dateTo) return emptyPosition()

  // 1) Data do snapshot mais recente <= dateFrom — "foto" do estoque inicial.
  let initQuery = db
    .from('inventory_snapshots')
    .select('snapshot_date')
    .eq('tenant_id', tenantId)
    .lte('snapshot_date', dateFrom)
    .order('snapshot_date', { ascending: false })
    .limit(1)
  if (skus?.length) initQuery = initQuery.in('sku', skus)
  const { data: initDateRows } = await initQuery
  const initDate = initDateRows?.[0]?.snapshot_date as string | undefined

  let estoqueInicial: StockPosition = { pecas: 0, valorCusto: 0, valorVenda: 0 }
  if (initDate) {
    let rowsQuery = db
      .from('inventory_snapshots')
      .select('quantity, value_cost, value_sale')
      .eq('tenant_id', tenantId)
      .eq('snapshot_date', initDate)
    if (skus?.length) rowsQuery = rowsQuery.in('sku', skus)
    const { data: rows } = await rowsQuery
    estoqueInicial = sumRows(rows ?? [])
  }

  // 2) Snapshots dentro do próprio período — média dos totais por data.
  let rangeQuery = db
    .from('inventory_snapshots')
    .select('snapshot_date, quantity, value_cost, value_sale')
    .eq('tenant_id', tenantId)
    .gte('snapshot_date', dateFrom)
    .lte('snapshot_date', dateTo)
  if (skus?.length) rangeQuery = rangeQuery.in('sku', skus)
  const { data: rangeRows } = await rangeQuery

  const byDate = new Map<string, { quantity: number | null; value_cost: number | null; value_sale: number | null }[]>()
  for (const r of (rangeRows ?? []) as { snapshot_date: string; quantity: number | null; value_cost: number | null; value_sale: number | null }[]) {
    const list = byDate.get(r.snapshot_date) ?? []
    list.push(r)
    byDate.set(r.snapshot_date, list)
  }
  const perDateTotals = Array.from(byDate.values()).map(sumRows)
  const estoqueMedio: StockPosition = perDateTotals.length > 0
    ? {
        pecas:      perDateTotals.reduce((s, p) => s + p.pecas, 0)      / perDateTotals.length,
        valorCusto: perDateTotals.reduce((s, p) => s + p.valorCusto, 0) / perDateTotals.length,
        valorVenda: perDateTotals.reduce((s, p) => s + p.valorVenda, 0) / perDateTotals.length,
      }
    : estoqueInicial // sem snapshot dentro do período — usa a foto inicial como melhor estimativa disponível

  const hasData = Boolean(initDate) || perDateTotals.length > 0
  return { estoqueInicial, estoqueMedio, hasData }
}

export interface ReplenishmentsResult {
  pecas: number
  /** false = nenhum pedido cadastrado no período — 0 é o valor REAL (não é "sem dado"), sempre calculável independente disso. */
  hasOrders: boolean
}

/**
 * Peças em carteira/produção com chegada esperada no período — soma de
 * purchase_orders.quantity_ordered por expected_delivery. Aditivo sobre o
 * estoque: sua ausência nunca bloqueia Giro/Cobertura/Estoque Médio, que só
 * dependem de getInventoryPosition.
 */
export async function getReplenishments(
  tenantId: string,
  dateFrom: string,
  dateTo:   string,
  skus?:    string[],
): Promise<ReplenishmentsResult> {
  if (!tenantId || !dateFrom || !dateTo) return { pecas: 0, hasOrders: false }

  let q = db
    .from('purchase_orders')
    .select('quantity_ordered')
    .eq('tenant_id', tenantId)
    .gte('expected_delivery', dateFrom)
    .lte('expected_delivery', dateTo)
  if (skus?.length) q = q.in('sku', skus)
  const { data } = await q

  const rows = (data ?? []) as { quantity_ordered: number | null }[]
  return {
    pecas: rows.reduce((s, r) => s + (r.quantity_ordered ?? 0), 0),
    hasOrders: rows.length > 0,
  }
}

/**
 * Posição real de estoque de UMA DIVISÃO — mesma semântica de
 * getInventoryPosition, mas agregada em Postgres (get_division_inventory_position,
 * migration 038) filtrando por products.division. Evita buscar a lista de
 * SKUs da divisão no cliente para montar um .in() potencialmente enorme.
 */
export async function getDivisionInventoryPosition(
  tenantId: string,
  division: string,
  dateFrom: string, // YYYY-MM-DD
  dateTo:   string, // YYYY-MM-DD
): Promise<InventoryPosition> {
  if (!tenantId || !division || !dateFrom || !dateTo) return emptyPosition()
  const { data, error } = await db.rpc('get_division_inventory_position', {
    p_tenant_id: tenantId, p_division: division, p_date_from: dateFrom, p_date_to: dateTo,
  })
  if (error || !data) return emptyPosition()
  return data as InventoryPosition
}

/** Reposições reais de UMA DIVISÃO — ver getReplenishments; agregada em Postgres (migration 038). */
export async function getDivisionReplenishments(
  tenantId: string,
  division: string,
  dateFrom: string,
  dateTo:   string,
): Promise<ReplenishmentsResult> {
  if (!tenantId || !division || !dateFrom || !dateTo) return { pecas: 0, hasOrders: false }
  const { data, error } = await db.rpc('get_division_replenishments', {
    p_tenant_id: tenantId, p_division: division, p_date_from: dateFrom, p_date_to: dateTo,
  })
  if (error || !data) return { pecas: 0, hasOrders: false }
  return data as ReplenishmentsResult
}

export interface RiskLevelTurnover {
  estoqueInicialPecas: number
  estoqueMedioPecas:   number
  vendasPecas:         number
  /** null quando não há estoque médio nem inicial pra dividir (sem base de cálculo). */
  giro: number | null
}

/**
 * Giro por nível de risco (products.risk_level) dentro de uma divisão e
 * período — via get_division_giro_by_risk_level (migration 039). Fecha o gap
 * do M5 (Plano de Coleção), que não tinha nenhuma quebra por perfil de risco.
 * Chaves do retorno: 'basico' | 'motor_giro' | 'sustentador' | 'icone' |
 * 'sem_classificacao' (produtos sem risk_level definido) — só aparecem as
 * chaves que realmente têm dado (estoque ou venda) no período.
 */
export async function getDivisionGiroByRiskLevel(
  tenantId: string,
  division: string,
  dateFrom: string,
  dateTo:   string,
): Promise<Record<string, RiskLevelTurnover>> {
  if (!tenantId || !division || !dateFrom || !dateTo) return {}
  const { data, error } = await db.rpc('get_division_giro_by_risk_level', {
    p_tenant_id: tenantId, p_division: division, p_date_from: dateFrom, p_date_to: dateTo,
  })
  if (error || !data) return {}
  return data as Record<string, RiskLevelTurnover>
}

/**
 * Forward Coverage real: estoque inicial (foto do dia 1) ÷ vendas dos 90
 * dias seguintes × 90. `vendas90dPecas` vem de quem chama — cada tela já
 * tem sua própria fonte de venda esperada/realizada (sales_history real ou
 * projeção), esta função só combina isso com a posição real de estoque.
 * Retorna null só quando não há base nenhuma pra calcular (sem estoque E
 * sem venda) — nunca fabrica um número.
 */
export function computeForwardCoverageDays(
  estoqueInicialPecas: number,
  vendas90dPecas: number,
  janelaDias = 90,
): number | null {
  if (vendas90dPecas > 0) return (estoqueInicialPecas / vendas90dPecas) * janelaDias
  if (estoqueInicialPecas > 0) return Infinity // tem estoque, mas nenhuma venda projetada — cobertura "indefinida", não zero
  return null
}
