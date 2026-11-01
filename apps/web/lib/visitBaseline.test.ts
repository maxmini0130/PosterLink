import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_WRITE_INTERVAL_MS,
  BASELINE_MAX_AGE_MS,
  VISIT_GAP_MS,
  laterVisit,
  parseVisitState,
  touchVisit,
  type VisitState,
} from "./visitBaseline";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const T0 = Date.parse("2026-11-01T09:00:00+09:00");

/** Replays activity at the given times, keeping only written states. */
function replay(times: number[], start: VisitState | null = null) {
  let stored = start;
  const baselines: Array<number | null> = [];
  for (const now of times) {
    const { state, write } = touchVisit(stored, now);
    if (write) stored = state;
    baselines.push(state.baselineAt);
  }
  return { stored, baselines };
}

test("the first visit has no baseline", () => {
  const { state, write, newVisit } = touchVisit(null, T0);
  assert.deepEqual(state, {
    visitStartedAt: T0,
    lastActiveAt: T0,
    baselineAt: null,
  });
  assert.equal(write, true);
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

test("activity is written at most once per interval within a visit", () => {
  const start = touchVisit(null, T0).state;
  assert.equal(touchVisit(start, T0 + 1 * MIN).write, false);
  const later = touchVisit(start, T0 + ACTIVITY_WRITE_INTERVAL_MS);
  assert.equal(later.write, true);
  assert.equal(later.state.lastActiveAt, T0 + ACTIVITY_WRITE_INTERVAL_MS);
  assert.equal(later.state.baselineAt, null);
});

test("a baseline older than 30 days is clamped to 30 days", () => {
  const old: VisitState = {
    visitStartedAt: T0 - 90 * DAY,
    lastActiveAt: T0 - 90 * DAY,
    baselineAt: null,
  };
  assert.equal(touchVisit(old, T0).state.baselineAt, T0 - BASELINE_MAX_AGE_MS);
});

test("a clock moved backwards stays in the same visit", () => {
  const start = touchVisit(null, T0).state;
  const back = touchVisit(start, T0 - 2 * 60 * MIN);
  assert.equal(back.newVisit, false);
  assert.equal(back.state, start);
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
