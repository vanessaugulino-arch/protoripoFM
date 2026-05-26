# Fashion Mind - Guia de Implementação SaaS Multi-Cliente

## 🎯 Objetivo

Estruturar o Fashion Mind para funcionar como SaaS com múltiplos clientes, mantendo o workflow sequencial entre perfis (CEO → Direção Criativa → Estilo).

## 📦 Estrutura Criada

### 1. Sistema de Tipos (`/src/app/types/workflow.ts`)

Define toda a estrutura de dados do sistema:

- **Perfis**: CEO, Direção Criativa, Estilo
- **Status do Workflow**: draft, pending_creative, pending_style, completed, in_revision
- **Hierarquia de Produtos**: Grupo → Categoria → Subcategoria → Produto
- **Ciclos de Coleção**: Estrutura com seções para cada perfil
- **Permissões**: Controle de acesso por perfil

### 2. Utilitários de Permissão (`/src/app/utils/permissions.ts`)

Funções para gerenciar permissões:

- `getPermissionsByProfile()` - Retorna permissões do perfil
- `getNextProfile()` - Próximo perfil no workflow
- `getPreviousProfile()` - Perfil anterior (para ajustes)
- `getImpactedProfiles()` - Perfis impactados por ajustes
- `canAdjustSection()` - Valida se pode ajustar seção

### 3. Context de Workflow (`/src/app/contexts/WorkflowContext.tsx`)

Estado global do sistema:

```typescript
const {
  cycle,              // Ciclo atual
  currentUser,        // Usuário logado
  permissions,        // Permissões do usuário
  isLoading,          // Estado de carregamento
  error,              // Erros
  approveCycle,       // Aprovar e avançar workflow
  updateCycle,        // Atualizar dados do ciclo
} = useWorkflow();
```

### 4. Componentes Reutilizáveis

#### `DashboardHeader`
Header padronizado com navegação e informações do usuário.

#### `KPICard`
Cards de KPIs reutilizáveis com ícones e valores.

#### `ActionButton`
Botões de ação com IDs para RBAC (btn_aplicar_metas, btn_aplicar_plano).

#### `ApprovalModal`
Modal de aprovação com resumo e campo de observações.

#### `SectionContainer`
Container inteligente que gerencia visibilidade e edição baseado em permissões.

## 🔄 Fluxo de Trabalho Implementado

### 1. Iniciar Novo Ciclo (CEO)

```
CEO define metas → Clica "btn_aplicar_metas" → 
Modal abre → Adiciona observações → 
Relatório gerado → Status = "pending_creative" →
Notifica Direção Criativa
```

### 2. Planejamento Tático (Direção Criativa)

```
Recebe notificação → Vê metas do CEO (read-only) →
Define planejamento tático → Clica "btn_aplicar_metas" →
Modal abre → Adiciona observações →
Relatório gerado → Status = "pending_style" →
Notifica Estilo
```

### 3. Planejamento Operacional (Estilo)

```
Recebe notificação → Vê direcionamentos (read-only) →
Define mix de produtos → Clica "btn_aplicar_plano" →
Modal abre → Adiciona observações →
Relatório final → Status = "completed"
```

## 🔐 Sistema de Permissões

### Matriz de Permissões

| Perfil | section_murilo_estrategico | section_renata_tatico | section_carol_operacional |
|--------|---------------------------|----------------------|--------------------------|
| CEO | ✅ Edit | 👁️ View | 👁️ View |
| Direção Criativa | 👁️ View | ✅ Edit | 👁️ View |
| Estilo | ❌ Hidden | 👁️ View | ✅ Edit |

### Regras de Ajuste

```typescript
// CEO ajusta estratégico
if (CEO altera metas) {
  marcar_revisao_necessaria(["Direção Criativa", "Estilo"]);
}

// Direção Criativa ajusta tático
if (Renata altera planejamento) {
  validar_nao_altera_estrategico();
  marcar_revisao_necessaria(["Estilo"]);
}

// Estilo ajusta operacional
if (Carol altera mix) {
  validar_nao_altera_tatico();
  // Não impacta ninguém
}
```

## 🏗️ Como Adicionar Nova Tela

### 1. Criar Componente da Tela

```tsx
// /src/app/pages/MinhaNovaTelaEstrategica.tsx
import { useWorkflow } from "../contexts/WorkflowContext";
import { DashboardHeader } from "../components/DashboardHeader";
import { SectionContainer } from "../components/SectionContainer";
import { ActionButton } from "../components/ActionButton";

export default function MinhaNovaTelaEstrategica() {
  const { currentUser, permissions, cycle } = useWorkflow();
  
  return (
    <div className="min-h-screen bg-[#E7E7E6]">
      <DashboardHeader
        userName={currentUser?.name || ""}
        userProfile={currentUser?.profile || ""}
        title="Fashion Mind | Minha Nova Tela"
        showBackButton
        onLogout={handleLogout}
      />
      
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Seção CEO */}
        <SectionContainer
          id="section_murilo_estrategico"
          currentUserProfile={currentUser?.profile || "CEO"}
          sectionOwnerProfile="CEO"
          isApproved={cycle?.section_murilo_estrategico.approvedAt !== undefined}
        >
          {/* Conteúdo da seção CEO */}
        </SectionContainer>
        
        {/* Seção Direção Criativa */}
        <SectionContainer
          id="section_renata_tatico"
          currentUserProfile={currentUser?.profile || "CEO"}
          sectionOwnerProfile="Direção Criativa"
          isApproved={cycle?.section_renata_tatico?.approvedAt !== undefined}
        >
          {/* Conteúdo da seção Renata */}
        </SectionContainer>
        
        {/* Seção Estilo */}
        <SectionContainer
          id="section_carol_operacional"
          currentUserProfile={currentUser?.profile || "CEO"}
          sectionOwnerProfile="Estilo"
          isApproved={cycle?.section_carol_operacional?.approvedAt !== undefined}
        >
          {/* Conteúdo da seção Carol */}
        </SectionContainer>
      </main>
    </div>
  );
}
```

