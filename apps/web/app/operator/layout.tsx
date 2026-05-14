"use client";
import toast from "react-hot-toast";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, ShieldCheck, ClipboardList, LayoutDashboard, Plus, Menu, X, LogOut } from "lucide-react";

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push("/login");
      else {
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (data?.role !== "operator" && data?.role !== "admin" && data?.role !== "super_admin") {
          toast.error("권한이 없습니다.");
          router.push("/");
        } else {
          setRole(data.role);
        }
      }
    };
    checkRole();
  }, [router]);

  if (!role) return <div className="p-10 text-center">권한 확인 중...</div>;

  const navLinks = (
    <>
      <Link href="/operator" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 hover:bg-white/20 rounded-xl font-bold text-sm">
        <LayoutDashboard size={18} className="text-blue-300" /> 대시보드
      </Link>
      <Link href="/operator/posters" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-white/10 rounded-xl hover:bg-white/20 font-bold text-sm">
        <ClipboardList size={18} className="text-blue-300" /> 포스터 관리
      </Link>
      <Link href="/operator/posters/new" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 hover:bg-white/20 rounded-xl font-bold text-sm">
        <Plus size={18} className="text-emerald-300" /> 새 포스터 등록
      </Link>

      <div className="border-t border-white/20 pt-3 mt-1 space-y-1">
        {(role === "admin" || role === "super_admin") && (
          <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 hover:bg-white/20 rounded-xl font-bold text-sm">
            <ShieldCheck size={18} className="text-indigo-300" /> 관리자 페이지
          </Link>
        )}
        <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 hover:bg-white/20 rounded-xl font-bold text-sm">
          <Home size={18} className="text-sky-300" /> 홈으로
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-30 md:hidden bg-primary text-white px-4 h-14 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <ClipboardList className="text-blue-300" size={20} />
          <span className="font-black text-sm">OPERATOR</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-20 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <nav className="absolute top-14 left-0 right-0 bg-primary p-4 space-y-1 shadow-2xl">
            {navLinks}
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push("/"))}
              className="w-full flex items-center gap-3 p-3 hover:bg-rose-500/20 text-rose-300 rounded-xl font-bold text-sm mt-1"
            >
              <LogOut size={18} /> 로그아웃
            </button>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-primary text-white p-6 hidden md:flex flex-col">
        <h2 className="text-xl font-black mb-10 flex items-center gap-2">
          <ClipboardList size={20} className="text-blue-300" /> PosterLink OPS
        </h2>
        <nav className="flex-1 space-y-1">
          {navLinks}
        </nav>
        <button
          onClick={() => supabase.auth.signOut().then(() => router.push("/"))}
          className="flex items-center gap-3 p-3 hover:bg-rose-500/20 text-rose-300 rounded-xl font-bold text-sm mt-4"
        >
          <LogOut size={18} /> 로그아웃
        </button>
      </aside>

      <main className="flex-1 p-6 pt-20 md:pt-10 md:p-10 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
