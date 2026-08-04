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

  const changedFields = [
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
  const verifiedAt = values.verificationStatus === "verified"
    ? verificationChanged || !values.verifiedAt
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
    update.field_verification = {
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
  }

  return { update, changedFields };
}
