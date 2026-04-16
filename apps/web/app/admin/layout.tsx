"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FileCheck, ShieldCheck, LogOut, Settings, AlertTriangle, Loader2 } from "lucide-react";

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
      <div className="min-h-screen flex items-center justify-center bg-background transition-colors duration-300">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm font-black text-gray-500 dark:text-slate-400 italic">ADMIN AUTHENTICATING...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Admin Sidebar */}
      <aside className="w-72 bg-indigo-950 dark:bg-slate-900 text-indigo-100 p-8 hidden lg:flex flex-col shadow-2xl z-20 transition-colors">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="p-2 bg-indigo-500/20 rounded-xl">
            <ShieldCheck className="text-indigo-400" size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tighter text-white leading-none">ADMIN</h2>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Control Panel</p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-3">
          <Link href="/admin" className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
            <LayoutDashboard size={20} className="text-indigo-400 group-hover:text-white transition-colors" /> 
            <span>대시보드</span>
          </Link>
          <Link href="/admin/posters" className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
            <FileCheck size={20} className="text-indigo-400 group-hover:text-white transition-colors" /> 
            <span>포스터 검수</span>
          </Link>
          <Link href="/admin/reports" className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
            <AlertTriangle size={20} className="text-indigo-400 group-hover:text-white transition-colors" /> 
            <span>신고 관리</span>
          </Link>
          <Link href="/admin/settings" className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
            <Settings size={20} className="text-indigo-400 group-hover:text-white transition-colors" /> 
            <span>기준정보 관리</span>
          </Link>
        </nav>

        <div className="mt-auto space-y-4">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">Logged in as</p>
            <p className="text-xs font-bold text-white truncate">Administrator</p>
          </div>
          <button 
            onClick={() => supabase.auth.signOut().then(() => router.push("/"))}
            className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-rose-500/20 text-rose-400 transition-all font-black text-sm group"
          >
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" /> 
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 lg:p-16 overflow-y-auto bg-background transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
