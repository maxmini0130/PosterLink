import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

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

function compactReason(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 500) : "Stale crawler run was manually closed by an administrator.";
}

function durationFrom(startedAt: string | null, finishedAt: string) {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;
  return Math.max(0, Math.round(finished - started));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  if (action !== "mark_timeout") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const admin = adminClient();
  const { id } = await params;
  const { data: run, error: runError } = await admin
    .from("collection_source_runs")
    .select("id,source_id,source_slug,source_name,run_status,started_at,created_at,metadata_json")
    .eq("id", id)
    .maybeSingle();

  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.run_status !== "running") {
    return NextResponse.json({ error: "Only running runs can be closed." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const reason = compactReason(body?.reason);
  const metadata = run.metadata_json && typeof run.metadata_json === "object" ? run.metadata_json : {};
  const patch = {
    run_status: "error",
    finished_at: now,
    duration_ms: durationFrom(run.started_at ?? run.created_at ?? null, now),
    error_message: reason,
    metadata_json: {
      ...metadata,
      manual_close: {
        action,
        reason,
        closed_at: now,
        closed_by: user.id,
      },
    },
  };

  const { data: updatedRun, error: updateError } = await admin
    .from("collection_source_runs")
    .update(patch)
    .eq("id", run.id)
    .select("id,source_id,source_slug,source_name,run_phase,run_status,started_at,finished_at,duration_ms,error_message,metadata_json,created_at")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (run.source_id) {
    const { data: source } = await admin
      .from("collection_sources")
      .select("id,consecutive_error_count")
      .eq("id", run.source_id)
      .maybeSingle();

    await admin
      .from("collection_sources")
      .update({
        last_run_status: "error",
        last_error_at: now,
        last_error_message: reason,
        consecutive_error_count: Number(source?.consecutive_error_count ?? 0) + 1,
      })
      .eq("id", run.source_id);
  }

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "collection_source",
    target_id: run.source_id ?? null,
    action_type: "update",
    action_reason: reason,
    metadata_json: {
      table: "collection_source_runs",
      run_id: run.id,
      source_slug: run.source_slug,
      action,
    },
  });

  return NextResponse.json({ ok: true, run: updatedRun });
}
