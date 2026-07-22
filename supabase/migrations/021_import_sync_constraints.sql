-- 021_import_sync_constraints.sql
-- Constraints exigidas pela sincronização automática pós-importação de catálogo
-- (syncFromCatalogImport em src/services/importService.ts).
--
-- Sem estas constraints, os upserts de seasons/collections/hierarquia_produtos
-- falham silenciosamente e os cards de Temporadas, Coleções e Hierarquia em
-- Configurações de Operação permanecem vazios mesmo após um import bem-sucedido.

-- ── seasons: upsert por (tenant_id, name) ─────────────────────────────────────
DELETE FROM seasons a USING seasons b
WHERE a.ctid > b.ctid AND a.tenant_id = b.tenant_id AND a.name = b.name;

CREATE UNIQUE INDEX IF NOT EXISTS seasons_tenant_name_uidx
  ON public.seasons (tenant_id, name);

-- ── collections: upsert por (tenant_id, season_id, name) ──────────────────────
DELETE FROM collections a USING collections b
WHERE a.ctid > b.ctid AND a.tenant_id = b.tenant_id
  AND a.season_id = b.season_id AND a.name = b.name;

CREATE UNIQUE INDEX IF NOT EXISTS collections_tenant_season_name_uidx
  ON public.collections (tenant_id, season_id, name);

-- ── hierarquia_produtos: subcategoria upsertável ──────────────────────────────
-- O índice antigo usava COALESCE(subcategoria,'') como expressão, que o PostgREST
-- não aceita em on_conflict. Normaliza subcategoria para '' (nunca NULL) e recria
-- o índice único com colunas simples, compatível com upsert.
UPDATE hierarquia_produtos SET subcategoria = '' WHERE subcategoria IS NULL;

ALTER TABLE hierarquia_produtos
  ALTER COLUMN subcategoria SET DEFAULT '',
  ALTER COLUMN subcategoria SET NOT NULL;

DROP INDEX IF EXISTS hierarquia_produtos_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS hierarquia_produtos_tenant_div_cat_sub_uidx
  ON public.hierarquia_produtos (tenant_id, divisao, categoria, subcategoria);
