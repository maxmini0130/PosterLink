"use client";
import toast from "react-hot-toast";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, ShieldCheck } from "lucide-react";

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-white p-6 hidden md:block">
        <h2 className="text-xl font-bold mb-10">PosterLink OPS</h2>
        <nav className="space-y-4">
          <Link href="/operator" className="block p-3 hover:bg-white/20 rounded-xl">📊 대시보드</Link>
          <Link href="/operator/posters" className="block p-3 bg-white/10 rounded-xl hover:bg-white/20">포스터 관리</Link>
          <Link href="/operator/posters/new" className="block p-3 hover:bg-white/20 rounded-xl">+ 새 포스터 등록</Link>

          <div className="border-t border-white/20 pt-4 space-y-2">
            {(role === "admin" || role === "super_admin") && (
              <Link href="/admin" className="flex items-center gap-2 p-3 hover:bg-white/20 rounded-xl text-sm">
                <ShieldCheck size={16} />
                관리자 페이지
              </Link>
            )}
            <Link href="/" className="flex items-center gap-2 p-3 hover:bg-white/20 rounded-xl text-sm">
              <Home size={16} />
              홈으로
            </Link>
          </div>
        </nav>
      </aside>

      <main className="flex-1 p-6 md:p-10">
        {children}
      </main>
    </div>
  );
}
