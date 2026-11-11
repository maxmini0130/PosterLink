import Link from "next/link";
import { Children, type ReactNode } from "react";
import type { PosterViewSource } from "../../../lib/productEventsCore";
import { getDeadlinePresentation } from "../../../lib/deadlinePresentation";
import {
  cardDeadlineInput,
  deadlineVerificationFromRow,
  type DeadlineVerification,
} from "../../../lib/posterDeadlineFields";
import { cardTitleText } from "../../../lib/posterCardText";
import { resolvePosterImageGallery } from "../../../lib/posterImage";
import type { DiscoveryPoster } from "../../../lib/discoveryRoutes";
import type { PosterCardData } from "../PosterCard";
import { DeadlinePill, DeadlineRowText, DeadlineStamp } from "./DeadlineParts";
import { PosterThumb } from "./PosterThumb";
import { PosterArt } from "./PosterArt";
import { RegionLabel, type RegionScope } from "./RegionLabel";
import type { RegionCondition } from "../../../lib/browseRegion";

export type PlPosterCardData = PosterCardData & {
  posterStatus?: string | null;
  /** v6.1 confirmation columns; missing means nothing is confirmed. */
  deadlineVerification?: DeadlineVerification;
  /** The viewer marked this poster as applied. */
  applied?: boolean;
  /** Person-checked short title and eligibility (SPEC 6); never guessed. */
  shortTitle?: string | null;
  eligibility?: string | null;
  /** "○○구 주민만 신청 가능" / "[우대] ○○구 거주·생활권" (SPEC 8), from data only. */
  regionCondition?: RegionCondition | null;
};

/** The collection portal is never substituted for the actual organizer. */
export function discoveryPosterToCard(
  poster: DiscoveryPoster,
): PlPosterCardData {
  return {
    id: poster.id,
    title: poster.title,
    org: poster.organizer_name || undefined,
    applicationStartAt: poster.application_start_at,
    deadline: poster.application_end_at || undefined,
    deadlineType: poster.deadline_type,
    eventEndAt: poster.event_end_at,
    imageWidth: poster.imageWidth,
    imageHeight: poster.imageHeight,
    imageStatus: poster.imageStatus,
    regionLabel: poster.regionName,
    tags: [poster.categoryName, poster.regionName].filter(
      (value): value is string => Boolean(value),
    ),
    image: poster.thumbnail_url || undefined,
    images: poster.images,
    sourceUrl: poster.source_key || undefined,
    deadlineVerification: deadlineVerificationFromRow(poster),
  };
}

function cardParts(poster: PlPosterCardData) {
  const presentation = getDeadlinePresentation(cardDeadlineInput(poster));
  const [category] = poster.tags ?? [];
  const thumb =
    resolvePosterImageGallery(
      poster.images ?? [],
      poster.image,
      poster.sourceUrl,
    )[0] ?? null;
  const meta = [category, poster.org].filter(Boolean).join(" · ");
  return {
    presentation,
    thumb,
    meta,
    title: cardTitleText(poster.shortTitle || poster.title),
  };
}

/**
 * Redesigned list card (plan section 2 "공고 카드"): 56×72 thumbnail, category ·
 * organisation line, two-line title and deadline. The whole card is one link.
 * `footer` renders below the link for card actions (찜 취소, 신청 표시) so no
 * button sits inside the anchor.
 */
