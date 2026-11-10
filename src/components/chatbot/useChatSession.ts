import { useEffect, useState } from "react";
import type { ChatMessage, ChatSettingsState } from "@/types/chat";
import { supabase } from "@/integrations/supabase/client";
import { listPublicAgents } from "@/lib/agents/dispatcher.functions";

const LS_MESSAGES = "azab.chat.messages";
const LS_SETTINGS = "azab.chat.settings";
const LS_CONV_ID = "azab.chat.conversationId";
const LS_AGENT_ID = "azab.chat.agentId";

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

/** `ready`: a Supabase session exists. `unavailable`: no session could be opened. */
export type ChatSessionState = "pending" | "ready" | "unavailable";

interface Options {
  /** Toggle the `dark` class on <html> from the saved chat theme. Default: true. */
  applyTheme?: boolean;
  /** Open an anonymous Supabase session when the visitor has none (customer portal). */
  ensureSession?: boolean;
}

/**
 * Persistent chat state shared by the floating widget and the /help portal.
 * Both use the same localStorage keys, so a conversation continues across them.
 */
export function useChatSession({ applyTheme = true, ensureSession = false }: Options = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<ChatSettingsState>(DEFAULT_SETTINGS);
  const [conversationId, setConversationId] = useState<string>("");
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_AGENT_ID);
  const [hydrated, setHydrated] = useState(false);
  const [sessionState, setSessionState] = useState<ChatSessionState>(
    ensureSession ? "pending" : "ready",
  );

  useEffect(() => {
    setMessages(loadJSON<ChatMessage[]>(LS_MESSAGES, []));
    setSettings(loadJSON<ChatSettingsState>(LS_SETTINGS, DEFAULT_SETTINGS));
    let id = window.localStorage.getItem(LS_CONV_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(LS_CONV_ID, id);
    }
    setConversationId(id);
    const storedAgent = window.localStorage.getItem(LS_AGENT_ID) || DEFAULT_AGENT_ID;
    setSelectedAgentId(storedAgent);
    void listPublicAgents().then((agents) => {
      if (agents.length && !agents.some((agent) => agent.id === storedAgent)) {
        setSelectedAgentId((current) => current === storedAgent
          ? (agents.find((agent) => agent.isDefault) ?? agents[0]).id
          : current);
      }
    }).catch(() => { /* Preserve the previous selection if discovery fails. */ })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!ensureSession) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
        }
        if (alive) setSessionState("ready");
      } catch (error) {
        console.error("[chat] could not open a session", error);
        if (alive) setSessionState("unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensureSession]);

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
