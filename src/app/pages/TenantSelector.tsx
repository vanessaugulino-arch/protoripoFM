import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Building2, ChevronRight, LogOut, Loader2, Globe } from "lucide-react";
import { listTenants, type TenantRow } from "../../services/supabase/adminService";
import { signOut } from "../../services/supabase/authService";
import type { CurrentUser } from "./Login";

export default function TenantSelector() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("currentUser");
    if (!storedUser) { navigate("/"); return; }

    const userData: CurrentUser = JSON.parse(storedUser);
    if (userData.system_role !== "support") { navigate("/dashboard"); return; }

    setUser(userData);

    listTenants()
      .then(setTenants)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSelect = (tenant: TenantRow) => {
    setSelecting(tenant.id);
    sessionStorage.setItem("activeTenantId", tenant.id);
    sessionStorage.setItem("activeTenantName", tenant.name);
    navigate("/dashboard");
  };

  const handleLogout = async () => {
    try { await signOut(); } catch { /* ignora */ }
    sessionStorage.clear();
    navigate("/");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: 'radial-gradient(ellipse 120% 100% at 55% 40%, #87A7E7 0%, #6281B2 40%, #1F416C 70%, #0F2545 90%), radial-gradient(ellipse 60% 60% at 5% 100%, #2E1325 0%, transparent 60%)' }}>
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[#F6F3AA]">
          <Globe className="w-5 h-5" />
          <span className="text-sm font-medium">Suporte TFO — Selecione um cliente</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-[#F6F3AA]/70 hover:text-[#F6F3AA] transition-colors flex items-center gap-2 text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-[#F6F3AA] text-3xl font-light mb-2">Fashion Mind</h1>
            <p className="text-[#F6F3AA]/70 text-sm">
              Olá, {user.name}. Qual cliente você vai atender?
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-[#F6F3AA] animate-spin" />
              </div>
            ) : tenants.length === 0 ? (
              <div className="py-16 text-center text-[#F6F3AA]/60">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Nenhum cliente cadastrado ainda.</p>
                <button
                  onClick={() => navigate("/admin")}
                  className="mt-4 text-[#F6F3AA] underline text-sm"
                >
                  Ir para o painel admin
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {tenants.map((tenant) => (
                  <li key={tenant.id}>
                    <button
                      onClick={() => handleSelect(tenant)}
                      disabled={selecting === tenant.id}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/10 transition-colors text-left group disabled:opacity-60"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#F6F3AA]/20 rounded-full flex items-center justify-center group-hover:bg-[#F6F3AA]/30 transition-colors">
                          <Building2 className="w-5 h-5 text-[#F6F3AA]" />
                        </div>
                        <div>
                          <p className="text-[#F6F3AA] font-medium">{tenant.name}</p>
                          {tenant.cnpj && (
                            <p className="text-[#F6F3AA]/50 text-xs font-mono">{tenant.cnpj}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            tenant.status === "active"
                              ? "bg-green-500/20 text-green-300"
                              : "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {tenant.status === "active" ? "Ativo" : "Inativo"}
                        </span>
                        {selecting === tenant.id ? (
                          <Loader2 className="w-4 h-4 text-[#F6F3AA] animate-spin" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#F6F3AA]/40 group-hover:text-[#F6F3AA] transition-colors" />
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!loading && tenants.length > 0 && (
            <p className="text-center text-[#F6F3AA]/40 text-xs mt-4">
              Você poderá trocar de cliente a qualquer momento no dashboard
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
