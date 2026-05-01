"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase가 URL hash의 access_token을 자동으로 처리하지만,
    // recovery 타입인지 확인하고 세션을 명시적으로 설정
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (type === "recovery" && accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
        if (error) {
          toast.error("링크가 만료되었습니다. 다시 요청해주세요.");
          router.replace("/forgot-password");
        } else {
          // hash 제거 (토큰 노출 방지)
          window.history.replaceState(null, "", window.location.pathname);
          setReady(true);
        }
      });
    } else {
      // 이미 세션이 있는 경우 (Supabase가 자동 처리)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setReady(true);
        } else {
          toast.error("유효하지 않은 링크입니다. 다시 요청해주세요.");
          router.replace("/forgot-password");
        }
      });
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
    } else {
      setDone(true);
      setTimeout(() => router.replace("/"), 2000);
    }

    setLoading(false);
  };

  if (!ready && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

      <h1 className="mb-2 text-3xl font-black text-gray-900">새 비밀번호 설정</h1>
      <p className="mb-10 text-gray-500">사용할 새 비밀번호를 입력해주세요</p>

      {done ? (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">✅</span>
          </div>
          <p className="font-bold text-gray-900">비밀번호가 변경되었습니다</p>
          <p className="text-sm text-gray-400">잠시 후 홈으로 이동합니다...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">새 비밀번호</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="6자 이상 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">비밀번호 확인</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <button
            disabled={loading}
            className="w-full rounded-2xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      )}
    </div>
  );
}
