/**
 * Clear only a non-poster image from a review notice (2026-11-19).
 *
 * cleanup-review-nonposters.js holds every review notice the quality gate
 * would reject (review-cleanup-hold.js). When the only reason is the image
 * (the classifier says it is a logo, banner, photo, map or another notice's
 * picture; or the URL is a logo/icon asset) the notice text itself is fine,
 * and holding the whole notice hides a real opportunity.
 *
 * For those rows the representative image is cleared instead and the notice
 * continues as a text notice:
 *   - thumbnail_url is set to null and that image's poster_images rows are
 *     removed, so the non-poster is not shown;
 *   - field_verification.imageCleanup keeps the cleared URL, the removed
 *     poster_images rows, the classifier result, the reasons and the rule
 *     version, so a person can restore it;
 *   - an "image-cleared-nonposter" warning is added to qualityIssues for the
 *     admin review screen;
 *   - the status is not changed. Nothing is approved here; the notice goes
 *     through the normal review path as a text notice
 *     (evaluatePosterQuality treats an imageless row with this record as a
 *     text notice: "text-notice-no-image", review), and like any text notice
 *     a person approves it: the AI review queue lists it as blocked
 *     ("image-cleared-text-notice").
 *
 * The whole notice is still held when any non-image problem remains, when the
 * classifier is unsure (< 0.8) or calls the image a notice document (a
 * 모집 안내문 is an allowed representative image), or when a person has
 * already reviewed the poster or its image. Nothing is ever rejected.
 */
import { lastPersonReviewAt } from "./person-review.js";
import { imageClassificationOf, imageConfidenceState } from "./image-confidence-hold.js";
import { QUALITY_REJECT_CODES } from "./poster-quality-gate.js";
import { REVIEW_CLEANUP_HOLD_RULES } from "./review-cleanup-hold.js";

export const REVIEW_IMAGE_CLEAR_RULES = "review-image-clear-20261119";
export const IMAGE_CLEAR_MIN_CONFIDENCE = 0.8;

/** Quality issues that are about the representative image only. */
export const IMAGE_ONLY_ISSUE_CODES = new Set([
  "image-not-poster",
  "image-content-mismatch",
  "bad-image-url",
]);

// Allowed representative images (CLAUDE.md §5): a poster, a recruitment
// notice or card news. A classifier that says "not a poster" but describes
// one of these is not cleared automatically.
// Seen 2026-11: "public notice / administrative recruitment notice",
// "a chart, table, infographic, or card-news graphic", "official notice /
// administrative announcement".
const NOTICE_DOCUMENT_TYPE = /(?:notice|announcement|recruit|flyer|poster|leaflet|brochure|card[\s-]*news|infographic|안내|공고|모집|카드\s*뉴스|전단|리플릿)/i;
const NOTICE_DOCUMENT_REASON = /(?:notice document|official notice|announcement document|recruitment notice|card[\s-]*news|안내문|공고문|카드\s*뉴스)/i;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isRejecting(issue) {
  return issue?.decision === "reject" || QUALITY_REJECT_CODES.has(issue?.code);
}