### 2. Adicionar Rota

```tsx
// /src/app/routes.ts
import MinhaNovaTelaEstrategica from "./pages/MinhaNovaTelaEstrategica";

{
  path: "/minha-nova-tela",
  Component: MinhaNovaTelaEstrategica,
}
```

## 📝 Naming Convention - IDs Importantes

### Botões de Ação (RBAC)

- `btn_aplicar_metas` - Aprovar metas (usado por CEO e Direção Criativa)
- `btn_aplicar_plano` - Aprovar plano (usado por Estilo)
- `btn_salvar_rascunho` - Salvar sem aprovar
- `btn_ajustar_orcamento` - Ajustar orçamento
- `btn_exportar_relatorio` - Exportar relatório
- `btn_simular_cenario` - Simular cenários de markdown

### Inputs de Dados (Estado do Ciclo)

Use IDs consistentes em TODAS as telas:

```tsx
// Estratégico (CEO)
<input id="input_meta_receita" />
<input id="input_orcamento_otb" />
<input id="input_margem_alvo" />

// Tático (Direção Criativa)
<input id="input_meta_grupo_feminino" />
<input id="input_meta_grupo_masculino" />
<input id="input_meta_grupo_infantil" />
<input id="input_tema_nome" />
<input id="input_tema_cores" />

// Operacional (Estilo)
<input id="input_produto_quantidade" />
<input id="input_produto_preco" />
<input id="input_produto_categoria" />
```

### Seções por Perfil

- `section_murilo_estrategico` - Seção do CEO
- `section_renata_tatico` - Seção da Direção Criativa
- `section_carol_operacional` - Seção do Estilo

## 🔌 Integração com Backend

### Preparação para Multi-Cliente

```typescript
// Estrutura de tenant (cliente)
interface Tenant {
  id: string;
  name: string; // Nome da empresa cliente
  domain: string; // Subdomínio (ex: zara.fashionmind.com)
  settings: {
    grupos: string[]; // ["Feminino", "Masculino", "Infantil"]
    categorias: Category[];
    users: User[];
  };
}

// Ciclo com tenant
interface CollectionCycle {
  id: string;
  tenantId: string; // ID do cliente
  name: string;
  // ... resto dos campos
}
```

### Endpoints Sugeridos

```typescript
// Ciclos
POST   /api/tenants/:tenantId/cycles
GET    /api/tenants/:tenantId/cycles
GET    /api/tenants/:tenantId/cycles/:cycleId
PUT    /api/tenants/:tenantId/cycles/:cycleId
DELETE /api/tenants/:tenantId/cycles/:cycleId

// Aprovações
POST   /api/tenants/:tenantId/cycles/:cycleId/approve
GET    /api/tenants/:tenantId/cycles/:cycleId/reports

// Ajustes
POST   /api/tenants/:tenantId/cycles/:cycleId/revisions
GET    /api/tenants/:tenantId/cycles/:cycleId/revisions

// Notificações
GET    /api/tenants/:tenantId/users/:userId/notifications
POST   /api/tenants/:tenantId/notifications/mark-read
```

## 📊 Dados Mock vs Produção

### Desenvolvimento (Mock)

```typescript
// Use sessionStorage temporariamente
sessionStorage.setItem("currentCycle", JSON.stringify(cycle));
sessionStorage.setItem("currentUser", JSON.stringify(user));
```

### Produção (Backend)

```typescript
// Substituir por chamadas reais
const { data: cycle } = await supabase
  .from("cycles")
  .select("*")
  .eq("tenant_id", tenantId)
  .eq("id", cycleId)
  .single();

const { data: user } = await supabase.auth.getUser();
```

## ✅ Checklist de Implementação

### Para cada tela:

- [ ] Usar `WorkflowProvider` no App.tsx
- [ ] Usar `useWorkflow()` hook no componente
- [ ] Usar `DashboardHeader` component
- [ ] Usar `SectionContainer` para cada perfil
- [ ] Usar `ActionButton` com IDs corretos
- [ ] Usar `ApprovalModal` para aprovações
- [ ] IDs consistentes nos inputs (input_*)
- [ ] IDs consistentes nos botões (btn_*)
- [ ] Validar permissões antes de editar
- [ ] Mostrar/ocultar seções baseado no perfil

## 🎨 Exemplos de Uso

Ver arquivo `/ESTRUTURA_WORKFLOW.md` para exemplos completos de código.

## 🚀 Deploy Multi-Cliente

### Configuração de Domínios

```
Cliente A: clientea.fashionmind.com
Cliente B: clienteb.fashionmind.com
Admin: admin.fashionmind.com
```

### Variáveis de Ambiente

```env
VITE_API_URL=https://api.fashionmind.com
VITE_TENANT_MODE=multi # ou 'single' para desenvolvimento
VITE_DEFAULT_TENANT_ID=demo
```

## 📞 Suporte

Para dúvidas sobre a estrutura, consulte:
- `/ESTRUTURA_WORKFLOW.md` - Documentação completa
- `/src/app/types/workflow.ts` - Tipos TypeScript
- `/src/app/utils/permissions.ts` - Lógica de permissões
