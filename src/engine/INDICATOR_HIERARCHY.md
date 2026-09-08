# Hierarquia de Decisão dos Indicadores — Fashion Mind
> Versão confirmada. Base para reescrita do planningEngine v5.

---

## Princípio Universal

**"Último toque = gatilho. Campo mais antigo / não tocado = absorvedor. Campo mais estratégico = mais protegido."**

Quando um indicador é editado, o sistema resolve qual campo absorve com base em:

1. **Último toque vence como gatilho** — o campo recém-editado é a causa.
2. **Campo mais antigo / não tocado absorve** — entre os restantes, o que tem o `touched` mais antigo (ou nunca foi tocado) é ajustado.
3. **Empate resolvido pela hierarquia estratégica** — se dois campos estão igualmente livres, o de menor valor estratégico absorve (definido por cluster).

**Recálculo imediato e universal:** todos os indicadores recalculam e exibem na coluna de cenário mesmo quando não estão no painel ativo de edição. Nenhum indicador fica "adormecido".

---

## CLUSTER T1 — RECEITA BRUTA × PMV × PEÇAS VENDIDAS

### Hierarquia estratégica (↑ = mais protegido)
```
PMV  >  Receita Bruta  >  Peças Vendidas
```
> PMV é decisão de posicionamento de marca — o mais difícil de mudar.
> Receita é meta comprometida com stakeholders.
> Peças é volume consequente — absorve primeiro.

### Escala Proporcional (nenhum toque anterior)

Quando **apenas Receita Bruta** é editada e nenhum outro campo foi tocado,
o sistema aplica **escala proporcional** com `fator = RB_novo / RB_base`.

**Campos que ESCALAM (× fator):**
- Peças Vendidas
- Orçamento Previsto
- Produção em Peças
- Estoque Médio R$

**Campos que NÃO ESCALAM (ficam fixos — são taxas ou decisões independentes):**
- PMV
- Margem Bruta %
- Custo Médio
- Giro
- GMROI
- Cobertura
- MKD % (política comercial — não escala)
- Ticket Médio

**MKD R$:** = Receita × MKD% → escala como consequência natural (% fica, R$ acompanha Receita). Não é editado — é derivado.

**Por que é matematicamente consistente:**
- Margem% = (RL − Custo×Peças)/RL → RL×f e Peças×f com Custo fixo → Margem% inalterada ✓
- Giro = RL/EstMed → ambos ×f → Giro inalterado ✓
- Cobertura = EstMed×365/RL → ambos ×f → Cobertura inalterada ✓
- GMROI = RL×Margem%/EstMed → RL×f e EstMed×f → GMROI inalterado ✓
- ComprasPeças = Orçamento/Custo → Orçamento×f com Custo fixo → ComprasPeças×f ✓

### Regras de absorção (quando há toques anteriores)

| Edição | Contexto | Absorve | Fórmula |
|---|---|---|---|
| Receita | nenhum toque | ESCALA PROPORCIONAL | ver acima |
| Receita | PMV tocado | Peças | Peças = RL/PMV |
| Receita | Peças tocada | PMV | PMV = RL/Peças |
| Receita | ambos tocados | Peças | PMV protegido (hierarquia) |
| PMV | nenhum toque | Peças | Peças = RL/PMV; Receita mantida |
| PMV | Receita tocada | Peças | Peças = RL/PMV |
| PMV | Peças tocada | Receita | Receita = PMV × Peças |
| PMV | ambas tocadas | Peças | Receita = PMV × Peças_old → PMV > Receita |
| Peças | nenhum toque | PMV | PMV = RL/Peças; Receita mantida |
| Peças | PMV tocado | Receita | Receita = PMV × Peças |
| Peças | Receita tocada | PMV | PMV = RL/Peças |
| Peças | ambas tocadas | PMV | Receita protegida; PMV absorve |

---

## CLUSTER T2 — GIRO × ESTOQUE MÉDIO R$

