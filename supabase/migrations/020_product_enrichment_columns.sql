-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 020 — Colunas de Enriquecimento: cor separada + tipo de produção
--
-- Adiciona em public.products:
--   color_family    text  — família de cor (ex: "Marrom", "Azul")
--   color_intensity text  — intensidade/tom (ex: "Médio", "Royal", "Claro")
--   production_type text  — origem da produção (propria|faccao|importado|licenciado)
--
-- Fluxo de enriquecimento:
--   • color_family + color_intensity: preenchidos via import de enriquecimento de
--     cor (SKU + cor + família + intensidade) ou via classify_color() quando o
--     usuário classifica no Banco de Cores. Também atualiza color_group (combinado).
--   • production_type: preenchido via import de enriquecimento de produção
--     (SKU + tipo), tipicamente exportado do PLM do cliente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Novas colunas ─────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS color_family    text,
  ADD COLUMN IF NOT EXISTS color_intensity text,
  ADD COLUMN IF NOT EXISTS production_type text;

COMMENT ON COLUMN public.products.color_family IS
  'Família de cor derivada do color_bank. Ex: "Marrom", "Azul", "Verde". '
  'Preenchida automaticamente via enriquecimento ou classificação manual.';

COMMENT ON COLUMN public.products.color_intensity IS
  'Intensidade/tom de cor derivado do color_bank. Ex: "Médio", "Royal", "Claro". '
  'Preenchida automaticamente via enriquecimento ou classificação manual.';

COMMENT ON COLUMN public.products.production_type IS
  'Tipo de produção do SKU, tipicamente exportado do PLM do cliente. '
  'Valores aceitos: propria | faccao | importado | licenciado. '
  'Impacta lead time padrão e análise de risco de abastecimento.';

-- ── 2. Índices para filtros frequentes ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS products_color_family_idx
  ON public.products (tenant_id, color_family)
  WHERE color_family IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_production_type_idx
  ON public.products (tenant_id, production_type)
  WHERE production_type IS NOT NULL;

-- ── 3. Atualizar classify_color() para propagar color_family e color_intensity
--       além de color_group ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.classify_color(
  p_cor_norm    text,
  p_cor_display text,
  p_familia     text,
  p_intensidade text,
  p_tenant_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_color_group text := p_familia || ' ' || p_intensidade;
BEGIN
  -- Upsert no banco global de cores
  INSERT INTO public.color_bank (cor_norm, cor_display, familia, intensidade, contributed_by_tenant)
  VALUES (p_cor_norm, p_cor_display, p_familia, p_intensidade, p_tenant_id)
  ON CONFLICT (cor_norm) DO UPDATE
    SET familia              = EXCLUDED.familia,
        intensidade          = EXCLUDED.intensidade,
        cor_display          = EXCLUDED.cor_display,
        updated_at           = now();

  -- Propaga color_group + color_family + color_intensity para produtos do tenant
  -- que tenham a cor bruta correspondente e cujos campos diferem do novo valor
  UPDATE public.products
    SET color_group     = v_color_group,
        color_family    = p_familia,
        color_intensity = p_intensidade,
        updated_at      = now()
  WHERE tenant_id = p_tenant_id
    AND (
      lower(trim(color)) = p_cor_norm
      OR color_group     = v_color_group   -- atualiza mesmo se cor bruta difere mas grupo bate
    )
    AND (
      color_group     IS DISTINCT FROM v_color_group
      OR color_family    IS DISTINCT FROM p_familia
      OR color_intensity IS DISTINCT FROM p_intensidade
    );
END;
$$;

COMMENT ON FUNCTION public.classify_color IS
  'Upserta no banco global de cores e propaga color_group, color_family e '
  'color_intensity para os produtos do tenant com aquela cor bruta.';
