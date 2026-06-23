import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[FashionMind] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configuradas. " +
    "Adicione as variáveis nas configurações do projeto no Vercel. " +
    "O app continuará funcionando com dados locais enquanto isso."
  );
}

// Usa placeholders quando as variáveis não estão disponíveis para que o módulo
// não exploda na inicialização — as chamadas ao Supabase falharão graciosamente.
export const supabase = createClient<Database>(
  supabaseUrl  ?? "https://placeholder.supabase.co",
  supabaseKey  ?? "placeholder-key",
  {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
    },
  }
);
