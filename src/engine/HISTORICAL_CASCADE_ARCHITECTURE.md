# Arquitetura do Plano Histórico em Cascata — Fashion Mind
> Complementa o [INDICATOR_HIERARCHY.md](./INDICATOR_HIERARCHY.md). Aquele documento resolve
> a reconciliação **dentro de um nó** (quando você edita PMV, o que absorve — Peças ou Receita).
> Este documento resolve o que falta: como um nó **nasce** (do histórico real) e como uma edição
> em um nó se propaga para os **nós vizinhos** (outras divisões, outras categorias) e para os
> **níveis abaixo/acima** (M1 → M2 → M3 → M4 → M5 → M6). Registrado em 2026-09-08, prioridade
> máxima da usuária: "o plano é um histórico que vai sendo reajustado até refletir o que se
> acredita para o futuro" — isso é o diferencial do sistema, não um detalhe de UX.

---

## Princípio Universal

**Todo indicador, em qualquer tela, nasce do histórico real — nunca de uma constante inventada.**
O usuário então reajusta esse histórico, tela por tela, até que o número reflita o que ele
acredita sobre o futuro. Cada reajuste em um nível se propaga automaticamente para os níveis
mais finos abaixo dele (preservando a forma relativa do histórico) e se re-agrega para cima
(o consolidado bate exatamente com o que foi editado). Nenhuma tela pode abrir com um valor que
não seja "o histórico, corrigido por tudo que já foi decidido nas telas anteriores".

Duas mecânicas, ortogonais entre si:

1. **Absorção dentro do nó** (já existe — [INDICATOR_HIERARCHY.md](./INDICATOR_HIERARCHY.md), clusters T1–T4). Quando dois campos do mesmo nó (ex: PMV e Receita da divisão Feminino) competem, um absorve o outro.
2. **Cascata entre nós** (este documento — parcialmente implementada de forma ad-hoc em `useModule3.ts`, precisa virar motor único reutilizável). Quando um nó pai muda, os filhos são reescalados; quando um filho muda, o pai é re-agregado.

---

## Mecânica 2: Cascata Histórico → Plano

### 2.1 — Semeadura (como um nó nasce)

Toda vez que uma tela precisa de um valor inicial para um nó (uma divisão, uma categoria, um
canal, um mês), a semente é: **peso histórico real × meta do nível acima**. Nunca uma constante
fixa. Fórmula geral, já usada em alguns lugares do app (`consolidatedHierarchyService.ts`,
`historicalProfileService.ts`) e que precisa virar o padrão universal:

```
peso_histórico(nó) = receita_real_do_nó (sales_history) / receita_real_do_grupo_pai (sales_history)
valor_inicial(nó, indicador) = peso_histórico(nó) aplicado sobre o valor do nível acima
                                (para indicadores absolutos: receita, peças)
                              = valor_histórico_real(nó, indicador) escalado pelo mesmo fator
                                que o nível acima já escalou em relação ao SEU histórico
                                (para indicadores de taxa: margem%, PMV, MKD%, giro, sell-through)
```

Quando não há histórico nenhum para o grupo (ex: subcategoria nova, criada pelo usuário na tela
de Sortimento por pesquisa de mercado, sem venda ainda) → distribui igualmente entre os pares
(mesmo fallback que `consolidatedHierarchyService.ts:distributeByWeight` já usa) e marca
visualmente "sem histórico — peso igualitário", nunca finge que é real.

### 2.2 — Propagação de delta (como um reajuste desce)

Já implementada, mas só localmente, em `useModule3.ts` (efeito "Propagação delta", linhas
~168-231) para margin/gmroi/sellThrough entre M1 e as divisões do M4. A prova matemática que já
está no comentário do código é o motor inteiro, generalizado:

```
consolidado = Σ(peso_i × valor_i) / Σ(peso_i)          [média ponderada pelo histórico]

Se todo valor_i é multiplicado pelo mesmo fator k:
novo_consolidado = Σ(peso_i × k×valor_i) / Σ(peso_i) = k × consolidado

→ Escalar CADA FILHO pelo MESMO fator k reproduz exatamente o novo valor do pai,
  qualquer que seja o peso de cada filho. Não é um sistema a resolver — é direto.
```

Algoritmo único, a implementar como módulo de motor (`cascadePropagation.ts`, ao lado de
`clusterCompensation.ts`):

