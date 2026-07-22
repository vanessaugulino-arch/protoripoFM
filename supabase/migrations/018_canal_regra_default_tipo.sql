-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 018 — Adiciona coluna tipo em canal_regra_default
--
-- Permite que o mesmo canal tenha períodos de venda distintos para Verão e
-- Inverno, alinhando a tabela de regras padrão ao modelo de duas temporadas.
--
-- Antes: UNIQUE (tenant_id, canal_id)          → 1 período por canal
-- Depois: UNIQUE (tenant_id, canal_id, tipo)   → 1 período por canal × tipo
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Adiciona coluna tipo com default 'verao' (registros existentes ficam como verao)
ALTER TABLE public.canal_regra_default
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'verao';

-- 2. Adiciona check constraint
ALTER TABLE public.canal_regra_default
  ADD CONSTRAINT canal_regra_default_tipo_check
  CHECK (tipo IN ('verao', 'inverno'));

-- 3. Remove unique constraint antiga (apenas tenant_id + canal_id)
ALTER TABLE public.canal_regra_default
  DROP CONSTRAINT IF EXISTS canal_regra_default_tenant_id_canal_id_key;

-- 4. Nova unique: mesmo canal pode ter período diferente para cada tipo
ALTER TABLE public.canal_regra_default
  ADD CONSTRAINT canal_regra_default_tenant_canal_tipo_key
  UNIQUE (tenant_id, canal_id, tipo);
