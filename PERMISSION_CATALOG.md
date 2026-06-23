# Catálogo de Permissões — Fashion Mind

> **Versão:** 1.0 · **Data:** 2026-06-19  
> Este arquivo é a fonte de verdade do vocabulário de permissões do sistema.  
> A tela de configuração de permissões (`Admin_Permissions.tsx`) é gerada a partir da tabela `modules` no banco, que é populada pela migration `003_permission_catalog_seed.sql`.  
> **Nunca use strings soltas de módulo — sempre referencie pelo `code` desta tabela.**

---

## Como ler esta tabela

| Coluna | Significado |
|--------|-------------|
| **Code** | Chave única. Usada em `modules.code` e em toda checagem de permissão no código. |
| **Nível** | `module` = agrupador; `section` = card/seção na tela; `action` = botão de aprovar/submeter |
| **Visualizar** | O que o usuário consegue fazer quando `can_view = true` |
| **Editar** | O que o usuário consegue fazer quando `can_edit = true` (requer Visualizar) |
| **Aprovar** | O que o usuário consegue fazer quando `can_approve = true` (requer Editar) |

**Hierarquia de dependência:** Aprovar ⊃ Editar ⊃ Visualizar  
Se `can_view = false`, os outros dois são automaticamente `false`.

---

## Módulo 1 — Planejamento Estratégico Ano Fiscal

Arquivo: `src/app/pages/Planning.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `mod1` | Módulo 1 — Planejamento Estratégico Ano Fiscal | module | Acessa o módulo | — | — |
| `mod1_cenario_macro` | Cenário Macroeconômico | section | Vê indicadores IPCA, Selic, PIB, PMC | Não editável | — |
| `mod1_indicadores` | Indicadores Selecionados para Planejamento | section | Vê os campos de planejamento do ano | Altera os valores dos campos ativos | — |
| `mod1_cenario_consolidado` | Cenário Consolidado | section | Vê a tabela Plano vs Referência | Atualiza automaticamente ao editar indicadores | — |
| `mod1_cenarios_salvos` | Cenários Salvos | section | Vê a lista de cenários salvos e carrega um deles | Salva novos cenários e compara | — |
| `mod1_ano_referencia` | Ano de Referência | section | Vê dados históricos do ano de referência | Troca o ano de referência pelo dropdown | — |
| `mod1_aprovar` | Aplicar Metas — Aprovar Plano Estratégico | action | — | — | Clica "Aplicar Metas": confirma o cenário como plano oficial do ano |

---

## Módulo 2 — Planejamento de Metas por Canal

Arquivo: `src/app/pages/ChannelPlanning.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `mod2` | Módulo 2 — Planejamento de Metas por Canal | module | Acessa o módulo | — | — |
| `mod2_distribuicao_canal` | Distribuição por Canal (% e R$) | section | Vê as participações e valores por canal | Altera o % de cada canal | — |
| `mod2_indicadores_canal` | Indicadores por Canal — Simulador | section | Vê KPIs por canal e consolidado | Altera campos driver (margem, PMV, ticket, etc.) | — |
| `mod2_cenarios_salvos` | Cenários Salvos — Canal | section | Vê e carrega cenários por canal | Salva e compara cenários | — |
| `mod2_aprovar` | Aplicar Metas Canal — Aprovar Distribuição | action | — | — | Clica "Aplicar Metas": marca o ciclo como revisado por canal |

---

## Módulo 3 — Planejamento por Divisão / Categorias

