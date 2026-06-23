-- Migration 003: Catálogo granular de módulos/seções/ações para o sistema de permissões
-- Executar no SQL Editor do Supabase APÓS migrations 001 e 002
--
-- Convenção de level:
--   'module'  → Módulo de nível superior (agrupador)
--   'section' → Card ou seção dentro de um módulo
--   'action'  → Ação de aprovação/submissão
--
-- A chave 'code' é o identificador único usado em todo o sistema.

INSERT INTO public.modules (code, name, level, order_index) VALUES

-- ─── Módulo 1: Planejamento Estratégico Ano Fiscal ───────────────────────────
('mod1',                    'Módulo 1 — Planejamento Estratégico Ano Fiscal', 'module',  100),
('mod1_cenario_macro',      'Cenário Macroeconômico',                        'section', 101),
('mod1_indicadores',        'Indicadores Selecionados para Planejamento',    'section', 102),
('mod1_cenario_consolidado','Cenário Consolidado',                           'section', 103),
('mod1_cenarios_salvos',    'Cenários Salvos',                               'section', 104),
('mod1_ano_referencia',     'Ano de Referência',                             'section', 105),
('mod1_aprovar',            'Aplicar Metas — Aprovar Plano Estratégico',     'action',  106),

-- ─── Módulo 2: Planejamento de Metas por Canal ────────────────────────────────
('mod2',                    'Módulo 2 — Planejamento de Metas por Canal',    'module',  200),
('mod2_distribuicao_canal', 'Distribuição por Canal (% e R$)',               'section', 201),
('mod2_indicadores_canal',  'Indicadores por Canal — Simulador',             'section', 202),
('mod2_cenarios_salvos',    'Cenários Salvos — Canal',                       'section', 203),
('mod2_aprovar',            'Aplicar Metas Canal — Aprovar Distribuição',    'action',  204),

-- ─── Módulo 3: Planejamento por Divisão / Categorias ─────────────────────────
('mod3',                    'Módulo 3 — Planejamento por Divisão/Categorias', 'module', 300),
('mod3_temporada',          'Seleção de Temporada de Planejamento',          'section', 301),
('mod3_participacao',       'Distribuição de Participação por Divisão',      'section', 302),
('mod3_indicadores',        'Indicadores Comerciais por Divisão',            'section', 303),
('mod3_piramide',           'Pirâmide de Preço por Divisão',                 'section', 304),
('mod3_piramide_revisao',   'Revisão de Pirâmide de Preço (por Categoria)',  'section', 305),
('mod3_risco',              'Matriz de Risco por Divisão',                   'section', 306),
('mod3_volume_otb',         'Volume / OTB por Divisão',                      'section', 307),
('mod3_aprovar',            'Aplicar Cenário Divisão — Aprovar Plano',       'action',  308),

-- ─── Módulo 4: Validação de Sazonalidade ─────────────────────────────────────
('mod4',                    'Módulo 4 — Validação de Sazonalidade',          'module',  400),
('mod4_kpis_base',          'KPIs Base do Ciclo',                            'section', 401),
('mod4_curva_vendas',       'Curva de Vendas por Canal (editável)',           'section', 402),
('mod4_curva_entrada',      'Curva de Entrada de Produtos (editável)',        'section', 403),

-- ─── Módulo 5: Plano de Sortimento ───────────────────────────────────────────
('mod5',                    'Módulo 5 — Plano de Sortimento',                'module',  500),
('mod5_metas_ciclo',        'Metas Recebidas do Ciclo',                      'section', 501),
('mod5_engenharia',         'Engenharia de Sortimento — Famílias e Looks',   'section', 502),
('mod5_aprovar',            'Salvar Proposta Inicial — Aprovar Sortimento',  'action',  503),

-- ─── Módulo 6: Planejamento de Coleção ───────────────────────────────────────
('mod6',                    'Módulo 6 — Planejamento de Coleção',            'module',  600),
('mod6_temas',              'Temas da Coleção',                              'section', 601),
('mod6_looks_cores',        'Quantidades de Looks e Cores por Tema',         'section', 602),
('mod6_planejamento_cat',   'Planejamento por Categoria e Subcategoria',     'section', 603),
('mod6_sku_plan',           'Plano de SKU por Subcategoria',                 'section', 604),
('mod6_aprovar',            'Aplicar Plano de Coleção — Aprovar',            'action',  605),

-- ─── Configurações de Operação ────────────────────────────────────────────────
('config',                  'Configurações de Operação',                     'module',  700),
('config_temporadas',       'Gestão de Temporadas',                          'section', 701),
('config_colecoes',         'Gestão de Coleções / Drops',                    'section', 702),
('config_lead_times',       'Lead Times de Produção e Pedido',               'section', 703),
('config_hierarquia',       'Hierarquia de Produtos',                        'section', 704),
('config_faixas_preco',     'Faixas de Preço por Categoria',                 'section', 705),
('config_basicos',          'Básicos / Sustentador de Margem',               'section', 706),
('config_importacao',       'Importação de Planilhas',                       'section', 707),

-- ─── Acompanhamento (Tracking) ────────────────────────────────────────────────
('track',                   'Acompanhamento de Vendas',                      'module',  800),
('track_kpis',              'KPIs e Evolução de Vendas',                     'section', 801),
('track_estoque',           'Estoque e Cobertura',                           'section', 802),
('track_grupos',            'Desempenho por Grupo de Produto',               'section', 803),

-- ─── Acompanhamento Criativo ──────────────────────────────────────────────────
('track_creative',          'Acompanhamento Direção Criativa',               'module',  900),
('track_creative_grupos',   'Performance Comparativa dos Grupos',            'section', 901),
('track_creative_temas',    'Receita por Tema de Coleção',                   'section', 902),
('track_creative_riscos',   'Riscos e Oportunidades',                        'section', 903)

ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  level       = EXCLUDED.level,
  order_index = EXCLUDED.order_index;

-- ─── SQL para criar o usuário de Suporte ─────────────────────────────────────
-- ATENÇÃO: Execute o bloco abaixo SEPARADAMENTE, APÓS criar o usuário
-- suporte@thefashionoffice.com.br no Supabase Dashboard:
-- Dashboard → Authentication → Users → "Add user" → email + senha
-- Copie o UUID gerado e substitua '<UUID-DO-AUTH-USER>' abaixo.
--
-- INSERT INTO public.users (id, email, name, tenant_id, system_role, status)
-- VALUES (
--   '<UUID-DO-AUTH-USER>'::uuid,
--   'suporte@thefashionoffice.com.br',
--   'Suporte TFO',
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   'support',
--   'active'
-- )
-- ON CONFLICT (id) DO UPDATE SET system_role = 'support', status = 'active';
