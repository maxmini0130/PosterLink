// Poster detail-view counts for the admin "포스터 조회수" page.
//
// Source: poster_view_logs, one row per detail-page open. The client skips a
// repeat open of the same poster in the same browser within 30 minutes
// (lib/posterMetrics.ts logPosterView), so a "view" is a 30-minute-deduplicated
// detail open, not a raw page load. Raw logs are purged after 3 calendar months
// (usage_log_retention), so counts never reach further back than that.

export const POSTER_VIEW_PERIOD_DAYS = [7, 30, 90] as const;
export type PosterViewPeriodDays = (typeof POSTER_VIEW_PERIOD_DAYS)[number];
export const DEFAULT_POSTER_VIEW_PERIOD: PosterViewPeriodDays = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PosterViewLogRow = {
  poster_id: string | null;
  visitor_key: string | null;
  created_at: string | null;
};

export type PosterClickLogRow = {
  poster_id: string | null;
};

export type PosterViewStat = {
  posterId: string;
  views: number;
  views7d: number;
  uniqueVisitors: number;
  linkClicks: number;
  lastViewedAt: string | null;
};

export type PosterViewTotals = {
  views: number;
  uniqueVisitors: number;
  viewedPosters: number;
  linkClicks: number;
};

export function parsePosterViewPeriod(value: string | null): PosterViewPeriodDays {
  const parsed = Number(value);
  return (POSTER_VIEW_PERIOD_DAYS as readonly number[]).includes(parsed)
    ? (parsed as PosterViewPeriodDays)
    : DEFAULT_POSTER_VIEW_PERIOD;
}

export function getPosterViewPeriodStart(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

// Rows without a visitor_key cannot be told apart, so each one counts as its
// own visitor. That can only overstate unique visitors, never hide a view.
function visitorIdentity(row: PosterViewLogRow, index: number) {
  return row.visitor_key ? `k:${row.visitor_key}` : `row:${index}`;
}

export function aggregatePosterViews(
  views: PosterViewLogRow[],
  clicks: PosterClickLogRow[],
  now: Date,
): { rows: PosterViewStat[]; totals: PosterViewTotals } {
  const sevenDaysAgo = now.getTime() - 7 * DAY_MS;
  const byPoster = new Map<
    string,
    { views: number; views7d: number; visitors: Set<string>; lastViewedMs: number }
  >();
  const allVisitors = new Set<string>();
  let totalViews = 0;

  views.forEach((row, index) => {
    if (!row.poster_id) return;
    const createdMs = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    const visitor = visitorIdentity(row, index);
    let entry = byPoster.get(row.poster_id);
    if (!entry) {
      entry = { views: 0, views7d: 0, visitors: new Set(), lastViewedMs: Number.NaN };
      byPoster.set(row.poster_id, entry);
    }
    entry.views += 1;
    entry.visitors.add(visitor);
    if (Number.isFinite(createdMs)) {
      if (createdMs >= sevenDaysAgo) entry.views7d += 1;
      if (!Number.isFinite(entry.lastViewedMs) || createdMs > entry.lastViewedMs) {
        entry.lastViewedMs = createdMs;
      }
    }
    allVisitors.add(visitor);
    totalViews += 1;
  });

  const clickCounts = new Map<string, number>();
  let totalClicks = 0;
  for (const row of clicks) {
    if (!row.poster_id) continue;
    clickCounts.set(row.poster_id, (clickCounts.get(row.poster_id) ?? 0) + 1);
    totalClicks += 1;
  }

  const rows: PosterViewStat[] = [...byPoster.entries()].map(([posterId, entry]) => ({
    posterId,
    views: entry.views,
    views7d: entry.views7d,
    uniqueVisitors: entry.visitors.size,
    linkClicks: clickCounts.get(posterId) ?? 0,
    lastViewedAt: Number.isFinite(entry.lastViewedMs)
      ? new Date(entry.lastViewedMs).toISOString()
      : null,
  }));

  rows.sort(
    (a, b) =>
      b.views - a.views ||
      (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? "") ||
      a.posterId.localeCompare(b.posterId),
  );

  return {
    rows,
    totals: {
      views: totalViews,
      uniqueVisitors: allVisitors.size,
      viewedPosters: rows.length,
      linkClicks: totalClicks,
    },
  };
}
