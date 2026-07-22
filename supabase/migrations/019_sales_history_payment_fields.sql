-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 019 — Colunas ausentes em sales_history
--
-- Adiciona as colunas da planilha original que não foram importadas:
--   payment_method  → Forma de pagamento  (col 12)
--   installments    → Parcelas            (col 13)
--   mes             → Mês                 (col 14)
--   ano             → Ano                 (col 15)
--
-- Mês e Ano são deriváveis de sale_date, mas são mantidos para facilitar
-- agrupamentos e filtros sem parsing de data.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales_history
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS installments   integer,
  ADD COLUMN IF NOT EXISTS mes            text,
  ADD COLUMN IF NOT EXISTS ano            integer;

COMMENT ON COLUMN public.sales_history.payment_method IS 'Forma de pagamento (col 12 da aba VENDAS): ex: Crédito, Débito, PIX';
COMMENT ON COLUMN public.sales_history.installments   IS 'Número de parcelas (col 13 da aba VENDAS)';
COMMENT ON COLUMN public.sales_history.mes            IS 'Mês de referência da venda (col 14 da aba VENDAS): ex: Janeiro, 1, 01/2024';
COMMENT ON COLUMN public.sales_history.ano            IS 'Ano de referência da venda (col 15 da aba VENDAS): ex: 2024';

-- Índice para filtros por ano (frequente em planejamento anual)
CREATE INDEX IF NOT EXISTS sales_history_ano_idx
  ON public.sales_history (tenant_id, ano);
