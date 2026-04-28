"use client";

import { useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

async function handlePostAuth(userId: string, email: string | undefined, router: ReturnType<typeof useRouter>) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_region_id")
    .eq("id", userId)
    .single();

  if (!profile || !profile.primary_region_id) {
    await supabase.from("profiles").upsert({
      id: userId,
      nickname: email?.split("@")[0] ?? "user",
      role: "user"
    }, { onConflict: "id" });
    router.replace("/onboarding");
  } else {
    router.replace("/");
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // PKCE 코드 플로우 (카카오/구글): ?code= 쿼리 파라미터
    const code = params.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error || !data.user) {
          router.replace("/login?error=auth_callback_failed");
          return;
        }
        handlePostAuth(data.user.id, data.user.email, router);
      });
      return;
    }

    // 네이버 token_hash 플로우: ?token_hash= 쿼리 파라미터 (Supabase verify redirect 우회)
    const tokenHash = params.get("token_hash");
    const otpType = params.get("type");
    if (tokenHash && otpType) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType as "magiclink" }).then(({ data, error }) => {
        if (error || !data.user) {
          router.replace("/login?error=login_failed");
          return;
        }
        handlePostAuth(data.user.id, data.user.email, router);
      });
      return;
    }

    // 매직링크 플로우 (네이버): #access_token= 해시
    // SIGNED_IN이 리스너 등록 전에 이미 발생했을 경우 INITIAL_SESSION으로만 오므로 함께 처리
    let handled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (handled) return;
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
        handled = true;
        subscription.unsubscribe();
        clearTimeout(timeout);
        handlePostAuth(session.user.id, session.user.email, router);
      }
    });

    // 10초 이내 세션 미확립 시 로그인으로 복귀
    const timeout = setTimeout(() => {
      if (!handled) {
        subscription.unsubscribe();
        router.replace("/login?error=login_failed");
      }
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-400">로그인 처리 중...</p>
      </div>
    </div>
  );
}
