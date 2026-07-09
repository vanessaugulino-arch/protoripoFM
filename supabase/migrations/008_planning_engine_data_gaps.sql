-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008 — Planning Engine: campos faltantes para cálculos de KPIs
--
-- Tabelas alteradas:
--   sales_history      → +tax_value, +revenue_net_post_tax, +colecao, +temporada
--   inventory_snapshots→ +temporada, +colecao, +mes_referencia, +data_ult_entrada
--   products           → +data_ultima_entrada, +linha
--   purchase_orders    → +temporada, +colecao
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. sales_history
-- ----------------------------------------------------------------------------
-- revenue_net (existente) = RV: Receita de Vendas (pós-desconto, pré-imposto)
-- tax_value               = imposto em R$ por transação (col H da aba VENDAS)
-- revenue_net_post_tax    = RL: Receita Líquida (pós-desconto e pós-imposto, col J)
-- colecao / temporada     = filtros de planejamento por coleção e temporada
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales_history
  ADD COLUMN IF NOT EXISTS tax_value            numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_net_post_tax numeric(15,2),
  ADD COLUMN IF NOT EXISTS colecao              text,
  ADD COLUMN IF NOT EXISTS temporada            text;

COMMENT ON COLUMN public.sales_history.tax_value            IS 'Imposto em R$ por transação (col H aba VENDAS)';
COMMENT ON COLUMN public.sales_history.revenue_net_post_tax IS 'Receita Líquida RL = RV - imposto (col J aba VENDAS)';
COMMENT ON COLUMN public.sales_history.colecao              IS 'Coleção associada à venda (ex: SS24, FW24)';
COMMENT ON COLUMN public.sales_history.temporada            IS 'Temporada associada à venda (ex: Verão 2024)';


-- ── 2. inventory_snapshots
-- ----------------------------------------------------------------------------
-- temporada        = temporada do estoque (ex: Verão 2024)
-- colecao          = coleção do estoque (ex: SS24)
-- mes_referencia   = identificador do mês do snapshot (ex: 2024-01)
-- data_ult_entrada = data da última entrada no estoque — CRÍTICO para Idade Média
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_snapshots
  ADD COLUMN IF NOT EXISTS temporada        text,
  ADD COLUMN IF NOT EXISTS colecao          text,
  ADD COLUMN IF NOT EXISTS mes_referencia   text,
  ADD COLUMN IF NOT EXISTS data_ult_entrada date;

COMMENT ON COLUMN public.inventory_snapshots.temporada        IS 'Temporada do estoque (ex: Verão 2024)';
COMMENT ON COLUMN public.inventory_snapshots.colecao          IS 'Coleção do estoque (ex: SS24, FW24)';
COMMENT ON COLUMN public.inventory_snapshots.mes_referencia   IS 'Mês referência do snapshot no formato YYYY-MM';
COMMENT ON COLUMN public.inventory_snapshots.data_ult_entrada IS 'Data da última entrada de estoque deste SKU — usado no cálculo de Idade Média';


-- ── 3. products
-- ----------------------------------------------------------------------------
-- data_ultima_entrada = data da última entrada do SKU em estoque — CRÍTICO para Idade Média
-- linha               = linha do produto dentro da hierarquia (Divisão > Categoria > Linha)
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS data_ultima_entrada date,
  ADD COLUMN IF NOT EXISTS linha               text;

COMMENT ON COLUMN public.products.data_ultima_entrada IS 'Data da última entrada do SKU em estoque (Cadastro de Produtos col B)';
COMMENT ON COLUMN public.products.linha               IS 'Linha do produto dentro da hierarquia (ex: Básico, Moda, Premium)';


-- ── 4. purchase_orders
-- ----------------------------------------------------------------------------
-- temporada = temporada do pedido (ex: Verão 2024)
-- colecao   = coleção do pedido (ex: SS24) — diferente de temporada
-- ----------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS temporada text,
  ADD COLUMN IF NOT EXISTS colecao   text;

COMMENT ON COLUMN public.purchase_orders.temporada IS 'Temporada do pedido (ex: Verão 2024)';
COMMENT ON COLUMN public.purchase_orders.colecao   IS 'Coleção do pedido (ex: SS24, FW24) — diferente de temporada';


-- ── 5. Índices para queries de planejamento frequentes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sales_history_temporada_idx
  ON public.sales_history (tenant_id, temporada);

CREATE INDEX IF NOT EXISTS sales_history_colecao_idx
  ON public.sales_history (tenant_id, colecao);

CREATE INDEX IF NOT EXISTS inventory_snapshots_temporada_idx
  ON public.inventory_snapshots (tenant_id, temporada);

CREATE INDEX IF NOT EXISTS purchase_orders_temporada_idx
  ON public.purchase_orders (tenant_id, temporada);
