import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireGuestIdentity } from "@/lib/guestSession.server";
import { verifyConversation } from "@/lib/threadTokens.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const input = z.object({ agentId: z.string().min(1).max(128) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stored = { id: string; role: "user" | "assistant"; content: string; timestamp: number };

export const getGuestHistory = createServerFn({ method: "POST" })
  .inputValidator((raw: { agentId: string }) => input.parse(raw))
  .handler(async ({ data }) => {
    const visitor = requireGuestIdentity();
    const id = data.agentId;
    const resolved = UUID.test(id) ? id : (id.startsWith("az-agent-") ? id : "az-agent-" + id);
    const base = supabaseAdmin.from("bot_agents").select("id")
      .eq("provider", "foundry").eq("is_active", true).eq("public_access", true);
    const { data: agent, error } = UUID.test(id)
      ? await base.eq("id", resolved).maybeSingle()
      : await base.eq("agent_name", resolved).maybeSingle();
    if (error || !agent) return { messages: [] as Stored[], conversationId: "" };

    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: stored, error: readError } = await supabaseAdmin
      .from("chat_guest_state")
      .select("thread_token,messages")
      .eq("visitor_id", visitor).eq("agent_id", agent.id)
      .gte("updated_at", since).maybeSingle();
    if (readError || !stored) return { messages: [] as Stored[], conversationId: "" };
    const raw: unknown = stored.messages;
    const messages: Stored[] = Array.isArray(raw)
      ? raw.filter((m): m is Stored => m !== null && typeof m === "object" &&
          typeof m.id === "string" &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" && typeof m.timestamp === "number").slice(-30)
      : [];
    const conversationId = verifyConversation(stored.thread_token, agent.id, "guest:" + visitor)
      ? stored.thread_token : "";
    return { messages, conversationId };
  });
