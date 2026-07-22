import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const POSTER_IMAGE_BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

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

function asPlainObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function cleanupPartial(
  admin: ReturnType<typeof createAdminClient>,
  posterId: string | null,
  storagePath: string | null
) {
  const cleanupTasks = [];
  if (posterId) cleanupTasks.push(admin.from("posters").delete().eq("id", posterId));
  if (storagePath) cleanupTasks.push(admin.storage.from(POSTER_IMAGE_BUCKET).remove([storagePath]));
  await Promise.allSettled(cleanupTasks);
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  let uploadedStoragePath: string | null = null;
  let createdPosterId: string | null = null;

  try {
    const formData = await request.formData();
    const candidateId = String(formData.get("id") ?? "").trim();
    const image = formData.get("image");

    if (!candidateId) throw new HttpError("candidate id is required", 400);
    if (!(image instanceof File)) throw new HttpError("image file is required", 400);
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      throw new HttpError("jpg, png, webp 이미지만 업로드할 수 있습니다.", 400);
    }
    if (image.size > MAX_UPLOAD_BYTES) {
      throw new HttpError("이미지는 8MB 이하만 업로드할 수 있습니다.", 413);
    }

    const { data: candidate, error: candidateError } = await admin
      .from("poster_notice_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (isMissingTableError(candidateError)) {
      throw new HttpError("poster_notice_candidates migration has not been applied yet.", 409);
    }
    if (candidateError) throw new HttpError(candidateError.message, 500);
    if (!candidate) throw new HttpError("후보를 찾지 못했습니다.", 404);
    if (candidate.generated_poster_id || candidate.candidate_status === "converted") {
      throw new HttpError("이미 포스터로 전환된 후보입니다.", 409);
    }

    const title = String(candidate.title ?? "").replace(/\s+/g, " ").trim();
    if (!title) throw new HttpError("후보 제목이 비어 있습니다.", 400);

    const { data: existingPoster, error: existingPosterError } = await admin
      .from("posters")
      .select("id")
      .eq("source_key", candidate.source_key)
      .maybeSingle();

    if (existingPosterError) throw new HttpError(existingPosterError.message, 500);
    if (existingPoster) {
      throw new HttpError("이미 같은 원문 키로 생성된 포스터가 있습니다.", 409);
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const extension = getExtension(image.type);
    uploadedStoragePath = `${user.id}/notice-candidates/${candidateId}/${Date.now()}_${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from(POSTER_IMAGE_BUCKET)
      .upload(uploadedStoragePath, imageBuffer, { contentType: image.type, upsert: false });

    if (uploadError) throw new HttpError(uploadError.message, 500);

    const {
      data: { publicUrl },
    } = admin.storage.from(POSTER_IMAGE_BUCKET).getPublicUrl(uploadedStoragePath);

    const convertedAt = new Date().toISOString();
    const sourceUrl = normalizeHttpUrl(candidate.source_url) ?? normalizeHttpUrl(candidate.source_key);
    const fieldVerification = {
      ...asPlainObject(candidate.field_verification),
      imageSource: "admin_upload",
      noticeCandidateId: candidate.id,
      noticeCandidateSourceKey: candidate.source_key,
      convertedAt,
      convertedBy: user.id,
    };

    const { data: poster, error: posterError } = await admin
      .from("posters")
      .insert({
        title,
        source_org_name: candidate.source_org_name ?? candidate.collection_source_slug ?? null,
        summary_short: candidate.summary_short ?? null,
        summary_long: candidate.summary_long ?? null,
        poster_status: "review",
        application_start_at: candidate.application_start_at ?? null,
        application_end_at: candidate.application_end_at ?? null,
        created_by: user.id,
        thumbnail_url: publicUrl,
        source_key: candidate.source_key,
        field_verification: fieldVerification,
      })
      .select("id,title,poster_status,thumbnail_url,source_key")
      .single();

    if (posterError) throw new HttpError(posterError.message, 500);
    createdPosterId = poster.id;

    const { error: imageInsertError } = await admin.from("poster_images").insert({
      poster_id: poster.id,
      storage_path: publicUrl,
      image_type: "thumbnail",
    });
    if (imageInsertError) throw new HttpError(imageInsertError.message, 500);

    if (sourceUrl) {
      const { error: linkError } = await admin.from("poster_links").insert({
        poster_id: poster.id,
        link_type: "official_notice",
        url: sourceUrl,
        title: "원문 공고",
        is_primary: true,
      });
      if (linkError) throw new HttpError(linkError.message, 500);
    }

    const existingNote = typeof candidate.admin_note === "string" ? candidate.admin_note.trim() : "";
    const conversionNote = `직접 이미지 업로드로 포스터 검수 항목 전환: ${convertedAt}`;
    const nextAdminNote = [existingNote, conversionNote].filter(Boolean).join("\n");

    const { data: updatedCandidate, error: candidateUpdateError } = await admin
      .from("poster_notice_candidates")
      .update({
        candidate_status: "converted",
        generated_poster_id: poster.id,
        reviewed_by: user.id,
        reviewed_at: convertedAt,
        admin_note: nextAdminNote,
      })
      .eq("id", candidateId)
      .select("*")
      .single();

    if (candidateUpdateError) throw new HttpError(candidateUpdateError.message, 500);

    await admin.from("admin_actions").insert({
      actor_user_id: user.id,
      target_type: "notice_candidate",
      target_id: candidateId,
      action_type: "update",
      metadata_json: {
        table: "poster_notice_candidates",
        action: "convert_to_review_poster",
        poster_id: poster.id,
        source_key: candidate.source_key,
        image_storage_path: uploadedStoragePath,
      },
    });

    return NextResponse.json({
      poster,
      candidate: updatedCandidate,
      image: {
        publicUrl,
        storagePath: uploadedStoragePath,
      },
    });
  } catch (error) {
    await cleanupPartial(admin, createdPosterId, uploadedStoragePath);
    const message = error instanceof Error ? error.message : "포스터로 전환하지 못했습니다.";
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
