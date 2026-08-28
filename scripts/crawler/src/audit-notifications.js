#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const NOTIFICATION_TYPES = ["new_match", "favorite_deadline"];
const PAGE_SIZE = 1000;

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-notification-audit" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

async function fetchAllPendingNotifications(supabase, type) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,user_id,target_id,created_at")
      .eq("type", type)
      .is("push_sent_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchProfiles(supabase, userIds) {
  if (userIds.length === 0) return new Map();
  const profiles = [];
  for (let i = 0; i < userIds.length; i += PAGE_SIZE) {
    const ids = userIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,is_notified,expo_push_token")
      .in("id", ids);
    if (error) throw error;
    profiles.push(...(data ?? []));
  }
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function summarize(rows, profileById) {
  const byTarget = new Map();
  const byUser = new Map();
  const summary = {
    pendingRows: rows.length,
    users: new Set(rows.map((row) => row.user_id).filter(Boolean)).size,
    targets: new Set(rows.map((row) => row.target_id).filter(Boolean)).size,
    optedOutRows: 0,
    noTokenRows: 0,
    sendableRows: 0,
    missingProfileRows: 0,
    newestCreatedAt: rows[0]?.created_at ?? null,
    oldestCreatedAt: rows.at(-1)?.created_at ?? null,
    topTargets: [],
    topUsers: [],
  };

  for (const row of rows) {
    const profile = profileById.get(row.user_id);
    if (!profile) {
      summary.missingProfileRows += 1;
    } else if (profile.is_notified !== true) {
      summary.optedOutRows += 1;
    } else if (!profile.expo_push_token) {
      summary.noTokenRows += 1;
    } else {
      summary.sendableRows += 1;
    }

    if (row.target_id) {
      const current = byTarget.get(row.target_id) ?? { targetId: row.target_id, count: 0, newestCreatedAt: row.created_at };
      current.count += 1;
      if (row.created_at > current.newestCreatedAt) current.newestCreatedAt = row.created_at;
      byTarget.set(row.target_id, current);
    }
    if (row.user_id) {
      const current = byUser.get(row.user_id) ?? { userId: row.user_id, count: 0 };
      current.count += 1;
      byUser.set(row.user_id, current);
    }
  }

  summary.topTargets = [...byTarget.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  summary.topUsers = [...byUser.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  return summary;
}

function printHuman(report) {
  console.log("Notification push audit (read-only)");
  console.log(`Generated at: ${report.generatedAt}`);
  for (const [type, summary] of Object.entries(report.types)) {
    console.log("");
    console.log(`[${type}]`);
    console.log(`pending rows: ${summary.pendingRows}`);
    console.log(`users: ${summary.users}`);
    console.log(`targets: ${summary.targets}`);
    console.log(`sendable rows: ${summary.sendableRows}`);
    console.log(`no-token rows: ${summary.noTokenRows}`);
    console.log(`opted-out rows: ${summary.optedOutRows}`);
    console.log(`missing-profile rows: ${summary.missingProfileRows}`);
    console.log(`newest: ${summary.newestCreatedAt ?? "-"}`);
    console.log(`oldest: ${summary.oldestCreatedAt ?? "-"}`);
  }
}

async function main() {
  const args = parseArgs();
  const supabase = createSupabase();
  const typeFilter = args.type ? String(args.type).split(",") : NOTIFICATION_TYPES;
  const rowsByType = {};
  const allUserIds = new Set();

  for (const type of typeFilter) {
    const rows = await fetchAllPendingNotifications(supabase, type);
    rowsByType[type] = rows;
    for (const row of rows) {
      if (row.user_id) allUserIds.add(row.user_id);
    }
  }

  const profileById = await fetchProfiles(supabase, [...allUserIds]);
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    types: Object.fromEntries(
      Object.entries(rowsByType).map(([type, rows]) => [type, summarize(rows, profileById)]),
    ),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
