# Fashion Mind - Módulo Super Admin / Gestão de Clientes
## Arquitetura Multi-tenant com RBAC (Role-Based Access Control)

---

## 📋 ESTRUTURA DO MÓDULO

### **Tela 1: Gestão de Clientes (Tenants)**
**Arquivo:** `/src/app/pages/SuperAdmin_ClientManagement.tsx`  
**Rota:** `/superadmin/clients`

**Componentes e Naming Convention:**
- `SuperAdmin_ClientManagement` - Componente principal
- `Client` (interface) - Modelo de dados do tenant
- Cards de estatísticas: `TotalClients`, `ActiveClients`, `InactiveClients`, `TotalUsers`
- Tabela: `ClientsTable` com colunas estruturadas
- Modal: `NewClientModal` para cadastro

**Funcionalidades:**
- Dashboard com busca inteligente (nome da marca ou CNPJ)
- Cards de métricas consolidadas
- Tabela responsiva com ações: Editar, Gerenciar Usuários, Suspender/Ativar
- Botão "Novo Cliente" com modal de cadastro
- Status visual (Ativo/Inativo) com ícones coloridos

**Campos de Dados:**
- Nome da Marca
- CNPJ
- Plano Assinado (Starter, Professional, Enterprise)
- Status (Ativo/Inativo)
- Data de Cadastro
- Quantidade de Usuários

---

### **Tela 2: Cadastro de Usuários (Por Cliente)**
**Arquivo:** `/src/app/pages/SuperAdmin_UserManagement.tsx`  
**Rota:** `/superadmin/client/:clientId/users`

**Componentes e Naming Convention:**
- `SuperAdmin_UserManagement` - Componente principal
- `ClientUser` (interface) - Modelo de dados do usuário
- Header com contexto do cliente: `ClientContextHeader`
- Modal: `InviteUserModal` para convites por e-mail

**Funcionalidades:**
- Header contextual com informações do cliente selecionado
- Busca por nome, e-mail ou setor
- Cards de métricas: Total de Usuários, Usuários Ativos, Convites Pendentes
- Tabela com status visual (Ativo, Convite Enviado, Inativo)
- Ações: Configurar Permissões, Editar, Reenviar Convite, Remover
- Botão "Convidar Usuário" com modal e envio de e-mail (simulado)
- Navegação direta para Matriz de Permissões

**Campos de Dados:**
- Nome Completo
- E-mail
- Setor/Departamento
- Perfil/Função
- Último Acesso
- Status do Convite

---

### **Tela 3: Matriz de Perfis e Permissões RBAC**
**Arquivo:** `/src/app/pages/SuperAdmin_PermissionMatrix.tsx`  
**Rota:** `/superadmin/client/:clientId/permissions` ou `/superadmin/client/:clientId/user/:userId/permissions`

**Componentes e Naming Convention:**
- `SuperAdmin_PermissionMatrix` - Componente principal (O CORAÇÃO DO RBAC)
- `Module` (interface) - Módulos do sistema
- `Permission` (interface) - Estrutura de permissões (View, Edit, Approve)
- `UserPermissionConfig` (interface) - Configuração completa do usuário

**Funcionalidades:**

#### **1. Selecionador de Usuário**
- Dropdown com lista de usuários do cliente
- Exibe nome e e-mail
- Alerta de alterações não salvas ao trocar de usuário

#### **2. Atribuição de Perfil Global**
Grid de cards clicáveis com 6 perfis predefinidos:
- **CEO**: Acesso total com poder de aprovação estratégica
- **Direção Criativa**: Aprovação tática e gestão de coleções
- **Estilo**: Execução operacional e desenvolvimento
- **Comercial**: Visualização e análises comerciais
- **Analista**: Visualização e suporte analítico
- **Visualizador**: Apenas visualização sem edição

Ao selecionar um perfil, as permissões são pré-configuradas automaticamente.

#### **3. Matriz de Permissões Granulares**
Organizada em 3 categorias de módulos:

**Módulo de Planejamento:**
- Planejamento Estratégico
- Quebra de Metas por Grupo
- Planejamento de Coleção
- Estrutura do Mix de Produtos

