"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, ExternalLink, Heart } from "lucide-react";
import type { PlPosterCardData } from "../components/pl/PosterListCard";
import { PosterArt } from "../components/pl/PosterArt";
import { DeadlineStamp } from "../components/pl/DeadlineParts";
import { PlButton, plButtonClass } from "../components/pl/PlControls";
import { GuideCard } from "../components/pl/GuideCard";
import {
  groupFavorites,
  type FavoriteEntry,
  type FavoriteRowItem,
} from "../../lib/favoritesV61";
import { cardOrganization, cardTitleText } from "../../lib/posterCardText";
import { isPublicHttpUrl } from "../../lib/posterActionLinks";
import { spokenDateTime } from "../../lib/deadlinePresentation";
import type { HomeCard } from "../../lib/homeFeed";
import { loadBrowseRegionId } from "../lib/browseRegionClient";

/**
 * v6.1 찜 (docs/design/v6.1/SPEC.md 7.4, 9): four groups, soonest first, the
 * D-3 rows open their buttons, applied posters gather in 신청한 공고.
 */

export type FavoriteCard = PlPosterCardData & {
  /** Confirmed 선정 안내 time, shown under an applied poster. */
  selectionNoticeAt?: string | null;
};

type Actions = {
  favoriteIds: ReadonlySet<string>;
  busyId: string | null;
  onToggleFavorite: (posterId: string) => void;
  onMark: (posterId: string) => void;
  onUnmark: (posterId: string) => void;
};

function Pill({ item }: { item: FavoriteRowItem<FavoriteCard> }) {
  const { presentation } = item;
  const tone =
    presentation.tone === "muted"
      ? "bg-pl-pill-muted font-medium text-pl-meta"
      : "bg-pl-pill font-semibold text-pl-ink";
  return (
    <span
      className={`inline-block max-w-full truncate rounded-md px-[7px] py-[2px] text-[12px] leading-[1.4] ${tone}`}
    >
      {presentation.row}
    </span>
  );
}

function Row({
  item,
  actions,
  muted = false,
}: {
  item: FavoriteRowItem<FavoriteCard>;
  actions: Actions;
  muted?: boolean;
}) {
  const { card, presentation, expanded } = item;
  const applied = presentation.tone === "applied";
  const href = `/posters/${card.id}`;
  const busy = actions.busyId === card.id;
  const official =
    card.sourceUrl && isPublicHttpUrl(card.sourceUrl) ? card.sourceUrl : null;
  const meta = applied
    ? (spokenDateTime(card.selectionNoticeAt) &&
        `${spokenDateTime(card.selectionNoticeAt)} 선정 안내 예정`) ||
      cardOrganization(card.org)
    : [card.eligibility, cardOrganization(card.org)]
        .filter(Boolean)
        .join(" · ");
  const favorite = actions.favoriteIds.has(card.id);
  return (
    <li
      data-favorite-row={card.id}
      className={`rounded-xl border border-pl-line p-3 ${muted ? "bg-pl-closed" : "bg-pl-card"}`}
    >
      <div className="flex gap-3">
        <Link
          href={href}
          data-poster-source="favorites"
          className="relative block h-[84px] w-[64px] shrink-0"
        >
          <span className="block h-full w-full overflow-hidden rounded-md border border-pl-line">
            <PosterArt
              id={card.id}
              src={card.image}
              title={card.title}
              category={card.tags?.[0]}
              organization={card.org}
              imageWidth={card.imageWidth}
              imageHeight={card.imageHeight}
              imageStatus={card.imageStatus}
              cardFit
            />
          </span>
          <DeadlineStamp presentation={presentation} variant="row" />
        </Link>
        <div className="min-w-0 flex-1">
          {applied ? (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-pl-ok">
                <Check size={14} strokeWidth={3} aria-hidden="true" />
                신청했어요
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => actions.onUnmark(card.id)}
                className="min-h-8 shrink-0 text-[13px] text-pl-ink-soft underline underline-offset-2 disabled:opacity-60"
              >
                되돌리기
              </button>
            </div>
          ) : (
            <Pill item={item} />
          )}
          <Link
            href={href}
            data-poster-source="favorites"
            className={`mt-1 line-clamp-2 break-keep text-[14.5px] font-semibold leading-[1.4] ${
              muted ? "text-pl-ink-soft" : "text-pl-ink"
            }`}
          >
            {cardTitleText(card.shortTitle || card.title)}
          </Link>
          {meta && (
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-pl-meta">
              {meta}
            </p>
          )}
        </div>
        {!applied && (
          <button
            type="button"
            aria-label={favorite ? "찜 취소" : "찜하기"}
            aria-pressed={favorite}
            disabled={busy}
            onClick={() => actions.onToggleFavorite(card.id)}
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-pl-ink disabled:opacity-60"
          >
            <Heart
              size={22}
              strokeWidth={2}
              fill={favorite ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      {expanded && !applied && (
        <div className="mt-3 flex gap-2">
          {official ? (
            <a
              href={official}
              target="_blank"
              rel="noopener noreferrer"
              className={plButtonClass("outline", "min-w-0 flex-1")}
            >
              공식 공고 확인하기
              <ExternalLink size={15} aria-hidden="true" />
              <span className="sr-only"> (새 창)</span>
            </a>
          ) : (
            <Link
              href={href}
              className={plButtonClass("outline", "min-w-0 flex-1")}
            >
              공고 보기
            </Link>
          )}
          <PlButton
            disabled={busy}
            onClick={() => actions.onMark(card.id)}
            className="shrink-0"
          >
            <Check size={15} aria-hidden="true" />
            신청했어요
          </PlButton>
        </div>
      )}
    </li>
  );
}

function Group({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={title ? id : undefined}
      aria-label={title ? undefined : "마감일이 확인된 공고"}
      data-fav-group={id}
    >
      {title && (
        <div className="mb-2.5 flex items-center gap-3">
          <h2
            id={id}
            className="m-0 shrink-0 text-[14px] font-medium text-pl-meta"
          >
            {title}
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-pl-line" />
          {aside}
        </div>
      )}
      <ul className="m-0 list-none space-y-2.5 p-0">{children}</ul>
    </section>
  );
}

/**
 * "이번 주에 마감되는 공고" for an empty 찜 (SPEC 7.4): confirmed deadlines
 * closing by this Sunday in the browsed region (the one chosen on the home).
 */
function DueThisWeek({ actions }: { actions: Actions }) {
  const [items, setItems] = useState<FavoriteRowItem<FavoriteCard>[] | null>(
    null,
  );
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadBrowseRegionId()
      .catch(() => null)
      .then((regionId) => {
        const params = new URLSearchParams({ pages: "1", due: "week" });
        if (regionId) params.set("region", regionId);
        return fetch(`/api/home?${params}`, { cache: "no-store" });
      })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          feed: {
            scopeLabel?: string;
            layout?: { dueWeek?: HomeCard[] };
          } | null,
        ) => {
          if (!active) return;
          const cards = feed?.layout?.dueWeek ?? [];
          setScope(feed?.scopeLabel ?? null);
          setItems(
            cards.map((card) => ({
              card: card.card,
              presentation: card.presentation,
              expanded: false,
            })),
          );
        },
      )
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);
  if (!items?.length) return null;
  return (
    <Group
      id="fav-due-week"
      title="이번 주에 마감되는 공고"
      aside={
        scope ? (
          <span className="shrink-0 text-[12.5px] text-pl-meta">{scope}</span>
        ) : null
      }
    >
      {items.map((item) => (
        <Row key={item.card.id} item={item} actions={actions} />
      ))}
    </Group>
  );
}

