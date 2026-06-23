-- Migration 001: Adiciona system_role na tabela users e cria tenant de sistema
-- Executar no SQL Editor do Supabase (https://supabase.com/dashboard → SQL Editor)

-- 1. Adiciona coluna system_role na tabela public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS system_role text NOT NULL DEFAULT 'invited_user'
  CHECK (system_role IN ('support', 'client_admin', 'invited_user'));

COMMENT ON COLUMN public.users.system_role IS
  'Papel de sistema do usuário: support (equipe TFO), client_admin (gestor do cliente), invited_user (usuário final convidado)';

CREATE INDEX IF NOT EXISTS users_system_role_idx ON public.users(system_role);

-- 2. Cria tenant de sistema para usuários de suporte
-- UUID fixo para facilitar referência em scripts posteriores
INSERT INTO public.tenants (id, name, status)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'The Fashion Office (Sistema)', 'active')
ON CONFLICT (id) DO NOTHING;
