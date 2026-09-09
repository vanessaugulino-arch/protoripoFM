-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 029 — sortiment_hierarchy_adjustments (Cascata do Sortimento, Fase B)
--
-- Fase B: depois de revisar a participação por categoria (Fase A), o usuário
-- expande a categoria em Subcategoria → Linha e ajusta a PARTICIPAÇÃO (%) de
-- cada nó dentro do pai imediato — subcategoria como % da categoria, linha
-- como % da subcategoria. Uma tabela genérica por caminho serve os dois
-- níveis (em vez de duas tabelas quase idênticas): `parent_path` identifica
-- o pai ("Bermuda" para subcategorias de Bermuda, "Bermuda::Midi" para
-- linhas de Midi), `node_name` é o filho ajustado.
--
-- Sem override aqui, o nó usa o peso histórico real já calculado pela
-- cascata (consolidatedHierarchyService, corrigido na Fase A) — nunca fica
-- em branco.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sortiment_hierarchy_adjustments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  division_id text        NOT NULL,
  parent_path text        NOT NULL,  -- "Categoria" ou "Categoria::Subcategoria"
  node_name   text        NOT NULL,  -- subcategoria ou linha sendo ajustada
  pct         numeric     NOT NULL CHECK (pct >= 0 AND pct <= 100),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  UNIQUE (tenant_id, season_id, division_id, parent_path, node_name)
);

CREATE INDEX IF NOT EXISTS sortiment_hierarchy_adjustments_lookup_idx
  ON public.sortiment_hierarchy_adjustments (tenant_id, season_id, division_id, parent_path);

ALTER TABLE public.sortiment_hierarchy_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_sortiment_hierarchy_adjustments
  ON public.sortiment_hierarchy_adjustments FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_sortiment_hierarchy_adjustments
  ON public.sortiment_hierarchy_adjustments FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_sortiment_hierarchy_adjustments
  ON public.sortiment_hierarchy_adjustments FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_sortiment_hierarchy_adjustments
  ON public.sortiment_hierarchy_adjustments FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.sortiment_hierarchy_adjustments IS
  'Ajuste manual (%) de participação de um nó (subcategoria ou linha) dentro '
  'do pai imediato, na Fase B da Cascata do Sortimento (M6). parent_path usa '
  '"Categoria" para subcategorias e "Categoria::Subcategoria" para linhas. '
  'Sem linha aqui, o nó usa o peso histórico real já calculado pela cascata.';
