import { Constants, type Database } from "@/integrations/supabase/types";

/** Single source of truth: the `app_role` enum generated from the database schema. */
export type AppRole = Database["public"]["Enums"]["app_role"];

/** Roles in priority order (highest first). */
export const APP_ROLES: readonly AppRole[] = Constants.public.Enums.app_role;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}
