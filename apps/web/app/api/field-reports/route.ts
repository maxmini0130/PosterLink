import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase-server";

const FIELD_KEYS = new Set([
  "deadline_date",
  "deadline_type",
  "host_org",
  "official_url",
  "is_real_poster",
  "content_type",
  "apply_start",
  "category",
  "region",
  "age_min",
  "age_max",
  "target_desc",
  "benefit",
  "apply_method",
  "apply_url",
  "cost",
  "contact",
  "capacity",
  "venue",
  "required_documents",
]);

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function cleanNote(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 1000) : null;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const posterId = String(body?.posterId ?? "").trim();
  const fieldKey = String(body?.fieldKey ?? "").trim();
  const note = cleanNote(body?.note);

  if (!posterId || !FIELD_KEYS.has(fieldKey)) {
    return NextResponse.json({ error: "신고할 필드 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const admin = adminClient();
  const { data: poster, error: posterError } = await admin
    .from("posters")
    .select("id,poster_status")
    .eq("id", posterId)
    .maybeSingle();

  if (posterError) {
    return NextResponse.json({ error: posterError.message }, { status: 500 });
  }
  if (!poster || poster.poster_status !== "published") {
    return NextResponse.json({ error: "공개된 공고만 신고할 수 있습니다." }, { status: 404 });
  }

  const { data: report, error } = await admin
    .from("field_reports")
    .upsert({
      poster_id: posterId,
      field_key: fieldKey,
      reporter_id: user.id,
      note,
      report_status: "received",
    }, { onConflict: "poster_id,field_key,reporter_id" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reportId: report.id });
}
