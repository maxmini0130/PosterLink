"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { notePageShown } from "../lib/inSiteHistory";

/**
 * Counts the pages shown in this document (app/lib/inSiteHistory.ts). Only
 * path changes count: a page that rewrites its own query string (filters)
 * has not been left.
 */
export default function InSiteHistoryTracker() {
  const pathname = usePathname();
  useEffect(() => {
    notePageShown();
  }, [pathname]);
  return null;
}
