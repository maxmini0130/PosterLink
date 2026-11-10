"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import {
  guestLocal,
  guestTab,
  PENDING_NOT_STORED_MESSAGE,
  rememberActionForLogin,
} from "../../lib/guestSession";
import {
  rememberSignupIntent,
  trackProductEvent,
} from "../../../lib/productEvents";
import {
  canOfferFollow,
  markFollowPromptShown,
  newFollowPromptId,
  rememberFollowDecision,
  type FollowTrigger,
} from "../../../lib/followPrompt";
import type { PageType } from "../../../lib/productEventsCore";

export type FollowPromptRequest = {
  promptId: string;
  institution: { id: string; name: string };
  trigger: FollowTrigger;
};

/**
 * Offers the prompt when the rules allow (organiser only, once per visit, not
 * after a follow or a refusal). Returns the request to render, if any.
 */
export function useFollowPromptOffer(followedIds?: ReadonlySet<string>) {
  const [request, setRequest] = useState<FollowPromptRequest | null>(null);
  const offer = useCallback(
    (
      institution: { id: string; name: string } | null | undefined,
      trigger: FollowTrigger,
    ) => {
      if (!institution?.id || !institution.name) return false;
      const session = guestTab;
      if (
        !canOfferFollow({
          institutionId: institution.id,
          followedIds,
          local: guestLocal,
          session,
        })
      )
        return false;
      const promptId = newFollowPromptId();
      if (!markFollowPromptShown(session, promptId)) return false;
      setRequest({ promptId, institution, trigger });
      return true;
    },
    [followedIds],
  );
  const close = useCallback(() => setRequest(null), []);
  return { request, offer, close };
}

/**
 * Non-modal card above the bottom bar (시안 FollowPrompt). Copy describes only
 * what following does today (홈 '팔로우 기관 소식'); no alert promises.
 */
export function FollowPrompt({
  request,
  screen,
  signedIn,
  returnTo,
  headline,
  raised = false,
  onClose,
  onFollowed,
}: {
  request: FollowPromptRequest;
  screen: PageType;
  signedIn: boolean;
  returnTo: string;
  /** e.g. "찜했어요 · 내 공고에 담겼어요" after a favorite. */
  headline?: string;
  /** Sit above a fixed action bar (poster detail). */
  raised?: boolean;
  onClose: () => void;
  onFollowed?: (institutionId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { promptId, institution, trigger } = request;
  const shown = useRef(false);
  const meta = { prompt_id: promptId, trigger, logged_in: signedIn, screen };

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    trackProductEvent("follow_prompt_shown", {
      institutionId: institution.id,
      metadata: meta,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    rememberFollowDecision(guestLocal, institution.id, "dismissed");
    trackProductEvent("follow_prompt_dismiss", {
      institutionId: institution.id,
      metadata: meta,
    });
    onClose();
  }

  async function follow() {
    trackProductEvent("follow_prompt_click", {
      institutionId: institution.id,
      metadata: meta,
    });
    if (!signedIn) {
      rememberSignupIntent(screen, "follow", promptId);
      trackProductEvent("signup_prompt_shown", {
        institutionId: institution.id,
        metadata: { screen, feature: "follow", prompt_id: promptId },
      });
      if (
        !rememberActionForLogin({
          type: "follow",
          targetId: institution.id,
          returnTo,
          promptId,
        })
      ) {
        toast.error(PENDING_NOT_STORED_MESSAGE);
        return;
      }
      rememberFollowDecision(guestLocal, institution.id, "followed");
      router.push(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setBusy(true);
    try {
      const user = (await supabase.auth.getSession()).data.session?.user;
      if (!user) throw Error("signed out");
      const { error } = await supabase
        .from("institution_follows")
        .upsert(
          { user_id: user.id, institution_id: institution.id },
          { onConflict: "user_id,institution_id", ignoreDuplicates: true },
        );
      if (error) throw error;
      rememberFollowDecision(guestLocal, institution.id, "followed");
      trackProductEvent("institution_follow", {
        institutionId: institution.id,
        metadata: { screen, prompt_id: promptId, logged_in: true },
      });
      toast.success(`${institution.name} 팔로우를 시작했어요`);
      onFollowed?.(institution.id);
      onClose();
    } catch {
      toast.error("팔로우하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="기관 팔로우 제안"
      aria-live="polite"
      data-follow-prompt={promptId}
      className={`fixed inset-x-3 ${raised ? "bottom-[calc(var(--mobile-nav-height)+92px)]" : "bottom-[calc(var(--mobile-nav-height)+12px)]"} z-40 flex flex-col gap-2.5 rounded-[14px] border border-pl-line bg-pl-card p-3.5 pb-3 text-pl-ink shadow-[0_10px_28px_rgba(15,26,48,0.22)] md:inset-x-auto md:bottom-6 md:right-6 md:w-[400px]`}
    >
      {headline && (
        <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-pl-accent">
          <Check size={16} aria-hidden="true" />
          {headline}
        </p>
      )}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pl-ink font-pl-serif font-bold text-white"
        >
          {institution.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-[1.45]">
            {institution.name}의 새 공고도 모아 보시겠어요?
          </p>
          <p className="mt-1 text-[13px] leading-normal text-pl-sub">
            팔로우하면 홈의 &lsquo;팔로우 기관 소식&rsquo;에 새 공고가 모여요.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 px-3.5 text-sm text-pl-sub"
        >
          괜찮아요
        </button>
        <button
          type="button"
          onClick={() => void follow()}
          disabled={busy}
          className="min-h-11 rounded-[10px] bg-pl-ink px-[18px] text-[14.5px] font-bold text-white disabled:opacity-60"
        >
          기관 팔로우
        </button>
      </div>
    </section>
  );
}
