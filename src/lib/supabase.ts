import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
});
