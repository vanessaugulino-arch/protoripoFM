import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

// Test users database
const testUsers = [
  {
    name: "Beta",
    email: "contato@thefashionoffice.com.br",
    password: "AppFM-2026",
    profile: "CEO",
  },
  {
    name: "Admin",
    email: "admin@thefashionoffice.com.br",
    password: "admin",
    profile: "Super Admin",
  },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate user credentials
    const user = testUsers.find(
      (u) => u.email === email && u.password === password
    );

    if (user) {
      sessionStorage.setItem("currentUser", JSON.stringify(user));

      if (user.email === "admin@thefashionoffice.com.br") {
        navigate("/admin");
      } else {
        const onboardingDone = localStorage.getItem("fashionmind_onboarding_complete");
        if (!import.meta.env.DEV && onboardingDone === "true") {
          navigate("/dashboard");
        } else {
          navigate("/onboarding");
        }
      }
    } else {
      setError("E-mail ou senha incorretos");
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#7598CF] to-[#9B8CD8] p-4">
      {/* Logo at Top */}
      <div className="text-center mb-8">
        <h1 className="text-[#F6F3AA] text-2xl">tfo <span className="text-[#F6F3AA]/70">/ THE FASHION OFFICE</span></h1>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#E7E7E6] rounded-3xl shadow-2xl p-8">
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
          {/* Email Input */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-[#28071C] text-sm">
              E-mail corporativo
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#28071C]/50" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white rounded-lg text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#28071C]/30 border-0"
                placeholder="voce@marca.com.br"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-[#28071C] text-sm">
                Senha
              </label>
              <button
                type="button"
                className="text-sm text-[#28071C]/70 hover:text-[#28071C]"
              >
                Esqueceu a senha?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#28071C]/50" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-white rounded-lg text-[#28071C] focus:outline-none focus:ring-2 focus:ring-[#28071C]/30 border-0"
                placeholder="•••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#28071C]/50 hover:text-[#28071C] transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          {/* Remember Me */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 border-2 border-[#28071C] rounded accent-[#28071C] cursor-pointer"
            />
            <label htmlFor="remember" className="text-sm text-[#28071C] cursor-pointer">
              Lembrar de mim
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3.5 bg-[#28071C] text-white rounded-xl hover:bg-[#28071C]/90 transition-all duration-200 shadow-lg hover:shadow-xl mt-6"
          >
            Entrar
          </button>
        </form>
      </div>

      {/* Credenciais de Teste */}
      

      {/* Footer */}
      <div className="text-center mt-6">
        <p className="text-white/70 text-[#f6f3aab3] text-[13px]">© 2026 The Fashion Office. Todos os direitos reservados.</p>
      </div>
    </div>
  );
}