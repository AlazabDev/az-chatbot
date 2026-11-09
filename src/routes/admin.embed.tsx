import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/embed")({
  head: () => ({
    meta: [
      { title: "كود التضمين — لوحة تحكم عزبوت" },
      {
        name: "description",
        content: "انسخ كود تضمين عزبوت وأضفه إلى أي موقع لعرض زر المحادثة العائم.",
      },
      { property: "og:title", content: "كود التضمين — لوحة تحكم عزبوت" },
      {
        property: "og:description",
        content: "انسخ كود تضمين عزبوت وأضفه إلى أي موقع لعرض زر المحادثة العائم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEmbed,
});

const FALLBACK_ORIGIN = "https://azabot.lovable.app";

function AdminEmbed() {
  const [origin, setOrigin] = useState(FALLBACK_ORIGIN);
  const [position, setPosition] = useState<"right" | "left">("right");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
      setOrigin(window.location.origin);
    }
  }, []);

  const scriptSnippet = useMemo(() => {
    const pos = position === "left" ? ' data-position="left"' : "";
    return `<script src="${origin}/embed.js"${pos} defer></script>`;
  }, [origin, position]);

  const iframeSnippet = useMemo(
    () =>
      `<iframe src="${origin}/embed" title="عزبوت — المساعد الذكي"
  allow="microphone; camera; clipboard-write; autoplay"
  style="position:fixed;bottom:0;${position === "left" ? "left" : "right"}:0;width:280px;height:170px;border:0;background:transparent;z-index:2147483000"></iframe>`,
    [origin, position],
  );

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">كود التضمين</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أضف السطر التالي قبل نهاية صفحة موقعك ليظهر زر المحادثة العائم فقط، دون التأثير على تصميم
          الموقع.
        </p>
      </div>

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">موضع الزر</h2>
          <div className="flex gap-2">
            {(["right", "left"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPosition(p)}
                className={
                  position === p
                    ? "rounded-full bg-[#030957] px-4 py-1.5 text-xs font-semibold text-white"
                    : "rounded-full border border-black/10 px-4 py-1.5 text-xs"
                }
              >
                {p === "right" ? "أسفل اليمين" : "أسفل اليسار"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <CodeCard
        title="الطريقة الموصى بها (سكربت)"
        desc="تعمل مع أي موقع: HTML، WordPress، Shopify، React، أو أي منصة تسمح بإضافة سكربت."
        code={scriptSnippet}
        copied={copied === "script"}
        onCopy={() => copy("script", scriptSnippet)}
      />

      <CodeCard
        title="بديل: إطار مباشر (iframe)"
        desc="استخدمه إذا كانت المنصة تمنع السكربتات الخارجية."
        code={iframeSnippet}
        copied={copied === "iframe"}
        onCopy={() => copy("iframe", iframeSnippet)}
      />

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold">تحقق من التضمين</h2>
        <ol className="mt-3 list-decimal space-y-2 pe-5 text-sm text-muted-foreground">
          <li>ألصق الكود في موقعك الخارجي وانشر الصفحة.</li>
          <li>افتح الصفحة، ويجب أن يظهر زر عزبوت في الزاوية المحددة فقط.</li>
          <li>اضغط الزر: تتسع نافذة المحادثة فوق الصفحة دون تغيير تخطيطها.</li>
          <li>أرسل رسالة تجريبية وتأكد من وصول الرد.</li>
        </ol>
        <a
          href={`${origin}/embed`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-[#030957]/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          معاينة الزر في صفحة مستقلة
        </a>
      </section>
    </div>
  );
}

function CodeCard({
  title,
  desc,
  code,
  copied,
  onCopy,
}: {
  title: string;
  desc: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        </div>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#030957] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#030957]/90"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "تم النسخ" : "نسخ الكود"}
        </button>
      </div>
      <pre
        dir="ltr"
        className="mt-3 overflow-x-auto rounded-xl bg-[#0b1020] p-4 text-left text-xs leading-relaxed text-[#e6e8f5]"
      >
        <code>{code}</code>
      </pre>
    </section>
  );
}
