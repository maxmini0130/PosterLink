"use client";

import { installAnalyticsTransportGuard } from "./analyticsTransport";

import {
  campaignQuery,
  publicAnalyticsPath,
  safeReferrer,
  UUID,
} from "./analyticsPrivacy";
export type AnalyticsEvent =
  | "page_view"
  | "view_poster"
  | "sign_up"
  | "login"
  | "save_poster"
  | "unsave_poster"
  | "follow_institution"
  | "unfollow_institution"
  | "enable_notification"
  | "click_application"
  | "search_poster"
  | "filter_poster";
type Params = Record<string, string | number | boolean | null | undefined>;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}
export const CONSENT_KEY = "pl.analytics.consent.v1";
export const AUTH_RECEIPT = "pl_analytics_auth";
let lastPage: string | null = null;
let initialized = false;
let consentRevoked = false;
let loginStatus = "unknown";
let lastSafePage = "";
const FIRST = "pl.analytics.first.v1",
  SESSION = "pl.analytics.session.v1";
const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
export function analyticsConfigured() {
  return (
    /^G-[A-Z0-9]+$/.test(measurementId) &&
    process.env.NEXT_PUBLIC_GA_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_GA_POLICY_REVIEWED === "true" &&
    (process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ||
      process.env.NEXT_PUBLIC_GA_ALLOW_NON_PRODUCTION === "true")
  );
}
export function analyticsConsented() {
  try {
    return (
      analyticsConfigured() &&
      localStorage.getItem(CONSENT_KEY) === "granted" &&
      !consentRevoked
    );
  } catch {
    return false;
  }
}
export function setAnalyticsConsent(granted: boolean) {
  // A failed storage write must not reopen a loaded SDK after withdrawal.
  consentRevoked = !granted;
  const attempt = (action: () => void) => {
    try {
      action();
    } catch {
      /* One blocked store/SDK must not prevent withdrawal. */
    }
  };
  // Stop an already loaded SDK before issuing its consent command, which can throw.
  attempt(() => {
    (window as unknown as Record<string, unknown>)[
      `ga-disable-${measurementId}`
    ] = !granted;
  });
  let previouslyGranted = false;
  try {
    previouslyGranted = localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    /* Deny by default when storage is blocked. */
  }
  attempt(() =>
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied"),
  );
  attempt(() => {
    document.cookie = `pl_analytics_consent=${granted ? "granted" : "denied"}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === "https:" ? "; Secure" : ""}`;
  });
  attempt(() => {
    // Do not update an independently installed Google tag that this module does not own.
    if (initialized) {
      window.gtag?.("consent", "update", {
        analytics_storage: granted ? "granted" : "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    }
  });
  if (!granted) {
    lastPage = null;
    lastSafePage = "";
    attempt(() => {
      for (const item of document.cookie.split(";")) {
        const name = item.trim().split("=")[0];
        if (!/^_ga(?:_|$)/.test(name)) continue;
        for (const domain of [
          "",
          location.hostname,
          "." + location.hostname,
          ".posterlink.kr",
        ])
          document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domain ? "; Domain=" + domain : ""}`;
      }
    });
    attempt(() => localStorage.removeItem(FIRST));
    attempt(() => sessionStorage.removeItem(SESSION));
    attempt(() => {
      document.cookie = `${AUTH_RECEIPT}=; Path=/; Max-Age=0; SameSite=Lax`;
    });
  } else if (!previouslyGranted) lastPage = null;
  attempt(() => {
    window.dispatchEvent(new Event("pl:analytics-consent"));
  });
}
export function syncAnalyticsConsentFromStorage(
  event: Pick<StorageEvent, "key" | "newValue">,
) {
  if (event.key === CONSENT_KEY || event.key === null) {
    setAnalyticsConsent(
      event.key === CONSENT_KEY && event.newValue === "granted",
    );
  }
}
function attribution() {
  const now = Date.now();
  const query = campaignQuery(location.search);
  const incoming = {
    source:
      query.get("utm_source") ||
      (safeReferrer(document.referrer)
        ? new URL(safeReferrer(document.referrer)!).hostname.replace(
            /^www\./,
            "",
          )
        : "direct"),
    medium: query.get("utm_medium") || "none",
    campaign: query.get("utm_campaign") || "none",
    content: query.get("utm_content") || "none",
    term: query.get("utm_term") || "none",
  };
  try {
    // Validate stored attribution too; storage is not a trusted input.
    const read = (text: string | null) => {
      const x = JSON.parse(text || "null");
      if (
        !x ||
        typeof x.at !== "number" ||
        !x.value ||
        !Object.values(x.value).every(
          (v) =>
            typeof v === "string" &&
            /^[a-z0-9_.-]{1,80}$/i.test(v) &&
            !/\d{7}/.test(v),
        )
      )
        return null;
      return x as { at: number; value: typeof incoming };
    };
    let first = read(localStorage.getItem(FIRST));
    if (!first) {
      first = { at: now, value: incoming };
      localStorage.setItem(FIRST, JSON.stringify(first));
    }
    let session = read(sessionStorage.getItem(SESSION));
    if (!session || now - session.at > 30 * 60 * 1000)
      session = { at: now, value: incoming };
    session.at = now;
    sessionStorage.setItem(SESSION, JSON.stringify(session));
    return Object.fromEntries([
      ...["source", "medium", "campaign", "content", "term"].map((k) => [
        `first_${k}`,
        first!.value[k as keyof typeof incoming],
      ]),
      ...["source", "medium", "campaign", "content", "term"].map((k) => [
        `session_${k}`,
        session!.value[k as keyof typeof incoming],
      ]),
    ]);
  } catch {
    return {};
  }
}
export function setAnalyticsLoginStatus(loggedIn: boolean) {
  loginStatus = loggedIn ? "logged_in" : "anonymous";
}
function initialize() {
  if (initialized) return true;
  // Never install alongside an independently installed GTM/Google tag.
  if (
    window.gtag ||
    document.querySelector('script[src*="googletagmanager.com"]')
  )
    return false;
  installAnalyticsTransportGuard(measurementId, analyticsConsented);
  window.dataLayer = [];
  window.gtag = function () {
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_to: measurementId,
    page_location:
      location.origin + (publicAnalyticsPath(location.pathname) || "/"),
    page_referrer: safeReferrer(document.referrer) || "",
    page_title: "PosterLink",
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.id = "posterlink-ga4";
  script.onerror = () => {
    /* No service dependency on analytics delivery. */
  };
  document.head.appendChild(script);
  initialized = true;
  return true;
}
const events = new Set([
  "page_view",
  "view_poster",
  "sign_up",
  "login",
  "save_poster",
  "unsave_poster",
  "follow_institution",
  "unfollow_institution",
  "enable_notification",
  "click_application",
  "search_poster",
  "filter_poster",
]);
const allowed = new Set([
  "poster_id",
  "poster_category",
  "poster_region",
  "institution_id",
  "search_category",
  "search_region",
  "application_channel",
  "method",
  "filter_type",
  "include_closed",
  "sort",
  "user_login_status",
]);
export function trackAnalytics(name: AnalyticsEvent, params: Params = {}) {
  try {
    const path = publicAnalyticsPath(location.pathname);
    const detailId = path?.match(/^\/posters\/([0-9a-f-]{36})$/i)?.[1];
    if (
      detailId &&
      !document.querySelector(`[data-analytics-poster-id="${detailId}"]`)
    )
      return false;
    if (!events.has(name) || !analyticsConsented() || !path || !initialize())
      return false;
    const safe: Params = {};
    for (const [key, value] of Object.entries(params)) {
      if (!allowed.has(key) || value == null) continue;
      if (
        [
          "poster_id",
          "poster_category",
          "poster_region",
          "institution_id",
          "search_category",
          "search_region",
        ].includes(key)
      ) {
        if (typeof value === "string" && (UUID.test(value) || value === "all"))
          safe[key] = value;
      } else if (
        typeof value === "boolean" ||
        (typeof value === "string" && /^[a-z_]{1,32}$/.test(value))
      )
        safe[key] = value;
    }
    window.gtag!("event", name, {
      ...attribution(),
      ...safe,
      user_login_status: loginStatus,
      send_to: measurementId,
      page_location:
        location.origin +
        path +
        (name === "page_view" && campaignQuery(location.search).size
          ? "?" + campaignQuery(location.search).toString()
          : ""),
      page_referrer: lastSafePage || safeReferrer(document.referrer) || "",
      page_title: "PosterLink",
      transport_type: "beacon",
      ...(process.env.NEXT_PUBLIC_GA_DEBUG === "true"
        ? { debug_mode: true }
        : {}),
    });
    return true;
  } catch {
    return false;
  }
}
export function trackPageView() {
  const path = publicAnalyticsPath(location.pathname);
  // Raw query/hash never participate in the page-view identity or payload.
  if (!path) {
    lastPage = null;
    return;
  }
  if (path === lastPage) return;
  if (trackAnalytics("page_view")) {
    lastPage = path;
    lastSafePage = location.origin + path;
    const id = path.match(/^\/posters\/([0-9a-f-]{36})$/i)?.[1];
    const detail = id
      ? document.querySelector<HTMLElement>(
          `[data-analytics-poster-id="${id}"]`,
        )
      : null;
    if (detail)
      trackAnalytics("view_poster", {
        poster_id: id,
        poster_category: detail.dataset.analyticsCategory,
        poster_region: detail.dataset.analyticsRegion,
      });
  }
}
export function consumeAuthReceipt() {
  try {
    const raw = document.cookie
      .split("; ")
      .find((x) => x.startsWith(AUTH_RECEIPT + "="))
      ?.split("=")[1];
    if (!raw) return;
    document.cookie = `${AUTH_RECEIPT}=; Path=/; Max-Age=0; SameSite=Lax`;
    const receipt = JSON.parse(decodeURIComponent(raw));
    if (
      !analyticsConsented() ||
      !["kakao", "google", "naver", "email"].includes(receipt.method) ||
      typeof receipt.at !== "number" ||
      Math.abs(Date.now() - receipt.at) > 300000
    )
      return;
    setAnalyticsLoginStatus(true);
    if (receipt.signup === true)
      trackAnalytics("sign_up", { method: receipt.method });
    trackAnalytics("login", { method: receipt.method });
  } catch {
    /* No replay on malformed receipt or disabled storage. */
  }
}
