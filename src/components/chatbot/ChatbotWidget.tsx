import { useEffect, useState } from "react";
import type { ChatMessage, ChatSettingsState } from "@/types/chat";
import { ChatButton } from "./ChatButton";
import { ChatWindow } from "./ChatWindow";

const LS_MESSAGES = "azab.chat.messages";
const LS_SETTINGS = "azab.chat.settings";
const LS_CONV_ID = "azab.chat.conversationId";
const LS_AGENT_ID = "azab.chat.agentId";

const DEFAULT_SETTINGS: ChatSettingsState = {
  voiceReplies: false,
  exportFormat: "txt",
  theme: "light",
};

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function ChatbotWidget({
  onOpenChange,
  onStateChange,
}: {
  /** Notified whenever the chat window is opened or closed (used by the embed page). */
  onOpenChange?: (open: boolean) => void;
  onStateChange?: (state: "collapsed" | "expanded" | "open") => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [launcherExpanded, setLauncherExpanded] = useState(false);
  const [callRequest, setCallRequest] = useState(0);

  const setOpenState = (next: boolean) => {
    setOpen(next);
    if (next) setLauncherExpanded(false);
    onOpenChange?.(next);
    onStateChange?.(next ? "open" : "collapsed");
  };
  const setLauncherState = (expanded: boolean) => {
    setLauncherExpanded(expanded);
    onStateChange?.(expanded ? "expanded" : "collapsed");
  };
  const startCall = () => {
    setCallRequest((value) => value + 1);
    setOpenState(true);
  };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<ChatSettingsState>(DEFAULT_SETTINGS);
  const [conversationId, setConversationId] = useState<string>("");
  const [selectedAgentId, setSelectedAgentId] = useState("az-agent-azabot");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMessages(loadJSON<ChatMessage[]>(LS_MESSAGES, []));
    setSettings(loadJSON<ChatSettingsState>(LS_SETTINGS, DEFAULT_SETTINGS));
    let id = window.localStorage.getItem(LS_CONV_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(LS_CONV_ID, id);
    }
    setConversationId(id);
    setSelectedAgentId(window.localStorage.getItem(LS_AGENT_ID) || "az-agent-azabot");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_MESSAGES, JSON.stringify(messages));
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (conversationId) {
      window.localStorage.setItem(LS_CONV_ID, conversationId);
    } else {
      window.localStorage.removeItem(LS_CONV_ID);
    }
  }, [conversationId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_AGENT_ID, selectedAgentId);
  }, [selectedAgentId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme, hydrated]);

  if (!hydrated) return null;

  return (
    <>
      <ChatWindow
        open={open}
        messages={messages}
        setMessages={setMessages}
        conversationId={conversationId}
        setConversationId={setConversationId}
        settings={settings}
        setSettings={setSettings}
        callRequest={callRequest}
        selectedAgentId={selectedAgentId}
        onClose={() => setOpenState(false)}
      />
      <ChatButton
        isOpen={open}
        isExpanded={launcherExpanded}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(agent) => setSelectedAgentId(agent.id)}
        onExpand={() => setLauncherState(true)}
        onCollapse={() => setLauncherState(false)}
        onOpenChat={() => setOpenState(true)}
        onStartCall={startCall}
      />
    </>
  );
}
