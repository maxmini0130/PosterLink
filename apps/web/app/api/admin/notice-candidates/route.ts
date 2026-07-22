import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const STATUS_VALUES = new Set(["pending", "drafting", "converted", "dismissed", "archived"]);
const EDITABLE_TEXT_FIELDS = [
  "title",
  "source_org_name",
  "source_url",
  "summary_short",
  "summary_long",
  "category_name",
  "admin_note",
] as const;

const TEXT_FIELD_LIMITS: Record<(typeof EDITABLE_TEXT_FIELDS)[number], number> = {
  title: 300,
  source_org_name: 200,
  source_url: 2000,
  summary_short: 1000,
  summary_long: 8000,
  category_name: 100,
  admin_note: 1000,
};

const EDITABLE_DATE_FIELDS = [
  "notice_date",
  "application_start_at",
  "application_end_at",
] as const;

const SELECT_COLUMNS = [
  "id",
  "source_key",
  "source_url",
  "title",
  "source_org_name",
  "summary_short",
  "summary_long",
  "candidate_status",
  "candidate_type",
  "source_site_id",
  "collection_source_slug",
  "board_name",
  "category_name",
  "notice_date",
  "application_start_at",
  "application_end_at",
  "reason",
  "quality_issues",
  "field_verification",
  "raw_payload",
  "generated_poster_id",
  "reviewed_by",
  "reviewed_at",
  "admin_note",
  "created_at",
  "updated_at",
].join(",");

function createAdminClient() {
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

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return ADMIN_ROLES.has(profile?.role) ? user : null;
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || (error.message ?? "").includes("poster_notice_candidates");
}

function summarize(rows: Array<{ candidate_status: string | null }>) {
  const counts: Record<string, number> = {
    pending: 0,
    drafting: 0,
    converted: 0,
    dismissed: 0,
    archived: 0,
  };

  for (const row of rows) {
    const status = row.candidate_status ?? "pending";
    counts[status] = (counts[status] ?? 0) + 1;
  }

  return {
    total: rows.length,
    ...counts,
  };
}

function sanitizeTextField(value: unknown, limit: number) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function sanitizeLongTextField(value: unknown, limit: number) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function sanitizeDateField(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const admin = createAdminClient();

  let candidatesQuery = admin
    .from("poster_notice_candidates")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);

  if (id) {
    candidatesQuery = candidatesQuery.eq("id", id);
  } else if (status !== "all") {
    candidatesQuery = candidatesQuery.eq("candidate_status", status);
  }
  if (query) {
    candidatesQuery = candidatesQuery.or(
      `title.ilike.%${query}%,source_org_name.ilike.%${query}%,collection_source_slug.ilike.%${query}%`
    );
  }

  const [candidatesRes, summaryRes] = await Promise.all([
    candidatesQuery,
    admin
      .from("poster_notice_candidates")
      .select("candidate_status")
      .limit(10000),
  ]);

  if (isMissingTableError(candidatesRes.error) || isMissingTableError(summaryRes.error)) {
    return NextResponse.json({
      configured: false,
      candidates: [],
      summary: summarize([]),
      message: "poster_notice_candidates migration has not been applied yet.",
    });
  }

  if (candidatesRes.error) {
    return NextResponse.json({ error: candidatesRes.error.message }, { status: 500 });
  }
  if (summaryRes.error) {
    return NextResponse.json({ error: summaryRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    configured: true,
    candidates: candidatesRes.data ?? [],
    summary: summarize(summaryRes.data ?? []),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String((body as Record<string, unknown>).id ?? "");
  const rawBody = body as Record<string, unknown>;
  const candidateStatus = typeof rawBody.candidate_status === "string" ? rawBody.candidate_status : "";

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (candidateStatus && !STATUS_VALUES.has(candidateStatus)) {
    return NextResponse.json({ error: "invalid candidate_status" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };

  const changedFields: string[] = [];
  if (candidateStatus) {
    payload.candidate_status = candidateStatus;
    changedFields.push("candidate_status");
  }

  for (const field of EDITABLE_TEXT_FIELDS) {
    if (!(field in rawBody)) continue;
    const value = field === "summary_long"
      ? sanitizeLongTextField(rawBody[field], TEXT_FIELD_LIMITS[field])
      : sanitizeTextField(rawBody[field], TEXT_FIELD_LIMITS[field]);
    if (value === undefined) {
      return NextResponse.json({ error: `invalid ${field}` }, { status: 400 });
    }
    if (field === "title" && value === null) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    payload[field] = value;
    changedFields.push(field);
  }

  for (const field of EDITABLE_DATE_FIELDS) {
    if (!(field in rawBody)) continue;
    const value = sanitizeDateField(rawBody[field]);
    if (value === undefined) {
      return NextResponse.json({ error: `invalid ${field}` }, { status: 400 });
    }
    payload[field] = value;
    changedFields.push(field);
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ error: "no editable fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("poster_notice_candidates")
    .update(payload)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (isMissingTableError(error)) {
    return NextResponse.json({ error: "poster_notice_candidates migration has not been applied yet." }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "notice_candidate",
    target_id: id,
    action_type: "update",
    metadata_json: {
      table: "poster_notice_candidates",
      candidate_status: candidateStatus || undefined,
      changed_fields: changedFields,
    },
  });

  return NextResponse.json({ candidate: data });
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("poster_notice_candidates")
    .delete()
    .eq("id", id);

  if (isMissingTableError(error)) {
    return NextResponse.json({ error: "poster_notice_candidates migration has not been applied yet." }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "notice_candidate",
    target_id: id,
    action_type: "delete",
    metadata_json: { table: "poster_notice_candidates" },
  });

  return NextResponse.json({ success: true });
}
