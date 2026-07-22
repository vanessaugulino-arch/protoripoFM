-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 015 — Períodos de venda por canal dentro da temporada
--
-- Problema: canais diferentes (atacado, varejo, e-commerce, multimarca…)
-- vendem a mesma coleção em janelas de tempo distintas. O atacado fatura
-- até 2 meses antes do varejo; multimarca recebe o pack no início da
-- coleção e pode haver reposições; varejo próprio vende ao longo de todo
-- o período. O sistema precisa registrar isso por canal por temporada.
--
-- Mudanças:
--   seasons                → + canal_periods_unified (bool, default true)
--   canal_temporada_config → criação formal da tabela + coluna mes_fim
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Flag de unificação de períodos por temporada ──────────────────────────
-- true  → todos os canais operam no mesmo período da temporada (comportamento atual)
-- false → cada canal tem seu próprio mesInicio e mesFim em canal_temporada_config

ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS canal_periods_unified boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.seasons.canal_periods_unified IS
  'true = todos os canais vendem no mesmo período (mesInicio/mesFim da temporada). '
  'false = cada canal tem período próprio em canal_temporada_config.';


-- ── 2. Tabela canal_temporada_config — criação formal com mes_fim ─────────────
-- Esta tabela existia sem migration formal. Criamos com IF NOT EXISTS e
-- adicionamos mes_fim para completar a representação de período por canal.

CREATE TABLE IF NOT EXISTS public.canal_temporada_config (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  season_id  uuid        NOT NULL REFERENCES public.seasons(id)  ON DELETE CASCADE,
  canal_id   text        NOT NULL,
  mes_inicio text        NOT NULL,
  mes_fim    text,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, season_id, canal_id)
);

-- Adiciona mes_fim caso a tabela já existisse sem a coluna
ALTER TABLE public.canal_temporada_config
  ADD COLUMN IF NOT EXISTS mes_fim text;

COMMENT ON COLUMN public.canal_temporada_config.canal_id   IS
  'Identificador do canal: varejo | ecommerce | atacado | multimarca | franquia | popup | marketplace | social_commerce';
COMMENT ON COLUMN public.canal_temporada_config.mes_inicio IS
  'Mês de início das vendas deste canal na temporada. Sobrepõe seasons.month_start para este canal.';
COMMENT ON COLUMN public.canal_temporada_config.mes_fim    IS
  'Mês de fim das vendas deste canal na temporada. NULL = usa seasons.month_end. Sobrepõe para este canal.';


-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.canal_temporada_config ENABLE ROW LEVEL SECURITY;

-- Policy idempotente via bloco DO
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'canal_temporada_config'
      AND policyname = 'tenant_isolation_canal_temporada_config'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "tenant_isolation_canal_temporada_config"
        ON public.canal_temporada_config
        USING (
          tenant_id = (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
          )
        )
    $policy$;
  END IF;
END
$$;


-- ── 4. Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS canal_temporada_config_tenant_season_idx
  ON public.canal_temporada_config (tenant_id, season_id);
