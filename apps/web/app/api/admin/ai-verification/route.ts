import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const FIELD_REPORT_STATUS = new Set(["received", "reviewing", "actioned", "dismissed"]);

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return ADMIN_ROLES.has(profile?.role) ? user : null;
}

function clampDays(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function sinceIso(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString();
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const admin = createAdminClient();
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const since = sinceIso(days);

  const [usageRes, fieldOverviewRes, reportsRes] = await Promise.all([
    admin
      .from("ai_usage_daily_overview")
      .select("day_kst,stage,stage_label,model,operation,status,call_count,input_tokens,output_tokens,image_count,estimated_unit_cost")
      .gte("day_kst", since.slice(0, 10))
      .order("day_kst", { ascending: false })
      .limit(500),
    admin
      .from("field_report_field_overview")
      .select("field_key,report_status,report_count,last_reported_at")
      .order("report_count", { ascending: false })
      .limit(100),
    admin
      .from("field_reports")
      .select("id,poster_id,field_key,reporter_id,note,report_status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });
  if (fieldOverviewRes.error) return NextResponse.json({ error: fieldOverviewRes.error.message }, { status: 500 });
  if (reportsRes.error) return NextResponse.json({ error: reportsRes.error.message }, { status: 500 });

  const reports = reportsRes.data ?? [];
  const posterIds = Array.from(new Set(reports.map((report: any) => report.poster_id).filter(Boolean)));
  const reporterIds = Array.from(new Set(reports.map((report: any) => report.reporter_id).filter(Boolean)));

  const [postersRes, profilesRes] = await Promise.all([
    posterIds.length
      ? admin.from("posters").select("id,title,poster_status").in("id", posterIds)
      : Promise.resolve({ data: [], error: null } as any),
    reporterIds.length
      ? admin.from("profiles").select("id,nickname").in("id", reporterIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (postersRes.error) return NextResponse.json({ error: postersRes.error.message }, { status: 500 });
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });

  const posterMap = Object.fromEntries((postersRes.data ?? []).map((poster: any) => [poster.id, poster]));
  const profileMap = Object.fromEntries((profilesRes.data ?? []).map((profile: any) => [profile.id, profile]));
  const fieldReportGroups = new Map<string, number>();
  for (const row of reports) {
    const key = `${row.poster_id}:${row.field_key}`;
    fieldReportGroups.set(key, (fieldReportGroups.get(key) ?? 0) + 1);
  }

  return NextResponse.json({
    days,
    generatedAt: new Date().toISOString(),
    usageRows: usageRes.data ?? [],
    fieldOverview: fieldOverviewRes.data ?? [],
    fieldReports: reports.map((report: any) => {
      const key = `${report.poster_id}:${report.field_key}`;
      return {
        ...report,
        poster: posterMap[report.poster_id] ?? null,
        reporter: profileMap[report.reporter_id] ?? null,
        sameFieldReportCount: fieldReportGroups.get(key) ?? 1,
      };
    }),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const reportId = String(body?.reportId ?? "").trim();
  const status = String(body?.status ?? "").trim();
  if (!reportId || !FIELD_REPORT_STATUS.has(status)) {
    return NextResponse.json({ error: "처리할 신고 상태가 올바르지 않습니다." }, { status: 400 });
  }

  const admin = createAdminClient();
  const payload: Record<string, unknown> = {
    report_status: status,
  };
  if (status === "actioned" || status === "dismissed") {
    payload.resolved_at = new Date().toISOString();
    payload.resolved_by = user.id;
  }

  const { data: report, error } = await admin
    .from("field_reports")
    .update(payload)
    .eq("id", reportId)
    .select("id,poster_id,field_key,report_status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "report",
    target_id: reportId,
    action_type: status === "dismissed" ? "dismiss" : "update",
    metadata_json: {
      reportType: "field_report",
      posterId: report.poster_id,
      fieldKey: report.field_key,
      reportStatus: report.report_status,
    },
  });

  return NextResponse.json({ ok: true, report });
}
