import type { PosterDeadlineType } from "./posterApplication";

export type PosterVerificationStatus =
  | "unverified"
  | "needs_review"
  | "verified"
  | "rejected";

export type PosterStructuredTimestamps = {
  applicationStartAt?: string | null;
  applicationEndAt?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
};

export const POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS = [
  "imageMatchesNotice",
  "titleAndOrganizations",
  "applicationSchedule",
  "eligibilityAndBenefits",
  "applicationAndContact",
  "officialLinks",
] as const;

export type PosterStructuredVerificationCheckKey =
  (typeof POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS)[number];

export type PosterStructuredVerificationReview = {
  checks: Record<PosterStructuredVerificationCheckKey, boolean>;
  note: string;
};

export type PosterStructuredEditorValues = {
  title: string;
  sourceOrgName: string;
  organizerName: string;
  applicationOrganizationName: string;
  appStartAt: string;
  appEndAt: string;
  deadlineType: PosterDeadlineType;
  eventStartAt: string;
  eventEndAt: string;
  eligibilitySummary: string;
  targetAgeMin: string;
  targetAgeMax: string;
  participationFee: string;
  benefitsSummary: string;
  recruitmentCount: string;
  applicationMethod: string;
  requiredDocuments: string;
  contactInfo: string;
  eventLocation: string;
  summaryShort: string;
  verificationStatus: PosterVerificationStatus;
  dataConfidence: string;
  verifiedAt: string;
};

type PlainObject = Record<string, unknown>;

const DEADLINE_TYPES = new Set<PosterDeadlineType>([
  "fixed",
  "ongoing",
  "until_exhausted",
  "scheduled",
  "unknown",
]);
const VERIFICATION_STATUSES = new Set<PosterVerificationStatus>([
  "unverified",
  "needs_review",
  "verified",
  "rejected",
]);

const FIELD_MAP: Array<[keyof PosterStructuredEditorValues, string]> = [
  ["title", "title"],
  ["sourceOrgName", "source_org_name"],
  ["organizerName", "organizer_name"],
  ["applicationOrganizationName", "application_organization_name"],
  ["appStartAt", "application_start_at"],
  ["appEndAt", "application_end_at"],
  ["deadlineType", "deadline_type"],
  ["eventStartAt", "event_start_at"],
  ["eventEndAt", "event_end_at"],
  ["eligibilitySummary", "eligibility_summary"],
  ["targetAgeMin", "target_age_min"],
  ["targetAgeMax", "target_age_max"],
  ["participationFee", "participation_fee"],
  ["benefitsSummary", "benefits_summary"],
  ["recruitmentCount", "recruitment_count"],
  ["applicationMethod", "application_method"],
  ["requiredDocuments", "required_documents"],
  ["contactInfo", "contact_info"],
  ["eventLocation", "event_location"],
  ["summaryShort", "summary_short"],
  ["verificationStatus", "verification_status"],
  ["dataConfidence", "data_confidence"],
];

function asPlainObject(value: unknown): PlainObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PlainObject)
    : {};
}

export function emptyPosterStructuredVerificationReview(): PosterStructuredVerificationReview {
  return {
    checks: Object.fromEntries(
      POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.map((key) => [key, false]),
    ) as Record<PosterStructuredVerificationCheckKey, boolean>,
    note: "",
  };
}

export function readPosterStructuredVerificationReview(
  fieldVerification: unknown,
): PosterStructuredVerificationReview {
  const verification = asPlainObject(fieldVerification);
  const completed = asPlainObject(verification.humanStructuredVerification);
  const draft = asPlainObject(verification.humanStructuredVerificationDraft);
  const invalidation = asPlainObject(verification.structuredVerificationInvalidation);
  const invalidatedAt = Date.parse(typeof invalidation.invalidatedAt === "string" ? invalidation.invalidatedAt : "");
  const reviewedAt = Date.parse(typeof completed.reviewedAt === "string" ? completed.reviewedAt : "");
  const draftUpdatedAt = Date.parse(typeof draft.updatedAt === "string" ? draft.updatedAt : "");
  const completedIsInvalidated = Number.isFinite(invalidatedAt) && (
    !Number.isFinite(reviewedAt) || invalidatedAt >= reviewedAt
  );
  const draftIsAfterInvalidation = Number.isFinite(draftUpdatedAt) && draftUpdatedAt > invalidatedAt;
  const source = completedIsInvalidated
    ? draftIsAfterInvalidation ? draft : {}
    : Object.keys(completed).length > 0 ? completed : draft;
  const checks = asPlainObject(source.checks);

  return {
    checks: Object.fromEntries(
      POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.map((key) => [key, checks[key] === true]),
    ) as Record<PosterStructuredVerificationCheckKey, boolean>,
    note: typeof source.note === "string" ? source.note : "",
  };
}

