#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_TYPES = ["new_match", "favorite_deadline"];
const DEFAULT_OLDER_THAN_HOURS = 24;
const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 500;

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-notification-push-backlog-cleanup" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchPendingRows(supabase, types, cutoffIso) {
  const rows = [];
  for (const type of types) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,user_id,type,target_id,created_at")
        .eq("type", type)
        .is("push_sent_at", null)
        .lt("created_at", cutoffIso)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

async function fetchProfiles(supabase, userIds) {
  if (userIds.length === 0) return new Map();
  const profiles = [];
  for (const ids of chunk(userIds, PAGE_SIZE)) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,is_notified,expo_push_token")
      .in("id", ids);
    if (error) throw error;
    profiles.push(...(data ?? []));
  }
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function classify(row, profileById) {
  const profile = profileById.get(row.user_id);
  if (!profile) return "missing_profile";
  if (profile.is_notified !== true) return "notification_opted_out";
  if (!profile.expo_push_token) return "missing_push_token";
  return "stale_sendable";
}

function summarize(rows, profileById) {
  const reasonCounts = {};
  const typeCounts = {};
  const targetIds = new Set();
  const userIds = new Set();
  const cleanupIds = [];

  for (const row of rows) {
    const reason = classify(row, profileById);
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    typeCounts[row.type] = (typeCounts[row.type] ?? 0) + 1;
    if (row.target_id) targetIds.add(row.target_id);
    if (row.user_id) userIds.add(row.user_id);
    cleanupIds.push(row.id);
  }

  return {
    rows: rows.length,
    users: userIds.size,
    targets: targetIds.size,
    typeCounts,
    reasonCounts,
    oldestCreatedAt: rows[0]?.created_at ?? null,
    newestCreatedAt: rows.at(-1)?.created_at ?? null,
    cleanupIds,
  };
}

async function applyCleanup(supabase, ids) {
  const clearedAt = new Date().toISOString();
  let updated = 0;
  for (const idBatch of chunk(ids, UPDATE_BATCH_SIZE)) {
    const { error } = await supabase
      .from("notifications")
      .update({ push_sent_at: clearedAt })
      .in("id", idBatch);
    if (error) throw error;
    updated += idBatch.length;
  }
  return { updated, clearedAt };
}

function printReport(report) {
  console.log("Notification push backlog cleanup");
  console.log(`mode: ${report.apply ? "apply" : "dry-run"}`);
  console.log(`cutoff: ${report.cutoffIso}`);
  console.log(`types: ${report.types.join(",")}`);
  console.log(`candidate rows: ${report.summary.rows}`);
  console.log(`users: ${report.summary.users}`);
  console.log(`targets: ${report.summary.targets}`);
  console.log(`oldest: ${report.summary.oldestCreatedAt ?? "-"}`);
  console.log(`newest: ${report.summary.newestCreatedAt ?? "-"}`);
  console.log(`by type: ${JSON.stringify(report.summary.typeCounts)}`);
  console.log(`by reason: ${JSON.stringify(report.summary.reasonCounts)}`);
  if (report.result) {
    console.log(`updated rows: ${report.result.updated}`);
    console.log(`cleared at: ${report.result.clearedAt}`);
  }
}

async function main() {
  const args = parseArgs();
  const supabase = createSupabase();
  const types = args.type ? String(args.type).split(",").map((value) => value.trim()).filter(Boolean) : DEFAULT_TYPES;
  const olderThanHours = Number(args["older-than-hours"] ?? DEFAULT_OLDER_THAN_HOURS);
  if (!Number.isFinite(olderThanHours) || olderThanHours <= 0) {
    throw new Error("--older-than-hours must be a positive number");
  }

  const cutoffIso = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  const rows = await fetchPendingRows(supabase, types, cutoffIso);
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  const profileById = await fetchProfiles(supabase, userIds);
  const summary = summarize(rows, profileById);

  const report = {
    generatedAt: new Date().toISOString(),
    apply: Boolean(args.apply),
    cutoffIso,
    olderThanHours,
    types,
    summary: { ...summary, cleanupIds: undefined },
    result: null,
  };

  if (args.apply && summary.cleanupIds.length > 0) {
    report.result = await applyCleanup(supabase, summary.cleanupIds);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
