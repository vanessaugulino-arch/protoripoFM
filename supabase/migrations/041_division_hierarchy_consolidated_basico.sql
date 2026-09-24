-- 041_division_hierarchy_consolidated_basico.sql
-- Reconcilia o risco "Básico" entre M4 e M6: a matriz de risco por divisão
-- (M4) virou 4 vias (Sustentador/Motor de Giro/Ícone/Básico), mas a tabela
-- que leva esse dado consolidado pro M6 só tinha 3 colunas.

ALTER TABLE public.division_hierarchy_consolidated
  ADD COLUMN IF NOT EXISTS pct_basico numeric;

COMMENT ON COLUMN public.division_hierarchy_consolidated.pct_basico IS
  '% Básico da matriz de risco da divisão (M4) — 4ª via, adicionada para reconciliar com o risco 4 vias já usado na grade Faixa×Risco do M6.';
