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
  onClose: () => void;
  onDownload: (format: ExportFormat) => void;
  onToggleSettings: () => void;
  onStartCall: () => void;
  onNewChat: () => void;
  defaultExportFormat: ExportFormat;
}

const STATUS_LABEL: Record<ChatStatus, string> = {
  idle: "متصل الآن",
  completed: "متصل الآن",
  connecting: "يتصل...",
  streaming: "يفكر...",
  listening: "يستمع...",
  error: "تعذر الاتصال",
  offline: "لا يوجد اتصال",
};

const STATUS_DOT: Record<ChatStatus, string> = {
  idle: "#22c55e",
  completed: "#22c55e",
  connecting: "#ffb900",
  streaming: "#ffb900",
  listening: "#ef4444",
  error: "#ef4444",
  offline: "#9ca3af",
};

const PULSING: ChatStatus[] = ["connecting", "streaming"];

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
    <header
      className="relative flex items-center justify-between gap-2 px-3 py-3 text-white"
      style={{
        background: "linear-gradient(135deg, #030957 0%, #0a1170 60%, #1a2280 100%)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md"
          style={{
            background: "linear-gradient(135deg, #ffb900 0%, #ffd166 100%)",
            color: "#030957",
          }}
          aria-hidden
        >
          <Sparkles className="h-5 w-5" strokeWidth={2.4} />
          <span
            className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-[#030957]"
            style={{ backgroundColor: "#22c55e" }}
          />
        </div>

        <div className="min-w-0 leading-tight">
          <div className="truncate whitespace-nowrap font-semibold">Azab Assistant</div>
          <div className="flex items-center gap-1.5 text-xs opacity-90">
            <span
              className={cn("h-2 w-2 rounded-full", PULSING.includes(status) && "animate-pulse")}
              style={{ backgroundColor: STATUS_DOT[status] }}
            />
            {STATUS_LABEL[status]}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onNewChat}
          aria-label="بدء دردشة جديدة"
          title="دردشة جديدة"
          className="rounded-md p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onStartCall}
          aria-label="بدء مكالمة صوتية"
          className="rounded-md p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
        >
          <Phone className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDownloadOpen((v) => !v)}
            aria-label="تحميل المحادثة"
            aria-haspopup="menu"
            aria-expanded={downloadOpen}
            className="rounded-md p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
          >
            <Download className="h-4 w-4" />
          </button>
          {downloadOpen && (
            <div
              role="menu"
              className="azab-pop-in absolute right-0 top-full z-10 mt-1 min-w-[140px] overflow-hidden rounded-md bg-white text-sm text-[#030957] shadow-lg ring-1 ring-black/5"
            >
              {(["txt", "json", "md"] as ExportFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  role="menuitem"
                  type="button"
                  onClick={() => handleDownload(fmt)}
                  className={cn(
                    "block w-full px-3 py-2 text-right hover:bg-[#f4f5fb]",
                    fmt === defaultExportFormat && "font-semibold",
                  )}
                >
                  {fmt === "txt" ? "نص (.txt)" : fmt === "json" ? "JSON (.json)" : "Markdown (.md)"}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleSettings}
          aria-label="الإعدادات"
          className="rounded-md p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="rounded-md p-1.5 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
