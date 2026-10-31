"use client";

import {
  addGuestFavorite,
  hasGuestFavorite,
  removeGuestFavorite,
  setPendingAction,
  type KeyValueStore,
  type PendingAction,
} from "../../lib/guestStore";
import { trackSignupStart } from "../../lib/productEvents";
import { supabase } from "./supabase";

/** localStorage, resolved lazily so module evaluation during SSR is safe. */
export const guestLocal: KeyValueStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

export const isGuestFavorite = (posterId: string) =>
  typeof window !== "undefined" && hasGuestFavorite(guestLocal, posterId);
export const saveGuestFavorite = (posterId: string) =>
  addGuestFavorite(guestLocal, posterId, Date.now());
export const forgetGuestFavorite = (posterId: string) =>
  removeGuestFavorite(guestLocal, posterId);

/** Fired by PendingActionRunner after it completes an action for the account. */
export const PENDING_ACTION_DONE_EVENT = "pl:pending-action-done";
export type PendingActionDoneDetail = Pick<PendingAction, "type" | "targetId">;

/**
 * Remembers what the person was doing, then starts Kakao sign-in that returns
 * to the same screen. PendingActionRunner finishes the action after sign-in,
 * even if the return path is lost (onboarding, app WebView).
 */
export async function continueWithKakao(
  action: Omit<PendingAction, "createdAt">,
) {
  setPendingAction(guestLocal, action, Date.now());
  trackSignupStart("login", "kakao");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(action.returnTo)}`,
      scopes: "profile_nickname profile_image",
    },
  });
  return error;
}

/** Same as continueWithKakao, for the login page with every sign-in method. */
export function rememberActionForLogin(
  action: Omit<PendingAction, "createdAt">,
) {
  return setPendingAction(guestLocal, action, Date.now());
}
