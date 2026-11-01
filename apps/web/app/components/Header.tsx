"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardList, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { AccountMenu } from "./AccountMenu";

export function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const pathname = usePathname() ?? "";

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
      setEmail(user?.email ?? null);
      if (user) checkUserInfo(user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
      setEmail(session?.user.email ?? null);
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

        {/* PC menu (UI redesign 3-1); mobile uses the bottom tab bar. */}
        <nav aria-label="주요 메뉴" className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
          <HeaderNavLink href="/" label="홈" current={pathname === "/"} />
          <HeaderNavLink href="/posters" label="찾기" current={pathname === "/posters"} />
          <HeaderNavLink
            href="/my-posters"
            label="내 공고"
            current={pathname.startsWith("/my-posters") || pathname.startsWith("/favorites")}
          />
          <HeaderNavLink href="/institutions" label="기관 찾기" current={pathname.startsWith("/institutions")} />
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/posters/request"
            className="mr-1 hidden min-h-[36px] items-center gap-1 rounded-full border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:border-slate-500 md:inline-flex"
          >
            <Plus size={14} aria-hidden="true" />
            포스터 제보
          </Link>
          {isLoggedIn === false && (
            <>
              <Link
                href="/login"
                data-signup-feature="header"
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:text-blue-700"
                style={{ whiteSpace: "nowrap" }}
              >
                로그인
              </Link>
              <Link
                href="/signup"
                data-signup-feature="header"
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
                <Link href="/admin" aria-label="관리자" className="p-2 text-blue-700 transition-colors hover:text-blue-900" title="관리자">
                  <ShieldCheck size={22} aria-hidden="true" />
                </Link>
              )}
              {role === "operator" && (
                <Link
                  href="/operator/posters"
                  aria-label="운영자"
                  className="p-2 text-emerald-600 transition-colors hover:text-emerald-800"
                  title="운영자"
                >
                  <ClipboardList size={22} aria-hidden="true" />
                </Link>
              )}
              <Link
                href="/notifications"
                aria-label={hasUnread ? "알림, 읽지 않은 알림 있음" : "알림"}
                className="relative p-2 text-slate-500 transition-colors hover:text-blue-700"
              >
                <Bell size={22} aria-hidden="true" />
                {hasUnread && <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />}
              </Link>
              <div className="hidden md:block">
                <AccountMenu email={email} />
              </div>
              <Link href="/mypage" aria-label="마이" className="p-2 text-slate-500 transition-colors hover:text-blue-700 md:hidden">
                마이
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderNavLink({ href, label, current }: { href: string; label: ReactNode; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-[44px] items-center px-3 text-sm transition-colors hover:text-slate-950 ${
        current ? "font-black text-slate-950 underline decoration-2 underline-offset-8" : "font-bold text-slate-600"
      }`}
    >
      {label}
    </Link>
  );
}
