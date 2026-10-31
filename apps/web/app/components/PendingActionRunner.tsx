"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  completePendingActions,
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
 * in, then returns them to that screen (retention plan 2-3). See
 * completePendingActions: an action is cleared only after its own server write
 * succeeds and only while it is still the stored one.
 */
export default function PendingActionRunner() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (WAIT_ON.test(pathname) || running.current) return;
    running.current = true;
    let returnTo: string | null = null;

    void completePendingActions({
      store: guestLocal,
      now: Date.now,
      // Local session only; row-level security checks the account on write.
      userId: async () =>
        (await supabase.auth.getSession()).data.session?.user.id ?? null,
      complete,
      onDone: (action, current) => {
        // The account now has it either way; keep the screen in step.
        window.dispatchEvent(
          new CustomEvent<PendingActionDoneDetail>(PENDING_ACTION_DONE_EVENT, {
            detail: { type: action.type, targetId: action.targetId },
          }),
        );
        if (!current) return; // replaced meanwhile: the newer action decides
        if (action.type === "favorite") {
          trackProductEvent("favorite_add", {
            posterId: action.targetId,
            metadata: {
              screen: "detail",
              logged_in: true,
              feature: "favorite",
            },
          });
          toast.success("찜한 공고를 계정에 보관했어요");
        } else {
          trackProductEvent("institution_follow", {
            institutionId: action.targetId,
            metadata: { logged_in: true, feature: "follow" },
          });
          toast.success("기관을 구독했어요");
        }
        returnTo = action.returnTo;
      },
    })
      .catch(() => undefined) // storage or network failure: retried on a later screen
      .finally(() => {
        running.current = false;
        const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (returnTo && here !== returnTo) router.replace(returnTo);
      });
  }, [pathname, router]);

  return null;
}