1. Usuário edita o indicador X no nó N (ex: MKD% da divisão Feminino, de 30% para 27%).
2. `k = novoValor / valorAnterior` (27/30 = 0.9).
3. Para cada filho direto de N na árvore (categorias de Feminino): `filho.X_novo = filho.X_atual × k`.
4. Repete recursivamente para os netos (subcategorias, linhas) — o mesmo `k` desce até a folha,
   OU cada nível pode ter seu próprio `k` se o usuário editou em vários níveis (o `k` do nível
   mais próximo abaixo sempre vence, mesma regra de "último toque = gatilho" do T1-T4).
5. Volta a subir: o consolidado do N é recalculado como média ponderada dos filhos — deve bater
   exatamente com o valor editado (é a prova acima, não uma aproximação).
6. Isso dispara o cluster T1-T4 **dentro de cada filho** (ex: se MKD% do filho mudou, o T3 dele
   decide se Margem% ou Custo Médio absorve, pela mesma hierarquia já documentada).

**Direção inversa** (edição na folha sobe): quando o usuário edita uma categoria específica em
vez da divisão inteira (ex: "Vestidos" fica com performance 40% em vez dos 35% herdados), o
consolidado da divisão é recalculado (nova média ponderada) — se esse novo consolidado diverge
do que M4 tinha aprovado, dispara o mesmo fluxo de tolerância/aprovação que já existe entre
telas (`planApprovalService`, banda ±2%/±5% conforme o módulo).

### 2.3 — Onde essa cascata já roda hoje (parcial) vs. onde falta

| Fronteira | Existe? | Onde |
|---|---|---|
| M1 (ano fiscal) → M2 (canal) | Parcial — peso real de receita por canal (`historicalProfileService.getHistoricalProfiles`), mas margem/PMV/MKD não escalam por delta, só a receita | `ChannelPlanning.tsx` |
| M2 (canal) → M3 (mês) | Peso real por mês (`getChannelSeasonality`) | `CycleValidation.tsx` |
| M1/M3 → M4 (divisão) | **Sim, é o único lugar já formalizado** — efeito "Propagação delta" | `useModule3.ts:168-231` |
| M4 (divisão) → M6 (categoria/subcategoria/linha) | **Não existe.** Cascata do Sortimento (Fase 1, hoje) só semeia uma vez (via `consolidatedHierarchyService`), não reage a edições feitas depois no M4 | A construir — Fase 2 |
| Dentro do M6 (categoria → subcategoria → linha) | **Não existe** | A construir — Fase 2 |
| M4 → M5 (peças por mês) | Parcial — `CollectionPlan.tsx` usa peso histórico mensal pra sugerir a curva, mas não reage a edição de indicador do M4 depois de aberto | Melhorar |

**Ação:** extrair o efeito de `useModule3.ts` para `cascadePropagation.ts` como função pura e
reutilizável, e plugar essa mesma função em toda fronteira da tabela acima — não duplicar a
lógica de novo em cada tela (é exatamente o tipo de divergência que a Fase 1 de hoje já corrigiu
uma vez, ao achar `deriveSeasonMacroTarget` recalculando por fora em vez de ler o que já existia).

---

## Mapa por indicador — fonte histórica real em cada nível

Convenção: 🟢 real e já implementado · 🟡 real, mas precisa de extensão pontual · 🔴 não existe,
constante inventada hoje.

