import { createServerFn } from "@tanstack/react-start";
import { publicChatSchema } from "@/lib/publicChatContract";
import { executePublicChat, type PublicChatInput } from "@/lib/public-chat.server";

export const foundryAgentChat = createServerFn({ method: "POST" })
  .inputValidator((data: PublicChatInput) => publicChatSchema.parse(data))
  .handler(async ({ data }) => executePublicChat(data));
