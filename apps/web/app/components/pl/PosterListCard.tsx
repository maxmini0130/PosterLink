import Link from "next/link";
import { Children, type ReactNode } from "react";
import type { PosterViewSource } from "../../../lib/productEventsCore";
import { getDeadlineDisplay } from "../../../lib/deadlineDisplay";
import { resolvePosterImageGallery } from "../../../lib/posterImage";
import type { DiscoveryPoster } from "../../../lib/discoveryRoutes";
import type { PosterCardData } from "../PosterCard";
import { DeadlineLabel } from "./DeadlineLabel";
import { PosterThumb } from "./PosterThumb";
import { RegionLabel, type RegionScope } from "./RegionLabel";

export type PlPosterCardData = PosterCardData & {
  posterStatus?: string | null;
};

/** Card data from a public discovery row (same organisation rule as institution pages). */
export function discoveryPosterToCard(
  poster: DiscoveryPoster,
): PlPosterCardData {
  return {
    id: poster.id,
    title: poster.title,
    org:
      poster.verification_status === "verified" && poster.verified_at
        ? poster.organizer_name || poster.source_org_name || undefined
        : poster.source_org_name || undefined,
    applicationStartAt: poster.application_start_at,
    deadline: poster.application_end_at || undefined,
    deadlineType: poster.deadline_type,
    tags: [poster.categoryName, poster.regionName].filter(
      (value): value is string => Boolean(value),
    ),
    image: poster.thumbnail_url || undefined,
    images: poster.images,
    sourceUrl: poster.source_key || undefined,
  };
}

function cardParts(poster: PlPosterCardData) {
  const display = getDeadlineDisplay({
    applicationStartAt: poster.applicationStartAt,
    applicationEndAt: poster.deadline,
    deadlineType: poster.deadlineType,
    posterStatus:
      poster.posterStatus ??
      (poster.contentState === "closed" ? "closed" : null),
  });
  const [category] = poster.tags ?? [];
  const thumb =
    resolvePosterImageGallery(
      poster.images ?? [],
      poster.image,
      poster.sourceUrl,
    )[0] ?? null;
  const meta = [category, poster.org].filter(Boolean).join(" · ");
  return { display, thumb, meta };
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
  badge,
  footer,
}: {
  poster: PlPosterCardData;
  /** Recorded as the poster_view source when the card is clicked. */
  source?: PosterViewSource;
  region?: RegionScope;
  /** Small text after the deadline, e.g. "찜" or "이 기기에 저장됨". */
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const { display, thumb, meta } = cardParts(poster);
  return (
    <article className="rounded-xl border border-pl-line bg-pl-card">
      <Link
        href={`/posters/${poster.id}`}
        data-poster-source={source}
        className="flex min-h-[44px] gap-3 rounded-xl p-3 outline-offset-2 hover:bg-pl-paper/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
      >
        <PosterThumb src={thumb} />
        <div className="min-w-0 flex-1">
          {(meta || region) && (
            <p className="flex items-center gap-1.5 text-xs text-pl-meta">
              {region && <RegionLabel scope={region} />}
              <span className="truncate">{meta}</span>
            </p>
          )}
          <h3 className="mt-1 line-clamp-2 font-pl-serif text-[15px] font-bold leading-[1.38] text-pl-ink">
            {poster.title}
          </h3>
          <p className="mt-1.5 flex items-center gap-2">
            <DeadlineLabel display={display} />
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
  const { display, thumb } = cardParts(poster);
  return (
    <Link
      href={`/posters/${poster.id}`}
      data-poster-source={source}
      className="flex w-[168px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-pl-line bg-pl-card p-3 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
    >
      <div className="flex items-center justify-between gap-2">
        <DeadlineLabel display={display} showDate={false} />
        {badge && (
          <span className="text-xs font-bold text-pl-accent">{badge}</span>
        )}
      </div>
      <div className="flex gap-2">
        <PosterThumb src={thumb} className="h-12 w-9" />
        <h3 className="line-clamp-3 text-[13px] font-bold leading-[1.38] text-pl-ink">
          {poster.title}
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
