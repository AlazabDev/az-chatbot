import { redirect } from "@tanstack/react-router";

import { supabase } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/auth/roles";

export async function requireSession(redirectTo = "/") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({ to: redirectTo });
  }

  return data.user;
}

async function hasRole(userId: string, role: AppRole) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: role,
  });

  if (error) return false;
  return Boolean(data);
}

export async function requireRoles(roles: AppRole[], redirectTo = "/") {
  const user = await requireSession(redirectTo);

  for (const role of roles) {
    if (await hasRole(user.id, role)) {
      return user;
    }
  }

  throw redirect({ to: redirectTo });
}

export async function requireAdminSession() {
  return requireRoles(["admin"]);
}
