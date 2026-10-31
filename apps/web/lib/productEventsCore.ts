/** Pure helpers for first-party product events. Mirrors the record_product_event allowlist. */

export type ProductEventName =
  | "favorite_add"
  | "favorite_remove"
  | "institution_follow"
  | "institution_unfollow"
  | "interest_save"
  | "apply_status_set"
  | "share_click"
  | "signup_prompt_shown"
  | "signup_start"
  | "guest_merge";

export type PageType =
  | "home"
  | "list"
  | "detail"
  | "region"
  | "category"
  | "institution"
  | "favorites"
  | "notifications"
  | "mypage"
  | "onboarding"
  | "login"
  | "signup"
  | "other";

export type SignupFeature =
  | "favorite"
  | "follow"
  | "interest"
  | "alert"
  | "banner"
  | "header"
  | "direct";

export type PosterViewSource =
  | "search"
  | "home"
  | "related"
  | "institution"
  | "favorites"
  | "list"
  | "notification"
  | "share"
  | "external"
  | "direct"
  | "other";

export type ProductClient = "web" | "app";

export type ProductEventMetadata = Partial<
  Record<
    | "screen"
    | "feature"
    | "method"
    | "logged_in"
    | "channel"
    | "status"
    | "region_id"
    | "category_count"
    | "previous_count"
    | "duplicate_count"
    | "success",
    string | number | boolean | null | undefined
  >
>;

export type SignupIntent = {
  screen: PageType;
  feature: SignupFeature;
  at: number;
};

export const SIGNUP_INTENT_KEY = "pl.signup_intent.v1";
export const POSTER_NAV_SOURCE_KEY = "pl.poster_nav_source.v1";
export const IDENTITY_LINK_KEY = "pl.identity_link.v1";
/** Long enough for an OAuth round trip, short enough not to credit an old prompt. */
export const SIGNUP_INTENT_TTL_MS = 60 * 60 * 1000;
const NAV_SOURCE_TTL_MS = 60 * 1000;
export const SHARE_CAMPAIGN = "pl_share";

const SIGNUP_FEATURES = new Set<SignupFeature>([
  "favorite",
  "follow",
  "interest",
  "alert",
  "banner",
  "header",
  "direct",
]);
const PAGE_TYPES = new Set<PageType>([
  "home",
  "list",
  "detail",
  "region",
  "category",
  "institution",
  "favorites",
  "notifications",
  "mypage",
  "onboarding",
  "login",
  "signup",
  "other",
]);
export const POSTER_VIEW_SOURCES = new Set<PosterViewSource>([
  "search",
  "home",
  "related",
  "institution",
  "favorites",
  "list",
  "notification",
  "share",
  "external",
  "direct",
  "other",
]);
const METADATA_KEYS = new Set([
  "screen",
  "feature",
  "method",
  "logged_in",
  "channel",
  "status",
  "region_id",
  "category_count",
  "previous_count",
  "duplicate_count",
  "success",
]);
const UUID_PATH =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function pageTypeFromPath(pathname: string): PageType {
  if (pathname === "/" || pathname === "") return "home";
  if (new RegExp(`^/posters/${UUID_PATH}/?$`, "i").test(pathname))
    return "detail";
  if (/^\/posters\/?$/.test(pathname)) return "list";
  const first = pathname.split("/")[1];
  switch (first) {
    case "regions":
      return "region";
    case "categories":
      return "category";
    case "institutions":
      return "institution";
    case "favorites":
      return "favorites";
    case "notifications":
      return "notifications";
    case "mypage":
      return "mypage";
    case "onboarding":
      return "onboarding";
    case "login":
      return "login";
    case "signup":
      return "signup";
    default:
      return "other";
  }
}

/** Drops unknown keys and values the RPC would reject instead of losing the whole event. */
export function sanitizeMetadata(metadata: ProductEventMetadata = {}) {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!METADATA_KEYS.has(key) || value == null) continue;
    if (typeof value === "boolean") safe[key] = value;
    else if (typeof value === "number" && Number.isFinite(value))
      safe[key] = value;
    else if (typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value))
      safe[key] = value;
  }
  return safe;
}

export function detectClient(userAgent: string): ProductClient {
  return /\bPosterLinkApp\//.test(userAgent) ? "app" : "web";
}

