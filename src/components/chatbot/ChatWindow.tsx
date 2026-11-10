import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  ChatFile,
  ChatMessage,
  ChatPhase,
  ChatSettingsState,
  ExportFormat,
} from "@/types/chat";
import { sendChatMessage } from "@/lib/chatApi";
import { downloadChat } from "@/lib/chatExport";
import { CHAT_ERROR_MESSAGES, classifyChatError, logChatError } from "@/lib/chatErrors";
import {
  detectLanguage,
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  speak,
  stopSpeaking,
} from "@/lib/voice";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatSettings } from "./ChatSettings";
import { VoiceCall } from "./VoiceCall";
import { Link } from "@tanstack/react-router";

interface ChatWindowProps {
  sessionUnavailable?: boolean;
  open: boolean;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  conversationId: string;
  setConversationId: (id: string) => void;
  settings: ChatSettingsState;
  setSettings: Dispatch<SetStateAction<ChatSettingsState>>;
  callRequest: number;
  selectedAgentId?: string;
  /** `floating` is the launcher popup; `page` fills its parent (used by /help). */
  variant?: "floating" | "page";
  /** Put text in the input box; bump `id` to apply the same text again. */
  prefill?: { id: number; text: string };
  suggestions?: readonly string[];
  onClose?: () => void;
}

/** Raw File objects can't be persisted, so keep them per-session for retries. */
interface PendingPayload {
  text: string;
  rawFiles: File[];
}

