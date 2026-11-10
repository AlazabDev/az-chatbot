import { pageHead } from "@/lib/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Save, Wifi, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import {
  DEFAULT_AZURE_CONFIG,
  loadAzureConfig,
  saveAzureConfig,
  type AzureOpenAIConfig,
} from "@/lib/adminConfig";
import { testAzureConnection } from "@/lib/azure.functions";

export const Route = createFileRoute("/admin/integration")({
  head: () => pageHead("إعدادات Azure OpenAI", "إعدادات Azure OpenAI في منصة عزبوت للمحادثة وإدارة الوكلاء."),
  component: IntegrationPage,
});

type TestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

type FieldErrors = Partial<Record<keyof AzureOpenAIConfig, string>>;

function IntegrationPage() {
  const [cfg, setCfg] = useState<AzureOpenAIConfig>(DEFAULT_AZURE_CONFIG);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof AzureOpenAIConfig, boolean>>>({});

  useEffect(() => {
    setCfg(loadAzureConfig());
  }, []);

  const validate = (draft: AzureOpenAIConfig): FieldErrors => {
    const next: FieldErrors = {};

    // Endpoint
    const ep = draft.endpoint.trim();
    if (!ep) {
      next.endpoint = "مطلوب";
    } else if (!/^https?:\/\/.+/i.test(ep)) {
      next.endpoint = "يجب أن يبدأ بـ https:// أو http://";
    } else if (
      !/^https?:\/\/[^\s]+\.openai\.azure\.com\/?.*$/i.test(ep) &&
      !/^https?:\/\/[^\s]+$/i.test(ep)
    ) {
      // Allow any https endpoint but warn if not azure-like
      // We keep this loose since custom domains exist
    }

    // Deployment
    if (!draft.deployment.trim()) {
      next.deployment = "مطلوب";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(draft.deployment.trim())) {
      next.deployment = "يحتوي على رموز غير مسموح بها";
    }

    // API Version
    if (!draft.apiVersion.trim()) {
      next.apiVersion = "مطلوب";
    } else if (!/^\d{4}-\d{2}-\d{2}(-preview)?$/.test(draft.apiVersion.trim())) {
      next.apiVersion = "التنسيق المتوقع: YYYY-MM-DD أو YYYY-MM-DD-preview";
    }

    // System Prompt
    if (!draft.systemPrompt.trim()) {
      next.systemPrompt = "مطلوب";
    } else if (draft.systemPrompt.trim().length < 10) {
      next.systemPrompt = "يجب أن يكون 10 أحرف على الأقل";
    }

    return next;
  };

  const update = <K extends keyof AzureOpenAIConfig>(key: K, value: AzureOpenAIConfig[K]) => {
    setCfg((c) => {
      const next = { ...c, [key]: value };
      setErrors(validate(next));
      return next;
    });
    setTouched((t) => ({ ...t, [key]: true }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const allTouched: Partial<Record<keyof AzureOpenAIConfig, boolean>> = {
      endpoint: true,
      deployment: true,
      apiVersion: true,
      systemPrompt: true,
    };
    setTouched(allTouched);
    const nextErrors = validate(cfg);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    saveAzureConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    const allTouched: Partial<Record<keyof AzureOpenAIConfig, boolean>> = {
      endpoint: true,
      deployment: true,
      apiVersion: true,
      systemPrompt: true,
    };
    setTouched(allTouched);
    const nextErrors = validate(cfg);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setTest({ status: "error", message: "يرجى تصحيح الأخطاء أولاً" });
      return;
    }

    setTest({ status: "loading" });
    try {
      const res = await testAzureConnection({
        data: {
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          deployment: cfg.deployment,
          apiVersion: cfg.apiVersion,
        },
      });
      if (res.ok) setTest({ status: "ok", message: "تم الاتصال بنجاح ✓" });
      else setTest({ status: "error", message: `فشل: ${res.status} ${res.statusText}` });
    } catch (err) {
      setTest({ status: "error", message: (err as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">إعدادات الدمج مع Azure OpenAI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدخل بيانات الاعتماد الخاصة بمشروعك في Azure OpenAI Service. يتم حفظ الإعدادات محلياً في
          المتصفح ولا تُرسل إلا إلى نقطة الـ Endpoint التي حددتها.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
      >
        <label className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-[#f4f5fb] px-4 py-3">
          <div>
            <div className="text-sm font-semibold">تفعيل الدمج</div>
            <div className="text-xs text-muted-foreground">
              عند التفعيل سيتم استخدام Azure OpenAI لتوليد الردود.
            </div>
          </div>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
            className="h-5 w-5 accent-[#ffb900]"
          />
        </label>

        <Field
          label="Endpoint"
          hint="مثال: https://my-resource.openai.azure.com"
          error={touched.endpoint ? errors.endpoint : undefined}
        >
          <input
            type="url"
            required
            value={cfg.endpoint}
            onChange={(e) => update("endpoint", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, endpoint: true }))}
            placeholder="https://YOUR-RESOURCE.openai.azure.com"
            className={`azab-input ${touched.endpoint && errors.endpoint ? "border-red-400 focus:border-red-400 focus:shadow-red-200" : ""}`}
          />
        </Field>

        <Field label="API Key">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              required
              value={cfg.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="••••••••••••••••"
              className="azab-input pl-10"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-[#030957]"
              aria-label={showKey ? "إخفاء" : "عرض"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Deployment Name"
            hint="اسم النشر داخل Azure"
            error={touched.deployment ? errors.deployment : undefined}
          >
            <input
              type="text"
              required
              value={cfg.deployment}
              onChange={(e) => update("deployment", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, deployment: true }))}
              placeholder="gpt-4o-mini"
              className={`azab-input ${touched.deployment && errors.deployment ? "border-red-400 focus:border-red-400 focus:shadow-red-200" : ""}`}
            />
          </Field>
          <Field label="API Version" error={touched.apiVersion ? errors.apiVersion : undefined}>
            <input
              type="text"
              value={cfg.apiVersion}
              onChange={(e) => update("apiVersion", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, apiVersion: true }))}
              placeholder="2024-08-01-preview"
              className={`azab-input ${touched.apiVersion && errors.apiVersion ? "border-red-400 focus:border-red-400 focus:shadow-red-200" : ""}`}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={`Temperature (${cfg.temperature.toFixed(2)})`}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={cfg.temperature}
              onChange={(e) => update("temperature", Number(e.target.value))}
              className="w-full accent-[#ffb900]"
            />
          </Field>
          <Field label="Max Tokens">
            <input
              type="number"
              min={1}
              max={8000}
              value={cfg.maxTokens}
              onChange={(e) => update("maxTokens", Number(e.target.value))}
              className="azab-input"
            />
          </Field>
        </div>

        <Field
          label="System Prompt"
          hint="التعليمات الأساسية التي ستوجه سلوك البوت في كل محادثة."
          error={touched.systemPrompt ? errors.systemPrompt : undefined}
        >
          <textarea
            value={cfg.systemPrompt}
            onChange={(e) => update("systemPrompt", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, systemPrompt: true }))}
            rows={5}
            className={`azab-input resize-y ${touched.systemPrompt && errors.systemPrompt ? "border-red-400 focus:border-red-400 focus:shadow-red-200" : ""}`}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-[#030957] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#030957]/90"
          >
            <Save className="h-4 w-4" />
            حفظ الإعدادات
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={test.status === "loading"}
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#030957] transition hover:border-[#ffb900] disabled:opacity-50"
          >
            {test.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            اختبار الاتصال
          </button>

          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              تم الحفظ
            </span>
          )}
          {test.status === "ok" && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {test.message}
            </span>
          )}
          {test.status === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-red-600">
              <XCircle className="h-4 w-4" />
              {test.message}
            </span>
          )}
        </div>
      </form>

      <style>{`
        .azab-input {
          width: 100%;
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 0.5rem;
          background: white;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          color: #030957;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .azab-input:focus {
          border-color: #ffb900;
          box-shadow: 0 0 0 3px rgba(255,185,0,0.2);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-[#030957]">{label}</label>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
      {!error && hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
