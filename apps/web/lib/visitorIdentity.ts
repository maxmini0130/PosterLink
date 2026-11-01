/** Browser-local anonymous keys shared by visit logs, poster views and product events. */
export const VISITOR_KEY = "posterlink.visitor_key";
export const SESSION_KEY = "posterlink.session_key";
/** Former poster-view key; read once so existing browsers keep one identity. */
const LEGACY_POSTER_VISITOR_KEY = "posterlink_visitor_key";

export function createKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getStoredKey(storage: Storage, key: string, fallback?: string | null) {
  let value = storage.getItem(key);
  if (!value) {
    value = fallback || createKey();
    storage.setItem(key, value);
  }
  return value;
}

export function getVisitorKey() {
  try {
    return getStoredKey(
      window.localStorage,
      VISITOR_KEY,
      window.localStorage.getItem(LEGACY_POSTER_VISITOR_KEY),
    );
  } catch {
    return createKey();
  }
}

export function getSessionKey() {
  try {
    return getStoredKey(window.sessionStorage, SESSION_KEY);
  } catch {
    return createKey();
  }
}
