import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronDown, ClipboardPlus, NotebookPen, Search, TriangleAlert } from "lucide-react";
import { ChatWindow } from "@/components/chatbot/ChatWindow";
import { useChatSession } from "@/components/chatbot/useChatSession";

const TITLE = "مركز المساعدة — عزبوت";
const DESCRIPTION = "أنشئ طلب صيانة، تابع حالة طلبك، أو اسأل مساعد عزبوت مباشرة.";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: HelpPage,
});

/** The portal is maintenance support, so it always talks to the maintenance agent. */
const PORTAL_AGENT_ID = "az-agent-maint";

const QUICK_ACTIONS = [
  {
    key: "create",
    label: "إنشاء طلب صيانة",
    hint: "نجمع بياناتك ونسجّل الطلب فوراً",
    text: "أريد إنشاء طلب صيانة",
    icon: ClipboardPlus,
  },
  {
    key: "status",
    label: "متابعة طلب قائم",
    hint: "اكتب رقم الطلب لنعرض حالته",
    text: "أريد الاستفسار عن حالة طلبي. رقم الطلب: ",
    icon: Search,
  },
  {
    key: "note",
    label: "إضافة ملاحظة أو إلغاء",
    hint: "على طلب سبق تسجيله",
    text: "أريد إضافة ملاحظة على طلبي. رقم الطلب: ",
    icon: NotebookPen,
  },
] as const;

const SUGGESTIONS = [
  "أريد إنشاء طلب صيانة",
  "ما حالة طلبي؟",
  "أريد إضافة ملاحظة على طلب",
  "كيف أرفق صورة للمشكلة؟",
] as const;

const REQUEST_FIELDS = [
  ["الاسم", "اسمك كما تحب أن نناديك"],
  ["رقم الجوال", "للتواصل معك بخصوص الطلب"],
  ["نوع الخدمة", "كهرباء، سباكة، تكييف…"],
  ["وصف المشكلة", "كلما كان أدق كان الحل أسرع"],
] as const;

const FAQ: ReadonlyArray<{ q: string; a: ReactNode }> = [
  {
    q: "كيف أنشئ طلب صيانة؟",
    a: "اضغط «إنشاء طلب صيانة» وأجب عن أسئلة المساعد: الاسم، رقم الجوال، نوع الخدمة ووصف المشكلة. بعد تسجيل الطلب ستحصل على رقم الطلب ورابط لمتابعته، احتفظ بهما.",
  },
  {
    q: "كيف أعرف حالة طلبي؟",
    a: "اكتب رقم الطلب في المحادثة وسيعرض لك المساعد حالته ومرحلته الحالية.",
  },
  {
    q: "هل أستطيع إضافة معلومة بعد إرسال الطلب؟",
    a: "نعم. اكتب رقم الطلب والملاحظة التي تريد إضافتها وسيُسجّلها المساعد على الطلب.",
  },
  {
    q: "كيف ألغي طلباً؟",
    a: "اكتب رقم الطلب مع سبب الإلغاء في المحادثة، وسيُنفَّذ الإلغاء على الطلب المحدد.",
  },
  {
    q: "هل يمكنني إرفاق صور أو ملفات؟",
    a: "نعم، من زر المرفقات في خانة الكتابة: صور (PNG وJPG وWEBP) وملفات PDF وWord وExcel وCSV ونصوص، بحد أقصى 20 ميجابايت للملف.",
  },
  {
    q: "هل يمكنني التحدث بدل الكتابة؟",
    a: "نعم، يمكنك الإملاء بالميكروفون في خانة الكتابة، أو بدء مكالمة صوتية من أعلى نافذة المحادثة عندما تكون الخدمة متاحة على جهازك.",
  },
];

