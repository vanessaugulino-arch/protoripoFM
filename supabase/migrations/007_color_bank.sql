-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 007 — Banco de Cores Global
--
-- Tabela global (sem isolamento por tenant) que acumula mapeamentos de
-- cor bruta → família + intensidade, contribuídos por todos os clientes.
--
-- Fluxo:
--   1. Usuário vê na tela de Configurações a lista de cores dos seus
--      produtos que ainda não constam no banco.
--   2. Para cada cor, seleciona ou digita família e intensidade.
--   3. O sistema salva em color_bank e atualiza products.color_group
--      para esse tenant (e silenciosamente para qualquer outro tenant
--      que tenha a mesma cor bruta no futuro).
--
-- color_group gerado = familia || ' ' || intensidade
--   Ex.: "Azul" + "Marinho" → "Azul Marinho"
--        "Vermelho" + "Médio" → "Vermelho Médio"
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela color_bank (dicionário global) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.color_bank (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave de lookup normalizada: lower(trim(cor_bruta))
  -- Garante que "Marinho", "marinho", "MARINHO" mapeiam para a mesma entrada
  cor_norm             text        NOT NULL,

  -- Nome original da cor (como o primeiro cliente que classificou)
  cor_display          text        NOT NULL,

  -- Classificação
  familia              text        NOT NULL,
  intensidade          text        NOT NULL,

  -- Rótulo composto usado em products.color_group
  color_group          text        GENERATED ALWAYS AS (familia || ' ' || intensidade) STORED,

  -- Metadados de contribuição (auditoria, não é isolamento)
  contributed_by_tenant uuid       REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT color_bank_cor_norm_unique UNIQUE (cor_norm)
);

COMMENT ON TABLE public.color_bank IS
  'Dicionário global de cores: mapeia cor bruta → família + intensidade. '
  'Compartilhado entre todos os tenants — cada novo cliente se beneficia das '
  'classificações já feitas por clientes anteriores.';

COMMENT ON COLUMN public.color_bank.cor_norm IS
  'Chave de lookup: lower(trim(cor_display)). Garante equivalência case-insensitive.';

COMMENT ON COLUMN public.color_bank.color_group IS
  'Rótulo composto gerado automaticamente: familia || '' '' || intensidade. '
  'Escrito em products.color_group para análises de sortimento.';

-- Índice para busca rápida por familia (análises de paleta)
CREATE INDEX IF NOT EXISTS color_bank_familia_idx
  ON public.color_bank (familia);

-- Índice composto família + intensidade
CREATE INDEX IF NOT EXISTS color_bank_group_idx
  ON public.color_bank (familia, intensidade);


-- ── 2. RLS — Leitura pública (autenticada), escrita por qualquer tenant ──────
ALTER TABLE public.color_bank ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler o banco completo
CREATE POLICY color_bank_select
  ON public.color_bank
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Qualquer usuário autenticado pode inserir novas entradas
CREATE POLICY color_bank_insert
  ON public.color_bank
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Qualquer usuário autenticado pode atualizar entradas (incluindo corrigir família/intensidade)
CREATE POLICY color_bank_update
  ON public.color_bank
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);


