"use client";

import { useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace("/login?error=auth_callback_failed");
          return;
        }
      }

      // 소셜 로그인 후 프로필 존재 여부 확인 → 없으면 온보딩으로
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, primary_region_id")
          .eq("id", user.id)
          .single();

        if (!profile || !profile.primary_region_id) {
          await supabase.from("profiles").upsert({
            id: user.id,
            nickname: user.email?.split("@")[0] ?? "user",
            role: "user"
          }, { onConflict: "id" });
          router.replace("/onboarding");
        } else {
          router.replace("/");
        }
      } else {
        router.replace("/login");
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-400">로그인 처리 중...</p>
      </div>
    </div>
  );
}