| Indicador | Fonte real (tabelas/join) | Nível(is) já implementado(s) | Gap |
|---|---|---|---|
| **Receita** | `sales_history` (revenue_net) | 🟢 canal, mês, divisão, categoria/subcategoria/linha (`get_sales_monthly_aggregates`, `getHierarchyRevenueByPath`) | Nenhum — é o indicador mais maduro do app |
| **PMV** | `sales_history.price_realized` (ou `price_sale` quando não há venda com desconto) × `revenue_net`, ponderado | 🟢 canal, mês, divisão (`pmv_weighted_sum`) | 🟡 falta por categoria/subcategoria/linha — dá pra estender a mesma função SQL agrupando também por category/subcategory (sales_history já tem `category` próprio, `products` tem subcategory/linha) |
| **Margem Bruta %** | **Corrigido 2026-09-08:** `(revenue_net_post_tax − quantity×price_cost) / revenue_net_post_tax × 100` — venda realizada (valor do cupom fiscal), abatidos custo do produto E impostos da venda. `sales_history.revenue_net_post_tax` já embute o abatimento de imposto; falta só juntar `products.price_cost` | 🟡 versão atual (`margin_weighted_sum`, migration 026) está **errada**: usa `price_realized − price_cost`, sem subtrair `tax_value` | Reescrever a fórmula na função SQL para usar `revenue_net_post_tax` como base em vez de `price_realized`. Vale em qualquer nível (canal/mês/divisão/categoria/subcategoria/linha) — é soma simples, agrega em qualquer corte |
| **MKD % (remarcação)** | **Corrigido 2026-09-08:** `Σ(discount_value) / Σ(quantity × products.price_sale) × 100` — desconto total ÷ (peças vendidas × preço de cadastro/tabela, sem desconto). Usa `sales_history.discount_value` diretamente, não uma diferença derivada | 🔴 não existe em nenhum nível hoje | Mais simples do que eu tinha rascunhado antes — usa uma coluna que já existe (`discount_value`) direto, só precisa agregar e juntar `products.price_sale`. Nuance da usuária: para produto recorrente, usar preço médio de pedido em vez do preço de cadastro — a confirmar caso a caso |
| **Custo Médio de Compra** | `purchase_orders.unit_cost` → fallback `inventory_snapshots.value_cost` | 🟢 já implementado e correto (`getAvgPurchaseCost`) — só retorna vazio porque as tabelas estão sem dado | Nenhum gap de lógica — gap de **dado carregado** |
| **Orçamento (compra)** | `custoCompra × peças a entrar`, distribuído por prazo de fornecedor | 🟢 lógica correta (`calcBudgetProjection`) | Depende do Custo Médio acima — mesmo gap de dado |
| **Giro** | **Detalhado 2026-09-08 — existem 3 variantes, a usuária confirmou que todas são válidas conforme o uso:**<br>• *Peças*: `Σquantity vendida (sales_history) / média(inventory_snapshots.quantity) no período`<br>• *Receita*: `Σrevenue vendida / média(inventory_snapshots.value_sale)`<br>• *Custo*: `Σcusto das vendas / média(inventory_snapshots.value_cost)` | 🔴 não existe — hoje é campo `'free'`, semeado com constante fixa (giro=4), e o `planningEngine.ts` só conhece a variante *receita* (`giro = RL/estoqueMediao`) | Precisa de `inventory_snapshots` com dado real (média de `quantity`/`value_sale`/`value_cost` entre snapshots do período). Decidir, por tela, qual das 3 variantes ela espera — hoje o motor só tem uma |
| **GMROI** | `lucroBruto / estoqueMedio (inventory_snapshots.value_cost, média do período)` | 🔴 idem — hoje é razão entre dois outros campos livres | Mesmo gap — depende de estoque real a custo |
| **Cobertura** | **Corrigido 2026-09-08 — é Forward Coverage (Dias de Suprimento Futuro), não estoque médio:** `(estoque INICIAL do mês, foto no dia 1 — inventory_snapshots) / (vendas realizadas ou projetadas nos 90 dias seguintes — sales_history) × 90`. Exemplo da usuária: estoque inicial 30.000, vendeu 29.500 em 90 dias → cobertura = (30000/29500)×90 ≈ 91 dias | 🔴 não existe — o motor atual (`planningEngine.ts`/`divisionEngineAdapter.ts`) usa **estoque médio** (não inicial) e **dias da temporada** (não janela fixa de 90 dias) — ver tensão arquitetural na seção abaixo | Gap de dado (`inventory_snapshots` vazio) **+ gap de fórmula** (o motor hoje não implementa Forward Coverage de jeito nenhum, mesmo que a tabela tivesse dado) |
| **Estoque Médio / Inicial** | `inventory_snapshots.quantity` — Inicial = snapshot do dia 1 do período; Médio = média dos snapshots ao longo do período | 🔴 hoje "Estoque Inicial" é rotulado no código como "fato real, protegido" mas na prática é digitado à mão ou default de 5/6 da venda esperada | Ler o snapshot real de `inventory_snapshots` quando existir; até lá, manter editável mas **remover o rótulo "fato real"** do comentário do código — é enganoso |
| **Reposições** | `purchase_orders.quantity_ordered` (pedidos com `expected_delivery` no período) | 🔴 hoje é calculada de trás pra frente (`2×(EstMed−EstIni)+Vendas`) só pra fechar a conta clássica de estoque médio | Ler `purchase_orders` real; usar o cálculo algébrico só como fallback quando não há pedido real |
| **Sell-Through %** | `unitsSold (sales_history) / (estoqueInicial + reposições) (inventory_snapshots + purchase_orders)` | 🔴 hoje é sempre sobre números **planejados**, nunca realizados | Depende dos dois gaps acima |
| **Ticket Médio** | `Σrevenue_net / COUNT(DISTINCT receipt_number)` | 🔴 gap de schema confirmado pela usuária — precisa da coluna nova `receipt_number` em `sales_history` (ver seção de colunas acima) | Migrar `sales_history` primeiro; depois é um SUM/COUNT direto |
| **Produção em Peças** | decisão do usuário (é o volume a produzir, não existe "produção histórica" no sentido de estoque) | — | Não é gap — é campo de decisão por natureza. Pode ganhar uma REFERÊNCIA histórica (quanto se produziu no ciclo equivalente do ano passado, via `purchase_orders.type='producao'`?) a confirmar se existe essa distinção no dado |

