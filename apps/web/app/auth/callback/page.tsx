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

    // PKCE 코드 플로우 (카카오/구글)
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

    // 네이버: email_otp를 query param으로 받아 직접 verifyOtp 호출
    const naverEmail = params.get("naver_email");
    const naverOtp = params.get("naver_otp");
    const otpType = params.get("type");
    if (naverEmail && naverOtp && otpType) {
      supabase.auth.verifyOtp({ email: naverEmail, token: naverOtp, type: "magiclink" }).then(({ data, error }) => {
        if (error || !data.user) {
          router.replace(`/login?error=verify_failed&msg=${encodeURIComponent(error?.message ?? "no_user")}`);
          return;
        }
        handlePostAuth(data.user.id, data.user.email, router);
      });
      return;
    }

    router.replace("/login?error=login_failed");
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
