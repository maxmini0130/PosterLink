import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import {
  buildRevertPlan,
  confirmedRecord,
  type SourceReviewRecord,
} from "../../../../lib/sourceReviewChecks";
import { isUuid } from "../../../../lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const LIST_COLUMNS =
  "id,title,organizer_name,poster_status,application_end_at,deadline_type,thumbnail_url,updated_at,source_key,field_verification";
const DETAIL_SELECT =
  "*,poster_links(*),poster_images(*),poster_categories(*),poster_audiences(*)";

// The admin's own session is used for every query, so RLS applies.
async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return ADMIN_ROLES.has(profile?.role) ? { supabase, user } : null;
}

type ListRow = {
  id: string;
  title: string;
  organizer_name: string | null;
  poster_status: string;
  application_end_at: string | null;
  deadline_type: string | null;
  thumbnail_url: string | null;
  updated_at: string;
  source_key: string | null;
  field_verification: Record<string, any> | null;
};

function toItem(row: ListRow, key: "sourceReviewAuto" | "sourceReviewHold") {
  const { field_verification, ...rest } = row;
  const record = field_verification?.[key] ?? null;
  if (record && key === "sourceReviewAuto") {
    // The snapshot is only needed to revert; keep the list light.
    const { previous, ...light } = record;
    return {
      ...rest,
      record: { ...light, previousTitle: previous?.poster?.title ?? null },
    };
  }
  if (record && key === "sourceReviewHold") {
    const { proposal, ...light } = record;
    return {
      ...rest,
      record: { ...light, proposedTitle: proposal?.patch?.title ?? null },
    };
  }
  return { ...rest, record };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  const { supabase } = auth;

  const [pending, held, recent] = await Promise.all([
    supabase
      .from("posters")
      .select(LIST_COLUMNS)
      .eq("field_verification->sourceReviewAuto->postCheck->>status", "pending")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("posters")
      .select(LIST_COLUMNS)
      .eq("poster_status", "review")
      .not("field_verification->sourceReviewHold", "is", null)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("posters")
      .select(LIST_COLUMNS)
      .not("field_verification->sourceReviewAuto", "is", null)
      .neq(
        "field_verification->sourceReviewAuto->postCheck->>status",
        "pending",
      )
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  const error = pending.error ?? held.error ?? recent.error;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    pending: (pending.data as ListRow[]).map((row) =>
      toItem(row, "sourceReviewAuto"),
    ),
    held: (held.data as ListRow[]).map((row) =>
      toItem(row, "sourceReviewHold"),
    ),
    recent: (recent.data as ListRow[]).map((row) =>
      toItem(row, "sourceReviewAuto"),
    ),
  });
}

async function run(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data as Record<string, unknown>[] | null;
}

