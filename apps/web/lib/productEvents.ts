"use client";

import { supabase } from "./supabase";
import {
  POSTER_NAV_SOURCE_KEY,
  SIGNUP_INTENT_KEY,
  detectClient,
  fallbackSignupIntent,
  pageTypeFromPath,
  parseNavSource,
  parseSignupIntent,
  posterIdFromHref,
  previousPathFor,
  pushPathHistory,
  resolvePosterViewSource,
  sanitizeMetadata,
  type PageType,
  type PathHistory,
  type PosterViewSource,
  type ProductEventMetadata,
  type ProductEventName,
  type SignupFeature,
} from "./productEventsCore";
import { getSessionKey, getVisitorKey } from "./visitorIdentity";
import { createIdentityLinker } from "./identityLinker";

function client() {
  return detectClient(navigator.userAgent || "");
}

/** Fire-and-forget. Measurement must never interrupt the user's action. */
export function trackProductEvent(
  name: ProductEventName,
  options: {
    posterId?: string | null;
    institutionId?: string | null;
    metadata?: ProductEventMetadata;
  } = {},
) {
  try {
    void supabase
      .rpc("record_product_event", {
        p_event_name: name,
        p_visitor_key: getVisitorKey(),
        p_session_key: getSessionKey(),
        p_client: client(),
        p_poster_id: options.posterId ?? null,
        p_institution_id: options.institutionId ?? null,
        p_metadata: sanitizeMetadata(options.metadata),
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    /* storage or client unavailable */
  }
}

export function currentPageType(): PageType {
  return pageTypeFromPath(window.location.pathname);
}

/** Called where a feature asks the visitor to log in, before navigating to auth. */
export function rememberSignupIntent(screen: PageType, feature: SignupFeature) {
  try {
    localStorage.setItem(
      SIGNUP_INTENT_KEY,
      JSON.stringify({ screen, feature, at: Date.now() }),
    );
  } catch {
    /* storage blocked */
  }
}

export function promptSignup(
  screen: PageType,
  feature: SignupFeature,
  options: { posterId?: string | null; institutionId?: string | null } = {},
) {
  rememberSignupIntent(screen, feature);
  trackProductEvent("signup_prompt_shown", {
    ...options,
    metadata: { screen, feature },
  });
}

function readSignupIntent() {
  try {
    return parseSignupIntent(
      localStorage.getItem(SIGNUP_INTENT_KEY),
      Date.now(),
    );
  } catch {
    return null;
  }
}

/** Login and signup share one start event; signup_complete separates new accounts later. */
export function trackSignupStart(
  authScreen: "login" | "signup",
  method: "email" | "kakao" | "google",
) {
  const now = Date.now();
  const intent =
    readSignupIntent() ??
    fallbackSignupIntent(authScreen, document.referrer, location.origin, now);
  try {
    localStorage.setItem(
      SIGNUP_INTENT_KEY,
      JSON.stringify({ ...intent, at: now }),
    );
  } catch {
    /* storage blocked */
  }
  trackProductEvent("signup_start", {
    metadata: { screen: intent.screen, feature: intent.feature, method },
  });
}

// Storage is read lazily: this module is also evaluated during server rendering.
const lazyStore = (store: () => Storage) => ({
  getItem: (key: string) => store().getItem(key),
  setItem: (key: string, value: string) => store().setItem(key, value),
  removeItem: (key: string) => store().removeItem(key),
});

const identityLinker = createIdentityLinker({
  link: async () => {
    const intent = readSignupIntent();
    return supabase.rpc("link_visitor_identity", {
      p_visitor_key: getVisitorKey(),
      p_session_key: getSessionKey(),
      p_client: client(),
      p_screen: intent?.screen ?? null,
      p_feature: intent?.feature ?? null,
    });
  },
  local: lazyStore(() => window.localStorage),
  session: lazyStore(() => window.sessionStorage),
  now: () => Date.now(),
  setTimer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
  onLinked: () => {
    try {
      localStorage.removeItem(SIGNUP_INTENT_KEY);
    } catch {
      /* storage blocked */
    }
  },
});

/**
 * Links this browser's anonymous key to the signed-in account once per account.
 * Call it again right after the profile row is created; 'pending' results retry
 * on a short backoff.
 */
export function syncVisitorIdentity(userId: string) {
  return identityLinker.sync(userId);
}

export function stopVisitorIdentitySync() {
  identityLinker.signOut();
}

export function rememberPosterNavSource(href: string, source: string) {
  const posterId = posterIdFromHref(href, location.origin);
  if (!posterId) return;
  try {
    sessionStorage.setItem(
      POSTER_NAV_SOURCE_KEY,
      JSON.stringify({ posterId, source, at: Date.now() }),
    );
  } catch {
    /* storage blocked */
  }
}

// Module memory, not sessionStorage: it resets on every full document load, so
// returning from another site is classified by the referrer, not a stale path.
let pathHistory: PathHistory = { current: null, previous: null };

export function recordPathHistory(pathname: string) {
  pathHistory = pushPathHistory(pathHistory, pathname);
}

/** Runs on detail mount; the order against the layout tracker does not matter. */
export function consumePosterViewSource(posterId: string): PosterViewSource {
  let navSource = null;
  const previousPath = previousPathFor(pathHistory, location.pathname);
  try {
    navSource = parseNavSource(sessionStorage.getItem(POSTER_NAV_SOURCE_KEY));
    sessionStorage.removeItem(POSTER_NAV_SOURCE_KEY);
  } catch {
    /* storage blocked */
  }
  return resolvePosterViewSource({
    posterId,
    navSource,
    search: location.search,
    currentPath: location.pathname,
    previousPath,
    referrer: document.referrer,
    origin: location.origin,
    now: Date.now(),
  });
}
