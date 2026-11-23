import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePosterViews,
  getPosterViewPeriodStart,
  parsePosterViewPeriod,
} from "./posterViewStats";

const now = new Date("2026-11-23T03:00:00Z");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("counts views, 7-day views, unique visitors and last view per poster", () => {
  const { rows, totals } = aggregatePosterViews(
    [
      { poster_id: A, visitor_key: "v1", created_at: "2026-11-22T00:00:00Z" },
      { poster_id: A, visitor_key: "v1", created_at: "2026-11-01T00:00:00Z" },
      { poster_id: A, visitor_key: "v2", created_at: "2026-11-16T03:00:00Z" },
      { poster_id: B, visitor_key: "v1", created_at: "2026-11-10T00:00:00Z" },
    ],
    [{ poster_id: A }, { poster_id: A }, { poster_id: B }, { poster_id: null }],
    now,
  );

  assert.deepEqual(rows[0], {
    posterId: A,
    views: 3,
    views7d: 2, // 2026-11-16T03:00Z is exactly 7 days back: included
    uniqueVisitors: 2,
    linkClicks: 2,
    lastViewedAt: "2026-11-22T00:00:00.000Z",
  });
  assert.equal(rows[1].posterId, B);
  assert.equal(rows[1].views7d, 0);
  assert.equal(rows[1].linkClicks, 1);
  assert.deepEqual(totals, { views: 4, uniqueVisitors: 2, viewedPosters: 2, linkClicks: 3 });
});

test("rows without visitor_key each count as a separate visitor", () => {
  const { rows, totals } = aggregatePosterViews(
    [
      { poster_id: A, visitor_key: null, created_at: "2026-11-22T00:00:00Z" },
      { poster_id: A, visitor_key: null, created_at: "2026-11-22T01:00:00Z" },
    ],
    [],
    now,
  );
  assert.equal(rows[0].uniqueVisitors, 2);
  assert.equal(totals.uniqueVisitors, 2);
});

test("skips rows without poster_id and tolerates missing timestamps", () => {
  const { rows, totals } = aggregatePosterViews(
    [
      { poster_id: null, visitor_key: "v1", created_at: "2026-11-22T00:00:00Z" },
      { poster_id: B, visitor_key: "v1", created_at: null },
    ],
    [],
    now,
  );
  assert.equal(totals.views, 1);
  assert.equal(rows[0].lastViewedAt, null);
  assert.equal(rows[0].views7d, 0);
});

test("sorts by views, then most recent view", () => {
  const { rows } = aggregatePosterViews(
    [
      { poster_id: A, visitor_key: "v1", created_at: "2026-11-20T00:00:00Z" },
      { poster_id: B, visitor_key: "v1", created_at: "2026-11-21T00:00:00Z" },
    ],
    [],
    now,
  );
  assert.deepEqual(rows.map((row) => row.posterId), [B, A]);
});

test("period parsing only allows the offered windows", () => {
  assert.equal(parsePosterViewPeriod("7"), 7);
  assert.equal(parsePosterViewPeriod("90"), 90);
  assert.equal(parsePosterViewPeriod("365"), 30);
  assert.equal(parsePosterViewPeriod(null), 30);
  assert.equal(
    getPosterViewPeriodStart(7, now).toISOString(),
    "2026-11-16T03:00:00.000Z",
  );
});
