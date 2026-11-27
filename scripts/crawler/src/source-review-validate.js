// Rule checks for an AI source-review proposal before it may be applied.
// The guards come from the frozen manual review scripts
// (apply-source-review-20261118b.js, apply-source-review-20261127*.js).
// validateProposal is pure: it returns violations (block applying) and
// risks (apply, but list the poster for a person to check afterwards).

export const PATCH_KEYS = [
  "title",
  "organizer_name",
  "application_organization_name",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "deadline_type",
  "eligibility_summary",
  "target_age_min",
  "target_age_max",
  "application_method",
  "event_location",
  "contact_info",
  "participation_fee",
  "required_documents",
  "recruitment_count",
  "benefits_summary",
  "summary_short",
  "summary_long",
  "category_id",
];
export const OPTIONAL_PATCH_KEYS = ["thumbnail_url"];
export const DEADLINE_KEYS = [
  "deadline_status",
  "deadline_source",
  "deadline_time_verified",
  "deadline_note",
];
export const DECISIONS = ["published", "closed", "rejected", "held"];
export const DEADLINE_TYPES = [
  "fixed",
  "until_exhausted",
  "ongoing",
  "unknown",
];
export const DEADLINE_SOURCES = ["notice", "poster", "portal", "apply_page"];
export const LINK_TYPES = [
  "official_notice",
  "official_apply",
  "official_homepage",
  "other",
];
export const MIN_AUTO_APPLY_CONFIDENCE = 0.85;
export const POST_CHECK_CONFIDENCE = 0.92;

