"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { supabase } from "../../lib/supabase";

const ITEMS = [
  { href: "/my-posters", label: "내 공고" },
  { href: "/mypage/edit", label: "관심 조건 수정" },
  { href: "/mypage#notification-settings", label: "알림 설정" },
  { href: "/mypage", label: "계정 관리" },
];

/**
 * PC account menu (UI redesign 3-1 "계정 메뉴"): `마이 ▾` opens the signed-in
 * account, 내 공고, 관심 조건 수정, 알림 설정, 계정 관리 and 로그아웃. Arrow keys
 * move between items; Escape, Tab or a click outside closes it.
 */
export function AccountMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? list[0] : list[list.length - 1])?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const signOut = async () => {
    close(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
      >
        마이
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? "rotate-180" : ""}
        />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="계정 메뉴"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {email && (
            <p className="truncate px-3 pb-2 pt-1.5 text-xs text-slate-500">
              <span className="sr-only">로그인 계정 </span>
              {email}
            </p>
          )}
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              tabIndex={-1}
              onClick={() => close(false)}
              className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => void signOut()}
            className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
