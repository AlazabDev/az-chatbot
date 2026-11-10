import {
  Download,
  MessageSquarePlus,
  Phone,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ChatStatus, ExportFormat } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  status: ChatStatus;
  /** Omit to hide the close button (full-page layouts). */
  onClose?: () => void;
  onDownload: (format: ExportFormat) => void;
  onToggleSettings: () => void;
  onStartCall: () => void;
  onNewChat: () => void;
  defaultExportFormat: ExportFormat;
}

const STATUS_LABEL: Record<ChatStatus, string> = {
  idle: "متصل الآن",
  completed: "متصل الآن",
  connecting: "جارٍ الاتصال…",
  streaming: "يكتب الآن…",
  listening: "يستمع إليك…",
  error: "تعذر الاتصال",
  offline: "غير متصل",
};

const STATUS_DOT: Record<ChatStatus, string> = {
  idle: "bg-azab-online",
  completed: "bg-azab-online",
  connecting: "bg-azab-amber",
  streaming: "bg-azab-amber",
  listening: "bg-destructive",
  error: "bg-destructive",
  offline: "bg-muted-foreground",
};

const PULSING: ChatStatus[] = ["connecting", "streaming", "listening"];

const iconBtn =
  "flex h-8 w-8 items-center justify-center rounded-lg text-azab-on-navy/80 transition hover:bg-azab-on-navy/10 hover:text-azab-on-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-azab-amber";

export function ChatHeader({
  status,
  onClose,
  onDownload,
  onToggleSettings,
  onStartCall,
  onNewChat,
  defaultExportFormat,
}: ChatHeaderProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);

  const handleDownload = (fmt: ExportFormat) => {
    setDownloadOpen(false);
    onDownload(fmt);
  };

  return (
    <header className="relative flex items-center justify-between gap-2 overflow-hidden bg-gradient-to-l from-azab-navy-strong via-azab-navy to-azab-navy px-3.5 py-3 text-azab-on-navy">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-36 w-36 rounded-full bg-azab-amber/15 blur-2xl"
      />
      <div className="relative flex min-w-0 items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-azab-amber text-azab-navy shadow-md ring-1 ring-azab-on-navy/20">
          <Sparkles className="h-5 w-5" strokeWidth={2.3} aria-hidden />
          <span
            className={cn(
              "absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full ring-2 ring-azab-navy",
              STATUS_DOT[status],
            )}
          />
        </div>

        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-semibold tracking-tight">مساعد العزب</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-azab-on-navy/75" aria-live="polite">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                STATUS_DOT[status],
                PULSING.includes(status) && "animate-pulse",
              )}
            />
            {STATUS_LABEL[status]}
          </div>
        </div>
      </div>

      <div className="relative flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onNewChat} aria-label="بدء دردشة جديدة" title="دردشة جديدة" className={iconBtn}>
          <MessageSquarePlus className="h-4 w-4" />
        </button>
        <button type="button" onClick={onStartCall} aria-label="بدء مكالمة صوتية" title="مكالمة صوتية" className={iconBtn}>
          <Phone className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDownloadOpen((v) => !v)}
            aria-label="تحميل المحادثة"
            title="تحميل المحادثة"
            aria-haspopup="menu"
            aria-expanded={downloadOpen}
            className={iconBtn}
          >
            <Download className="h-4 w-4" />
          </button>
          {downloadOpen && (
            <div
              role="menu"
              className="azab-pop-in absolute left-0 top-full z-20 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-azab-line bg-popover p-1 text-sm text-popover-foreground shadow-xl"
            >
              {(["txt", "json", "md"] as ExportFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  role="menuitem"
                  type="button"
                  onClick={() => handleDownload(fmt)}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-right transition hover:bg-azab-soft",
                    fmt === defaultExportFormat && "font-semibold text-azab-navy",
                  )}
                >
                  {fmt === "txt" ? "نص (.txt)" : fmt === "json" ? "JSON (.json)" : "Markdown (.md)"}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onToggleSettings} aria-label="الإعدادات" title="الإعدادات" className={iconBtn}>
          <SettingsIcon className="h-4 w-4" />
        </button>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="إغلاق" title="إغلاق" className={iconBtn}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}