const DATE_KEYS = [
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
];
const KST_ISO = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+09:00$/;
// The portal's own name or a "기타 (…)" placeholder is never the real host.
const PLACEHOLDER_ORGANIZER =
  /^(청년몽땅정보통|기타\s*\(|기타$|미상|알\s*수\s*없음)/;

export function normalizeForQuote(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\s ​]+/g, "")
    .replace(/[“”"'‘’`]/g, "")
    .toLowerCase();
}

// True when the quote (ignoring spaces and quote marks) appears in the corpus.
export function quoteFoundIn(quote, corpus) {
  const q = normalizeForQuote(quote);
  if (q.length < 4) return false;
  return normalizeForQuote(corpus).includes(q);
}

function kstClock(iso) {
  return String(iso ?? "").slice(11, 19);
}

function sameJsonValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * @param {object} input
 * @param {object} input.row        current poster row with poster_links, poster_images, poster_audiences
 * @param {object} input.proposal   model proposal (see source-review-proposal.js schema)
 * @param {string} input.corpus     text of the fetched source pages
 * @param {number} input.readableSources  fetched pages with readable text
 * @param {number} input.nowMs      time the plan is applied
 * @param {Set<string>} input.categoryIds
 * @param {Set<string>} input.audienceIds
 * @param {boolean} [input.qualityGateHold]
 */
export function validateProposal({
  row,
  proposal,
  corpus,
  readableSources,
  nowMs,
  categoryIds,
  audienceIds,
  qualityGateHold = false,
  hadDuplicateCandidates = false,
}) {
  const violations = [];
  const risks = [];
  const fail = (code, detail) => violations.push({ code, detail });
  // level "high": a person checks the poster after it is applied (post-check list).
  // level "low": shown with the record, not listed.
  const risk = (code, detail, level = "low") =>
    risks.push({ code, detail, level });

  if (!proposal || typeof proposal !== "object") {
    fail("no-proposal", "모델 응답이 없습니다");
    return { violations, risks };
  }
  if (proposal.id !== row.id) fail("id-mismatch", "다른 공고의 제안입니다");
  if (row.poster_status !== "review")
    fail("not-in-review", `현재 상태 ${row.poster_status}`);
  if (row.field_verification?.humanStructuredVerification) {
    fail(
      "human-verified",
      "사람이 확정한 판정이 있어 자동으로 덮어쓰지 않습니다",
    );
  }
  if (
    row.field_verification?.sourceReviewWriteInProgress ||
    row.field_verification?.sourceReviewAuto
  ) {
    fail(
      "previous-write",
      "이전 자동 반영 기록이 남아 있어 사람이 확인해야 합니다",
    );
  }
  if (qualityGateHold)
    fail("quality-gate-hold", "품질 게이트 보류 공고는 사람이 해제합니다");
  if (!DECISIONS.includes(proposal.decision))
    fail("bad-decision", String(proposal.decision));
  if (proposal.decision === "held") {
    fail("model-held", proposal.heldReason || "모델이 보류로 판단했습니다");
  }
  if (readableSources < 1)
    fail("no-readable-source", "읽을 수 있는 원문을 받지 못했습니다");
  const confidence = Number(proposal.confidence);
  if (!(confidence >= MIN_AUTO_APPLY_CONFIDENCE)) {
    fail(
      "low-confidence",
      `신뢰도 ${Number.isFinite(confidence) ? confidence : "없음"}`,
    );
  } else if (confidence < POST_CHECK_CONFIDENCE) {
    risk("medium-confidence", `신뢰도 ${confidence}`, "high");
  }
  if (!proposal.reason) fail("no-reason", "판단 이유가 없습니다");

  // Evidence must be quoted from what was fetched. Image evidence cannot be
  // checked against text, so it is allowed but listed for a person.
  const evidence = Array.isArray(proposal.evidence) ? proposal.evidence : [];
  if (evidence.length === 0) fail("no-evidence", "원문 근거 인용이 없습니다");
  const unmatched = [];
  let imageEvidence = 0;
  const imageDateFields = [];
  for (const item of evidence) {
    if (item?.from === "image") {
      imageEvidence += 1;
      if (/_at$|deadline/.test(item?.field ?? ""))
        imageDateFields.push(item.field);
      continue;
    }
    if (!quoteFoundIn(item?.quote, corpus)) unmatched.push(item?.field ?? "?");
  }
  if (unmatched.length)
    fail("evidence-not-in-source", `원문에 없는 인용: ${unmatched.join(", ")}`);
  if (imageDateFields.length) {
    risk(
      "image-date-evidence",
      `날짜를 포스터 이미지에서만 읽음: ${[...new Set(imageDateFields)].join(", ")}`,
      "high",
    );
  } else if (imageEvidence) {
    risk("image-evidence", `포스터 이미지에서 읽은 근거 ${imageEvidence}건`);
  }

  if (proposal.decision === "rejected") {
    if (!proposal.rejection_reason)
      fail("no-rejection-reason", "반려 사유가 없습니다");
    risk("rejected", proposal.rejection_reason || "반려", "high");
    return { violations, risks };
  }
  if (!["published", "closed"].includes(proposal.decision))
    return { violations, risks };

  const patch = proposal.patch ?? {};
  for (const key of PATCH_KEYS)
    if (!(key in patch)) fail("patch-missing-key", key);
  for (const key of Object.keys(patch)) {
    if (!PATCH_KEYS.includes(key) && !OPTIONAL_PATCH_KEYS.includes(key))
      fail("patch-unknown-key", key);
  }
  if (!patch.title?.trim()) fail("no-title", "제목이 비었습니다");
  if (!patch.organizer_name?.trim())
    fail("no-organizer", "주관기관이 비었습니다");
  else if (PLACEHOLDER_ORGANIZER.test(patch.organizer_name.trim())) {
    fail("placeholder-organizer", patch.organizer_name);
  }
  if (!patch.summary_short?.trim() || !patch.summary_long?.trim())
    fail("no-summary", "요약이 비었습니다");
  else if (!patch.summary_long.startsWith(patch.summary_short.trim())) {
    fail("summary-shape", "긴 요약이 짧은 요약으로 시작하지 않습니다");
  }
  if (!categoryIds.has(patch.category_id))
    fail("bad-category", String(patch.category_id));
  if (!DEADLINE_TYPES.includes(patch.deadline_type))
    fail("bad-deadline-type", String(patch.deadline_type));
  for (const key of ["target_age_min", "target_age_max"]) {
    if (
      patch[key] != null &&
      !(Number.isInteger(patch[key]) && patch[key] >= 0 && patch[key] <= 120)
    ) {
      fail("bad-age", `${key}=${patch[key]}`);
    }
  }

  for (const key of DATE_KEYS) {
    const value = patch[key];
    if (value == null) continue;
    if (!KST_ISO.test(value) || !Number.isFinite(Date.parse(value)))
      fail("bad-date-format", `${key}=${value}`);
  }
  for (const [start, end] of [
    ["application_start_at", "application_end_at"],
    ["event_start_at", "event_end_at"],
  ]) {
    if (
      patch[start] &&
      patch[end] &&
      Date.parse(patch[start]) > Date.parse(patch[end])
    ) {
      fail("date-order", `${start} > ${end}`);
    }
  }
  if (
    ["ongoing", "unknown"].includes(patch.deadline_type) &&
    patch.application_end_at != null
  ) {
    fail("open-type-with-end", `${patch.deadline_type}인데 마감일이 있습니다`);
  }
  if (patch.deadline_type === "fixed" && !patch.application_end_at)
    fail("fixed-without-end", "마감일이 없습니다");

  const deadline = proposal.deadline ?? {};
  const deadlineKeys = Object.keys(deadline).sort();
  if (!sameJsonValue(deadlineKeys, [...DEADLINE_KEYS].sort()))
    fail("deadline-keys", deadlineKeys.join(","));
  if (!["verified", "unverified"].includes(deadline.deadline_status)) {
    fail("bad-deadline-status", String(deadline.deadline_status));
  }
  if (deadline.deadline_status === "verified") {
    if (!patch.application_end_at)
      fail("verified-without-end", "확인된 마감에 날짜가 없습니다");
    if (!DEADLINE_SOURCES.includes(deadline.deadline_source)) {
      fail("bad-deadline-source", String(deadline.deadline_source));
    }
    if (
      !deadline.deadline_time_verified &&
      patch.application_end_at &&
      kstClock(patch.application_end_at) !== "23:59:59"
    ) {
      fail(
        "date-only-not-end-of-day",
        "시각이 확인되지 않은 마감은 23:59:59로 저장합니다",
      );
    }
  } else if (deadline.deadline_source != null) {
    fail("unverified-with-source", "미확인 마감에 근거 출처가 있습니다");
  }
  if (deadline.deadline_time_verified) {
    if (deadline.deadline_status !== "verified")
      fail("time-verified-unverified", "시각 확인은 확인된 마감에만 씁니다");
    const clock = kstClock(patch.application_end_at);
    if (clock === "23:59:59")
      fail("time-verified-end-of-day", "23:59:59는 날짜만 확인된 값입니다");
    // The youth portal prints "00 : 00" when no time exists.
    if (clock === "00:00:00")
      fail(
        "portal-midnight",
        "00:00은 시각 없음 표기라 마감 시각으로 쓰지 않습니다",
      );
  }
  if (
    deadline.deadline_note != null &&
    String(deadline.deadline_note).length > 80
  ) {
    fail("deadline-note-long", `${String(deadline.deadline_note).length}자`);
  }
  if (
    deadline.deadline_status === "unverified" &&
    proposal.decision === "published"
  ) {
    risk(
      "deadline-unverified",
      patch.application_end_at
        ? "마감일을 원문에서 확인하지 못했습니다"
        : "마감일 없음",
      "high",
    );
  }

  const endMs = patch.application_end_at
    ? Date.parse(patch.application_end_at)
    : null;
  if (proposal.decision === "published" && endMs != null && endMs < nowMs) {
    fail("published-but-expired", "마감이 지난 공고를 공개하려 합니다");
  }
  if (proposal.decision === "published" && endMs == null) {
    const eventEnd = patch.event_end_at ? Date.parse(patch.event_end_at) : null;
    if (eventEnd != null && eventEnd < nowMs)
      fail("published-after-event", "행사가 끝난 공고를 공개하려 합니다");
    risk(
      "no-end-date",
      "마감일이 없어 행사 종료나 사람 확인이 필요합니다",
      "high",
    );
  }
  if (
    proposal.decision === "closed" &&
    !proposal.closedReason &&
    !(endMs != null && endMs < nowMs)
  ) {
    fail(
      "closed-without-reason",
      "마감이 지나지 않았는데 마감 사유가 없습니다",
    );
  }

  // Links: removals and patches refer to existing rows, additions are new
  // http(s) URLs, and exactly one primary link remains.
  const links = row.poster_links ?? [];
  const linkIds = new Set(links.map((link) => link.id));
  const removeLinks = proposal.removeLinks ?? [];
  const linkPatches = proposal.linkPatches ?? [];
  const addLinks = proposal.addLinks ?? [];
  for (const id of removeLinks) if (!linkIds.has(id)) fail("unknown-link", id);
  for (const p of linkPatches) {
    if (!linkIds.has(p.id)) fail("unknown-link", p.id);
    if (removeLinks.includes(p.id)) fail("patch-removed-link", p.id);
    for (const key of Object.keys(p.patch ?? {})) {
      if (!["title", "link_type", "url", "is_primary"].includes(key))
        fail("link-patch-key", key);
    }
    if (p.patch?.url && !/^https?:\/\//.test(p.patch.url))
      fail("bad-link-url", p.patch.url);
    if (p.patch?.link_type && !LINK_TYPES.includes(p.patch.link_type))
      fail("bad-link-type", p.patch.link_type);
  }
  for (const link of addLinks) {
    if (!/^https?:\/\//.test(link.url ?? ""))
      fail("bad-link-url", String(link.url));
    if (!LINK_TYPES.includes(link.link_type))
      fail("bad-link-type", String(link.link_type));
    if (!link.title?.trim()) fail("link-without-title", link.url);
  }
  const finalLinks = links
    .filter((link) => !removeLinks.includes(link.id))
    .map((link) => ({
      ...link,
      ...(linkPatches.find((p) => p.id === link.id)?.patch ?? {}),
    }))
    .concat(addLinks);
  if (finalLinks.length === 0) fail("no-links", "링크가 하나도 남지 않습니다");
  const primaryCount = finalLinks.filter(
    (link) => link.is_primary === true,
  ).length;
  if (primaryCount !== 1)
    fail("primary-link-count", `대표 링크 ${primaryCount}개`);
  const urls = finalLinks.map((link) => link.url);
  if (new Set(urls).size !== urls.length)
    fail("duplicate-link-url", "같은 주소의 링크가 남습니다");
  if (removeLinks.length)
    risk("links-removed", `링크 ${removeLinks.length}개 삭제`);

  // Images: the thumbnail kept must remain attached; a replacement must be an
  // image already attached to this poster.
  const images = row.poster_images ?? [];
  const imageIds = new Set(images.map((image) => image.id));
  const removeImages = proposal.removeImages ?? [];
  for (const id of removeImages)
    if (!imageIds.has(id)) fail("unknown-image", id);
  const thumbnail = patch.thumbnail_url ?? row.thumbnail_url;
  const keptPaths = images
    .filter((image) => !removeImages.includes(image.id))
    .map((image) => image.storage_path);
  if (thumbnail && images.length && !keptPaths.includes(thumbnail))
    fail("thumbnail-removed", "대표 이미지가 지워집니다");
  if (patch.thumbnail_url) {
    if (!images.some((image) => image.storage_path === patch.thumbnail_url)) {
      fail("thumbnail-not-attached", "붙어 있지 않은 이미지로 바꾸려 합니다");
    }
    risk("thumbnail-replaced", "대표 이미지를 바꿨습니다");
  }
  if (
    proposal.decision === "published" &&
    proposal.imageReview?.isPoster !== true
  ) {
    fail("thumbnail-not-poster", "대표 이미지가 포스터로 확인되지 않았습니다");
  }

  const currentAudiences = new Set(
    (row.poster_audiences ?? []).map((a) => a.audience_id),
  );
  for (const id of proposal.removeAudiences ?? [])
    if (!currentAudiences.has(id)) fail("unknown-audience", id);
  for (const id of proposal.addAudiences ?? []) {
    if (!audienceIds.has(id) || currentAudiences.has(id))
      fail("bad-audience", id);
  }
  if (
    (proposal.removeAudiences ?? []).length ||
    (proposal.addAudiences ?? []).length
  ) {
    risk("audiences-changed", "대상 태그를 바꿨습니다");
  }

  if (hadDuplicateCandidates)
    risk(
      "duplicate-judged",
      proposal.duplicateJudgement || "중복 후보와 별개로 판단",
      "high",
    );
  if (
    row.organizer_name &&
    patch.organizer_name &&
    row.organizer_name !== patch.organizer_name
  ) {
    risk(
      "organizer-changed",
      `${row.organizer_name} → ${patch.organizer_name}`,
    );
  }
  const uncertainties = (proposal.uncertainties ?? []).filter(Boolean);
  if (uncertainties.length)
    risk("uncertainties", uncertainties.join(" / ").slice(0, 400));

  return { violations, risks };
}
