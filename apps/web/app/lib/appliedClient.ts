"use client";
/**
 * Browser wiring for "신청했어요" (docs/design/v6.1/SPEC.md 5). Guests: this
 * browser (lib/appliedPosters.ts). Members: favorites.user_status = 'applied';
 * a favourite row created only by a mark is removed again on undo, so the
 * 찜 state stays what it was before.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { guestLocal } from "./guestSession";
import {
  addGuestApplied,
  readCreatedByApply,
  readGuestApplied,
  removeGuestApplied,
  setCreatedByApply,
} from "../../lib/appliedPosters";
import { trackProductEvent } from "../../lib/productEvents";

export const APPLIED_CHANGE_EVENT = "pl:applied-change";

export type AppliedChange = {
  posterId: string;
  applied: boolean;
  /** For members: whether the poster is a favourite after the change. */
  favorite?: boolean;
};

async function currentUserId() {
  return (await supabase.auth.getSession()).data.session?.user.id ?? null;
}

function announce(change: AppliedChange) {
  window.dispatchEvent(
    new CustomEvent(APPLIED_CHANGE_EVENT, { detail: change }),
  );
}

/** Poster ids this person marked as applied; null when the lookup failed. */
export async function loadAppliedIds(): Promise<Set<string> | null> {
  const userId = await currentUserId();
  if (!userId)
    return new Set(readGuestApplied(guestLocal).map((item) => item.posterId));
  const { data, error } = await supabase
    .from("favorites")
    .select("poster_id")
    .eq("user_id", userId)
    .eq("user_status", "applied");
  if (error) return null;
  return new Set((data ?? []).map((row) => row.poster_id as string));
}

export async function markApplied(
  posterId: string,
  screen: string,
): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) {
    if (!addGuestApplied(guestLocal, posterId, Date.now())) return false;
    trackProductEvent("apply_status_set", {
      posterId,
      metadata: { screen, status: "applied", logged_in: false },
    });
    announce({ posterId, applied: true });
    return true;
  }
  const existing = await supabase
    .from("favorites")
    .select("poster_id")
    .eq("user_id", userId)
    .eq("poster_id", posterId)
    .maybeSingle();
  if (existing.error) return false;
  const { error } = await supabase.from("favorites").upsert(
    {
      user_id: userId,
      poster_id: posterId,
      user_status: "applied",
      user_status_updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,poster_id" },
  );
  if (error) return false;
  if (!existing.data) setCreatedByApply(guestLocal, posterId, true);
  trackProductEvent("apply_status_set", {
    posterId,
    metadata: { screen, status: "applied", logged_in: true },
  });
  announce({ posterId, applied: true, favorite: true });
  return true;
}

export async function unmarkApplied(
  posterId: string,
  screen: string,
): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) {
    if (!removeGuestApplied(guestLocal, posterId)) return false;
    trackProductEvent("apply_status_set", {
      posterId,
      metadata: { screen, status: "interested", logged_in: false },
    });
    announce({ posterId, applied: false });
    return true;
  }
  const createdByMark = readCreatedByApply(guestLocal).has(posterId);
  const { error } = createdByMark
    ? await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("poster_id", posterId)
    : await supabase
        .from("favorites")
        .update({
          user_status: "interested",
          user_status_updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("poster_id", posterId);
  if (error) return false;
  setCreatedByApply(guestLocal, posterId, false);
  trackProductEvent("apply_status_set", {
    posterId,
    metadata: { screen, status: "interested", logged_in: true },
  });
  announce({ posterId, applied: false, favorite: !createdByMark });
  return true;
}

/**
 * Moves this browser's marks into the account at sign-in. Posters the account
 * did not have as favourites are remembered as created by the mark.
 */
export async function mergeGuestApplied(userId: string) {
  const items = readGuestApplied(guestLocal);
  if (!items.length) return { merged: 0 };
  const ids = items.map((item) => item.posterId);
  const owned = await supabase
    .from("favorites")
    .select("poster_id")
    .eq("user_id", userId)
    .in("poster_id", ids);
  if (owned.error) return { merged: 0, failed: true };
  const already = new Set(
    (owned.data ?? []).map((row) => row.poster_id as string),
  );
  const { error } = await supabase.from("favorites").upsert(
    items.map((item) => ({
      user_id: userId,
      poster_id: item.posterId,
      user_status: "applied",
      user_status_updated_at: new Date(item.appliedAt).toISOString(),
    })),
    { onConflict: "user_id,poster_id" },
  );
  if (error) return { merged: 0, failed: true };
  for (const item of items) {
    if (!already.has(item.posterId))
      setCreatedByApply(guestLocal, item.posterId, true);
    removeGuestApplied(guestLocal, item.posterId);
  }
  return { merged: items.length };
}

/** The marks on screen, kept in step with changes anywhere on the page. */
export function useAppliedPosters() {
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void loadAppliedIds().then((ids) => {
      if (!active) return;
      if (ids) setApplied(ids);
      setReady(true);
    });
    const onChange = (event: Event) => {
      const change = (event as CustomEvent<AppliedChange>).detail;
      if (!change?.posterId) return;
      setApplied((current) => {
        const next = new Set(current);
        if (change.applied) next.add(change.posterId);
        else next.delete(change.posterId);
        return next;
      });
    };
    window.addEventListener(APPLIED_CHANGE_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(APPLIED_CHANGE_EVENT, onChange);
    };
  }, []);
  const has = useCallback(
    (posterId: string) => applied.has(posterId),
    [applied],
  );
  return { applied, has, ready };
}
