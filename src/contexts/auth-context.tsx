import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import {
  clearSessionSnapshot,
  loadSessionSnapshot,
  persistSessionSnapshot,
  readSupabaseSession,
  type SessionSnapshot,
} from "@/lib/supabase/session";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  snapshot: SessionSnapshot;
  loading: boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function resolveRole(user: User | null): Promise<AppRole | null> {
  if (!user) return null;

  const checks = await Promise.all(
    APP_ROLES.map(async (role) => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: role,
      });
      return !error && Boolean(data);
    }),
  );

  const index = checks.findIndex(Boolean);
  return index === -1 ? null : APP_ROLES[index];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    () => loadSessionSnapshot() ?? { session: null, user: null, hydratedAt: Date.now() },
  );
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const syncSnapshot = async () => {
    const next = await readSupabaseSession();
    setSnapshot(next);
    persistSessionSnapshot(next);
    setRole(await resolveRole(next.user));
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await syncSnapshot();
      setLoading(false);
    })();

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const next: SessionSnapshot = {
        session,
        user: session?.user ?? null,
        hydratedAt: Date.now(),
      };
      setSnapshot(next);
      if (session) {
        persistSessionSnapshot(next);
      } else {
        clearSessionSnapshot();
      }
      setRole(await resolveRole(session?.user ?? null));
      setLoading(false);
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: snapshot.session,
      user: snapshot.user,
      role,
      snapshot,
      loading,
      refreshSession: async () => {
        setLoading(true);
        await syncSnapshot();
        setLoading(false);
      },
    }),
    [loading, role, snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
