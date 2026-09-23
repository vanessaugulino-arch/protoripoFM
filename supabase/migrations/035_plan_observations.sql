-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 035 — plan_observations
--
-- Campo de observação (texto livre, sem limite de caracteres) — uma nota
-- única por tela, por temporada/ciclo em edição. Pedido da usuária ao
-- desenhar a tela de Entrega Final: o plano precisa carregar o "porquê"
-- das decisões (ex.: "aumento de margem via redução de remarcação,
-- compensando participação exagerada não planejada no ciclo anterior"),
-- não só os números.
--
-- Uma tabela genérica serve as 5 telas (M1-M5) em vez de 5 tabelas quase
-- idênticas — `module` identifica a tela, `season_key` é o que aquela tela
-- usa pra escopar o plano (ano fiscal em M1/M2/M3, id da temporada em
-- M4/M5). M6 já tem sua própria tabela por categoria
-- (sortiment_category_notes) — não entra aqui.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plan_observations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  module      text        NOT NULL CHECK (module IN ('m1_estrategico', 'm2_canal', 'm3_sazonalidade', 'm4_divisao', 'm5_colecao')),
  season_key  text        NOT NULL,  -- ano fiscal (M1/M2/M3) ou id da temporada (M4/M5), sempre como texto
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  UNIQUE (tenant_id, module, season_key)
);

CREATE INDEX IF NOT EXISTS plan_observations_lookup_idx
  ON public.plan_observations (tenant_id, module, season_key);

ALTER TABLE public.plan_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_plan_observations
  ON public.plan_observations FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

CREATE POLICY tenant_insert_plan_observations
  ON public.plan_observations FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY tenant_update_plan_observations
  ON public.plan_observations FOR UPDATE
  USING (tenant_id = get_tenant_id());

CREATE POLICY tenant_delete_plan_observations
  ON public.plan_observations FOR DELETE
  USING (tenant_id = get_tenant_id());

COMMENT ON TABLE public.plan_observations IS
  'Nota única de texto livre por tela (M1-M5) e por temporada/ciclo — o '
  '"porquê" das decisões do plano, sem limite de caracteres. M6 usa sua '
  'própria tabela (sortiment_category_notes, por categoria).';
