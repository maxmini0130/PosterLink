"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      toast.error(error.message);
    } else {
      router.push("/");
    }
    setLoading(false);
  };

  const handleSocialLogin = async (provider: 'kakao' | 'google') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(provider === 'kakao' && { scopes: 'profile_nickname profile_image' }),
      },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <h1 className="text-4xl font-black text-primary mb-2">PosterLink</h1>
      <p className="text-gray-500 mb-10">공공 포스터를 한눈에, 포스터링크</p>
      
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">이메일</label>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 placeholder:text-gray-400"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">비밀번호</label>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 placeholder:text-gray-400"
            required
          />
        </div>
        <button 
          disabled={loading} 
          className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? "로그인 중..." : "이메일로 로그인"}
        </button>
      </form>

      <div className="w-full max-w-sm mt-8 relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-100"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-gray-400">간편 로그인</span>
        </div>
      </div>

      <div className="w-full max-w-sm mt-6 space-y-3">
        <button 
          onClick={() => handleSocialLogin('kakao')}
          className="w-full py-4 bg-[#FEE500] text-[#3c1e1e] font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <span className="w-5 h-5 bg-[#3c1e1e] rounded-full flex items-center justify-center text-[10px] text-[#FEE500]">K</span>
          카카오로 시작하기
        </button>
        <button 
          onClick={() => handleSocialLogin('google')}
          className="w-full py-4 bg-white border border-gray-200 text-gray-700 font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          구글로 시작하기
        </button>
        <button
          onClick={() => toast("네이버 로그인은 현재 준비 중입니다. 빠른 시일 내에 지원 예정입니다!", { icon: "🔔" })}
          className="w-full py-4 bg-[#03C75A] text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <span className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-[11px] text-[#03C75A] font-black">N</span>
          네이버로 시작하기
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-500">
        계정이 없나요? <Link href="/signup" className="text-primary font-bold hover:underline">회원가입</Link>
      </p>
    </div>
  );
}