---

## Tensão arquitetural encontrada: Cobertura real (Forward Coverage) × cluster T2 do motor

A fórmula real que a usuária confirmou (2026-09-08) para Cobertura **não é compatível como está**
com a forma que o `planningEngine.ts`/`divisionEngineAdapter.ts` hoje relacionam Giro × Cobertura
× Estoque Médio (cluster T2, [INDICATOR_HIERARCHY.md](./INDICATOR_HIERARCHY.md)):

| | Motor hoje (T2) | Fórmula real confirmada |
|---|---|---|
| Base de estoque | **Estoque Médio** do período | **Estoque Inicial** (foto do dia 1) |
| Janela de venda | **Dias da temporada** (variável, 90–240 dias conforme a temporada) | **90 dias fixos**, sempre — é a definição do Forward Coverage |
| Relação com Giro | `Cobertura = diasDaTemporada / Giro` (reciprocamente definidas) | Cobertura é uma conta independente — não depende de Giro nenhum |

Ou seja: o cluster T2 de hoje trata Giro/Cobertura/Estoque Médio como **3 pontas do mesmo
triângulo**, cada uma derivável das outras duas. A Cobertura real (Forward Coverage) **não é**
uma dessas pontas — é uma métrica separada, com sua própria fonte (estoque inicial) e sua própria
janela (90 dias fixos), que não fecha algebricamente com o Giro do jeito que o T2 assume hoje.

**Decisão da usuária (2026-09-08): substitui.** A Cobertura real (Forward Coverage) substitui a
Cobertura do T2 — o cluster perdeu essa ponta e foi redesenhado. **Implementado no mesmo dia:**

- `planningEngine.ts` — T2 agora é só Giro ↔ Estoque Médio (1 equação, 2 variáveis, sem
  hierarquia nem alerta de divergência — é sempre consistente por construção). A ponte
  GMROI→EstMed→Giro não seta mais Cobertura. `estoqueFinal` (que dependia da Cobertura antiga)
  parou de ser calculado — a usuária confirmou que não é lido em nenhum cálculo hoje e que o
  conceito real é "estoque inicial da temporada seguinte", uma posição real de estoque, não uma
  conta algébrica.
- `divisionEngineAdapter.ts` — `applyVolumeCoverageEdit`/`VolumeClusterResult` (3 pontas)
  viraram `applyVolumeEdit`/`VolumeClusterResult` (2 pontas: giro, estoqueMedio — sem `coverage`).
- `Module3DivisionPlanning.tsx` (Bloco 4, M4) — o campo "Cobertura (d)" saiu da edição
  recíproca e virou um campo somente-leitura mostrando "sem dado real ainda", até a leitura
  real de `inventory_snapshots`/`sales_history` existir (roteiro, passo 4).
- **Documentado, não corrigido ainda:** `INDICATOR_HIERARCHY.md` T2 e a "Escopo de Aplicação"
  já refletem o novo design. `CollectionPlan.tsx` (M5) tem sua PRÓPRIA fórmula local de
  cobertura mensal (`stockEnd/soldExpected×30`, projeção mês a mês) — não usa o cluster T2 e não
  foi tocada nesta rodada; também não é o Forward Coverage real (usa estoque de fim de mês, não
  inicial, janela do mês em vez de 90 dias fixos) — alinhar isso é trabalho pendente, quando a
  leitura real de estoque existir.

