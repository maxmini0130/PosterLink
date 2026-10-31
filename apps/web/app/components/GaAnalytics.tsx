"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";
import {
  analyticsConfigured,
  consumeAuthReceipt,
  setAnalyticsLoginStatus,
  trackPageView,
  syncAnalyticsConsentFromStorage,
} from "../../lib/analytics";

export default function GaAnalytics() {
  const path = usePathname();
  const query = useSearchParams();
  useEffect(() => {
    if (!analyticsConfigured()) return;
    window.addEventListener("storage", syncAnalyticsConsentFromStorage);
    let active = true;
    // Session restoration updates status only; it is never a login conversion.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setAnalyticsLoginStatus(Boolean(data.session));
      })
      .catch(() => {});
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setAnalyticsLoginStatus(Boolean(session)),
    );
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("storage", syncAnalyticsConsentFromStorage);
    };
  }, []);
  useEffect(() => {
    const measure = () => {
      trackPageView();
      consumeAuthReceipt();
    };
    measure();
    window.addEventListener("pl:analytics-consent", measure);
    return () => window.removeEventListener("pl:analytics-consent", measure);
  }, [path, query]);
  return null;
}
