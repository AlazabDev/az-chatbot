import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

export const SUPABASE_SESSION_STORAGE_KEY = "azab.supabase.session";

export interface SessionSnapshot {
  session: Session | null;
  user: User | null;
  hydratedAt: number;
}

export function createEmptySessionSnapshot(): SessionSnapshot {
  return {
    session: null,
    user: null,
    hydratedAt: Date.now(),
  };
}

export async function readSupabaseSession(): Promise<SessionSnapshot> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return createEmptySessionSnapshot();
  }

  return {
    session: data.session ?? null,
    user: data.session?.user ?? null,
    hydratedAt: Date.now(),
  };
}

export function persistSessionSnapshot(_snapshot: SessionSnapshot): void {
  // Do not duplicate Supabase access/refresh tokens or user PII in a custom
  // localStorage entry. Supabase Auth owns session persistence.
}

export function loadSessionSnapshot(): SessionSnapshot | null {
  // Always hydrate from Supabase Auth instead of trusting a custom cached session.
  return null;
}

export function clearSessionSnapshot(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
