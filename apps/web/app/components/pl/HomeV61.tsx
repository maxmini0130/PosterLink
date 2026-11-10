"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, ChevronDown, ChevronRight, MapPin, Search } from "lucide-react";
import type { HomeCard, HomeSectionId } from "../../../lib/homeFeed";
import type { HomeChipId } from "../../../lib/homeChips";
import type { FavoriteDeadlineLine } from "../../../lib/favoriteDeadlineLine";
import { PlPosterCard } from "./PlPosterCard";
import { DeadlineStamp } from "./DeadlineParts";
import { PlChip } from "./PlControls";
import type { CardHandlers } from "./HomeSections";

/**
 * v6.1 home pieces (docs/design/v6.1/SPEC.md 7.1, 7.5): region title, the
 * favourite deadline line, field chips and the 2/4-column poster grid.
 */

/** Region title row; stays on screen while scrolling (SPEC 7.1). */
export function HomeRegionBar({
  scopeLabel,
  changeHref,
}: {
  scopeLabel: string;
  changeHref: string;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 flex h-12 items-center justify-between gap-2 bg-pl-paper/95 px-4 backdrop-blur md:static md:mx-0 md:h-auto md:bg-transparent md:px-0 md:backdrop-blur-none">
      <Link
        href={changeHref}
        aria-label={`둘러보는 지역: ${scopeLabel}. 바꾸기`}
        className="flex min-h-11 min-w-0 items-center gap-1.5 text-pl-ink"
      >
        <MapPin
          size={22}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0"
        />
        <span className="truncate font-pl-serif text-[22px] font-bold leading-none md:text-[34px]">
          {scopeLabel}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0" />
      </Link>
      <div className="flex shrink-0 items-center md:hidden">
        <Link
          href="/posters"
          aria-label="공고 찾기"
          className="flex h-11 w-11 items-center justify-center text-pl-ink"
        >
          <Search size={22} strokeWidth={2} aria-hidden="true" />
        </Link>
        <Link
          href="/notifications"
          aria-label="알림"
          className="flex h-11 w-11 items-center justify-center text-pl-ink"
        >
          <Bell size={22} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** "지원·강좌·행사 · 접수 중 N건" (SPEC 9). */
export function HomeSubtitle({ openTotal }: { openTotal: number | null }) {
  return (
    <p className="text-[13px] text-pl-meta md:mt-2 md:text-[14px]">
      지원·강좌·행사
      {openTotal !== null && ` · 접수 중 ${openTotal.toLocaleString()}건`}
    </p>
  );
}

/** The home "찜 마감 줄" with the soonest stamp. */
export function FavoriteDeadlineBanner({
  line,
}: {
  line: FavoriteDeadlineLine;
}) {
  return (
    <Link
      href={line.href}
      data-favorite-deadline-line
      className="flex min-h-[52px] items-center gap-3 rounded-xl border border-pl-line bg-pl-card px-3.5 py-2 text-[14px] font-semibold text-pl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink md:min-w-[360px]"
    >
      <DeadlineStamp presentation={line.soonest} variant="inline" />
      <span className="min-w-0 flex-1 truncate">{line.text}</span>
      <ChevronRight
        size={18}
        aria-hidden="true"
        className="shrink-0 text-pl-meta"
      />
    </Link>
  );
}

/** 전체 + chips that have enough open posters in the chosen region. */
export function HomeChipBar({
  chips,
  selected,
  onSelect,
}: {
  chips: Array<{ id: HomeChipId; label: string }>;
  selected: HomeChipId | null;
  onSelect: (chip: HomeChipId | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="분야"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <PlChip selected={selected === null} onClick={() => onSelect(null)}>
        전체
      </PlChip>
      {chips.map((chip) => (
        <PlChip
          key={chip.id}
          selected={selected === chip.id}
          onClick={() => onSelect(selected === chip.id ? null : chip.id)}
        >
          {chip.label}
        </PlChip>
      ))}
    </div>
  );
}

export function HomeSectionHead({
  id,
  title,
  action,
}: {
  id: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2
        id={id}
        className="font-pl-serif text-[20px] font-bold md:text-[24px]"
      >
        {title}
      </h2>
      {action}
    </div>
  );
}

/** "지난 방문 이후 N건 ›" toggle (SPEC 7.1). */
export function SinceLastVisitButton({
  count,
  active,
  onToggle,
}: {
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`inline-flex min-h-[34px] shrink-0 items-center gap-0.5 rounded-[17px] border px-3 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink ${
        active
          ? "border-pl-ink bg-pl-ink text-white"
          : "border-pl-ink bg-white text-pl-ink"
      }`}
    >
      {active ? "전체 보기" : `지난 방문 이후 ${count.toLocaleString()}건`}
      {!active && <ChevronRight size={15} aria-hidden="true" />}
    </button>
  );
}

function CardItem({
  item,
  sectionId,
  position,
  handlers,
  priority,
}: {
  item: HomeCard;
  sectionId: HomeSectionId;
  position: number;
  handlers: CardHandlers;
  priority: boolean;
}) {
  return (
    <PlPosterCard
      poster={item.card}
      presentation={item.presentation}
      favorite={handlers.favorites.has(item.id)}
      busy={handlers.busy.has(item.id)}
      onFavorite={() => handlers.onFavorite(item, sectionId)}
      onOpen={() => handlers.onOpen(item, sectionId, position)}
      source="home"
      priority={priority}
    />
  );
}

/** 2 columns on phones, 3 from 768, 4 from 1200 (SPEC 3: 4 → 3 → 2). */
export function HomeGrid({
  items,
  handlers,
  startPosition,
  priorityCount = 0,
}: {
  items: HomeCard[];
  handlers: CardHandlers;
  startPosition: number;
  priorityCount?: number;
}) {
  return (
    <ul
      data-home-grid
      className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 min-[1200px]:grid-cols-4"
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          data-feed-card={item.id}
          data-section="new"
          data-position={startPosition + index}
          className="min-w-0"
        >
          <CardItem
            item={item}
            sectionId="new"
            position={startPosition + index}
            handlers={handlers}
            priority={index < priorityCount}
          />
        </li>
      ))}
    </ul>
  );
}

/** A curated bundle between feed pages: sideways on phones, 4 columns on PC. */
export function HomeBundleRow({
  sectionId,
  title,
  href,
  items,
  handlers,
}: {
  sectionId: HomeSectionId;
  title: string;
  href: string;
  items: HomeCard[];
  handlers: CardHandlers;
}) {
  const headingId = `home-${sectionId}`;
  return (
    <section
      aria-labelledby={headingId}
      data-home-section={sectionId}
      className="-mx-4 mt-8 md:mx-0"
    >
      <div className="flex items-center justify-between gap-2 px-4 md:px-0">
        <h2 id={headingId} className="text-[17px] font-bold md:text-lg">
          {title}
        </h2>
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center text-[13.5px] underline-offset-2 hover:underline"
        >
          전체
        </Link>
      </div>
      <ul className="mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 min-[1200px]:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <li
            key={item.id}
            data-feed-card={item.id}
            data-section={sectionId}
            data-position={index + 1}
            className="w-[160px] shrink-0 snap-start md:w-auto md:[&:nth-child(n+5)]:hidden"
          >
            <CardItem
              item={item}
              sectionId={sectionId}
              position={index + 1}
              handlers={handlers}
              priority={false}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
