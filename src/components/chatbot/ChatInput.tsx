import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, Paperclip, Send } from "lucide-react";
import type { ChatFile } from "@/types/chat";
import { fileToChatFile } from "@/lib/chatApi";
import { FileAttachmentPreview } from "./FileAttachmentPreview";
import { VoiceControls } from "./VoiceControls";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];
const ACCEPT_ATTR =
  ".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/*";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export interface ChatInputHandle {
  setText: (text: string) => void;
  appendText: (text: string) => void;
  focus: () => void;
}

interface ChatInputProps {
  disabled: boolean;
  isListening: boolean;
  voiceSupported: boolean;
  onSend: (text: string, files: ChatFile[], rawFiles: File[]) => void;
  onToggleVoice: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { disabled, isListening, voiceSupported, onSend, onToggleVoice },
  ref,
) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ChatFile[]>([]);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    setText: (t: string) => setText(t),
    appendText: (t: string) => setText((prev) => (prev ? `${prev} ${t}` : t).trim()),
    focus: () => taRef.current?.focus(),
  }));

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text]);

  const canSend = !disabled && (text.trim().length > 0 || files.length > 0);

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim(), files, rawFiles);
    setText("");
    setFiles([]);
    setRawFiles([]);
    setError(null);
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const accepted: File[] = [];
    const newChatFiles: ChatFile[] = [];
    for (const file of Array.from(list)) {
      const typeOk =
        ACCEPTED_TYPES.includes(file.type) ||
        /\.(pdf|docx|xlsx|csv|txt|png|jpe?g|webp)$/i.test(file.name);
      if (!typeOk) {
        setError(`نوع غير مدعوم: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`الحد الأقصى 20MB. تجاوز: ${file.name}`);
        continue;
      }
      accepted.push(file);
      newChatFiles.push(await fileToChatFile(file));
    }
    setRawFiles((prev) => [...prev, ...accepted]);
    setFiles((prev) => [...prev, ...newChatFiles]);
    if (inputRef.current) inputRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const removeFile = (id: string) => {
    const idx = files.findIndex((f) => f.id === id);
    if (idx === -1) return;
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setRawFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-t border-black/5 bg-white">
      <FileAttachmentPreview files={files} onRemove={removeFile} />

      {error && (
        <div
          role="alert"
          className="border-t border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-600"
        >
          {error}
        </div>
      )}

      <div className="p-2.5">
        <input
          ref={inputRef}
          disabled={disabled}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraRef}
          disabled={disabled}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex items-end gap-1.5 rounded-2xl border border-black/10 bg-[#f8f9fc] px-2 py-1.5 transition focus-within:border-[#ffb900] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(255,185,0,0.15)]">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            aria-label="إرفاق ملفات"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#030957]/70 transition hover:bg-[#030957]/5 hover:text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900] sm:h-8 sm:w-8"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            aria-label="التقاط صورة بالكاميرا"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#030957]/70 transition hover:bg-[#030957]/5 hover:text-[#030957] focus:outline-none focus:ring-2 focus:ring-[#ffb900] sm:h-8 sm:w-8"
          >
            <Camera className="h-4 w-4" />
          </button>

          <VoiceControls
            isListening={isListening}
            supported={voiceSupported && !disabled}
            onToggle={onToggleVoice}
          />

          <textarea
            disabled={disabled}
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isListening ? "جاري الاستماع..." : "اكتب رسالتك..."}
            aria-label="نص الرسالة"
            className="max-h-[140px] min-h-[40px] w-0 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-relaxed text-[#030957] placeholder:text-muted-foreground focus:outline-none sm:min-h-[36px] sm:py-1.5 sm:text-sm"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="إرسال"
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#ffb900] disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8",
              canSend && "hover:scale-105 active:scale-95",
            )}
            style={{
              background: canSend ? "linear-gradient(135deg, #ffb900 0%, #ffd166 100%)" : "#e5e7eb",
              color: "#030957",
            }}
          >
            <Send className="h-4 w-4 -scale-x-100" />
          </button>
        </div>

        <div className="mt-1.5 hidden px-1 text-center text-[10px] text-muted-foreground sm:block">
          اضغط{" "}
          <kbd className="rounded border border-black/10 bg-white px-1 py-0.5 text-[9px] font-medium text-[#030957]">
            Enter
          </kbd>{" "}
          للإرسال •{" "}
          <kbd className="rounded border border-black/10 bg-white px-1 py-0.5 text-[9px] font-medium text-[#030957]">
            Shift + Enter
          </kbd>{" "}
          لسطر جديد
        </div>
      </div>
    </div>
  );
});
