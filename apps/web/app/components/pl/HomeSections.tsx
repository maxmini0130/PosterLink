"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeedCard } from "./FeedCard";
import { InstitutionFollowButton } from "../../institutions/InstitutionFollowButton";
import { POSTER_THEMES } from "../../../lib/defaultPoster";
import type {
  HomeCard,
  HomeSectionId,
  OrgSuggestion,
} from "../../../lib/homeFeed";
import type { HomeShortcut } from "../../../lib/homeFeedServer";

export type CardHandlers = {
  favorites: ReadonlySet<string>;
  busy: ReadonlySet<string>;
  onFavorite: (card: HomeCard, sectionId: HomeSectionId) => void;
  onOpen: (card: HomeCard, sectionId: HomeSectionId, position: number) => void;
};

export function SectionTitle({
  id,
  title,
  extra,
  action,
}: {
  id: string;
  title: string;
  extra?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-4 md:px-0">
      <h2 id={id} className="text-[17px] font-bold md:text-lg">
        {title}
        {extra && (
          <span className="ml-1.5 text-[13px] font-medium text-pl-meta">
            {extra}
          </span>
        )}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="inline-flex min-h-11 shrink-0 items-center text-[13.5px] underline-offset-2 hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * A sideways row of narrow cards on phones; four columns from 768px (the
 * first four cards). Same card component as the feed, smaller scale.
 */
export function PosterRow({
  sectionId,
  title,
  extra,
  action,
  items,
  handlers,
  priorityCount = 0,
  band = false,
}: {
  sectionId: HomeSectionId;
  title: string;
  extra?: ReactNode;
  action?: { href: string; label: string };
  items: HomeCard[];
  handlers: CardHandlers;
  priorityCount?: number;
  /** Curated bundle: tinted band across the page. */
  band?: boolean;
}) {
  const headingId = `home-${sectionId}`;
  return (
    <section
      aria-labelledby={headingId}
      data-home-section={sectionId}
      className={
        band
          ? "-mx-4 mt-7 bg-pl-band pb-6 pt-5 md:-mx-6 md:rounded-none md:px-6 min-[1200px]:-mx-10 min-[1200px]:px-10"
          : "-mx-4 mt-7 md:mx-0"
      }
    >
      <SectionTitle
        id={headingId}
        title={title}
        extra={extra}
        action={action}
      />
      <ul className="mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="w-[150px] shrink-0 snap-start md:w-auto md:[&:nth-child(n+5)]:hidden"
          >
            <FeedCard
              poster={item.card}
              display={item.display}
              favorite={handlers.favorites.has(item.id)}
              busy={handlers.busy.has(item.id)}
              onFavorite={() => handlers.onFavorite(item, sectionId)}
              onOpen={() => handlers.onOpen(item, sectionId, index + 1)}
              priority={index < priorityCount}
              variant="row"
              sectionId={sectionId}
              position={index + 1}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PosterGrid({
  items,
  handlers,
  startPosition,
  priorityCount = 0,
}: {
  items: HomeCard[];
  handlers: CardHandlers;
  /** 1-based position of the first card within "새로 올라온 공고". */
  startPosition: number;
  priorityCount?: number;
}) {
  return (
    <ul className="feed-grid mt-3">
      {items.map((item, index) => (
        <li key={item.id}>
          <FeedCard
            poster={item.card}
            display={item.display}
            favorite={handlers.favorites.has(item.id)}
            busy={handlers.busy.has(item.id)}
            onFavorite={() => handlers.onFavorite(item, "new")}
            onOpen={() => handlers.onOpen(item, "new", startPosition + index)}
            priority={index < priorityCount}
            sectionId="new"
            position={startPosition + index}
          />
        </li>
      ))}
    </ul>
  );
}

export function CategoryShortcuts({ items }: { items: HomeShortcut[] }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="분야 바로가기"
      className="mt-5 grid grid-cols-4 gap-x-1.5 gap-y-3.5 md:grid-cols-8 md:gap-3"
    >
      {items.map((item) => {
        const theme =
          POSTER_THEMES.find((t) => t.code === item.code) ?? POSTER_THEMES[7];
        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex min-h-11 flex-col items-center gap-1.5 text-center text-[12.5px] font-medium text-pl-ink md:text-[13px]"
          >
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-pl-line bg-pl-card"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={theme.icon} />
              </svg>
            </span>
            <span className="break-keep">{theme.label.replace("/", "·")}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function OrgSuggestions({
  items,
  returnPath,
}: {
  items: OrgSuggestion[];
  returnPath: string;
}) {
  return (
    <section
      aria-labelledby="home-org"
      data-home-section="org"
      className="-mx-4 mt-7 md:mx-0"
    >
      <SectionTitle
        id="home-org"
        title="팔로우할 만한 기관"
        action={{ href: "/institutions", label: "기관 찾기" }}
      />
      <ul className="mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((org) => (
          <li
            key={org.id}
            className="flex w-[150px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-pl-line bg-pl-card px-3 py-3.5 text-center md:w-auto md:[&:nth-child(n+5)]:hidden"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-pl-ink font-pl-serif font-bold text-white"
            >
              {org.name.slice(0, 1)}
            </span>
            <Link
              href={`/institutions/${org.slug}`}
              className="line-clamp-2 text-[13.5px] font-bold leading-[1.35] underline-offset-2 hover:underline"
            >
              {org.name}
            </Link>
            <span className="text-xs font-bold text-pl-accent">
              새 공고 {org.recentCount}
            </span>
            <InstitutionFollowButton
              institutionId={org.id}
              returnPath={returnPath}
              variant="pl"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
