import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

const SELECT_COLUMNS = [
  "id",
  "source_slug",
  "name",
  "source_type",
  "region_scope",
  "region_name",
  "homepage_url",
  "list_url",
  "collection_method",
  "collection_interval_minutes",
  "priority",
  "status",
  "reliability",
  "is_public",
  "manager_contact",
  "monthly_expected_posts",
  "valid_post_rate",
  "last_collected_at",
  "last_success_at",
  "latest_post_found_at",
  "last_error_at",
  "last_error_message",
  "consecutive_error_count",
  "last_run_status",
  "last_run_checked_count",
  "last_run_new_count",
  "last_run_valid_count",
  "last_run_duplicate_count",
  "last_run_rejected_count",
  "average_delay_hours",
  "required_field_missing_rate",
  "config_json",
  "notes",
  "created_at",
  "updated_at",
].join(",");

const WRITABLE_FIELDS = new Set([
  "source_slug",
  "name",
  "source_type",
  "region_scope",
  "region_name",
  "homepage_url",
  "list_url",
  "collection_method",
  "collection_interval_minutes",
  "priority",
  "status",
  "reliability",
  "is_public",
  "manager_contact",
  "monthly_expected_posts",
  "valid_post_rate",
  "last_collected_at",
  "last_success_at",
  "latest_post_found_at",
  "last_error_at",
  "last_error_message",
  "consecutive_error_count",
  "last_run_status",
  "last_run_checked_count",
  "last_run_new_count",
  "last_run_valid_count",
  "last_run_duplicate_count",
  "last_run_rejected_count",
  "average_delay_hours",
  "required_field_missing_rate",
  "config_json",
  "notes",
]);

const HOUR_MS = 60 * 60 * 1000;

function parseTime(value: unknown) {
  if (!value) return null;
  const timestamp = new Date(String(value)).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getSourceHealthFlags(row: any) {
  const now = Date.now();
  const intervalMinutes = Number(row.collection_interval_minutes ?? 1440);
  const intervalMs = Math.max(intervalMinutes, 60) * 60 * 1000;
  const lastCollectedAt = parseTime(row.last_collected_at);
  const lastSuccessAt = parseTime(row.last_success_at);
  const checkedCount = Number(row.last_run_checked_count ?? 0);
  const validRate = Number(row.valid_post_rate ?? 0);
  const missingRate = Number(row.required_field_missing_rate ?? 0);
  const isAutomatedActive = row.status === "active" && row.collection_method !== "manual";

  const due = isAutomatedActive && (!lastCollectedAt || now - lastCollectedAt >= intervalMs);
  const stale = isAutomatedActive && (!lastSuccessAt || now - lastSuccessAt >= Math.max(intervalMs * 2, 48 * HOUR_MS));
  const errored = row.status === "error"
    || row.status === "blocked"
    || Number(row.consecutive_error_count ?? 0) > 0
    || row.last_run_status === "error"
    || row.last_run_status === "partial";
  const lowQuality = checkedCount >= 5 && validRate < 40;
  const missingRequired = checkedCount >= 5 && missingRate >= 30;
  const needsAttention = errored || stale || lowQuality || missingRequired;

  return {
    due,
    stale,
    errored,
    lowQuality,
    missingRequired,
    needsAttention,
  };
}

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

function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || (error.message ?? "").includes("collection_sources");
}

function isMissingRunHistoryError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || (error.message ?? "").includes("collection_source_runs");
}

function compactString(value: unknown, maxLength = 2048) {
  if (typeof value !== "string") return value;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function buildPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!WRITABLE_FIELDS.has(key)) continue;
    payload[key] = typeof value === "string" ? compactString(value) : value;
  }
  return payload;
}

