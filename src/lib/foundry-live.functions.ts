import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { executePublicChat, type PublicChatInput } from "@/lib/public-chat.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const publicChatSchema = z.object({
  agentId: z.string().regex(UUID),
  visitorId: z.string().uuid(),
  threadId: z.string().max(512).nullable().optional(),
  message: z.string().trim().min(1).max(8000),
  attachments: z.array(z.object({
    url: z.string().url().max(4096),
    name: z.string().max(255),
    type: z.string().max(128),
  })).max(10).default([]),
});

export const foundryAgentChat = createServerFn({ method: "POST" })
  .inputValidator((data: PublicChatInput) => publicChatSchema.parse(data))
  .handler(async ({ data }) => executePublicChat(data));
