"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import {
  currentPageType,
  rememberPosterNavSource,
  recordPathHistory,
  rememberSignupIntent,
  stopVisitorIdentitySync,
  syncVisitorIdentity,
} from "../../lib/productEvents";
import type { SignupFeature } from "../../lib/productEventsCore";

const SIGNUP_FEATURES = new Set([
  "favorite",
  "follow",
  "interest",
  "alert",
  "banner",
  "header",
  "direct",
]);

/**
 * Links the anonymous visitor key to the account on every signed-in session and
 * records click origins declared with data-poster-source / data-signup-feature,
 * so server components can opt in without becoming client components.
 */
export default function ProductEventsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && data.session?.user)
          void syncVisitorIdentity(data.session.user.id);
      })
      .catch(() => {});
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void syncVisitorIdentity(session.user.id);
      else stopVisitorIdentitySync();
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const posterLink = target?.closest<HTMLAnchorElement>(
        "a[data-poster-source]",
      );
      if (posterLink)
        rememberPosterNavSource(
          posterLink.href,
          posterLink.dataset.posterSource || "other",
        );
      const signupLink = target?.closest<HTMLElement>("[data-signup-feature]");
      const feature = signupLink?.dataset.signupFeature;
      if (feature && SIGNUP_FEATURES.has(feature)) {
        rememberSignupIntent(currentPageType(), feature as SignupFeature);
      }
    };
    document.addEventListener("click", onClick, true);

    return () => {
      active = false;
      subscription.unsubscribe();
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (pathname) recordPathHistory(pathname);
  }, [pathname]);

  return null;
}