export function ChatWindow({
  sessionUnavailable = false,
  open,
  messages,
  setMessages,
  conversationId,
  setConversationId,
  settings,
  setSettings,
  callRequest,
  selectedAgentId,
  variant = "floating",
  prefill,
  suggestions,
  onClose,
}: ChatWindowProps) {
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);

  const inputRef = useRef<ChatInputHandle>(null);
  const recognitionRef = useRef<ReturnType<typeof getSpeechRecognition>>(null);
  const pendingRef = useRef<Map<string, PendingPayload>>(new Map());
  const voiceSupported = isSpeechRecognitionSupported();

  const busy = phase === "connecting" || phase === "streaming";
  const isListening = phase === "listening";

  const runRequest = async (userMsgId: string, payload: PendingPayload) => {
    setPhase("connecting");

    try {
      const response = await sendChatMessage({
        message: payload.text,
        conversationId,
        files: payload.rawFiles,
        metadata: {
          language: detectLanguage(payload.text),
          source: "web-widget",
          voiceEnabled: settings.voiceReplies,
        },
        agentId: selectedAgentId,
      });

      setPhase("streaming");

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.reply,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      if (settings.voiceReplies && response.reply) {
        speak(response.reply, detectLanguage(response.reply), settings.voiceURI);
        setSpeakingId(assistantMessage.id);
      }

      pendingRef.current.delete(userMsgId);
      setPhase("completed");
      setTimeout(() => setPhase("idle"), 250);
    } catch (error) {
      const kind = classifyChatError(error);
      logChatError("send", error);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: CHAT_ERROR_MESSAGES[kind],
          timestamp: Date.now(),
          failed: true,
          retryOf: userMsgId,
        },
      ]);

      setPhase(kind === "offline" ? "offline" : "error");
    }
  };

  useEffect(() => {
    // Full-page layouts must not grab focus on load (it pops the keyboard on phones).
    if (open && variant === "floating") {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, variant]);

  useEffect(() => {
    if (!open || !prefill?.text) return;
    inputRef.current?.setText(prefill.text);
    inputRef.current?.focus();
  }, [prefill?.id, prefill?.text, open]);

  useEffect(() => {
    if (open && callRequest > 0) setCallOpen(true);
  }, [callRequest, open]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      recognitionRef.current?.stop();
    };
  }, []);

  const handleSend = async (text: string, files: ChatFile[], rawFiles: File[]) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      files,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    pendingRef.current.set(userMsg.id, { text, rawFiles });
    await runRequest(userMsg.id, { text, rawFiles });
  };

  /** Resend the last user message without duplicating any bubble. */
  const handleRetry = async (failedMsg: ChatMessage) => {
    if (busy) return;
    const userMsgId = failedMsg.retryOf;
    if (!userMsgId) return;
    const userMsg = messages.find((m) => m.id === userMsgId);
    if (!userMsg) return;

    // Remove only the failed reply bubble; the user bubble stays as-is.
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    const payload =
      pendingRef.current.get(userMsgId) ??
      ({ text: userMsg.content, rawFiles: [] } satisfies PendingPayload);
    await runRequest(userMsgId, payload);
  };

  const handleToggleVoice = () => {
    if (!voiceSupported) return;
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = getSpeechRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    rec.lang = "ar-SA";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: unknown) => {
      const evt = e as { results: ArrayLike<ArrayLike<{ transcript: string }>> };
      const transcript = Array.from(evt.results)
        .map((r) => r[0].transcript)
        .join(" ");
      inputRef.current?.appendText(transcript);
    };
    rec.onerror = (e: unknown) => {
      const evt = e as { error?: string };
      if (evt.error === "not-allowed" || evt.error === "service-not-allowed") {
        alert("تم رفض صلاحية الميكروفون. يرجى السماح بالوصول من إعدادات المتصفح.");
      }
      setPhase("idle");
    };
    rec.onend = () => setPhase((p) => (p === "listening" ? "idle" : p));
    try {
      rec.start();
      setPhase("listening");
    } catch {
      setPhase("idle");
    }
  };

  const handleDownload = (format: ExportFormat) => {
    if (messages.length === 0) return;
    downloadChat(messages, format);
  };

  const handleClear = () => {
    if (!confirm("هل تريد بالتأكيد مسح المحادثة؟")) return;
    setMessages([]);
    pendingRef.current.clear();
    setSettingsOpen(false);
    stopSpeaking();
    setSpeakingId(null);
    setPhase("idle");
  };

  const handleNewChat = () => {
    if (messages.length > 0 && !confirm("بدء دردشة جديدة؟ سيتم مسح المحادثة الحالية.")) {
      return;
    }
    stopSpeaking();
    setSpeakingId(null);
    setMessages([]);
    pendingRef.current.clear();
    setConversationId("");
    setSettingsOpen(false);
    setCallOpen(false);
    setPhase("idle");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const handleToggleSpeak = (msg: ChatMessage) => {
    if (speakingId === msg.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msg.id);
    speak(msg.content, detectLanguage(msg.content), settings.voiceURI);
  };

  if (!open) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="Azab Assistant"
      className={
        variant === "page"
          ? "flex h-full w-full flex-col overflow-hidden bg-white"
          : "azab-pop-in fixed inset-0 z-[9998] flex flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(640px,calc(100dvh-7rem))] sm:w-[380px] sm:rounded-2xl"
      }
      style={
        variant === "page"
          ? undefined
          : {
              boxShadow: "var(--azab-shadow)",
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }
      }
    >
      <ChatHeader
        status={phase}
        onClose={onClose}
        onDownload={handleDownload}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        onStartCall={() => setCallOpen(true)}
        onNewChat={handleNewChat}
        defaultExportFormat={settings.exportFormat}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
        {settingsOpen && (
          <ChatSettings
            settings={settings}
            onChange={setSettings}
            onClear={handleClear}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        <ChatMessages
          messages={messages}
          isThinking={busy}
          voiceRepliesEnabled={settings.voiceReplies}
          speakingMessageId={speakingId}
          onToggleSpeak={handleToggleSpeak}
          onRetry={handleRetry}
          onSuggestion={(t) => inputRef.current?.setText(t)}
          suggestions={suggestions}
        />
        {sessionUnavailable && (
          <div role="status" className="border-t border-border bg-muted px-4 py-3 text-sm text-foreground">
            يلزم تسجيل الدخول للمحادثة.
            <Link to="/auth" search={{ reason: "signin" }} target="_blank" className="ms-2 font-semibold text-primary underline">تسجيل الدخول</Link>
          </div>
        )}
        <ChatInput
          ref={inputRef}
          disabled={busy || sessionUnavailable}
          isListening={isListening}
          voiceSupported={voiceSupported}
          onSend={handleSend}
          onToggleVoice={handleToggleVoice}
        />
        <VoiceCall
          selectedAgentId={selectedAgentId}
          open={callOpen}
          conversationId={conversationId}
          onConversationId={setConversationId}
          onTranscript={(m) => setMessages((prev) => [...prev, m])}
          onClose={() => setCallOpen(false)}
        />
      </div>
    </div>
  );
}
