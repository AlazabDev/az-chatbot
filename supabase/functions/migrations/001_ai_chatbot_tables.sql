-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: WhatsApp AI Platform — الجداول الجديدة
-- ══════════════════════════════════════════════════════════════════════════════
-- شغّل هذا الملف في Supabase → SQL Editor
-- ملاحظة: يفترض وجود الجداول الأساسية (tenants, wa_numbers, contacts, messages...)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. chatbot_rules — قواعد الشات بوت ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_number_id     uuid REFERENCES public.wa_numbers(id) ON DELETE CASCADE,
  -- NULL = ينطبق على كل الأرقام

  -- trigger
  trigger_type     text NOT NULL CHECK (trigger_type IN ('keyword','regex','any','first_message')),
  trigger_value    text,
  -- keywords: فاصلة بين الكلمات مثل "مرحبا,هلا,السلام"
  -- regex: نمط التعبير العادي
  -- any/first_message: لا قيمة مطلوبة

  -- response
  response_type    text NOT NULL CHECK (response_type IN ('text','template','human_takeover','ai_reply')),
  response_text    text,
  template_name    text,
  template_language text DEFAULT 'ar',
  template_params  jsonb DEFAULT '{}',
  -- {"1": "قيمة أول متغير", "2": "قيمة ثاني متغير"}

  priority         integer NOT NULL DEFAULT 0,
  -- كلما ارتفع الرقم ارتفعت الأولوية

  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_rules_tenant_idx ON public.chatbot_rules (tenant_id, is_active, priority DESC);
CREATE INDEX IF NOT EXISTS chatbot_rules_number_idx ON public.chatbot_rules (wa_number_id);

-- RLS
ALTER TABLE public.chatbot_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.chatbot_rules
  USING (tenant_id = (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid() LIMIT 1
  ));

-- ─── 2. تحديث messages — إضافة أعمدة جديدة ──────────────────────────────────
-- إضافة آمنة (لا تؤثر على الأعمدة الموجودة)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_wa_id     text,
  ADD COLUMN IF NOT EXISTS media_mime      text,
  ADD COLUMN IF NOT EXISTS media_filename  text,
  ADD COLUMN IF NOT EXISTS interactive_payload jsonb,
  ADD COLUMN IF NOT EXISTS error_payload   jsonb,
  ADD COLUMN IF NOT EXISTS raw_payload     jsonb;

-- ─── 3. تحديث conversations — إضافة حالة الشات بوت ──────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS chatbot_state text CHECK (chatbot_state IN ('active','human_takeover','paused')) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS conv_last_message_idx ON public.conversations (last_message_at DESC);

-- ─── 4. broadcasts — سجلات الحملات ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_number_id     uuid NOT NULL REFERENCES public.wa_numbers(id),
  phone_number_id  text NOT NULL,

  name             text,
  template_name    text NOT NULL,
  template_language text NOT NULL DEFAULT 'ar',
  template_params  jsonb DEFAULT '{}',

  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','paused')),

  total_count      integer NOT NULL DEFAULT 0,
  sent_count       integer NOT NULL DEFAULT 0,
  delivered_count  integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,

  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS broadcasts_tenant_idx ON public.broadcasts (tenant_id, created_at DESC);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.broadcasts
  USING (tenant_id = (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid() LIMIT 1
  ));

-- ─── 5. broadcast_messages — تفاصيل كل رسالة في الحملة ──────────────────────
CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id         uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id           uuid REFERENCES public.contacts(id),
  phone_e164           text NOT NULL,

  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','read','failed')),

  provider_message_id  text,
  error_message        text,

  sent_at              timestamptz,
  delivered_at         timestamptz,
  read_at              timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bcast_msg_broadcast_idx ON public.broadcast_messages (broadcast_id, status);
CREATE INDEX IF NOT EXISTS bcast_msg_contact_idx   ON public.broadcast_messages (contact_id);

-- RLS يرث من broadcast عبر broadcast_id
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.broadcast_messages
  USING (tenant_id = (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid() LIMIT 1
  ));

-- ─── 6. ai_extractions — نتائج تحليل الصور بالذكاء الاصطناعي ────────────────
-- (يُحتمل أن يكون موجوداً — نضيف الأعمدة الناقصة فقط)
CREATE TABLE IF NOT EXISTS public.ai_extractions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id       uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  media_file_id    uuid,

  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),

  model_used       text,
  summary          text,
  extracted_fields jsonb NOT NULL DEFAULT '{}',
  entities         jsonb NOT NULL DEFAULT '[]',
  raw_text         text,
  confidence       numeric(3,2),
  error_message    text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);

-- إضافة أعمدة إضافية إذا كان الجدول موجوداً
ALTER TABLE public.ai_extractions
  ADD COLUMN IF NOT EXISTS entities jsonb NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS ai_ext_message_idx ON public.ai_extractions (message_id);
CREATE INDEX IF NOT EXISTS ai_ext_tenant_idx  ON public.ai_extractions (tenant_id, created_at DESC);

ALTER TABLE public.ai_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.ai_extractions
  USING (tenant_id = (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid() LIMIT 1
  ));

-- ─── 7. إضافة عمود ai_tags لـ media_files ────────────────────────────────────
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS ai_tags    text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wa_media_id text;

CREATE INDEX IF NOT EXISTS media_wa_id_idx ON public.media_files (wa_media_id);

-- ─── 8. Updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_chatbot_rules_updated_at ON public.chatbot_rules;
CREATE TRIGGER set_chatbot_rules_updated_at
  BEFORE UPDATE ON public.chatbot_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 9. بيانات تجريبية — قواعد شات بوت افتراضية ─────────────────────────────
-- سيتم إدراجها بعد معرفة tenant_id من خلال الـ frontend
-- مثال (عدّل tenant_id):
/*
INSERT INTO public.chatbot_rules (tenant_id, trigger_type, trigger_value, response_type, response_text, priority)
VALUES
  -- رسالة ترحيب تلقائية
  ('<YOUR_TENANT_ID>', 'first_message', NULL, 'text',
   'مرحباً بك! 👋 أنا المساعد الذكي لخدماتنا. كيف يمكنني مساعدتك اليوم؟
   
يمكنني مساعدتك في:
📋 حجز موعد صيانة
📍 تتبع طلبك
💬 الإجابة على استفساراتك
   
اكتب طلبك وسأرد عليك فوراً!', 10),

  -- تحويل للإنسان
  ('<YOUR_TENANT_ID>', 'keyword', 'مدير,شكوى,مشكلة,تحدث مع', 'human_takeover',
   'سأقوم بتحويلك لأحد زملائي لمساعدتك بشكل أفضل. ستصلك رسالة قريباً.', 5),

  -- رد ذكي بالذكاء الاصطناعي للبقية
  ('<YOUR_TENANT_ID>', 'any', NULL, 'ai_reply', NULL, 0);
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- Environment Variables needed in Supabase Edge Functions:
-- ══════════════════════════════════════════════════════════════════════════════
-- META_TOKEN              = EAAMo2xRQsWk...
-- WHATSAPP_VERIFY_TOKEN   = (اختر كلمة سرية)
-- ANTHROPIC_API_KEY       = sk-ant-...
-- CHATBOT_ENABLED         = true
-- AI_VISION_ENABLED       = true
-- CHATBOT_AI_MODEL        = claude-haiku-4-5-20251001
-- CHATBOT_MAX_TOKENS      = 500
-- ══════════════════════════════════════════════════════════════════════════════
