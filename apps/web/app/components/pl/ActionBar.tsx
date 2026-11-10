"use client";

import { ExternalLink, Heart } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Bottom action bar on mobile detail screens (v6.1 SPEC 7.2): [찜] [extra]
 * [primary ↗]. Hidden from xl (1280px) up, where the detail page shows the
 * same buttons beside the summary.
 */
export function ActionBar({
  favorited,
  onToggleFavorite,
  favoriteBusy,
  extra,
  primary,
}: {
  favorited: boolean;
  onToggleFavorite: () => void;
  favoriteBusy?: boolean;
  /** Optional middle button (신청했어요, stage 6). */
  extra?: ReactNode;
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
      className="pl-action-bar fixed inset-x-0 z-40 flex items-center gap-2 border-t border-pl-line bg-pl-card px-4 py-[13px] xl:hidden"
    >
      <FavoriteButton
        favorited={favorited}
        onToggle={onToggleFavorite}
        busy={favoriteBusy}
        iconOnly
      />
      {extra}
      <div className="min-w-0 flex-1">{primary}</div>
    </div>
  );
}

/** 찜 toggle: a square heart in the bar, with text in the PC action row. */
export function FavoriteButton({
  favorited,
  onToggle,
  busy,
  className = "",
  iconOnly = false,
}: {
  favorited: boolean;
  onToggle: () => void;
  busy?: boolean;
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={favorited ? "찜 취소" : "찜하기"}
      disabled={busy}
      onClick={onToggle}
      className={`inline-flex h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-pl-line-strong bg-white text-[14px] font-semibold text-pl-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink ${
        iconOnly ? "w-[52px]" : "px-4"
      } ${className}`}
    >
      <Heart
        size={20}
        strokeWidth={2}
        aria-hidden="true"
        fill={favorited ? "currentColor" : "none"}
      />
      {!iconOnly && (favorited ? "찜함" : "찜")}
    </button>
  );
}

/**
 * Primary action (ink, opens the official page in a new tab). After 신청했어요
 * it turns into an outline button (SPEC 5).
 */
export function PrimaryActionLink({
  href,
  children,
  onClick,
  outline = false,
}: {
  href: string;
  children: ReactNode;
  onClick?: () => void;
  outline?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`flex h-[46px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-pl-ink px-4 text-[14px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink ${
        outline
          ? "bg-white text-pl-ink"
          : "bg-pl-ink text-white hover:brightness-110"
      }`}
    >
      {children}
      <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}
