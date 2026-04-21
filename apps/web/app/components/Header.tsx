"use client";

import Link from "next/link";
import { Search, Bell, User, ShieldCheck, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter();

  const checkUserInfo = async (userId: string) => {
    const [notifResult, profileResult] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false),
      supabase.from("profiles").select("role").eq("id", userId).single(),
    ]);
    if (!notifResult.error) setHasUnread((notifResult.count ?? 0) > 0);
    if (profileResult.data) {
      setRole(profileResult.data.role);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      if (session?.user) checkUserInfo(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      if (session?.user) checkUserInfo(session.user.id);
      else { setHasUnread(false); setRole(null); }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 max-w-4xl h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-blue-600">
          PosterLink
        </Link>
        <div className="flex items-center gap-2">
          {isLoggedIn === false && (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-blue-600 transition-colors"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-black text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                회원가입
              </Link>
            </>
          )}
          {isLoggedIn === true && (
            <>
              {(role === 'admin' || role === 'super_admin') && (
                <Link href="/admin" className="p-2 text-indigo-500 hover:text-indigo-700 transition-colors" title="관리자">
                  <ShieldCheck size={22} />
                </Link>
              )}
              {role === 'operator' && (
                <Link href="/operator/posters" className="p-2 text-emerald-500 hover:text-emerald-700 transition-colors" title="운영자">
                  <ClipboardList size={22} />
                </Link>
              )}
              <Link href="/notifications" className="p-2 text-gray-500 hover:text-blue-600 transition-colors relative">
                <Bell size={22} />
                {hasUnread && <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />}
              </Link>
              <Link href="/mypage" className="p-2 text-gray-500 hover:text-blue-600 transition-colors">
                <User size={22} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
