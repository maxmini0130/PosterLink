"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }

    setLoading(false);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24 bg-white">
      <Link
        href="/"
        aria-label="PosterLink 홈으로 이동"
        className="absolute left-6 top-6 flex items-center gap-2 rounded-xl px-2 py-1 font-black text-primary transition-colors hover:bg-gray-50"
      >
        <Image src="/logo.png" alt="PosterLink" width={32} height={32} className="rounded-lg" priority />
        <span>PosterLink</span>
      </Link>

      <h1 className="mb-2 text-3xl font-black text-gray-900">비밀번호 재설정</h1>
      <p className="mb-10 text-gray-500 text-center">
        가입한 이메일 주소를 입력하면<br />재설정 링크를 보내드립니다
      </p>

      {sent ? (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">📧</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg mb-1">이메일을 확인해주세요</p>
            <p className="text-gray-500 text-sm">
              <span className="font-semibold text-primary">{email}</span>으로<br />
              비밀번호 재설정 링크를 발송했습니다
            </p>
          </div>
          <p className="text-xs text-gray-400">
            이메일이 오지 않으면 스팸함을 확인하거나{" "}
            <button
              onClick={() => setSent(false)}
              className="text-primary font-bold hover:underline"
            >
              다시 시도
            </button>
            해주세요
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">이메일</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="가입한 이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <button
            disabled={loading}
            className="w-full rounded-2xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "전송 중..." : "재설정 링크 보내기"}
          </button>
        </form>
      )}

      <p className="mt-8 text-sm text-gray-500">
        <Link href="/login" className="font-bold text-primary hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
