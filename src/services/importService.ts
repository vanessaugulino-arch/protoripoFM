// ─── importService.ts ─────────────────────────────────────────────────────────
// Serviço de importação de planilhas: configuração de campos, geração de
// templates CSV, parsing (CSV + XLSX), validação e persistência no Supabase.
//
// Templates alinhados às tabelas reais do banco (v2):
//   catalog   → products            (sku · nome · temporada · coleção separados
//                                    · risco · faixa de preço · cor · material)
//   sales     → sales_history       (sku · dia · canal = trio obrigatório)
//   orders    → purchase_orders     (+ custo unitário + data entrega real)
//   inventory → inventory_snapshots (+ localização / CD)
//   hierarchy → products (update)   (enriquece hierarquia via join por SKU)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ImportDataType =
  | "catalog"
  | "sales"
  | "orders"
  | "inventory"
  | "hierarchy";

export type FieldValueType =
  | "text"
  | "number"
  | "date"
  | "optional_text"
  | "optional_number"
  | "optional_date"
  | "enum";

export interface SystemField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  valueType: FieldValueType;
  sampleValue: string;
  enumValues?: string[];
  /** Sinônimos extras para auto-mapeamento de cabeçalho */
  match?: string[];
}

export interface ImportTypeConfig {
  label: string;
  description: string;
  icon: string;
  fields: SystemField[];
}

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface ValidationResult {
  validRows: number;
  invalidRows: number;
  errors: { row: number; field: string; value: string; expected: string }[];
}

export interface ImportResult {
  dataType: ImportDataType;
  fileName: string;
  totalRows: number;
  importedRows: number;
  errors: number;
}

// ─── Mapeamento de cores: cor bruta do fornecedor → grupo normalizado ─────────
//
// A importação recebe a cor como cadastrada no fornecedor (ex: "Telha") e
// grava tanto a cor original quanto o grupo calculado automaticamente.
//
// Para adicionar novas cores: insira a chave em minúsculo/sem acento e o
// valor canônico PT-BR que aparecerá nos filtros e análises de sortimento.
// ─────────────────────────────────────────────────────────────────────────────

export const COLOR_GROUP_MAP: Record<string, string> = {
  // ── Branco / Off-White ──────────────────────────────────────────────────
  branco: "Branco",
  "off-white": "Branco",
  offwhite: "Branco",
  cru: "Branco",
  marfim: "Branco",
  gelo: "Branco",
  leite: "Branco",
  perola: "Branco",
  vanilla: "Branco",
  creme: "Branco",
  neve: "Branco",
  algodao: "Branco",
  // ── Preto ───────────────────────────────────────────────────────────────
  preto: "Preto",
  // ── Cinza ───────────────────────────────────────────────────────────────
  cinza: "Cinza",
  grafite: "Cinza",
  prata: "Cinza",
  fume: "Cinza",
  mescla: "Cinza",
  chumbo: "Cinza",
  // ── Azul Marinho ────────────────────────────────────────────────────────
  marinho: "Azul Marinho",
  navy: "Azul Marinho",
  indigo: "Azul Marinho",
  // ── Azul ────────────────────────────────────────────────────────────────
  azul: "Azul",
  royal: "Azul",
  celeste: "Azul",
  jeans: "Azul",
  denim: "Azul",
  safira: "Azul",
  cobalto: "Azul",
  turquesa: "Azul",
  tiffany: "Azul",
  ceu: "Azul",
  serenity: "Azul",
  // ── Verde ───────────────────────────────────────────────────────────────
  verde: "Verde",
  musgo: "Verde",
  oliva: "Verde",
  sage: "Verde",
  menta: "Verde",
  esmeralda: "Verde",
  militar: "Verde",
  pistache: "Verde",
  floresta: "Verde",
  kaki: "Verde",
  caqui: "Verde",
  salvia: "Verde",
  // ── Vermelho ────────────────────────────────────────────────────────────
  vermelho: "Vermelho",
  rubi: "Vermelho",
  cereja: "Vermelho",
  escarlate: "Vermelho",
  tomate: "Vermelho",
  // ── Bordô / Vinho ───────────────────────────────────────────────────────
  bordo: "Bordô",
  borgonha: "Bordô",
  vinho: "Bordô",
  marsala: "Bordô",
  sangue: "Bordô",
  // ── Rosa ────────────────────────────────────────────────────────────────
  rosa: "Rosa",
  blush: "Rosa",
  flamingo: "Rosa",
  pink: "Rosa",
  bebe: "Rosa",
  chiclete: "Rosa",
  quartzo: "Rosa",
  millennial: "Rosa",
  // ── Nude / Bege ─────────────────────────────────────────────────────────
  nude: "Bege/Nude",
  bege: "Bege/Nude",
  areia: "Bege/Nude",
  champagne: "Bege/Nude",
  aveia: "Bege/Nude",
  linho: "Bege/Nude",
  camel: "Bege/Nude",
  toffee: "Bege/Nude",
  amendoa: "Bege/Nude",
  // ── Laranja ─────────────────────────────────────────────────────────────
  laranja: "Laranja",
  pessego: "Laranja",
  cenoura: "Laranja",
  abobora: "Laranja",
  damasco: "Laranja",
  tangerina: "Laranja",
  papaya: "Laranja",
  // ── Salmão ──────────────────────────────────────────────────────────────
  salmao: "Salmão",
  salmon: "Salmão",
  coral: "Salmão",
  // ── Marrom Médio (tons terrosos quentes) ────────────────────────────────
  telha: "Marrom Médio",
  terracota: "Marrom Médio",
  ferrugem: "Marrom Médio",
  tijolo: "Marrom Médio",
  enferrujado: "Marrom Médio",
  argila: "Marrom Médio",
  adobe: "Marrom Médio",
  siena: "Marrom Médio",
  ocre: "Marrom Médio",
  ambar: "Marrom Médio",
  // ── Marrom ──────────────────────────────────────────────────────────────
  marrom: "Marrom",
  chocolate: "Marrom",
  cafe: "Marrom",
  terra: "Marrom",
  castanho: "Marrom",
  mogno: "Marrom",
  tabaco: "Marrom",
  canela: "Marrom",
  // ── Amarelo ─────────────────────────────────────────────────────────────
  amarelo: "Amarelo",
  mostarda: "Amarelo",
  canario: "Amarelo",
  sol: "Amarelo",
  limao: "Amarelo",
  milho: "Amarelo",
  // ── Roxo / Lilás ────────────────────────────────────────────────────────
  roxo: "Roxo/Lilás",
  lilas: "Roxo/Lilás",
  lavanda: "Roxo/Lilás",
  ametista: "Roxo/Lilás",
  violeta: "Roxo/Lilás",
  ameixa: "Roxo/Lilás",
  uva: "Roxo/Lilás",
  orquidea: "Roxo/Lilás",
  // ── Dourado / Metalizado ────────────────────────────────────────────────
  dourado: "Dourado/Metalizado",
  ouro: "Dourado/Metalizado",
  bronze: "Dourado/Metalizado",
  cobre: "Dourado/Metalizado",
  metalico: "Dourado/Metalizado",
  glitter: "Dourado/Metalizado",
  // ── Estampado / Multicolor ──────────────────────────────────────────────
  estampado: "Estampado/Multicolor",
  multicolor: "Estampado/Multicolor",
  xadrez: "Estampado/Multicolor",
  listrado: "Estampado/Multicolor",
  floral: "Estampado/Multicolor",
  geometrico: "Estampado/Multicolor",
  animal: "Estampado/Multicolor",
};

