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
import { enrichProductColors } from "./supabase/colorBankService";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ImportDataType =
  | "catalog"
  | "sales"
  | "orders"
  | "inventory"
  | "hierarchy"
  | "color_enrichment"
  | "production_enrichment";

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
        description: "Nome completo do produto. Se sua planilha não tiver uma coluna de descrição, deixe sem mapear — o sistema monta o nome a partir de categoria, modelo e cor.",
        required: false,
        valueType: "optional_text",
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
      {
        key: "linha",
        label: "Linha / Grupo",
        description: "Nível adicional da hierarquia do ERP. Ex: Comprida, Midi, Curta",
        required: false,
        valueType: "optional_text",
        sampleValue: "Midi",
      },
      {
        key: "data_ultima_entrada",
        label: "Data da Última Entrada",
        description: "Data da última entrada do produto no estoque. Formatos: AAAA-MM-DD ou DD/MM/AAAA",
        required: false,
        valueType: "optional_date",
        sampleValue: "2026-03-15",
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
        key: "unit_cost",
        label: "Custo Unitário (R$)",
        description: "Custo de compra por unidade. O sistema calcula Valor ao Custo = Custo Unitário × Quantidade. Informe este campo OU o Valor ao Custo — não os dois.",
        required: false,
        valueType: "optional_number",
        sampleValue: "32.00",
      },
      {
        key: "unit_price",
        label: "Preço de Venda Unitário (R$)",
        description: "Preço de tabela por unidade. O sistema calcula Valor a Preço de Venda = Preço Unitário × Quantidade. Informe este campo OU o Valor a Preço de Venda — não os dois.",
        required: false,
        valueType: "optional_number",
        sampleValue: "89.90",
      },
      {
        key: "value_cost",
        label: "Valor ao Custo (R$)",
        description: "Estoque avaliado pelo custo total (Custo Unitário × Quantidade). Use ponto decimal. Alternativa ao campo Custo Unitário.",
        required: false,
        valueType: "optional_number",
        sampleValue: "1440.00",
      },
      {
        key: "value_sale",
        label: "Valor a Preço de Venda (R$)",
        description: "Estoque avaliado pelo preço de venda total. Use ponto decimal. Alternativa ao campo Preço de Venda Unitário.",
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

  // ── Enriquecimento de Cor → public.products (update por SKU) ─────────────
  // Tipicamente exportado do PLM ou classificado manualmente pelo cliente.
  color_enrichment: {
    label: "Enriquecimento de Cor",
    description:
      "Atualiza família e intensidade de cor nos produtos por SKU (join por SKU). Também registra no banco global de cores. Exportar do PLM ou preencher com base no banco de cores do sistema.",
    icon: "🎨",
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
        key: "color",
        label: "Cor (nome do fornecedor)",
        description: "Nome da cor como registrada no ERP/PLM. Ex: Telha, Off-White",
        required: true,
        valueType: "text",
        sampleValue: "Telha",
      },
      {
        key: "color_family",
        label: "Família de Cor",
        description: "Grupo principal de cor. Ex: Marrom, Azul, Verde, Branco, Preto",
        required: true,
        valueType: "text",
        sampleValue: "Marrom",
      },
      {
        key: "color_intensity",
        label: "Intensidade / Tom",
        description: "Variação dentro da família. Ex: Médio, Claro, Escuro, Royal, Terracota",
        required: true,
        valueType: "text",
        sampleValue: "Médio",
      },
    ],
  },

  // ── Enriquecimento de Tipo de Produção → public.products (update por SKU) ─
  // Exportado do PLM do cliente. Impacta lead time padrão e análise de risco.
  production_enrichment: {
    label: "Tipo de Produção",
    description:
      "Atualiza o tipo de produção de cada SKU (join por SKU). Exportar do PLM. Impacta lead time padrão e análise de risco de abastecimento no Módulo 4.",
    icon: "🏭",
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
        key: "production_type",
        label: "Tipo de Produção",
        description:
          "propria = unidade fabril/ateliê próprio · faccao = terceiro produz sob design da marca (private label / cut & sew) · importado = produto acabado comprado no exterior · licenciado = produto com IP de terceiro",
        required: true,
        valueType: "enum",
        sampleValue: "faccao",
        enumValues: ["propria", "faccao", "importado", "licenciado"],
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

// ── Cache de buffer XLSX: evita ler o mesmo arquivo duas vezes do disco ────────
// Preenchido quando detectamos múltiplas abas; limpo após parsear a aba selecionada.
let _xlsxBufferCache: { key: string; data: Uint8Array } | null = null;

function xlsxCacheKey(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
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
      reader.onerror = () => reject(new Error("Falha ao ler arquivo CSV. Verifique se o arquivo não está corrompido."));
      reader.readAsText(file, "utf-8");
    });
  }

  // ── XLSX / XLS ───────────────────────────────────────────────────────────────
  // Estratégia:
  //   1ª chamada (sem sheetName): lê o arquivo e extrai nomes de abas.
  //      · Se houver apenas 1 aba, parseia diretamente.
  //      · Se houver > 1 aba, guarda o buffer em cache e rejeita com MULTIPLE_SHEETS.
  //   2ª chamada (com sheetName, via handleSheetSelect): reutiliza o buffer em cache
  //      para parsear apenas a aba escolhida — evita reler 173 MB do disco.

  return new Promise((resolve, reject) => {
    const cacheKey = xlsxCacheKey(file);

    const processBuffer = async (data: Uint8Array) => {
      try {
        const XLSX = await import("xlsx");

        if (!sheetName) {
          // ── Fase 1: detectar abas sem parsear dados (bookSheets: true) ────────
          // bookSheets popula SheetNames mas deixa Sheets vazio — não acessamos Sheets aqui.
          const meta = XLSX.read(data, { type: "array", bookSheets: true });
          const sheetNames = meta.SheetNames ?? [];

          if (sheetNames.length > 1) {
            // Guarda buffer para reutilizar na 2ª chamada
            _xlsxBufferCache = { key: cacheKey, data };
            const err = new Error("MULTIPLE_SHEETS") as Error & { sheets: string[] };
            err.sheets = sheetNames;
            reject(err);
            return;
          }

          // Aba única: parseia agora
          sheetName = sheetNames[0];
        }

        // ── Fase 2: parsear apenas a aba selecionada ──────────────────────────
        const workbook = XLSX.read(data, { type: "array", cellDates: true, sheets: [sheetName] });
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) { reject(new Error(`Aba "${sheetName}" não encontrada`)); return; }

        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
        if (!raw.length) { reject(new Error("Planilha vazia")); return; }
        const headers = (raw[0] as unknown[]).map(h => String(h ?? "").trim());
        const rows    = raw.slice(1).map(row =>
          (row as unknown[]).map(cell => {
            if (cell instanceof Date) return cell.toISOString().slice(0, 10);
            return String(cell ?? "").trim();
          })
        );

        // Limpa cache após uso
        _xlsxBufferCache = null;
        resolve({ headers, rows, totalRows: rows.length });
      } catch (err) {
        _xlsxBufferCache = null;
        reject(err);
      }
    };

    // Reutiliza buffer em cache se disponível (mesma chamada de arquivo)
    if (_xlsxBufferCache?.key === cacheKey) {
      processBuffer(_xlsxBufferCache.data);
      return;
    }

    // Leitura do disco
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (!result || !(result instanceof ArrayBuffer)) {
        reject(new Error("Leitura retornou resultado vazio — tente selecionar o arquivo novamente."));
        return;
      }
      processBuffer(new Uint8Array(result)).catch(reject);
    };

    reader.onerror = (evt) => {
      const domErr = (evt.target as FileReader | null)?.error;
      const name   = domErr?.name   ?? "Unknown";
      const msg    = domErr?.message ?? "";
      console.error("[parseFile] FileReader error:", name, msg,
        "| file:", file.name, `(${(file.size/1024/1024).toFixed(1)} MB)`);

      let hint = "";
      if (name === "NotReadableError") {
        hint =
          ". Se o arquivo estiver no iCloud Drive, certifique-se de que foi " +
          "baixado para o Mac (ícone de nuvem no Finder = ainda não baixado). " +
          "Clique com o botão direito no arquivo no Finder → 'Baixar agora'.";
      } else if (name === "NotFoundError") {
        hint = ". Arquivo não encontrado — pode ter sido movido ou excluído após ser selecionado.";
      } else if (name === "SecurityError") {
        hint = ". Restrição de segurança do navegador. Tente arrastar o arquivo direto para a área de upload.";
      } else if (file.size > 200 * 1024 * 1024) {
        hint = ". O arquivo é muito grande — exporte apenas a aba necessária como um novo XLSX ou CSV.";
      } else {
        hint = `. Verifique se não está corrompido ou protegido por senha. [${name}: ${msg}]`;
      }
      reject(new Error(`Falha ao ler o arquivo${hint}`));
    };

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
/**
 * Interpreta o nome de uma temporada e devolve tipo + ano fiscal.
 * Reconhece tanto nomes por extenso ("Verão 2026", "Inverno 25") quanto os
 * códigos de mercado usados pelos ERPs de moda:
 *   PV / SS / P-V  → Primavera-Verão  (verao)
 *   OI / AW / FW   → Outono-Inverno   (inverno)
 * O ano pode vir com 4 dígitos (2026) ou 2 (26 → 2026).
 */
