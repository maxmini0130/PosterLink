"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { PosterArt } from "./PosterArt";
import type { PlPosterCardData } from "./PosterListCard";
import type { DeadlineDisplay } from "../../../lib/deadlineDisplay";

export type FeedCardPoster = PlPosterCardData & {
  /** `지역 문구 · 신청 대상`; the line is left out when null. */
  metaLine?: string | null;
  /** Confirmed key fact (and event day); left out when null. */
  benefitLine?: string | null;
};

/**
 * Home poster card (UI plan 3-4 C 「포스터 카드」): 3:4 poster, deadline badge,
 * favorite button, then title (2 lines) / region · target / one key fact.
 * Unconfirmed lines are left out, never filled with a guess.
 */
export function FeedCard({
  poster,
  display,
  favorite,
  busy,
  onFavorite,
  onOpen,
  priority = false,
  variant = "feed",
  headingLevel = "h3",
  sectionId,
  position,
}: {
  poster: FeedCardPoster;
  display: DeadlineDisplay;
  favorite: boolean;
  busy?: boolean;
  onFavorite: () => void;
  /** Called when the card is opened (measurement). */
  onOpen?: () => void;
  priority?: boolean;
  /** "row": narrow card of a sideways row on phones. */
  variant?: "feed" | "row";
  headingLevel?: "h2" | "h3";
  sectionId?: string;
  position?: number;
}) {
  const Heading = headingLevel;
  const row = variant === "row";
  return (
    <article
      className="min-w-0"
      data-feed-card={poster.id}
      data-section={sectionId}
      data-position={position}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-pl-line bg-[#ECE7DA]">
        <Link
          prefetch={false}
          href={`/posters/${poster.id}`}
          data-poster-source="home"
          aria-label={poster.title}
          onClick={onOpen}
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
        onClick={onOpen}
        className="mt-2 flex flex-col gap-[3px] px-0.5 text-pl-ink"
      >
        <Heading
          className={`line-clamp-2 break-keep font-bold leading-[1.4] ${row ? "text-[13.5px]" : "text-[14px] md:text-[15px]"}`}
        >
          {poster.title}
        </Heading>
        {poster.metaLine && (
          <p
            className={`truncate text-pl-sub ${row ? "text-xs" : "text-xs md:text-[13px]"}`}
          >
            {poster.metaLine}
          </p>
        )}
        {poster.benefitLine && (
          <p
            className={`truncate font-bold text-pl-green ${row ? "text-xs" : "text-xs md:text-[13px]"}`}
          >
            {poster.benefitLine}
          </p>
        )}
      </Link>
    </article>
  );
}
