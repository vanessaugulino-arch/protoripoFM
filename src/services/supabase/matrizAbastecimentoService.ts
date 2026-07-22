// ─── matrizAbastecimentoService.ts ───────────────────────────────────────────
// CRUD para as tabelas criadas na migration 004_matriz_abastecimento.sql
// Nota: as tabelas abaixo ainda não estão no database.types.ts (gerado antes
// da migration 004). Usamos cast `as any` até que os tipos sejam regenerados
// via `supabase gen types typescript --project-id <id>`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../../lib/supabase";

// Alias tipado para tabelas fora do schema gerado
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════

export type TipoFornecimento =
  | "white_label"
  | "private_label"
  | "producao_propria"
  | "importado";

export type TipoGatilho = "PEDIDO" | "FATURAMENTO" | "ENTREGA";

// ── Hierarquia de produto ────────────────────────────────────────────────────
export interface HierarquiaProduto {
  id: string;
  tenant_id: string;
  divisao: string;
  categoria: string;
  subcategoria: string | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

// ── Fornecedor ───────────────────────────────────────────────────────────────
export interface Fornecedor {
  id: string;
  tenant_id: string;
  codigo_erp: string | null;
  nome: string;
  tipo: TipoFornecimento;
  pais_origem: string | null;
  moeda_padrao: string;
  contato_nome: string | null;
  contato_email: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// ── Condições de pagamento ───────────────────────────────────────────────────
export interface Parcela {
  id?: string;                     // presente só quando lido do DB
  condicao_pagamento_id?: string;
  parcela_numero: number;
  percentual: number;
  tipo_gatilho: TipoGatilho;
  dias_apos_gatilho: number;
}

export interface CondicaoPagamento {
  id: string;
  tenant_id: string;
  descricao: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  parcelas: Parcela[];
}

// ── Matriz de abastecimento ──────────────────────────────────────────────────
export interface MatrizEntry {
  id: string;
  tenant_id: string;
  hierarquia_id: string | null;
  divisao: string;
  categoria: string;
  subcategoria: string | null;
  fornecedor_id: string | null;
  tipo_fornecimento: TipoFornecimento;
  dias_producao: number;
  dias_transito: number;
  lead_time_total: number;
  condicao_pagamento_id: string | null;
  peso_participacao: number;     // % do volume da categoria atribuído a este fornecedor
  moeda: string;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  fornecedor?: Pick<Fornecedor, "id" | "nome" | "tipo">;
  condicao?: Pick<CondicaoPagamento, "id" | "descricao"> & { parcelas: Parcela[] };
}

// ── Modelo Produção/Facção — cabeçalho ───────────────────────────────────────
export interface ProducaoModelo {
  id: string;
  tenant_id: string;
  divisao: string;
  categoria: string;
  subcategoria: string | null;
  nome_modelo: string;
  pct_materia_prima: number;
  condicao_mp_id: string | null;
  mes_corte: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// ── Modelo Produção/Facção — etapas ─────────────────────────────────────────
export interface ProducaoEtapa {
  id: string;
  modelo_id: string;
  tenant_id: string;
  ordem_grupo: number;
  nome_etapa: string | null;
  faccao_nome: string;
  dias_prazo: number;
  condicao_pagamento_id: string | null;
  observacoes: string | null;
  created_at: string;
}

/** Prazo total = soma do maior prazo de cada grupo de ordem (caminho crítico) */
export function calcPrazoTotal(etapas: Pick<ProducaoEtapa, "ordem_grupo" | "dias_prazo">[]): number {
  const groupMax = new Map<number, number>();
  for (const e of etapas) {
    groupMax.set(e.ordem_grupo, Math.max(groupMax.get(e.ordem_grupo) ?? 0, e.dias_prazo));
  }
  return [...groupMax.values()].reduce((s, d) => s + d, 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// HIERARQUIA DE PRODUTO
// ══════════════════════════════════════════════════════════════════════════════

export async function listHierarquiaDb(tenantId: string): Promise<HierarquiaProduto[]> {
  const { data, error } = await db
    .from("hierarquia_produtos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("ordem")
    .order("divisao")
    .order("categoria");
  if (error) throw error;
  return (data ?? []) as HierarquiaProduto[];
}

export async function upsertHierarquiaDb(
  tenantId: string,
  rows: Array<{ divisao: string; categoria: string; subcategoria?: string | null; ordem?: number }>
): Promise<void> {
  const records = rows.map((r, i) => ({
    tenant_id: tenantId,
    categoria: r.categoria,
    divisao: r.divisao,
    // subcategoria é NOT NULL DEFAULT '' — normaliza null/undefined para ''
    // para não violar a constraint e manter o índice único consistente.
    subcategoria: r.subcategoria ?? "",
    ordem: r.ordem ?? i,
    ativo: true,
  }));
  const { error } = await db
    .from("hierarquia_produtos")
    .upsert(records, { onConflict: "tenant_id,divisao,categoria,subcategoria" });
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════════════════════
// FORNECEDORES
// ══════════════════════════════════════════════════════════════════════════════

export async function listFornecedoresDb(tenantId: string): Promise<Fornecedor[]> {
  const { data, error } = await db
    .from("fornecedores")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Fornecedor[];
}

export async function insertFornecedorDb(
  tenantId: string,
  values: Omit<Fornecedor, "id" | "tenant_id" | "created_at" | "updated_at">
): Promise<Fornecedor> {
  const { data, error } = await db
    .from("fornecedores")
    .insert({ ...values, tenant_id: tenantId })
    .select()
    .single();
  if (error) throw error;
  return data as Fornecedor;
}

export async function updateFornecedorDb(
  id: string,
  values: Partial<Omit<Fornecedor, "id" | "tenant_id" | "created_at">>
): Promise<Fornecedor> {
  const { data, error } = await db
    .from("fornecedores")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Fornecedor;
}

export async function deleteFornecedorDb(id: string): Promise<void> {
  const { error } = await db
    .from("fornecedores")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONDIÇÕES DE PAGAMENTO
// ══════════════════════════════════════════════════════════════════════════════

export async function listCondicoesDb(tenantId: string): Promise<CondicaoPagamento[]> {
  const { data, error } = await db
    .from("condicoes_pagamento")
    .select("*, parcelas:condicoes_pagamento_parcelas(*)")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("descricao");
  if (error) throw error;
  return ((data ?? []) as CondicaoPagamento[]).map((row) => ({
    ...row,
    parcelas: (row.parcelas ?? []).sort(
      (a: Parcela, b: Parcela) => a.parcela_numero - b.parcela_numero
    ),
  }));
}

export async function insertCondicaoDb(
  tenantId: string,
  descricao: string,
  parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]
): Promise<CondicaoPagamento> {
  // Valida soma antes de gravar
  const soma = parcelas.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 0.01)
    throw new Error(`Soma dos percentuais deve ser 100%. Atual: ${soma.toFixed(2)}%`);

  // Insere cabeçalho
  const { data: header, error: hErr } = await db
    .from("condicoes_pagamento")
    .insert({ tenant_id: tenantId, descricao })
    .select()
    .single();
  if (hErr) throw hErr;

  // Insere parcelas
  const parcelasRows = parcelas.map((p, i) => ({
    condicao_pagamento_id: (header as CondicaoPagamento).id,
    parcela_numero: i + 1,
    percentual: p.percentual,
    tipo_gatilho: p.tipo_gatilho,
    dias_apos_gatilho: p.dias_apos_gatilho,
  }));
  const { data: pRows, error: pErr } = await db
    .from("condicoes_pagamento_parcelas")
    .insert(parcelasRows)
    .select();
  if (pErr) throw pErr;

  return {
    ...(header as CondicaoPagamento),
    parcelas: ((pRows ?? []) as Parcela[]).sort((a, b) => a.parcela_numero - b.parcela_numero),
  };
}

export async function updateCondicaoDb(
  id: string,
  descricao: string,
  parcelas: Omit<Parcela, "id" | "condicao_pagamento_id">[]
): Promise<CondicaoPagamento> {
  const soma = parcelas.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 0.01)
    throw new Error(`Soma dos percentuais deve ser 100%. Atual: ${soma.toFixed(2)}%`);

  // Atualiza cabeçalho
  const { data: header, error: hErr } = await db
    .from("condicoes_pagamento")
    .update({ descricao })
    .eq("id", id)
    .select()
    .single();
  if (hErr) throw hErr;

  // Remove parcelas antigas e reinsere
  const { error: delErr } = await db
    .from("condicoes_pagamento_parcelas")
    .delete()
    .eq("condicao_pagamento_id", id);
  if (delErr) throw delErr;

  const parcelasRows = parcelas.map((p, i) => ({
    condicao_pagamento_id: id,
    parcela_numero: i + 1,
    percentual: p.percentual,
    tipo_gatilho: p.tipo_gatilho,
    dias_apos_gatilho: p.dias_apos_gatilho,
  }));
  const { data: pRows, error: pErr } = await db
    .from("condicoes_pagamento_parcelas")
    .insert(parcelasRows)
    .select();
  if (pErr) throw pErr;

  return {
    ...(header as CondicaoPagamento),
    parcelas: ((pRows ?? []) as Parcela[]).sort((a, b) => a.parcela_numero - b.parcela_numero),
  };
}

export async function deleteCondicaoDb(id: string): Promise<void> {
  const { error } = await db
    .from("condicoes_pagamento")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════════════════════
// MATRIZ DE ABASTECIMENTO
// ══════════════════════════════════════════════════════════════════════════════

export async function listMatrizDb(tenantId: string): Promise<MatrizEntry[]> {
  const { data, error } = await db
    .from("matriz_abastecimento")
    .select(`
      *,
      fornecedor:fornecedores(id, nome, tipo),
      condicao:condicoes_pagamento(
        id, descricao,
        parcelas:condicoes_pagamento_parcelas(*)
      )
    `)
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("divisao")
    .order("categoria")
    .order("subcategoria");
  if (error) throw error;
  return ((data ?? []) as MatrizEntry[]).map((row) => ({
    ...row,
    condicao: row.condicao
      ? {
          ...row.condicao,
          parcelas: (row.condicao.parcelas ?? []).sort(
            (a: Parcela, b: Parcela) => a.parcela_numero - b.parcela_numero
          ),
        }
      : null,
  }));
}

export async function insertMatrizEntryDb(
  tenantId: string,
  values: Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "updated_at" | "fornecedor" | "condicao">
): Promise<MatrizEntry> {
  const { data, error } = await db
    .from("matriz_abastecimento")
    .insert({ ...values, tenant_id: tenantId })
    .select()
    .single();
  if (error) throw error;
  return data as MatrizEntry;
}

export async function updateMatrizEntryDb(
  id: string,
  values: Partial<Omit<MatrizEntry, "id" | "tenant_id" | "lead_time_total" | "created_at" | "fornecedor" | "condicao">>
): Promise<MatrizEntry> {
  const { data, error } = await db
    .from("matriz_abastecimento")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as MatrizEntry;
}

export async function deleteMatrizEntryDb(id: string): Promise<void> {
  const { error } = await db
    .from("matriz_abastecimento")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODELO PRODUÇÃO / FACÇÃO
// ══════════════════════════════════════════════════════════════════════════════

export async function listModelosProducaoDb(tenantId: string): Promise<ProducaoModelo[]> {
  const { data, error } = await db
    .from("matriz_producao_modelos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("divisao")
    .order("categoria")
    .order("nome_modelo");
  if (error) throw error;
  return (data ?? []) as ProducaoModelo[];
}

export async function upsertModeloProducaoDb(
  tenantId: string,
  values: Omit<ProducaoModelo, "id" | "tenant_id" | "created_at" | "updated_at"> & { id?: string }
): Promise<ProducaoModelo> {
  const row = { ...values, tenant_id: tenantId, updated_at: new Date().toISOString() };
  const { data, error } = values.id
    ? await db.from("matriz_producao_modelos").update(row).eq("id", values.id).select().single()
    : await db.from("matriz_producao_modelos").insert(row).select().single();
  if (error) throw error;
  return data as ProducaoModelo;
}

export async function deleteModeloProducaoDb(id: string): Promise<void> {
  const { error } = await db
    .from("matriz_producao_modelos")
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}

// ── Etapas ────────────────────────────────────────────────────────────────────

export async function listEtapasByModeloDb(modeloId: string): Promise<ProducaoEtapa[]> {
  const { data, error } = await db
    .from("matriz_producao_etapas")
    .select("*")
    .eq("modelo_id", modeloId)
    .order("ordem_grupo")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ProducaoEtapa[];
}

/** Substitui TODAS as etapas de um modelo (delete + re-insert batch) */
export async function replaceEtapasDb(
  modeloId: string,
  tenantId: string,
  etapas: Omit<ProducaoEtapa, "id" | "modelo_id" | "tenant_id" | "created_at">[]
): Promise<ProducaoEtapa[]> {
  // Delete existing
  const { error: delErr } = await db
    .from("matriz_producao_etapas")
    .delete()
    .eq("modelo_id", modeloId);
  if (delErr) throw delErr;
  if (etapas.length === 0) return [];

  // Insert new
  const rows = etapas.map(e => ({ ...e, modelo_id: modeloId, tenant_id: tenantId }));
  const { data, error } = await db
    .from("matriz_producao_etapas")
    .insert(rows)
    .select();
  if (error) throw error;
  return (data ?? []) as ProducaoEtapa[];
}
