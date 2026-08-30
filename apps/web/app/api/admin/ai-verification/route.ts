import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const FIELD_REPORT_STATUS = new Set(["received", "reviewing", "actioned", "dismissed"]);
const MONITORED_POSTER_STATUSES = ["published", "review"] as const;
const AUTO_PUBLISH_TIER_DEFAULT = "A";
const MIN_AUTO_PUBLISH_CONTENT_TYPE_CONFIDENCE = 0.8;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type PosterExposureRow = {
  id?: string;
  poster_status?: string | null;
  exposure_tier?: string | null;
  tier_reason?: {
    gates?: Record<string, unknown>;
  } | null;
};
type PosterAutoPublishReviewRow = {
  id: string;
  poster_status: string | null;
  exposure_tier: string | null;
  tier_reason?: PosterExposureRow["tier_reason"];
  tier_computed_at: string | null;
  application_end_at: string | null;
  deadline_type: string | null;
};
type ContentTypeEvidenceRow = {
  poster_id: string;
  value_text: string | null;
  value_json: {
    type?: string;
    value?: string;
  } | null;
  confidence: number | string | null;
  extractor: string | null;
};
type ContentTypeBestByPoster = {
  value: string;
  confidence: number;
  extractor: string | null;
};
type AutoPublishBlockedReasonCounts = Record<string, number>;

function parseAutoPublishTiers(value: string | undefined) {
  const allowed = new Set(["A", "B", "C"]);
  const parsed = String(value || AUTO_PUBLISH_TIER_DEFAULT)
    .split(",")
    .map((tier) => tier.trim().toUpperCase())
    .filter(Boolean)
    .filter((tier) => allowed.has(tier));
  return parsed.length > 0 ? parsed : [AUTO_PUBLISH_TIER_DEFAULT];
}

