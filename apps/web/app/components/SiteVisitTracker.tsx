"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VISITOR_KEY = "posterlink.visitor_key";
const SESSION_KEY = "posterlink.session_key";
const AUTOMATION_SOURCE_KEY = "posterlink.automation_source";

function createKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getStoredKey(storage: Storage, key: string) {
  let value = storage.getItem(key);
  if (!value) {
    value = createKey();
    storage.setItem(key, value);
  }
  return value;
}

function getVisitorKey() {
  try {
    return getStoredKey(window.localStorage, VISITOR_KEY);
  } catch {
    return createKey();
  }
}

function getSessionKey() {
  try {
    return getStoredKey(window.sessionStorage, SESSION_KEY);
  } catch {
    return createKey();
  }
}

function getAutomationSource(searchParams: URLSearchParams) {
  const querySource = searchParams.get("_pl_automation")?.trim().slice(0, 80);
  try {
    if (querySource) {
      window.sessionStorage.setItem(AUTOMATION_SOURCE_KEY, querySource);
      return querySource;
    }
    return window.sessionStorage.getItem(AUTOMATION_SOURCE_KEY);
  } catch {
    return querySource || null;
  }
}

function shouldTrackPath(pathname: string) {
  return (
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next")
  );
}

export default function SiteVisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !shouldTrackPath(pathname)) return;

    const queryString = searchParams.toString();
    const trackingKey = `${pathname}?${queryString}`;
    if (lastTrackedRef.current === trackingKey) return;
    lastTrackedRef.current = trackingKey;

    const payload = {
      visitor_key: getVisitorKey(),
      session_key: getSessionKey(),
      path: pathname,
      query_string: queryString ? `?${queryString}` : null,
      referrer_url: document.referrer || null,
      user_agent: navigator.userAgent || null,
      webdriver: navigator.webdriver === true,
      automation_source: getAutomationSource(searchParams),
    };
    const body = JSON.stringify(payload);

    if ("sendBeacon" in navigator) {
      const sent = navigator.sendBeacon(
        "/api/site-visits",
        new Blob([body], { type: "application/json" })
      );
      if (sent) return;
    }

    fetch("/api/site-visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [pathname, searchParams]);

  return null;
}
