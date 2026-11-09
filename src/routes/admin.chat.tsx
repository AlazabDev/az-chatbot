import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  Loader2,
  Trash2,
  Copy,
  Check,
  Download,
  RefreshCw,
  MessageSquarePlus,
  AlertTriangle,
  Timer,
  Bot,
  Paperclip,
  X,
  Volume2,
} from "lucide-react";
import { listAgents } from "@/lib/agents.functions";
import { sendChatMessage } from "@/lib/chatApi";
import { foundryChat } from "@/lib/foundry.functions";
import { toUserErrorMessage } from "@/lib/chatErrors";
import { speak } from "@/lib/voice";

export const Route = createFileRoute("/admin/chat")({
  component: AdminChatPage,
});

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  latencyMs?: number;
  agentName?: string;
  files?: string[];
  at: number;
}

function AdminChatPage() {
  const fetchAgents = useServerFn(listAgents);
  const chat = useServerFn(foundryChat);

  const agents = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => fetchAgents(),
  });

  const activeAgents = useMemo(() => (agents.data ?? []).filter((a) => a.is_active), [agents.data]);

  const [agentId, setAgentId] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!agentId && activeAgents.length > 0) {
      setAgentId(activeAgents.find((a) => a.is_default)?.id ?? activeAgents[0]!.id);
    }
  }, [activeAgents, agentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const send = async (text: string, attach: File[]) => {
    if (!text.trim() && attach.length === 0) return;
    setError(null);
    setLoading(true);
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      files: attach.map((f) => f.name),
      at: Date.now(),
    };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setFiles([]);

    try {
      const started = Date.now();
      if (attach.length > 0) {
        const res = await sendChatMessage({
          message: text,
          conversationId: threadId ?? "",
          files: attach,
          metadata: { language: "ar", source: "web-widget", voiceEnabled: false },
        });
        setThreadId(res.conversationId);
        setMsgs((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: res.reply,
            latencyMs: Date.now() - started,
            at: Date.now(),
          },
        ]);
      } else {
        const res = await chat({
          data: { threadId, message: text, agentId: agentId || null },
        });
        setThreadId(res.threadId);
        setMsgs((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: res.reply || "(رد فارغ)",
            latencyMs: res.latencyMs ?? Date.now() - started,
            agentName: res.agent?.name,
            at: Date.now(),
          },
        ]);
      }
    } catch (err) {
      setError(toUserErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const regenerate = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    void send(lastUser.content, []);
  };

  const newConversation = () => {
    setMsgs([]);
    setThreadId(null);
    setError(null);
    setInput("");
    setFiles([]);
  };

  const exportChat = () => {
    const body = msgs
      .map(
        (m) =>
          `${m.role === "user" ? "المستخدم" : "البوت"} • ${new Date(m.at).toLocaleString("ar-EG")}\n${m.content}`,
      )
      .join("\n\n---\n\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `azabot-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async (m: Msg) => {
    await navigator.clipboard.writeText(m.content);
    setCopied(m.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const avgLatency = useMemo(() => {
    const vals = msgs.map((m) => m.latencyMs).filter((v): v is number => !!v);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [msgs]);

  const currentAgent = activeAgents.find((a) => a.id === agentId);

  return (
    <div className="mx-auto max-w-4xl">
      <section className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">دردشة تشغيلية</h1>
            <p className="truncate text-xs text-muted-foreground">
              {currentAgent
                ? `${currentAgent.agent_name ?? currentAgent.deployment ?? "—"} • v${currentAgent.agent_version}`
                : "لا يوجد وكيل مفعّل — أضف وكيلاً من صفحة الوكلاء."}
              {avgLatency !== null && ` • متوسط الاستجابة ${avgLatency}ms`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-[#030957]" />
              <select
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  newConversation();
                }}
                aria-label="اختيار الوكيل"
                className="max-w-[180px] truncate rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs"
              >
                {activeAgents.length === 0 && <option value="">— لا يوجد —</option>}
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.is_default ? " (افتراضي)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <ToolBtn onClick={newConversation} icon={MessageSquarePlus} label="محادثة جديدة" />
            <ToolBtn
              onClick={regenerate}
              icon={RefreshCw}
              label="إعادة توليد"
              disabled={loading || msgs.length === 0}
            />
            <ToolBtn
              onClick={exportChat}
              icon={Download}
              label="تصدير"
              disabled={msgs.length === 0}
            />
            <ToolBtn
              onClick={() => setMsgs([])}
              icon={Trash2}
              label="مسح"
              disabled={msgs.length === 0}
              danger
            />
          </div>
        </header>

        <div className="azab-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {msgs.length === 0 && (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <div>
                <div className="text-base font-semibold text-[#030957]">اختبر الوكيل قبل النشر</div>
                <p className="mt-1">
                  أرسل رسالة أو مرفقاً، وقس زمن الاستجابة، وصدّر المحادثة عند الحاجة.
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
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#030957] text-white"
                    : "border border-black/5 bg-[#f4f5fb] text-[#030957]"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                {m.files && m.files.length > 0 && (
                  <div className="mt-2 text-[11px] opacity-80">📎 {m.files.join(" • ")}</div>
                )}
                {m.role === "assistant" && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => copy(m)}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 hover:text-[#030957]"
                    >
                      {copied === m.id ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      نسخ
                    </button>
                    <button
                      type="button"
                      onClick={() => speak(m.content, "ar")}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 hover:text-[#030957]"
                    >
                      <Volume2 className="h-3 w-3" /> استماع
                    </button>
                    {m.agentName && <span>{m.agentName}</span>}
                    {m.latencyMs && (
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-3 w-3" /> {m.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-[#f4f5fb] px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> يكتب…
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">{error}</div>
              <button type="button" onClick={regenerate} className="font-semibold underline">
                إعادة المحاولة
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-black/5 px-3 pt-2">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-[#f4f5fb] px-2 py-1 text-[11px]"
              >
                {f.name}
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  aria-label="إزالة الملف"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input.trim(), files);
          }}
          className="flex items-end gap-2 border-t border-black/5 p-3"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5));
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="إرفاق ملف"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 text-[#030957] hover:border-[#ffb900]"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input.trim(), files);
              }
            }}
            rows={1}
            placeholder={activeAgents.length ? "اكتب رسالتك…" : "أضف وكيلاً أولاً"}
            disabled={loading || activeAgents.length === 0}
            className="max-h-32 flex-1 resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-[#030957] outline-none focus:border-[#ffb900] focus:ring-2 focus:ring-[#ffb900]/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && files.length === 0)}
            aria-label="إرسال"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#ffb900] px-4 text-sm font-semibold text-[#030957] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 -scale-x-100" />
            )}
          </button>
        </form>
      </section>
    </div>
  );
}

function ToolBtn({
  onClick,
  icon: Icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
        danger
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-black/10 bg-white text-[#030957] hover:border-[#ffb900]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
