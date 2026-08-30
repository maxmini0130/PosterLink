import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";
import { sanitizeNoticeFactValue } from "../../../../../../../scripts/crawler/src/notice-fact-normalizer.js";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const POSTER_IMAGE_BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_SOURCE_VALUES = new Set(["admin_upload", "template_canvas"]);
const STRUCTURED_POSTER_FIELDS = new Set([
  "organizer_name",
  "application_organization_name",
  "deadline_type",
  "event_start_at",
  "event_end_at",
  "eligibility_summary",
  "target_age_min",
  "target_age_max",
  "participation_fee",
  "benefits_summary",
  "recruitment_count",
  "application_method",
  "required_documents",
  "contact_info",
  "event_location",
  "verified_at",
  "verification_status",
  "data_confidence",
]);
const CATEGORY_LABEL_CODE_MAP = new Map([
  ["지원금/복지", "CAT_WELFARE"],
  ["복지", "CAT_WELFARE"],
  ["교육/취업", "CAT_EDUCATION"],
  ["교육", "CAT_EDUCATION"],
  ["취업", "CAT_EDUCATION"],
  ["채용", "CAT_EDUCATION"],
  ["일자리", "CAT_EDUCATION"],
  ["장학", "CAT_EDUCATION"],
  ["문화/행사", "CAT_CULTURE"],
  ["문화", "CAT_CULTURE"],
  ["행사", "CAT_CULTURE"],
  ["체육", "CAT_HEALTH"],
  ["주거/금융", "CAT_HOUSING"],
  ["금융", "CAT_HOUSING"],
  ["소상공인", "CAT_BUSINESS"],
  ["창업", "CAT_BUSINESS"],
  ["육아/가족", "CAT_FAMILY"],
  ["가족", "CAT_FAMILY"],
  ["건강/의료", "CAT_HEALTH"],
  ["건강", "CAT_HEALTH"],
  ["기타", "CAT_OTHER"],
]);

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

function isMissingStructuredPosterColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /organizer_name|deadline_type|verification_status/.test(message)
  );
}

function withoutStructuredPosterFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !STRUCTURED_POSTER_FIELDS.has(key))
  );
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

function normalizeOptionalText(value: FormDataEntryValue | null, limit: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function normalizeOptionalLongText(value: FormDataEntryValue | null, limit: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function normalizeOptionalDate(value: FormDataEntryValue | null, fieldName: string) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new HttpError(`invalid ${fieldName}`, 400);
  return date.toISOString();
}

function compactText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCategoryCode(value: unknown) {
  const code = compactText(value);
  return /^CAT_[A-Z_]+$/.test(code) ? code : null;
}

function normalizeCategoryCodes(values: unknown[]) {
  const codes = new Set<string>();
  for (const value of values) {
    const code = normalizeCategoryCode(value);
    if (code) codes.add(code);
  }
  return [...codes].slice(0, 3);
}

function parseCategoryCodeOverrides(formData: FormData) {
  const rawValues = formData.getAll("category_codes");
  const values: unknown[] = [];

  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") continue;
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) values.push(...parsed);
      } catch {
        throw new HttpError("invalid category_codes", 400);
      }
    } else {
      values.push(...trimmed.split(","));
    }
  }

  return normalizeCategoryCodes(values);
}

function firstCompactText(values: unknown[], limit = 2000) {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text.slice(0, limit);
  }
  return null;
}

function firstSafeFactText(values: unknown[], key: string, limit = 2000) {
  for (const value of values) {
    const text = sanitizeNoticeFactValue(value, key);
    if (text) return text.slice(0, limit);
  }
  return null;
}

function normalizeDeadlineType(value: unknown, applicationEndAt: string | null) {
  switch (compactText(value).toLowerCase()) {
    case "고정":
    case "fixed":
      return "fixed";
    case "상시":
    case "ongoing":
      return "ongoing";
    case "소진시":
    case "소진 시":
    case "until_exhausted":
      return "until_exhausted";
    case "예정":
    case "scheduled":
      return "scheduled";
    default:
      return applicationEndAt ? "fixed" : "unknown";
  }
}

