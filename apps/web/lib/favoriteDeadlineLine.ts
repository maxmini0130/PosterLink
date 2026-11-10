/**
 * The home "찜 마감 줄" (docs/design/v6.1/SPEC.md 4.6, 7.1, 9). Shown only when
 * a favourite is in the 4.6 target (not applied, confirmed date or date and
 * time, 0 ≤ D-n ≤ 3); one poster opens it, several open the favourites.
 */
import type { DeadlinePresentation } from "./deadlinePresentation";
import { POSTER_TIME_ZONE } from "./posterApplication";

export type FavoriteDeadlineItem = {
  id: string;
  presentation: DeadlinePresentation;
};

export type FavoriteDeadlineLine = {
  count: number;
  text: string;
  /** The soonest one, for the inline stamp. */
  soonest: DeadlinePresentation;
  href: string;
};

const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: POSTER_TIME_ZONE,
  weekday: "long",
});

function whenText(presentation: DeadlinePresentation, now: Date) {
  const days = presentation.dday ?? 0;
  if (days === 0)
    return presentation.state === "date_only" ? "오늘이 마감일" : "오늘 마감";
  if (days === 1) return "내일 마감";
  const day = new Date(now.getTime() + days * 86400000);
  return `${weekdayFormatter.format(day)} 마감`;
}

export function favoriteDeadlineLine(
  items: FavoriteDeadlineItem[],
  now: Date = new Date(),
): FavoriteDeadlineLine | null {
  const due = items
    .filter(
      (item) => item.presentation.homeAlert && item.presentation.dday !== null,
    )
    .sort((a, b) => (a.presentation.dday ?? 0) - (b.presentation.dday ?? 0));
  if (!due.length) return null;
  const soonest = due[0].presentation;
  if (due.length === 1)
    return {
      count: 1,
      text: `찜한 공고 1건 · ${whenText(soonest, now)}`,
      soonest,
      href: `/posters/${due[0].id}`,
    };
  return {
    count: due.length,
    // SPEC 12장 B: the several-posters wording is a proposal.
    text: `찜한 공고 ${due.length}건 · 3일 안에 마감`,
    soonest,
    href: "/my-posters",
  };
}
