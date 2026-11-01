"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const MESSAGES: Record<string, string> = {
  linked: "네이버 로그인을 연결했어요.",
  unlinked: "네이버 로그인 연결을 해제했어요.",
  link_failed:
    "네이버 로그인을 연결하지 못했어요. 처음부터 다시 시도해 주세요.",
  unlink_failed:
    "연결을 해제하지 못했어요. 다른 로그인 방법이 있어야 해제할 수 있어요.",
  reauth:
    "보안을 위해 로그아웃 후 다시 로그인한 다음, 10분 안에 시도해 주세요.",
};

type State =
  | { phase: "loading" }
  | { phase: "hidden" }
  | {
      phase: "ready";
      linked: boolean;
      linkedAt: string | null;
      needsRelink: boolean;
    };

/**
 * 연결된 로그인: link or unlink Naver for the signed-in member
 * (docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md 5-8, 5-14). Shown only
 * while NEXT_PUBLIC_NAVER_LOGIN_ENABLED is on; the server routes check their
 * own switch.
 */
export function NaverLoginLink() {
  const enabled = process.env.NEXT_PUBLIC_NAVER_LOGIN_ENABLED === "true";
  const [state, setState] = useState<State>({
    phase: enabled ? "loading" : "hidden",
  });
  const result = useSearchParams()?.get("naver") ?? "";

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    supabase.rpc("my_login_methods").then(({ data, error }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : null;
      // Before the migration (or on any error) the section stays hidden.
      if (error || !row) return setState({ phase: "hidden" });
      setState({
        phase: "ready",
        linked: Boolean(row.naver_linked),
        linkedAt: row.naver_linked_at ?? null,
        needsRelink: Boolean(row.naver_needs_relink),
      });
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  if (state.phase === "hidden") return null;
  const message = MESSAGES[result];
  const linkForm = (label: string) => (
    <form method="post" action="/auth/naver/start">
      <input type="hidden" name="purpose" value="link_session" />
      <input type="hidden" name="next" value="/mypage/edit" />
      <button
        type="submit"
        className="min-h-[44px] rounded-xl bg-[#03C75A] px-4 text-sm font-bold text-white"
      >
        {label}
      </button>
    </form>
  );

  return (
    <section aria-labelledby="login-methods">
      <h2
        id="login-methods"
        className="mb-3 px-1 text-sm font-black uppercase text-gray-400"
      >
        연결된 로그인
      </h2>
      {message && (
        <p
          role="status"
          className="mb-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700"
        >
          {message}
        </p>
      )}
      {state.phase === "loading" ? (
        <p className="text-sm text-gray-500">불러오는 중이에요…</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">
            네이버{" "}
            <span className="font-normal text-gray-600">
              {state.needsRelink
                ? "· 다시 연결이 필요해요"
                : state.linked
                  ? `· 연결됨${state.linkedAt ? ` (${state.linkedAt.slice(0, 10)})` : ""}`
                  : "· 연결 안 됨"}
            </span>
          </p>
          {state.needsRelink ? (
            linkForm("다시 연결하기")
          ) : state.linked ? (
            <form method="post" action="/auth/naver/unlink">
              <button
                type="submit"
                className="min-h-[44px] rounded-xl border border-gray-300 px-4 text-sm font-bold text-gray-700"
              >
                연결 해제
              </button>
            </form>
          ) : (
            linkForm("네이버 연결하기")
          )}
        </div>
      )}
      <p className="mt-2 px-1 text-xs text-gray-500">
        연결하거나 해제하려면 최근 10분 안에 로그인한 상태여야 해요.
      </p>
    </section>
  );
}
