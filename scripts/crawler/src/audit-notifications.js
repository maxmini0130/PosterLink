#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const NOTIFICATION_TYPES = ["new_match", "favorite_deadline"];
const PAGE_SIZE = 1000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "eval", "reports", "notification-push-audit.json");

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

async function fetchPosters(supabase, posterIds) {
  if (posterIds.length === 0) return new Map();
  const posters = [];
  for (let i = 0; i < posterIds.length; i += PAGE_SIZE) {
    const ids = posterIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,application_end_at,deadline_type,exposure_tier")
      .in("id", ids);
    if (error) throw error;
    posters.push(...(data ?? []));
  }
  return new Map(posters.map((poster) => [poster.id, poster]));
}

function emptyTargetSummary(targetId) {
  return {
    targetId,
    count: 0,
    sendableRows: 0,
    noTokenRows: 0,
    optedOutRows: 0,
    missingProfileRows: 0,
    newestCreatedAt: null,
    oldestCreatedAt: null,
  };
}

function decorateTarget(target, posterById) {
  const poster = posterById.get(target.targetId);
  return {
    ...target,
    title: poster?.title ?? null,
    posterStatus: poster?.poster_status ?? null,
    applicationEndAt: poster?.application_end_at ?? null,
    deadlineType: poster?.deadline_type ?? null,
    exposureTier: poster?.exposure_tier ?? null,
  };
}

function summarize(rows, profileById, posterById) {
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
    sendableTargets: [],
    noTokenTargets: [],
    topUsers: [],
  };

  for (const row of rows) {
    const target = row.target_id
      ? byTarget.get(row.target_id) ?? emptyTargetSummary(row.target_id)
      : null;
    const profile = profileById.get(row.user_id);
    if (!profile) {
      summary.missingProfileRows += 1;
      if (target) target.missingProfileRows += 1;
    } else if (profile.is_notified !== true) {
      summary.optedOutRows += 1;
      if (target) target.optedOutRows += 1;
    } else if (!profile.expo_push_token) {
      summary.noTokenRows += 1;
      if (target) target.noTokenRows += 1;
    } else {
      summary.sendableRows += 1;
      if (target) target.sendableRows += 1;
    }

    if (target) {
      target.count += 1;
      if (!target.newestCreatedAt || row.created_at > target.newestCreatedAt) {
        target.newestCreatedAt = row.created_at;
      }
      if (!target.oldestCreatedAt || row.created_at < target.oldestCreatedAt) {
        target.oldestCreatedAt = row.created_at;
      }
      byTarget.set(row.target_id, target);
    }
    if (row.user_id) {
      const current = byUser.get(row.user_id) ?? { userId: row.user_id, count: 0 };
      current.count += 1;
      byUser.set(row.user_id, current);
    }
  }

  const targets = [...byTarget.values()].map((target) => decorateTarget(target, posterById));
  summary.topTargets = targets.sort((a, b) => b.count - a.count).slice(0, 10);
  summary.sendableTargets = targets
    .filter((target) => target.sendableRows > 0)
    .sort((a, b) => b.sendableRows - a.sendableRows || b.count - a.count);
  summary.noTokenTargets = targets
    .filter((target) => target.noTokenRows > 0)
    .sort((a, b) => b.noTokenRows - a.noTokenRows || b.count - a.count)
    .slice(0, 20);
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
    if (summary.sendableTargets.length > 0) {
      console.log("sendable targets:");
      for (const target of summary.sendableTargets.slice(0, 20)) {
        console.log(
          `- ${target.targetId} (${target.sendableRows}/${target.count}) ${target.posterStatus ?? "-"} ${target.title ?? ""}`,
        );
      }
    }
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
  const allPosterIds = [...new Set(
    Object.values(rowsByType)
      .flat()
      .map((row) => row.target_id)
      .filter(Boolean),
  )];
  const posterById = await fetchPosters(supabase, allPosterIds);
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    types: Object.fromEntries(
      Object.entries(rowsByType).map(([type, rows]) => [type, summarize(rows, profileById, posterById)]),
    ),
  };

  const outputPath = args.output ? path.resolve(args.output) : DEFAULT_OUTPUT;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
    console.log("");
    console.log(`report: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
