import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [conversations, messages, recentMessages, kbDocs, takeover, latest] = await Promise.all([
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin.from("kb_documents").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("human_takeover", true),
      supabaseAdmin
        .from("conversations")
        .select("id, session_id, visitor_name, message_count, status, last_message_at")
        .order("last_message_at", { ascending: false })
        .limit(8),
    ]);

    return {
      conversations: conversations.count ?? 0,
      messages: messages.count ?? 0,
      messagesLast7Days: recentMessages.count ?? 0,
      knowledgeDocuments: kbDocs.count ?? 0,
      humanTakeover: takeover.count ?? 0,
      recentConversations: latest.data ?? [],
    };
  });