function HelpPage() {
  const session = useChatSession({ applyTheme: false, ensureSession: true });
  const [prefill, setPrefill] = useState<{ id: number; text: string }>({ id: 0, text: "" });

  const startWith = (text: string) => {
    setPrefill((p) => ({ id: p.id + 1, text }));
    document.getElementById("chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      dir="rtl"
      lang="ar"
      className="flex min-h-dvh flex-col bg-azab-soft text-azab-navy"
      style={{ fontFamily: '"IBM Plex Sans Arabic", system-ui, "Segoe UI", Tahoma, sans-serif' }}
    >
      <header className="border-b border-azab-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold tracking-tight">عزبوت</span>
            <span className="text-sm text-azab-navy/70">مركز المساعدة</span>
          </div>
          <a
            href="#faq"
            className="rounded-md px-2 py-1 text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber lg:hidden"
          >
            الأسئلة الشائعة
          </a>
        </div>
        <div aria-hidden className="h-1 bg-azab-amber" />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="order-2 space-y-6 lg:order-1">
          <section aria-labelledby="how">
            <h1 id="how" className="text-2xl font-bold leading-snug">
              كيف نساعدك اليوم؟
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-azab-navy/70">
              اختر ما تريد، أو اكتب سؤالك مباشرة في المحادثة.
            </p>
            <ul className="mt-4 space-y-2">
              {QUICK_ACTIONS.map(({ key, label, hint, text, icon: Icon }) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => startWith(text)}
                    className="flex w-full items-center gap-3 rounded-xl border border-azab-line bg-white p-3 text-start transition hover:border-azab-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-azab-navy text-azab-on-navy">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-xs text-azab-navy/70">{hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="slip"
            className="rounded-xl border border-azab-line bg-white p-4"
          >
            <h2 id="slip" className="font-semibold">
              ما نحتاجه لتسجيل طلب
            </h2>
            <dl className="mt-3 divide-y divide-dashed divide-azab-line">
              {REQUEST_FIELDS.map(([label, hint]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-sm font-semibold">{label}</dt>
                  <dd className="text-xs text-azab-navy/70">{hint}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-4">
            <h2 id="faq-title" className="font-semibold">
              الأسئلة الشائعة
            </h2>
            <div className="mt-3 divide-y divide-azab-line overflow-hidden rounded-xl border border-azab-line bg-white">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azab-amber [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown
                      className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-azab-navy/80">{a}</p>
                </details>
              ))}
            </div>
          </section>
        </aside>

        <section
          id="chat"
          aria-label="محادثة مع المساعد"
          className="order-1 h-[80dvh] min-h-[30rem] scroll-mt-4 overflow-hidden rounded-2xl border border-azab-line bg-white shadow-[var(--azab-shadow)] lg:sticky lg:top-6 lg:order-2 lg:h-[calc(100dvh-7.5rem)]"
        >
          {!session.hydrated || session.sessionState === "pending" ? (
            <div
              role="status"
              className="flex h-full items-center justify-center text-sm text-azab-navy/70"
            >
              جارٍ تجهيز المحادثة…
            </div>
          ) : session.sessionState === "unavailable" ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
            >
              <TriangleAlert className="h-8 w-8 text-azab-amber" aria-hidden />
              <p className="font-semibold">المحادثة غير متاحة حالياً</p>
              <p className="max-w-sm text-sm text-azab-navy/70">
                تعذّر فتح جلسة المحادثة. حدّث الصفحة وحاول مرة أخرى بعد قليل.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-azab-navy px-4 py-2 text-sm text-azab-on-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
              >
                تحديث الصفحة
              </button>
            </div>
          ) : (
            <ChatWindow
              open
              variant="page"
              messages={session.messages}
              setMessages={session.setMessages}
              conversationId={session.conversationId}
              setConversationId={session.setConversationId}
              settings={session.settings}
              setSettings={session.setSettings}
              callRequest={0}
              selectedAgentId={PORTAL_AGENT_ID}
              prefill={prefill}
              suggestions={SUGGESTIONS}
            />
          )}
        </section>
      </main>
    </div>
  );
}
