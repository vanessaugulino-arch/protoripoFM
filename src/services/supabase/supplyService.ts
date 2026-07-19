// ─── supplyService.ts ─────────────────────────────────────────────────────────
// CRUD para as tabelas da migration 009_supply_matrix_v2.sql
// + função calcBudgetProjection que estima o orçamento por período
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../../lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════

export type TipoFornecedorV2 = "materia_prima" | "servico" | "produto_acabado";
export type OrigemFornecedor = "nacional" | "internacional";
export type PagamentoGatilho   = "pedido" | "faturamento" | "entrega";
export type PagamentoModalidade = "avista" | "aprazo";
export type TipoEntregaEtapa =
  | "semi_acabado"
  | "acabado"
  | "white_label"
  | "private_label";

/** Uma parcela do pagamento ao fornecedor */
export interface PagamentoParcela {
  modalidade?: PagamentoModalidade; // à vista ou à prazo (opcional — retrocompatível)
  pct: number;               // 0-100, percentual do valor total
  gatilho: PagamentoGatilho; // a partir de quando conta o prazo
  dias: number;              // dias após o gatilho
}

// ── supply_fornecedores ───────────────────────────────────────────────────────
export interface SupplyFornecedor {
  id: string;
  tenant_id: string;
  nome: string;
  codigo_erp: string | null;
  tipo_fornecedor: TipoFornecedorV2;
  origem: OrigemFornecedor | null;
  prazo_entrega_dias: number;
  pagamento_parcelas: PagamentoParcela[];
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Joined (opcionais, carregados via select aninhado)
  categorias?: SupplyCategoria[];
  etapas?: SupplyEtapa[];
}

// ── supply_fornecedor_categorias ──────────────────────────────────────────────
export interface SupplyCategoria {
  id: string;
  tenant_id: string;
  fornecedor_id: string;
  divisao: string | null;
  categoria: string | null;
  subcategoria: string | null;
  pct_custo_medio: number;  // % do custo do produto atribuído a este insumo
  created_at: string;
}

// ── supply_etapas_servico ─────────────────────────────────────────────────────
export interface SupplyEtapa {
  id: string;
  tenant_id: string;
  fornecedor_id: string;
  divisao: string | null;
  categoria: string | null;
  sequencia: number;
  nome_etapa: string;
  prazo_etapa_dias: number;
  tipo_entrega: TipoEntregaEtapa;
  created_at: string;
}