function getCandidateStructuredFields(
  candidate: Record<string, any>,
  applicationStartAt: string | null,
  applicationEndAt: string | null
) {
  const verification = asPlainObject(candidate.field_verification);
  const organization = asPlainObject(verification.organization);
  const readableNotice = asPlainObject(verification.readableNotice);
  const facts = asPlainObject(readableNotice.facts);
  const llmMeta = asPlainObject(readableNotice.factsLlmMeta);
  const llmFilledFields = new Set(
    Array.isArray(llmMeta.filledByLlm)
      ? llmMeta.filledByLlm.map((key) => String(key))
      : []
  );
  const trustedFact = (key: string) =>
    llmFilledFields.has(key) ? null : facts[key];
  const confidence = Number(verification.confidence ?? organization.confidence);

  return {
    organizer_name: firstCompactText(
      [organization.organizerName, organization.displayOrgName, verification.correctedOrgName],
      300
    ),
    application_organization_name: firstCompactText(
      [
        organization.applicationOrganizationName,
        organization.applicationOrgName,
        verification.applicationOrganizationName,
      ],
      300
    ),
    deadline_type: normalizeDeadlineType(candidate.deadline_type, applicationEndAt),
    application_start_at: applicationStartAt,
    application_end_at: applicationEndAt,
    eligibility_summary: firstSafeFactText(
      [candidate.target, trustedFact("target")],
      "target"
    ),
    benefits_summary: firstSafeFactText(
      [candidate.support_scale, trustedFact("benefits"), trustedFact("content")],
      "content",
      4000
    ),
    application_method: firstSafeFactText(
      [trustedFact("application")],
      "application",
      4000
    ),
    contact_info: firstSafeFactText(
      [candidate.contact, trustedFact("contact")],
      "contact",
      1000
    ),
    event_location: firstSafeFactText(
      [trustedFact("location")],
      "location",
      1000
    ),
    verification_status: "needs_review",
    data_confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
  };
}

function asPlainObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getCandidateClassification(candidate: Record<string, unknown>) {
  const fieldVerification = asPlainObject(candidate.field_verification);
  return asPlainObject(fieldVerification.classification);
}

function collectCandidateCategoryCodes(
  candidate: Record<string, unknown>,
  categoryNameOverride: string | null,
  categoryCodeOverrides: string[] = []
) {
  if (categoryCodeOverrides.length > 0) return normalizeCategoryCodes(categoryCodeOverrides);

  const classification = getCandidateClassification(candidate);
  const codes = new Set<string>();

  for (const category of asPlainObjectArray(classification.categories)) {
    const code = compactText(category.code);
    if (code) codes.add(code);
  }
  for (const code of Array.isArray(classification.categoryCodes) ? classification.categoryCodes : []) {
    const normalized = compactText(code);
    if (normalized) codes.add(normalized);
  }

  const categoryName = categoryNameOverride ?? compactText(candidate.category_name);
  for (const categoryNamePart of categoryName.split(/[,/|·]+/).map((part) => part.trim()).filter(Boolean)) {
    const mapped = CATEGORY_LABEL_CODE_MAP.get(categoryNamePart);
    if (mapped) codes.add(mapped);
    if (/^CAT_[A-Z_]+$/.test(categoryNamePart)) codes.add(categoryNamePart);
  }

  return [...codes].slice(0, 3);
}

function collectCandidateRegionCodes(candidate: Record<string, unknown>) {
  const classification = getCandidateClassification(candidate);
  const codes = new Set<string>();

  for (const region of asPlainObjectArray(classification.regions)) {
    const code = compactText(region.code);
    if (code) codes.add(code);
  }
  for (const code of Array.isArray(classification.regionCodes) ? classification.regionCodes : []) {
    const normalized = compactText(code);
    if (normalized) codes.add(normalized);
  }

  return [...codes].slice(0, 3);
}

