"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordEntry } from "../../lib/guestInterest";
import { guestTab } from "../lib/guestSession";
import { recordVisitActivity } from "../lib/visitClock";

// Operator and admin screens are not visits to the service.
const SKIP = /^\/(admin|operator|api|dev)(\/|$)/;

/** Records activity on every page so a 30-minute gap starts a new visit (retention plan 3-2). */
export default function VisitClock() {
  const pathname = usePathname() ?? "";
  useEffect(() => {
    if (SKIP.test(pathname)) return;
    // The first page of this tab decides whether the home may offer the
    // interest picker by itself (UI plan ⑤).
    try {
      recordEntry(guestTab, {
        path: pathname,
        search: window.location.search,
        referrer: document.referrer,
      });
    } catch {
      /* storage blocked */
    }
    void recordVisitActivity().catch(() => undefined);
  }, [pathname]);
  return null;
}
