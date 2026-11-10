import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.THREAD_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Server thread signing secret is missing");
  return value;
}

export function signConversation(id: string, agentId: string, userId: string): string {
  const signature = createHmac("sha256", secret())
    .update(JSON.stringify([userId, agentId, id])).digest("hex");
  return `${id}.${signature}`;
}

export function verifyConversation(token: string | null | undefined, agentId: string, userId: string): string | null {
  if (!token || token.length > 512) return null;
  const index = token.lastIndexOf(".");
  const id = token.slice(0, index);
  const signature = token.slice(index + 1);
  if (index < 1 || !/^[a-zA-Z0-9_-]+$/.test(id) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const expected = signConversation(id, agentId, userId).split(".")[1];
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")) ? id : null;
}