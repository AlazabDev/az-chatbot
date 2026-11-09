import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn, ShieldAlert, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AuthSearch = { reason?: "signin" | "forbidden" | "error" };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const reason = search.reason;
    return reason === "forbidden" || reason === "error" || reason === "signin" ? { reason } : {};
  },
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — عزبوت" },
      { name: "description", content: "تسجيل الدخول للوصول إلى لوحة تحكم عزبوت." },
      { property: "og:title", content: "تسجيل الدخول — عزبوت" },
      { property: "og:description", content: "تسجيل الدخول للوصول إلى لوحة تحكم عزبوت." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { reason } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === "error" ? "تعذر التحقق من الصلاحيات حاليًا. حاول مرة أخرى." : null,
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setSignedInEmail(data.user?.email ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setNotice(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      if (import.meta.env.DEV) console.error("[auth] signIn failed", signInError);
      setError(
        signInError.message.toLowerCase().includes("confirm")
          ? "لم يتم تأكيد البريد الإلكتروني بعد."
          : "بيانات الدخول غير صحيحة.",
      );
      return;
    }
    navigate({ to: "/admin", replace: true });
  };

  const sendReset = async () => {
    const target = (email || signedInEmail || "").trim();
    if (!target) {
      setError("اكتب بريدك الإلكتروني أولاً لإرسال رابط إعادة التعيين.");
      return;
    }
    setError(null);
    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setResetting(false);
    setNotice(
      resetError ? null : `تم إرسال رابط إعادة تعيين كلمة المرور إلى ${target}. تحقق من بريدك.`,
    );
    if (resetError) setError("تعذر إرسال رابط إعادة التعيين حاليًا.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSignedInEmail(null);
    setError(null);
  };

  return (
    <div dir="rtl" className="flex min-h-dvh items-center justify-center bg-[#f4f5fb] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-[#030957]">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted-foreground">للوصول إلى لوحة تحكم البوت.</p>

        <label className="mt-5 block text-xs font-semibold text-[#030957]">
          البريد الإلكتروني
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-[#ffb900]"
            dir="ltr"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold text-[#030957]">
          كلمة المرور
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-[#ffb900]"
            dir="ltr"
          />
        </label>

        {reason === "forbidden" && (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              الحساب {signedInEmail ? <span dir="ltr">{signedInEmail}</span> : "الحالي"} ليس لديه
              صلاحية مدير. سجّل الخروج ثم ادخل بحساب مدير، أو اطلب من مدير النظام منحك الصلاحية.
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        {notice && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
            <MailCheck className="h-3.5 w-3.5" />
            {notice}
          </p>
        )}

        {signedInEmail && (
          <p className="mt-3 text-xs text-muted-foreground">
            أنت مسجّل حاليًا بحساب <span dir="ltr">{signedInEmail}</span>{" "}
            <button
              type="button"
              onClick={signOut}
              className="font-semibold text-[#030957] underline"
            >
              تسجيل الخروج
            </button>
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#030957] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          دخول
        </button>

        <button
          type="button"
          onClick={sendReset}
          disabled={resetting}
          className="mt-3 w-full text-center text-xs text-muted-foreground underline transition hover:text-[#030957] disabled:opacity-60"
        >
          {resetting ? "جارٍ الإرسال…" : "نسيت كلمة المرور؟"}
        </button>
      </form>
    </div>
  );
}