Arquivos: `src/app/pages/Module3DivisionPlanning.tsx`, `src/app/pages/PricePyramid.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `mod3` | Módulo 3 — Planejamento por Divisão/Categorias | module | Acessa o módulo | — | — |
| `mod3_temporada` | Seleção de Temporada de Planejamento | section | Vê as temporadas disponíveis | Seleciona a temporada alvo e de referência | — |
| `mod3_participacao` | Distribuição de Participação por Divisão | section | Vê o % de participação de cada divisão | Altera o % de cada divisão (Fem/Masc/Acess/Infantil) | — |
| `mod3_indicadores` | Indicadores Comerciais por Divisão | section | Vê PMV, MKD, Margem, Sell-Through por divisão | Altera esses valores em cada divisão | — |
| `mod3_piramide` | Pirâmide de Preço por Divisão | section | Vê as faixas P1/P2/P3 de cada divisão | — | — |
| `mod3_piramide_revisao` | Revisão de Pirâmide de Preço (por Categoria) | section | Vê a participação % de cada categoria em P1/P2/P3 | Altera a participação % das categorias na pirâmide | — |
| `mod3_risco` | Matriz de Risco por Divisão | section | Vê a distribuição Básicos/Moda/Alta Moda | Altera o % de risco de cada divisão | — |
| `mod3_volume_otb` | Volume / OTB por Divisão | section | Vê as metas de volume e OTB | Altera volume de produção e cobertura estimada | — |
| `mod3_aprovar` | Aplicar Cenário Divisão — Aprovar Plano | action | — | — | Clica "Aplicar" em um cenário salvo: define como plano oficial da temporada |

---

## Módulo 4 — Validação de Sazonalidade

Arquivo: `src/app/pages/CycleValidation.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `mod4` | Módulo 4 — Validação de Sazonalidade | module | Acessa o módulo | — | — |
| `mod4_kpis_base` | KPIs Base do Ciclo | section | Vê receita meta, margem, estoque, OTB e cobertura do ciclo | — | — |
| `mod4_curva_vendas` | Curva de Vendas por Canal (editável) | section | Vê os gráficos e tabelas de vendas mensais | Altera os valores de receita planejada por mês e canal | — |
| `mod4_curva_entrada` | Curva de Entrada de Produtos (editável) | section | Vê a distribuição de peças/verba por mês | Altera o planejamento de entrada de produtos | — |

---

## Módulo 5 — Plano de Sortimento

Arquivo: `src/app/pages/SortimentPlan.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `mod5` | Módulo 5 — Plano de Sortimento | module | Acessa o módulo | — | — |
| `mod5_metas_ciclo` | Metas Recebidas do Ciclo | section | Vê receita, PMV, volume e matriz de risco do ciclo | Ajusta os valores recebidos | — |
| `mod5_engenharia` | Engenharia de Sortimento — Famílias e Looks | section | Vê a estrutura de famílias, looks e variantes | Adiciona/edita/exclui famílias, looks e variantes de SKU | — |
| `mod5_aprovar` | Salvar Proposta Inicial — Aprovar Sortimento | action | — | — | Clica "Salvar Proposta Inicial": submete o plano de sortimento |

---

## Módulo 6 — Planejamento de Coleção

Arquivo: `src/app/pages/CollectionPlanning.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `mod6` | Módulo 6 — Planejamento de Coleção | module | Acessa o módulo | — | — |
| `mod6_temas` | Temas da Coleção | section | Vê os temas e suas participações % | Adiciona/edita/exclui temas e ajusta participações | — |
| `mod6_looks_cores` | Quantidades de Looks e Cores por Tema | section | Vê quantidades de looks e paletas de cores por tema | Altera quantidades de looks e cores | — |
| `mod6_planejamento_cat` | Planejamento por Categoria e Subcategoria | section | Vê PMV, volume e margem por categoria/subcategoria | Altera participação, preço médio, volume e margem | — |
| `mod6_sku_plan` | Plano de SKU por Subcategoria | section | Vê modelos, temas, cores, faixa de preço e quantidade | Preenche o plano de SKU detalhado | — |
| `mod6_aprovar` | Aplicar Plano de Coleção — Aprovar | action | — | — | Clica "Aplicar Plano": submete o planejamento da coleção |

---

## Configurações de Operação

