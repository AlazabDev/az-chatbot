import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Trash2,
  Upload,
  FileText,
  Download,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Sparkles,
} from "lucide-react";
import {
  loadAzureConfig,
  loadTrainingExamples,
  type AzureOpenAIConfig,
  type TrainingExample,
} from "@/lib/adminConfig";
import { callAzureOpenAI } from "@/lib/azure.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/knowledge")({
  component: KnowledgePage,
});

const BUCKET = "kb-documents";

interface TMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface KBFile {
  name: string;
  path: string;
  size: number;
  updated_at: string;
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function KnowledgePage() {
  const [cfg, setCfg] = useState<AzureOpenAIConfig | null>(null);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [msgs, setMsgs] = useState<TMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<KBFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [useKB, setUseKB] = useState(true);
  const [kbContext, setKbContext] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCfg(loadAzureConfig());
    setExamples(loadTrainingExamples());
    void refreshFiles();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const refreshFiles = async () => {
    setFilesLoading(true);
    try {
      const { data, error: err } = await supabase.storage
        .from(BUCKET)
        .list("", { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
      if (err) throw err;
      const list: KBFile[] = (data || [])
        .filter((f) => f.name && !f.name.endsWith("/"))
        .map((f) => ({
          name: f.name,
          path: f.name,
          size: (f.metadata as { size?: number } | null)?.size ?? 0,
          updated_at: f.updated_at ?? f.created_at ?? "",
        }));
      setFiles(list);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleUpload = async (fList: FileList | null) => {
    if (!fList || fList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(fList)) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const key = `${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(key, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;

        // If it's a text-like file, extract preview content for KB context.
        if (file.type.startsWith("text/") || /\.(md|txt|json|csv|yaml|yml)$/i.test(file.name)) {
          try {
            const text = await file.text();
            setKbContext((prev) => `${prev}\n\n### ${file.name}\n${text.slice(0, 4000)}`.trim());
          } catch {
            /* ignore */
          }
        }
      }
      await refreshFiles();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`حذف الملف "${path}"؟`)) return;
    try {
      const { error: err } = await supabase.storage.from(BUCKET).remove([path]);
      if (err) throw err;
      await refreshFiles();
    } catch (err) {
      setUploadError((err as Error).message);
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const { data, error: err } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (err) throw err;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    } catch (err) {
      setUploadError((err as Error).message);
    }
  };

  const buildSystem = () => {
    if (!cfg) return "";
    let system = cfg.systemPrompt;
    if (examples.length > 0) {
      const ex = examples
        .slice(0, 20)
        .map((e, i) => `مثال ${i + 1}:\nسؤال: ${e.question}\nجواب: ${e.answer}`)
        .join("\n\n");
      system += `\n\nأمثلة مرجعية:\n\n${ex}`;
    }
    if (useKB && kbContext.trim()) {
      system += `\n\nقاعدة المعرفة (استند إليها في الإجابة):\n${kbContext.slice(0, 12000)}`;
    }
    if (useKB && files.length > 0) {
      system += `\n\nملفات متاحة في قاعدة المعرفة: ${files.map((f) => f.name).join("، ")}`;
    }
    return system;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!cfg || !input.trim() || loading) return;
    setError(null);
    const userMsg: TMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput("");
    setLoading(true);
    try {
      const res = await callAzureOpenAI({
        data: {
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          deployment: cfg.deployment,
          apiVersion: cfg.apiVersion,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          messages: [
            { role: "system", content: buildSystem() },
            ...next.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
      });
      setMsgs((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: res.reply || "(رد فارغ)" },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const ready = cfg && cfg.endpoint && cfg.apiKey && cfg.deployment;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr,360px]">
      {/* Chat panel */}
      <section className="flex h-[calc(100dvh-8rem)] flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg,#030957,#1a237e)" }}
            >
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold">قاعدة معرفة البوت</h1>
              <p className="text-xs text-muted-foreground">
                محادثة تدريبية مع البوت مدمجة بمخزن ملفات Supabase
              </p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#030957]">
            <input
              type="checkbox"
              checked={useKB}
              onChange={(e) => setUseKB(e.target.checked)}
              className="h-4 w-4 accent-[#030957]"
            />
            استخدام قاعدة المعرفة
          </label>
        </header>

        {!ready && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            أكمل إعدادات Azure OpenAI من صفحة إعدادات التكامل قبل بدء المحادثة.
          </div>
        )}

