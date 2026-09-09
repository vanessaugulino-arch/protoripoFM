-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 031 — sortiment_category_indicators (Cascata do Sortimento, Fase D)
--
-- Aba 2: depois de revisar a participação (Fase A/B/C), o usuário refina
-- Preço Médio e Remarcação por categoria. Preço Médio não é a faixa em si —
-- dentro de uma faixa, o preço real pode estar mais perto da base ou do
-- topo do range; o objetivo é bater as metas macro. Fica gravado aqui pra
-- não se perder entre sessões e virar o número final do plano.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sortiment_category_indicators (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  division_id text        NOT NULL,
  category    text        NOT NULL,
  avg_price   numeric,
  mkd_pct     numeric CHECK (mkd_pct IS NULL OR (mkd_pct >= 0 AND mkd_pct <= 100)),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  UNIQUE (tenant_id, season_id, division_id, category)
);

CREATE INDEX IF NOT EXISTS sortiment_category_indicators_lookup_idx
  ON public.sortiment_category_indicators (tenant_id, season_id, division_id);

ALTER TABLE public.sortiment_category_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_sortiment_category_indicators
  ON public.sortiment_category_indicators FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_sortiment_category_indicators
  ON public.sortiment_category_indicators FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_sortiment_category_indicators
  ON public.sortiment_category_indicators FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_sortiment_category_indicators
  ON public.sortiment_category_indicators FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.sortiment_category_indicators IS
  'Preço Médio e Remarcação % ajustados por categoria, na Aba 2 (refinamento '
  'final) da Cascata do Sortimento (M6). Preço Médio não é a faixa (P1/P2/P3) '
  'em si — é onde dentro da faixa o preço real fica.';
