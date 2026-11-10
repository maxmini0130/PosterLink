"use client";

import {
  BROWSE_REGION_EVENT,
  browseRegionOwner,
  readBrowseRegion,
  saveBrowseRegion,
  type BrowseRegion,
} from "../../lib/browseRegion";
import { readGuestInterest } from "../../lib/guestInterest";
import { guestLocal } from "./guestSession";
import { supabase } from "./supabase";

/**
 * The browsed region ("둘러보는 지역") in this browser. Choosing one never
 * writes the profile region or the guest's interest conditions; those only
 * give the first default.
 */

export function readStoredBrowseRegion(userId: string | null) {
  try {
    return readBrowseRegion(guestLocal, browseRegionOwner(userId));
  } catch {
    return null;
  }
}

/** Stores the choice and tells other mounted screens; false if not kept. */
export function chooseBrowseRegion(
  userId: string | null,
  region: BrowseRegion,
) {
  let saved = false;
  try {
    saved = saveBrowseRegion(
      guestLocal,
      browseRegionOwner(userId),
      region,
      Date.now(),
    );
  } catch {
    saved = false;
  }
  try {
    window.dispatchEvent(
      new CustomEvent<BrowseRegion>(BROWSE_REGION_EVENT, { detail: region }),
    );
  } catch {
    /* no window */
  }
  return saved;
}

/**
 * For screens other than the home: the browsed region id, or the default
 * (the member's profile region, or the guest's interest region), or null
 * (서울 전체 on the server).
 */
export async function loadBrowseRegionId(): Promise<string | null> {
  const userId =
    (await supabase.auth.getSession()).data.session?.user.id ?? null;
  const stored = readStoredBrowseRegion(userId);
  if (stored) return stored.regionId;
  if (!userId) {
    try {
      return readGuestInterest(guestLocal)?.regionId ?? null;
    } catch {
      return null;
    }
  }
  const { data } = await supabase
    .from("profiles")
    .select("primary_region_id")
    .eq("id", userId)
    .maybeSingle();
  return (
    (data as { primary_region_id?: string | null } | null)?.primary_region_id ??
    null
  );
}
