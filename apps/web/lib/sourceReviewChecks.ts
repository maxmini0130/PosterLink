// Post-check list for posters the AI source review applied automatically
// (scripts/crawler/src/review-queue-source-review.js). Pure helpers shared by
// the admin API route and page.

export type SourceReviewRisk = {
  code: string;
  detail: string;
  level: "high" | "low";
};

type LinkRow = {
  id: string;
  poster_id?: string;
  url: string;
  title?: string | null;
  link_type?: string | null;
  is_primary?: boolean | null;
};
type ImageRow = {
  id: string;
  poster_id?: string;
  storage_path: string;
  image_type?: string | null;
};

export type SourceReviewSnapshot = {
  poster: Record<string, unknown>;
  removedLinks: LinkRow[];
  patchedLinks: { id: string; previous: Record<string, unknown> }[];
  removedImages: ImageRow[];
  categories: string[];
  audiences: string[];
};

export type SourceReviewRecord = {
  version: string;
  model: string;
  runId: string | null;
  reviewedAt: string;
  decision: "published" | "closed" | "rejected";
  confidence: number;
  reason: string;
  resolution?: string;
  evidence?: {
    field: string;
    quote: string;
    source_url: string;
    from: "text" | "image";
  }[];
  uncertainties?: string[];
  duplicateJudgement?: string | null;
  rejectionReason?: string | null;
  closedReason?: string | null;
  risks: SourceReviewRisk[];
  needsPostCheck: boolean;
  postCheck: {
    status: "pending" | "not_needed" | "confirmed" | "reverted";
    by?: string;
    at?: string;
    note?: string;
  };
  previous: SourceReviewSnapshot;
  addedLinkIds: string[];
};

export type HoldRecord = {
  reviewedAt: string;
  decision: string | null;
  confidence: number | null;
  reason: string | null;
  heldReason: string | null;
  violations: { code: string; detail: string }[];
  error: string | null;
};

export const RISK_LABELS: Record<string, string> = {
  rejected: "반려",
  "deadline-unverified": "마감일 미확인",
  "no-end-date": "마감일 없음",
  "medium-confidence": "신뢰도 경계",
  "duplicate-judged": "중복 판단",
  "image-date-evidence": "날짜를 이미지에서만 확인",
  "image-evidence": "이미지 근거",
  "thumbnail-replaced": "대표 이미지 교체",
  "audiences-changed": "대상 태그 변경",
  "links-removed": "링크 삭제",
  "organizer-changed": "주관기관 변경",
  uncertainties: "남은 의문점",
};

export const VIOLATION_LABELS: Record<string, string> = {
  "evidence-not-in-source": "원문에 없는 인용",
  "no-readable-source": "원문을 읽지 못함",
  "low-confidence": "신뢰도 낮음",
  "model-held": "AI가 보류",
  "quality-gate-hold": "품질 게이트 보류",
  "human-verified": "사람 확정 판정 있음",
  "previous-write": "이전 자동 반영 기록",
  "published-but-expired": "마감 지난 공고 공개 시도",
  "portal-midnight": "포털 00:00을 마감 시각으로 사용",
  "placeholder-organizer": "주관기관 자리표시",
  "primary-link-count": "대표 링크 개수 오류",
  "thumbnail-not-poster": "대표 이미지가 포스터 아님",
};

export function riskLabel(code: string) {
  return RISK_LABELS[code] ?? code;
}

export function violationLabel(code: string) {
  return VIOLATION_LABELS[code] ?? code;
}

export function highRisks(record: Pick<SourceReviewRecord, "risks">) {
  return (record.risks ?? []).filter((risk) => risk.level === "high");
}

export type RevertPlan = {
  posterUpdate: Record<string, unknown>;
  deleteLinkIds: string[];
  insertLinks: LinkRow[];
  linkUpdates: { id: string; patch: Record<string, unknown> }[];
  insertImages: ImageRow[];
  deleteCategoryIds: string[];
  insertCategoryIds: string[];
  deleteAudienceIds: string[];
  insertAudienceIds: string[];
};

type CurrentPoster = {
  poster_categories?: { category_id: string }[];
  poster_audiences?: { audience_id: string }[];
  poster_links?: LinkRow[];
  poster_images?: ImageRow[];
  field_verification?: Record<string, unknown> | null;
};

const POSTER_FIELDS_NOT_RESTORED = new Set(["published_at"]);

// Puts the poster back as it was before the automatic write and back into the
// review queue, so a person decides it in the normal review screen.
export function buildRevertPlan(
  record: SourceReviewRecord,
  current: CurrentPoster,
  actor: { id: string; at: string },
): RevertPlan {
  const previous = record.previous;
  const posterUpdate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(previous.poster ?? {})) {
    if (!POSTER_FIELDS_NOT_RESTORED.has(key)) posterUpdate[key] = value;
  }
  posterUpdate.poster_status = "review";
  posterUpdate.published_at = null;
  const verification = { ...(current.field_verification ?? {}) };
  verification.sourceReviewAuto = {
    ...record,
    postCheck: { status: "reverted", by: actor.id, at: actor.at },
  };
  posterUpdate.field_verification = verification;

  const currentLinkIds = new Set(
    (current.poster_links ?? []).map((link) => link.id),
  );
  const currentImageIds = new Set(
    (current.poster_images ?? []).map((image) => image.id),
  );
  const currentCategories = (current.poster_categories ?? []).map(
    (c) => c.category_id,
  );
  const currentAudiences = (current.poster_audiences ?? []).map(
    (a) => a.audience_id,
  );
  const stripLink = ({ poster_id: _poster, ...rest }: LinkRow) => rest;
  const stripImage = ({ poster_id: _poster, ...rest }: ImageRow) => rest;

  return {
    posterUpdate,
    deleteLinkIds: (record.addedLinkIds ?? []).filter((id) =>
      currentLinkIds.has(id),
    ),
    insertLinks: (previous.removedLinks ?? [])
      .filter((link) => !currentLinkIds.has(link.id))
      .map(stripLink),
    linkUpdates: (previous.patchedLinks ?? [])
      .filter((p) => currentLinkIds.has(p.id))
      // Primary flags last so two primaries never coexist when one is restored.
      .sort(
        (a, b) =>
          Number(a.previous.is_primary === true) -
          Number(b.previous.is_primary === true),
      )
      .map((p) => ({ id: p.id, patch: p.previous })),
    insertImages: (previous.removedImages ?? [])
      .filter((image) => !currentImageIds.has(image.id))
      .map(stripImage),
    deleteCategoryIds: currentCategories.filter(
      (id) => !previous.categories.includes(id),
    ),
    insertCategoryIds: previous.categories.filter(
      (id) => !currentCategories.includes(id),
    ),
    deleteAudienceIds: currentAudiences.filter(
      (id) => !previous.audiences.includes(id),
    ),
    insertAudienceIds: previous.audiences.filter(
      (id) => !currentAudiences.includes(id),
    ),
  };
}

export function confirmedRecord(
  record: SourceReviewRecord,
  actor: { id: string; at: string },
  note?: string,
): SourceReviewRecord {
  return {
    ...record,
    postCheck: {
      status: "confirmed",
      by: actor.id,
      at: actor.at,
      ...(note ? { note } : {}),
    },
  };
}
