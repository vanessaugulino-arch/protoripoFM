# Fechamento de Ciclo / Promoções - Documentação Técnica

## 🎯 Visão Geral

Tela de planejamento de markdown e promoções para produtos descontinuados, com **cálculos em tempo real** e **filtro automático por profile_group (RBAC)**.

## 📍 Acesso

**Rota:** `/cycle-closing`

**Quando aparece:** Liberada após Renata (Direção Criativa) aprovar suas metas no workflow sequencial.

**Quem acessa:** Todos os perfis, mas cada um vê apenas os produtos do seu grupo (Feminino, Masculino, Infantil).

## 🔐 RBAC (Controle de Acesso)

```typescript
// Sistema filtra automaticamente por user.profile_group
const userProfileGroup = currentUser.profile_group; // "Feminino", "Masculino" ou "Infantil"

// Produtos já vêm filtrados do backend:
const products = await fetchProducts({
  grupo: userProfileGroup,
  continuidade: false, // Apenas descontinuados
  orderBy: 'estoqueAtual DESC' // Maior estoque primeiro
});
```

## 💰 Lógica de Dados Inicial

### 1. Input da Verba

```typescript
// Definido pela Direção Criativa (Renata) para cada grupo
const verbaTotalDisponivel = 150000; // R$ 150.000,00 para o grupo Feminino
```

### 2. Seleção Automática de Produtos

```typescript
// Critérios:
- continuidade: false (descontinuados)
- grupo: userProfileGroup (filtro RBAC)
- Ordenação: estoqueAtual DESC (maior estoque primeiro)
```

### 3. Distribuição Linear Inicial

```typescript
// Distribui verba igualmente entre produtos
function calculateLinearDistribution(products, verbaTotalDisponivel) {
  const verbaPorProduto = verbaTotalDisponivel / products.length;
  
  products.forEach(product => {
    // Calcula % desconto que consome essa verba
    const percentualDesconto = 
      (verbaPorProduto / (product.precoOriginal * product.estoqueAtual)) * 100;
    
    product.percentualDesconto = Math.min(100, percentualDesconto);
    product.nivelCorte = getDefaultLevel(percentualDesconto);
  });
}
```

## 🧮 Cálculos em Tempo Real

### Hook `useMarkdownCalculations`

```typescript
const {
  productsWithCalculations, // Produtos com todos os valores calculados
  summary                   // Resumo geral do plano
} = useMarkdownCalculations(products, verbaTotalDisponivel);
```

### Fórmulas Implementadas

#### 1. Preço com Desconto
```
Preço Final = Preço Original × (1 - % Desconto / 100)
```

#### 2. Custo do Desconto
```
Custo Desconto = (Preço Original - Preço Final) × Estoque Atual
```

#### 3. Margem Final
```
Margem Final = ((Preço Final - Custo Unitário) / Preço Final) × 100
```

#### 4. Venda Estimada (Elasticidade)
```
Venda Estimada = Estoque Atual × Multiplicador de Elasticidade

Multiplicadores:
- Baixo: 1.10 (+10% vendas) - Desconto sugerido: 15%
- Médio: 1.25 (+25% vendas) - Desconto sugerido: 30%
- Agressivo: 1.50 (+50% vendas) - Desconto sugerido: 50%
```

#### 5. Estoque Final Previsto
```
Estoque Final = max(0, Estoque Atual - Venda Estimada)
```

### Resumo Geral (Summary)

```typescript
interface MarkdownSummary {
  verbaTotalDisponivel: number;        // Verba recebida da Renata
  verbaTotalUtilizada: number;         // Soma dos custos de desconto
  percentualUtilizacao: number;        // (utilizada / disponível) × 100
  margemMediaOriginal: number;         // Ponderada pelo estoque
  margemMediaFinal: number;            // Após descontos
  totalUnidadesEstoque: number;        // Soma do estoque
  totalUnidadesVendaEstimada: number;  // Soma das vendas estimadas
  totalEstoqueFinalPrevisto: number;   // Soma dos estoques finais
  economiaVerbaNaoUtilizada: number;   // Verba não usada
}
```

## 🎨 Interface (UI)

### 1. Painel de Controle (Sticky Header)

**Componente:** `<MarkdownControlPanel />`

4 cards com recálculo automático:

- **Card 1 - Utilização da Verba**
  - Percentual: Verde (<90%), Laranja (90-100%), Vermelho (>100%)
  - Valor absoluto utilizado
  - Alerta se exceder 100%

