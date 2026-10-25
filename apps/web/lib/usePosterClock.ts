"use client";
import { useEffect, useState } from "react";

/** Recompute on wake/focus and each minute, including KST midnight. */
export function usePosterClock() {
  const [now, setNow] = useState<Date | undefined>();
  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return now;
}
