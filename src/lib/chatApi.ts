import type { ChatApiRequestMeta, ChatApiResponse, ChatFile } from "@/types/chat";
import { supabase } from "@/integrations/supabase/client";
import { getChatUploadSignedUrl } from "@/lib/chatUploads.functions";
import { listPublicAgents } from "@/lib/agents/dispatcher.functions";
import { foundryAgentChat } from "@/lib/foundry-live.functions";
import { foundryChat } from "@/lib/foundry.functions";

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
 * Sends chat and files through authenticated Foundry server functions.
 * The Foundry credentials and thread-signing secret remain server-side.
 */
export async function sendChatMessage({
  message,
  conversationId,
  files,
  agentId,
}: SendMessageArgs): Promise<ChatApiResponse> {
  const attachments: UploadedAttachment[] = [];
  // Text-only guests never depend on Supabase authentication.
  if (files.length > 0) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error("رفع الملفات متاح حالياً للمستخدمين المسجلين فقط.");
    }
    const scope = crypto.randomUUID();
    for (const file of files) {
      attachments.push(await uploadFile(file, scope, authData.user.id));
    }
  }

  const threadId = conversationId && conversationId.includes(".") ? conversationId : null;

  // Preserve the existing authenticated upload endpoint for attachments.
  if (attachments.length > 0) {
    const data = await foundryChat({
      data: {
        threadId,
        message,
        agentId: agentId || null,
        attachments: attachments.map(({ url, name, type }) => ({ url, name, type })),
      },
    });
    return {
      reply: data.reply,
      conversationId: typeof data.threadId === "string" ? data.threadId : conversationId,
      sources: [],
      actions: [],
    };
  }

  // Only explicitly active database-backed Foundry agents are publicly callable.
  const agents = await listPublicAgents();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const chosen = agents.find((agent) => agent.id === agentId || agent.slug === agentId);
  const selected = chosen ?? (!agentId || agentId === "az-agent-azabot"
    ? (agents.find((agent) => agent.isDefault) ?? agents[0])
    : null);
  if (!selected || (agentId && uuidPattern.test(agentId) && selected.id !== agentId)) {
    throw new Error("الوكيل المطلوب غير متاح للزوار.");
  }

  const visitorKey = "azab.chat.visitorId";
  let visitorId: string;
  try {
    const saved = window.localStorage.getItem(visitorKey);
    visitorId = saved && uuidPattern.test(saved) ? saved : crypto.randomUUID();
    window.localStorage.setItem(visitorKey, visitorId);
  } catch {
    visitorId = crypto.randomUUID();
  }

  const result = await foundryAgentChat({
    data: { agentId: selected.id, visitorId, threadId, message, attachments: [] },
  });
  return {
    reply: result.reply,
    conversationId: result.threadId,
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
