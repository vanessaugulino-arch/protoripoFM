-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005 — Enriquecimento de Produtos: color_group
-- Adiciona a coluna color_group à tabela products para armazenar o grupo de
-- cor normalizado (derivado do mapeamento cor bruta do fornecedor → grupo).
--
-- Exemplos de mapeamento aplicados durante a importação:
--   Telha      → Marrom Médio
--   Terracota  → Marrom Médio
--   Ferrugem   → Marrom Médio
--   Marinho    → Azul Marinho
--   Off-White  → Branco
--   Mescla     → Cinza
-- ═══════════════════════════════════════════════════════════════════════════

-- ── color_group: grupo de cor normalizado para análise de sortimento ────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS color_group text;

COMMENT ON COLUMN public.products.color_group IS
  'Grupo de cor normalizado derivado do mapeamento cor_bruta→grupo durante importação. '
  'Exemplos: Telha→Marrom Médio, Terracota→Marrom Médio, Marinho→Azul Marinho.';

-- Índice para filtros e agrupamentos em análises de sortimento
CREATE INDEX IF NOT EXISTS products_color_group_idx
  ON public.products (tenant_id, color_group)
  WHERE color_group IS NOT NULL;