export function FavoritesV61({
  entries,
  actions,
  pcNote = true,
}: {
  entries: FavoriteEntry<FavoriteCard>[];
  actions: Actions;
  pcNote?: boolean;
}) {
  const groups = groupFavorites(entries);
  const header = (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="m-0 font-pl-serif text-[26px] font-bold xl:text-[30px]">
          찜
        </h1>
        {entries.length > 0 && (
          <span className="text-[13px] text-pl-meta">마감이 가까운 순</span>
        )}
      </div>
      {entries.length > 0 && (
        <p className="m-0 mt-1 text-[14px] text-pl-meta">
          접수 중 {groups.openCount}건 · 이번 주 마감 {groups.dueThisWeek}건
        </p>
      )}
    </div>
  );

  if (!entries.length)
    return (
      <div className="space-y-6">
        {header}
        <GuideCard
          title="아직 찜한 공고가 없어요"
          action={{ href: "/posters", label: "공고 둘러보기" }}
        >
          공고의 ♡를 누르면 여기에 모이고, 마감이 가까운 순서로 정리돼요.
        </GuideCard>
        <DueThisWeek actions={actions} />
      </div>
    );

  const left = (
    <div className="min-w-0 space-y-6">
      {groups.confirmed.length > 0 && (
        <Group id="fav-confirmed">
          {groups.confirmed.map((item) => (
            <Row key={item.card.id} item={item} actions={actions} />
          ))}
        </Group>
      )}
      {groups.noAlert.length > 0 && (
        <Group
          id="fav-no-alert"
          title={`마감 알림이 없는 공고 ${groups.noAlert.length}건`}
        >
          {groups.noAlert.map((item) => (
            <Row key={item.card.id} item={item} actions={actions} />
          ))}
        </Group>
      )}
    </div>
  );
  const right = (groups.applied.length > 0 || groups.closed.length > 0) && (
    <div className="min-w-0 space-y-6">
      {groups.applied.length > 0 && (
        <Group
          id="fav-applied"
          title={`신청한 공고 ${groups.applied.length}건`}
        >
          {groups.applied.map((item) => (
            <Row key={item.card.id} item={item} actions={actions} />
          ))}
        </Group>
      )}
      {pcNote && groups.applied.length > 0 && (
        <p className="m-0 hidden text-[13px] text-pl-meta xl:block">
          신청한 공고는 홈의 마감 알림에서 빠져요.
        </p>
      )}
      {groups.closed.length > 0 && (
        <Group
          id="fav-closed"
          title={`마감된 공고 ${groups.closed.length}건`}
          aside={
            <Link
              href="/posters"
              className="inline-flex min-h-8 shrink-0 items-center text-[13px] font-semibold text-pl-ink"
            >
              비슷한 접수 중 공고 보기
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          }
        >
          {groups.closed.map((item) => (
            <Row key={item.card.id} item={item} actions={actions} muted />
          ))}
        </Group>
      )}
    </div>
  );
  return (
    <div>
      {header}
      <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-8 xl:space-y-0">
        {left}
        {right}
      </div>
    </div>
  );
}
