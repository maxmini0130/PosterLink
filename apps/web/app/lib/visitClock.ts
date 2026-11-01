"use client";

import {
  laterVisit,
  parseVisitState,
  shouldSyncVisit,
  touchVisit,
  type VisitState,
} from "../../lib/visitBaseline";
import { supabase } from "./supabase";

/**
 * Keeps the "지난 방문" record (retention plan 3-2). Guests: this browser only.
 * Members: the server row (user_visit_state) so every device agrees, mirrored
 * in this browser; until that table exists, this browser only.
 *
 * The browser record is updated on every page so the 30-minute gap is
 * measured from the real last activity. The server is sent the visit when it
 * starts and then at most every 5 minutes, through record_user_visit, which
 * keeps whichever record has the later activity; the browser adopts it.
 */
const localKey = (userId: string | null) =>
  userId ? `pl.visit.v1:${userId}` : "pl.visit.v1";

function readLocal(userId: string | null) {
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    return raw ? parseVisitState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(userId: string | null, state: VisitState) {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(state));
  } catch {
    /* storage blocked: the visit simply is not remembered */
  }
}

const toIso = (time: number | null) =>
  time === null ? null : new Date(time).toISOString();
const fromIso = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? Date.parse(value)
    : null;

// Table missing (migration not applied yet): stop asking for this page load.
let serverUnavailable = false;

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function readServer(userId: string): Promise<VisitState | null> {
  if (serverUnavailable) return null;
  const { data, error } = await supabase
    .from("user_visit_state")
    .select("visit_started_at, last_active_at, baseline_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) serverUnavailable = true;
    return null;
  }
  if (!data) return null;
  return parseVisitState({
    visitStartedAt: fromIso(data.visit_started_at),
    lastActiveAt: fromIso(data.last_active_at),
    baselineAt: fromIso(data.baseline_at),
  });
}

const syncedKey = (userId: string) => `pl.visit_synced.v1:${userId}`;

function readSyncedAt(userId: string) {
  try {
    const value = Number(window.localStorage.getItem(syncedKey(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeSyncedAt(userId: string, time: number) {
  try {
    window.localStorage.setItem(syncedKey(userId), String(time));
  } catch {
    /* storage blocked: the next page syncs again */
  }
}

function isMissingFunction(error: { code?: string } | null) {
  return error?.code === "42883" || error?.code === "PGRST202";
}

/** Sends the visit; returns the record the server keeps, or null. */
async function syncServer(state: VisitState): Promise<VisitState | null> {
  if (serverUnavailable) return null;
  const { data, error } = await supabase.rpc("record_user_visit", {
    p_visit_started_at: toIso(state.visitStartedAt),
    p_last_active_at: toIso(state.lastActiveAt),
    p_baseline_at: toIso(state.baselineAt),
  });
  if (error) {
    if (isMissingTable(error) || isMissingFunction(error))
      serverUnavailable = true;
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    visit_started_at?: unknown;
    last_active_at?: unknown;
    baseline_at?: unknown;
  } | null;
  return row
    ? parseVisitState({
        visitStartedAt: fromIso(row.visit_started_at),
        lastActiveAt: fromIso(row.last_active_at),
        baselineAt: fromIso(row.baseline_at),
      })
    : null;
}

let inFlight: Promise<VisitState> | null = null;

/**
 * Records activity now and returns the current visit, whose baselineAt is the
 * "방문 이후" time (null on a first visit). Concurrent callers share one run.
 */
export function recordVisitActivity(): Promise<VisitState> {
  inFlight ??= (async () => {
    const userId =
      (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const now = Date.now();
    const server = userId ? await readServer(userId) : null;
    const { state, newVisit } = touchVisit(
      laterVisit(readLocal(userId), server),
      now,
    );
    writeLocal(userId, state);
    if (!userId || !shouldSyncVisit(newVisit, readSyncedAt(userId), now))
      return state;
    const kept = await syncServer(state).catch(() => null);
    if (!kept) return state;
    writeSyncedAt(userId, now);
    // Another device may hold a later visit; follow the server's record.
    const current = laterVisit(state, kept) ?? state;
    if (current !== state) writeLocal(userId, current);
    return current;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