-- ── 3. Trigger para manter updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER color_bank_set_updated_at
  BEFORE UPDATE ON public.color_bank
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 4. Função auxiliar: classifica cor e atualiza products ───────────────────
-- Classifica uma cor no banco global e propaga color_group para todos os
-- produtos de todos os tenants que tenham aquela cor bruta.
-- Uso: SELECT classify_color('marinho', 'Marinho', 'Azul', 'Marinho', '<tenant_uuid>');
CREATE OR REPLACE FUNCTION public.classify_color(
  p_cor_norm    text,
  p_cor_display text,
  p_familia     text,
  p_intensidade text,
  p_tenant_id   uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_color_group text := p_familia || ' ' || p_intensidade;
BEGIN
  -- Upsert no banco global
  INSERT INTO public.color_bank (cor_norm, cor_display, familia, intensidade, contributed_by_tenant)
    VALUES (p_cor_norm, p_cor_display, p_familia, p_intensidade, p_tenant_id)
  ON CONFLICT (cor_norm) DO UPDATE
    SET familia              = EXCLUDED.familia,
        intensidade          = EXCLUDED.intensidade,
        updated_at           = now();

  -- Propaga para products do tenant atual (case-insensitive na cor bruta)
  UPDATE public.products
    SET color_group = v_color_group
  WHERE tenant_id = p_tenant_id
    AND lower(trim(color)) = p_cor_norm
    AND (color_group IS NULL OR color_group <> v_color_group);
END;
$$;

COMMENT ON FUNCTION public.classify_color IS
  'Upserta no banco global de cores e propaga color_group para os produtos '
  'do tenant informado. Chamada pela UI do card Banco de Cores.';


-- ── 5. Seed: famílias e intensidades padrão (exemplos) ───────────────────────
-- Inseridos apenas se a tabela estiver vazia para não sobrescrever dados reais.
-- Estes registros servem de referência para os comboboxes.
INSERT INTO public.color_bank (cor_norm, cor_display, familia, intensidade)
SELECT * FROM (VALUES
  -- Azuis
  ('azul',        'Azul',        'Azul',    'Médio'),
  ('marinho',     'Marinho',     'Azul',    'Marinho'),
  ('royal',       'Royal',       'Azul',    'Royal'),
  ('jeans',       'Jeans',       'Azul',    'Jeans'),
  ('turquesa',    'Turquesa',    'Azul',    'Turquesa'),
  ('serenity',    'Serenity',    'Azul',    'Claro'),
  -- Vermelhos
  ('vermelho',    'Vermelho',    'Vermelho','Médio'),
  ('vinho',       'Vinho',       'Vermelho','Escuro'),
  ('bordo',       'Bordô',       'Vermelho','Escuro'),
  ('coral',       'Coral',       'Vermelho','Claro'),
  ('terracota',   'Terracota',   'Vermelho','Terra'),
  -- Verdes
  ('verde',       'Verde',       'Verde',   'Médio'),
  ('militar',     'Militar',     'Verde',   'Escuro'),
  ('menta',       'Menta',       'Verde',   'Claro'),
  ('musgo',       'Musgo',       'Verde',   'Escuro'),
  ('lima',        'Lima',        'Verde',   'Neon'),
  -- Amarelos
  ('amarelo',     'Amarelo',     'Amarelo', 'Médio'),
  ('mostarda',    'Mostarda',    'Amarelo', 'Escuro'),
  ('champagne',   'Champagne',   'Amarelo', 'Claro'),
  -- Rosas
  ('rosa',        'Rosa',        'Rosa',    'Médio'),
  ('rose',        'Rosê',        'Rosa',    'Claro'),
  ('pink',        'Pink',        'Rosa',    'Neon'),
  ('blush',       'Blush',       'Rosa',    'Claro'),
  ('fuchsia',     'Fúcsia',      'Rosa',    'Escuro'),
  -- Laranjas
  ('laranja',     'Laranja',     'Laranja', 'Médio'),
  ('salmao',      'Salmão',      'Laranja', 'Claro'),
  ('peach',       'Pêssego',     'Laranja', 'Claro'),
  -- Roxos
  ('roxo',        'Roxo',        'Roxo',    'Médio'),
  ('lilas',       'Lilás',       'Roxo',    'Claro'),
  ('uva',         'Uva',         'Roxo',    'Escuro'),
  ('lavanda',     'Lavanda',     'Roxo',    'Pastel'),
  -- Neutros
  ('branco',      'Branco',      'Branco',  'Puro'),
  ('off-white',   'Off-White',   'Branco',  'Gelo'),
  ('cru',         'Cru',         'Branco',  'Cru'),
  ('preto',       'Preto',       'Preto',   'Puro'),
  ('cinza',       'Cinza',       'Cinza',   'Médio'),
  ('grafite',     'Grafite',     'Cinza',   'Escuro'),
  ('mescla',      'Mescla',      'Cinza',   'Mescla'),
  ('prata',       'Prata',       'Cinza',   'Metálico'),
  -- Marrons e Beges
  ('bege',        'Bege',        'Bege',    'Claro'),
  ('areia',       'Areia',       'Bege',    'Claro'),
  ('caramelo',    'Caramelo',    'Marrom',  'Médio'),
  ('marrom',      'Marrom',      'Marrom',  'Médio'),
  ('chocolate',   'Chocolate',   'Marrom',  'Escuro'),
  ('ferrugem',    'Ferrugem',    'Marrom',  'Médio'),
  ('telha',       'Telha',       'Marrom',  'Médio'),
  -- Dourado / Metálico
  ('dourado',     'Dourado',     'Dourado', 'Metálico'),
  ('ouro',        'Ouro',        'Dourado', 'Metálico'),
  ('bronze',      'Bronze',      'Dourado', 'Escuro')
) AS t(cor_norm, cor_display, familia, intensidade)
WHERE NOT EXISTS (SELECT 1 FROM public.color_bank LIMIT 1);