Arquivo: `src/app/pages/OperationSettings.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `config` | Configurações de Operação | module | Acessa o módulo | — | — |
| `config_temporadas` | Gestão de Temporadas | section | Vê a lista de temporadas | Cria, edita e exclui temporadas | — |
| `config_colecoes` | Gestão de Coleções / Drops | section | Vê a lista de coleções vinculadas a temporadas | Cria, edita e exclui coleções/drops | — |
| `config_lead_times` | Lead Times de Produção e Pedido | section | Vê as regras de lead time por categoria/divisão | Cria e exclui regras de lead time | — |
| `config_hierarquia` | Hierarquia de Produtos | section | Vê a árvore Divisão→Grupo→Categoria→Subcategoria | Adiciona/edita/exclui nós da hierarquia; configura hierDivisaoAtiva | — |
| `config_faixas_preco` | Faixas de Preço por Categoria | section | Vê P1/P2/P3 por categoria/divisão | Altera os valores de faixa de preço | — |
| `config_basicos` | Básicos / Sustentador de Margem | section | Vê configuração de básicos (tipo e SKUs) | Ativa/inativa básicos e define lista de SKUs | — |
| `config_importacao` | Importação de Planilhas | section | Vê o histórico de importações | Faz upload e mapeamento de colunas de planilhas | — |

---

## Acompanhamento de Vendas

Arquivo: `src/app/pages/Tracking.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `track` | Acompanhamento de Vendas | module | Acessa o módulo | — | — |
| `track_kpis` | KPIs e Evolução de Vendas | section | Vê vendas acumuladas, margem, PMV e ritmo de vendas | — | — |
| `track_estoque` | Estoque e Cobertura | section | Vê estoque acumulado, pedidos em carteira e cobertura | — | — |
| `track_grupos` | Desempenho por Grupo de Produto | section | Vê performance por grupo (até 10 grupos) | — | — |

---

## Acompanhamento Direção Criativa

Arquivo: `src/app/pages/TrackingCreative.tsx`

| Code | Nome | Nível | Visualizar | Editar | Aprovar |
|------|------|-------|------------|--------|---------|
| `track_creative` | Acompanhamento Direção Criativa | module | Acessa o módulo | — | — |
| `track_creative_grupos` | Performance Comparativa dos Grupos | section | Vê tabela de receita, giro e margem por grupo | — | — |
| `track_creative_temas` | Receita por Tema de Coleção | section | Vê gráfico de barras meta vs realizado por tema | — | — |
| `track_creative_riscos` | Riscos e Oportunidades | section | Vê painel de riscos e oportunidades com categorias | — | — |

---

## Perfis-base sugeridos (templates para o seletor de cargo)

> Estes perfis são um ponto de partida para a tela de permissões. O Admin do Cliente pode criar
> cargos customizados na tabela `roles` e associar permissões via `permission_matrix`.

| Perfil | Resumo de Acesso |
|--------|-----------------|
| **CEO** | Acesso total a todos os módulos, incluindo todas as ações de aprovação |
| **Direção Criativa** | Visualiza Mod.1; Edita e aprova Mod.2–6 e Acompanhamento Criativo; sem acesso a Configurações |
| **Estilo** | Visualiza Mod.1–3; Edita e aprova Mod.5–6 e Acompanhamento de Vendas; sem aprovação em Mod.1–3 |
| **Comercial** | Visualiza todos os módulos exceto Configurações; sem editar/aprovar |
| **Analista** | Visualiza todos os módulos (incluindo Configurações); sem editar/aprovar |
| **Visualizador** | Visualiza apenas Mod.1–4 e Acompanhamento; sem acesso a Configurações |

---

## Regra de checagem de permissão (implementação)

A permissão efetiva de um usuário é determinada pela seguinte precedência:

1. Se existe um registro em `user_permission_overrides` para (user_id, module_id) → **esse valor prevalece**
2. Se não existe override → usa o valor em `permission_matrix` para (role_id, module_id) do cargo do usuário
3. Se não existe nem um nem outro → `can_view = false`, `can_edit = false`, `can_approve = false`

A função `getEffectivePermissions()` em `adminService.ts` implementa essa lógica.

**A checagem deve ocorrer em DOIS lugares:**
- **UI**: esconder ou desabilitar elementos com base na permissão efetiva
- **Camada de dados/API**: rejeitar writes no Supabase via RLS policies
