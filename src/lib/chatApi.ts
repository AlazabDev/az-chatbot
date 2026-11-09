import type { ChatApiRequestMeta, ChatApiResponse, ChatFile } from "@/types/chat";
import { supabase } from "@/integrations/supabase/client";
import { getChatUploadSignedUrl } from "@/lib/chatUploads.functions";
import { dispatchMessageToAgent } from "@/lib/agents/dispatcher.functions";

const BUCKET = "chatbot-uploads";

export interface SendMessageArgs {
  message: string;
  conversationId: string;
  files: File[];
  metadata: ChatApiRequestMeta;
  signal?: AbortSignal;
  agentId?: string;
}

interface UploadedAttachment {
  url: string;
  path: string;
  name: string;
  type: string;
  size: number;
}

async function uploadFile(file: File, scope: string, userId: string): Promise<UploadedAttachment> {
  const safe = file.name.replace(/[^\w.\-()\s]/g, "_");
  const path = `${userId}/${scope}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`فشل رفع ${file.name}`);

  // Signed URLs are minted server-side; the bucket has no public SELECT.
  const signed = await getChatUploadSignedUrl({ data: { path } });

  return {
    url: signed.url,
    path,
    name: file.name,
    type: file.type,
    size: file.size,
  };
}

/**
 * Sends a chat message + files through the Supabase Edge Function.
 * The Foundry credentials and thread-signing secret remain server-side.
 */
export async function sendChatMessage({
  message,
  conversationId,
  files,
  agentId,
}: SendMessageArgs): Promise<ChatApiResponse> {
  const attachments: UploadedAttachment[] = [];
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("يجب أن تكون الجلسة صالحة لإرسال الملفات.");
  }

  const scope = crypto.randomUUID();

  for (const file of files) {
    attachments.push(await uploadFile(file, scope, authData.user.id));
  }

  const threadId = conversationId && conversationId.includes(".") ? conversationId : null;

  if (agentId) {
    const attachmentLines = attachments.map(
      (attachment) => `- ${attachment.name}: ${attachment.url}`,
    );
    const routedMessage = attachmentLines.length
      ? `${message}\n\nالمرفقات:\n${attachmentLines.join("\n")}`
      : message;

    const routed = await dispatchMessageToAgent({
      data: {
        message: routedMessage,
        currentAgentId: agentId,
        forceAgentId: agentId,
        history: [],
      },
    });

    return {
      reply: routed.reply,
      conversationId,
      sources: [],
      actions: [],
    };
  }

  const { data, error } = await supabase.functions.invoke("chatbot", {
    body: {
      threadId,
      message,
      attachments: attachments.map((attachment) => ({
        url: attachment.url,
        name: attachment.name,
        type: attachment.type,
      })),
    },
  });

  if (error) {
    console.error("[chatApi] chatbot edge function error:", error);
    throw new Error("تعذر معالجة الطلب حالياً، يرجى المحاولة لاحقاً.");
  }

  if (!data || typeof data.reply !== "string") {
    throw new Error("تعذر معالجة الطلب حالياً، يرجى المحاولة لاحقاً.");
  }

  return {
    reply: data.reply || "…",
    conversationId: typeof data.threadId === "string" ? data.threadId : conversationId,
    sources: [],
    actions: [],
  };
}

export function fileToChatFile(file: File): Promise<ChatFile> {
  return new Promise((resolve) => {
    const base: ChatFile = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
    };
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, dataUrl: reader.result as string });
      reader.onerror = () => resolve(base);
      reader.readAsDataURL(file);
    } else {
      resolve(base);
    }
  });
}