function normalizePosterTier(value: unknown) {
  if (value === "A" || value === "B" || value === "C") return value;
  return "uncategorized";
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseCountValue(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function getGateEnabled(row: PosterExposureRow, candidate: string): boolean {
  const gates = asObject(row.tier_reason)?.gates;
  return asBoolean(asObject(gates)?.[candidate]);
}

function kstDateKey(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function isFixedDeadlineActive(row: Pick<PosterAutoPublishReviewRow, "deadline_type" | "application_end_at">) {
  if (String(row.deadline_type ?? "").toLowerCase() !== "fixed") return false;
  const deadlineKey = kstDateKey(row.application_end_at);
  const todayKey = kstDateKey(new Date().toISOString());
  return Boolean(deadlineKey && todayKey && deadlineKey >= todayKey);
}

function normalizeContentTypeValue(row: ContentTypeEvidenceRow): string {
  const jsonType = String(row?.value_json?.type ?? "").trim().toLowerCase();
  if (jsonType) return jsonType;
  const jsonValue = String(row?.value_json?.value ?? "").trim().toLowerCase();
  if (jsonValue) return jsonValue;
  return String(row.value_text ?? "").trim().toLowerCase();
}

function buildBestContentTypeByPoster(rows: ContentTypeEvidenceRow[]) {
  const byPoster = new Map<string, ContentTypeBestByPoster>();
  for (const row of rows) {
    const confidence = parseCountValue(row.confidence);
    if (!Number.isFinite(confidence) || confidence <= 0) continue;
    const existing = byPoster.get(row.poster_id);
    if (!existing || confidence > existing.confidence) {
      byPoster.set(row.poster_id, {
        value: normalizeContentTypeValue(row),
        confidence,
        extractor: row.extractor ?? null,
      });
    }
  }
  return byPoster;
}

function isAutoPublishEligible(
  row: PosterAutoPublishReviewRow,
  contentType: ContentTypeBestByPoster | undefined,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (String(row.application_end_at ?? "").trim() === "") reasons.push("missing_application_end_at");
  if (!isFixedDeadlineActive(row)) reasons.push("deadline_inactive_or_non_fixed");
  if (!row.tier_computed_at) reasons.push("missing_tier_computed_at");
  if (!contentType) reasons.push("missing_content_type_evidence");
  if (contentType) {
    if (contentType.value !== "recruit") reasons.push(`content_type_${contentType.value || "unknown"}`);
    if (contentType.value === "recruit" && contentType.confidence < MIN_AUTO_PUBLISH_CONTENT_TYPE_CONFIDENCE) reasons.push("low_confidence_content_type");
  }

  return { eligible: reasons.length === 0, reasons };
}

function incReasonCounter(counter: AutoPublishBlockedReasonCounts, reason: string) {
  counter[reason] = (counter[reason] ?? 0) + 1;
}

async function fetchExposureRows(admin: ReturnType<typeof createAdminClient>, pageSize = 1000): Promise<PosterExposureRow[]> {
  const rows: PosterExposureRow[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const response = await admin
      .from("posters")
      .select("id,poster_status,exposure_tier,tier_reason")
      .in("poster_status", MONITORED_POSTER_STATUSES)
      .not("exposure_tier", "is", null)
      .range(from, to);

    if (response.error) throw response.error;

    rows.push(...(response.data ?? []));

    const fetched = response.data?.length ?? 0;
    if (fetched < pageSize) break;
    page += 1;
  }

  return rows;
}

async function fetchAutoPublishReviewRows(admin: ReturnType<typeof createAdminClient>, pageSize = 1000): Promise<PosterAutoPublishReviewRow[]> {
  const rows: PosterAutoPublishReviewRow[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const response = await admin
      .from("posters")
      .select("id,poster_status,exposure_tier,tier_reason,tier_computed_at,application_end_at,deadline_type")
      .eq("poster_status", "review")
      .not("exposure_tier", "is", null)
      .range(from, to);
    if (response.error) throw response.error;

    rows.push(...((response.data ?? []) as PosterAutoPublishReviewRow[]));
    const fetched = response.data?.length ?? 0;
    if (fetched < pageSize) break;
    page += 1;
  }

  return rows;
}

async function fetchContentTypeEvidence(admin: ReturnType<typeof createAdminClient>, posterIds: string[], pageSize = 200): Promise<ContentTypeEvidenceRow[]> {
  if (!posterIds.length) return [];
  const rows: ContentTypeEvidenceRow[] = [];
  for (let index = 0; index < posterIds.length; index += pageSize) {
    const chunk = posterIds.slice(index, index + pageSize);
    const response = await admin
      .from("poster_field_evidence")
      .select("poster_id,value_text,value_json,confidence,extractor")
      .eq("field_key", "content_type")
      .in("poster_id", chunk);
    if (response.error) throw response.error;
    rows.push(...((response.data ?? []) as ContentTypeEvidenceRow[]));
  }
  return rows;
}

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
  const autoPublishEnabled = process.env.EXPOSURE_AUTO_PUBLISH === "true";
  const autoPublishTiers = parseAutoPublishTiers(process.env.AUTO_PUBLISH_TIERS);
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const since = sinceIso(days);

  const [usageRes, fieldOverviewRes, reportsRes, totalPublishedRes, totalReviewRes, exposureRows, autoPublishReviewRows] = await Promise.all([
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
    admin
      .from("posters")
      .select("id", { count: "exact", head: true })
      .eq("poster_status", "published"),
    admin
      .from("posters")
      .select("id", { count: "exact", head: true })
      .eq("poster_status", "review"),
    fetchExposureRows(admin),
    fetchAutoPublishReviewRows(admin),
  ]);

  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });
  if (fieldOverviewRes.error) return NextResponse.json({ error: fieldOverviewRes.error.message }, { status: 500 });
  if (reportsRes.error) return NextResponse.json({ error: reportsRes.error.message }, { status: 500 });
  if (totalPublishedRes.error) return NextResponse.json({ error: totalPublishedRes.error.message }, { status: 500 });
  if (totalReviewRes.error) return NextResponse.json({ error: totalReviewRes.error.message }, { status: 500 });
  const allExposureRows = exposureRows ?? [];
  const contentTypeEvidence = await fetchContentTypeEvidence(admin, autoPublishReviewRows.map((row) => row.id));
  const bestContentTypeByPoster = buildBestContentTypeByPoster(contentTypeEvidence);

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

  const totalPublished = parseCountValue(totalPublishedRes.count as number | null);
  const totalReview = parseCountValue(totalReviewRes.count as number | null);
  const totalTargetRows = totalPublished + totalReview;

  const gateCounts: Record<string, number> = {
    seo: 0,
    calendar: 0,
    deadlineAlert: 0,
    recommendation: 0,
  };
  const tierCounts: Record<string, number> = {
    A: 0,
    B: 0,
    C: 0,
    uncategorized: 0,
  };
  const autoPublishCandidates = allExposureRows.filter(
    (row) => row.poster_status === "review" && autoPublishTiers.includes(String(row.exposure_tier ?? "")),
  ).length;
  let autoPublishEligibleCandidates = 0;
  const autoPublishBlockedReasons: AutoPublishBlockedReasonCounts = {};
  for (const row of autoPublishReviewRows) {
    if (!autoPublishTiers.includes(String(row.exposure_tier ?? ""))) continue;
    const { eligible, reasons } = isAutoPublishEligible(row, bestContentTypeByPoster.get(row.id));
    if (eligible) {
      autoPublishEligibleCandidates += 1;
    } else {
      for (const reason of reasons) {
        incReasonCounter(autoPublishBlockedReasons, reason);
      }
    }
  }

  for (const row of allExposureRows) {
    const tier = normalizePosterTier(row.exposure_tier);
    tierCounts[tier] += 1;
    if (getGateEnabled(row, "seo")) gateCounts.seo += 1;
    if (getGateEnabled(row, "calendar")) gateCounts.calendar += 1;
    if (getGateEnabled(row, "deadlineAlert")) gateCounts.deadlineAlert += 1;
    if (getGateEnabled(row, "recommendation")) gateCounts.recommendation += 1;
  }

  const exposureSummary = {
    statusCounts: {
      published: totalPublished,
      review: totalReview,
    },
    tierCounts,
    uncomputedCount: Math.max(totalTargetRows - allExposureRows.length, 0),
    computedCount: allExposureRows.length,
    gateCounts,
    autoPublish: {
      enabled: autoPublishEnabled,
      tiers: autoPublishTiers,
      reviewCandidates: autoPublishCandidates,
      eligibleCandidates: autoPublishEligibleCandidates,
      blockedReasons: autoPublishBlockedReasons,
      requiresApply: true,
    },
  };

  return NextResponse.json({
    days,
    generatedAt: new Date().toISOString(),
    usageRows: usageRes.data ?? [],
    fieldOverview: fieldOverviewRes.data ?? [],
    exposureSummary,
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
