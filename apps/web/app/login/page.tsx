"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";

const ERROR_MESSAGES: Record<string, string> = {
  naver_not_configured: "네이버 로그인이 설정되지 않았습니다.",
  invalid_state: "보안 검증에 실패했습니다. 다시 시도해주세요.",
  naver_token_failed: "네이버 인증에 실패했습니다. 다시 시도해주세요.",
  naver_email_required: "네이버 계정에 이메일 정보가 없습니다.",
  create_user_failed: "네이버 계정으로 회원 정보를 만들지 못했습니다.",
  update_user_failed: "기존 네이버 계정 정보를 업데이트하지 못했습니다.",
  signin_failed: "네이버 로그인 세션 생성에 실패했습니다.",
  auth_callback_failed: "소셜 로그인 세션 교환에 실패했습니다.",
  set_session_failed: "소셜 로그인 세션 저장에 실패했습니다.",
  login_failed: "로그인 처리 중 오류가 발생했습니다.",
};

function LoginErrorHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    const msg = searchParams.get("msg");

    if (!error) return;

    const baseMessage = ERROR_MESSAGES[error] ?? `로그인 오류: ${error}`;
    toast.error(msg ? `${baseMessage} (${msg})` : baseMessage);
  }, [searchParams]);

  return null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
    } else {
      router.push("/");
    }

    setLoading(false);
  };

  const handleSocialLogin = async (provider: "kakao" | "google") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(provider === "kakao" ? { scopes: "profile_nickname profile_image" } : {}),
      },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-white px-6 py-24">
      <Link
        href="/"
        aria-label="PosterLink 홈으로 이동"
        className="absolute left-6 top-6 flex items-center gap-2 rounded-xl px-2 py-1 font-black text-primary transition-colors hover:bg-gray-50"
      >
        <Image src="/logo.png" alt="PosterLink" width={32} height={32} className="rounded-lg" priority />
        <span>PosterLink</span>
      </Link>

      <Suspense fallback={null}>
        <LoginErrorHandler />
      </Suspense>

      <h1 className="mb-2 text-3xl font-black text-gray-900">로그인</h1>
      <p className="mb-10 text-gray-500">공공 포스터를 더 쉽게 찾고 공유하세요</p>

      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">이메일</label>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">비밀번호</label>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <button
          disabled={loading}
          className="w-full rounded-2xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "로그인 중..." : "이메일로 로그인"}
        </button>
      </form>

      <div className="relative mt-8 w-full max-w-sm">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-100" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-400">간편 로그인</span>
        </div>
      </div>

      <div className="mt-6 w-full max-w-sm space-y-3">
        <button
          onClick={() => handleSocialLogin("kakao")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] py-4 font-bold text-[#3c1e1e] transition-all active:scale-[0.98]"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3c1e1e] text-[10px] text-[#FEE500]">K</span>
          카카오로 시작하기
        </button>

        <button
          onClick={() => handleSocialLogin("google")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-4 font-bold text-gray-700 transition-all active:scale-[0.98]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          구글로 시작하기
        </button>

        <button
          onClick={() => {
            window.location.href = "/api/auth/naver";
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#03C75A] py-4 font-bold text-white transition-all active:scale-[0.98]"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#03C75A]">N</span>
          네이버로 시작하기
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-500">
        계정이 없나요?{" "}
        <Link href="/signup" className="font-bold text-primary hover:underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}
