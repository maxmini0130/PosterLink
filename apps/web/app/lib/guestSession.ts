"use client";

import {
  addGuestFavorite,
  hasGuestFavorite,
  removeGuestFavorite,
  safeReturnTo,
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

export type RequestedAction = Omit<PendingAction, "createdAt" | "id">;

/**
 * Remembers what the person was doing, then starts Kakao sign-in that returns
 * to the same screen. PendingActionRunner finishes the action after sign-in,
 * even if the return path is lost (onboarding, app WebView).
 * Returns "not_stored" without starting sign-in when the action could not be
 * kept, since the promised completion would then silently not happen.
 */
export async function continueWithKakao(
  action: RequestedAction,
): Promise<"started" | "not_stored" | "failed"> {
  const stored = setPendingAction(guestLocal, action, Date.now());
  if (!stored) return "not_stored";
  const returnTo = safeReturnTo(action.returnTo) ?? "/";
  trackSignupStart("login", "kakao");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
      scopes: "profile_nickname profile_image",
    },
  });
  return error ? "failed" : "started";
}

/** Keeps the action for completion after sign-in; false if it could not be stored. */
export function rememberActionForLogin(action: RequestedAction) {
  return setPendingAction(guestLocal, action, Date.now()) !== null;
}

/** Shown when the browser refuses to keep the pending action. */
export const PENDING_NOT_STORED_MESSAGE =
  "이 브라우저에 진행 상황을 저장할 수 없어 로그인 후 자동으로 이어 갈 수 없어요. 로그인한 뒤 다시 눌러 주세요.";

/** Kakao sign-in that returns to `returnTo`, with nothing pending (내 공고). */
export async function signInWithKakao(returnTo: string) {
  trackSignupStart("login", "kakao");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeReturnTo(returnTo) ?? "/")}`,
      scopes: "profile_nickname profile_image",
    },
  });
  return error;
}

/** Fired after guest favorites were moved into the account. */
export const GUEST_MERGED_EVENT = "pl:guest-merged";
