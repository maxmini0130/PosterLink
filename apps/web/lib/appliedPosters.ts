/**
 * "신청했어요" marks (docs/design/v6.1/SPEC.md 5). Only the person's own click
 * sets one; opening the application page never does. Guests keep them in this
 * browser, members in favorites.user_status, merged at sign-in like favorites.
 * Pure storage helpers: the browser wiring is app/lib/appliedClient.ts.
 */
import type { KeyValueStore } from "./guestStore";

export const GUEST_APPLIED_KEY = "pl.guest_applied.v1";
export const GUEST_APPLIED_MAX = 200;
/** Posters whose "신청을 마치셨나요?" was already shown (never asked twice). */
export const APPLY_PROMPTED_KEY = "pl.apply_prompted.v1";
/** Member favourites created only because of a mark, removed again on undo. */
export const APPLY_CREATED_FAVORITE_KEY = "pl.apply_created_favorite.v1";
/** sessionStorage: the application page was opened from this poster. */
export const APPLY_OPENED_KEY = "pl.apply_opened.v1";
/** How long after opening the application page a return still asks. */
export const APPLY_RETURN_WINDOW_MS = 2 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AppliedEntry = { posterId: string; appliedAt: number };

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    return JSON.parse(store.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore, key: string, value: unknown) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readIdList(store: KeyValueStore, key: string): string[] {
  const value = readJson(store, key) as { ids?: unknown } | null;
  return Array.isArray(value?.ids)
    ? value.ids.filter(
        (id): id is string => typeof id === "string" && UUID.test(id),
      )
    : [];
}

export function readGuestApplied(store: KeyValueStore): AppliedEntry[] {
  const value = readJson(store, GUEST_APPLIED_KEY) as {
    v?: number;
    items?: unknown;
  } | null;
  if (!value || value.v !== 1 || !Array.isArray(value.items)) return [];
  const seen = new Set<string>();
  return value.items.flatMap((item) => {
    const entry = item as Partial<AppliedEntry>;
    if (
      typeof entry?.posterId !== "string" ||
      !UUID.test(entry.posterId) ||
      typeof entry.appliedAt !== "number" ||
      seen.has(entry.posterId)
    )
      return [];
    seen.add(entry.posterId);
    return [{ posterId: entry.posterId, appliedAt: entry.appliedAt }];
  });
}

export function addGuestApplied(
  store: KeyValueStore,
  posterId: string,
  now: number,
): boolean {
  if (!UUID.test(posterId)) return false;
  const items = readGuestApplied(store).filter(
    (item) => item.posterId !== posterId,
  );
  items.unshift({ posterId, appliedAt: now });
  return writeJson(store, GUEST_APPLIED_KEY, {
    v: 1,
    items: items.slice(0, GUEST_APPLIED_MAX),
  });
}

export function removeGuestApplied(store: KeyValueStore, posterId: string) {
  return writeJson(store, GUEST_APPLIED_KEY, {
    v: 1,
    items: readGuestApplied(store).filter((item) => item.posterId !== posterId),
  });
}

export function wasApplyPrompted(store: KeyValueStore, posterId: string) {
  return readIdList(store, APPLY_PROMPTED_KEY).includes(posterId);
}

export function rememberApplyPrompted(store: KeyValueStore, posterId: string) {
  const ids = readIdList(store, APPLY_PROMPTED_KEY).filter(
    (id) => id !== posterId,
  );
  ids.unshift(posterId);
  return writeJson(store, APPLY_PROMPTED_KEY, { ids: ids.slice(0, 500) });
}

export function readCreatedByApply(store: KeyValueStore) {
  return new Set(readIdList(store, APPLY_CREATED_FAVORITE_KEY));
}

export function setCreatedByApply(
  store: KeyValueStore,
  posterId: string,
  created: boolean,
) {
  const ids = readIdList(store, APPLY_CREATED_FAVORITE_KEY).filter(
    (id) => id !== posterId,
  );
  if (created) ids.unshift(posterId);
  return writeJson(store, APPLY_CREATED_FAVORITE_KEY, {
    ids: ids.slice(0, 500),
  });
}

/** The application page was opened from this poster (detail, primary button). */
export function rememberApplyOpened(
  store: KeyValueStore,
  posterId: string,
  now: number,
) {
  return writeJson(store, APPLY_OPENED_KEY, { posterId, at: now });
}

/**
 * Whether to ask "신청을 마치셨나요?" now (SPEC 5): the application page was
 * opened from this poster recently, it is not marked, and it was never asked.
 */
export function shouldAskApplied(deps: {
  session: KeyValueStore;
  local: KeyValueStore;
  posterId: string;
  applied: boolean;
  now: number;
}) {
  if (deps.applied || wasApplyPrompted(deps.local, deps.posterId)) return false;
  const opened = readJson(deps.session, APPLY_OPENED_KEY) as {
    posterId?: unknown;
    at?: unknown;
  } | null;
  return (
    opened?.posterId === deps.posterId &&
    typeof opened.at === "number" &&
    deps.now - opened.at >= 0 &&
    deps.now - opened.at < APPLY_RETURN_WINDOW_MS
  );
}

export function clearApplyOpened(store: KeyValueStore) {
  try {
    store.removeItem(APPLY_OPENED_KEY);
  } catch {
    /* storage blocked */
  }
}
