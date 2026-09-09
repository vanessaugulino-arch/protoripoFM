-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 030 — sortiment_created_nodes (Cascata do Sortimento, Fase C)
--
-- Fase C: o usuário cria um nó novo (subcategoria ou linha) que ainda não
-- existe no catálogo/histórico real — ex.: uma modelagem nova, uma linha que
-- a marca nunca vendeu antes. Ele informa em qual nó existente (irmão) o
-- novo vai se espelhar em performance/indicadores; o sistema projeta o
-- volume inicial a partir dessa referência (participação dividida ao meio
-- entre os dois — ver saveHierarchyNodeAdjustment, mesma mecânica da Fase B)
-- e o usuário ajusta os dois (e os demais irmãos) dali em diante com a
-- mesma edição por participação % já existente.
--
-- Esta tabela só registra QUE o nó existe e de quem ele nasceu (pra
-- renderizar e pro relatório de decisões da Fase E) — a participação em si
-- já fica em sortiment_hierarchy_adjustments (migration 029).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sortiment_created_nodes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  division_id text        NOT NULL,
  parent_path text        NOT NULL,  -- "Categoria" (nova subcategoria) ou "Categoria::Subcategoria" (nova linha)
  node_name   text        NOT NULL,
  mirror_of   text        NOT NULL, -- nome do irmão em quem este nó se espelhou
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  UNIQUE (tenant_id, season_id, division_id, parent_path, node_name)
);

CREATE INDEX IF NOT EXISTS sortiment_created_nodes_lookup_idx
  ON public.sortiment_created_nodes (tenant_id, season_id, division_id, parent_path);

ALTER TABLE public.sortiment_created_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_sortiment_created_nodes
  ON public.sortiment_created_nodes FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_sortiment_created_nodes
  ON public.sortiment_created_nodes FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_sortiment_created_nodes
  ON public.sortiment_created_nodes FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.sortiment_created_nodes IS
  'Nós (subcategoria/linha) criados manualmente pelo usuário na Fase C da '
  'Cascata do Sortimento (M6) — ainda não existem no catálogo/histórico '
  'real. mirror_of registra de qual irmão o novo nó herdou a performance '
  'inicial. A participação % em si vive em sortiment_hierarchy_adjustments.';
