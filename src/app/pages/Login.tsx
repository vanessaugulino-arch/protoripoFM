import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { signIn, getUserProfile } from "../../services/supabase/authService";
import type { SystemRole } from "../../services/supabase/adminService";
import {
  isOnboardingCompleteDb,
  loadOnboardingProfileFromDb,
} from "../../services/supabase/onboardingService";
import { initPlanCycles } from "../types/planCycle";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  system_role: SystemRole;
  tenant_id: string;
  tenant_name: string;
  role_id: string | null;
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { session } = await signIn(email, password);
      if (!session?.user) throw new Error("Sessão inválida após autenticação.");

      const profile = await getUserProfile(session.user.id);
      if (!profile) throw new Error("Perfil de usuário não encontrado. Contate o administrador.");

      const currentUser: CurrentUser = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        system_role: (profile.system_role as SystemRole) ?? "invited_user",
        tenant_id: profile.tenant_id,
        tenant_name: (profile as any).tenants?.name ?? "",
        role_id: profile.role_id ?? null,
      };

      sessionStorage.setItem("currentUser", JSON.stringify(currentUser));

      // Pré-carrega ciclos de planejamento do Supabase para o cache em memória
      if (currentUser.tenant_id) {
        initPlanCycles(currentUser.tenant_id).catch(() => { /* silent — ciclos carregados sob demanda */ });
      }

      if (currentUser.system_role === "support") {
        navigate("/tenant-selector");
        return;
      }

      if (currentUser.system_role === "client_admin") {
        sessionStorage.setItem("activeTenantId", currentUser.tenant_id);
        sessionStorage.setItem("activeTenantName", currentUser.tenant_name);

        // ── Sincroniza localStorage com o DB (resolve perda de cache entre devices) ──
        const dbDone = await isOnboardingCompleteDb(currentUser.tenant_id).catch(() => false);
        const onboardingDone = dbDone || localStorage.getItem("fashionmind_onboarding_complete") === "true";

        // Onboarding JÁ concluído (fonte canônica = DB) → vai direto ao dashboard,
        // sem repetir apresentação nem telas de conceito, mesmo em navegador novo.
        if (onboardingDone) {
          if (dbDone) await loadOnboardingProfileFromDb(currentUser.tenant_id).catch(() => null);
          localStorage.setItem("fashionmind_presentation_seen", "true");
          localStorage.setItem("fashionmind_onboarding_complete", "true");
          navigate("/dashboard");
          return;
        }

        // Primeiro acesso do tenant → apresentação e depois onboarding.
        const presentationSeen = localStorage.getItem("fashionmind_presentation_seen");
        if (!presentationSeen) navigate("/presentation");
        else navigate("/onboarding");
        return;
      }

      // Usuário convidado: fluxo normal de apresentação/onboarding
      const tid = currentUser.tenant_id;
      const dbDoneInv = tid
        ? await isOnboardingCompleteDb(tid).catch(() => false)
        : false;
      const onboardingDoneInv = dbDoneInv || localStorage.getItem("fashionmind_onboarding_complete") === "true";

      // Onboarding do tenant já concluído → dashboard direto (sem repetir telas).
      if (onboardingDoneInv) {
        if (dbDoneInv) await loadOnboardingProfileFromDb(tid).catch(() => null);
        localStorage.setItem("fashionmind_presentation_seen", "true");
        localStorage.setItem("fashionmind_onboarding_complete", "true");
        navigate("/dashboard");
      } else {
        const presentationSeen = localStorage.getItem("fashionmind_presentation_seen");
        if (!presentationSeen) navigate("/presentation");
        else navigate("/onboarding");
      }
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (
        msg.includes("Invalid login credentials") ||
        msg.includes("invalid_credentials")
      ) {
        setError("E-mail ou senha incorretos.");
      } else if (msg.includes("Email not confirmed")) {
        setError("E-mail ainda não confirmado. Verifique sua caixa de entrada.");
      } else {
        setError(msg || "Erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse 120% 100% at 55% 40%, #87A7E7 0%, #6281B2 40%, #1F416C 70%, #0F2545 90%), radial-gradient(ellipse 60% 60% at 5% 100%, #2E1325 0%, transparent 60%)' }}>
      {/* Logo at Top */}
      <div className="text-center mb-8">
        <h1 className="text-[#F6F3AA] text-2xl">tfo <span className="text-[#F6F3AA]/70">/ THE FASHION OFFICE</span></h1>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#F2F2F2] rounded-3xl shadow-2xl p-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-3xl text-[#28071C] mb-2">
            Fashion Mind
          </h2>
          <p className="text-[#28071C]/80 text-sm">
            Decisões estratégicas para suas coleções
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Field */}
          <div>
            <label className="block text-[#28071C] text-sm font-medium mb-2">
              E-mail
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#28071C]/40">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white border-2 border-[#28071C]/10 text-[#28071C] pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:border-[#7598CF] transition-colors"
                placeholder="seu@email.com.br"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-[#28071C] text-sm font-medium mb-2">
              Senha
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#28071C]/40">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white border-2 border-[#28071C]/10 text-[#28071C] pl-12 pr-12 py-3 rounded-xl focus:outline-none focus:border-[#7598CF] transition-colors"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#28071C]/40 hover:text-[#28071C]/70 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-2 border-[#28071C]/20 text-[#7598CF]"
              />
              <span className="text-[#28071C]/70 text-sm">Lembrar de mim</span>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#28071C] to-[#7598CF] text-[#F6F3AA] font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
