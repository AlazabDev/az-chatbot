import { createServerFn } from "@tanstack/react-start";
import { signConversation, verifyConversation } from "@/lib/threadTokens.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { foundryRequest } from "@/lib/foundry-transport.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RequestData = {
  agentId: string; threadId?: string | null; message: string;
  attachments?: Array<{ url: string; name: string; type: string }>;
};

const chatSchema = z.object({
  agentId: z.string().regex(UUID),
  threadId: z.string().max(512).nullable().optional(),
  message: z.string().trim().max(8000),
  attachments: z.array(z.object({
    url: z.string().url().max(4096), name: z.string().max(255), type: z.string().max(128),
  })).max(10).default([]),
}).refine((data) => data.message.length > 0 || data.attachments.length > 0);

export const foundryAgentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: RequestData) => {
    return chatSchema.parse(data);
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agent, error } = await supabaseAdmin.from("bot_agents")
      .select("id,agent_name,provider,agent_version,is_active")
      .eq("id", data.agentId).eq("provider", "foundry")
      .eq("is_active", true).maybeSingle();
    if (error || !agent?.agent_name) throw new Error("Selected agent is not available");

    // Each signed conversation is tied to its selected agent UUID.
    let conversation = verifyConversation(data.threadId, agent.id, context.userId);
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
            !decodeURIComponent(url.pathname).startsWith(`/storage/v1/object/sign/chatbot-uploads/${context.userId}/`)) continue;
        if (attachment.type.startsWith("image/")) {
          content.push({ type: "input_image", image_url: url.toString() });
        } else {
          content.push({ type: "input_text", text: `المرفق: ${attachment.name}\n${url.toString()}` });
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
    return { reply, threadId: signConversation(conversation, agent.id, context.userId),
      agent: { id: agent.id, name: agent.agent_name, version: agent.agent_version } };
  });
