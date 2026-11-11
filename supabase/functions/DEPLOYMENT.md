# 🚀 دليل النشر للإنتاج — SouqChat WhatsApp Platform

## نظرة عامة على البنية

```
Frontend (React/Vite)  →  Supabase Edge Functions (Deno)  →  Meta WhatsApp Cloud API
                       ↕
                   PostgreSQL + Realtime + Storage
```

---

## الخطوة 1 — إعداد Supabase

1. أنشئ مشروعاً جديداً على [supabase.com](https://supabase.com)
2. احفظ **Project URL** و **Anon Key** من `Settings → API`
3. انسخ `.env.production.example` إلى `.env` وأكمل القيم

---

## الخطوة 2 — تشغيل Migrations

```bash
# تثبيت Supabase CLI
npm install -g supabase

supabase login
supabase link --project-ref YOUR_PROJECT_REF

# تشغيل جميع الـ migrations بالترتيب الصحيح
supabase db push
```

أو يدوياً في **Supabase Dashboard → SQL Editor** بترتيب أسماء الملفات.

### ترتيب الـ Migrations:

```
20260215095607_*.sql   ← الجداول الأساسية
20260215095634_*.sql
20260215102428_*.sql
20260221102107_*.sql
20260305182231_*.sql
20260310073005_*.sql
20260313030007_*.sql
20260314180924_*.sql
20260315100000_production_fix.sql
20260324070000_phase2_chatbot.sql
20260324093000_phase3_ai_vision.sql
20260324094500_meta_accounts_alignment.sql
20260324095000_add_ai_cache.sql
20260324095700_add_ai_fields.sql
```

---

## الخطوة 3 — إعداد Secrets في Supabase Edge Functions

اذهب إلى **Supabase → Settings → Edge Functions → Secrets** وأضف:

| المتغير                   | الوصف                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `META_TOKEN`              | Access Token من Meta Business Manager                               |
| `WA_ACCESS_TOKEN`         | نفس قيمة META_TOKEN                                                 |
| `META_APP_SECRET`         | App Secret من Meta → App Settings → Basic                           |
| `WA_APP_SECRET`           | نفس قيمة META_APP_SECRET                                            |
| `WHATSAPP_VERIFY_TOKEN`   | رمز سري تختاره أنت (نص عشوائي قوي)                                  |
| `WA_WEBHOOK_VERIFY_TOKEN` | نفس قيمة WHATSAPP_VERIFY_TOKEN                                      |
| `ANTHROPIC_API_KEY`       | مفتاح API من [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY`          | مفتاح API من OpenAI (إن استُخدم)                                    |
| `GEMINI_API_KEY`          | مفتاح API من Google AI Studio (إن استُخدم)                          |
| `CHATBOT_ENABLED`         | `true` أو `false`                                                   |
| `AI_VISION_ENABLED`       | `true` أو `false`                                                   |
| `CLOUDINARY_URL`          | رابط Cloudinary بالصيغة cloudinary://key:secret@cloud               |
| `SEAFILE_API_TOKEN`       | Token من Seafile (إن استُخدم)                                       |
| `SEAFILE_URL`             | رابط خادم Seafile                                                   |
| `SEAFILE_REPO_ID`         | معرّف المستودع في Seafile                                           |

> ⚠️ **لا تضع هذه القيم في الكود أو تشاركها في Git أبداً**

---

## الخطوة 4 — نشر Edge Functions (مراجعة أمنية لازمة)

**لا تستخدم أمر النشر الجماعي القديم.** كان يطبّق `--no-verify-jwt` على جميع الدوال، بما فيها دوال إدارية لا تستقبل Meta Webhooks. تعطيل JWT على Gateway لا يُسمح به إلا عندما توجد آلية تحقق أخرى داخل الدالة نفسها.

### دوال استقبال Meta العامة

انشر **فقط المستقبل الذي يشير إليه Meta Callback URL الفعلي**، بعد ضبط `WA_APP_SECRET` أو `META_APP_SECRET` و`WA_WEBHOOK_VERIFY_TOKEN` أو `WHATSAPP_VERIFY_TOKEN` واختبار التوقيع. الدوال القديمة `whatsapp_webhook` و`wa_webhook_inbound` تتضمن الآن تحقق HMAC إلزاميًا، لكن لا ينبغي تشغيل أكثر من مستقبل لنفس الحدث دون آلية Deduplication مركزية.

```bash
# مثال فقط بعد التحقق من مشروع Supabase المرتبط والـ Callback URL الفعلي:
supabase functions deploy whatsapp_webhook --no-verify-jwt
```

### الدوال الإدارية والداخلية

الدوال `api_keys_manage` و`webhooks_manage` و`provision_tenant` وعمليات الإرسال والوسائط والـ Workers **ليست معتمدة للنشر الجماعي**. راجع JWT والصلاحيات لكل دالة على حدة قبل نشرها. توجد حاليًا فجوة عقد بيانات بين `api_keys_manage` ومخطط `026_api_keys.sql`: الأول يستخدم `tenant_id` والثاني `account_id`؛ لا تنشر الدالة قبل حسم نموذج قاعدة البيانات وربطها بالخدمة الصحيحة.

للتحقق من قائمة الدوال المنشورة دون تعديل:

```bash
supabase functions list
```

انظر `docs/security/PHASE2_SECURITY.md` وخطة استعلامات SQL للقراءة فقط قبل أي ترحيل أو نشر.

---

## الخطوة 5 — إعداد Webhook في Meta

1. اذهب إلى **Meta for Developers → WhatsApp → Configuration**
2. في **Callback URL**:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp_webhook
   ```
3. في **Verify Token**: ضع نفس قيمة `WHATSAPP_VERIFY_TOKEN`
4. فعّل هذه **Webhook Fields**:
   - ✅ `messages`
   - ✅ `message_deliveries`
   - ✅ `message_reads`

### اختبار التحقق:

```bash
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp_webhook\
?hub.mode=subscribe\
&hub.verify_token=YOUR_VERIFY_TOKEN\
&hub.challenge=test_challenge_123"
# يجب أن يرد: test_challenge_123
```

---

## الخطوة 6 — بناء ونشر الـ Frontend

```bash
# تثبيت الحزم
npm install

# بناء للإنتاج
npm run build

# المجلد dist/ جاهز للرفع على:
# Vercel:
vercel --prod

# Netlify:
netlify deploy --prod --dir dist

# Cloudflare Pages:
wrangler pages deploy dist
```

---

## قائمة التحقق قبل الإطلاق ✅

### الأمان

- [ ] `.env` غير موجود في Git
- [ ] `META_APP_SECRET` مُعيَّن (لتفعيل HMAC-SHA256)
- [ ] `WHATSAPP_VERIFY_TOKEN` قوي وعشوائي (20+ حرف)
- [ ] Row Level Security (RLS) مُفعَّل على جميع الجداول

### قاعدة البيانات

- [ ] جميع الـ 14 migration شُغِّلت بالترتيب الصحيح
- [ ] لا توجد أخطاء في SQL Editor بعد التشغيل

### Edge Functions

- [ ] جميع الـ 20 دالة منشورة
- [ ] جميع الـ Secrets مُعيَّنة في Supabase Dashboard

### الاتصال

- [ ] اختبار GET verification للـ Webhook نجح
- [ ] اختبار استقبال رسالة نجح
- [ ] Meta Webhook Fields مُفعَّلة (messages, deliveries, reads)

---

## مراقبة الإنتاج

- **Supabase → Edge Functions → Logs**: مراقبة الأخطاء في الوقت الفعلي
- **Meta Business Manager → Webhooks**: نسبة النجاح يجب أن تكون > 99%
- **Supabase → Database → Table Editor**: مراقبة بيانات الرسائل
