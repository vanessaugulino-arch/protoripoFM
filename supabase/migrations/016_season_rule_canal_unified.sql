-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 016 — Preferência de período por canal na regra padrão de temporadas
--
-- A regra padrão (season_default_rules) define o calendário da marca para
-- Verão e Inverno. A flag canal_periods_unified registra se a marca opera
-- todos os canais no mesmo período ou se cada canal tem janela própria —
-- essa preferência é capturada no onboarding e editável em OperationSettings.
--
-- Quando auto-gerar instâncias de temporada (seasons), o sistema herda este
-- flag da regra, que pode então ser sobrescrito por canal via canal_temporada_config.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.season_default_rules
  ADD COLUMN IF NOT EXISTS canal_periods_unified boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.season_default_rules.canal_periods_unified IS
  'true = todos os canais vendem no mesmo período (padrão). '
  'false = cada canal tem período próprio definido em canal_temporada_config. '
  'Herdado pelas instâncias de temporada (seasons) ao serem auto-geradas.';
