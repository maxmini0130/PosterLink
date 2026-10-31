"use client";

import { Heart } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Bottom action bar on mobile detail screens: 찜하기 on the left, the primary
 * action on the right. Hidden from xl (1280px) up, where the detail page uses its side
 * action box instead.
 */
export function ActionBar({
  favorited,
  onToggleFavorite,
  favoriteBusy,
  primary,
}: {
  favorited: boolean;
  onToggleFavorite: () => void;
  favoriteBusy?: boolean;
  /** The primary link or button (신청 페이지로 이동 / 공식 공고 확인하기 …). */
  primary: ReactNode;
}) {
  // Toasts render outside the page; lift them above this bar while it is shown.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("pl-action-bar-open");
    return () => root.classList.remove("pl-action-bar-open");
  }, []);

  return (
    <div
      role="group"
      aria-label="공고 행동"
      className="pl-action-bar fixed inset-x-0 z-40 flex items-center gap-2 border-t border-pl-line bg-pl-card px-5 py-2.5 xl:hidden"
    >
      <FavoriteButton
        favorited={favorited}
        onToggle={onToggleFavorite}
        busy={favoriteBusy}
      />
      <div className="min-w-0 flex-1">{primary}</div>
    </div>
  );
}

/** 찜하기 / 찜함 toggle with text, usable in the bar and the PC action box. */
export function FavoriteButton({
  favorited,
  onToggle,
  busy,
  className = "",
}: {
  favorited: boolean;
  onToggle: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={favorited}
      disabled={busy}
      onClick={onToggle}
      className={`inline-flex min-h-[44px] min-w-[72px] items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-bold disabled:opacity-60 ${
        favorited
          ? "border-pl-accent text-pl-accent"
          : "border-pl-line text-pl-ink"
      } ${className}`}
    >
      <Heart
        size={18}
        aria-hidden="true"
        fill={favorited ? "currentColor" : "none"}
      />
      {favorited ? "찜함" : "찜하기"}
    </button>
  );
}

/** Primary action as a link styled for the bar or the PC action box. */
export function PrimaryActionLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-pl-accent px-4 text-sm font-bold text-white hover:brightness-95"
    >
      {children}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}
