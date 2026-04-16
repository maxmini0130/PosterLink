"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FileCheck, ShieldCheck, LogOut, Settings } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "admin" || profile?.role === "super_admin") {
        setIsAdmin(true);
      } else {
        alert("관리자 권한이 없습니다.");
        router.push("/");
      }
    };

    checkAdmin();
  }, [router]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-gray-500">관리자 인증 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-indigo-900 text-indigo-100 p-6 hidden md:flex flex-col">
        <div className="flex items-center gap-2 mb-10 px-2">
          <ShieldCheck className="text-indigo-400" size={28} />
          <h2 className="text-xl font-black tracking-tighter text-white">ADMIN</h2>
        </div>
        
        <nav className="flex-1 space-y-2">
          <Link href="/admin" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-800 transition-colors font-bold text-sm">
            <LayoutDashboard size={18} /> 대시보드
          </Link>
          <Link href="/admin/posters" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-800 transition-colors font-bold text-sm">
            <FileCheck size={18} /> 포스터 검수
          </Link>
          <Link href="/admin/reports" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-800 transition-colors font-bold text-sm">
            <AlertCircle size={18} /> 신고 관리
          </Link>
          <Link href="/admin/settings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-800 transition-colors font-bold text-sm">
            <Settings size={18} /> 기준정보 관리
          </Link>
        </nav>

        <button 
          onClick={() => supabase.auth.signOut().then(() => router.push("/"))}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-800 transition-colors font-bold text-sm mt-auto"
        >
          <LogOut size={18} /> 로그아웃
        </button>
      </aside>

      <main className="flex-1 p-8 md:p-12 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
