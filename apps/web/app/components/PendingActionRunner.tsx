"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  completePendingActions,
  mergeGuestFavorites,
  rememberMergeNotice,
  type PendingAction,
} from "../../lib/guestStore";
import { trackProductEvent } from "../../lib/productEvents";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../lib/publicPosterVisibility";
import {
  GUEST_MERGED_EVENT,
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

const currentUserId = async () =>
  // Local session only; row-level security checks the account on write.
  (await supabase.auth.getSession()).data.session?.user.id ?? null;

/** Moves this browser's guest favorites into the account (retention plan 2-4). */
async function mergeIntoAccount(userId: string) {
  return mergeGuestFavorites({
    store: guestLocal,
    now: Date.now(),
    existing: async (posterIds) => {
      const { data, error } = await supabase
        .from("favorites")
        .select("poster_id")
        .eq("user_id", userId)
        .in("poster_id", posterIds);
      return error ? null : (data ?? []).map((row) => row.poster_id as string);
    },
    available: async (posterIds) => {
      // Only publicly visible posters, as in the posters_select policy's public
      // branch: an author or admin can also read their non-public posters,
      // and deleted ones would fail the write.
      const { data, error } = await supabase
        .from("posters")
        .select("id")
        .in("id", posterIds)
        .in("poster_status", ["published", "closed"])
        .or(PUBLIC_POSTER_EXPOSURE_FILTER);
      return error ? null : (data ?? []).map((row) => row.id as string);
    },
    upsert: async (posterIds) => {
      const { error } = await supabase.from("favorites").upsert(
        posterIds.map((posterId) => ({ user_id: userId, poster_id: posterId })),
        { onConflict: "user_id,poster_id", ignoreDuplicates: true },
      );
      return !error;
    },
  });
}

/**
 * Finishes what a signed-out person started (찜, 기관 구독) once they are signed
 * in, then returns them to that screen (retention plan 2-3). See
 * completePendingActions: an action is cleared only after its own server write
 * succeeds and only while it is still the stored one. Then moves the
 * browser's guest favorites into the account, clearing them only after the
 * write succeeds; a failure is retried on a later screen.
 */
export default function PendingActionRunner() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const running = useRef(false);
  const mergeFailureLogged = useRef(false);

  useEffect(() => {
    if (WAIT_ON.test(pathname) || running.current) return;
    running.current = true;
    let returnTo: string | null = null;

    void completePendingActions({
      store: guestLocal,
      now: Date.now,
      userId: currentUserId,
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
      .then(async () => {
        const userId = await currentUserId();
        if (!userId) return;
        const result = await mergeIntoAccount(userId);
        if (result.status === "none") return;
        const merged = result.status === "merged";
        if (merged && result.count === 0) {
          // Only posters that are gone: nothing moved; 내 공고 offers removing them.
          window.dispatchEvent(
            new CustomEvent(GUEST_MERGED_EVENT, { detail: { count: 0 } }),
          );
          return;
        }
        if (merged || !mergeFailureLogged.current) {
          mergeFailureLogged.current = !merged;
          trackProductEvent("guest_merge", {
            metadata: {
              previous_count: merged
                ? result.count + result.unavailable
                : result.count,
              duplicate_count: merged ? result.duplicates : 0,
              success: merged,
              logged_in: true,
            },
          });
        }
        if (!merged) return;
        rememberMergeNotice(guestLocal, result.count, Date.now());
        window.dispatchEvent(
          new CustomEvent(GUEST_MERGED_EVENT, {
            detail: { count: result.count },
          }),
        );
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
