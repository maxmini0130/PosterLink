"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { PosterArt } from "./PosterArt";
import type { PlPosterCardData } from "./PosterListCard";
import type { DeadlineDisplay } from "../../../lib/deadlineDisplay";
export function FeedCard({
  poster,
  display,
  favorite,
  busy,
  onFavorite,
  priority = false,
}: {
  poster: PlPosterCardData;
  display: DeadlineDisplay;
  favorite: boolean;
  busy?: boolean;
  onFavorite: () => void;
  priority?: boolean;
}) {
  const place = poster.regionLabel || poster.tags?.[1];
  return (
    <article className="min-w-0" data-feed-card={poster.id}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-pl-line bg-[#ECE7DA]">
        <Link
          prefetch={false}
          href={`/posters/${poster.id}`}
          data-poster-source="home"
          aria-label={poster.title}
          className="absolute inset-0 block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-pl-accent"
        >
          <PosterArt
            id={poster.id}
            src={poster.image}
            title={poster.title}
            category={poster.tags?.[0]}
            organization={poster.org}
            imageWidth={poster.imageWidth}
            imageHeight={poster.imageHeight}
            imageStatus={poster.imageStatus}
            priority={priority}
            feed
          />
        </Link>
        <span
          className={`pointer-events-none absolute left-2 top-2 max-w-[calc(100%-60px)] rounded px-2 py-1 text-[11px] font-bold text-white md:text-xs ${display.dateTrusted ? "bg-pl-accent" : "bg-pl-ink/90"}`}
        >
          {display.text}
        </span>
        <button
          type="button"
          aria-label={favorite ? "찜 취소" : "찜하기"}
          aria-pressed={favorite}
          disabled={busy}
          onClick={onFavorite}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-accent"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm">
            <Heart
              size={18}
              fill={favorite ? "currentColor" : "none"}
              className={favorite ? "text-pl-accent" : "text-pl-ink"}
              aria-hidden="true"
            />
          </span>
        </button>
      </div>
      <Link
        prefetch={false}
        href={`/posters/${poster.id}`}
        data-poster-source="home"
        className="mt-2 block px-0.5 text-pl-ink"
      >
        <h2 className="line-clamp-2 text-[14px] font-bold leading-[1.4] md:text-[15px]">
          {poster.title}
        </h2>
        <p className="mt-1 truncate text-xs text-pl-meta md:text-[13px]">
          {[place, poster.org].filter(Boolean).join(" · ") ||
            "대상 지역은 원문에서 확인"}
        </p>
      </Link>
    </article>
  );
}
