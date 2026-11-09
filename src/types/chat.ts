export type Role = "user" | "assistant";

/** Single source of truth for the widget lifecycle. No competing booleans. */
export type ChatPhase =
  | "idle"
  | "connecting"
  | "streaming"
  | "completed"
  | "error"
  | "offline"
  | "listening";

export type ChatStatus = ChatPhase;

export interface ChatFile {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Optional data URL for previewing images locally. */
  dataUrl?: string;
  /** Remote (Supabase) URL after upload. */
  url?: string;
  /** Storage path within the bucket. */
  path?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  files?: ChatFile[];
  timestamp: number;
  /** True when this bubble represents a failed reply (shows retry). */
  failed?: boolean;
  /** The user message id this failed reply belongs to. */
  retryOf?: string;
}

export type ExportFormat = "txt" | "json" | "md";
export type ThemeMode = "light" | "dark";

export interface ChatSettingsState {
  voiceReplies: boolean;
  exportFormat: ExportFormat;
  theme: ThemeMode;
  /** Selected speech-synthesis voice (voiceURI); empty = default. */
  voiceURI?: string;
}

export interface ChatApiRequestMeta {
  language: "ar" | "en";
  source: "web-widget";
  voiceEnabled: boolean;
}

export interface ChatApiResponse {
  reply: string;
  conversationId: string;
  sources?: unknown[];
  actions?: unknown[];
}