export function parseSeasonName(name: string): { tipo: "verao" | "inverno"; fiscalYear: number } {
  const s = (name ?? "").trim();
  const upper = s.toUpperCase();

  // ── Tipo ──────────────────────────────────────────────────────────────────
  let tipo: "verao" | "inverno";
  if (/VER[ÃA]O|PRIMAVERA/i.test(s) || /\b(PV|SS)\b|^(PV|SS)\s*\d/.test(upper) || /^(PV|SS)\d/.test(upper)) {
    tipo = "verao";
  } else if (/INVERNO|OUTONO/i.test(s) || /\b(OI|AW|FW)\b/.test(upper) || /^(OI|AW|FW)\d/.test(upper)) {
    tipo = "inverno";
  } else {
    tipo = "inverno"; // fallback conservador
  }

  // ── Ano ───────────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const y4 = s.match(/\d{4}/);
  let fiscalYear: number;
  if (y4) {
    fiscalYear = parseInt(y4[0], 10);
  } else {
    const y2 = s.match(/\d{2}(?!\d)/);
    fiscalYear = y2
      ? 2000 + parseInt(y2[0], 10)
      : currentYear;
  }
  // Sanidade: descarta anos absurdos vindos de nomes atípicos
  if (fiscalYear < 2000 || fiscalYear > currentYear + 10) fiscalYear = currentYear;

  return { tipo, fiscalYear };
}

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

      // Espelha a hierarquia na tabela dedicada (hierarquia_produtos), que é a
      // fonte lida pelo card de Hierarquia de Produtos em Configurações.
      // subcategoria é NOT NULL DEFAULT '' — usar '' em vez de null mantém o
      // índice único (tenant, divisao, categoria, subcategoria) funcional.
      const hierRows: { tenant_id: string; divisao: string; categoria: string; subcategoria: string; ordem: number; ativo: boolean }[] = [];
      let ordem = 0;
      for (const [div, cats] of divMap.entries()) {
        for (const [cat, subs] of cats.entries()) {
          if (subs.size === 0) {
            hierRows.push({ tenant_id: tenantId, divisao: div, categoria: cat, subcategoria: "", ordem: ordem++, ativo: true });
          } else {
            for (const sub of subs) {
              hierRows.push({ tenant_id: tenantId, divisao: div, categoria: cat, subcategoria: sub, ordem: ordem++, ativo: true });
            }
          }
        }
      }
      if (hierRows.length > 0) {
        // Substitui a hierarquia derivada anterior para não acumular órfãos.
        // hierarquia_produtos não está nos tipos gerados do Supabase — mesmo
        // padrão de cast usado nas demais tabelas fora do schema tipado.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        await sb.from("hierarquia_produtos").delete().eq("tenant_id", tenantId);
        const HB = 200;
        for (let i = 0; i < hierRows.length; i += HB) {
          await sb.from("hierarquia_produtos").insert(hierRows.slice(i, i + HB));
        }
      }
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
        const meta = parseSeasonName(sName);
        await (supabase as any).from("seasons").upsert(
          {
            tenant_id: tenantId,
            name: sName,
            fiscal_year: meta.fiscalYear,
            tipo: meta.tipo,
            month_start: meta.tipo === "verao" ? "07" : "01",
            month_end:   meta.tipo === "verao" ? "12" : "06",
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
        let seasonId: string | null = null;
        if (c.season) {
          const { data: seasData } = await (supabase as any)
            .from("seasons")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("name", c.season)
            .maybeSingle();
          seasonId = seasData?.id ?? null;
        }

        // Sem temporada correspondente: cria uma temporada-âncora a partir do
        // próprio nome da coleção, para que ela apareça na tela mesmo sem data
        // definida. O usuário ajusta período e vínculo depois em Configurações.
        if (!seasonId) {
          const meta = parseSeasonName(c.collection_name);
          const anchorName = c.season || c.collection_name;
          const { data: created } = await (supabase as any)
            .from("seasons")
            .upsert(
              {
                tenant_id: tenantId,
                name: anchorName,
                fiscal_year: meta.fiscalYear,
                tipo: meta.tipo,
                month_start: meta.tipo === "verao" ? "07" : "01",
                month_end:   meta.tipo === "verao" ? "12" : "06",
                auto_generated: true,
              },
              { onConflict: "tenant_id,name" }
            )
            .select("id")
            .maybeSingle();
          seasonId = created?.id ?? null;
        }

        if (!seasonId) continue;

        // Datas placeholder derivadas do ano fiscal da temporada — o usuário
        // ajusta em Configurações de Operação.
        const meta = parseSeasonName(c.season || c.collection_name);
        const placeholderStart = `${meta.fiscalYear}-01-01`;
        const placeholderEnd   = `${meta.fiscalYear}-12-31`;
        await supabase.from("collections").upsert(
          {
            tenant_id: tenantId,
            season_id: seasonId,
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

/**
 * Normaliza o nível de risco para os códigos aceitos pela constraint
 * products_risk_level_check (basico | motor_giro | sustentador | icone).
 * Aceita tanto os códigos internos quanto os rótulos de exibição e variações
 * comuns de ERP; qualquer valor não reconhecido vira null (a coluna aceita NULL).
 */
function normRiskLevel(v: string): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["basico", "motor_giro", "sustentador", "icone"].includes(s)) return s;
  if (s.includes("bás") || s.includes("bas")) return "basico";
  if (s.includes("giro") || s.includes("motor")) return "motor_giro";
  if (s.includes("sustent") || s.includes("margem")) return "sustentador";
  if (s.includes("ícone") || s.includes("icone") || s.includes("marca")) return "icone";
  return null; // taxonomia desviante → não grava (evita violar a constraint)
}

/**
 * Normaliza a faixa de preço para P1/P2/P3 (constraint products_price_tier_check).
 * Qualquer outro valor vira null.
 */
function normPriceTier(v: string): string | null {
  const s = (v ?? "").trim().toUpperCase();
  return ["P1", "P2", "P3"].includes(s) ? s : null;
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
    const mapped = dataRows.map(row => {
      const rawColor = get(row, "color");
      const sku      = get(row, "sku");
      // Nome: usa a coluna mapeada; se ausente, deriva de categoria/modelo/cor;
      // em último caso usa o próprio SKU. Nunca descarta a linha por falta de nome.
      const derived  = [get(row, "category"), get(row, "model"), rawColor]
        .filter(Boolean).join(" ").trim();
      const name     = get(row, "name") || derived || sku;
      return {
        tenant_id:       tenantId,
        sku,
        name,
        model:           get(row, "model")           || null,
        division:        get(row, "division")        || null,
        category:        get(row, "category")        || null,
        subcategory:     get(row, "subcategory")     || null,
        linha:           get(row, "linha")           || null,
        data_ultima_entrada: parseDateStr(get(row, "data_ultima_entrada")) || null,
        price_sale:      parseNum(get(row, "price_sale")),
        price_cost:      parseNum(get(row, "price_cost")),
        season:          get(row, "season")          || null,
        collection_name: get(row, "collection_name") || null,
        risk_level:      normRiskLevel(get(row, "risk_level")),
        price_tier:      normPriceTier(get(row, "price_tier")),
        color:           rawColor                    || null,
        color_group:     rawColor ? (mapColorGroup(rawColor) || null) : null,
        material:        get(row, "material")        || null,
        source:          "planilha", // constraint products_source_check: manual|planilha|erp
        attributes:      {},
        updated_at:      new Date().toISOString(),
      };
    });

    // Descarta linhas sem SKU (chave de upsert — sem ela não há o que gravar)
    const withSku = mapped.filter(r => r.sku);
    const semSku  = mapped.length - withSku.length;

    // Deduplica por SKU mantendo a ÚLTIMA ocorrência. Um mesmo SKU repetido no
    // arquivo faz o upsert em lote falhar inteiro ("ON CONFLICT DO UPDATE command
    // cannot affect row a second time"), derrubando 200 linhas boas junto. Colapsar
    // para 1 registro por SKU elimina essa falha. Arquivos "com cores" às vezes
    // repetem o SKU-base entre variações — aqui fica 1 produto por SKU.
    const bySku = new Map<string, typeof withSku[number]>();
    for (const r of withSku) bySku.set(r.sku, r);
    const records    = [...bySku.values()];
    const duplicados = withSku.length - records.length;

    if (records.length === 0) {
      throw new Error(
        `Nenhuma linha pôde ser importada: ${mapped.length} linha(s) sem código de produto (SKU). ` +
        `Verifique se a coluna "Código (SKU)" foi mapeada corretamente.`
      );
    }

    const BATCH = 200;
    let lastError: string | null = null;
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const { error } = await supabase
        .from("products")
        .upsert(chunk, { onConflict: "tenant_id,sku" });

      if (!error) { importedRows += chunk.length; continue; }

      // Lote falhou por causa de UMA linha ruim: tenta linha a linha para salvar
      // o que der e capturar a mensagem exata do banco (não perde as 199 boas).
      lastError = error.message;
      for (const rec of chunk) {
        const { error: e1 } = await supabase
          .from("products")
          .upsert(rec, { onConflict: "tenant_id,sku" });
        if (e1) { errors++; lastError = e1.message; }
        else    { importedRows++; }
      }
    }

    // Se absolutamente nada entrou, o erro do banco precisa chegar ao usuário
    if (importedRows === 0 && lastError) {
      throw new Error(`Falha ao gravar produtos: ${lastError}`);
    }
    if (semSku > 0)     console.warn(`[catalog] ${semSku} linha(s) ignorada(s) por falta de SKU.`);
    if (duplicados > 0) console.warn(`[catalog] ${duplicados} linha(s) com SKU repetido colapsadas (1 produto por SKU).`);
    if (errors > 0 && lastError) console.warn(`[catalog] ${errors} linha(s) rejeitada(s). Último erro: ${lastError}`);

    // Sincroniza hierarquia + temporadas + coleções.
    // Roda sempre que houver produtos no tenant — não apenas quando esta importação
    // gravou linhas novas (um reimport idêntico ainda precisa ressincronizar).
    const { count: prodCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if ((prodCount ?? 0) > 0) {
      await syncFromCatalogImport(tenantId);
      // Enriquece color_group cruzando as cores dos produtos com o banco de cores global.
      // Erros são silenciosos — o usuário pode classificar manualmente depois.
      enrichProductColors(tenantId).catch(() => null);
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
      .map(row => {
        const qty        = parseNum(get(row, "quantity")) ?? 0;
        const unitCost   = parseNum(get(row, "unit_cost"));
        const unitPrice  = parseNum(get(row, "unit_price"));
        // Prefere o total explícito; se não vier, calcula a partir do unitário × qtd
        const valueCost  = parseNum(get(row, "value_cost"))
                        ?? (unitCost != null ? unitCost * qty : null);
        const valueSale  = parseNum(get(row, "value_sale"))
                        ?? (unitPrice != null ? unitPrice * qty : null);
        return {
          tenant_id:     tenantId,
          sku:           get(row, "sku"),
          snapshot_date: parseDateStr(get(row, "snapshot_date")) ?? get(row, "snapshot_date"),
          quantity:      qty,
          value_cost:    valueCost,
          value_sale:    valueSale,
          location:      get(row, "location") || null,
        };
      })
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

  // ── Enriquecimento de Cor (color_family + color_intensity por SKU) ───────
  } else if (dataType === "color_enrichment") {
    const { normalizeCor, addToColorBank } = await import("./supabase/colorBankService");

    const records = dataRows
      .map(row => ({
        sku:             get(row, "sku"),
        color:           get(row, "color")           || null,
        color_family:    get(row, "color_family")    || null,
        color_intensity: get(row, "color_intensity") || null,
      }))
      .filter(r => r.sku && r.color_family && r.color_intensity);

    for (const r of records) {
      // 1. Registra no banco global de cores (sem propagação via RPC — evita N chamadas pesadas)
      if (r.color) {
        await addToColorBank({
          cor_display: r.color,
          familia:     r.color_family!,
          intensidade: r.color_intensity!,
        }).catch(() => null);
      }

      // 2. Atualiza o produto diretamente
      const colorGroup = `${r.color_family} ${r.color_intensity}`;
      const { error } = await (supabase as any)
        .from("products")
        .update({
          color_family:    r.color_family,
          color_intensity: r.color_intensity,
          color_group:     colorGroup,
          updated_at:      new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("sku", r.sku);
      if (error) errors++;
      else importedRows++;
    }

  // ── Enriquecimento de Tipo de Produção (production_type por SKU) ─────────
  } else if (dataType === "production_enrichment") {
    const VALID_TYPES = new Set(["propria", "faccao", "importado", "licenciado"]);

    const records = dataRows
      .map(row => ({
        sku:             get(row, "sku"),
        production_type: (get(row, "production_type") || "").toLowerCase().trim(),
      }))
      .filter(r => r.sku && VALID_TYPES.has(r.production_type));

    for (const r of records) {
      const { error } = await (supabase as any)
        .from("products")
        .update({
          production_type: r.production_type,
          updated_at:      new Date().toISOString(),
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
