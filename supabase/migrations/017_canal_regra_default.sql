-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 017 — Períodos de venda padrão por canal (regra global da marca)
--
-- Distingue dois conceitos no calendário da marca:
--   Comunicação — período em que a temporada é lançada ao mercado (Verão/Inverno)
--                  → já existia em season_default_rules
--   Venda        — ciclo financeiro e logístico por canal de distribuição
--                  → nova tabela canal_regra_default
--
-- Ao auto-gerar instâncias de temporada (seasons), o sistema herda esses
-- períodos para canal_temporada_config, que pode ser sobrescrito por instância.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.canal_regra_default (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  canal_id   text        NOT NULL,
  mes_inicio text        NOT NULL,
  mes_fim    text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, canal_id)
);

COMMENT ON TABLE public.canal_regra_default IS
  'Período de venda padrão (ciclo financeiro/logístico) por canal de distribuição. '
  'Diferencia o calendário de comunicação da marca (season_default_rules) do '
  'período real em que cada canal realiza faturamento ou sell-through. '
  'Exemplo: atacado fatura 1-2 meses antes do lançamento ao varejo.';

ALTER TABLE public.canal_regra_default ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.canal_regra_default
  USING (tenant_id = (current_setting('app.current_tenant', true))::uuid);

CREATE INDEX canal_regra_default_tenant_idx
  ON public.canal_regra_default (tenant_id);