/** Normaliza string: minúsculo, sem acentos, sem hífens/espaços extras. */
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]+/g, "")
    .trim();
}

/**
 * Mapeia a cor bruta do fornecedor para um grupo de cor canônico.
 * Estratégia: 1) exato → 2) parcial → 3) fallback capitalizado.
 */
export function mapColorGroup(rawColor: string): string {
  if (!rawColor?.trim()) return "";
  const norm = normalizeStr(rawColor);

  // 1. Exato
  if (COLOR_GROUP_MAP[norm]) return COLOR_GROUP_MAP[norm];

  // 2. Parcial — a string normalizada contém (ou é contida por) alguma chave
  for (const key of Object.keys(COLOR_GROUP_MAP)) {
    if (norm.includes(key) || key.includes(norm)) {
      return COLOR_GROUP_MAP[key];
    }
  }

  // 3. Fallback: capitaliza o valor original
  const t = rawColor.trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// ─── Configuração de campos por tipo ─────────────────────────────────────────

export const IMPORT_CONFIG: Record<ImportDataType, ImportTypeConfig> = {

  // ── Cadastro de Produtos → public.products ───────────────────────────────
  catalog: {
    label: "Cadastro de Produtos",
    description:
      "Catálogo completo: hierarquia, preços, temporada e coleção separados, nível de risco, faixa de preço, cor e material. O grupo de cor é calculado automaticamente.",
    icon: "📦",
    fields: [
      // Identificação
      {
        key: "sku",
        label: "Código (SKU)",
        description: "Código único do produto no ERP — chave de upsert",
        required: true,
        valueType: "text",
        sampleValue: "SKU001",
      },
      {
        key: "name",
        label: "Descrição / Nome",
        description: "Nome completo do produto",
        required: true,
        valueType: "text",
        sampleValue: "Camiseta Básica Gola V",
      },
      {
        key: "model",
        label: "Modelo / Referência",
        description: "Código interno ou referência do modelo",
        required: false,
        valueType: "optional_text",
        sampleValue: "REF-2025-001",
      },
      // Hierarquia
      {
        key: "division",
        label: "Divisão",
        description: "Ex: Feminino, Masculino, Infantil, Acessórios",
        required: false,
        valueType: "optional_text",
        sampleValue: "Feminino",
      },
      {
        key: "category",
        label: "Categoria",
        description: "Ex: Tops, Bottoms, Vestidos, Calçados",
        required: false,
        valueType: "optional_text",
        sampleValue: "Tops",
      },
      {
        key: "subcategory",
        label: "Subcategoria",
        description: "Ex: Camisetas, Blusas, Regatas",
        required: false,
        valueType: "optional_text",
        sampleValue: "Camisetas",
      },
      // Preços
      {
        key: "price_sale",
        label: "Preço de Venda (R$)",
        description: "Preço cheio ao consumidor. Use ponto decimal.",
        required: true,
        valueType: "number",
        sampleValue: "89.90",
      },
      {
        key: "price_cost",
        label: "Custo (R$)",
        description: "Custo de fabricação ou compra. Use ponto decimal.",
        required: true,
        valueType: "number",
        sampleValue: "32.00",
      },
      // Coleção (campos SEPARADOS)
      {
        key: "season",
        label: "Temporada",
        description: "Nome da temporada (deve coincidir com o cadastro de temporadas do sistema). Ex: Verão 2026",
        required: false,
        valueType: "optional_text",
        sampleValue: "Verão 2026",
      },
      {
        key: "collection_name",
        label: "Coleção",
        description: "Nome da coleção dentro da temporada. Ex: Drop Primavera, Lançamento Outono",
        required: false,
        valueType: "optional_text",
        sampleValue: "Drop Primavera",
      },
      // Enriquecimento estratégico
      {
        key: "risk_level",
        label: "Nível de Risco",
        description:
          "Sustentador de Margem = estrutura básica com variações de cor ou detalhe. Motor de Giro = moda/tendência de temporada, alto volume. Ícone de Marca = statement da marca, alta exposição editorial. Qualquer perfil pode estar em P1/P2/P3.",
        required: false,
        valueType: "enum",
        sampleValue: "Sustentador de Margem",
        enumValues: ["Sustentador de Margem", "Motor de Giro", "Ícone de Marca"],
      },
      {
        key: "price_tier",
        label: "Faixa de Preço",
        description: "Faixa de preço do produto. P1 = entrada (inclui produtos que seriam chamados de 'porta de entrada'); P2 = médio; P3 = premium/alto.",
        required: false,
        valueType: "enum",
        sampleValue: "P2",
        enumValues: ["P1", "P2", "P3"],
      },
      // Cor (cor bruta; color_group é auto-calculado)
      {
        key: "color",
        label: "Cor (nome do fornecedor)",
        description:
          "Cor como registrada pelo fornecedor (ex: Telha, Terracota, Off-White). O sistema mapeia automaticamente para um grupo de cor (ex: Marrom Médio, Branco).",
        required: false,
        valueType: "optional_text",
        sampleValue: "Telha",
      },
      // Material
      {
        key: "material",
        label: "Material Principal",
        description: "Ex: Algodão 100%, Poliéster, Couro, Misto",
        required: false,
        valueType: "optional_text",
        sampleValue: "Algodão 100%",
      },
    ],
  },

  // ── Histórico de Vendas → public.sales_history ───────────────────────────
  // Trio obrigatório: produto (sku) · dia (sale_date) · canal (channel)
  sales: {
    label: "Histórico de Vendas",
    description:
      "Vendas por SKU, data e canal. Trio obrigatório: produto · dia · canal. Alimenta indicadores de receita, desconto e sell-through.",
    icon: "📊",
    fields: [
      // Trio obrigatório
      {
        key: "sku",
        label: "Código (SKU)",
        description: "Código do produto vendido — deve existir no cadastro",
        required: true,
        valueType: "text",
        sampleValue: "SKU001",
        match: ["codigo do produto", "cod produto", "codigo"],
      },
      {
        key: "sale_date",
        label: "Data da Venda",
        description: "Data da transação. Formatos aceitos: AAAA-MM-DD ou DD/MM/AAAA",
        required: true,
        valueType: "date",
        sampleValue: "2024-03-15",
        match: ["data da venda", "data venda"],
      },
      {
        key: "channel",
        label: "Canal de Venda",
        description: "Ex: Loja Física, E-commerce, Marketplace, Atacado, Franquia",
        required: false,
        valueType: "optional_text",
        sampleValue: "Loja Física",
        match: ["canal"],
      },
      // Métricas obrigatórias
      {
        key: "quantity",
        label: "Quantidade Vendida",
        description: "Número de unidades vendidas (inteiro)",
        required: true,
        valueType: "number",
        sampleValue: "3",
        match: ["quantidade", "qtd", "qty"],
      },
      {
        key: "revenue_gross",
        label: "Receita Bruta / Valor Bruto (R$)",
        description: "Total bruto da venda (qty × preço cheio). Use ponto decimal.",
        required: true,
        valueType: "number",
        sampleValue: "269.70",
        match: ["valor bruto", "receita bruta", "vl bruto"],
      },
      // Métricas calculadas / opcionais
      {
        key: "revenue_net",
        label: "Valor da Venda com Desconto (R$)",
        description: "Receita após desconto, antes do imposto. Ex: 'Valor da Venda (Com Desconto)'.",
        required: false,
        valueType: "optional_number",
        sampleValue: "242.70",
        // Frases longas (substring) evitam matchear "Valor Bruto (Sem Desconto)"
        match: ["valor da venda com desconto", "valor com desconto", "receita liquida pre imposto"],
      },
      {
        key: "discount_value",
        label: "Desconto (R$)",
        description: "Valor total de desconto concedido. Use 0 se não houve desconto.",
        required: false,
        valueType: "optional_number",
        sampleValue: "27.00",
        // SEM "desconto" isolado — evita colisão com "Valor Bruto (Sem Desconto)"
        match: ["desconto aplicado", "desconto concedido", "valor desconto"],
      },
      {
        key: "tax_value",
        label: "Imposto (R$)",
        description: "Valor do imposto incidido sobre a venda.",
        required: false,
        valueType: "optional_number",
        sampleValue: "43.69",
        match: ["imposto", "tributo"],
      },
      {
        key: "revenue_net_post_tax",
        label: "Venda Líquida Pós-Imposto (R$)",
        description: "Receita líquida após desconto e impostos. Também chamado de 'Venda Líquida'.",
        required: false,
        valueType: "optional_number",
        sampleValue: "199.01",
        match: ["venda liquida", "liquida pos imposto"],
      },
      {
        key: "price_realized",
        label: "Preço Realizado por Unidade (R$)",
        description:
          "Preço efetivo por unidade após desconto. Se omitido, calculado como valor_com_desconto / quantidade.",
        required: false,
        valueType: "optional_number",
        sampleValue: "80.90",
        match: ["preco realizado", "preco unitario realizado"],
      },
      {
        key: "colecao",
        label: "Coleção / Temporada Ativa",
        description: "Nome da coleção ou temporada ativa no momento da venda. Ex: PV24, IV25",
        required: false,
        valueType: "optional_text",
        sampleValue: "PV24",
        match: ["temporada ativa", "colecao ativa"],
      },
      {
        key: "category",
        label: "Categoria",
        description: "Categoria do produto na hierarquia de sortimento.",
        required: false,
        valueType: "optional_text",
        sampleValue: "Vestidos",
        // Word-boundary: "categoria" isolada não bate com "Subcategoria"
        match: ["categoria"],
      },
      {
        key: "type",
        label: "Tipo de Venda",
        description: "venda ou troca. Outros valores são normalizados automaticamente para 'venda'.",
        required: false,
        valueType: "optional_text",
        sampleValue: "venda",
        match: ["tipo de venda", "tipo"],
      },
    ],
  },

  // ── Ordens de Produção & Compra → public.purchase_orders ─────────────────
  orders: {
    label: "Ordens de Produção & Compra",
    description:
      "Ordens de produção ou compra. Alimenta o módulo de Validação de Ciclo e Matriz de Abastecimento.",
    icon: "🚚",
    fields: [
      {
        key: "order_number",
        label: "Número da Ordem",
        description: "Identificador único da ordem (OC, OP, etc.)",
        required: true,
        valueType: "text",
        sampleValue: "OC-2025-001",
      },
      {
        key: "sku",
        label: "Código (SKU)",
        description: "Código do produto da ordem",
        required: true,
        valueType: "text",
        sampleValue: "SKU001",
      },
      {
        key: "order_date",
        label: "Data da Ordem",
        description: "Data de emissão da ordem. Formatos: AAAA-MM-DD ou DD/MM/AAAA",
        required: true,
        valueType: "date",
        sampleValue: "2025-01-10",
      },
      {
        key: "quantity_ordered",
        label: "Quantidade da Ordem",
        description: "Número total de unidades da ordem",
        required: true,
        valueType: "number",
        sampleValue: "200",
      },
      {
        key: "unit_cost",
        label: "Custo Unitário (R$)",
        description: "Custo por unidade nesta ordem. Use ponto decimal.",
        required: false,
        valueType: "optional_number",
        sampleValue: "32.00",
      },
      {
        key: "supplier",
        label: "Fornecedor",
        description: "Nome do fornecedor ou fábrica responsável",
        required: false,
        valueType: "optional_text",
        sampleValue: "Confecções ABC",
      },
      {
        key: "expected_delivery",
        label: "Previsão de Entrega",
        description: "Data prevista de entrega. Formato: AAAA-MM-DD",
        required: false,
        valueType: "optional_date",
        sampleValue: "2025-04-01",
      },
      {
        key: "delivery_date",
        label: "Data de Entrega Real",
        description: "Data em que a ordem foi efetivamente entregue (deixe vazio se pendente)",
        required: false,
        valueType: "optional_date",
        sampleValue: "2025-04-05",
      },
      {
        key: "status",
        label: "Status",
        description: "Situação atual: Em produção, Enviado, Entregue, Cancelado",
        required: false,
        valueType: "optional_text",
        sampleValue: "Em produção",
      },
    ],
  },

  // ── Estoque Histórico → public.inventory_snapshots ───────────────────────
  inventory: {
    label: "Estoque Histórico",
    description:
      "Posição de estoque por SKU em uma data específica (idealmente 1º ou último dia do mês). Alimenta cobertura, giro e estoque médio.",
    icon: "🏭",
    fields: [
      {
        key: "sku",
        label: "Código (SKU)",
        description: "Código do produto",
        required: true,
        valueType: "text",
        sampleValue: "SKU001",
      },
      {
        key: "snapshot_date",
        label: "Data da Posição de Estoque",
        description: "Data da leitura. Formatos: AAAA-MM-DD ou DD/MM/AAAA",
        required: true,
        valueType: "date",
        sampleValue: "2024-03-31",
      },
      {
        key: "quantity",
        label: "Quantidade em Estoque",
        description: "Número de unidades disponíveis",
        required: true,
        valueType: "number",
        sampleValue: "45",
      },
      {
        key: "value_cost",
        label: "Valor ao Custo (R$)",
        description: "Estoque avaliado pelo custo total. Use ponto decimal.",
        required: false,
        valueType: "optional_number",
        sampleValue: "1440.00",
      },
      {
        key: "value_sale",
        label: "Valor a Preço de Venda (R$)",
        description: "Estoque avaliado pelo preço de venda total. Use ponto decimal.",
        required: false,
        valueType: "optional_number",
        sampleValue: "4045.50",
      },
      {
        key: "location",
        label: "Localização / CD",
        description: "Loja, CD ou armazém onde o estoque está alocado",
        required: false,
        valueType: "optional_text",
        sampleValue: "CD São Paulo",
      },
    ],
  },

  // ── Hierarquia de Códigos ERP → public.products (update) ────────────────
  hierarchy: {
    label: "Hierarquia de Códigos ERP",
    description:
      "Enriquece o cadastro de produtos com a estrutura de hierarquia do ERP (join por SKU). Útil quando o ERP exporta hierarquia separada do cadastro.",
    icon: "🏗️",
    fields: [
      {
        key: "sku",
        label: "Código (SKU) — chave de join",
        description: "Deve ser idêntico ao código no cadastro de produtos",
        required: true,
        valueType: "text",
        sampleValue: "SKU001",
      },
      {
        key: "level1",
        label: "Divisão (Nível 1)",
        description: "Nível mais alto da hierarquia. Ex: Feminino, Masculino, Infantil",
        required: true,
        valueType: "text",
        sampleValue: "Feminino",
      },
      {
        key: "level2",
        label: "Categoria (Nível 2)",
        description: "Segundo nível. Ex: Tops, Bottoms, Vestidos",
        required: false,
        valueType: "optional_text",
        sampleValue: "Tops",
      },
      {
        key: "level3",
        label: "Subcategoria (Nível 3)",
        description: "Terceiro nível. Ex: Camisetas, Blusas, Regatas",
        required: false,
        valueType: "optional_text",
        sampleValue: "Camisetas",
      },
      {
        key: "level4",
        label: "Subgrupo (Nível 4)",
        description: "Quarto nível quando aplicável",
        required: false,
        valueType: "optional_text",
        sampleValue: "",
      },
    ],
  },
};

// ─── Geração de template CSV ───────────────────────────────────────────────────

export function generateTemplateCSV(dataType: ImportDataType): string {
  const config  = IMPORT_CONFIG[dataType];
  const headers = config.fields.map(f => f.label);
  const sample  = config.fields.map(f => f.sampleValue);

  const rows = [headers, sample];
  return rows
    .map(row =>
      row
        .map(cell =>
          cell.includes(",") || cell.includes('"')
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        )
        .join(",")
    )
    .join("\n");
}

export function downloadTemplate(dataType: ImportDataType): void {
  const csv  = generateTemplateCSV(dataType);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM p/ Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `modelo_${dataType}_fashionmind.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Parsing de arquivos ────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current  = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let text = e.target?.result as string;
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
          const lines   = text.split(/\r?\n/).filter(l => l.trim());
          if (!lines.length) { reject(new Error("Arquivo vazio")); return; }
          const headers = parseCSVLine(lines[0]);
          const rows    = lines.slice(1).map(l => parseCSVLine(l));
          resolve({ headers, rows, totalRows: rows.length });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsText(file, "utf-8");
    });
  }

  // XLSX / XLS
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX     = await import("xlsx");
        const data     = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
        if (!raw.length) { reject(new Error("Planilha vazia")); return; }
        const headers = (raw[0] as unknown[]).map(h => String(h ?? "").trim());
        const rows    = raw.slice(1).map(row =>
          (row as unknown[]).map(cell => {
            if (cell instanceof Date) return cell.toISOString().slice(0, 10);
            return String(cell ?? "").trim();
          })
        );
        resolve({ headers, rows, totalRows: rows.length });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Validação de linhas ────────────────────────────────────────────────────────

function isValidDate(value: string): boolean {
  if (!value) return false;
  if (!isNaN(new Date(value).getTime())) return true;
  const parts = value.split(/[\/\-\.]/);
  return parts.length === 3 && !!parts.find(p => p.length === 4);
}

function isValidNumber(value: string): boolean {
  return !!value && !isNaN(parseFloat(value.replace(",", ".")));
}

function validateFieldValue(value: string, field: SystemField): boolean {
  const empty = !value || !value.trim();
  if (empty) {
    return field.valueType.startsWith("optional") ||
      (field.valueType === "enum" && !field.required);
  }
  switch (field.valueType) {
    case "number":
    case "optional_number":
      return isValidNumber(value);
    case "date":
    case "optional_date":
      return isValidDate(value);
    case "enum":
      return !field.required ||
        (field.enumValues ?? []).some(
          v => v.toLowerCase() === value.trim().toLowerCase()
        );
    default:
      return true;
  }
}

export function validateRows(
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
  fields: SystemField[],
): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  let invalidRows = 0;

  rows.forEach((row, rowIdx) => {
    let rowHasError = false;
    fields.forEach(field => {
      const spreadsheetHeader = mapping[field.key];
      if (!spreadsheetHeader) return;
      const colIdx = headers.indexOf(spreadsheetHeader);
      const value  = colIdx >= 0 ? (row[colIdx] ?? "") : "";
      if (!validateFieldValue(value, field)) {
        const expected =
          field.valueType.includes("date")   ? "data (AAAA-MM-DD ou DD/MM/AAAA)" :
          field.valueType.includes("number") ? "número decimal (use ponto)"       :
          field.valueType === "enum"         ? `um de: ${field.enumValues?.join(" | ")}` :
          "texto";
        errors.push({ row: rowIdx + 2, field: field.label, value, expected });
        rowHasError = true;
      }
    });
    if (rowHasError) invalidRows++;
  });

  return { validRows: rows.length - invalidRows, invalidRows, errors };
}

// ─── Normalização de valores ────────────────────────────────────────────────────

function parseNum(value: string): number | null {
  if (!value?.trim()) return null;
  const n = parseFloat(value.replace(",", "."));
  return isNaN(n) ? null : n;
}

function parseDateStr(value: string): string | null {
  if (!value?.trim()) return null;
  const iso = new Date(value);
  if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  // DD/MM/AAAA
  const m = value.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2]}-${m[1]}`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function getCellValue(
  row: string[],
  headers: string[],
  mappedHeader: string | undefined
): string {
  if (!mappedHeader) return "";
  const idx = headers.indexOf(mappedHeader);
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

// ─── Persistência no Supabase ──────────────────────────────────────────────────

// ─── Sincronizar hierarquia/temporadas/coleções após import de catálogo ─────────
async function syncFromCatalogImport(tenantId: string): Promise<void> {
  try {
    // 1. Extrair hierarquia única de produtos
    const { data: prodRows } = await supabase
      .from("products")
      .select("division, category, subcategory")
      .eq("tenant_id", tenantId)
      .not("division", "is", null);

    if (prodRows && prodRows.length > 0) {
      // Monta árvore HierNode[]
      const divMap = new Map<string, Map<string, Set<string>>>();
      for (const p of prodRows as any[]) {
        if (!p.division) continue;
        if (!divMap.has(p.division)) divMap.set(p.division, new Map());
        const catMap = divMap.get(p.division)!;
        if (p.category) {
          if (!catMap.has(p.category)) catMap.set(p.category, new Set());
          if (p.subcategory) catMap.get(p.category)!.add(p.subcategory);
        }
      }

      let nodeId = 1;
      const hierNodes: any[] = [];
      for (const [div, cats] of divMap.entries()) {
        const divId = String(nodeId++);
        hierNodes.push({ id: divId, label: div, level: 0, children: [] });
        const divNode = hierNodes[hierNodes.length - 1];
        for (const [cat, subs] of cats.entries()) {
          const catId = String(nodeId++);
          divNode.children.push({ id: catId, label: cat, level: 1, children: [] });
          const catNode = divNode.children[divNode.children.length - 1];
          for (const sub of subs) {
            catNode.children.push({ id: String(nodeId++), label: sub, level: 2, children: [] });
          }
        }
      }

      await supabase.from("operation_settings").upsert(
        {
          tenant_id: tenantId,
          hier_ordem: JSON.stringify(hierNodes),
          hier_divisao_ativa: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );
    }

    // 2. Extrair temporadas únicas
    const { data: seasRows } = await supabase
      .from("products")
      .select("season")
      .eq("tenant_id", tenantId)
      .not("season", "is", null);

    if (seasRows && seasRows.length > 0) {
      const uniqueSeasons = [...new Set((seasRows as any[]).map(r => r.season as string).filter(Boolean))];
      for (const sName of uniqueSeasons) {
        // Tenta extrair ano do nome da temporada
        const yearMatch = sName.match(/\d{4}/);
        const fiscalYear = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
        const isVerao = /ver[ãa]o/i.test(sName);
        await (supabase as any).from("seasons").upsert(
          {
            tenant_id: tenantId,
            name: sName,
            fiscal_year: fiscalYear,
            tipo: isVerao ? "verao" : "inverno",
            month_start: isVerao ? "07" : "01",
            month_end: isVerao ? "12" : "06",
            auto_generated: false,
          },
          { onConflict: "tenant_id,name" }
        );
      }
    }

    // 3. Extrair coleções únicas
    const { data: collRows } = await supabase
      .from("products")
      .select("collection_name, season")
      .eq("tenant_id", tenantId)
      .not("collection_name", "is", null);

    if (collRows && collRows.length > 0) {
      const uniqueColls = [...new Map(
        (collRows as any[])
          .filter(r => r.collection_name)
          .map(r => [`${r.season}|${r.collection_name}`, r])
      ).values()];

      for (const c of uniqueColls) {
        // Busca o id da temporada pelo nome
        const { data: seasData } = await (supabase as any)
          .from("seasons")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("name", c.season)
          .maybeSingle();

        if (!seasData?.id) continue;

        // Datas placeholder — o usuário ajusta em OperationSettings
        const placeholderStart = `${new Date().getFullYear()}-01-01`;
        const placeholderEnd   = `${new Date().getFullYear()}-12-31`;
        await supabase.from("collections").upsert(
          {
            tenant_id: tenantId,
            season_id: seasData.id,
            name: c.collection_name,
            start_date: placeholderStart,
            end_date:   placeholderEnd,
            lead_time_days: 45,
          },
          { onConflict: "tenant_id,season_id,name" }
        ).then(() => {/* fire-and-forget */}, () => {/* se falhar ignora */});
      }
    }
  } catch (e) {
    console.warn("[syncFromCatalogImport] erro não crítico:", e);
  }
}

export async function persistImport(
  tenantId: string,
  dataType: ImportDataType,
  parsed: ParsedFile,
  mapping: Record<string, string>,
): Promise<ImportResult> {
  // Guard: tenantId obrigatório
  if (!tenantId || tenantId.length < 10) {
    throw new Error("Tenant não identificado. Faça login novamente antes de importar dados.");
  }

  const { headers, rows } = parsed;
  const get = (row: string[], key: string) =>
    getCellValue(row, headers, mapping[key]);

  let importedRows = 0;
  let errors       = 0;

  const dataRows = rows.filter(r => r.some(c => c.trim() !== ""));

  // ── Cadastro de Produtos ─────────────────────────────────────────────────
  if (dataType === "catalog") {
    const records = dataRows
      .map(row => {
        const rawColor = get(row, "color");
        return {
          tenant_id:       tenantId,
          sku:             get(row, "sku"),
          name:            get(row, "name"),
          model:           get(row, "model")           || null,
          division:        get(row, "division")        || null,
          category:        get(row, "category")        || null,
          subcategory:     get(row, "subcategory")     || null,
          price_sale:      parseNum(get(row, "price_sale")),
          price_cost:      parseNum(get(row, "price_cost")),
          season:          get(row, "season")          || null,
          collection_name: get(row, "collection_name") || null,
          risk_level:      get(row, "risk_level")      || null,
          price_tier:      get(row, "price_tier")      || null,
          color:           rawColor                    || null,
          color_group:     rawColor ? (mapColorGroup(rawColor) || null) : null,
          material:        get(row, "material")        || null,
          source:          "import",
          attributes:      {},
          updated_at:      new Date().toISOString(),
        };
      })
      .filter(r => r.sku && r.name);

    const BATCH = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      const { error } = await supabase
        .from("products")
        .upsert(records.slice(i, i + BATCH), { onConflict: "tenant_id,sku" });
      if (error) errors += Math.min(BATCH, records.length - i);
      else importedRows  += Math.min(BATCH, records.length - i);
    }

    // Sincronizar hierarquia + temporadas + coleções com base nos produtos importados
    if (importedRows > 0) {
      await syncFromCatalogImport(tenantId);
    }

  // ── Histórico de Vendas ──────────────────────────────────────────────────
  } else if (dataType === "sales") {
    const records = dataRows
      .map(row => {
        const revenueGross  = parseNum(get(row, "revenue_gross"))  ?? 0;
        const discountValue = parseNum(get(row, "discount_value")) ?? 0;
        // revenue_net: usa valor mapeado se disponível, senão calcula
        const revenueNet    = parseNum(get(row, "revenue_net")) ?? (revenueGross - discountValue);
        const quantity      = parseNum(get(row, "quantity"))       ?? 0;
        const priceRealized =
          parseNum(get(row, "price_realized")) ??
          (quantity > 0 ? revenueNet / quantity : null);
        // type: normaliza para minúsculo para satisfazer check constraint ('venda'|'troca')
        const rawType = get(row, "type") || null;
        const typeNorm = rawType
          ? (rawType.toLowerCase() === "troca" ? "troca" : "venda")
          : null;

        return {
          tenant_id:            tenantId,
          sku:                  get(row, "sku"),
          sale_date:            parseDateStr(get(row, "sale_date")) ?? get(row, "sale_date"),
          channel:              get(row, "channel") || null,
          quantity,
          revenue_gross:        revenueGross,
          discount_value:       discountValue,
          revenue_net:          revenueNet,
          price_realized:       priceRealized,
          type:                 typeNorm,
          tax_value:            parseNum(get(row, "tax_value")),
          revenue_net_post_tax: parseNum(get(row, "revenue_net_post_tax")),
          colecao:              get(row, "colecao") || null,
          category:             get(row, "category") || null,
        };
      })
      .filter(r => r.sku && r.sale_date);

    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      // ignoreDuplicates: ON CONFLICT DO NOTHING — não atualiza vendas já existentes,
      // apenas pula silenciosamente registros com mesma (tenant, sku, data, valor, qty)
      const { error } = await supabase
        .from("sales_history")
        .upsert(records.slice(i, i + BATCH), {
          onConflict: "tenant_id,sku,sale_date,revenue_gross,quantity",
          ignoreDuplicates: true,
        });
      if (error) errors += Math.min(BATCH, records.length - i);
      else importedRows  += Math.min(BATCH, records.length - i);
    }

  // ── Ordens de Produção & Compra ──────────────────────────────────────────
  } else if (dataType === "orders") {
    const records = dataRows
      .map(row => ({
        tenant_id:          tenantId,
        order_number:       get(row, "order_number"),
        sku:                get(row, "sku"),
        order_date:         parseDateStr(get(row, "order_date"))       ?? get(row, "order_date"),
        quantity_ordered:   parseNum(get(row, "quantity_ordered"))     ?? 0,
        quantity_delivered: 0,
        unit_cost:          parseNum(get(row, "unit_cost")),
        supplier:           get(row, "supplier")                       || null,
        expected_delivery:  parseDateStr(get(row, "expected_delivery")),
        delivery_date:      parseDateStr(get(row, "delivery_date")),
        status:             get(row, "status")                         || "pendente",
        type:               "compra",
        updated_at:         new Date().toISOString(),
      }))
      .filter(r => r.order_number && r.sku && r.order_date);

    const BATCH = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      // upsert: atualiza pedido se order_number+sku já existir (ex: status mudou)
      const { error } = await supabase
        .from("purchase_orders")
        .upsert(records.slice(i, i + BATCH), {
          onConflict: "tenant_id,order_number,sku",
        });
      if (error) errors += Math.min(BATCH, records.length - i);
      else importedRows  += Math.min(BATCH, records.length - i);
    }

  // ── Estoque Histórico ────────────────────────────────────────────────────
  } else if (dataType === "inventory") {
    const records = dataRows
      .map(row => ({
        tenant_id:     tenantId,
        sku:           get(row, "sku"),
        snapshot_date: parseDateStr(get(row, "snapshot_date")) ?? get(row, "snapshot_date"),
        quantity:      parseNum(get(row, "quantity"))          ?? 0,
        value_cost:    parseNum(get(row, "value_cost")),
        value_sale:    parseNum(get(row, "value_sale")),
        location:      get(row, "location")                    || null,
      }))
      .filter(r => r.sku && r.snapshot_date);

    const BATCH = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      // upsert: atualiza posição de estoque se (sku, data) já existir (ex: contagem corrigida)
      const { error } = await supabase
        .from("inventory_snapshots")
        .upsert(records.slice(i, i + BATCH), {
          onConflict: "tenant_id,sku,snapshot_date",
        });
      if (error) errors += Math.min(BATCH, records.length - i);
      else importedRows  += Math.min(BATCH, records.length - i);
    }

  // ── Hierarquia (enriquecimento por SKU) ─────────────────────────────────
  } else if (dataType === "hierarchy") {
    const records = dataRows
      .map(row => ({
        sku:         get(row, "sku"),
        division:    get(row, "level1") || null,
        category:    get(row, "level2") || null,
        subcategory: get(row, "level3") || null,
      }))
      .filter(r => r.sku);

    for (const r of records) {
      const { error } = await supabase
        .from("products")
        .update({
          division:    r.division,
          category:    r.category,
          subcategory: r.subcategory,
          updated_at:  new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("sku", r.sku);
      if (error) errors++;
      else importedRows++;
    }
  }

  return {
    dataType,
    fileName: "",
    totalRows: dataRows.length,
    importedRows,
    errors,
  };
}
