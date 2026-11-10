"use client";

import { ChevronDown, Maximize2, MessageCircle, Phone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AgentPickerPopover, type AgentItem } from "./AgentPickerPopover";

interface ChatButtonProps {
  isOpen: boolean;
  isExpanded: boolean;

  selectedAgentId?: string;
  onSelectAgent?: (agent: AgentItem) => void;
  onPickerChange?: (open: boolean) => void;

  onExpand: () => void;
  onCollapse: () => void;
  onOpenChat: () => void;
  onStartCall: () => void;
}

export function ChatButton({
  isOpen,
  isExpanded,
  selectedAgentId,
  onSelectAgent,
  onPickerChange,
  onExpand,
  onCollapse,
  onOpenChat,
  onStartCall,
}: ChatButtonProps) {
  if (isOpen) return null;

  return (
    <div
      dir="rtl"
      className={cn(
        "fixed bottom-4 right-4 z-[9999] flex items-end justify-end transition-[width,height] duration-300 motion-reduce:transition-none sm:bottom-5 sm:right-5",
        isExpanded ? "h-[118px] w-[min(420px,calc(100vw-2rem))]" : "h-[58px] w-[88px]",
      )}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {isExpanded ? (
        <div className="azab-launcher-expand w-full overflow-visible rounded-[22px] border border-azab-line bg-azab-surface shadow-azab-launcher">
          <div className="flex h-[58px] items-center gap-2 px-3">
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-full bg-[conic-gradient(from_210deg,#030957,#4f7cff,#49d7ff,#8b5cf6,#ffb900,#030957)] shadow-inner"
            />

            <p className="min-w-0 flex-1 text-sm font-semibold text-azab-navy">
              هل تحتاج إلى مساعدة؟
            </p>

            <span className="h-2 w-2 shrink-0 rounded-full bg-azab-online" aria-label="متصل" />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              aria-label="تصغير عزبوت"
              className="h-8 w-8 shrink-0 text-azab-navy hover:bg-azab-soft"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid h-[58px] grid-cols-[minmax(0,1.45fr)_42px_42px_42px] gap-2 border-t border-azab-line p-2">
            <Button
              type="button"
              onClick={onStartCall}
              className="h-10 min-w-0 rounded-lg bg-azab-navy px-3 text-xs text-azab-on-navy shadow-none hover:bg-azab-navy-strong"
            >
              <Phone className="h-4 w-4" />
              <span className="truncate">دعم مكالمة</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onOpenChat}
              aria-label="بدء محادثة"
              className="h-10 w-10 rounded-lg border-azab-line text-azab-navy hover:bg-azab-soft"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>

            <AgentPickerPopover selectedAgentId={selectedAgentId} onSelectAgent={onSelectAgent} onOpenChange={onPickerChange} />

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onOpenChat}
              aria-label="فتح نافذة المحادثة"
              className="h-10 w-10 rounded-lg border-azab-line text-azab-navy hover:bg-azab-soft"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-[58px] w-[88px] items-center gap-2 rounded-[18px] border border-azab-line bg-white px-2 shadow-azab-launcher">
          <Button
            type="button"
            onClick={onOpenChat}
            aria-label="فتح الدردشة"
            className="h-10 w-10 rounded-xl bg-[#3f3f3f] p-0 text-white shadow-none hover:bg-[#333333]"
          >
            <ChevronDown className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onExpand}
            aria-label="توسيع عزبوت"
            aria-expanded={false}
            className="h-10 w-10 rounded-xl text-azab-navy hover:bg-azab-soft"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