async function revert(
  supabase: SupabaseClient,
  poster: Record<string, any>,
  record: SourceReviewRecord,
  actor: { id: string; at: string },
) {
  const plan = buildRevertPlan(record, poster, actor);
  // Poster first, conditional on the version the admin looked at.
  const written = await run(
    supabase
      .from("posters")
      .update(plan.posterUpdate)
      .eq("id", poster.id)
      .eq("updated_at", poster.updated_at)
      .select("id"),
  );
  if (!written || written.length !== 1)
    return { ok: false as const, conflict: true };

  const notDone: string[] = [];
  for (const id of plan.deleteLinkIds) {
    const rows = await run(
      supabase
        .from("poster_links")
        .delete()
        .eq("poster_id", poster.id)
        .eq("id", id)
        .select("id"),
    );
    if (!rows?.length) notDone.push(`추가된 링크 ${id} 삭제`);
  }
  for (const link of plan.insertLinks)
    await run(
      supabase.from("poster_links").insert({ ...link, poster_id: poster.id }),
    );
  for (const update of plan.linkUpdates) {
    await run(
      supabase
        .from("poster_links")
        .update(update.patch)
        .eq("poster_id", poster.id)
        .eq("id", update.id),
    );
  }
  for (const image of plan.insertImages)
    await run(
      supabase.from("poster_images").insert({ ...image, poster_id: poster.id }),
    );
  for (const id of plan.deleteCategoryIds) {
    await run(
      supabase
        .from("poster_categories")
        .delete()
        .eq("poster_id", poster.id)
        .eq("category_id", id),
    );
  }
  for (const id of plan.insertCategoryIds) {
    await run(
      supabase
        .from("poster_categories")
        .insert({ poster_id: poster.id, category_id: id }),
    );
  }
  for (const id of plan.deleteAudienceIds) {
    // Needs the admin delete policy (20261127010000); without it RLS deletes nothing.
    const rows = await run(
      supabase
        .from("poster_audiences")
        .delete()
        .eq("poster_id", poster.id)
        .eq("audience_id", id)
        .select("audience_id"),
    );
    if (!rows?.length) notDone.push(`추가된 대상 태그 ${id} 삭제`);
  }
  for (const id of plan.insertAudienceIds) {
    await run(
      supabase
        .from("poster_audiences")
        .insert({ poster_id: poster.id, audience_id: id }),
    );
  }
  return { ok: true as const, notDone };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  const { supabase, user } = auth;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const action = body?.action;
  const expectedUpdatedAt = body?.expectedUpdatedAt;
  const note =
    typeof body?.note === "string" ? body.note.slice(0, 300) : undefined;
  if (
    !isUuid(id) ||
    !["confirm", "revert"].includes(action) ||
    typeof expectedUpdatedAt !== "string"
  ) {
    return NextResponse.json(
      { error: "요청 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { data: poster, error } = await supabase
    .from("posters")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!poster)
    return NextResponse.json(
      { error: "공고를 찾지 못했습니다." },
      { status: 404 },
    );
  const record = poster.field_verification?.sourceReviewAuto as
    | SourceReviewRecord
    | undefined;
  if (!record)
    return NextResponse.json(
      { error: "AI 자동 반영 기록이 없는 공고입니다." },
      { status: 400 },
    );
  if (!["pending", "not_needed"].includes(record.postCheck?.status)) {
    return NextResponse.json(
      { error: "이미 확인하거나 되돌린 공고입니다." },
      { status: 409 },
    );
  }
  if (poster.updated_at !== expectedUpdatedAt) {
    return NextResponse.json(
      {
        error:
          "목록을 불러온 뒤 공고가 바뀌었습니다. 새로고침한 뒤 다시 확인해 주세요.",
      },
      { status: 409 },
    );
  }

  const actor = { id: user.id, at: new Date().toISOString() };
  try {
    if (action === "confirm") {
      const written = await run(
        supabase
          .from("posters")
          .update({
            field_verification: {
              ...poster.field_verification,
              sourceReviewAuto: confirmedRecord(record, actor, note),
            },
          })
          .eq("id", id)
          .eq("updated_at", expectedUpdatedAt)
          .select("id"),
      );
      if (!written || written.length !== 1) {
        return NextResponse.json(
          { error: "다른 변경과 겹쳤습니다. 새로고침해 주세요." },
          { status: 409 },
        );
      }
      await supabase.from("admin_actions").insert({
        actor_user_id: user.id,
        target_type: "poster",
        target_id: id,
        action_type: "update",
        action_reason: "ai_source_review_confirmed",
        metadata_json: {
          version: record.version,
          runId: record.runId,
          decision: record.decision,
          note: note ?? null,
        },
      });
      return NextResponse.json({
        ok: true,
        message: "확인 완료로 표시했습니다.",
      });
    }

    const result = await revert(supabase, poster, record, actor);
    if (!result.ok) {
      return NextResponse.json(
        { error: "다른 변경과 겹쳤습니다. 새로고침해 주세요." },
        { status: 409 },
      );
    }
    await supabase.from("admin_actions").insert({
      actor_user_id: user.id,
      target_type: "poster",
      target_id: id,
      action_type: "update",
      action_reason: "ai_source_review_reverted",
      metadata_json: {
        version: record.version,
        runId: record.runId,
        decision: record.decision,
        notDone: result.notDone,
      },
    });
    return NextResponse.json({
      ok: true,
      notDone: result.notDone,
      message: result.notDone.length
        ? `검수 대기로 되돌렸습니다. 직접 처리할 항목: ${result.notDone.join(", ")}`
        : "자동 반영 전 상태로 되돌려 검수 대기로 보냈습니다.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "처리하지 못했습니다." },
      { status: 500 },
    );
  }
}
