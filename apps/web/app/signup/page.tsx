"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("이용약관 및 개인정보처리방침에 동의해주세요.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      toast.error("회원가입에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
      return;
    }

    // 세션이 없으면 (이메일 확인 필요) 바로 로그인 시도
    let session = data.session;
    if (!session) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // 이메일 미확인 상태 — 확인 메일 안내
        toast("가입 확인 이메일을 발송했습니다. 이메일을 확인해주세요.", { icon: "📧", duration: 6000 });
        setLoading(false);
        return;
      }
      session = signInData.session;
    }

    // 세션 확보 후 프로필 생성 (이미 있으면 무시)
    await supabase.from("profiles").upsert(
      { id: data.user.id, nickname: email.split("@")[0], role: 'user' },
      { onConflict: "id", ignoreDuplicates: true }
    );
    localStorage.setItem("onboarding_uid", data.user.id);
    router.push("/onboarding");
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
      <p className="text-gray-500 mb-10">새로운 계정을 만들고 맞춤 정보를 받아보세요</p>
      
      <form onSubmit={handleSignup} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">이메일</label>
          <input 
            type="email" 
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
            placeholder="••••••••"
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 placeholder:text-gray-400" 
            required 
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20 cursor-pointer"
          />
          <span className="text-sm text-gray-500 leading-relaxed">
            <Link href="/terms" className="font-bold text-primary hover:underline" target="_blank">이용약관</Link> 및{" "}
            <Link href="/privacy" className="font-bold text-primary hover:underline" target="_blank">개인정보처리방침</Link>에
            동의합니다. <span className="text-rose-500">(필수)</span>
          </span>
        </label>
        <button
          disabled={loading || !agreed}
          className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? "가입 중..." : "이메일로 가입하기"}
        </button>
      </form>

      <div className="w-full max-w-sm mt-8 relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-100"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-gray-400">간편 가입</span>
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
          onClick={() => toast("네이버 로그인은 현재 준비 중입니다.", { icon: "🔔" })}
          className="w-full py-4 bg-[#03C75A] text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <span className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-[11px] text-[#03C75A] font-black">N</span>
          네이버로 시작하기
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-500">
        이미 계정이 있나요? <Link href="/login" className="text-primary font-bold hover:underline">로그인</Link>
      </p>
    </div>
  );
}
