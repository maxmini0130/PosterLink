import type { KeyValueStore } from "./guestStore";

/**
 * Interest conditions (region and categories) kept in this browser for people
 * who are not signed in (retention plan 2-1, UI plan ⑤), and the rule for
 * when the picker is offered by itself. Pure functions over injected stores.
 */

export const GUEST_INTEREST_KEY = "pl.guest_interest.v1";
/** Set once the picker has been offered, so it never opens by itself again. */
export const INTEREST_OFFERED_KEY = "pl.interest_offered.v1";
/** First page of this tab (session storage), written before the home decides. */
export const ENTRY_KEY = "pl.entry.v1";
export const GUEST_INTEREST_MAX_CATEGORIES = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuestInterest = {
  regionId: string | null;
  categoryIds: string[];
  savedAt: number;
};

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
    return false;
  }
}

/** Removes the key; false when the browser would not (storage blocked). */
function remove(store: KeyValueStore, key: string) {
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function cleanCategories(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (id): id is string => typeof id === "string" && UUID.test(id),
  );
  return [...new Set(ids)].slice(0, GUEST_INTEREST_MAX_CATEGORIES);
}

/** The stored conditions, or null when none were chosen (or the record is bad). */
export function readGuestInterest(store: KeyValueStore): GuestInterest | null {
  const value = readJson(store, GUEST_INTEREST_KEY) as {
    v?: unknown;
    regionId?: unknown;
    categoryIds?: unknown;
    savedAt?: unknown;
  } | null;
  if (!value || value.v !== 1) return null;
  const regionId =
    typeof value.regionId === "string" && UUID.test(value.regionId)
      ? value.regionId
      : null;
  const categoryIds = cleanCategories(value.categoryIds);
  if (!regionId && categoryIds.length === 0) return null;
  return {
    regionId,
    categoryIds,
    savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
  };
}

/**
 * Stores the conditions. Choosing nothing clears them ("전체 분야", no region).
 * Returns false when the browser would not store (or clear) them.
 */
export function saveGuestInterest(
  store: KeyValueStore,
  choice: { regionId: string | null; categoryIds: string[] },
  now: number,
) {
  const regionId =
    choice.regionId && UUID.test(choice.regionId) ? choice.regionId : null;
  const categoryIds = cleanCategories(choice.categoryIds);
  if (!regionId && categoryIds.length === 0)
    return remove(store, GUEST_INTEREST_KEY);
  return writeJson(store, GUEST_INTEREST_KEY, {
    v: 1,
    regionId,
    categoryIds,
    savedAt: now,
  });
}

export function clearGuestInterest(store: KeyValueStore) {
  return remove(store, GUEST_INTEREST_KEY);
}

const sameInterest = (a: GuestInterest, b: GuestInterest) =>
  a.regionId === b.regionId &&
  a.savedAt === b.savedAt &&
  a.categoryIds.length === b.categoryIds.length &&
  a.categoryIds.every((id, i) => id === b.categoryIds[i]);

/**
 * Clears the conditions only if they are still the ones that were moved to
 * the account: a choice saved meanwhile (another tab) is kept.
 * Returns true when cleared.
 */
export function clearGuestInterestIf(
  store: KeyValueStore,
  moved: GuestInterest,
) {
  const current = readGuestInterest(store);
  if (!current || !sameInterest(current, moved)) return false;
  return remove(store, GUEST_INTEREST_KEY);
}

export function markInterestOffered(store: KeyValueStore, now: number) {
  writeJson(store, INTEREST_OFFERED_KEY, { v: 1, at: now });
}

export function wasInterestOffered(store: KeyValueStore) {
  return (
    (readJson(store, INTEREST_OFFERED_KEY) as { v?: unknown } | null)?.v === 1
  );
}

// -------------------------------------------------------------- entry page

export type Entry = { path: string; search: string; referred: boolean };

/** Remembers the first page of this tab; later pages leave it unchanged. */
export function recordEntry(
  store: KeyValueStore,
  page: { path: string; search: string; referrer: string },
) {
  if (readEntry(store)) return;
  writeJson(store, ENTRY_KEY, {
    v: 1,
    path: page.path,
    search: page.search,
    referred: page.referrer !== "",
  });
}

export function readEntry(store: KeyValueStore): Entry | null {
  const value = readJson(store, ENTRY_KEY) as {
    v?: unknown;
    path?: unknown;
    search?: unknown;
    referred?: unknown;
  } | null;
  if (
    value?.v !== 1 ||
    typeof value.path !== "string" ||
    typeof value.search !== "string" ||
    typeof value.referred !== "boolean"
  )
    return null;
  return { path: value.path, search: value.search, referred: value.referred };
}

/**
 * The picker opens by itself only when the service itself is opened for the
 * first time: a guest without conditions, never offered it, on the first visit
 * of this browser, whose tab started on the home with no link parameters and
 * no referring page. Searches, shared links and notifications land on a
 * poster (or carry parameters or a referrer) and are left alone; the home
 * then suggests choosing conditions instead.
 */
export function shouldOfferInterestPicker(input: {
  signedIn: boolean;
  interest: GuestInterest | null;
  offered: boolean;
  firstVisit: boolean;
  entry: Entry | null;
}) {
  const { entry } = input;
  return (
    !input.signedIn &&
    !input.interest &&
    !input.offered &&
    input.firstVisit &&
    entry !== null &&
    entry.path === "/" &&
    (entry.search === "" || entry.search === "?") &&
    !entry.referred
  );
}