> **Redesenhado em 2026-09-08.** Cobertura SAIU deste cluster — a usuária
> confirmou que a Cobertura real do negócio é *Forward Coverage* (Dias de
> Suprimento Futuro): estoque **inicial** (foto do dia 1 do mês) ÷ vendas
> realizadas/projetadas numa janela **fixa de 90 dias**, × 90. Isso não fecha
> algebricamente com o Giro do jeito que a versão anterior deste cluster
> assumia (que usava estoque médio e dias da temporada, variável). Cobertura
> agora é um indicador **real e independente**, lido de `inventory_snapshots`
> × `sales_history` (ainda não implementado — tabelas de estoque vazias hoje).
> Ver [HISTORICAL_CASCADE_ARCHITECTURE.md](./HISTORICAL_CASCADE_ARCHITECTURE.md).

### Só 2 variáveis, 1 equação — sem hierarquia

```
Giro = Receita Líquida / Estoque Médio R$
```

Com 3 variáveis (versão antiga), duas podiam divergir entre si de forma
matematicamente inconsistente, exigindo hierarquia de proteção e alerta de
divergência. Com 2 variáveis e 1 equação, **é sempre consistente por
construção** — não há o que divergir. Regra única: o último campo tocado é a
verdade, o outro deriva dele.

### Regras de absorção

| Edição | Contexto | Absorve | Fórmula |
|---|---|---|---|
| Giro | nenhum toque | EstMed | EstMed = RL/Giro |
| Giro | ambos tocados | EstMed | Giro soberano (último tocado) |
| EstMed | nenhum toque | Giro | Giro = RL/EstMed |
| EstMed | ambos tocados | Giro | EstMed soberano (último tocado) |

### Onde a Cobertura real aparece agora

Informativa, fora deste cluster — em qualquer tela que mostrava Cobertura
antes (M1, M3/M4 Bloco 4), ela vira um campo **somente leitura**, mostrando
"sem dado real ainda" até `inventory_snapshots`/`purchase_orders` terem dado
importado. Nunca mais calculada a partir de Giro.

---

## CLUSTER T3 — MARGEM BRUTA % × CUSTO MÉDIO × MKD %

### Hierarquia estratégica (↑ = mais protegido)
```
Custo Médio  >  Margem Bruta %  >  MKD %
```
> Custo Médio é decisão de sourcing/produção — o mais estrutural (difícil de alterar).
> Margem Bruta % é meta estratégica — definida pela liderança comercial.
> MKD % (remarcação) é decisão operacional diária — o mais fácil de ajustar. **Absorve por padrão.**

**Regra MKD R$:** sempre derivado (= Receita × MKD%). Não entra na hierarquia.
Se Receita e MKD% ficam fixos → MKD R$ inalterado.
Se Receita escala (T1) e MKD% fixo → MKD R$ escala como consequência.

### Regras de absorção

| Edição | Contexto | Absorve | Fórmula / Efeito |
|---|---|---|---|
| Margem% | nenhum toque | MKD% | MKD% ajusta para fechar equação; Custo fixo |
| Margem% | MKD% tocado | Custo Médio | Custo = RL×(1−Margem%)/Peças |
| Margem% | Custo tocado | MKD% | MKD% absorve; Custo protegido |
| Margem% | ambos tocados | MKD% | Custo tem prioridade máxima |
| MKD% | nenhum toque | Margem% | MKD↑ → RL↓ → Margem comprime |
| MKD% | Margem% tocada | Custo Médio | Custo compensa para manter Margem |
| MKD% | Custo tocado | Margem% | Custo protegido; Margem absorve |
| MKD% | ambos tocados | Margem% | Custo tem prioridade máxima |
| Custo | nenhum toque | Margem% | Custo↑ → Margem espreme; MKD mantido |
| Custo | Margem% tocada | MKD% | MKD compensa para manter Margem |
| Custo | MKD% tocado | Margem% | MKD protegido; Margem absorve |
| Custo | ambos tocados | MKD% | Margem protegida sobre MKD |

---

## CLUSTER T4 — ORÇAMENTO PREVISTO × COMPRAS EM PEÇAS

### Natureza: BIDIRECIONAL
Sem hierarquia fixa de proteção — qualquer campo pode ser o gatilho.
O **último campo editado** é o driver (LIFO — igual aos outros clusters).
Bridge com T3: CustoMédio é o elo (ComprasPeças = Orçamento / CustoMédio).

> O orçamento financeiro é o que a empresa tem disponível para gastar.
> O usuário pode entrar pelo valor (Orçamento) ou pelo volume (ComprasPeças)
> e simular livremente os dois até fechar um número pagável que cubra a
> necessidade de produção das esteiras.

