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
  /** Identifies this request, so a stale completion cannot clear a newer one. */
  id: string;
  type: PendingActionType;
  /** poster id for favorite, institution id for follow */
  targetId: string;
  returnTo: string;
  createdAt: number;
};

const ACTION_ID = /^[A-Za-z0-9-]{8,64}$/;
const AUTH_PATH = /^\/(login|signup|auth|onboarding)(\/|$)/;
// Placeholder origin used only to normalise a path; never navigated to.
const PATH_BASE = "https://app.invalid";

/**
 * In-app path to return to after sign-in, normalised the way a browser will
 * read it (tabs and newlines rejected, dot segments resolved), never another
 * origin or a sign-in, sign-up or onboarding page. Returns the normalised path.
 */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 300)
    return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(value, PATH_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PATH_BASE) return null;
  if (AUTH_PATH.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

function newActionId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
      return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Stores the action and returns its id, or null when it could not be stored. */
export function setPendingAction(
  store: KeyValueStore,
  action: Omit<PendingAction, "createdAt" | "id">,
  now: number,
  id: string = newActionId(),
): string | null {
  const returnTo = safeReturnTo(action.returnTo);
  if (!returnTo || !UUID.test(action.targetId) || !ACTION_ID.test(id))
    return null;
  const stored = writeJson(store, PENDING_ACTION_KEY, {
    v: 2,
    id,
    type: action.type,
    targetId: action.targetId,
    returnTo,
    createdAt: now,
  });
  return stored ? id : null;
}

export function readPendingAction(
  store: KeyValueStore,
  now: number,
): PendingAction | null {
  const value = readJson(store, PENDING_ACTION_KEY) as Partial<
    PendingAction & { v: number }
  > | null;
  const returnTo = value ? safeReturnTo(value.returnTo) : null;
  const valid =
    value &&
    value.v === 2 &&
    typeof value.id === "string" &&
    ACTION_ID.test(value.id) &&
    (value.type === "favorite" || value.type === "follow") &&
    typeof value.targetId === "string" &&
    UUID.test(value.targetId) &&
    typeof value.createdAt === "number" &&
    now - value.createdAt >= 0 &&
    now - value.createdAt < PENDING_ACTION_TTL_MS &&
    returnTo === value.returnTo;
  if (!valid) {
    if (value) clearPendingAction(store);
    return null;
  }
  return {
    id: value.id as string,
    type: value.type as PendingActionType,
    targetId: value.targetId as string,
    returnTo: returnTo as string,
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

/**
 * Clears the stored action only if it is still the one with this id.
 * Returns false when it was replaced (another tab or flow) or is gone.
 */
export function clearPendingActionIf(store: KeyValueStore, id: string) {
  const value = readJson(store, PENDING_ACTION_KEY) as { id?: unknown } | null;
  if (!value || value.id !== id) return false;
  clearPendingAction(store);
  return true;
}

/**
 * One pass of completing stored actions after sign-in (retention plan 2-3).
 * Each action is cleared only after its own server write succeeds, and only
 * if it is still the stored one; a newer action stored meanwhile is then
 * processed in turn. Stops on the first failure so the action is retried
 * later. `onDone` receives `current: false` for a completed action that had
 * already been replaced, so callers skip its toast and return navigation.
 */
export async function completePendingActions(deps: {
  store: KeyValueStore;
  now: () => number;
  userId: () => Promise<string | null>;
  complete: (action: PendingAction, userId: string) => Promise<boolean>;
  onDone: (action: PendingAction, current: boolean) => void;
  /** Safety bound on actions handled in one pass. */
  maxActions?: number;
}) {
  const seen = new Set<string>();
  for (let i = 0; i < (deps.maxActions ?? 5); i++) {
    const action = readPendingAction(deps.store, deps.now());
    if (!action || seen.has(action.id)) return;
    seen.add(action.id);
    const userId = await deps.userId();
    if (!userId) return; // still signed out: keep it
    if (!(await deps.complete(action, userId))) return; // retry later
    deps.onDone(action, clearPendingActionIf(deps.store, action.id));
  }
}

// ------------------------------------------------------------- merge (2-4)

export const GUEST_MERGE_NOTICE_KEY = "pl.guest_merge_notice.v1";

export type GuestMergeResult =
  | { status: "none" }
  | { status: "failed"; count: number }
  | { status: "merged"; count: number; added: number; duplicates: number };

/**
 * Moves this browser's guest favorites into the signed-in account (retention
 * plan 2-4). The write is an upsert on (user_id, poster_id), so a retry or a
 * web/app merge at the same time leaves one row per poster. Local favorites are
 * removed only after the write succeeds, and only the ones read at the start:
 * a favorite saved meanwhile stays for the next merge. On failure nothing is
 * removed and the next screen retries.
 */
export async function mergeGuestFavorites(deps: {
  store: KeyValueStore;
  /** Which of these poster ids the account already has; null on failure. */
  existing: (posterIds: string[]) => Promise<string[] | null>;
  /** Upserts the poster ids into the account; false on failure. */
  upsert: (posterIds: string[]) => Promise<boolean>;
}): Promise<GuestMergeResult> {
  const ids = readGuestFavorites(deps.store).map((item) => item.posterId);
  if (ids.length === 0) return { status: "none" };
  const already = await deps.existing(ids);
  if (!already) return { status: "failed", count: ids.length };
  const owned = new Set(already);
  const missing = ids.filter((id) => !owned.has(id));
  if (missing.length > 0 && !(await deps.upsert(missing)))
    return { status: "failed", count: ids.length };
  for (const id of ids) removeGuestFavorite(deps.store, id);
  return {
    status: "merged",
    count: ids.length,
    added: missing.length,
    duplicates: ids.length - missing.length,
  };
}

/** "N개를 계정으로 옮겼어요" notice, shown once on 내 공고 until dismissed. */
export function rememberMergeNotice(
  store: KeyValueStore,
  count: number,
  now: number,
) {
  if (count > 0)
    writeJson(store, GUEST_MERGE_NOTICE_KEY, { v: 1, count, at: now });
}

export function readMergeNotice(store: KeyValueStore): number | null {
  const value = readJson(store, GUEST_MERGE_NOTICE_KEY) as {
    v?: unknown;
    count?: unknown;
  } | null;
  return value?.v === 1 && typeof value.count === "number" && value.count > 0
    ? value.count
    : null;
}

export function dismissMergeNotice(store: KeyValueStore) {
  try {
    store.removeItem(GUEST_MERGE_NOTICE_KEY);
  } catch {
    /* storage blocked */
  }
}
