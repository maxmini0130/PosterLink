"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell, ClipboardList, Heart, Search, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const checkUserInfo = async (userId: string) => {
    const [notifResult, profileResult] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false),
      supabase.from("profiles").select("role").eq("id", userId).single(),
    ]);

    if (!notifResult.error) setHasUnread((notifResult.count ?? 0) > 0);
    if (profileResult.data) setRole(profileResult.data.role);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(Boolean(user));
      if (user) checkUserInfo(user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
      if (session?.user) {
        checkUserInfo(session.user.id);
      } else {
        setHasUnread(false);
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="PosterLink 포스터링크 홈" className="flex shrink-0 items-center gap-2 text-xl font-black text-slate-950">
          <Image src="/logo.png" alt="PosterLink" width={32} height={32} className="rounded-lg" />
          <span className="hidden sm:inline">PosterLink</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
          <HeaderNavLink href="/posters" icon={<Search size={15} />} label="공고 찾기" />
          <HeaderNavLink href="/#organizations" icon={<ClipboardList size={15} />} label="기관 찾기" />
          <HeaderNavLink href="/favorites" icon={<Heart size={15} />} label="관심 공고" />
          <HeaderNavLink href="/#about" icon={<ShieldCheck size={15} />} label="서비스 소개" />
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {isLoggedIn === false && (
            <>
              <Link
                href="/login"
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:text-blue-700"
                style={{ whiteSpace: "nowrap" }}
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="bg-slate-950 px-2.5 py-1.5 text-xs font-black text-white transition-colors hover:bg-blue-800"
                style={{ whiteSpace: "nowrap" }}
              >
                회원가입
              </Link>
            </>
          )}

          {isLoggedIn === true && (
            <>
              {(role === "admin" || role === "super_admin") && (
                <Link href="/admin" className="p-2 text-blue-700 transition-colors hover:text-blue-900" title="관리자">
                  <ShieldCheck size={22} />
                </Link>
              )}
              {role === "operator" && (
                <Link
                  href="/operator/posters"
                  className="p-2 text-emerald-600 transition-colors hover:text-emerald-800"
                  title="운영자"
                >
                  <ClipboardList size={22} />
                </Link>
              )}
              <Link href="/notifications" className="relative p-2 text-slate-500 transition-colors hover:text-blue-700">
                <Bell size={22} />
                {hasUnread && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />}
              </Link>
              <Link href="/mypage" className="p-2 text-slate-500 transition-colors hover:text-blue-700">
                <User size={22} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderNavLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:text-blue-700"
    >
      {icon}
      {label}
    </Link>
  );
}
