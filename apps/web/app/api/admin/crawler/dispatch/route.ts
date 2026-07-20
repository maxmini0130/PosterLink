import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const DEFAULT_REPOSITORY = "maxmini0130/PosterLink";
const DEFAULT_WORKFLOW_ID = "crawler.yml";
const DEFAULT_REF = "main";
const SAFE_TARGET_RE = /^[A-Za-z0-9_.-]{1,120}$/;

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

function normalizeTarget(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeBooleanInput(value: unknown, defaultValue: boolean) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return "true";
    if (normalized === "false" || normalized === "0") return "false";
  }
  return defaultValue ? "true" : "false";
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.GITHUB_ACTIONS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_ACTIONS_TOKEN is not configured for background crawler dispatch." },
      { status: 501 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const source = normalizeTarget(body?.source);
  const site = normalizeTarget(body?.site);

  if (source && site) {
    return NextResponse.json({ error: "Use either source or site, not both." }, { status: 400 });
  }

  if ((source && !SAFE_TARGET_RE.test(source)) || (site && !SAFE_TARGET_RE.test(site))) {
    return NextResponse.json({ error: "Invalid crawler target id." }, { status: 400 });
  }

  const repository = process.env.GITHUB_CRAWLER_REPOSITORY?.trim()
    || process.env.GITHUB_REPOSITORY?.trim()
    || DEFAULT_REPOSITORY;
  const workflowId = process.env.GITHUB_CRAWLER_WORKFLOW_ID?.trim() || DEFAULT_WORKFLOW_ID;
  const ref = process.env.GITHUB_CRAWLER_REF?.trim() || DEFAULT_REF;
  const dryRun = normalizeBooleanInput(body?.dry_run ?? body?.dryRun, false);
  const upload = normalizeBooleanInput(body?.upload, true);
  const workflowUrl = `https://github.com/${repository}/actions/workflows/${workflowId}`;

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          source,
          site,
          dry_run: dryRun,
          upload,
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: `GitHub Actions dispatch failed: ${response.status} ${detail.slice(0, 500)}` },
      { status: 502 }
    );
  }

  const admin = createAdminClient();
  const targetSlug = source || site || "all";
  const { data: sourceRow } = targetSlug === "all"
    ? { data: null }
    : await admin
      .from("collection_sources")
      .select("id, source_slug, name")
      .eq("source_slug", targetSlug)
      .maybeSingle();

  const { error: runInsertError } = await admin.from("collection_source_runs").insert({
    source_id: sourceRow?.id ?? null,
    source_slug: sourceRow?.source_slug ?? targetSlug,
    source_name: sourceRow?.name ?? (targetSlug === "all" ? "All crawler sources" : targetSlug),
    run_phase: "crawl",
    run_status: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    duration_ms: null,
    metadata_json: {
      action: "dispatch_crawler_workflow",
      repository,
      workflow_id: workflowId,
      workflow_url: workflowUrl,
      ref,
      source: source || null,
      site: site || null,
      dry_run: dryRun,
      upload,
    },
  });
  if (runInsertError) {
    console.warn("[crawler-dispatch] failed to record running collection source run", runInsertError.message);
  }

  await admin.from("admin_actions").insert({
    actor_user_id: user.id,
    target_type: "collection_source",
    target_id: null,
    action_type: "update",
    metadata_json: {
      action: "dispatch_crawler_workflow",
      repository,
      workflow_id: workflowId,
      ref,
      source: source || null,
      site: site || null,
      dry_run: dryRun,
      upload,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Crawler workflow dispatched.",
    repository,
    workflow_id: workflowId,
    ref,
    source: source || null,
    site: site || null,
    dry_run: dryRun === "true",
    upload: upload === "true",
    workflowUrl,
  });
}
