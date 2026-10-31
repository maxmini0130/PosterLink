"use client";

import { supabase } from "./supabase";
import {
  IDENTITY_LINK_KEY,
  POSTER_NAV_SOURCE_KEY,
  PATH_HISTORY_KEY,
  SIGNUP_INTENT_KEY,
  detectClient,
  fallbackSignupIntent,
  pageTypeFromPath,
  parseNavSource,
  parsePathHistory,
  parseSignupIntent,
  posterIdFromHref,
  previousPathFor,
  pushPathHistory,
  resolvePosterViewSource,
  sanitizeMetadata,
  type PageType,
  type PosterViewSource,
  type ProductEventMetadata,
  type ProductEventName,
  type SignupFeature,
} from "./productEventsCore";
import { getSessionKey, getVisitorKey } from "./visitorIdentity";

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

let linking: string | null = null;
const LINK_RETRY_AT_KEY = "pl.identity_link_retry_at.v1";
const LINK_RETRY_DELAY_MS = 10 * 60 * 1000;

/** Links this browser's anonymous key to the signed-in account once per account. */
export async function syncVisitorIdentity(userId: string) {
  try {
    if (
      linking === userId ||
      localStorage.getItem(IDENTITY_LINK_KEY) === userId ||
      Number(sessionStorage.getItem(LINK_RETRY_AT_KEY) ?? 0) > Date.now()
    )
      return;
  } catch {
    return;
  }
  linking = userId;
  try {
    const intent = readSignupIntent();
    const { data, error } = await supabase.rpc("link_visitor_identity", {
      p_visitor_key: getVisitorKey(),
      p_session_key: getSessionKey(),
      p_client: client(),
      p_screen: intent?.screen ?? null,
      p_feature: intent?.feature ?? null,
    });
    // 'pending' (profile not created yet) retries on the next session check.
    if (error) {
      sessionStorage.setItem(
        LINK_RETRY_AT_KEY,
        String(Date.now() + LINK_RETRY_DELAY_MS),
      );
      return;
    }
    if (data !== "linked" && data !== "signup") return;
    localStorage.setItem(IDENTITY_LINK_KEY, userId);
    localStorage.removeItem(SIGNUP_INTENT_KEY);
  } catch {
    /* retried on the next session check */
  } finally {
    linking = null;
  }
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

export function recordPathHistory(pathname: string) {
  try {
    const history = parsePathHistory(sessionStorage.getItem(PATH_HISTORY_KEY));
    sessionStorage.setItem(
      PATH_HISTORY_KEY,
      JSON.stringify(pushPathHistory(history, pathname)),
    );
  } catch {
    /* storage blocked */
  }
}

/** Reads storage synchronously on detail mount; the order against the layout tracker does not matter. */
export function consumePosterViewSource(posterId: string): PosterViewSource {
  let navSource = null;
  let previousPath: string | null = null;
  try {
    navSource = parseNavSource(sessionStorage.getItem(POSTER_NAV_SOURCE_KEY));
    sessionStorage.removeItem(POSTER_NAV_SOURCE_KEY);
    previousPath = previousPathFor(
      parsePathHistory(sessionStorage.getItem(PATH_HISTORY_KEY)),
      location.pathname,
    );
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
