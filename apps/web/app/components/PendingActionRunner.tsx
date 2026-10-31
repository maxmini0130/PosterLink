"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  clearPendingAction,
  readPendingAction,
  type PendingAction,
} from "../../lib/guestStore";
import { trackProductEvent } from "../../lib/productEvents";
import {
  PENDING_ACTION_DONE_EVENT,
  guestLocal,
  type PendingActionDoneDetail,
} from "../lib/guestSession";
import { supabase } from "../lib/supabase";

// Sign-in and onboarding screens come first; the action waits until after them.
const WAIT_ON = /^\/(login|signup|auth|onboarding)(\/|$)/;

async function complete(action: PendingAction, userId: string) {
  // Unique keys make a retry or a concurrent web/app completion a no-op.
  const result =
    action.type === "favorite"
      ? await supabase
          .from("favorites")
          .upsert(
            { user_id: userId, poster_id: action.targetId },
            { onConflict: "user_id,poster_id", ignoreDuplicates: true },
          )
      : await supabase
          .from("institution_follows")
          .upsert(
            { user_id: userId, institution_id: action.targetId },
            { onConflict: "user_id,institution_id", ignoreDuplicates: true },
          );
  return !result.error;
}

/**
 * Finishes what a signed-out person started (찜, 기관 구독) once they are signed
 * in, then returns them to that screen (retention plan 2-3). The stored action
 * is cleared only after the server write succeeds; a failure keeps it for the
 * next screen.
 */
export default function PendingActionRunner() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (WAIT_ON.test(pathname) || running.current) return;
    let action: PendingAction | null = null;
    try {
      action = readPendingAction(guestLocal, Date.now());
    } catch {
      return;
    }
    if (!action) return;
    const pending = action;
    running.current = true;

    void (async () => {
      try {
        // Local session only; row-level security checks the account on write.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return; // still signed out: keep it until they sign in
        if (!(await complete(pending, user.id))) return; // retry on a later screen
        clearPendingAction(guestLocal);
        if (pending.type === "favorite") {
          trackProductEvent("favorite_add", {
            posterId: pending.targetId,
            metadata: {
              screen: "detail",
              logged_in: true,
              feature: "favorite",
            },
          });
          toast.success("찜한 공고를 계정에 보관했어요");
        } else {
          trackProductEvent("institution_follow", {
            institutionId: pending.targetId,
            metadata: { logged_in: true, feature: "follow" },
          });
          toast.success("기관을 구독했어요");
        }
        window.dispatchEvent(
          new CustomEvent<PendingActionDoneDetail>(PENDING_ACTION_DONE_EVENT, {
            detail: { type: pending.type, targetId: pending.targetId },
          }),
        );
        const here = `${window.location.pathname}${window.location.search}`;
        if (here !== pending.returnTo) router.replace(pending.returnTo);
      } finally {
        running.current = false;
      }
    })();
  }, [pathname, router]);

  return null;
}
