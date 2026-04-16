"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      alert(error.message);
    } else {
      router.push("/");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold text-primary mb-8">PosterLink</h1>
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">이메일</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-gray-100 rounded-xl" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">비밀번호</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-gray-100 rounded-xl" required />
        </div>
        <button disabled={loading} className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-lg">
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <p className="mt-4 text-sm">계정이 없나요? <Link href="/signup" className="text-primary font-bold">회원가입</Link></p>
    </div>
  );
}