// ── Resultado da projeção de orçamento ───────────────────────────────────────
export interface OrcamentoPorPeriodo {
  mes: string;           // ex: "Ago", "Set" …  (mesmo label do CYCLE_MONTHS)
  valor: number;         // R$ estimado de pagamentos neste mês
  fornecedores: Array<{
    nome: string;
    tipo: TipoFornecedorV2;
    valor: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUD — supply_fornecedores
// ══════════════════════════════════════════════════════════════════════════════

export async function listSupplyFornecedores(
  tenantId: string
): Promise<SupplyFornecedor[]> {
  const { data, error } = await db
    .from("supply_fornecedores")
    .select(`
      *,
      categorias:supply_fornecedor_categorias(*),
      etapas:supply_etapas_servico(* ORDER BY sequencia)
    `)
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as SupplyFornecedor[];
}

export async function insertSupplyFornecedor(
  tenantId: string,
  values: Omit<SupplyFornecedor, "id" | "tenant_id" | "created_at" | "updated_at" | "categorias" | "etapas">
): Promise<SupplyFornecedor> {
  const { data, error } = await db
    .from("supply_fornecedores")
    .insert({ ...values, tenant_id: tenantId })
    .select()
    .single();
  if (error) throw error;
  return data as SupplyFornecedor;
}

export async function updateSupplyFornecedor(
  id: string,
  values: Partial<Omit<SupplyFornecedor, "id" | "tenant_id" | "created_at" | "categorias" | "etapas">>
): Promise<SupplyFornecedor> {
  const { data, error } = await db
    .from("supply_fornecedores")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SupplyFornecedor;
}

/** Soft-delete */
export async function deleteSupplyFornecedor(id: string): Promise<void> {
  const { error } = await db
    .from("supply_fornecedores")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUD — supply_fornecedor_categorias
// Substitui TODOS os registros de um fornecedor (delete + re-insert)
// ══════════════════════════════════════════════════════════════════════════════

export async function replaceSupplyCategorias(
  tenantId: string,
  fornecedorId: string,
  rows: Omit<SupplyCategoria, "id" | "tenant_id" | "fornecedor_id" | "created_at">[]
): Promise<SupplyCategoria[]> {
  const { error: delErr } = await db
    .from("supply_fornecedor_categorias")
    .delete()
    .eq("fornecedor_id", fornecedorId);
  if (delErr) throw delErr;
  if (rows.length === 0) return [];

  const insert = rows.map(r => ({ ...r, tenant_id: tenantId, fornecedor_id: fornecedorId }));
  const { data, error } = await db
    .from("supply_fornecedor_categorias")
    .insert(insert)
    .select();
  if (error) throw error;
  return (data ?? []) as SupplyCategoria[];
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUD — supply_etapas_servico
// Substitui TODAS as etapas de um fornecedor (delete + re-insert)
// ══════════════════════════════════════════════════════════════════════════════

export async function replaceSupplyEtapas(
  tenantId: string,
  fornecedorId: string,
  rows: Omit<SupplyEtapa, "id" | "tenant_id" | "fornecedor_id" | "created_at">[]
): Promise<SupplyEtapa[]> {
  const { error: delErr } = await db
    .from("supply_etapas_servico")
    .delete()
    .eq("fornecedor_id", fornecedorId);
  if (delErr) throw delErr;
  if (rows.length === 0) return [];

  const insert = rows.map(r => ({ ...r, tenant_id: tenantId, fornecedor_id: fornecedorId }));
  const { data, error } = await db
    .from("supply_etapas_servico")
    .insert(insert)
    .select();
  if (error) throw error;
  return (data ?? []) as SupplyEtapa[];
}

// ══════════════════════════════════════════════════════════════════════════════
// LÓGICA DE ORÇAMENTO PROJETADO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calcula a previsão de orçamento por período, cruzando:
 *   - a curva de receita mensal (plannedRevenue)
 *   - a margem bruta do plano
 *   - os fornecedores ativos com suas categorias (% custo) e condições de pagamento
 *
 * Para cada fornecedor, para cada mês de entrega M:
 *   1. custo[M]           = receita[M] × (1 − margemPct/100)
 *   2. valor[M]           = custo[M] × (pctCustoMedio/100)
 *   3. mes_pedido         = M − round(prazo_entrega_dias / 30)
 *   4. Para cada parcela de pagamento:
 *        gatilho=pedido      → mes_pedido + round(parcela.dias/30)
 *        gatilho=faturamento → M + round(parcela.dias/30)
 *        gatilho=entrega     → M + round(parcela.dias/30)
 *      valor_parcela = valor_fornecedor × (parcela.pct/100)
 *
 * @param months         Lista de labels dos meses do ciclo (ex: ["Ago","Set",...])
 * @param receita        Receita total por mês (atacado+varejo+ecommerce)
 * @param margemPct      Margem bruta do plano (ex: 65 para 65%)
 * @param fornecedores   Lista de fornecedores com categorias carregadas
 * @param filtroDivisao  Opcional: filtra categorias por divisão específica
 */
export function calcBudgetProjection(
  months: string[],
  receita: number[],
  margemPct: number,
  fornecedores: SupplyFornecedor[],
  filtroDivisao?: string
): OrcamentoPorPeriodo[] {
  // Inicializa resultado: um bucket por mês do ciclo (índice 0..n-1)
  // Usamos índices numéricos para permitir pagamentos além do último mês
  const n = months.length;
  const buckets = new Map<number, { valor: number; fornecedores: Map<string, { nome: string; tipo: TipoFornecedorV2; valor: number }> }>();

  const getBucket = (idx: number) => {
    if (!buckets.has(idx)) {
      buckets.set(idx, { valor: 0, fornecedores: new Map() });
    }
    return buckets.get(idx)!;
  };

  // Pré-inicializa todos os meses do ciclo
  for (let i = 0; i < n; i++) getBucket(i);

  const margemFator = 1 - margemPct / 100;

  for (const forn of fornecedores) {
    if (!forn.ativo) continue;

    // Calcula o % custo médio considerando as categorias do fornecedor
    const cats = (forn.categorias ?? []).filter(c =>
      filtroDivisao ? (c.divisao === filtroDivisao || c.divisao === null) : true
    );
    if (cats.length === 0) continue;

    const pctCusto = cats.reduce((s, c) => s + c.pct_custo_medio, 0) / cats.length / 100;
    if (pctCusto <= 0) continue;

    // Determina o lead time em meses (arredondado)
    const leadMeses = Math.round(forn.prazo_entrega_dias / 30);
    const parcelas = forn.pagamento_parcelas ?? [];

    // Para cada mês de entrega no ciclo
    for (let m = 0; m < n; m++) {
      const receitaMes = receita[m] ?? 0;
      if (receitaMes <= 0) continue;

      const custo = receitaMes * margemFator;
      const valorForn = custo * pctCusto;
      if (valorForn <= 0) continue;

      const mesPedido = m - leadMeses;

      const distribuir = (mesPag: number, val: number) => {
        const bucket = getBucket(mesPag);
        bucket.valor += val;
        const ex = bucket.fornecedores.get(forn.id);
        if (ex) { ex.valor += val; }
        else { bucket.fornecedores.set(forn.id, { nome: forn.nome, tipo: forn.tipo_fornecedor, valor: val }); }
      };

      if (parcelas.length === 0) {
        // Sem parcelas definidas: assume 100% no pedido
        distribuir(mesPedido, valorForn);
      } else {
        // Distribui por parcela conforme gatilho + dias
        for (const parcela of parcelas) {
          const valorParcela = valorForn * (parcela.pct / 100);
          if (valorParcela <= 0) continue;
          const mesesPag = Math.round(parcela.dias / 30);
          // gatilho=pedido → conta a partir do mês do pedido
          // gatilho=faturamento|entrega → conta a partir do mês de entrega
          const mesPag = parcela.gatilho === "pedido"
            ? mesPedido + mesesPag
            : m + mesesPag;
          distribuir(mesPag, valorParcela);
        }
      }
    }
  }

  // Serializa apenas os meses do ciclo (descarta pré/pós-ciclo)
  return months.map((mes, i) => {
    const b = getBucket(i);
    return {
      mes,
      valor: b.valor,
      fornecedores: [...b.fornecedores.values()].sort((a, z) => z.valor - a.valor),
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPLETUDE DO CADASTRO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica se um fornecedor está 100% cadastrado para entrar no cálculo.
 * Fornecedores importados com pendência ficam visíveis na tela mas não
 * entram em calcBudgetProjection até que o cadastro esteja completo.
 *
 * Critérios obrigatórios:
 *   - nome preenchido
 *   - tipo_fornecedor definido
 *   - prazo_entrega_dias > 0
 *   - pagamento_parcelas com pelo menos 1 parcela cuja soma ≈ 100%
 *   - pelo menos 1 categoria com pct_custo_medio > 0
 */
export function checkCompleteness(forn: SupplyFornecedor): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!forn.nome?.trim()) missing.push("Nome");
  if (!forn.tipo_fornecedor) missing.push("Tipo de fornecedor");
  if (!forn.prazo_entrega_dias || forn.prazo_entrega_dias <= 0) missing.push("Prazo de entrega");
  const parcelas = forn.pagamento_parcelas ?? [];
  if (parcelas.length === 0) {
    missing.push("Condição de pagamento");
  } else {
    const soma = parcelas.reduce((s, p) => s + p.pct, 0);
    if (Math.abs(soma - 100) > 0.5) missing.push("Parcelas de pagamento (soma ≠ 100%)");
  }
  const cats = forn.categorias ?? [];
  if (!cats.some(c => c.pct_custo_medio > 0)) {
    missing.push("% de custo médio em pelo menos uma categoria");
  }
  return { complete: missing.length === 0, missing };
}

/**
 * Soma receita de todos os canais para um array de MonthRevenue
 * (compatível com o formato de CycleValidation)
 */
export function aggregateReceita(
  plannedRevenue: Array<{ month: string; atacado: number; varejo: number; ecommerce: number }>
): { months: string[]; receita: number[] } {
  const months = plannedRevenue.map(r => r.month);
  const receita = plannedRevenue.map(r => r.atacado + r.varejo + r.ecommerce);
  return { months, receita };
}
