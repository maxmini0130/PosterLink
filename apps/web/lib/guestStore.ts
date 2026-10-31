/**
 * Browser-storage records for people who are not signed in (retention plan 2-1,
 * 2-3). Pure functions over an injected store so they can be tested without a
 * browser; each record carries a schema version and is read defensively.
 */

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore, key: string, value: unknown) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

// ---------------------------------------------------------------- favorites

export const GUEST_FAVORITES_KEY = "pl.guest_favorites.v1";
/** Upper bound so a forgotten browser cannot grow the record without limit. */
export const GUEST_FAVORITES_MAX = 200;

export type GuestFavorite = { posterId: string; savedAt: number };

export function readGuestFavorites(store: KeyValueStore): GuestFavorite[] {
  const value = readJson(store, GUEST_FAVORITES_KEY) as {
    v?: unknown;
    items?: unknown;
  } | null;
  if (!value || value.v !== 1 || !Array.isArray(value.items)) return [];
  const seen = new Set<string>();
  const items: GuestFavorite[] = [];
  for (const item of value.items as Array<Partial<GuestFavorite>>) {
    if (typeof item?.posterId !== "string" || !UUID.test(item.posterId))
      continue;
    if (seen.has(item.posterId)) continue;
    seen.add(item.posterId);
    items.push({
      posterId: item.posterId,
      savedAt: typeof item.savedAt === "number" ? item.savedAt : 0,
    });
  }
  return items;
}

function writeGuestFavorites(store: KeyValueStore, items: GuestFavorite[]) {
  return writeJson(store, GUEST_FAVORITES_KEY, { v: 1, items });
}

export function hasGuestFavorite(store: KeyValueStore, posterId: string) {
  return readGuestFavorites(store).some((item) => item.posterId === posterId);
}

/** Adds (or keeps) a favorite, newest first. Returns false if not stored. */
export function addGuestFavorite(
  store: KeyValueStore,
  posterId: string,
  now: number,
) {
  if (!UUID.test(posterId)) return false;
  const rest = readGuestFavorites(store).filter(
    (item) => item.posterId !== posterId,
  );
  return writeGuestFavorites(
    store,
    [{ posterId, savedAt: now }, ...rest].slice(0, GUEST_FAVORITES_MAX),
  );
}

export function removeGuestFavorite(store: KeyValueStore, posterId: string) {
  const items = readGuestFavorites(store);
  const rest = items.filter((item) => item.posterId !== posterId);
  return rest.length === items.length ? true : writeGuestFavorites(store, rest);
}

// ----------------------------------------------------------- pending action

export const PENDING_ACTION_KEY = "pl.pending_action.v1";
/** A sign-in that takes longer than this is treated as abandoned. */
export const PENDING_ACTION_TTL_MS = 60 * 60 * 1000;

export type PendingActionType = "favorite" | "follow";
export type PendingAction = {
  type: PendingActionType;
  /** poster id for favorite, institution id for follow */
  targetId: string;
  returnTo: string;
  createdAt: number;
};

/** In-app path to return to after sign-in; never auth pages or other origins. */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return null;
  if (/^\/(login|signup|auth|onboarding)(\/|\?|$)/.test(value)) return null;
  return value.length <= 300 ? value : null;
}

export function setPendingAction(
  store: KeyValueStore,
  action: Omit<PendingAction, "createdAt">,
  now: number,
) {
  const returnTo = safeReturnTo(action.returnTo);
  if (!returnTo || !UUID.test(action.targetId)) return false;
  return writeJson(store, PENDING_ACTION_KEY, {
    v: 1,
    type: action.type,
    targetId: action.targetId,
    returnTo,
    createdAt: now,
  });
}

export function readPendingAction(
  store: KeyValueStore,
  now: number,
): PendingAction | null {
  const value = readJson(store, PENDING_ACTION_KEY) as Partial<
    PendingAction & { v: number }
  > | null;
  const valid =
    value &&
    value.v === 1 &&
    (value.type === "favorite" || value.type === "follow") &&
    typeof value.targetId === "string" &&
    UUID.test(value.targetId) &&
    typeof value.createdAt === "number" &&
    now - value.createdAt >= 0 &&
    now - value.createdAt < PENDING_ACTION_TTL_MS &&
    safeReturnTo(value.returnTo);
  if (!valid) {
    if (value) clearPendingAction(store);
    return null;
  }
  return {
    type: value.type as PendingActionType,
    targetId: value.targetId as string,
    returnTo: value.returnTo as string,
    createdAt: value.createdAt as number,
  };
}

export function clearPendingAction(store: KeyValueStore) {
  try {
    store.removeItem(PENDING_ACTION_KEY);
  } catch {
    /* storage blocked */
  }
}
