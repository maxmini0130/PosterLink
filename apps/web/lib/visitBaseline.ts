/**
 * "지난 방문" baseline (retention plan 3-2). A visit ends after 30 minutes
 * without activity; when the next one starts, the time the previous visit was
 * last active becomes the baseline and stays fixed for the whole visit, so a
 * refresh or going back shows the same "new since" list. A baseline older than
 * 30 days is clamped to 30 days ago. No previous visit means no baseline.
 */

export const VISIT_GAP_MS = 30 * 60 * 1000;
export const BASELINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Activity is written at most this often within a visit. */
export const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export type VisitState = {
  /** Start of the current visit. */
  visitStartedAt: number;
  /** Last activity in the current visit. */
  lastActiveAt: number;
  /** Fixed for the current visit; null on the first visit. */
  baselineAt: number | null;
};

export function parseVisitState(value: unknown): VisitState | null {
  const state = value as Partial<VisitState> | null;
  if (
    !state ||
    typeof state.visitStartedAt !== "number" ||
    typeof state.lastActiveAt !== "number" ||
    !(state.baselineAt === null || typeof state.baselineAt === "number") ||
    state.lastActiveAt < state.visitStartedAt
  )
    return null;
  return {
    visitStartedAt: state.visitStartedAt,
    lastActiveAt: state.lastActiveAt,
    baselineAt: state.baselineAt,
  };
}

/**
 * Records activity at `now`. Returns the new state and whether it should be
 * written: always when a visit starts, otherwise once per write interval.
 */
export function touchVisit(
  previous: VisitState | null,
  now: number,
): { state: VisitState; write: boolean; newVisit: boolean } {
  if (!previous)
    return {
      state: { visitStartedAt: now, lastActiveAt: now, baselineAt: null },
      write: true,
      newVisit: true,
    };
  // A clock moved backwards is treated as activity in the same visit.
  const since = Math.max(0, now - previous.lastActiveAt);
  if (since >= VISIT_GAP_MS)
    return {
      state: {
        visitStartedAt: now,
        lastActiveAt: now,
        baselineAt: Math.max(previous.lastActiveAt, now - BASELINE_MAX_AGE_MS),
      },
      write: true,
      newVisit: true,
    };
  const write = since >= ACTIVITY_WRITE_INTERVAL_MS;
  return {
    state: write ? { ...previous, lastActiveAt: now } : previous,
    write,
    newVisit: false,
  };
}

/** The later of two states, so a second device or tab never moves time back. */
export function laterVisit(a: VisitState | null, b: VisitState | null) {
  if (!a) return b;
  if (!b) return a;
  return b.lastActiveAt > a.lastActiveAt ? b : a;
}
