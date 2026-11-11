"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { PosterViewSource } from "../../../lib/productEventsCore";
import type { DeadlinePresentation } from "../../../lib/deadlinePresentation";
import { cardOrganization, cardTitleText } from "../../../lib/posterCardText";
import { PosterArt } from "./PosterArt";
import { DeadlinePill, DeadlineStamp } from "./DeadlineParts";
import type { PlPosterCardData } from "./PosterListCard";
import type { RegionCondition } from "../../../lib/browseRegion";

/**
 * Region condition before the title (SPEC 8), in its short card wording:
 * "성동구 주민만", "성동구 거주·생활권만", "마포·서대문 생활권 우대". It is
 * never cut off: a long one wraps to a second line. The full wording is on
 * the detail and in the accessible name.
 */
export function RegionConditionLine({
  condition,
  className = "",
}: {
  condition: RegionCondition;
  className?: string;
}) {
  return (
    <p
      data-region-condition={condition.kind}
      className={`m-0 mb-0.5 break-keep [overflow-wrap:anywhere] text-[12px] font-semibold leading-[1.4] text-pl-ink ${className}`}
    >
      <span className="sr-only">
        {condition.kind === "preferred"
          ? `우대: ${condition.text}`
          : condition.text}
      </span>
      <span aria-hidden="true">{condition.short}</span>
    </p>
  );
}

/**
 * v6.1 poster card (docs/design/v6.1/SPEC.md 6): 5:7 poster with the stamp
 * and favourite button only, then deadline, short title (2 lines), confirmed
 * eligibility (2 lines, 1 on PC) and organisation (1 line). A missing
 * eligibility leaves its line empty; nothing is guessed.
 */
export function PlPosterCard({
  poster,
  presentation,
  favorite,
  busy,
  onFavorite,
  onOpen,
  source,
  priority = false,
  headingLevel = "h3",
}: {
  poster: PlPosterCardData;
  presentation: DeadlinePresentation;
  favorite: boolean;
  busy?: boolean;
  onFavorite?: () => void;
  onOpen?: () => void;
  source?: PosterViewSource;
  priority?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const href = `/posters/${poster.id}`;
  const title = cardTitleText(poster.shortTitle || poster.title);
  const org = cardOrganization(poster.org);
  const stamp = presentation.tone === "applied" ? null : presentation.stamp;
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-xl border border-pl-line ${
        presentation.state === "closed" ? "bg-pl-closed" : "bg-pl-card"
      }`}
      data-poster-card={poster.id}
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-pl-poster">
        <Link
          prefetch={false}
          href={href}
          data-poster-source={source}
          aria-label={poster.title}
          onClick={onOpen}
          className="absolute inset-0 block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-pl-ink"
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
            cardFit
          />
        </Link>
        {stamp && <DeadlineStamp presentation={presentation} />}
        {onFavorite && (
          <button
            type="button"
            aria-label={favorite ? "찜 취소" : "찜하기"}
            aria-pressed={favorite}
            disabled={busy}
            onClick={onFavorite}
            className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white">
              <Heart
                size={18}
                strokeWidth={2}
                fill={favorite ? "currentColor" : "none"}
                className="text-pl-ink"
                aria-hidden="true"
              />
            </span>
          </button>
        )}
      </div>
      <Link
        prefetch={false}
        href={href}
        data-poster-source={source}
        onClick={onOpen}
        className="block px-2.5 pb-2.5 pt-[9px] text-pl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pl-ink"
      >
        <DeadlinePill presentation={presentation} />
        {poster.regionCondition && (
          <RegionConditionLine condition={poster.regionCondition} />
        )}
        <Heading
          className={`line-clamp-2 h-[39px] break-keep [overflow-wrap:anywhere] text-[14px] font-semibold leading-[1.4] ${
            presentation.state === "closed" ? "text-pl-ink-soft" : ""
          }`}
        >
          {title}
        </Heading>
        <p className="mt-1 line-clamp-2 min-h-[35px] break-keep [overflow-wrap:anywhere] text-[12.5px] leading-[1.4] text-pl-ink md:line-clamp-1 md:min-h-[17.5px]">
          {poster.eligibility ?? ""}
        </p>
        <p className="mt-px truncate text-xs leading-[1.4] text-pl-meta">
          {org ?? ""}
        </p>
      </Link>
    </article>
  );
}