function confidenceOf(value) {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Image URLs a previous run cleared from this poster. */
export function clearedImageUrls(fieldVerification) {
  const cleanup = asObject(asObject(fieldVerification).imageCleanup);
  return [...new Set([
    cleanup.imageUrl,
    ...(Array.isArray(cleanup.removedPosterImages) ? cleanup.removedPosterImages.map((image) => image?.storage_path) : []),
  ].filter((url) => typeof url === "string" && url))];
}

/** True when a run cleared the image and the poster now continues as a text notice. */
export function isClearedToTextNotice(fieldVerification) {
  return asObject(asObject(fieldVerification).imageCleanup).contentMode === "text_notice";
}

function imageIssueIsCertain(issue, fieldVerification) {
  if (issue.code === "bad-image-url") return { ok: true };
  const fv = asObject(fieldVerification);
  if (issue.code === "image-not-poster") {
    const cls = imageClassificationOf(fv);
    const confidence = confidenceOf(cls?.confidence);
    if (confidence === null || confidence < IMAGE_CLEAR_MIN_CONFIDENCE) {
      return { ok: false, reason: "classifier_unsure" };
    }
    if (NOTICE_DOCUMENT_TYPE.test(String(cls?.visualType ?? "")) || NOTICE_DOCUMENT_REASON.test(String(cls?.reason ?? ""))) {
      return { ok: false, reason: "notice_document_image" };
    }
    return { ok: true };
  }
  if (issue.code === "image-content-mismatch") {
    const confidence = confidenceOf(asObject(fv.posterImageOcr).contentMatch?.confidence);
    if (confidence === null || confidence < IMAGE_CLEAR_MIN_CONFIDENCE) {
      return { ok: false, reason: "content_match_unsure" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "not_image_issue" };
}

/**
 * Decide what the cleanup does with one review row the gate would reject.
 *
 * @param row        posters row (thumbnail_url, field_verification, ...)
 * @param quality    evaluatePosterQuality result for the row as stored
 * @param textQuality evaluatePosterQuality result for the row without its
 *                   image, as a text notice
 * @returns {{action: "clear" | "hold", reason: string, imageUrl?: string, codes: string[]}}
 */
export function planImageClear(row, quality, textQuality) {
  const fv = asObject(row?.field_verification);
  const rejecting = (quality?.issues ?? []).filter(isRejecting);
  const codes = [...new Set(rejecting.map((issue) => issue.code))].sort();
  const hold = (reason) => ({ action: "hold", reason, codes });

  if (!row?.thumbnail_url) return hold("no_image");
  if (rejecting.length === 0) return hold("not_rejected");
  if (!rejecting.every((issue) => IMAGE_ONLY_ISSUE_CODES.has(issue.code))) return hold("other_problems");
  // A person looked at this poster (and its image): their decision stands.
  if (lastPersonReviewAt(fv) !== null) return hold("person_reviewed");
  if (imageConfidenceState(fv).state === "manual") return hold("manual_image_review");
  for (const issue of rejecting) {
    const certain = imageIssueIsCertain(issue, fv);
    if (!certain.ok) return hold(certain.reason);
  }
  // Only the representative image may go. Another gallery image would become
  // the shown poster without any check, so a person picks then.
  const gallery = Array.isArray(row.poster_images) ? row.poster_images : [];
  if (gallery.some((image) => image?.storage_path && image.storage_path !== row.thumbnail_url)) {
    return hold("other_images");
  }
  if (textQuality?.decision === "reject") return hold("text_also_rejected");
  return { action: "clear", reason: "image_only", imageUrl: row.thumbnail_url, codes };
}

/**
 * field_verification after clearing the image. Reversible: imageCleanup keeps
 * what was removed. A cleanup hold this rule left for the same image-only
 * findings is released (recorded under imageCleanup.releasedHold); a hold
 * from any other rule is kept untouched.
 */
export function withImageCleared(fieldVerification, plan, { now, runId = null, removedPosterImages = [], quality = null }) {
  const fv = asObject(fieldVerification);
  const cls = imageClassificationOf(fv);
  const reasons = (quality?.issues ?? [])
    .filter((issue) => IMAGE_ONLY_ISSUE_CODES.has(issue.code))
    .map((issue) => ({ code: issue.code, reason: issue.reason ?? null, evidence: issue.evidence ?? null }));
  const existingIssues = Array.isArray(fv.qualityIssues) ? fv.qualityIssues : [];
  const warning = {
    code: "image-cleared-nonposter",
    severity: "medium",
    decision: "review",
    reason: "대표 이미지가 포스터가 아니어서 이미지만 내렸습니다(텍스트 공고로 검수). 되돌리려면 field_verification.imageCleanup을 확인하세요.",
    evidence: String(plan.imageUrl ?? "").slice(0, 240),
  };
  const next = {
    ...fv,
    qualityIssues: [
      ...existingIssues.filter((issue) => !(issue?.code === warning.code && issue?.evidence === warning.evidence)),
      warning,
    ],
    imageCleanup: {
      rules: REVIEW_IMAGE_CLEAR_RULES,
      contentMode: "text_notice",
      clearedAt: now,
      runId,
      imageUrl: plan.imageUrl,
      reasons,
      imageClassification: cls ?? null,
      removedPosterImages: removedPosterImages.map((image) => ({
        id: image?.id ?? null,
        storage_path: image?.storage_path ?? null,
        image_type: image?.image_type ?? null,
        width: image?.width ?? null,
        height: image?.height ?? null,
      })),
      restore: "Set posters.thumbnail_url back to imageUrl and re-insert removedPosterImages, then remove imageCleanup.",
    },
  };
  const hold = asObject(fv.qualityGateHold);
  const holdCodes = String(hold.reasons?.[0]?.fingerprint ?? "").replace(/^issues:/, "").split(",").filter(Boolean);
  if (
    hold.rules === REVIEW_CLEANUP_HOLD_RULES &&
    holdCodes.length > 0 &&
    holdCodes.every((code) => IMAGE_ONLY_ISSUE_CODES.has(code))
  ) {
    next.imageCleanup.releasedHold = hold;
    delete next.qualityGateHold;
  }
  return next;
}