export function parseSignupIntent(
  raw: string | null,
  now: number,
): SignupIntent | null {
  try {
    const value = JSON.parse(raw || "null");
    if (
      !value ||
      !PAGE_TYPES.has(value.screen) ||
      !SIGNUP_FEATURES.has(value.feature) ||
      typeof value.at !== "number" ||
      now - value.at > SIGNUP_INTENT_TTL_MS ||
      value.at > now + 60_000
    )
      return null;
    return value as SignupIntent;
  } catch {
    return null;
  }
}

/** Fallback origin when the user reached login/signup without a tracked prompt. */
export function fallbackSignupIntent(
  authScreen: "login" | "signup",
  referrer: string,
  origin: string,
  now: number,
): SignupIntent {
  let screen: PageType = authScreen;
  try {
    const url = new URL(referrer);
    if (url.origin === origin) {
      const type = pageTypeFromPath(url.pathname);
      if (type !== "login" && type !== "signup") screen = type;
    }
  } catch {
    /* empty or invalid referrer */
  }
  return { screen, feature: "direct", at: now };
}

type NavSource = { posterId: string; source: PosterViewSource; at: number };

export function parseNavSource(raw: string | null): NavSource | null {
  try {
    const value = JSON.parse(raw || "null");
    if (
      !value ||
      typeof value.posterId !== "string" ||
      !POSTER_VIEW_SOURCES.has(value.source) ||
      typeof value.at !== "number"
    )
      return null;
    return value as NavSource;
  } catch {
    return null;
  }
}

export function posterIdFromHref(href: string, origin: string) {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return (
      url.pathname.match(new RegExp(`^/posters/(${UUID_PATH})/?$`, "i"))?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

export const PATH_HISTORY_KEY = "pl.path_history.v1";

export type PathHistory = { current: string | null; previous: string | null };

export function parsePathHistory(raw: string | null): PathHistory {
  try {
    const value = JSON.parse(raw || "null");
    const path = (x: unknown) =>
      typeof x === "string" && x.startsWith("/") ? x : null;
    return { current: path(value?.current), previous: path(value?.previous) };
  } catch {
    return { current: null, previous: null };
  }
}

export function pushPathHistory(
  history: PathHistory,
  pathname: string,
): PathHistory {
  return history.current === pathname
    ? history
    : { current: pathname, previous: history.current };
}

/** Works whether the layout tracker has already recorded the current path or not. */
export function previousPathFor(history: PathHistory, currentPath: string) {
  return history.current === currentPath ? history.previous : history.current;
}

function sourceFromPageType(type: PageType): PosterViewSource {
  switch (type) {
    case "list":
      return "search";
    case "home":
      return "home";
    case "institution":
      return "institution";
    case "favorites":
      return "favorites";
    case "notifications":
      return "notification";
    case "detail":
      return "related";
    case "region":
    case "category":
      return "list";
    default:
      return "other";
  }
}

/**
 * A card click recorded just before navigation wins. Client-side navigation does
 * not update document.referrer, so the previous in-app path comes next, then the
 * referrer of a full page load.
 */
export function resolvePosterViewSource(input: {
  posterId: string;
  navSource: NavSource | null;
  search: string;
  currentPath: string;
  previousPath: string | null;
  referrer: string;
  origin: string;
  now: number;
}): PosterViewSource {
  const nav = input.navSource;
  if (
    nav &&
    nav.posterId.toLowerCase() === input.posterId.toLowerCase() &&
    input.now - nav.at >= 0 &&
    input.now - nav.at <= NAV_SOURCE_TTL_MS
  )
    return nav.source;
  const params = new URLSearchParams(input.search);
  if (params.get("utm_campaign") === SHARE_CAMPAIGN) return "share";
  if (params.get("notification_open") === "1") return "notification";
  if (input.previousPath && input.previousPath !== input.currentPath)
    return sourceFromPageType(pageTypeFromPath(input.previousPath));
  if (!input.referrer) return "direct";
  try {
    const referrer = new URL(input.referrer);
    if (referrer.origin !== input.origin) return "external";
    return sourceFromPageType(pageTypeFromPath(referrer.pathname));
  } catch {
    return "other";
  }
}

export function shareUrl(href: string) {
  const url = new URL(href);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  url.searchParams.set("utm_campaign", SHARE_CAMPAIGN);
  return url.toString();
}
