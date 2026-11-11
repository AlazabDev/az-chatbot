// WhatsApp Cloud API sender: authenticates the signed-in user, sends via Graph API
// and records the outbound message. Token comes from whatsapp_account_secrets or env.
import { adminClient, GRAPH } from "../_shared/wa.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface SendBody {
  conversation_id?: string;
  content?: string;
  account_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!userToken) return json({ error: "غير مصرح" }, 401);

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(userToken);
  if (userError || !userData?.user) return json({ error: "جلسة غير صالحة" }, 401);
  const userId = userData.user.id;

  let body: SendBody;
  try {
    body = await req.json() as SendBody;
  } catch {
    return json({ error: "طلب غير صالح" }, 400);
  }
  if (!body.conversation_id || !body.content?.trim()) {
    return json({ error: "conversation_id ونص الرسالة مطلوبان" }, 400);
  }

  // Conversation must belong to the caller.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, user_id, contact_id, account_id")
    .eq("id", body.conversation_id)
    .maybeSingle();
  if (!conv || conv.user_id !== userId) return json({ error: "المحادثة غير موجودة" }, 404);

  const accountId = body.account_id ?? conv.account_id;

  // Resolve the sending number and token.
  let phoneNumberId: string | null = null;
  let token: string | null = null;
  if (accountId) {
    const { data: account } = await admin
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    phoneNumberId = account?.phone_number_id ?? null;
    if (phoneNumberId) {
      const { data: secret } = await admin
        .from("whatsapp_account_secrets")
        .select("access_token")
        .eq("account_id", accountId)
        .maybeSingle();
      token = secret?.access_token ?? null;
    }
  }
  phoneNumberId = phoneNumberId ?? Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? null;
  token = token ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? null;

  if (!phoneNumberId || !token) {
    return json({ error: "لم يتم إعداد رقم واتساب مفعّل للإرسال" }, 400);
  }

  const { data: contact } = await admin.from("contacts").select("phone").eq("id", conv.contact_id).maybeSingle();
  if (!contact?.phone) return json({ error: "جهة الاتصال غير موجودة" }, 404);

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: contact.phone,
      type: "text",
      text: { body: body.content.trim() },
    }),
  });

  const payload = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok) {
    console.error("send failed", res.status, payload);
    return json({ error: payload?.error?.message ?? "فشل الإرسال إلى واتساب" }, 502);
  }

  const waMessageId = payload.messages?.[0]?.id ?? null;
  const { data: inserted, error: insertError } = await admin
    .from("messages")
    .insert({
      user_id: userId,
      conversation_id: conv.id,
      account_id: accountId,
      direction: "outbound",
      content: body.content.trim(),
      status: "sent",
      wa_message_id: waMessageId,
    })
    .select("*")
    .single();
  if (insertError) console.error("record outbound failed", insertError);

  await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  return json({ sent: true, wa_message_id: waMessageId, message: inserted });
});
