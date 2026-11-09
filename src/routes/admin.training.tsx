import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Trash2,
  BookmarkPlus,
  AlertTriangle,
  RefreshCw,
  Pencil,
  X,
} from "lucide-react";
import {
  loadAzureConfig,
  loadTrainingExamples,
  saveTrainingExamples,
  type AzureOpenAIConfig,
  type TrainingExample,
} from "@/lib/adminConfig";
import { callAzureOpenAI } from "@/lib/azure.functions";

export const Route = createFileRoute("/admin/training")({
  component: TrainingPage,
});

interface TMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function TrainingPage() {
  const [cfg, setCfg] = useState<AzureOpenAIConfig | null>(null);
  const [msgs, setMsgs] = useState<TMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCfg(loadAzureConfig());
    setExamples(loadTrainingExamples());
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const persistExamples = (next: TrainingExample[]) => {
    setExamples(next);
    saveTrainingExamples(next);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!cfg || !input.trim() || loading) return;
    setError(null);

    const userMsg: TMsg = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput("");
    setLoading(true);

    try {
      const systemWithExamples = buildSystemPrompt(cfg.systemPrompt, examples);
      const res = await callAzureOpenAI({
        data: {
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          deployment: cfg.deployment,
          apiVersion: cfg.apiVersion,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          messages: [
            { role: "system", content: systemWithExamples },
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

  const handleRegenerate = async () => {
    const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const cutAt = msgs.length - 1 - lastUserIdx + 1;
    setMsgs(msgs.slice(0, cutAt));
    setInput("");
    // re-trigger by simulating: temporarily set input then send isn't trivial; just call API directly
    if (!cfg) return;
    setLoading(true);
    setError(null);
    try {
      const trimmed = msgs.slice(0, cutAt);
      const systemWithExamples = buildSystemPrompt(cfg.systemPrompt, examples);
      const res = await callAzureOpenAI({
        data: {
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          deployment: cfg.deployment,
          apiVersion: cfg.apiVersion,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          messages: [
            { role: "system", content: systemWithExamples },
            ...trimmed.map((m) => ({ role: m.role, content: m.content })),
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

  const handleSaveExample = (assistantMsg: TMsg) => {
    const lastUserBefore = [...msgs]
      .slice(
        0,
        msgs.findIndex((m) => m.id === assistantMsg.id),
      )
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserBefore) return;
    const example: TrainingExample = {
      id: crypto.randomUUID(),
      question: lastUserBefore.content,
      answer: assistantMsg.content,
      createdAt: Date.now(),
    };
    persistExamples([example, ...examples]);
  };

  const saveEdit = () => {
    if (!editing) return;
    const next = examples.map((ex) =>
      ex.id === editing.id ? { ...ex, answer: editing.text } : ex,
    );
    persistExamples(next);
    setEditing(null);
  };

  const ready = cfg && cfg.endpoint && cfg.apiKey && cfg.deployment;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr,320px]">
      <section className="flex h-[calc(100dvh-8rem)] flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold">صفحة تدريب البوت</h1>
            <p className="text-xs text-muted-foreground">
              {ready
                ? `النشر: ${cfg!.deployment} • temp ${cfg!.temperature}`
                : "أكمل الإعدادات أولاً من صفحة التكامل"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={!ready || loading || msgs.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[#030957] hover:border-[#ffb900] disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" /> إعادة توليد
            </button>
            <button
              type="button"
              onClick={() => setMsgs([])}
              disabled={msgs.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> مسح
            </button>
          </div>
        </header>

        {!ready && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            لم يتم إعداد Azure OpenAI بعد. اذهب إلى{" "}
            <a href="/admin/integration" className="underline font-semibold">
              إعدادات التكامل
            </a>{" "}
            لإدخال بيانات الاعتماد.
          </div>
        )}

        <div className="azab-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {msgs.length === 0 && (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <div>
                <div className="text-base font-semibold text-[#030957]">ابدأ بسؤال تجريبي</div>
                <p className="mt-1">جرّب البوت، ثم احفظ أفضل الردود كأمثلة تدريبية.</p>
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`group max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#030957] text-white"
                    : "border border-black/5 bg-[#f4f5fb] text-[#030957]"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => handleSaveExample(m)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#ffb900]/20 px-2 py-0.5 text-[11px] font-semibold text-[#030957] hover:bg-[#ffb900]/40"
                  >
                    <BookmarkPlus className="h-3 w-3" />
                    احفظ كمثال تدريبي
                  </button>
                )}
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
                handleSend();
              }
            }}
            rows={1}
            placeholder={ready ? "اكتب رسالتك..." : "أكمل الإعدادات أولاً"}
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

      <aside className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">أمثلة التدريب</h2>
          <span className="rounded-full bg-[#030957]/5 px-2 py-0.5 text-[11px] font-semibold text-[#030957]">
            {examples.length}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          تُحقن هذه الأمثلة ضمن الـ System Prompt لتوجيه ردود البوت.
        </p>
        <div className="azab-scroll max-h-[calc(100dvh-14rem)] space-y-2 overflow-y-auto pl-1">
          {examples.length === 0 && (
            <div className="rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-muted-foreground">
              لا توجد أمثلة بعد. احفظ ردود البوت الجيدة من المحادثة.
            </div>
          )}
          {examples.map((ex) => (
            <div key={ex.id} className="rounded-lg border border-black/5 bg-[#f4f5fb] p-3 text-xs">
              <div className="font-semibold text-[#030957]">س: {ex.question}</div>
              {editing?.id === ex.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editing.text}
                    onChange={(e) => setEditing({ id: ex.id, text: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-black/10 bg-white p-2 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="rounded-md bg-[#030957] px-2 py-1 text-[11px] font-semibold text-white"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-md border border-black/10 px-2 py-1 text-[11px]"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    ج: {ex.answer}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing({ id: ex.id, text: ex.answer })}
                      className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] hover:border-[#ffb900]"
                    >
                      <Pencil className="h-3 w-3" /> تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => persistExamples(examples.filter((e) => e.id !== ex.id))}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-600"
                    >
                      <X className="h-3 w-3" /> حذف
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function buildSystemPrompt(base: string, examples: TrainingExample[]): string {
  if (examples.length === 0) return base;
  const lines = examples
    .slice(0, 20)
    .map((ex, i) => `مثال ${i + 1}:\nسؤال: ${ex.question}\nجواب: ${ex.answer}`)
    .join("\n\n");
  return `${base}\n\nأمثلة مرجعية يجب أن تستلهم منها أسلوب الإجابة:\n\n${lines}`;
}
