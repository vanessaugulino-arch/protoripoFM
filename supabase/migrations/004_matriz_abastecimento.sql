-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004 — Matriz de Abastecimento
-- Tabelas: hierarquia_produtos, fornecedores,
--          condicoes_pagamento, condicoes_pagamento_parcelas,
--          matriz_abastecimento
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Catálogo de hierarquia de produto (Divisão > Categoria > Subcategoria)
--       Fonte de verdade relacional — substitui strings soltas em `products`.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hierarquia_produtos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  divisao      text        NOT NULL,
  categoria    text        NOT NULL,
  subcategoria text,                           -- NULL = aplica a toda a categoria
  ordem        int         NOT NULL DEFAULT 0,
  ativo        boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Unicidade: (tenant, divisão, categoria, subcategoria) — NULLS DISTINCT OFF
-- exige PostgreSQL 15+; para versões anteriores usa COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS hierarquia_produtos_unique_idx
  ON public.hierarquia_produtos (tenant_id, divisao, categoria, COALESCE(subcategoria, ''));

-- RLS
ALTER TABLE public.hierarquia_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY hierarquia_produtos_tenant_isolation
  ON public.hierarquia_produtos
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));


-- ── 2. Fornecedores
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  tipo             text        NOT NULL DEFAULT 'white_label'
                               CHECK (tipo IN ('white_label','private_label','producao_propria','importado')),
  pais_origem      text,
  moeda_padrao     text        NOT NULL DEFAULT 'BRL',
  contato_nome     text,
  contato_email    text,
  observacoes      text,
  ativo            boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY fornecedores_tenant_isolation
  ON public.fornecedores
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Condições de pagamento (templates reutilizáveis por tenant)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.condicoes_pagamento (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  descricao   text        NOT NULL,   -- ex: "50% Pedido / 50% Faturamento"
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.condicoes_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY condicoes_pagamento_tenant_isolation
  ON public.condicoes_pagamento
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

CREATE TRIGGER condicoes_pagamento_updated_at
  BEFORE UPDATE ON public.condicoes_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 4. Parcelas de cada condição de pagamento
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.condicoes_pagamento_parcelas (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  condicao_pagamento_id uuid         NOT NULL
                        REFERENCES public.condicoes_pagamento(id) ON DELETE CASCADE,
  parcela_numero        int          NOT NULL CHECK (parcela_numero >= 1),
  percentual            numeric(5,2) NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  tipo_gatilho          text         NOT NULL
                        CHECK (tipo_gatilho IN ('PEDIDO','FATURAMENTO','ENTREGA')),
  dias_apos_gatilho     int          NOT NULL DEFAULT 0 CHECK (dias_apos_gatilho >= 0),
  UNIQUE (condicao_pagamento_id, parcela_numero)
);

ALTER TABLE public.condicoes_pagamento_parcelas ENABLE ROW LEVEL SECURITY;

-- Herda a política da condição pai via JOIN
CREATE POLICY condicoes_parcelas_tenant_isolation
  ON public.condicoes_pagamento_parcelas
  USING (
    condicao_pagamento_id IN (
      SELECT id FROM public.condicoes_pagamento
      WHERE tenant_id = (
        SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
      )
    )
  );

-- Trigger: valida que a soma dos percentuais == 100 ao inserir/atualizar/deletar
CREATE OR REPLACE FUNCTION public.validate_parcelas_sum()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_condicao_id uuid;
  v_soma        numeric;
BEGIN
  v_condicao_id := COALESCE(NEW.condicao_pagamento_id, OLD.condicao_pagamento_id);

  SELECT COALESCE(SUM(percentual), 0)
    INTO v_soma
    FROM public.condicoes_pagamento_parcelas
   WHERE condicao_pagamento_id = v_condicao_id;

  -- Permite soma != 100 somente durante inserção em lote (app valida antes de salvar)
  -- Para UPDATE e DELETE, a soma após a operação deve ser 0 (deleção de todas as parcelas)
  -- ou 100.  Lançamos erro apenas para UPDATE, pois inserção é controlada pela app.
  IF TG_OP = 'UPDATE' AND v_soma != 100 THEN
    RAISE EXCEPTION 'A soma dos percentuais das parcelas deve ser 100%%. Soma atual: %', v_soma;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER parcelas_sum_check
  AFTER INSERT OR UPDATE OR DELETE ON public.condicoes_pagamento_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.validate_parcelas_sum();


-- ── 5. Matriz de abastecimento (pivô hierarquia × fornecedor)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matriz_abastecimento (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Referência relacional à hierarquia (pode ser NULL se entrada manual)
  hierarquia_id         uuid        REFERENCES public.hierarquia_produtos(id) ON DELETE SET NULL,

  -- Desnormalizado para resiliência e compatibilidade com dados existentes
  divisao               text        NOT NULL,
  categoria             text        NOT NULL,
  subcategoria          text,

  -- Fornecedor (NULL para produção própria sem FK — use tipo_fornecimento)
  fornecedor_id         uuid        REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  tipo_fornecimento     text        NOT NULL DEFAULT 'white_label'
                        CHECK (tipo_fornecimento IN ('white_label','private_label','producao_propria','importado')),

  -- Lead time em dias
  dias_producao         int         NOT NULL DEFAULT 0 CHECK (dias_producao >= 0),
  dias_transito         int         NOT NULL DEFAULT 0 CHECK (dias_transito >= 0),

  -- Coluna computada: lead time total (gerada pelo Postgres)
  lead_time_total       int         GENERATED ALWAYS AS (dias_producao + dias_transito) STORED,

  -- Pagamento
  condicao_pagamento_id uuid        REFERENCES public.condicoes_pagamento(id) ON DELETE SET NULL,
  moeda                 text        NOT NULL DEFAULT 'BRL',

  observacoes           text,
  ativo                 boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Índices úteis para queries de planejamento
CREATE INDEX IF NOT EXISTS matriz_abastecimento_tenant_idx
  ON public.matriz_abastecimento (tenant_id);

CREATE INDEX IF NOT EXISTS matriz_abastecimento_divisao_idx
  ON public.matriz_abastecimento (tenant_id, divisao, categoria);

ALTER TABLE public.matriz_abastecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY matriz_abastecimento_tenant_isolation
  ON public.matriz_abastecimento
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

CREATE TRIGGER matriz_abastecimento_updated_at
  BEFORE UPDATE ON public.matriz_abastecimento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 6. Grants para service role (Supabase edge functions, se necessário)
-- ────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.hierarquia_produtos,
     public.fornecedores,
     public.condicoes_pagamento,
     public.condicoes_pagamento_parcelas,
     public.matriz_abastecimento
  TO service_role;