- **Card 2 - Margem Final Estimada**
  - Percentual final após descontos
  - Comparação com margem original
  - Redução em pontos percentuais

- **Card 3 - Venda Estimada**
  - Total de unidades estimadas
  - Percentual de aumento vs estoque

- **Card 4 - Estoque Final Previsto**
  - Unidades remanescentes
  - Comparação com estoque atual

### 2. Filtros Drill-down

**Componente:** `<MarkdownFilters />`

- **Busca por Nome**: Input de texto livre
- **Categoria**: Dropdown (Blusas, Calças, Vestidos, etc.)
- **Subcategoria**: Dropdown hierárquico (depende da categoria)
- **Tema de Coleção**: Dropdown (Verão Vibrante, Minimalista, etc.)

Tags ativas mostram filtros aplicados com opção de remover individualmente.

### 3. Tabela de Decisão

**Componente:** `<MarkdownTable />`

**Colunas:**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| Foto | Imagem | 48x48px do produto |
| Produto | Texto | Nome + Tema de Coleção |
| Categoria | Texto | Categoria + Subcategoria |
| Estoque Atual | Número | Unidades em estoque |
| Preço Original | Número | Preço + Margem original |
| % Desconto | **Input** | 0-100% editável |
| Preço Final | Calculado | Preço com desconto + Margem final |
| Nível de Corte | **Dropdown** | Baixo/Médio/Agressivo (cores) |
| Venda Est. | Calculado | Unidades estimadas |
| Estoque Final | Calculado | Unidades remanescentes |
| Custo Desc. | Calculado | Custo total do desconto |

**Interatividade:**
- Input de desconto: Recalcula tudo instantaneamente
- Dropdown de nível: Sugere desconto padrão ao mudar

**IDs para RBAC:**
- `input_desconto_{productId}` - Input de desconto
- `select_nivel_{productId}` - Dropdown de nível

### 4. Botões de Ação

```tsx
// Redistribuir Verba - Reaplica distribuição linear
<ActionButton
  icon={RefreshCw}
  label="Redistribuir Verba"
  onClick={handleResetDistribution}
  variant="outline"
/>

// Exportar Relatório - Excel/PDF (TODO)
<ActionButton
  icon={Download}
  label="Exportar Relatório"
  onClick={handleExport}
  variant="secondary"
/>

// Aplicar Plano - Avança no workflow
<ActionButton
  id="btn_aplicar_plano"
  icon={Check}
  label="Aplicar Plano de Markdown"
  onClick={() => setShowModal(true)}
  variant="primary"
  disabled={summary.percentualUtilizacao > 100}
/>
```

## ⚡ Performance

### Otimizações Implementadas

1. **useMemo para Cálculos**
```typescript
const productsWithCalculations = useMemo(() => {
  return products.map(product => calculateAll(product));
}, [products]); // Só recalcula se produtos mudarem
```

2. **Filtragem Eficiente**
```typescript
const filteredProducts = useMemo(() => {
  return applyMarkdownFilters(allProducts, filters);
}, [allProducts, filters]);
```

3. **Estado Limpo**
```typescript
// Apenas um estado para produtos
const [allProducts, setAllProducts] = useState([]);

// Produtos filtrados e calculados derivados via useMemo
// Não duplicamos dados no estado
```

4. **Atualização Granular**
```typescript
// Atualiza apenas o produto específico
setAllProducts(prev => 
  prev.map(p => p.id === productId ? {...p, ...updates} : p)
);
```

## 🔄 Workflow Sequencial

```
CEO (Murilo)
   ↓ Define metas gerais
Direção Criativa (Renata)
   ↓ Define verba de markdown por grupo
   ↓ Clica "btn_aplicar_metas"
   ↓ Libera para:
Estilo (Carol) / Outros perfis
   ↓ Acessa /cycle-closing
   ↓ Vê apenas produtos do seu grupo (RBAC)
   ↓ Planeja descontos e níveis de corte
   ↓ Clica "btn_aplicar_plano"
   ↓ Gera relatório final
   ✓ Ciclo completo
```

## 📊 Exemplo de Uso

### Cenário: Carol (Estilo - Grupo Feminino)

1. **Recebe notificação:** "Renata aprovou verba de R$ 150.000 para markdown"

