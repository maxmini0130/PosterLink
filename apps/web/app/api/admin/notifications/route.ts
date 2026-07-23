import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const DEFAULT_STALE_RUNNING_MINUTES = 45;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return ADMIN_ROLES.has(profile?.role) ? user : null;
}

function compactText(value: unknown, maxLength = 4000) {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  return text ? text.slice(0, maxLength) : "";
}

function groupNotifications(rows: any[]) {
  const grouped = new Map<string, any>();

  for (const row of rows) {
    const key = [
      row.type,
      row.title,
      row.body,
      row.target_type ?? "",
      row.target_id ?? "",
      new Date(row.created_at).toISOString().slice(0, 16),
    ].join("|");

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...row,
        recipient_count: 1,
      });
    } else {
      current.recipient_count += 1;
      if (new Date(row.created_at).getTime() > new Date(current.created_at).getTime()) {
        current.created_at = row.created_at;
      }
    }
  }

  return [...grouped.values()].sort((a, b) => (
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ));
}

function staleRunningMinutes() {
  const value = Number(process.env.CRAWLER_STALE_RUNNING_MINUTES ?? DEFAULT_STALE_RUNNING_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_RUNNING_MINUTES;
}

function isMissingRunHistoryError(error: any) {
  return error?.code === "42P01" || String(error?.message ?? "").includes("collection_source_runs");
}

function minutesSince(value: string) {
  const startedAt = new Date(value).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.round((Date.now() - startedAt) / 60_000));
}

function buildStaleRunningAlerts(rows: any[]) {
  return rows.map((row) => {
    const sourceSlug = row.source_slug ?? "all";
    const startedAt = row.started_at ?? row.created_at ?? new Date().toISOString();
    const runningMinutes = minutesSince(startedAt);
    const adminPath = sourceSlug === "all"
      ? "/admin/collection-sources"
      : `/admin/collection-sources?source=${encodeURIComponent(sourceSlug)}`;

    return {
      id: `stale-running-${row.id}`,
      target_type: "collection_source",
      target_id: row.source_id ?? null,
      action_type: "update",
      action_reason: `${row.source_name ?? sourceSlug} 수집 실행이 ${runningMinutes}분째 완료 상태로 바뀌지 않았습니다. GitHub Actions 실행 결과와 환경변수를 확인하세요.`,
      metadata_json: {
        kind: "collection_source_alert",
        alert_key: "stale_running_workflow",
        severity: "warning",
        label: "실행 완료 지연",
        run_status: "running",
        run_phase: row.run_phase,
        source_slug: sourceSlug,
        admin_path: adminPath,
        checked: 0,
        valid: 0,
        created: 0,
        duplicate: 0,
        rejected: 0,
        failed: 0,
        started_at: startedAt,
        minutes_running: runningMinutes,
        workflow_url: row.metadata_json?.workflow_url ?? null,
      },
      created_at: startedAt,
    };
  });
}

function mergeCollectionAlerts(alertRows: any[], staleRunningRows: any[]) {
  return [...buildStaleRunningAlerts(staleRunningRows), ...alertRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 80);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = adminClient();
  const staleThreshold = new Date(Date.now() - staleRunningMinutes() * 60_000).toISOString();
  const [
    { data: notificationRows, error: notificationError },
    { data: alertRows, error: alertError },
    { data: staleRunningRows, error: staleRunningError },
  ] = await Promise.all([
    admin
      .from("notifications")
      .select("id,user_id,type,title,body,target_type,target_id,is_read,created_at")
      .eq("type", "system_notice")
      .order("created_at", { ascending: false })
      .limit(120),
    admin
      .from("admin_actions")
      .select("id,target_type,target_id,action_type,action_reason,metadata_json,created_at")
      .eq("target_type", "collection_source")
      .eq("action_type", "update")
      .contains("metadata_json", { kind: "collection_source_alert" })
      .order("created_at", { ascending: false })
      .limit(60),
    admin
      .from("collection_source_runs")
      .select("id,source_id,source_slug,source_name,run_phase,run_status,started_at,created_at,metadata_json")
      .eq("run_status", "running")
      .lt("started_at", staleThreshold)
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  if (notificationError) {
    return NextResponse.json({ error: notificationError.message }, { status: 500 });
  }
  if (alertError) {
    return NextResponse.json({ error: alertError.message }, { status: 500 });
  }
  if (staleRunningError && !isMissingRunHistoryError(staleRunningError)) {
    return NextResponse.json({ error: staleRunningError.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: groupNotifications(notificationRows ?? []),
    collection_alerts: mergeCollectionAlerts(alertRows ?? [], staleRunningError ? [] : (staleRunningRows ?? [])),
  });
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { title?: unknown; body?: unknown } | null;
  const title = compactText(body?.title, 200);
  const message = compactText(body?.body, 4000);

  if (!title || !message) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const admin = adminClient();
  const { data: users, error: usersError } = await admin
    .from("profiles")
    .select("id");

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const inserts = (users ?? [])
    .map((user) => user.id)
    .filter(Boolean)
    .map((userId) => ({
      user_id: userId,
      type: "system_notice",
      title,
      body: message,
      target_type: "system",
    }));

  if (inserts.length === 0) {
    return NextResponse.json({ error: "No users found" }, { status: 400 });
  }

  const { error: insertError } = await admin.from("notifications").insert(inserts);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await admin.from("admin_actions").insert({
    admin_id: adminUser.id,
    target_type: "user",
    action_type: "update",
    action_reason: `system_notice:${title}`,
    metadata_json: {
      kind: "system_notice_broadcast",
      title,
      recipient_count: inserts.length,
    },
  });

  return NextResponse.json({ ok: true, recipient_count: inserts.length });
}
