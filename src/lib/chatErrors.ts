export type ChatErrorKind = "offline" | "rate_limit" | "generic";

export const CHAT_ERROR_MESSAGES: Record<ChatErrorKind, string> = {
  offline: "لا يوجد اتصال بالإنترنت.",
  rate_limit: "تم إرسال عدد كبير من الرسائل خلال فترة قصيرة. حاول مرة أخرى بعد قليل.",
  generic: "تعذر الاتصال بالمساعد حاليًا. حاول مرة أخرى.",
};

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Maps any thrown value to a safe, user-facing error kind. */
export function classifyChatError(err: unknown): ChatErrorKind {
  if (isOffline()) return "offline";

  const raw = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  const text = raw.toLowerCase();

  if (
    text.includes("e_rate_limit") ||
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("too many requests")
  ) {
    return "rate_limit";
  }

  if (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network request failed") ||
    text.includes("load failed")
  ) {
    return "offline";
  }

  return "generic";
}

export function toUserErrorMessage(err: unknown): string {
  return CHAT_ERROR_MESSAGES[classifyChatError(err)];
}

/** Logs the real technical error, but only in development. */
export function logChatError(scope: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[chat:${scope}]`, err);
  }
}
