-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 032 — sortiment_category_notes (Cascata do Sortimento, Fase E)
--
-- Anotações livres por categoria, registradas durante o refino do Sortimento
-- (M6) — ex.: "aumento da participação sobre shorts para lançamento da
-- modelagem over em alta tendência já aceita pelo público". Cada categoria
-- pode ter várias notas ao longo do tempo (log de decisões, não um campo
-- único) — a base para um futuro relatório de decisões.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sortiment_category_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  division_id text        NOT NULL,
  category    text        NOT NULL,
  note        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

CREATE INDEX IF NOT EXISTS sortiment_category_notes_lookup_idx
  ON public.sortiment_category_notes (tenant_id, season_id, division_id, category);

ALTER TABLE public.sortiment_category_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_sortiment_category_notes
  ON public.sortiment_category_notes FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_sortiment_category_notes
  ON public.sortiment_category_notes FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_sortiment_category_notes
  ON public.sortiment_category_notes FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.sortiment_category_notes IS
  'Anotações de decisão registradas por categoria na Cascata do Sortimento '
  '(M6), Fase E — log cronológico (não um campo único), base do futuro '
  'relatório de decisões.';
