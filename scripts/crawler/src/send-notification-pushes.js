#!/usr/bin/env node
import "./load-env.js";

import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseExpoResult } from "../../../supabase/functions/_shared/notification-logic.mjs";

const DEFAULT_TYPES = ["new_match", "favorite_deadline"];
const DEFAULT_LIMIT = 200;
const PAGE_SIZE = 1000;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required",
    );
  }
  return createClient(url, key, {
    global: {
      headers: { "X-Client-Info": "posterlink-notification-push-sender" },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function splitArg(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchPendingNotifications(supabase, { types, targetId, limit }) {
  const rows = [];
  for (const type of types) {
    for (let from = 0; rows.length < limit; from += PAGE_SIZE) {
      let query = supabase
        .from("notifications")
        .select("id,user_id,type,title,body,target_type,target_id,created_at")
        .eq("type", type)
        .is("push_sent_at", null)
        .is("push_discarded_at", null)
        .order("created_at", { ascending: true })
        .range(from, from + Math.min(PAGE_SIZE, limit - rows.length) - 1);
      if (targetId) query = query.eq("target_id", targetId);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    if (rows.length >= limit) break;
  }
  return rows.slice(0, limit);
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

async function fetchPosters(supabase, posterIds) {
  if (posterIds.length === 0) return new Map();
  const posters = [];
  for (const ids of chunk(posterIds, PAGE_SIZE)) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,poster_status")
      .in("id", ids);
    if (error) throw error;
    posters.push(...(data ?? []));
  }
  return new Map(posters.map((poster) => [poster.id, poster]));
}

export function buildPushPlans(
  notifications = [],
  profileById = new Map(),
  posterById = null,
) {
  return notifications.map((notification) => {
    const profile = profileById.get(notification.user_id);
    const blockedReasons = [];
    if (!profile) blockedReasons.push("missing_profile");
    if (profile && profile.is_notified !== true)
      blockedReasons.push("notification_opted_out");
    if (profile && !profile.expo_push_token)
      blockedReasons.push("missing_push_token");
    if (
      posterById &&
      notification.target_type === "poster" &&
      posterById.get(notification.target_id)?.poster_status !== "published"
    ) {
      blockedReasons.push("poster_not_published");
    }

    return {
      notification_id: notification.id,
      user_id: notification.user_id,
      type: notification.type,
      target_type: notification.target_type,
      target_id: notification.target_id,
      title: notification.title || "PosterLink 알림",
      body: notification.body || "새 알림이 도착했습니다.",
      expo_push_token: profile?.expo_push_token ?? null,
      eligible: blockedReasons.length === 0,
      blocked_reasons: blockedReasons,
    };
  });
}

export function summarizePushPlans(plans = []) {
  const byType = {};
  const blockedReasons = {};
  for (const plan of plans) {
    byType[plan.type] = (byType[plan.type] ?? 0) + 1;
    for (const reason of plan.blocked_reasons) {
      blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1;
    }
  }
  return {
    checked_count: plans.length,
    eligible_count: plans.filter((plan) => plan.eligible).length,
    blocked_count: plans.filter((plan) => !plan.eligible).length,
    by_type: byType,
    blocked_reasons: blockedReasons,
  };
}

async function sendExpoPush(plan) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: plan.expo_push_token,
      title: plan.title,
      body: plan.body,
      data: {
        notificationId: plan.notification_id,
        type: plan.type,
        targetType: plan.target_type,
        targetId: plan.target_id,
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  return {
    ...parseExpoResult(response.ok, payload),
    httpStatus: response.status,
  };
}

async function applyPushPlans(supabase, plans) {
  const results = [];
  const sentIds = [];
  const discardedIds = [];
  const invalidTokenUserIds = [];
  const deliveryLogs = [];
  const sentAt = new Date().toISOString();

  for (const plan of plans) {
    if (!plan.eligible) {
      const reason = plan.blocked_reasons[0] ?? "not_eligible";
      if (plan.blocked_reasons.includes("poster_not_published"))
        discardedIds.push(plan.notification_id);
      deliveryLogs.push({
        notification_id: plan.notification_id,
        channel: "expo_push",
        status: "skipped",
        error_code: reason,
      });
      results.push({
        notification_id: plan.notification_id,
        user_id: plan.user_id,
        status: "skipped",
        error_code: reason,
      });
      continue;
    }

    let result;
    try {
      result = await sendExpoPush(plan);
    } catch (error) {
      result = {
        status: "failed",
        ticketId: null,
        errorCode: "expo_network_error",
        errorMessage: error instanceof Error ? error.message : String(error),
        invalidToken: false,
        httpStatus: null,
      };
    }

    if (result.invalidToken) invalidTokenUserIds.push(plan.user_id);
    if (result.status === "sent") sentIds.push(plan.notification_id);
    deliveryLogs.push({
      notification_id: plan.notification_id,
      channel: "expo_push",
      status: result.status,
      provider_ticket_id: result.ticketId,
      error_code: result.errorCode,
      error_message: result.errorMessage,
    });
    results.push({
      notification_id: plan.notification_id,
      user_id: plan.user_id,
      status: result.status,
      http_status: result.httpStatus,
      error_code: result.errorCode,
    });
  }

  if (deliveryLogs.length > 0) {
    const { error } = await supabase
      .from("notification_delivery_logs")
      .insert(deliveryLogs);
    if (error) throw error;
  }

  if (sentIds.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .update({ push_sent_at: sentAt })
      .in("id", sentIds);
    if (error) throw error;
  }

  if (discardedIds.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .update({
        push_discarded_at: sentAt,
        push_discard_reason: "poster_not_published",
      })
      .in("id", discardedIds);
    if (error) throw error;
  }

  if (invalidTokenUserIds.length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update({ expo_push_token: null })
      .in("id", [...new Set(invalidTokenUserIds)]);
    if (error) throw error;
  }

  return {
    sent_at: sentAt,
    sent_count: sentIds.length,
    discarded_count: discardedIds.length,
    skipped_count: results.filter((result) => result.status === "skipped")
      .length,
    invalid_token_count: new Set(invalidTokenUserIds).size,
    failed_count: results.filter((result) => result.status === "failed").length,
    results,
  };
}

function printReport(report) {
  console.log("Notification push sender");
  console.log(`mode: ${report.mode}`);
  console.log(`types: ${report.types.join(",")}`);
  console.log(`target: ${report.target_id ?? "-"}`);
  console.log(`checked: ${report.summary.checked_count}`);
  console.log(`eligible: ${report.summary.eligible_count}`);
  console.log(`blocked: ${report.summary.blocked_count}`);
  console.log(`by type: ${JSON.stringify(report.summary.by_type)}`);
  console.log(
    `blocked reasons: ${JSON.stringify(report.summary.blocked_reasons)}`,
  );
  if (report.apply_result) {
    console.log(`sent: ${report.apply_result.sent_count}`);
    console.log(`discarded: ${report.apply_result.discarded_count}`);
    console.log(`skipped: ${report.apply_result.skipped_count}`);
    console.log(
      `invalid tokens cleared: ${report.apply_result.invalid_token_count}`,
    );
    console.log(`failed: ${report.apply_result.failed_count}`);
  }
}

async function main() {
  const args = parseArgs();
  const apply = Boolean(args.apply);
  if (apply && process.env.SEND_NOTIFICATION_PUSHES !== "true") {
    throw new Error(
      "Refusing to send pushes: set SEND_NOTIFICATION_PUSHES=true in addition to --apply",
    );
  }

  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const types = splitArg(args.type || args.types, DEFAULT_TYPES);
  const targetId = args.target || args["target-id"] || null;
  const supabase = createSupabase();
  const notifications = await fetchPendingNotifications(supabase, {
    types,
    targetId,
    limit,
  });
  const userIds = [
    ...new Set(notifications.map((row) => row.user_id).filter(Boolean)),
  ];
  const posterIds = [
    ...new Set(
      notifications
        .filter((row) => row.target_type === "poster")
        .map((row) => row.target_id)
        .filter(Boolean),
    ),
  ];
  const profileById = await fetchProfiles(supabase, userIds);
  const posterById = await fetchPosters(supabase, posterIds);
  const plans = buildPushPlans(notifications, profileById, posterById);
  const summary = summarizePushPlans(plans);
  const applyResult = apply ? await applyPushPlans(supabase, plans) : null;
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    types,
    target_id: targetId,
    limit,
    summary,
    apply_result: applyResult,
  };

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
