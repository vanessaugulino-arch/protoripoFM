-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 006 — Perfis de Produto: renomear valores de risk_level
--
-- Alinha os valores da coluna risk_level na tabela products com os 3 perfis
-- do e-book "O Preço Perfeito" (TFO):
--
--   Antes       →  Depois
--   ───────────────────────────────────────────────
--   Básico      →  Sustentador de Margem
--   Moda        →  Motor de Giro
--   Alta Moda   →  Ícone de Marca
--
-- NOTA: "Porta de Entrada" NÃO é um perfil de produto — é a faixa P1.
-- Qualquer perfil pode estar em P1/P2/P3 (coluna price_tier).
-- Concentração típica: Ícone → P3; Motor de Giro → P1/P2; Sustentador → P1/P2.
--
-- Também atualiza price_tier para nomenclatura P1/P2/P3.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Migrar perfis de produto (risk_level) ─────────────────────────────────
UPDATE public.products
   SET risk_level = 'Sustentador de Margem'
 WHERE risk_level IN ('Básico', 'Básicos');

UPDATE public.products
   SET risk_level = 'Motor de Giro'
 WHERE risk_level IN ('Moda');

UPDATE public.products
   SET risk_level = 'Ícone de Marca'
 WHERE risk_level IN ('Alta Moda');

-- ── 2. Migrar faixas de preço (price_tier) para P1/P2/P3 ────────────────────
UPDATE public.products
   SET price_tier = 'P1'
 WHERE price_tier IN ('Entrada', 'entrada');

UPDATE public.products
   SET price_tier = 'P2'
 WHERE price_tier IN ('Médio', 'medio', 'Medio');

UPDATE public.products
   SET price_tier = 'P3'
 WHERE price_tier IN ('Premium', 'premium', 'Luxo', 'luxo');

-- ── 3. CHECK CONSTRAINT — apenas os 3 perfis canônicos são aceitos ───────────
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_risk_level_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_risk_level_check
  CHECK (
    risk_level IS NULL
    OR risk_level IN (
      'Sustentador de Margem',
      'Motor de Giro',
      'Ícone de Marca'
    )
  );

-- ── 4. CHECK CONSTRAINT — apenas P1/P2/P3 são aceitos em price_tier ─────────
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_price_tier_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_price_tier_check
  CHECK (
    price_tier IS NULL
    OR price_tier IN ('P1', 'P2', 'P3')
  );

-- ── 5. Índices ────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.products_risk_level_idx;
CREATE INDEX products_risk_level_idx
  ON public.products (tenant_id, risk_level)
  WHERE risk_level IS NOT NULL;

DROP INDEX IF EXISTS public.products_price_tier_idx;
CREATE INDEX products_price_tier_idx
  ON public.products (tenant_id, price_tier)
  WHERE price_tier IS NOT NULL;

-- ── 6. Comentários ────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.products.risk_level IS
  'Perfil de produto (e-book "O Preço Perfeito", TFO): '
  'Sustentador de Margem | Motor de Giro | Ícone de Marca. '
  'Independente da faixa de preço (price_tier).';

COMMENT ON COLUMN public.products.price_tier IS
  'Faixa de preço: P1 = entrada, P2 = médio, P3 = premium/alto. '
  'Qualquer perfil pode estar em qualquer faixa, mas há concentração natural: '
  'Ícone de Marca → P3; Motor de Giro e Sustentador → P1/P2.';
