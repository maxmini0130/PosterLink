import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_WRITE_INTERVAL_MS,
  BASELINE_MAX_AGE_MS,
  CLOCK_SKEW_MS,
  VISIT_GAP_MS,
  laterVisit,
  parseVisitState,
  shouldSyncVisit,
  touchVisit,
  type VisitState,
} from "./visitBaseline";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const T0 = Date.parse("2026-11-01T09:00:00+09:00");

/** Replays activity at the given times; the browser keeps every state. */
function replay(times: number[], start: VisitState | null = null) {
  let stored = start;
  const baselines: Array<number | null> = [];
  for (const now of times) {
    stored = touchVisit(stored, now).state;
    baselines.push(stored.baselineAt);
  }
  return { stored, baselines };
}

test("the first visit has no baseline", () => {
  const { state, newVisit } = touchVisit(null, T0);
  assert.deepEqual(state, {
    visitStartedAt: T0,
    lastActiveAt: T0,
    baselineAt: null,
  });
  assert.equal(newVisit, true);
});

test("refreshes within a visit keep the same baseline", () => {
  const previous: VisitState = {
    visitStartedAt: T0 - DAY,
    lastActiveAt: T0 - DAY + 20 * MIN,
    baselineAt: null,
  };
  // New visit, then refreshes and back navigation for an hour, never 30 min idle.
  const times = [T0, T0 + 1 * MIN, T0 + 12 * MIN, T0 + 40 * MIN, T0 + 65 * MIN];
  const { baselines } = replay(times, previous);
  assert.deepEqual(
    baselines,
    times.map(() => previous.lastActiveAt),
  );
});

test("30 minutes without activity starts a new visit from the last activity", () => {
  const first = replay([T0, T0 + 10 * MIN]).stored!;
  assert.equal(first.lastActiveAt, T0 + 10 * MIN);
  // 29 minutes later: same visit.
  assert.equal(
    touchVisit(first, T0 + 10 * MIN + VISIT_GAP_MS - 1).newVisit,
    false,
  );
  // 30 minutes later: new visit with the previous activity as baseline.
  const next = touchVisit(first, T0 + 10 * MIN + VISIT_GAP_MS);
  assert.equal(next.newVisit, true);
  assert.equal(next.state.baselineAt, T0 + 10 * MIN);
});

test("activity inside the write interval still counts (00:00 → 00:04 → 00:30)", () => {
  const { stored, baselines } = replay([T0, T0 + 4 * MIN, T0 + 30 * MIN]);
  // 26 minutes after the last real activity: still the same visit.
  assert.deepEqual(baselines, [null, null, null]);
  assert.equal(stored!.visitStartedAt, T0);
  assert.equal(stored!.lastActiveAt, T0 + 30 * MIN);
  // 30 minutes after the real last activity (00:30) starts a new visit from it.
  const next = touchVisit(stored, T0 + 60 * MIN);
  assert.equal(next.newVisit, true);
  assert.equal(next.state.baselineAt, T0 + 30 * MIN);
  assert.equal(touchVisit(stored, T0 + 60 * MIN - 1).newVisit, false);
});

test("the server is written when a visit starts, then at most once per interval", () => {
  assert.equal(shouldSyncVisit(true, T0, T0 + MIN), true);
  assert.equal(shouldSyncVisit(false, null, T0), true);
  assert.equal(shouldSyncVisit(false, T0, T0 + 4 * MIN), false);
  assert.equal(
    shouldSyncVisit(false, T0, T0 + ACTIVITY_WRITE_INTERVAL_MS),
    true,
  );
  // A clock moved backwards does not block writes until it catches up.
  assert.equal(shouldSyncVisit(false, T0, T0 - MIN), true);
});

test("a baseline older than 30 days is clamped to 30 days", () => {
  const old: VisitState = {
    visitStartedAt: T0 - 90 * DAY,
    lastActiveAt: T0 - 90 * DAY,
    baselineAt: null,
  };
  assert.equal(touchVisit(old, T0).state.baselineAt, T0 - BASELINE_MAX_AGE_MS);
});

test("a clock a little behind stays in the same visit", () => {
  const start = touchVisit(null, T0).state;
  const back = touchVisit(start, T0 - 2 * MIN);
  assert.equal(back.newVisit, false);
  assert.equal(back.state, start); // last activity never moves back
});

test("a record written while the clock was ahead does not keep the visit going", () => {
  // Real visit at T0 - 1 day; then the clock jumps a day ahead and back.
  const real = touchVisit(null, T0 - DAY).state;
  const ahead = touchVisit(real, T0 + DAY).state; // new visit "tomorrow"
  assert.equal(ahead.lastActiveAt, T0 + DAY);
  // Clock fixed, 2 hours of real time later: a new visit starts now, from the
  // latest recorded time that is not in the future (the real visit).
  const fixed = touchVisit(ahead, T0 + 2 * 60 * MIN);
  assert.equal(fixed.newVisit, true);
  assert.equal(fixed.state.lastActiveAt, T0 + 2 * 60 * MIN);
  assert.equal(fixed.state.baselineAt, T0 - DAY);
  // From then on the usual 30-minute rule applies.
  assert.equal(
    touchVisit(fixed.state, T0 + 2 * 60 * MIN + 10 * MIN).newVisit,
    false,
  );
  // Nothing in the past to go by: treated like a first visit.
  const onlyFuture = touchVisit(
    { visitStartedAt: T0 + DAY, lastActiveAt: T0 + DAY, baselineAt: null },
    T0,
  );
  assert.equal(onlyFuture.newVisit, true);
  assert.equal(onlyFuture.state.baselineAt, null);
  // Within the tolerance it is the same visit.
  const near = touchVisit(
    { visitStartedAt: T0, lastActiveAt: T0 + CLOCK_SKEW_MS, baselineAt: null },
    T0,
  );
  assert.equal(near.newVisit, false);
});

test("stored values are read defensively and the later device wins", () => {
  assert.equal(parseVisitState(null), null);
  assert.equal(parseVisitState({ visitStartedAt: "x" }), null);
  assert.equal(
    parseVisitState({ visitStartedAt: 2, lastActiveAt: 1, baselineAt: null }),
    null,
  );
  const a = { visitStartedAt: 1, lastActiveAt: 5, baselineAt: null };
  const b = { visitStartedAt: 1, lastActiveAt: 9, baselineAt: 0 };
  assert.deepEqual(parseVisitState(b), b);
  assert.equal(laterVisit(a, b), b);
  assert.equal(laterVisit(b, a), b);
  assert.equal(laterVisit(null, a), a);
});
