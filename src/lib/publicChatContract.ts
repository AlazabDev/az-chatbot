import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only accepted external contract for public REST and TanStack RPC. */
const baseSchema = z.object({
  agentId: z.string().regex(UUID),
  // Kept for old clients. The authoritative visitor identity is the signed cookie.
  visitorId: z.string().uuid().optional(),
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
});

const hasContent = (data: { message: string; images?: unknown[]; documents?: unknown[] }) =>
  data.message.length > 0 || Boolean(data.images?.length) || Boolean(data.documents?.length);

export const publicChatSchema = baseSchema.refine(hasContent, { message: "MESSAGE_OR_MEDIA_REQUIRED" });

export const publicRestChatSchema = baseSchema.omit({ agentId: true })
  .refine(hasContent, { message: "MESSAGE_OR_MEDIA_REQUIRED" });

export type PublicChatRequest = z.infer<typeof publicChatSchema>;

const codes = {
  FORBIDDEN_ORIGIN: { status: 403, code: "FORBIDDEN_ORIGIN" },
  AGENT_UNAVAILABLE: { status: 404, code: "AGENT_UNAVAILABLE" },
  ATTACHMENTS_REQUIRE_AUTH: { status: 403, code: "ATTACHMENTS_REQUIRE_AUTH" },
  TOO_MANY_IMAGES: { status: 400, code: "INVALID_MEDIA" },
  TOO_MANY_DOCUMENTS: { status: 400, code: "INVALID_MEDIA" },
  INVALID_IMAGE: { status: 400, code: "INVALID_MEDIA" },
  INVALID_GUEST_PDF: { status: 400, code: "INVALID_MEDIA" },
  INVALID_GUEST_DOCUMENT: { status: 400, code: "INVALID_MEDIA" },
  INVALID_MEDIA: { status: 400, code: "INVALID_MEDIA" },
  INVALID_AGENT: { status: 400, code: "INVALID_AGENT" },
  INVALID_REQUEST: { status: 400, code: "INVALID_REQUEST" },
  PAYLOAD_TOO_LARGE: { status: 413, code: "PAYLOAD_TOO_LARGE" },
  RATE_LIMITED: { status: 429, code: "RATE_LIMITED" },
  CHAT_DAILY_BUDGET_EXCEEDED: { status: 429, code: "BUDGET_EXHAUSTED" },
  CHAT_COST_NOT_CONFIGURED: { status: 503, code: "CHAT_UNAVAILABLE" },
  CHAT_BUDGET_UNAVAILABLE: { status: 503, code: "CHAT_UNAVAILABLE" },
  E_RATE_LIMIT: { status: 429, code: "RATE_LIMITED" },
} as const;

export function normalizePublicChatError(error: unknown): { status: number; code: string } {
  const text = error instanceof Error ? error.message : "";
  const mapped = codes[text as keyof typeof codes];
  if (mapped) return mapped;
  if (text.includes("تجاوز حد") || /rate.limit|too many requests/i.test(text)) {
    return { status: 429, code: "RATE_LIMITED" };
  }
  return { status: 503, code: "CHAT_UNAVAILABLE" };
}
