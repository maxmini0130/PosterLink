"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import Link from "next/link";
import { User, MessageSquare, Settings, Heart, LogOut, ChevronRight, MapPin, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MyPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*, regions(name)")
        .eq("id", user.id)
        .single();
      
      if (data) setProfile(data);
      setLoading(false);
    };

    fetchProfile();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) return <div className="p-10 text-center animate-pulse">마이페이지 로딩 중...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* User Profile Summary */}
        <section className="bg-white p-8 rounded-[2.5rem] shadow-sm mb-6 border border-gray-100 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 border-4 border-white shadow-md">
            <User size={40} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">{profile?.nickname || '닉네임 없음'}</h2>
          <div className="flex gap-2 mb-6">
            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
              <MapPin size={12} /> {profile?.regions?.name || '지역 미설정'}
            </span>
            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
              <Calendar size={12} /> {profile?.age_band?.replace('s', '대') || '연령 미설정'}
            </span>
          </div>
          
          <Link 
            href="/mypage/edit"
            className="px-6 py-3 bg-gray-900 text-white text-sm font-black rounded-2xl hover:bg-black transition-all shadow-lg shadow-gray-200"
          >
            프로필 수정하기
          </Link>
        </section>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 gap-3">
          <Link href="/favorites" className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:border-blue-100 transition-all group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Heart size={22} fill="currentColor" />
              </div>
              <span className="font-black text-gray-700">내가 찜한 포스터</span>
            </div>
            <ChevronRight className="text-gray-200 group-hover:text-blue-600 transition-colors" />
          </Link>

          <Link href="/mypage/comments" className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:border-blue-100 transition-all group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <MessageSquare size={22} />
              </div>
              <span className="font-black text-gray-700">내가 쓴 댓글 관리</span>
            </div>
            <ChevronRight className="text-gray-200 group-hover:text-blue-600 transition-colors" />
          </Link>

          <div className="p-2"></div>

          <button 
            onClick={handleLogout}
            className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:bg-rose-50 transition-all group shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center group-hover:bg-rose-100 group-hover:text-rose-500 transition-all">
                <LogOut size={22} />
              </div>
              <span className="font-black text-gray-400 group-hover:text-rose-500 transition-colors">로그아웃</span>
            </div>
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
