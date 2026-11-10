import { useEffect, useRef, useState } from "react";
import { PhoneOff, Mic, MicOff, Loader2 } from "lucide-react";
import { sendChatMessage } from "@/lib/chatApi";
import { startLiveCall, type LiveCallHandle } from "@/lib/liveCall";
import { logChatError, toUserErrorMessage } from "@/lib/chatErrors";
import {
  detectLanguage,
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
} from "@/lib/voice";
import type { ChatMessage } from "@/types/chat";

type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

interface VoiceCallProps {
  open: boolean;
  selectedAgentId?: string;
  conversationId: string;
  onConversationId: (id: string) => void;
  onTranscript: (msg: ChatMessage) => void;
  onClose: () => void;
}

export function VoiceCall({
  open,
  selectedAgentId,
  conversationId,
  onConversationId,
  onTranscript,
  onClose,
}: VoiceCallProps) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState("");
  const [duration, setDuration] = useState(0);
  const [live, setLive] = useState(false);

  const recRef = useRef<ReturnType<typeof getSpeechRecognition>>(null);
  const liveRef = useRef<LiveCallHandle | null>(null);
  const stateRef = useRef<CallState>("idle");
  const mutedRef = useRef(false);
  const convRef = useRef(conversationId);
  const activeRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    convRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    setError(null);
    setCaption("");
    setState("connecting");
    const startedAt = Date.now();
    const timer = setInterval(() => setDuration(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    // Prefer a true live (full-duplex) realtime call; fall back to the
    // speech-recognition turn loop when realtime isn't available.
    (async () => {
      try {
        // A generic realtime deployment cannot preserve a selected agent's identity.
        if (selectedAgentId) throw new Error("Use selected agent voice conversation");
        const handle = await startLiveCall({
          onConnected: () => {
            if (!activeRef.current) return;
            setLive(true);
            setError(null);
            setState("listening");
          },
          onSpeakingChange: (speaking) => {
            if (!activeRef.current) return;
            setState(speaking ? "speaking" : "listening");
          },
          onCaption: (t) => setCaption(t),
          onUserText: (t) =>
            onTranscript({
              id: crypto.randomUUID(),
              role: "user",
              content: t,
              timestamp: Date.now(),
            }),
          onAssistantText: (t) =>
            onTranscript({
              id: crypto.randomUUID(),
              role: "assistant",
              content: t,
              timestamp: Date.now(),
            }),
          onClosed: () => {
            if (!activeRef.current) return;
            setLive(false);
            setError(null);
            setCaption("تم التحويل تلقائياً إلى الوضع الصوتي المتوافق مع المتصفح.");
            startListening();
          },
        });
        if (!activeRef.current) {
          handle.stop();
          return;
        }
        liveRef.current = handle;
      } catch (err) {
        logChatError("live-call", err);
        if (!activeRef.current) return;
        if (!isSpeechRecognitionSupported() || !isSpeechSynthesisSupported()) {
          setError(
            "المتصفح لا يدعم الاتصال الصوتي المباشر. جرّب Chrome على سطح المكتب أو Android.",
          );
          setState("idle");
          return;
        }
        setLive(false);
        setError(null);
        setCaption("تم تشغيل الوضع الصوتي المتوافق مع المتصفح.");
        startListening();
      }
    })();

    return () => {
      activeRef.current = false;
      clearInterval(timer);
      stopSpeaking();
      liveRef.current?.stop();
      liveRef.current = null;
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
      setLive(false);
      setState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startListening = () => {
    if (!activeRef.current || mutedRef.current) return;
    const rec = getSpeechRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = "ar-SA";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: unknown) => {
      const evt = e as {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
      };
      let interim = "";
      for (let i = 0; i < evt.results.length; i++) {
        const r = evt.results[i];
        const txt = r[0].transcript;
        if ((r as { isFinal?: boolean }).isFinal) finalText += txt;
        else interim += txt;
      }
      setCaption((finalText + " " + interim).trim());
    };
    rec.onerror = (e: unknown) => {
      const evt = e as { error?: string };
      if (evt.error === "not-allowed") {
        setError("تم رفض صلاحية الميكروفون.");
        activeRef.current = false;
      }
    };
    rec.onend = () => {
      const text = finalText.trim();
      if (!activeRef.current) return;
      if (mutedRef.current) return;
      if (!text) {
        startListening();
        return;
      }
      handleUserUtterance(text);
    };
    try {
      rec.start();
      setState("listening");
      setCaption("");
    } catch {
      /* noop */
    }
  };

  const handleUserUtterance = async (text: string) => {
    setState("thinking");
    onTranscript({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    });
    setCaption(text);
    try {
      const res = await sendChatMessage({
        agentId: selectedAgentId,
        message: text,
        conversationId: convRef.current,
        files: [],
        metadata: {
          language: detectLanguage(text),
          source: "web-widget",
          voiceEnabled: true,
        },
      });
      if (res.conversationId && res.conversationId !== convRef.current) {
        onConversationId(res.conversationId);
      }
      onTranscript({
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.reply,
        timestamp: Date.now(),
      });
      setCaption(res.reply);
      setState("speaking");
      speakThen(res.reply, () => {
        if (activeRef.current && !mutedRef.current) startListening();
      });
    } catch (err) {
      logChatError("voice-call", err);
      setError(toUserErrorMessage(err));
      setState("idle");
    }
  };

  const speakThen = (text: string, done: () => void) => {
    if (!isSpeechSynthesisSupported()) {
      done();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = detectLanguage(text) === "ar" ? "ar-SA" : "en-US";
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (liveRef.current) {
      liveRef.current.setMuted(next);
      setState(next ? "idle" : "listening");
      return;
    }
    if (next) {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      stopSpeaking();
      setState("idle");
    } else if (state === "idle") {
      startListening();
    }
  };

  const handleHangup = () => {
    activeRef.current = false;
    liveRef.current?.stop();
    liveRef.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    stopSpeaking();
    onClose();
  };

  if (!open) return null;

  const mm = String(Math.floor(duration / 60)).padStart(2, "0");
  const ss = String(duration % 60).padStart(2, "0");

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="مكالمة صوتية مع Azab Assistant"
      className="absolute inset-0 z-20 flex flex-col items-center justify-between overflow-x-hidden p-6 text-white"
      style={{
        background: "linear-gradient(160deg, #030957 0%, #0a1170 55%, #1a2280 100%)",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full text-center">
        <div className="text-xs opacity-70">
          {live ? "مكالمة صوتية مباشرة (Live)" : "مكالمة صوتية"}
        </div>
        <div className="mt-1 font-mono text-lg tabular-nums">
          {mm}:{ss}
        </div>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-white/10 backdrop-blur">
          <div
            className={`absolute inset-0 rounded-full ${
              state === "listening"
                ? "animate-ping bg-[#ffb900]/40"
                : state === "speaking"
                  ? "animate-pulse bg-white/20"
                  : ""
            }`}
          />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-full shadow-xl"
            style={{
              background:
                state === "thinking" || state === "connecting"
                  ? "linear-gradient(135deg, #fff, #e5e7eb)"
                  : "linear-gradient(135deg, #ffb900, #ffd166)",
              color: "#030957",
            }}
          >
            {state === "thinking" || state === "connecting" ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : muted ? (
              <MicOff className="h-8 w-8" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </div>
        </div>

        <div className="text-center text-sm opacity-90">
          {error
            ? error
            : state === "connecting"
              ? "جاري الاتصال..."
              : state === "listening"
                ? "أستمع إليك..."
                : state === "thinking"
                  ? "أفكر في الرد..."
                  : state === "speaking"
                    ? "يتحدث..."
                    : muted
                      ? "الميكروفون مكتوم"
                      : "على وشك الاستماع..."}
        </div>

        {caption && (
          <div className="max-w-xs rounded-xl bg-white/10 px-3 py-2 text-center text-xs leading-relaxed backdrop-blur">
            {caption}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "تشغيل الميكروفون" : "كتم الميكروفون"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-[#ffb900]"
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleHangup}
          aria-label="إنهاء المكالمة"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 shadow-lg transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-white"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