### Regra de soberania pós-commit
Ao salvar o cenário, o **último campo definido pelo usuário** vira a âncora daquele
cenário. Para alterar essa âncora é necessário abrir um **novo cenário**.
Durante a simulação (antes do commit), ambos os campos são livremente editáveis.

### Regras de absorção

| Edição | Quem absorve | Fórmula |
|---|---|---|
| Orçamento | ComprasPeças | ComprasPeças = Orçamento / CustoMédio |
| ComprasPeças | Orçamento | Orçamento = ComprasPeças × CustoMédio |
| CustoMédio ↑↓ (efeito T3) — Orçamento foi o último tocado | ComprasPeças | ComprasPeças = Orçamento / novo_CustoMédio |
| CustoMédio ↑↓ (efeito T3) — ComprasPeças foi o último tocado | Orçamento | Orçamento = ComprasPeças × novo_CustoMédio |

### Cascata automática para T2 (toda vez que ComprasPeças muda)

```
ComprasPeças ↓ → EstMed R$ ↓ → Giro ↑  (eficiência — vende mais do que compra)
ComprasPeças ↑ → EstMed R$ ↑ → Giro ↓  (reserva — compra para cobrir demanda futura)
```

### Gap intencional T4 × T1
PecasVendidas (T1) ≠ ComprasPeças (T4).
Diferença = variação de estoque no período (positiva = acúmulo, negativa = liquidação).
**Não é erro** — exibir como alerta visual informativo.

---

## CAMPOS ALWAYS_CALCULATED (revisão)

Estes campos **nunca entram na hierarquia de absorção** — são sempre efeitos.
Recalculam em cascata em qualquer mudança nos seus campos-base.

| Campo | Depende de | Observação |
|---|---|---|
| Receita Líquida | Receita Bruta − Devoluções | |
| MKD R$ | Receita × MKD% | Escala com Receita se MKD% fixo (T1 proporcional) |
| Produção em Valor | ProducaoPecas × CustoMédio | |
| Orçamento Total | Orçamento Previsto + ProducaoValor | Derivado — não editável |
| Estoque Médio Peças | EstMed R$ / CustoMédio | |
| Giro Peças | PecasVendidas / EstMedPecas | |
| Idade Média Estoque | 365 / GiroPecas | |
| GMROI | (RL × Margem%) / EstMed R$ | |
| Total de Peças | ComprasPecas + ProducaoPecas | |

**Mudança em relação à versão anterior:**
- `ComprasPecas` → removido de ALWAYS_CALCULATED → passa a **FREE** (entra em T4)
- `OrcamentoPrevisto` → já era FREE → soberania formalizada em T4
- `OrcamentoTotal` → mantém derivado (Orçamento + ProducaoValor)

---

## Commit (Salvar Cenário)

- Todos os campos LOCKED e CALCULATED (exceto ALWAYS_CALCULATED) voltam a **FREE**.
- Mapa de `touched` é zerado.
- O novo baseline = valores atuais do cenário salvo.
- O campo âncora de T4 (último editado) fica registrado no cenário salvo.
- Um novo cenário começa com todos os campos FREE, sem herança de locks.

---

## Escopo de Aplicação

Estas regras valem para **todas as telas** onde os indicadores aparecem.

| Cluster | Módulo 1 | Módulo 2 (Canal) | Módulo 3 (Divisão) | Módulo 4 (Ciclo) | Módulo 5 (Sort.) | DC / Mix | Tracking |
|---|---|---|---|---|---|---|---|
| T1 Receita/PMV/Peças | ✓ edição | ✓ edição | ✓ edição | ✓ leitura | ✓ PMV/Vol | ✓ PMV/Vol | ✓ leitura |
| T2 Giro/EstMed (Cobertura saiu do cluster — real, à parte) | ✓ edição | ✓ edição | ✓ edição | ✓ leitura | — | — | ✓ leitura |
| T3 Margem/Custo/MKD | ✓ edição | ✓ edição | ✓ edição | — | ✓ Margem | ✓ Margem | ✓ leitura |
| T4 Orçamento/Compras | ✓ edição | ✓ edição | ✓ edição | ✓ edição | ✓ edição | — | — |

**Telas de leitura:** exibem recálculo imediato na coluna de cenário mas não permitem edição direta. A hierarquia ainda se aplica para alertas de divergência.
