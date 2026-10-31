"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Heart, User, type LucideIcon } from "lucide-react";

// Labels change to 홈 / 찾기 / 내 공고 / 마이 with the 내 공고 screen (UI redesign stage 3).
const TABS: {
  href: string;
  label: string;
  Icon: LucideIcon;
  match: (path: string) => boolean;
}[] = [
  { href: "/", label: "홈", Icon: Home, match: (path) => path === "/" },
  {
    href: "/posters",
    label: "공고 찾기",
    Icon: Compass,
    // A poster detail page belongs to no tab.
    match: (path) => path === "/posters",
  },
  {
    href: "/favorites",
    label: "저장",
    Icon: Heart,
    match: (path) => path.startsWith("/favorites"),
  },
  {
    href: "/mypage",
    label: "마이",
    Icon: User,
    match: (path) => path.startsWith("/mypage"),
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="주요 탐색"
      className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-6 pt-2 md:hidden backdrop-blur-md transition-colors"
    >
      <div className="flex justify-between items-center text-gray-500 dark:text-slate-400">
        {TABS.map(({ href, label, Icon, match }) => {
          const current = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 transition-colors ${
                current
                  ? "text-blue-600 dark:text-blue-400"
                  : "hover:text-blue-600 dark:hover:text-blue-400"
              }`}
            >
              <Icon size={24} aria-hidden="true" />
              <span
                className={`text-[10px] ${current ? "font-black" : "font-bold"}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