**Módulo de Acompanhamento:**
- Acompanhamento de Coleção (Dir. Criativa)
- Acompanhamento de Coleção (Estilo)

**Módulo de Fechamento de Ciclo:**
- Simulador de Markdown
- Fechamento de Ciclo e Promoções

**Três níveis de permissão por módulo:**
- 👁️ **Visualizar** (canView) - Ícone Eye, cor azul sereno
- ✏️ **Editar** (canEdit) - Ícone Edit, cor vinho escuro
- ✅ **Aprovar** (canApprove) - Ícone CheckCircle, cor verde

**Lógica de Dependência:**
- Editar requer Visualizar
- Aprovar requer Editar
- Desmarcar níveis superiores desativa os inferiores automaticamente

---

## 🎨 DESIGN SYSTEM APLICADO

Mantém rigorosamente o design system do Fashion Mind:

- **Degradê do Header**: `from-[#7598CF] to-[#B8A8E0]`
- **Barras/Destaques**: `#F6F3AA` (amarelo pálido)
- **Textos principais**: `#28071C` (vinho escuro)
- **Cards/Fundos**: `#E7E7E6` (cinza claro)
- **Botões primários**: `#28071C` com texto branco
- **Botões secundários**: `#7598CF` com texto branco

**Hierarquia Visual:**
- Bordas superiores coloridas nos containers principais
- Cards com shadow-sm para profundidade
- Hover states em todos os elementos interativos
- Ícones Lucide React consistentes em todo o módulo

---

## 🔐 LÓGICA DE RBAC

### **Estrutura de Dados**

```typescript
interface Permission {
  moduleId: string;
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
}

interface UserPermissionConfig {
  userId: string;
  userName: string;
  userEmail: string;
  globalProfile: string;
  permissions: Permission[];
}
```

### **Fluxo de Trabalho**

1. **Super Admin acessa Gestão de Clientes**
2. **Seleciona um cliente e clica em "Gerenciar Usuários"**
3. **Visualiza lista de usuários do tenant**
4. **Clica em "Configurar Permissões" para um usuário específico**
5. **Atribui Perfil Global (pré-configurações automáticas)**
6. **Personaliza permissões granulares por módulo**
7. **Salva configuração no backend**

### **Preparação para Backend**

Todas as funções de CRUD estão simuladas com mock data, prontas para:
- Integração com API REST
- Persistência em banco de dados
- Autenticação JWT
- Validação de permissões no backend

---

## 🚀 ROTAS IMPLEMENTADAS

```typescript
/superadmin/clients
  ↳ Gestão de Clientes (listagem e cadastro)

/superadmin/client/:clientId/users
  ↳ Gestão de Usuários do Cliente

/superadmin/client/:clientId/permissions
  ↳ Matriz de Permissões (sem usuário pré-selecionado)

/superadmin/client/:clientId/user/:userId/permissions
  ↳ Matriz de Permissões (usuário específico)
```

---

## 📦 PREPARAÇÃO PARA EXPORTAÇÃO

**Naming Convention Aplicada:**
- Prefixo `SuperAdmin_` em todos os componentes do módulo
- Interfaces tipadas com nomes claros (`Client`, `ClientUser`, `Permission`)
- Funções com nomes autodescritivos
- Constantes organizadas (ex: `modules`, `globalProfiles`)

**Estrutura Modular:**
- Cada tela é um componente independente
- Interfaces compartilháveis entre componentes
- Lógica de negócio separada da apresentação
- Pronta para migração de dados mockados para API real

---

## 🎯 PRÓXIMOS PASSOS SUGERIDOS

1. **Backend Integration**: Conectar com API para persistência real
2. **Auditoria**: Log de alterações de permissões
3. **Notificações**: Sistema de e-mails transacionais
4. **Dashboard de Analytics**: Métricas de uso por cliente
5. **Importação em Massa**: Upload de CSV para usuários
6. **Multi-idioma**: Internacionalização (i18n)
7. **Testes Automatizados**: Unit tests e E2E tests

---

**Criado em:** 31/03/2026  
**Módulo:** Super Admin / Gestão de Clientes  
**Sistema:** Fashion Mind - Business Intelligence para Moda  
**Arquitetura:** Multi-tenant SaaS com RBAC Granular
