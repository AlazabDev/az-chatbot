import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { env } from "@/lib/env";

const isBrowser = typeof window !== "undefined";

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: isBrowser ? window.localStorage : undefined,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: true,
  },
});
