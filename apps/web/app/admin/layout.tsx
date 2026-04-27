"use client";
import toast from "react-hot-toast";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FileCheck, ShieldCheck, LogOut, Settings, AlertTriangle, Bell, Loader2, ClipboardList, Menu, X, Home } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
        toast.error("관리자 권한이 없습니다.");
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

  const navLinks = (
    <>
      <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <LayoutDashboard size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
        <span>대시보드</span>
      </Link>
      <Link href="/admin/posters" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <FileCheck size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
        <span>포스터 검수</span>
      </Link>
      <Link href="/admin/reports" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <AlertTriangle size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
        <span>신고 관리</span>
      </Link>
      <Link href="/admin/notifications" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <Bell size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
        <span>공지 발송</span>
      </Link>
      <Link href="/admin/settings" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <Settings size={20} className="text-indigo-400 group-hover:text-white transition-colors" />
        <span>기준정보 관리</span>
      </Link>
      <div className="border-t border-white/10 my-3" />
      <Link href="/operator/posters" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <ClipboardList size={20} className="text-emerald-400 group-hover:text-white transition-colors" />
        <span>운영자 페이지</span>
      </Link>
      <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 transition-all font-black text-sm group">
        <Home size={20} className="text-sky-400 group-hover:text-white transition-colors" />
        <span>홈으로</span>
      </Link>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-30 lg:hidden bg-indigo-950 text-white px-4 h-14 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-indigo-400" size={22} />
          <span className="font-black text-sm">ADMIN</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <nav className="absolute top-14 left-0 right-0 bg-indigo-950 p-4 space-y-1 shadow-2xl">
            {navLinks}
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push("/"))}
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-rose-500/20 text-rose-400 transition-all font-black text-sm group"
            >
              <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
              <span>로그아웃</span>
            </button>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
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
          {navLinks}
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

      <main className="flex-1 p-6 pt-20 lg:pt-16 lg:p-16 overflow-y-auto bg-background transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