---

## Comportamento quando o dado real não existe

Mesmo padrão em todo o app, sem exceção — já estabelecido corretamente em `getAvgPurchaseCost()`:
tenta a fonte real, e se não houver linha nenhuma, retorna um estado explícito de "sem dado
disponível" (nunca um número fabricado, nunca um zero silencioso disfarçado de resultado real).
O campo continua editável pelo usuário nesse caso — é assim que o app cobre o período de
implantação, antes do tenant ter carregado estoque/pedidos reais.

---

## Escopo de aplicação

| Fronteira da cascata | M1→M2 | M2→M3 | M3→M4 | M4→M5 | M4→M6 | Dentro do M6 (cat→sub→linha) |
|---|---|---|---|---|---|---|
| Receita | 🟢 | 🟢 | 🟢 | 🟡 | 🟡 (semeia 1x, não reage a edição depois) | 🟡 (idem) |
| Margem / PMV / MKD | 🔴 | 🔴 | 🟢 | — | 🔴 | 🔴 |
| Giro / GMROI / Cobertura / EstMed | 🔴 | 🔴 | 🟡 (só Cobertura) | — | — | — |
| Performance (Sell-Through) | 🔴 | 🔴 | 🟢 | — | 🔴 | 🔴 |

---

## Especificação de colunas — por indicador, para validação da usuária

Resposta de 2026-09-08 sobre Ticket Médio: **é uma lacuna de schema real, não só de dado.**
`sales_history` precisa de uma coluna que identifique a "cesta" (o cupom fiscal/NF no varejo, o
número de pedido no atacado) — sem isso não dá pra agrupar múltiplas linhas de SKU numa mesma
venda, e Ticket Médio não é computável mesmo com histórico completo importado. No atacado,
também costuma vir código/nome do cliente e CNPJ.

**Colunas novas propostas em `sales_history`** (a confirmar/corrigir pela usuária antes de migrar):

| Coluna proposta | Tipo | Obrigatória? | Uso |
|---|---|---|---|
| `receipt_number` | text | sim, para Ticket Médio existir | Nº do cupom fiscal / NF (varejo/e-commerce) ou nº do pedido (atacado) — agrupa as linhas de uma mesma venda |
| `client_code` | text | não | Código do cliente no ERP — relevante principalmente no atacado |
| `client_name` | text | não | Nome do cliente |
| `client_document` | text | não | CNPJ/CPF |

Com `receipt_number`: `Ticket Médio = SUM(revenue_net) / COUNT(DISTINCT receipt_number)`, dentro
do período/canal/divisão que a tela precisar.

**Tabela completa — todo indicador, toda coluna, toda tabela, o que já existe hoje:**