async function attachPosterTaxonomy(
  admin: ReturnType<typeof createAdminClient>,
  posterId: string,
  candidate: Record<string, unknown>,
  categoryNameOverride: string | null,
  categoryCodeOverrides: string[] = []
) {
  const assignedCategoryCodes: string[] = [];
  const assignedRegionCodes: string[] = [];
  const categoryCodes = collectCandidateCategoryCodes(candidate, categoryNameOverride, categoryCodeOverrides);
  const regionCodes = collectCandidateRegionCodes(candidate);

  if (categoryCodes.length > 0) {
    const { data: categories, error } = await admin
      .from("categories")
      .select("id,code,name")
      .in("code", categoryCodes);
    if (error) throw new HttpError(error.message, 500);

    const categoryRows = categories ?? [];
    if (categoryRows.length > 0) {
      const { error: categoryInsertError } = await admin
        .from("poster_categories")
        .upsert(categoryRows.map((category) => ({
          poster_id: posterId,
          category_id: category.id,
        })), { onConflict: "poster_id,category_id", ignoreDuplicates: true });
      if (categoryInsertError) throw new HttpError(categoryInsertError.message, 500);
      assignedCategoryCodes.push(...categoryRows.map((category) => category.code).filter(Boolean));
    }
  }

  if (regionCodes.length > 0) {
    const { data: regions, error } = await admin
      .from("regions")
      .select("id,code,name,full_name")
      .in("code", regionCodes);
    if (error) throw new HttpError(error.message, 500);

    const regionRows = regions ?? [];
    if (regionRows.length > 0) {
      const { error: regionInsertError } = await admin
        .from("poster_regions")
        .upsert(regionRows.map((region) => ({
          poster_id: posterId,
          region_id: region.id,
        })), { onConflict: "poster_id,region_id", ignoreDuplicates: true });
      if (regionInsertError) throw new HttpError(regionInsertError.message, 500);
      assignedRegionCodes.push(...regionRows.map((region) => region.code).filter(Boolean));
    }
  }

  return { assignedCategoryCodes, assignedRegionCodes };
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
    const titleOverride = normalizeOptionalText(formData.get("title"), 300);
    const orgOverride = normalizeOptionalText(formData.get("source_org_name"), 200);
    const sourceUrlOverride = formData.has("source_url") ? normalizeOptionalText(formData.get("source_url"), 2000) : undefined;
    const summaryOverride = normalizeOptionalText(formData.get("summary_short"), 1000);
    const summaryLongOverride = formData.has("summary_long") ? normalizeOptionalLongText(formData.get("summary_long"), 8000) : undefined;
    const categoryNameOverride = normalizeOptionalText(formData.get("category_name"), 100);
    const categoryCodeOverrides = parseCategoryCodeOverrides(formData);
    const noticeDateOverride = formData.has("notice_date") ? normalizeOptionalDate(formData.get("notice_date"), "notice_date") : undefined;
    const applicationStartOverride = formData.has("application_start_at")
      ? normalizeOptionalDate(formData.get("application_start_at"), "application_start_at")
      : undefined;
    const applicationEndOverride = formData.has("application_end_at")
      ? normalizeOptionalDate(formData.get("application_end_at"), "application_end_at")
      : undefined;
    const imageSourceInput = normalizeOptionalText(formData.get("image_source"), 50);
    const imageSource = imageSourceInput && IMAGE_SOURCE_VALUES.has(imageSourceInput)
      ? imageSourceInput
      : "admin_upload";

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

    const title = titleOverride ?? String(candidate.title ?? "").replace(/\s+/g, " ").trim();
    const sourceOrgName = orgOverride ?? candidate.source_org_name ?? candidate.collection_source_slug ?? null;
    const summaryShort = summaryOverride ?? candidate.summary_short ?? null;
    const summaryLong = summaryLongOverride !== undefined ? summaryLongOverride : candidate.summary_long ?? null;
    const categoryName = categoryNameOverride ?? candidate.category_name ?? null;
    const noticeDate = noticeDateOverride !== undefined ? noticeDateOverride : candidate.notice_date ?? null;
    const applicationStartAt = applicationStartOverride !== undefined ? applicationStartOverride : candidate.application_start_at ?? null;
    const applicationEndAt = applicationEndOverride !== undefined ? applicationEndOverride : candidate.application_end_at ?? null;
    const candidateSourceUrl = sourceUrlOverride !== undefined ? sourceUrlOverride : candidate.source_url ?? null;
    const candidateApplyUrl = normalizeHttpUrl(candidate.apply_url);
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
    const sourceUrl = normalizeHttpUrl(candidateSourceUrl) ?? normalizeHttpUrl(candidate.source_key);
    const fieldVerification = {
      ...asPlainObject(candidate.field_verification),
      imageSource,
      noticeCandidateId: candidate.id,
      noticeCandidateSourceKey: candidate.source_key,
      noticeCandidateType: candidate.candidate_type ?? null,
      noticeCandidateReason: candidate.reason ?? null,
      noticeCandidateQualityIssues: Array.isArray(candidate.quality_issues) ? candidate.quality_issues : [],
      generatedPoster: {
        imageSource,
        categoryName,
        createdFrom: "notice_candidate",
      },
      convertedAt,
      convertedBy: user.id,
    };
    const structuredFields = getCandidateStructuredFields(candidate, applicationStartAt, applicationEndAt);

    const posterRecord = {
      title,
      source_org_name: sourceOrgName,
      summary_short: summaryShort,
      summary_long: summaryLong,
      poster_status: "review",
      ...structuredFields,
      created_by: user.id,
      thumbnail_url: publicUrl,
      source_key: candidate.source_key,
      field_verification: fieldVerification,
    };
    let posterInsert = await admin
      .from("posters")
      .insert(posterRecord)
      .select("id,title,poster_status,thumbnail_url,source_key")
      .single();
    if (isMissingStructuredPosterColumnError(posterInsert.error)) {
      posterInsert = await admin
        .from("posters")
        .insert(withoutStructuredPosterFields(posterRecord))
        .select("id,title,poster_status,thumbnail_url,source_key")
        .single();
    }
    const { data: poster, error: posterError } = posterInsert;

    if (posterError || !poster) {
      throw new HttpError(posterError?.message ?? "포스터 생성 결과를 확인하지 못했습니다.", 500);
    }
    createdPosterId = poster.id;

    const taxonomy = await attachPosterTaxonomy(admin, poster.id, candidate, categoryNameOverride, categoryCodeOverrides);
    if (taxonomy.assignedCategoryCodes.length > 0 || taxonomy.assignedRegionCodes.length > 0) {
      const { error: taxonomyMetaError } = await admin
        .from("posters")
        .update({
          field_verification: {
            ...fieldVerification,
            generatedPoster: {
              ...fieldVerification.generatedPoster,
              assignedCategoryCodes: taxonomy.assignedCategoryCodes,
              assignedRegionCodes: taxonomy.assignedRegionCodes,
            },
          },
        })
        .eq("id", poster.id);
      if (taxonomyMetaError) throw new HttpError(taxonomyMetaError.message, 500);
    }

    const { error: imageInsertError } = await admin.from("poster_images").insert({
      poster_id: poster.id,
      storage_path: publicUrl,
      image_type: "thumbnail",
    });
    if (imageInsertError) throw new HttpError(imageInsertError.message, 500);

    const posterLinks = [
      ...(candidateApplyUrl
        ? [{
            poster_id: poster.id,
            link_type: "official_apply",
            url: candidateApplyUrl,
            title: "공식 신청 링크",
            is_primary: true,
          }]
        : []),
      ...(sourceUrl && sourceUrl !== candidateApplyUrl
        ? [{
            poster_id: poster.id,
            link_type: "official_notice",
            url: sourceUrl,
            title: "원문 공고",
            is_primary: !candidateApplyUrl,
          }]
        : []),
    ];
    if (posterLinks.length > 0) {
      const { error: linkError } = await admin.from("poster_links").insert(posterLinks);
      if (linkError) throw new HttpError(linkError.message, 500);
    }

    const existingNote = typeof candidate.admin_note === "string" ? candidate.admin_note.trim() : "";
    const conversionNote = `${imageSource === "template_canvas" ? "간단 제작 이미지" : "직접 이미지 업로드"}로 포스터 검수 항목 전환: ${convertedAt}`;
    const nextAdminNote = [existingNote, conversionNote].filter(Boolean).join("\n");

    const { data: updatedCandidate, error: candidateUpdateError } = await admin
      .from("poster_notice_candidates")
      .update({
        candidate_status: "converted",
        title,
        source_org_name: sourceOrgName,
        source_url: candidateSourceUrl,
        summary_short: summaryShort,
        summary_long: summaryLong,
        category_name: categoryName,
        notice_date: noticeDate,
        application_start_at: applicationStartAt,
        application_end_at: applicationEndAt,
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
        source_url: candidateSourceUrl,
        image_source: imageSource,
        image_storage_path: uploadedStoragePath,
        assigned_category_codes: taxonomy.assignedCategoryCodes,
        assigned_region_codes: taxonomy.assignedRegionCodes,
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