function summarize(rows: any[]) {
  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  let automatedCount = 0;
  let activeCount = 0;
  let errorCount = 0;
  let totalExpectedPosts = 0;
  let dueCount = 0;
  let staleCount = 0;
  let lowQualityCount = 0;
  let needsAttentionCount = 0;

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    typeCounts[row.source_type] = (typeCounts[row.source_type] ?? 0) + 1;
    if (row.status === "active") activeCount += 1;
    if (row.status === "error" || row.status === "blocked") errorCount += 1;
    if (row.collection_method !== "manual") automatedCount += 1;
    totalExpectedPosts += Number(row.monthly_expected_posts ?? 0);

    const flags = getSourceHealthFlags(row);
    if (flags.due) dueCount += 1;
    if (flags.stale) staleCount += 1;
    if (flags.lowQuality) lowQualityCount += 1;
    if (flags.needsAttention) needsAttentionCount += 1;
  }

  const validRates = rows
    .map((row) => Number(row.valid_post_rate ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageValidRate = validRates.length
    ? validRates.reduce((sum, value) => sum + value, 0) / validRates.length
    : 0;

  return {
    total: rows.length,
    active: activeCount,
    automated: automatedCount,
    errors: errorCount,
    planned: statusCounts.planned ?? 0,
    due: dueCount,
    stale: staleCount,
    low_quality: lowQualityCount,
    needs_attention: needsAttentionCount,
    monthly_expected_posts: totalExpectedPosts,
    average_valid_post_rate: Math.round(averageValidRate * 10) / 10,
    status_counts: statusCounts,
    type_counts: typeCounts,
  };
}

async function loadRecentRuns(admin: ReturnType<typeof adminClient>, sourceIds: string[]) {
  if (sourceIds.length === 0) return [];

  const { data, error } = await admin
    .from("collection_source_runs")
    .select([
      "id",
      "source_id",
      "source_slug",
      "source_name",
      "run_phase",
      "run_status",
      "checked_count",
      "new_count",
      "valid_count",
      "duplicate_count",
      "rejected_count",
      "failed_count",
      "valid_post_rate",
      "error_message",
      "metadata_json",
      "started_at",
      "finished_at",
      "duration_ms",
      "created_at",
    ].join(","))
    .in("source_id", sourceIds)
    .order("created_at", { ascending: false })
    .limit(30);

  if (isMissingRunHistoryError(error)) return [];
  if (error) throw error;
  return data ?? [];
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const admin = adminClient();

  let dbQuery = admin
    .from("collection_sources")
    .select(SELECT_COLUMNS)
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (status && status !== "all") dbQuery = dbQuery.eq("status", status);
  if (query) {
    dbQuery = dbQuery.or(`name.ilike.%${query}%,source_slug.ilike.%${query}%,region_name.ilike.%${query}%`);
  }

  const { data, error } = await dbQuery;

  if (isMissingTableError(error)) {
    return NextResponse.json({
      configured: false,
      sources: [],
      summary: summarize([]),
      message: "collection_sources migration has not been applied yet.",
    });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sources = data ?? [];
  let recentRuns: any[] = [];
  try {
    recentRuns = await loadRecentRuns(admin, sources.map((source: any) => source.id).filter(Boolean));
  } catch (runError: any) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  return NextResponse.json({
    configured: true,
    sources,
    recent_runs: recentRuns,
    summary: summarize(sources),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = buildPayload(body as Record<string, unknown>);
  if (!payload.source_slug || !payload.name || !payload.list_url) {
    return NextResponse.json({ error: "source_slug, name, list_url are required" }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("collection_sources")
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const source = data as any;

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "collection_source",
    target_id: source.id,
    action_type: "create",
    metadata_json: { table: "collection_sources", source_slug: source.source_slug },
  });

  return NextResponse.json({ source });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String((body as Record<string, unknown>).id ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const payload = buildPayload(body as Record<string, unknown>);
  delete payload.id;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("collection_sources")
    .update(payload)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "collection_source",
    target_id: id,
    action_type: "update",
    metadata_json: { table: "collection_sources", fields: Object.keys(payload) },
  });

  return NextResponse.json({ source: data });
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = adminClient();
  const { error } = await admin.from("collection_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "collection_source",
    target_id: id,
    action_type: "delete",
    metadata_json: { table: "collection_sources" },
  });

  return NextResponse.json({ success: true });
}
