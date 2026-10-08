import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const CONFIRM_TOKEN = "AI_REVIEW_APPROVE_QUEUE";
const DEFAULT_REPOSITORY = "maxmini0130/PosterLink";
const DEFAULT_WORKFLOW_ID = "ai-review-queue.yml";
const DEFAULT_REF = "main";

type GithubWorkflowRun = {
  id: number;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string | null;
  event: string;
};

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
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
    .maybeSingle();

  return ADMIN_ROLES.has(profile?.role) ? user : null;
}

function githubConfig() {
  const repository =
    process.env.GITHUB_AI_REVIEW_REPOSITORY?.trim() ||
    process.env.GITHUB_CRAWLER_REPOSITORY?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim() ||
    DEFAULT_REPOSITORY;
  const workflowId =
    process.env.GITHUB_AI_REVIEW_WORKFLOW_ID?.trim() || DEFAULT_WORKFLOW_ID;
  const ref =
    process.env.GITHUB_AI_REVIEW_REF?.trim() ||
    process.env.GITHUB_CRAWLER_REF?.trim() ||
    DEFAULT_REF;
  const token = process.env.GITHUB_ACTIONS_TOKEN?.trim() || "";

  return {
    repository,
    workflowId,
    ref,
    token,
    workflowUrl: `https://github.com/${repository}/actions/workflows/${workflowId}`,
  };
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function reviewQueueCount() {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("posters")
    .select("id", { count: "exact", head: true })
    .eq("poster_status", "review");
  if (error) throw error;
  return count ?? 0;
}

async function latestWorkflowRun(config: ReturnType<typeof githubConfig>) {
  if (!config.token) return null;

  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflowId)}/runs?per_page=10`,
    { headers: githubHeaders(config.token), cache: "no-store" },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `GitHub Actions status failed: ${response.status} ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    workflow_runs?: GithubWorkflowRun[];
  };
  return (
    (payload.workflow_runs ?? []).find(
      (run) => run.head_branch === config.ref,
    ) ??
    payload.workflow_runs?.[0] ??
    null
  );
}

function serializeRun(run: GithubWorkflowRun | null) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const config = githubConfig();
    const [queueCount, latestRun] = await Promise.all([
      reviewQueueCount(),
      config.token ? latestWorkflowRun(config) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      configured: Boolean(config.token),
      queueCount,
      running:
        latestRun?.status === "queued" || latestRun?.status === "in_progress",
      latestRun: serializeRun(latestRun),
      workflowUrl: config.workflowUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI 검토 상태를 확인하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (body?.confirm !== CONFIRM_TOKEN) {
    return NextResponse.json(
      { error: "AI 검토 실행 확인값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const config = githubConfig();
  if (!config.token) {
    return NextResponse.json(
      {
        error:
          "GITHUB_ACTIONS_TOKEN이 설정되지 않아 백그라운드 AI 검토를 실행할 수 없습니다.",
      },
      { status: 501 },
    );
  }

  try {
    const [queueCount, activeRun] = await Promise.all([
      reviewQueueCount(),
      latestWorkflowRun(config),
    ]);
    if (queueCount === 0) {
      return NextResponse.json({
        ok: true,
        noop: true,
        queueCount: 0,
        message: "검수대기 항목이 없습니다.",
      });
    }
    if (activeRun?.status === "queued" || activeRun?.status === "in_progress") {
      return NextResponse.json(
        {
          error: "AI 검토가 이미 실행 중입니다.",
          latestRun: serializeRun(activeRun),
        },
        { status: 409 },
      );
    }

    const requestedLimit = Number(body?.limit ?? queueCount);
    const limit = Math.min(
      500,
      Math.max(
        1,
        Number.isFinite(requestedLimit)
          ? Math.floor(requestedLimit)
          : queueCount,
      ),
    );
    const response = await fetch(
      `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflowId)}/dispatches`,
      {
        method: "POST",
        headers: githubHeaders(config.token),
        body: JSON.stringify({
          ref: config.ref,
          inputs: {
            apply: "true",
            limit: String(limit),
            thorough: "true",
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error: `GitHub Actions 실행 요청 실패: ${response.status} ${detail.slice(0, 500)}`,
        },
        { status: 502 },
      );
    }

    const admin = createAdminClient();
    await admin.from("admin_actions").insert({
      actor_user_id: user.id,
      target_type: "poster",
      target_id: null,
      action_type: "update",
      action_reason: "dispatch_ai_review_queue",
      metadata_json: {
        action: "dispatch_ai_review_queue",
        repository: config.repository,
        workflow_id: config.workflowId,
        ref: config.ref,
        queue_count: queueCount,
        limit,
        thorough: true,
        apply: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        queueCount,
        limit,
        workflowUrl: config.workflowUrl,
        message: `${Math.min(queueCount, limit)}건의 정밀 AI 검토를 시작했습니다.`,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI 검토를 시작하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
