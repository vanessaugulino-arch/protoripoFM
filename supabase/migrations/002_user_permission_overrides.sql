-- Migration 002: Tabela de overrides de permissão por usuário individual
-- Executar no SQL Editor do Supabase APÓS migration 001

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_id   uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  can_view    boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id)
);

COMMENT ON TABLE public.user_permission_overrides IS
  'Override granular de permissão por usuário individual. Prevalece sobre permission_matrix (que é por cargo/role).';

CREATE INDEX IF NOT EXISTS upo_user_id_idx    ON public.user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS upo_tenant_id_idx  ON public.user_permission_overrides(tenant_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_permission_overrides_updated_at
  BEFORE UPDATE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Suporte: acesso total
CREATE POLICY "support_full_access_upo" ON public.user_permission_overrides
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.system_role = 'support'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.system_role = 'support'
    )
  );

-- Admin do cliente: gerencia apenas usuários do próprio tenant
CREATE POLICY "client_admin_own_tenant_upo" ON public.user_permission_overrides
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.system_role = 'client_admin'
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.system_role = 'client_admin'
    )
  );

-- Usuário convidado: pode ler apenas as próprias permissões
CREATE POLICY "user_read_own_permissions" ON public.user_permission_overrides
  FOR SELECT
  USING (user_id = auth.uid());
