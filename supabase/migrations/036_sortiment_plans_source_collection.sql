-- 036_sortiment_plans_source_collection.sql
-- Linhagem M6 → M5: registra de qual Plano de Coleção (collection_plans) o
-- plano de trabalho do Sortimento (sortiment_plans) foi semeado. Antes o M6
-- nunca lia collection_plans — bootstrapava só do M4 (division_scenarios) — e
-- não havia como saber, depois, em cima de qual cenário do M5 ele foi montado.

ALTER TABLE public.sortiment_plans
  ADD COLUMN IF NOT EXISTS source_collection_plan_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sortiment_plans_source_collection_fk'
  ) THEN
    ALTER TABLE public.sortiment_plans
      ADD CONSTRAINT sortiment_plans_source_collection_fk
      FOREIGN KEY (source_collection_plan_id)
      REFERENCES public.collection_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.sortiment_plans.source_collection_plan_id IS
  'Plano de Coleção (M5, collection_plans.id) usado como base para semear as collections deste plano de trabalho do Sortimento (M6). NULL = montado do zero / só a partir do M4.';
