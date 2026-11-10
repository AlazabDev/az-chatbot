/** Browser storage wrapper: memory fallback only when localStorage is unavailable. */
const transient = new Map<string, string>();
let storageUnavailable = false;

export function getChatStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  if (storageUnavailable) return transient.get(key) ?? null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) transient.delete(key);
    return value;
  } catch {
    storageUnavailable = true;
    return transient.get(key) ?? null;
  }
}

export function setChatStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  transient.set(key, value);
  if (storageUnavailable) return;
  try { window.localStorage.setItem(key, value); }
  catch { storageUnavailable = true; }
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
