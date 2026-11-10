/** Restrict paid/internal service-role Edge Functions to trusted workers.
 * The public anon JWT, a user's JWT, and API keys from the browser are NEVER
 * credentials for privileged worker entrypoints.
 */
export function hasInternalWorkerAuthorization(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = /^Bearer ([^\s]+)$/i.exec(header)?.[1];
  if (!provided) return false;
  const left = new TextEncoder().encode(provided);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const limit = Math.max(left.length, right.length);
  for (let i = 0; i < limit; i++) difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}
