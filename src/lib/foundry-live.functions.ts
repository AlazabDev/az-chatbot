import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { executePublicChat, type PublicChatInput } from "@/lib/public-chat.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const publicChatSchema = z.object({
  agentId: z.string().regex(UUID),
  visitorId: z.string().uuid(),
  threadId: z.string().max(512).nullable().optional(),
  message: z.string().trim().max(8000),
  images: z.array(z.object({ dataUrl: z.string().max(1_400_100) })).max(2).optional(),
  documents: z.array(z.object({
    name: z.string().min(1).max(120),
    dataUrl: z.string().max(350_000),
  })).max(1).optional(),
  attachments: z.array(z.object({
    url: z.string().url().max(4096),
    name: z.string().max(255),
    type: z.string().max(128),
  })).max(10).default([]),
}).refine((d) => d.message.length > 0 || Boolean(d.images?.length) || Boolean(d.documents?.length), { message: "MESSAGE_OR_IMAGE_REQUIRED" });

export const foundryAgentChat = createServerFn({ method: "POST" })
  .inputValidator((data: PublicChatInput) => publicChatSchema.parse(data))
  .handler(async ({ data }) => executePublicChat(data));
