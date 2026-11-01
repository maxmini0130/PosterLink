"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";

import { trackAnalytics, setAnalyticsLoginStatus } from "../../lib/analytics";
import { currentPageType, promptSignup, trackProductEvent } from "../../lib/productEvents";
import {
  PENDING_ACTION_DONE_EVENT,
  PENDING_NOT_STORED_MESSAGE,
  rememberActionForLogin,
  type PendingActionDoneDetail,
} from "../lib/guestSession";

export function InstitutionFollowButton({
  institutionId,
  returnPath,
  variant = "default",
}: {
  institutionId: string;
  returnPath: string;
  /** "pl": redesigned screens (구독 / 구독 중). */
  variant?: "default" | "pl";
}) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Bumped by every local change so a slower initial lookup cannot overwrite it.
  const followVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const startedAt = followVersion.current;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      setUserId(user?.id ?? null);
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("institution_follows")
        .select("institution_id")
        .eq("user_id", user.id)
        .eq("institution_id", institutionId)
        .maybeSingle();
      if (active) {
        if (followVersion.current === startedAt) setFollowing(Boolean(data));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [institutionId]);

  // Completed after sign-in by PendingActionRunner.
  useEffect(() => {
    const onDone = (event: Event) => {
      const detail = (event as CustomEvent<PendingActionDoneDetail>).detail;
      if (detail?.type === "follow" && detail.targetId === institutionId) {
        followVersion.current += 1;
        setFollowing(true);
      }
    };
    window.addEventListener(PENDING_ACTION_DONE_EVENT, onDone);
    return () => window.removeEventListener(PENDING_ACTION_DONE_EVENT, onDone);
  }, [institutionId]);

  const toggleFollow = async () => {
    if (!userId) {
      promptSignup(currentPageType(), "follow", { institutionId });
      // Follow automatically once signed in, then come back here.
      if (!rememberActionForLogin({ type: "follow", targetId: institutionId, returnTo: returnPath })) {
        toast.error(PENDING_NOT_STORED_MESSAGE);
        return;
      }
      router.push(`/login?redirectTo=${encodeURIComponent(returnPath)}`);
      return;
    }
    setLoading(true);
    const result = following
      ? await supabase
          .from("institution_follows")
          .delete()
          .eq("user_id", userId)
          .eq("institution_id", institutionId)
      : await supabase.from("institution_follows").insert({ user_id: userId, institution_id: institutionId });
    if (!result.error) {
      followVersion.current += 1;
      setFollowing((value) => !value);
      setAnalyticsLoginStatus(true);
      trackAnalytics(following ? "unfollow_institution" : "follow_institution", {institution_id:institutionId});
      trackProductEvent(following ? "institution_unfollow" : "institution_follow", {
        institutionId,
        metadata: { screen: currentPageType() },
      });
    }
    setLoading(false);
  };

  if (variant === "pl") {
    return (
      <button
        type="button"
        onClick={toggleFollow}
        disabled={loading}
        aria-pressed={following}
        className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-60 ${
          following ? "border border-pl-line bg-pl-card text-pl-ink" : "bg-pl-ink text-white"
        }`}
      >
        {loading ? "확인 중" : following ? "구독 중" : "구독"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={loading}
      aria-pressed={following}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-black transition-colors disabled:cursor-wait disabled:opacity-60 ${
        following
          ? "border border-slate-300 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-700"
          : "bg-blue-700 text-white hover:bg-blue-800"
      }`}
    >
      {following ? <BellOff size={17} /> : <Bell size={17} />}
      {loading ? "확인 중" : following ? "팔로우 취소" : "기관 팔로우"}
    </button>
  );
}
