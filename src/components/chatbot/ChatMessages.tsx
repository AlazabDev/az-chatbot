import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Bot,
  Check,
  Copy,
  FileText,
  Pause,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isThinking: boolean;
  voiceRepliesEnabled: boolean;
  speakingMessageId: string | null;
  onToggleSpeak: (msg: ChatMessage) => void;
  onRetry?: (msg: ChatMessage) => void;
  onSuggestion?: (text: string) => void;
  suggestions?: readonly string[];
}

const SUGGESTIONS = [
  "ما الخدمات التي تقدمونها؟",
  "أريد متابعة طلب صيانة",
  "كيف أتواصل مع فريق الدعم؟",
  "اعرض لي حالة مشروعي",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

/** Renders **bold** segments safely without HTML injection. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function AssistantAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-azab-amber text-azab-navy shadow-sm ring-1 ring-azab-navy/10",
        className,
      )}
      aria-hidden
    >
      <Bot className="h-4 w-4" />
    </div>
  );
}

function EmptyState({
  onSuggestion,
  suggestions = SUGGESTIONS,
}: {
  onSuggestion?: (t: string) => void;
  suggestions?: readonly string[];
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <div className="relative">
        <div aria-hidden className="absolute inset-0 -z-10 scale-150 rounded-full bg-azab-amber/20 blur-2xl" />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-azab-navy to-azab-navy-strong text-azab-amber shadow-lg">
          <Sparkles className="h-8 w-8" />
        </div>
      </div>
      <div>
        <div className="text-lg font-bold text-azab-navy">أهلاً بك في العزب</div>
        <div className="mt-1.5 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
          اسألني عن خدماتنا أو مشروعك، وسأوجهك إلى الوكيل المتخصص المناسب.
        </div>
      </div>
      {onSuggestion && (
        <div className="mt-1 grid w-full max-w-[320px] gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="group flex items-center justify-between gap-2 rounded-xl border border-azab-line bg-azab-surface px-3.5 py-2.5 text-right text-[13px] text-azab-navy shadow-sm transition hover:-translate-y-px hover:border-azab-amber hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
            >
              <span>{s}</span>
              <span className="text-azab-amber opacity-0 transition group-hover:opacity-100" aria-hidden>
                ←
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="azab-fade-up flex items-end gap-2" role="status" aria-label="المساعد يكتب">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-azab-line bg-azab-soft px-4 py-3.5">
        <span className="azab-typing-dot h-1.5 w-1.5 rounded-full bg-azab-navy/70" />
        <span className="azab-typing-dot h-1.5 w-1.5 rounded-full bg-azab-navy/70" />
        <span className="azab-typing-dot h-1.5 w-1.5 rounded-full bg-azab-navy/70" />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label={copied ? "تم النسخ" : "نسخ الرد"}
      title={copied ? "تم النسخ" : "نسخ"}
      className="rounded p-1 text-azab-navy/50 transition hover:bg-azab-soft hover:text-azab-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
    >
      {copied ? <Check className="h-3 w-3 text-azab-online" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function ChatMessages({
  messages,
  isThinking,
  voiceRepliesEnabled,
  speakingMessageId,
  onToggleSpeak,
  onRetry,
  onSuggestion,
  suggestions,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setPinned(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  useEffect(() => {
    if (pinned) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isThinking]);

  if (messages.length === 0 && !isThinking) {
    return (
      <div className="azab-scroll flex-1 overflow-y-auto">
        <EmptyState onSuggestion={onSuggestion} suggestions={suggestions} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {!pinned && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="azab-pop-in absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-azab-navy px-3.5 py-2 text-xs font-medium text-azab-on-navy shadow-lg transition hover:bg-azab-navy-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          أحدث الرسائل
        </button>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        className="azab-scroll flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-5 overscroll-contain"
      >
        {messages.map((m) => {
          const isUser = m.role === "user";
          const isSpeaking = speakingMessageId === m.id;
          const dir = /[\u0600-\u06FF]/.test(m.content) ? "rtl" : "ltr";
          return (
            <div
              key={m.id}
              className={cn("azab-fade-up flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}
            >
              {!isUser && <AssistantAvatar />}

              <div className={cn("flex max-w-[82%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
                <div
                  dir={dir}
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14px] leading-7",
                    m.failed
                      ? "border border-destructive/30 bg-destructive/5 text-destructive"
                      : isUser
                        ? "rounded-br-md bg-gradient-to-br from-azab-navy to-azab-navy-strong text-azab-on-navy shadow-sm"
                        : "rounded-bl-md border border-azab-line bg-azab-soft text-azab-navy",
                  )}
                >
                  <RichText text={m.content} />

                  {m.files && m.files.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {m.files.map((f) => (
                        <div
                          key={f.id}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                            isUser ? "bg-azab-on-navy/15" : "bg-azab-surface",
                          )}
                        >
                          {f.dataUrl ? (
                            <img src={f.dataUrl} alt={f.name} className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate">{f.name}</span>
                          <span className="ms-auto opacity-70">{formatBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {m.failed && onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(m)}
                    className="flex min-h-[34px] items-center gap-1.5 rounded-full border border-destructive/30 bg-azab-surface px-3 py-1.5 text-xs font-medium text-destructive shadow-sm transition hover:bg-destructive/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    إعادة المحاولة
                  </button>
                )}

                <div
                  className={cn(
                    "flex items-center gap-1 px-1 text-[10px] text-muted-foreground",
                    isUser ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <span>{formatTime(m.timestamp)}</span>
                  {!isUser && !m.failed && m.content && <CopyButton text={m.content} />}
                  {!isUser && !m.failed && voiceRepliesEnabled && (
                    <button
                      type="button"
                      onClick={() => onToggleSpeak(m)}
                      aria-label={isSpeaking ? "إيقاف القراءة" : "قراءة الرد"}
                      className="rounded p-1 text-azab-navy/50 transition hover:bg-azab-soft hover:text-azab-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber"
                    >
                      {isSpeaking ? <Pause className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isThinking && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
