const FALLBACK_SUPABASE_URL = "https://fjojyzvulhvqeitnaenv.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqb2p5enZ1bGh2cWVpdG5hZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODc2MzIsImV4cCI6MjA4NzU2MzYzMn0._Dxrh7K_-e1TGRE82V71nxPcXCP_xu4y7brDSyNdiHw";

function readViteEnv(key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY", fallback: string) {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export const env = {
  supabaseUrl: readViteEnv("VITE_SUPABASE_URL", FALLBACK_SUPABASE_URL),
  supabaseAnonKey: readViteEnv("VITE_SUPABASE_ANON_KEY", FALLBACK_SUPABASE_ANON_KEY),
  isSupabaseConfigured:
    Boolean(import.meta.env.VITE_SUPABASE_URL?.trim()) &&
    Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()),
} as const;