function cleanText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function parseOptionalNumber(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label}은(는) ${minimum}~${maximum} 범위로 입력해 주세요.`);
  }
  if (integer && !Number.isInteger(number)) {
    throw new Error(`${label}은(는) 정수로 입력해 주세요.`);
  }
  return number;
}

function toKstTimestamp(value: string, boundary: "start" | "end") {
  if (!value) return null;
  return `${value}T${boundary === "start" ? "00:00:00" : "23:59:59"}+09:00`;
}

function dateValue(value: string) {
  return value.trim() || null;
}

function assertDateOrder(start: string, end: string, label: string) {
  if (start && end && start > end) {
    throw new Error(`${label} 시작일은 종료일보다 늦을 수 없습니다.`);
  }
}

export function toKstDateInput(value?: string | null) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function buildPosterStructuredUpdate(input: {
  values: PosterStructuredEditorValues;
  initialValues: PosterStructuredEditorValues;
  fieldVerification: unknown;
  reviewerId: string;
  additionalChangedFields?: string[];
  originalTimestamps?: PosterStructuredTimestamps;
  verificationReview?: PosterStructuredVerificationReview;
  canVerify?: boolean;
  officialNoticeUrl?: string | null;
  hasPosterImage?: boolean;
  now?: Date;
}) {
  const { values, initialValues } = input;
  const title = values.title.trim();
  const sourceOrgName = values.sourceOrgName.trim();
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (!sourceOrgName) throw new Error("수집 출처 기관을 입력해 주세요.");
  if (!DEADLINE_TYPES.has(values.deadlineType)) {
    throw new Error("유효한 모집 마감 유형을 선택해 주세요.");
  }
  if (!VERIFICATION_STATUSES.has(values.verificationStatus)) {
    throw new Error("유효한 검증 상태를 선택해 주세요.");
  }

  assertDateOrder(values.appStartAt, values.appEndAt, "모집 기간");
  assertDateOrder(values.eventStartAt, values.eventEndAt, "행사 기간");

  const targetAgeMin = parseOptionalNumber(values.targetAgeMin, "최소 연령", 0, 120, true);
  const targetAgeMax = parseOptionalNumber(values.targetAgeMax, "최대 연령", 0, 120, true);
  if (targetAgeMin !== null && targetAgeMax !== null && targetAgeMin > targetAgeMax) {
    throw new Error("최소 연령은 최대 연령보다 클 수 없습니다.");
  }
  const dataConfidence = parseOptionalNumber(values.dataConfidence, "데이터 신뢰도", 0, 1);

  const initiallyChangedFields = [
    ...new Set([
      ...FIELD_MAP
        .filter(([key]) => dateValue(String(values[key])) !== dateValue(String(initialValues[key])))
        .map(([, databaseField]) => databaseField),
      ...(input.additionalChangedFields ?? []),
    ]),
  ];
  const now = input.now ?? new Date();
  const existingVerification = asPlainObject(input.fieldVerification);
  const existingHumanReview = asPlainObject(existingVerification.humanReviewCorrection);
  const previousFields = Array.isArray(existingHumanReview.fields)
    ? existingHumanReview.fields.filter((field): field is string => typeof field === "string")
    : [];
  const previousSources = Array.isArray(existingHumanReview.sources)
    ? existingHumanReview.sources.filter((source): source is string => typeof source === "string")
    : [];
  const previousSource = typeof existingHumanReview.source === "string"
    ? existingHumanReview.source
    : "";
  const verificationChanged = values.verificationStatus !== initialValues.verificationStatus;
  const existingStructuredReview = readPosterStructuredVerificationReview(existingVerification);
  const verificationReview = input.verificationReview
    ? {
        checks: Object.fromEntries(
          POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.map((key) => [
            key,
            Boolean(input.verificationReview?.checks[key]),
          ]),
        ) as Record<PosterStructuredVerificationCheckKey, boolean>,
        note: input.verificationReview.note.trim(),
      }
    : null;
  const reviewChanged = Boolean(
    verificationReview &&
    JSON.stringify(verificationReview) !== JSON.stringify(existingStructuredReview),
  );
  const requiresFreshVerification = values.verificationStatus === "verified" && (
    verificationChanged ||
    !values.verifiedAt ||
    initiallyChangedFields.length > 0 ||
    reviewChanged
  );

  if (requiresFreshVerification) {
    if (!input.canVerify) {
      throw new Error("사람 검증 완료는 관리자만 승인할 수 있습니다.");
    }
    if (!verificationReview) {
      throw new Error("사람 검증 체크리스트를 확인해 주세요.");
    }
    if (POSTER_STRUCTURED_VERIFICATION_CHECK_KEYS.some((key) => !verificationReview.checks[key])) {
      throw new Error("원문 대조 체크리스트를 모두 확인해 주세요.");
    }
    if (!verificationReview.note) {
      throw new Error("검토 결과 메모를 입력해 주세요.");
    }
    if (!/^https?:\/\//i.test(input.officialNoticeUrl?.trim() ?? "")) {
      throw new Error("검증에 사용한 공식 공고 원문 URL을 확인해 주세요.");
    }
    if (!input.hasPosterImage) {
      throw new Error("원문과 대조할 포스터 이미지가 필요합니다.");
    }
  }

  const changedFields = [
    ...new Set([
      ...initiallyChangedFields,
      ...(reviewChanged ? ["human_structured_verification"] : []),
    ]),
  ];
  const verifiedAt = values.verificationStatus === "verified"
    ? requiresFreshVerification
      ? now.toISOString()
      : values.verifiedAt
    : null;

  const update: PlainObject = {
    title,
    source_org_name: sourceOrgName,
    organizer_name: cleanText(values.organizerName),
    application_organization_name: cleanText(values.applicationOrganizationName),
    application_start_at: values.appStartAt === initialValues.appStartAt
      ? input.originalTimestamps?.applicationStartAt ?? toKstTimestamp(values.appStartAt, "start")
      : toKstTimestamp(values.appStartAt, "start"),
    application_end_at: values.appEndAt === initialValues.appEndAt
      ? input.originalTimestamps?.applicationEndAt ?? toKstTimestamp(values.appEndAt, "end")
      : toKstTimestamp(values.appEndAt, "end"),
    deadline_type: values.deadlineType,
    event_start_at: values.eventStartAt === initialValues.eventStartAt
      ? input.originalTimestamps?.eventStartAt ?? toKstTimestamp(values.eventStartAt, "start")
      : toKstTimestamp(values.eventStartAt, "start"),
    event_end_at: values.eventEndAt === initialValues.eventEndAt
      ? input.originalTimestamps?.eventEndAt ?? toKstTimestamp(values.eventEndAt, "end")
      : toKstTimestamp(values.eventEndAt, "end"),
    eligibility_summary: cleanText(values.eligibilitySummary),
    target_age_min: targetAgeMin,
    target_age_max: targetAgeMax,
    participation_fee: cleanText(values.participationFee),
    benefits_summary: cleanText(values.benefitsSummary),
    recruitment_count: cleanText(values.recruitmentCount),
    application_method: cleanText(values.applicationMethod),
    required_documents: cleanText(values.requiredDocuments),
    contact_info: cleanText(values.contactInfo),
    event_location: cleanText(values.eventLocation),
    summary_short: cleanText(values.summaryShort),
    verification_status: values.verificationStatus,
    verified_at: verifiedAt,
    data_confidence: dataConfidence,
  };

  if (changedFields.length > 0) {
    const nextVerification: PlainObject = {
      ...existingVerification,
      humanReviewCorrection: {
        ...existingHumanReview,
        correctedAt: now.toISOString(),
        correctedBy: input.reviewerId,
        source: "poster_structured_editor",
        sources: [...new Set([
          ...previousSources,
          ...(previousSource ? [previousSource] : []),
          "poster_structured_editor",
        ])],
        fields: [...new Set([...previousFields, ...changedFields])],
      },
    };

    if (verificationReview && (reviewChanged || requiresFreshVerification)) {
      nextVerification.humanStructuredVerificationDraft = {
        checks: verificationReview.checks,
        note: verificationReview.note,
        updatedAt: now.toISOString(),
        updatedBy: input.reviewerId,
        officialNoticeUrl: input.officialNoticeUrl?.trim() || null,
      };
      if (values.verificationStatus === "verified") {
        nextVerification.humanStructuredVerification = {
          checks: verificationReview.checks,
          note: verificationReview.note,
          reviewedAt: verifiedAt,
          reviewedBy: input.reviewerId,
          officialNoticeUrl: input.officialNoticeUrl?.trim() || null,
        };
      }
    }

    if (
      initialValues.verificationStatus === "verified" &&
      values.verificationStatus !== "verified"
    ) {
      nextVerification.structuredVerificationInvalidation = {
        invalidatedAt: now.toISOString(),
        invalidatedBy: input.reviewerId,
        reason: "verification_status_downgraded_after_edit",
      };
    }

    update.field_verification = nextVerification;
  }

  return { update, changedFields };
}
