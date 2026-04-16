"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) {
      alert(error.message);
    } else if (data.user) {
      // Create initial profile
      await supabase.from("profiles").insert({ id: data.user.id, nickname: email.split("@")[0] });
      router.push("/onboarding");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold text-primary mb-8">PosterLink</h1>
      <form onSubmit={handleSignup} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">이메일</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-gray-100 rounded-xl" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">비밀번호</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-gray-100 rounded-xl" required />
        </div>
        <button disabled={loading} className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-lg">
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>
      <p className="mt-4 text-sm">이미 계정이 있나요? <Link href="/login" className="text-primary font-bold">로그인</Link></p>
    </div>
  );
}
