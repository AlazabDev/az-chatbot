import { useEffect, useState } from "react";
import type { ChatMessage, ChatSettingsState } from "@/types/chat";
import { listPublicAgents } from "@/lib/agents/dispatcher.functions";

const LS_MESSAGES = "azab.chat.messages";
const LS_SETTINGS = "azab.chat.settings";
const LS_CONV_ID = "azab.chat.conversationId";
const LS_AGENT_ID = "azab.chat.agentId";
const LS_VISITOR_ID = "azab.chat.visitorId";

export const DEFAULT_AGENT_ID = "az-agent-azabot";

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

/** `ready` means public chat is usable; it does not imply Supabase authentication. */
export type ChatSessionState = "pending" | "ready" | "unavailable";

interface Options {
  /** Toggle the `dark` class on <html> from the saved chat theme. Default: true. */
  applyTheme?: boolean;
  /** Compatibility option; public chat never requires anonymous authentication. */
  ensureSession?: boolean;
}

/**
 * Persistent chat state shared by the floating widget and the /help portal.
 * Both use the same localStorage keys, so a conversation continues across them.
 */
export function useChatSession({ applyTheme = true }: Options = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<ChatSettingsState>(DEFAULT_SETTINGS);
  const [conversationId, setConversationId] = useState<string>("");
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_AGENT_ID);
  const [hydrated, setHydrated] = useState(false);
  const [sessionState] = useState<ChatSessionState>("ready");
  const [visitorId, setVisitorId] = useState("");

  useEffect(() => {
    let alive = true;
    setMessages(loadJSON<ChatMessage[]>(LS_MESSAGES, []));
    setSettings(loadJSON<ChatSettingsState>(LS_SETTINGS, DEFAULT_SETTINGS));
    let id = window.localStorage.getItem(LS_CONV_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(LS_CONV_ID, id);
    }
    setConversationId(id);
    let visitor = window.localStorage.getItem(LS_VISITOR_ID);
    if (!visitor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor)) {
      visitor = crypto.randomUUID();
      window.localStorage.setItem(LS_VISITOR_ID, visitor);
    }
    setVisitorId(visitor);
    setHydrated(true);
    const storedAgent = window.localStorage.getItem(LS_AGENT_ID) || DEFAULT_AGENT_ID;
    setSelectedAgentId(storedAgent);
    void listPublicAgents().then((agents) => {
      if (!alive) return;
      if (agents.length && !agents.some((agent) => agent.id === storedAgent)) {
        setSelectedAgentId((current) => current === storedAgent
          ? (agents.find((agent) => agent.isDefault) ?? agents[0]).id
          : current);
      }
    }).catch(() => { /* Preserve the previous selection if discovery fails. */ });
    return () => { alive = false; };
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
    if (!hydrated || !applyTheme) return;
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme, hydrated, applyTheme]);

  return {
    hydrated,
    sessionState,
    visitorId,
    messages,
    setMessages,
    settings,
    setSettings,
    conversationId,
    setConversationId,
    selectedAgentId,
    setSelectedAgentId,
  };
}