export function PosterListCard({
  poster,
  source,
  region,
  regionLabel,
  badge,
  footer,
}: {
  poster: PlPosterCardData;
  /** Recorded as the poster_view source when the card is clicked. */
  source?: PosterViewSource;
  region?: RegionScope;
  /** Overrides the region label wording, e.g. "경기 전체". */
  regionLabel?: string;
  /** Small text after the deadline, e.g. "찜" or "이 기기에 저장됨". */
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const { presentation, thumb, meta, title } = cardParts(poster);
  return (
    <article
      className={`rounded-xl border border-pl-line ${
        presentation.state === "closed" ? "bg-pl-closed" : "bg-pl-card"
      }`}
    >
      <Link
        href={`/posters/${poster.id}`}
        data-poster-source={source}
        className="flex min-h-[44px] gap-3 rounded-xl p-3 outline-offset-2 hover:bg-pl-paper/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
      >
        <div className="relative h-[80px] w-[60px] shrink-0">
          <div className="h-full w-full overflow-hidden rounded-md border border-pl-line">
            <PosterArt
              id={poster.id}
              src={thumb}
              title={poster.title}
              category={poster.tags?.[0]}
              organization={poster.org}
              imageWidth={poster.imageWidth}
              imageHeight={poster.imageHeight}
              imageStatus={poster.imageStatus}
              cardFit
            />
          </div>
          <DeadlineStamp presentation={presentation} variant="row" />
        </div>
        <div className="min-w-0 flex-1">
          {(meta || region) && (
            <p className="flex items-center gap-1.5 text-xs text-pl-meta">
              {region && <RegionLabel scope={region} label={regionLabel} />}
              <span className="truncate">{meta}</span>
            </p>
          )}
          <h3
            className={`mt-1 line-clamp-2 break-keep [overflow-wrap:anywhere] text-[14px] font-semibold leading-[1.4] ${
              presentation.state === "closed"
                ? "text-pl-ink-soft"
                : "text-pl-ink"
            }`}
          >
            {title}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <DeadlineRowText presentation={presentation} />
            {badge && <span className="text-xs text-pl-meta">{badge}</span>}
          </p>
        </div>
      </Link>
      {footer && (
        <div className="border-t border-pl-divider px-3 py-2">{footer}</div>
      )}
    </article>
  );
}

/** Small horizontal card for "7일 안에 마감" rails (168px wide). */
export function PosterMiniCard({
  poster,
  source,
  badge,
}: {
  poster: PlPosterCardData;
  source?: PosterViewSource;
  badge?: ReactNode;
}) {
  const { presentation, thumb, title } = cardParts(poster);
  return (
    <Link
      href={`/posters/${poster.id}`}
      data-poster-source={source}
      className="flex w-[168px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-pl-line bg-pl-card p-3 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
    >
      <div className="flex items-center justify-between gap-2">
        <DeadlinePill presentation={presentation} className="mb-0" />
        {badge && (
          <span className="text-xs font-bold text-pl-ink">{badge}</span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="h-12 w-9 shrink-0 overflow-hidden rounded">
          <PosterArt
            id={poster.id}
            src={thumb}
            title={poster.title}
            category={poster.tags?.[0]}
            organization={poster.org}
            imageWidth={poster.imageWidth}
            imageHeight={poster.imageHeight}
            imageStatus={poster.imageStatus}
          />
        </div>
        <h3 className="line-clamp-3 break-keep [overflow-wrap:anywhere] text-[13px] font-semibold leading-[1.38] text-pl-ink">
          {title}
        </h3>
      </div>
      {poster.org && (
        <p className="truncate text-xs text-pl-meta">{poster.org}</p>
      )}
    </Link>
  );
}

/** Horizontally scrolling list of PosterMiniCard. */
export function PosterMiniRail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="list"
      aria-label={label}
      className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-2"
    >
      {Children.map(children, (child) =>
        child ? (
          <div role="listitem" className="shrink-0 snap-start">
            {child}
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * Vertical card with the poster on top, for the home grid (screen plan v1.0,
 * 02: 80~100px thumbnail on phones, 90~110px on PC; 2 columns on phones).
 */
export function PosterTileCard({
  poster,
  source,
  badge,
  region,
  regionLabel,
}: {
  poster: PlPosterCardData;
  source?: PosterViewSource;
  badge?: ReactNode;
  region?: RegionScope;
  /** Overrides the region label wording, e.g. "서울 전체". */
  regionLabel?: string;
}) {
  const { presentation, thumb, meta, title } = cardParts(poster);
  return (
    <Link
      href={`/posters/${poster.id}`}
      data-poster-source={source}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-pl-line bg-pl-card outline-offset-2 hover:bg-pl-paper/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
    >
      <PosterThumb
        src={thumb}
        className="h-[92px] w-full rounded-none md:h-[104px]"
      />
      <div className="flex flex-1 flex-col gap-1 p-2.5 md:p-3">
        {(meta || region) && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-pl-meta">
            {region && <RegionLabel scope={region} label={regionLabel} />}
            <span className="truncate">{meta}</span>
          </p>
        )}
        <h3 className="line-clamp-2 break-keep [overflow-wrap:anywhere] text-[14px] font-semibold leading-[1.4] text-pl-ink">
          {title}
        </h3>
        <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1">
          <DeadlinePill presentation={presentation} className="mb-0" />
          {badge && <span className="text-xs text-pl-meta">{badge}</span>}
        </p>
      </div>
    </Link>
  );
}
