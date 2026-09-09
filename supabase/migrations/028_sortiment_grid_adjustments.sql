-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 028 — sortiment_grid_adjustments (Cascata do Sortimento, Fase A)
--
-- Aba 1 da Cascata do Sortimento (M6): um card por categoria, com um grid
-- Faixa de Preço (P1/P2/P3) × Nível de Moda/Risco (básico/motor_giro/
-- sustentador/icone). Cada célula nasce de um peso real (histórico da
-- categoria por nível de risco × Pirâmide de Preço da categoria) e pode ser
-- ajustada manualmente pelo usuário em % — este ajuste é o que fica gravado
-- aqui. Sem override salvo, a célula usa o valor calculado (nunca um valor
-- "em branco" — ver feedback_engines_and_cascading_plan na memória do
-- projeto: a tela nunca deve abrir sem plano).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sortiment_grid_adjustments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  season_id   text        NOT NULL,
  division_id text        NOT NULL,
  category    text        NOT NULL,
  price_tier  text        NOT NULL CHECK (price_tier IN ('p1', 'p2', 'p3')),
  risk_level  text        NOT NULL CHECK (risk_level IN ('basico', 'motor_giro', 'sustentador', 'icone')),
  pct         numeric     NOT NULL CHECK (pct >= 0 AND pct <= 100),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  UNIQUE (tenant_id, season_id, division_id, category, price_tier, risk_level)
);

CREATE INDEX IF NOT EXISTS sortiment_grid_adjustments_lookup_idx
  ON public.sortiment_grid_adjustments (tenant_id, season_id, division_id, category);

ALTER TABLE public.sortiment_grid_adjustments ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão real de produção usado em division_hierarchy_consolidated/
-- sortiment_plans (get_tenant_id() + is_super_admin(), 4 policies por operação).
CREATE POLICY tenant_select_sortiment_grid_adjustments
  ON public.sortiment_grid_adjustments FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_sortiment_grid_adjustments
  ON public.sortiment_grid_adjustments FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_sortiment_grid_adjustments
  ON public.sortiment_grid_adjustments FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_sortiment_grid_adjustments
  ON public.sortiment_grid_adjustments FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.sortiment_grid_adjustments IS
  'Ajuste manual (%) por célula do grid Faixa de Preço × Nível de Risco, por '
  'categoria, na Aba 1 da Cascata do Sortimento (M6). Sem linha aqui, a célula '
  'usa o valor calculado (histórico real da categoria × Pirâmide de Preço) — '
  'nunca fica em branco.';
