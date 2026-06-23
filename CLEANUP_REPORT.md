# Relatório de Limpeza — Fashion Mind Admin Unification

> **Data:** 2026-06-19  
> **Gerado após:** Unificação do fluxo de admin (Issues diagnosticadas: dois protótipos paralelos, mock em sessionStorage, permissões por cargo genérico)  
> **Instrução:** NÃO excluir nenhum arquivo automaticamente — revise e aprove manualmente antes de deletar.

---

## Arquivos seguros para excluir

### 1. `src/app/pages/SuperAdmin_ClientManagement.tsx`

**Status:** ✅ Seguro para excluir

**Motivo:** Fluxo morto. Nunca foi importado por nenhum arquivo além de si mesmo.  
Usava `useParams({ clientId })` com rota `/superadmin/client/:clientId` que nunca existiu no router.  
Toda a funcionalidade de gestão de clientes foi absorvida por `Admin_Clients.tsx` (agora com dados reais do Supabase).

**Verificação de dependências:**
```
grep -r "SuperAdmin_ClientManagement" src/  → resultado vazio (só o próprio arquivo)
```
Nenhum outro arquivo importa este componente.

---

### 2. `src/app/pages/SuperAdmin_UserManagement.tsx`

**Status:** ✅ Seguro para excluir

**Motivo:** Fluxo morto. Nunca importado externamente.  
Usava rota `/superadmin/client/:clientId/users` que nunca existiu.  
O modelo de usuários (status active/invited/inactive, invite modal, departamento + cargo) foi aproveitado como referência e implementado em `Admin_Users.tsx` com dados reais do Supabase.

**Verificação de dependências:**
```
grep -r "SuperAdmin_UserManagement" src/  → resultado vazio (só o próprio arquivo)
```
Nenhum outro arquivo importa este componente.

---

### 3. `src/app/pages/SuperAdmin_PermissionMatrix.tsx`

**Status:** ✅ Seguro para excluir

**Motivo:** Fluxo morto. Nunca importado externamente.  
Usava rota `/superadmin/client/:clientId/user/:userId/permissions` que nunca existiu.  
O padrão correto de permissão (por usuário individual, perfil-base + override granular por módulo com canView/canEdit/canApprove) foi extraído e reimplementado em `Admin_Permissions.tsx`, agora conectado ao banco de dados real (`user_permission_overrides` + `permission_matrix`).

**Verificação de dependências:**
```
grep -r "SuperAdmin_PermissionMatrix" src/  → resultado vazio (só o próprio arquivo)
```
Nenhum outro arquivo importa este componente.

---

## Arquivos que NÃO entram nesta lista (não excluir)

| Arquivo | Motivo |
|---------|--------|
| `src/app/pages/ProfileAdjust.tsx` | Onboarding do cliente final (segmentos, matérias-primas, origem de peças). Usa localStorage como mecanismo deliberado de persitência do perfil de produto. **Pertence a outro fluxo — não é controle de acesso.** |
| `src/app/pages/Admin_Clients.tsx` | Reescrito com dados reais. Mantido. |
| `src/app/pages/Admin_Users.tsx` | Reescrito com dados reais. Mantido. |
| `src/app/pages/Admin_Permissions.tsx` | Reescrito com catálogo granular. Mantido. |
| `src/app/pages/AdminDashboard.tsx` | Reescrito como hub role-aware. Mantido. |

---

## Arquivos modificados nesta entrega (não excluir — apenas referência)

| Arquivo | O que mudou |
|---------|------------|
| `src/app/pages/Login.tsx` | Substituído mock por Supabase Auth real |
| `src/app/pages/AdminDashboard.tsx` | Role-aware: Suporte vê seletor de tenant; Admin do Cliente vê apenas próprio tenant |
| `src/app/pages/Admin_Clients.tsx` | Dados reais da tabela `tenants` via `adminService` |
| `src/app/pages/Admin_Users.tsx` | Dados reais de `users` + convite via `invitations` |
| `src/app/pages/Admin_Permissions.tsx` | Por usuário individual, catálogo de 39 módulos/seções/ações, persistência em `user_permission_overrides` |
| `src/lib/database.types.ts` | Adicionado `system_role` em `users` + nova tabela `user_permission_overrides` |

---

## Novos arquivos criados nesta entrega

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/001_admin_system_role.sql` | Adiciona `system_role` na tabela `users` e cria tenant de sistema |
| `supabase/migrations/002_user_permission_overrides.sql` | Cria tabela de overrides de permissão por usuário + RLS |
| `supabase/migrations/003_permission_catalog_seed.sql` | Seed do catálogo granular de permissões (39 entradas) |
| `src/services/supabase/adminService.ts` | Serviço de admin: CRUD de tenants, usuários, cargos, convites, permissões |
| `PERMISSION_CATALOG.md` | Documentação completa do catálogo de permissões (fonte de verdade) |
| `CLEANUP_REPORT.md` | Este arquivo |

---

## Próximos passos para validação

1. Executar as 3 migrations no Supabase SQL Editor (na ordem: 001, 002, 003)
2. Criar o usuário `suporte@thefashionoffice.com.br` no Supabase Dashboard → Authentication → Users
3. Executar o SQL comentado no final de `003_permission_catalog_seed.sql` com o UUID gerado
4. Logar com o usuário de suporte e validar o seletor de tenant no AdminDashboard
5. Criar cargos na tabela `roles` para o tenant de teste (via SQL ou futura UI de cargos)
6. Convidar um usuário teste e configurar suas permissões granulares
7. Após validação completa, excluir os 3 arquivos `SuperAdmin_*.tsx` listados acima
