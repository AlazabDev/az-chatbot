/** Browser storage wrapper: preserves the current tab's chat when storage is blocked. */
const transient = new Map<string, string>();

export function getChatStorage(key: string): string | null {
  if (typeof window === "undefined") return transient.get(key) ?? null;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ?? transient.get(key) ?? null;
  } catch {
    return transient.get(key) ?? null;
  }
}

export function setChatStorage(key: string, value: string): void {
  transient.set(key, value);
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); }
  catch { /* Keep ephemeral state in memory. */ }
}

const VISITOR_KEY = "azab.chat.visitorId";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getChatVisitorId(): string {
  const saved = getChatStorage(VISITOR_KEY);
  if (saved && UUID_RE.test(saved)) return saved;
  const visitorId = crypto.randomUUID();
  setChatStorage(VISITOR_KEY, visitorId);
  return visitorId;
}
