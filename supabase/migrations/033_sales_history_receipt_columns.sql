-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 033 — sales_history ganha colunas de "cesta" (Ticket Médio)
--
-- Gap de schema documentado em HISTORICAL_CASCADE_ARCHITECTURE.md: sem uma
-- coluna que identifique a venda (cupom fiscal/NF no varejo, nº de pedido no
-- atacado), não dá pra agrupar múltiplas linhas de SKU de uma mesma venda —
-- e Ticket Médio não é computável, mesmo com histórico completo importado.
--
-- receipt_number é a crítica (necessária pra Ticket Médio existir);
-- client_code/name/document são complementares, principalmente pro atacado.
--
-- Ticket Médio = SUM(revenue_net) / COUNT(DISTINCT receipt_number), dentro
-- do período/canal/divisão que a tela precisar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales_history
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS client_code    text,
  ADD COLUMN IF NOT EXISTS client_name    text,
  ADD COLUMN IF NOT EXISTS client_document text;

CREATE INDEX IF NOT EXISTS sales_history_receipt_number_idx
  ON public.sales_history (tenant_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

COMMENT ON COLUMN public.sales_history.receipt_number IS
  'Nº do cupom fiscal/NF (varejo/e-commerce) ou nº do pedido (atacado) — '
  'agrupa as linhas de uma mesma venda. Necessária pro Ticket Médio existir.';
COMMENT ON COLUMN public.sales_history.client_code IS
  'Código do cliente no ERP — relevante principalmente no atacado.';
COMMENT ON COLUMN public.sales_history.client_name IS 'Nome do cliente.';
COMMENT ON COLUMN public.sales_history.client_document IS 'CNPJ/CPF do cliente.';