2. **Acessa tela:** `/cycle-closing`
   - Vê apenas produtos femininos descontinuados
   - 8 produtos ordenados por estoque (maior → menor)
   - Distribuição linear inicial já aplicada

3. **Ajusta estratégia:**
   - Vestido Midi (alto estoque): 30% desconto, Médio
   - Blusa Oversized: 15% desconto, Baixo
   - Top Cropped: 50% desconto, Agressivo

4. **Monitora painel:**
   - Utilização: 98.5% ✓ (dentro do orçamento)
   - Margem final: 42.3% ✓ (acima de 30%)
   - Venda estimada: 1.890 unidades
   - Estoque final: 210 unidades

5. **Aprova:** Clica "Aplicar Plano de Markdown"
   - Modal abre com resumo
   - Adiciona observações
   - Confirma → Relatório gerado

## 🚨 Validações e Alertas

### Alerta: Verba Excedida
```typescript
if (percentualUtilizacao > 100) {
  // Card vermelho + mensagem de erro
  // Botão "Aplicar Plano" desabilitado
  alert("Verba excedida em R$ X.XXX,XX");
}
```

### Alerta: Margem Baixa
```typescript
if (margemMediaFinal < 30) {
  // Alerta laranja (não bloqueia aprovação)
  warning("Margem final abaixo de 30%");
}
```

### Validação de Input
```typescript
// Desconto limitado entre 0-100%
const percentual = Math.min(100, Math.max(0, inputValue));
```

## 🔌 Integração com Backend (TODO)

### Endpoints Necessários

```typescript
// Buscar produtos para markdown
GET /api/tenants/:tenantId/products/markdown?grupo={grupo}
Response: ProductMarkdown[]

// Buscar verba disponível
GET /api/tenants/:tenantId/cycles/:cycleId/markdown-budget?grupo={grupo}
Response: { verbaTotalRemarcacao: number, definidoPor: string }

// Salvar plano de markdown
POST /api/tenants/:tenantId/cycles/:cycleId/markdown-plan
Body: {
  grupoId: string,
  products: ProductMarkdown[],
  summary: MarkdownSummary,
  observations: string
}

// Aprovar plano
POST /api/tenants/:tenantId/cycles/:cycleId/markdown-plan/approve
Body: { observations: string }
```

## 🎓 Conceitos Importantes

### Elasticidade de Preço
```
Quanto maior o desconto → Maior o aumento esperado nas vendas

Baixo (15%): Consumidor sensível → +10% vendas
Médio (30%): Desconto atrativo → +25% vendas  
Agressivo (50%): Liquidação → +50% vendas
```

### Margem vs Markup
```
Margem = (Preço - Custo) / Preço × 100
Markup = (Preço - Custo) / Custo × 100

Usamos MARGEM no sistema.
```

### Distribuição Linear
```
Estratégia inicial que distribui a verba igualmente.
Usuário pode ajustar manualmente depois.
```

## 🧪 Dados Mock

Os dados mock estão hardcoded em `CycleClosing.tsx`:
- 8 produtos do grupo Feminino
- Estoque variando de 90 a 400 unidades
- Margens originais entre 60-61%
- 2 temas: "Verão Vibrante" e "Minimalista Urbano"

**Em produção:** Substituir por chamada ao backend.

## 📝 Checklist de Implementação Backend

- [ ] Criar tabela `markdown_budgets` (verba por grupo)
- [ ] Criar tabela `markdown_plans` (planos aprovados)
- [ ] Criar tabela `markdown_plan_products` (produtos no plano)
- [ ] Endpoint: GET produtos para markdown (filtrado por grupo)
- [ ] Endpoint: GET verba disponível
- [ ] Endpoint: POST salvar plano (rascunho)
- [ ] Endpoint: POST aprovar plano
- [ ] Endpoint: GET histórico de planos
- [ ] Implementar exportação para Excel
- [ ] Implementar exportação para PDF
- [ ] Notificações em tempo real (quando Renata aprova)

## 🎨 Customizações Possíveis

1. **Níveis de Corte Customizados**: Permitir empresa definir seus próprios níveis
2. **Elasticidade Variável**: Aprender com histórico de vendas
3. **Restrições por Categoria**: Limite de desconto por tipo de produto
4. **Multi-moeda**: Suporte para diferentes moedas
5. **Seasonality**: Considerar sazonalidade nas estimativas

---

**Desenvolvido para Fashion Mind SaaS**  
Versão: 1.0.0  
Data: 2026-03-25
