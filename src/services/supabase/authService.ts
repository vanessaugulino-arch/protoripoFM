import { supabase } from "../../lib/supabase";

// ─── Autenticação via Supabase Auth ───────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

// ─── Perfil do usuário na tabela public.users ─────────────────────────────────

export async function getUserProfile(authUserId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*, roles(*), tenants(*)")
    .eq("id", authUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─── Aceitar convite via token ────────────────────────────────────────────────

export async function acceptInvitation(token: string) {
  const { data: invite, error: invErr } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (invErr) throw invErr;
  if (!invite) throw new Error("Convite inválido ou expirado.");

  return invite;
}

export async function markInvitationAccepted(invitationId: string) {
  const { error } = await supabase
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) throw error;
}
