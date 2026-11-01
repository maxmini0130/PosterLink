"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordVisitActivity } from "../lib/visitClock";

// Operator and admin screens are not visits to the service.
const SKIP = /^\/(admin|operator|api|dev)(\/|$)/;

/** Records activity on every page so a 30-minute gap starts a new visit (retention plan 3-2). */
export default function VisitClock() {
  const pathname = usePathname() ?? "";
  useEffect(() => {
    if (SKIP.test(pathname)) return;
    void recordVisitActivity().catch(() => undefined);
  }, [pathname]);
  return null;
}
