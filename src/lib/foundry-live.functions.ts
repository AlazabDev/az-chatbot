import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { foundryRequest } from "@/lib/foundry-transport.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RequestData = {
  agentId: string; threadId?: string | null; message: string;
  attachments?: Array<{ url: string; name: string; type: string }>;
};

function getSecret() {
  const secret = process.env.THREAD_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server thread signing secret is missing");
  return secret;
}

function sign(id: string, agentId: string) {
  const signature = createHmac("sha256", getSecret()).update(agentId + ":" + id).digest("hex");
  return id + "." + signature;
}

function verify(value: string | null | undefined, agentId: string): string | null {
  if (!value || value.length > 512) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i);
  const got = value.slice(i + 1);
  if (!/^[0-9a-f]{64}$/i.test(got)) return null;
  const expected = createHmac("sha256", getSecret()).update(agentId + ":" + id).digest();
  const received = Buffer.from(got, "hex");
  return timingSafeEqual(expected, received) ? id : null;
}

export const foundryAgentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: RequestData) => {
    if (!UUID.test(data?.agentId || "") || typeof data.message !== "string" ||
      !data.message.trim() || data.message.length > 8000) throw new Error("Invalid chat input");
    return { ...data, message: data.message.trim(),
      attachments: (data.attachments || []).slice(0, 10) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agent, error } = await supabaseAdmin.from("bot_agents")
      .select("id,agent_name,provider,agent_version,is_active")
      .eq("id", data.agentId).eq("provider", "foundry")
      .eq("is_active", true).maybeSingle();
    if (error || !agent?.agent_name) throw new Error("Selected agent is not available");

    // Each signed conversation is tied to its selected agent UUID.
    let conversation = verify(data.threadId, agent.id);
    if (!conversation) {
      const fresh = await foundryRequest<{ id: string }>("/openai/v1/conversations", {
        method: "POST", body: JSON.stringify({}),
      });
      if (!fresh.id) throw new Error("Foundry conversation creation failed");
      conversation = fresh.id;
    }

    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: data.message }];
    const permitted = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : "";
    for (const attachment of data.attachments) {
      try {
        const url = new URL(attachment.url);
        if (url.protocol !== "https:" || !permitted || url.host !== permitted ||
            !url.pathname.startsWith("/storage/v1/object/sign/chatbot-uploads/")) continue;
        if (attachment.type.startsWith("image/")) {
          content.push({ type: "input_image", image_url: url.toString() });
        }
      } catch { /* ignore invalid URL */ }
    }
    const response = await foundryRequest<{
      output_text?: string;
      output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string | { value?: string } }> }>;
    }>("/agents/" + encodeURIComponent(agent.agent_name) + "/endpoint/protocols/openai/responses?api-version=v1", {
      method: "POST",
      body: JSON.stringify({
        conversation,
        input: [{ type: "message", role: "user", content }],
      }),
    });
    const reply = response.output_text?.trim() ||
      (response.output || []).filter((o) => o.type === "message" || o.role === "assistant")
        .flatMap((o) => o.content || [])
        .map((c) => typeof c.text === "string" ? c.text : c.text?.value || "")
        .filter(Boolean).join("\n").trim();
    if (!reply) throw new Error("Selected agent produced no answer");
    return { reply, threadId: sign(conversation, agent.id),
      agent: { id: agent.id, name: agent.agent_name, version: agent.agent_version } };
  });
