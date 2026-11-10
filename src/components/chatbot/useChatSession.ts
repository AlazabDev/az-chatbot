import { useEffect, useState } from "react";
import type { ChatMessage, ChatSettingsState } from "@/types/chat";
import { listPublicAgents } from "@/lib/agents/dispatcher.functions";
import { getChatStorage, setChatStorage, getChatVisitorId } from "@/lib/chatStorage";

const PREFIX = "azab.chat";
const LS_SETTINGS = `${PREFIX}.settings`;
const LS_AGENT_ID = `${PREFIX}.agentId`;

export const DEFAULT_AGENT_ID = "az-agent-azabot";
const DEFAULT_SETTINGS: ChatSettingsState = { voiceReplies: false, exportFormat: "txt", theme: "light" };

const read = getChatStorage;
const write = setChatStorage;
function parse<T>(key: string, fallback: T): T {
  const raw = read(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
function sessionKey(agentId: string, field: "messages" | "conversationId"): string {
  return `${PREFIX}.agent.${encodeURIComponent(agentId)}.${field}`;
}
function loadMessages(agentId: string): ChatMessage[] {
  const stored = parse<unknown>(sessionKey(agentId, "messages"), []);
  if (!Array.isArray(stored)) return [];
  return stored.filter((m): m is ChatMessage =>
    m != null && typeof m === "object" && typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" && typeof m.timestamp === "number"
  ).slice(-200);
}

export type ChatSessionState = "pending" | "ready" | "unavailable";
interface Options {
  applyTheme?: boolean;
  /** Kept for callers using the old API; public text chat does not need Supabase authentication. */
  ensureSession?: boolean;
}

export function useChatSession({ applyTheme = true }: Options = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<ChatSettingsState>(DEFAULT_SETTINGS);
  const [conversationId, setConversationId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_AGENT_ID);
  const [loadedAgentId, setLoadedAgentId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [sessionState] = useState<ChatSessionState>("ready");

  useEffect(() => {
    let active = true;
    const storedSettings = parse<Partial<ChatSettingsState>>(LS_SETTINGS, {});
    setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
    setVisitorId(getChatVisitorId());
    const storedAgent = read(LS_AGENT_ID) || DEFAULT_AGENT_ID;
    setSelectedAgentId(storedAgent);
    setHydrated(true);
    void listPublicAgents().then((agents) => {
      if (!active) return;
      if (agents.length && !agents.some((agent) => agent.id === storedAgent || agent.slug === storedAgent)) {
        setSelectedAgentId((current) => current === storedAgent ?
          (agents.find((agent) => agent.isDefault) ?? agents[0]).id : current);
      }
    }).catch(() => { /* Discovery failure must not block the chat UI. */ });
    return () => { active = false; };
  }, []);

  // Load each agent's own conversation before permitting persistence for that agent.
  useEffect(() => {
    if (!hydrated) return;
    setLoadedAgentId(null);
    setMessages(loadMessages(selectedAgentId));
    setConversationId(read(sessionKey(selectedAgentId, "conversationId")) || "");
    setLoadedAgentId(selectedAgentId);
    write(LS_AGENT_ID, selectedAgentId);
  }, [selectedAgentId, hydrated]);

  useEffect(() => {
    if (!hydrated || loadedAgentId !== selectedAgentId) return;
    write(sessionKey(selectedAgentId, "messages"), JSON.stringify(messages.slice(-200)));
  }, [messages, selectedAgentId, loadedAgentId, hydrated]);

  useEffect(() => {
    if (!hydrated || loadedAgentId !== selectedAgentId) return;
    write(sessionKey(selectedAgentId, "conversationId"), conversationId);
  }, [conversationId, selectedAgentId, loadedAgentId, hydrated]);

  useEffect(() => {
    if (hydrated) write(LS_SETTINGS, JSON.stringify(settings));
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated && applyTheme) {
      document.documentElement.classList.toggle("dark", settings.theme === "dark");
    }
  }, [settings.theme, applyTheme, hydrated]);

  return {
    hydrated: hydrated && loadedAgentId === selectedAgentId,
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