        <div className="azab-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {msgs.length === 0 && (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <div className="max-w-sm">
                <Sparkles className="mx-auto h-8 w-8 text-[#ffb900]" />
                <div className="mt-2 text-base font-semibold text-[#030957]">
                  درّب البوت على محتوى مؤسستك
                </div>
                <p className="mt-1">
                  ارفع مستنداتك في الجانب الأيسر، ثم اختبر ردود البوت هنا. الملفات النصية تُحقن
                  تلقائياً كسياق مرجعي.
                </p>
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#030957] text-white"
                    : "border border-black/5 bg-[#f4f5fb] text-[#030957]"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-[#f4f5fb] px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> يكتب...
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-black/5 p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder={ready ? "اسأل البوت مستنداً إلى ملفاتك..." : "أكمل الإعدادات أولاً"}
            disabled={!ready || loading}
            className="max-h-32 flex-1 resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-[#030957] outline-none focus:border-[#ffb900] focus:ring-2 focus:ring-[#ffb900]/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!ready || loading || !input.trim()}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#ffb900] px-4 text-sm font-semibold text-[#030957] hover:brightness-95 disabled:opacity-50"
            aria-label="إرسال"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>

      {/* KB files panel */}
      <aside className="flex h-[calc(100dvh-8rem)] flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">مخزن الملفات</h2>
          <button
            type="button"
            onClick={refreshFiles}
            disabled={filesLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-[#030957] hover:border-[#ffb900] disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${filesLoading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
          accept=".txt,.md,.json,.csv,.pdf,.docx,.doc,.xlsx,.pptx,.yaml,.yml,text/*"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mb-3 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#030957]/30 bg-[#f4f5fb] px-3 py-3 text-xs font-semibold text-[#030957] hover:border-[#ffb900] hover:bg-[#fff4cc]/40 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "جارٍ الرفع..." : "رفع ملفات إلى Supabase"}
        </button>

        {uploadError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
            {uploadError}
          </div>
        )}

        <div className="azab-scroll flex-1 space-y-2 overflow-y-auto pl-1">
          {files.length === 0 && !filesLoading && (
            <div className="rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-muted-foreground">
              لا توجد ملفات بعد. ارفع أول مستند لتدريب البوت.
            </div>
          )}
          {files.map((f) => (
            <div
              key={f.path}
              className="group flex items-center gap-2 rounded-lg border border-black/5 bg-[#f4f5fb] p-2.5 text-xs"
            >
              <FileText className="h-4 w-4 shrink-0 text-[#030957]" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-[#030957]" title={f.name}>
                  {f.name}
                </div>
                <div className="text-[10px] text-muted-foreground">{fmtSize(f.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(f.path)}
                className="rounded-md border border-black/10 bg-white p-1 text-[#030957] hover:border-[#ffb900]"
                aria-label="تنزيل"
              >
                <Download className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(f.path)}
                className="rounded-md border border-red-200 bg-red-50 p-1 text-red-600 hover:bg-red-100"
                aria-label="حذف"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-lg bg-[#030957]/5 p-2 text-[10px] leading-relaxed text-[#030957]">
          <strong>ملاحظة:</strong> يُحقن محتوى الملفات النصية تلقائياً كسياق مرجعي في الـ System
          Prompt عند تفعيل خيار «استخدام قاعدة المعرفة».
        </div>
      </aside>
    </div>
  );
}
