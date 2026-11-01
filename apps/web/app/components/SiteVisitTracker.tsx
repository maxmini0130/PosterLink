"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { publicAnalyticsPath, sanitizedVisitQuery, safeReferrer } from "../../lib/analyticsPrivacy";
import { getSessionKey, getVisitorKey } from "../../lib/visitorIdentity";

const AUTOMATION_SOURCE_KEY = "posterlink.automation_source";

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

    if (!publicAnalyticsPath(pathname)) return;
    const queryString = sanitizedVisitQuery(searchParams);
    const trackingKey = `${pathname}?${queryString}`;
    if (lastTrackedRef.current === trackingKey) return;
    lastTrackedRef.current = trackingKey;

    const payload = {
      visitor_key: getVisitorKey(),
      session_key: getSessionKey(),
      path: pathname,
      query_string: queryString ? `?${queryString}` : null,
      referrer_url: safeReferrer(document.referrer),
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
