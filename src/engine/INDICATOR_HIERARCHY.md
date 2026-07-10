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

## CLUSTER T2 — GIRO × ESTOQUE MÉDIO R$ × COBERTURA

### Hierarquia estratégica (↑ = mais protegido)
```
Giro  >  Cobertura  >  Estoque Médio R$
```
> Giro é KPI de performance estratégica — definido pela liderança.
> Cobertura é gestão de ciclo — compromisso com operações.
> Estoque Médio é consequência das compras — o mais flexível.

**Alerta de divergência:** quando dois campos estão ambos tocados e o terceiro
é editado, pode haver inconsistência matemática momentânea (ex: Giro e EstMed
apontam para Coberturas diferentes). Exibir indicador visual de alerta — não
bloquear a edição.

### Regras de absorção

| Edição | Contexto | Absorve | Fórmula |
|---|---|---|---|
| Giro | nenhum toque | EstMed | EstMed = RL/Giro; Cobertura = 365/Giro |
| Giro | EstMed tocado | Cobertura | Cobertura = 365/Giro (⚠ alerta divergência com EstMed) |
| Giro | Cobertura tocada | EstMed | EstMed = RL/Giro |
| Giro | ambos tocados | EstMed | Giro soberano; Cobertura protegida |
| EstMed | nenhum toque | Giro | Giro = RL/EstMed; Cobertura segue |
| EstMed | Giro tocado | Cobertura | Cobertura = EstMed×365/RL (⚠ alerta divergência) |
| EstMed | Cobertura tocada | Giro | Giro = RL/EstMed |
| EstMed | ambos tocados | Cobertura | Giro protegido |
| Cobertura | nenhum toque | EstMed | EstMed = (RL/365)×Cob; Giro = 365/Cob |
| Cobertura | EstMed tocado | Giro | Giro = 365/Cob (⚠ alerta divergência) |
| Cobertura | Giro tocado | EstMed | EstMed = Cob×RL/365 |
| Cobertura | ambos tocados | EstMed | Giro protegido |

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
ComprasPeças ↓ → EstMed R$ ↓ → Giro ↑, Cobertura ↓  (eficiência — vende mais do que compra)
ComprasPeças ↑ → EstMed R$ ↑ → Giro ↓, Cobertura ↑  (reserva — compra para cobrir demanda futura)
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
| T2 Giro/EstMed/Cob | ✓ edição | ✓ edição | ✓ edição | ✓ Cobertura | — | — | ✓ leitura |
| T3 Margem/Custo/MKD | ✓ edição | ✓ edição | ✓ edição | — | ✓ Margem | ✓ Margem | ✓ leitura |
| T4 Orçamento/Compras | ✓ edição | ✓ edição | ✓ edição | ✓ edição | ✓ edição | — | — |

**Telas de leitura:** exibem recálculo imediato na coluna de cenário mas não permitem edição direta. A hierarquia ainda se aplica para alertas de divergência.