| Indicador | Fórmula | Tabela(s) | Colunas necessárias | Status |
|---|---|---|---|---|
| Receita Bruta/Líquida | soma direta | `sales_history` | `revenue_gross, revenue_net, discount_value, tax_value, revenue_net_post_tax, sale_date, channel, sku, quantity` | ✅ existe |
| PMV | `revenue_net / quantity` (ou `price_realized` ponderado) | `sales_history` | `price_realized, revenue_net, quantity, sale_date, channel, sku` | ✅ existe |
| Margem Bruta % | `(price_realized − price_cost) / price_realized` ponderado | `sales_history` × `products` | `sales_history.price_realized/revenue_net` + `products.price_cost` (join por `sku`) | ✅ existe — ressalva: `price_cost` é o **atual**, não o vigente na época da venda (products não versiona custo histórico) |
| MKD % (remarcação) | `(price_sale − price_realized) / price_sale` ponderado | `sales_history` × `products` | `sales_history.price_realized/revenue_net` + `products.price_sale` (join por `sku`) | 🟡 dado existe, cálculo não foi escrito ainda (falta 1 coluna a mais na função SQL `get_sales_monthly_aggregates`) |
| Custo Médio de Compra | `Σ(unit_cost×qty) / Σqty` | `purchase_orders` → fallback `inventory_snapshots` | `purchase_orders.unit_cost, quantity_ordered` / `inventory_snapshots.value_cost, quantity, snapshot_date` | ✅ lógica pronta (`getAvgPurchaseCost`) — tabelas com 0 linhas |
| Orçamento (compra) | `custo_compra × peças a entrar` | depende do acima + `collection_plans` | — | ✅ lógica pronta — mesmo gap de dado |
| Giro | `peças vendidas / estoque médio (peças)` | `sales_history` × `inventory_snapshots` | `sales_history.quantity, sale_date, sku` + `inventory_snapshots.quantity, snapshot_date, sku` | 🔴 não implementado — tabela vazia |
| GMROI | `lucro bruto / estoque médio (R$)` | `sales_history` × `products` × `inventory_snapshots` | soma das anteriores + `inventory_snapshots.value_cost` | 🔴 não implementado — tabela vazia |
| Cobertura (dias) | `estoque médio (peças) × dias / vendas do período` | `inventory_snapshots` × `sales_history` | mesmas colunas de Giro | 🔴 não implementado — tabela vazia |
| Estoque Médio/Inicial | leitura direta do snapshot | `inventory_snapshots` | `quantity, value_sale, value_cost, snapshot_date, sku, location` | 🔴 tabela vazia (schema já correto) |
| Reposições | soma de pedidos entregues/esperados no período | `purchase_orders` | `quantity_ordered, quantity_delivered, order_date, expected_delivery, delivery_date, sku` | 🔴 tabela vazia (schema já correto) |
| Sell-Through % | `vendidas / (estoque inicial + reposições)` | `sales_history` + `inventory_snapshots` + `purchase_orders` | união das três acima | 🔴 depende dos três gaps acima |
| **Ticket Médio** | `Σrevenue_net / COUNT(DISTINCT cesta)` | `sales_history` | **`receipt_number` (coluna nova) + `revenue_net`** | 🔴 gap de schema — coluna não existe ainda |
| Nível de Risco (categoria/subcategoria) | agregação do `risk_level` por SKU, ponderada por receita | `products` × `sales_history` (pra peso) | `products.risk_level, category, subcategory` + `sales_history.revenue_net, sku` | ✅ dado existe nos dois níveis (SKU real e `riskMatrix` da divisão no M4) — **desconectados entre si**, reconciliar é trabalho de lógica, não de dado |
| Faixa de Preço (P1/P2/P3) | classificação por range de preço | `products.price_tier` (0% preenchido nesse tenant) ou `price_tiers` (ranges por categoria) | `products.price_sale` + `price_tiers.p1_min/max, p2_min/max, p3_min/max, category, division` | 🟡 schema existe, dado de `price_tier` não populado — hoje o M4/M6 usam o plano da Pirâmide de Preço em vez do SKU real |
| Produção em Peças | decisão do usuário; pode ganhar referência histórica | `purchase_orders.type` (se distinguir "produção" de "compra") | a confirmar se `type` já registra essa distinção | Não é gap — é campo de decisão. Referência histórica é opcional |

---

## Roteiro de implementação proposto

1. **Extrair `cascadePropagation.ts`** do efeito hoje preso em `useModule3.ts` — função pura,
   testável, reaplicável em qualquer fronteira da tabela acima.
2. **Fechar o gap de MKD real** — estender `get_sales_monthly_aggregates` com
   `price_sale_weighted_sum` (uma coluna a mais na função SQL já existente, não uma reescrita).
3. **Estender a agregação histórica por categoria/subcategoria/linha** — hoje só existe por
   canal/mês/divisão; falta granularidade fina pra alimentar o M6 de verdade.
4. **Construir a leitura real de `inventory_snapshots`/`purchase_orders`** para Giro, GMROI,
   Cobertura, Estoque Médio, Reposições e Sell-Through real — seguindo exatamente o padrão já
   certo de `getAvgPurchaseCost()` (tenta real, senão "sem dado", nunca fabrica).
5. **Plugar a cascata nas fronteiras que faltam** (M4→M6, dentro do M6, M4→M5 reativo).
6. **Migrar `sales_history`** com as 4 colunas novas da seção anterior (`receipt_number` é a
   crítica; `client_code/name/document` são complementares) — pré-requisito do passo 2 em diante
   pra Ticket Médio, e útil de qualquer forma pro import de vendas real.
7. Cada passo acima é uma entrega separada e testável — não faz sentido tentar tudo de uma vez
   dado o tamanho (toca M1 a M6).
