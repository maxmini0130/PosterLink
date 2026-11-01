"use client";

import {
  laterVisit,
  parseVisitState,
  touchVisit,
  type VisitState,
} from "../../lib/visitBaseline";
import { supabase } from "./supabase";

/**
 * Keeps the "지난 방문" record (retention plan 3-2). Guests: this browser only.
 * Members: the server row (user_visit_state) so every device agrees, mirrored
 * in this browser; until that table exists, this browser only.
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

async function writeServer(userId: string, state: VisitState) {
  if (serverUnavailable) return;
  const { error } = await supabase.from("user_visit_state").upsert(
    {
      user_id: userId,
      visit_started_at: toIso(state.visitStartedAt),
      last_active_at: toIso(state.lastActiveAt),
      baseline_at: toIso(state.baselineAt),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (isMissingTable(error)) serverUnavailable = true;
}

const sameVisit = (a: VisitState, b: VisitState | null) =>
  b !== null &&
  a.visitStartedAt === b.visitStartedAt &&
  a.lastActiveAt === b.lastActiveAt &&
  a.baselineAt === b.baselineAt;

let inFlight: Promise<VisitState> | null = null;

/**
 * Records activity now and returns the current visit, whose baselineAt is the
 * "방문 이후" time (null on a first visit). Concurrent callers share one run.
 */
export function recordVisitActivity(): Promise<VisitState> {
  inFlight ??= (async () => {
    const userId =
      (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const local = readLocal(userId);
    const server = userId ? await readServer(userId) : null;
    const known = laterVisit(local, server);
    const { state, write } = touchVisit(known, Date.now());
    if (write || !sameVisit(state, local)) writeLocal(userId, state);
    if (userId && (write || (server && !sameVisit(state, server))))
      await writeServer(userId, state).catch(() => undefined);
    return state;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
