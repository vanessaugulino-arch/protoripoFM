-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009 — Matriz de Abastecimento v2
-- Novo modelo: começa pelo tipo de fornecedor (não pela hierarquia de produto)
-- Tabelas:
--   supply_fornecedores          — dados do fornecedor + lead time + pagamento
--   supply_fornecedor_categorias — escopo de categorias atendidas + % custo médio
--   supply_etapas_servico        — etapas de produção (tipo = 'servico')
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. supply_fornecedores ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supply_fornecedores (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome                 text         NOT NULL,
  codigo_erp           text,
  tipo_fornecedor      text         NOT NULL
                                    CHECK (tipo_fornecedor IN ('materia_prima','servico','produto_acabado')),
  origem               text         CHECK (origem IN ('nacional','internacional')),
  -- Lead time: dias após confirmação do pedido pelo fornecedor
  prazo_entrega_dias   integer      NOT NULL DEFAULT 30,
  -- Pagamento
  pagamento_tipo       text         NOT NULL DEFAULT 'a_prazo'
                                    CHECK (pagamento_tipo IN ('a_vista','a_prazo')),
  pagamento_gatilho    text         CHECK (pagamento_gatilho IN ('pedido','faturamento','entrega')),
  pagamento_dias       integer      NOT NULL DEFAULT 0,  -- dias após o gatilho
  observacoes          text,
  ativo                boolean      NOT NULL DEFAULT true,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supply_fornecedores_tenant_tipo_idx
  ON public.supply_fornecedores (tenant_id, tipo_fornecedor);

ALTER TABLE public.supply_fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supply_fornecedores_tenant ON public.supply_fornecedores;
CREATE POLICY supply_fornecedores_tenant ON public.supply_fornecedores
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- ── 2. supply_fornecedor_categorias ─────────────────────────────────────────
-- Escopo opcional: quais divisões/categorias este fornecedor atende
-- NULL em divisao  = todos
-- NULL em categoria = toda a divisão
-- NULL em subcategoria = toda a categoria
-- pct_custo_medio: % médio que este insumo representa do custo médio do produto

CREATE TABLE IF NOT EXISTS public.supply_fornecedor_categorias (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid         NOT NULL,
  fornecedor_id    uuid         NOT NULL
                                REFERENCES public.supply_fornecedores(id) ON DELETE CASCADE,
  divisao          text,        -- NULL = todas as divisões
  categoria        text,        -- NULL = toda a divisão
  subcategoria     text,
  pct_custo_medio  numeric(5,2) NOT NULL DEFAULT 0,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supply_cat_fornecedor_idx
  ON public.supply_fornecedor_categorias (fornecedor_id);

ALTER TABLE public.supply_fornecedor_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supply_cat_tenant ON public.supply_fornecedor_categorias;
CREATE POLICY supply_cat_tenant ON public.supply_fornecedor_categorias
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- ── 3. supply_etapas_servico ─────────────────────────────────────────────────
-- Para fornecedores tipo = 'servico': etapas do processo produtivo
-- Uma facção pode ser responsável por 1 ou mais etapas em sequência
-- tipo_entrega define o estado do produto após esta etapa

CREATE TABLE IF NOT EXISTS public.supply_etapas_servico (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid         NOT NULL,
  fornecedor_id     uuid         NOT NULL
                                 REFERENCES public.supply_fornecedores(id) ON DELETE CASCADE,
  divisao           text,
  categoria         text,
  sequencia         integer      NOT NULL DEFAULT 1,
  nome_etapa        text         NOT NULL,
  prazo_etapa_dias  integer      NOT NULL DEFAULT 15,
  tipo_entrega      text         NOT NULL DEFAULT 'semi_acabado'
                                 CHECK (tipo_entrega IN (
                                   'semi_acabado',   -- produto parcial → próxima facção
                                   'acabado',        -- produto pronto para estoque
                                   'white_label',    -- produto pronto com marca própria
                                   'private_label'   -- produto desenvolvido exclusivamente
                                 )),
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supply_etapas_fornecedor_idx
  ON public.supply_etapas_servico (fornecedor_id, sequencia);

ALTER TABLE public.supply_etapas_servico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supply_etapas_tenant ON public.supply_etapas_servico;
CREATE POLICY supply_etapas_tenant ON public.supply_etapas_servico
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- ── 4. Trigger: atualiza updated_at em supply_fornecedores ──────────────────

CREATE OR REPLACE FUNCTION public.supply_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS supply_fornecedores_updated_at ON public.supply_fornecedores;
CREATE TRIGGER supply_fornecedores_updated_at
  BEFORE UPDATE ON public.supply_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.supply_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA SOBRE CÁLCULO DE ORÇAMENTO POR PERÍODO
-- ─────────────────────────────────────────────────────────────────────────
-- A função calcBudgetProjection (frontend/TypeScript) usa:
--
--   1. Para cada mês M do plano:
--      custo_produto[M] = receita[M] × (1 − margem%)
--
--   2. Para cada fornecedor ativo com escopo definido:
--      valor_fornecedor[M] = custo_produto[M] × média(pct_custo_medio)
--
--   3. Data do pedido:
--      mes_pedido = M − ceil(prazo_entrega_dias / 30)
--
--   4. Data do pagamento (conforme gatilho):
--      'pedido'      → mes_pedido + ceil(pagamento_dias / 30)
--      'faturamento' → M (entrega) + ceil(pagamento_dias / 30)
--      'entrega'     → M + ceil(pagamento_dias / 30)
--
--   5. Acumulado:
--      orcamento_projetado[mes_pagamento] += valor_fornecedor[M]
--
-- A média de pct_custo_medio é calculada considerando todos os registros em
-- supply_fornecedor_categorias para aquele fornecedor (ou filtrada por divisão
-- se o plano for por divisão). O sistema usa a média simples quando não há
-- pesos diferenciados por categoria.
-- ═══════════════════════════════════════════════════════════════════════════
