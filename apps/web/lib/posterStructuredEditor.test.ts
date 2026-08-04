import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPosterStructuredUpdate,
  emptyPosterStructuredVerificationReview,
  readPosterStructuredVerificationReview,
  type PosterStructuredEditorValues,
  toKstDateInput,
} from "./posterStructuredEditor";

const completedReview = {
  checks: Object.fromEntries(
    Object.keys(emptyPosterStructuredVerificationReview().checks).map((key) => [key, true]),
  ) as ReturnType<typeof emptyPosterStructuredVerificationReview>["checks"],
  note: "포스터 이미지와 공식 원문의 구조화 항목을 모두 대조했습니다.",
};

const values: PosterStructuredEditorValues = {
  title: " 청년 지원사업 ",
  sourceOrgName: "수집기관",
  organizerName: "주최기관",
  applicationOrganizationName: "접수기관",
  appStartAt: "2026-08-04",
  appEndAt: "2026-08-10",
  deadlineType: "fixed",
  eventStartAt: "2026-09-01",
  eventEndAt: "2026-09-02",
  eligibilitySummary: "서울 거주 청년",
  targetAgeMin: "19",
  targetAgeMax: "39",
  participationFee: "무료",
  benefitsSummary: "교육 지원",
  recruitmentCount: "20명",
  applicationMethod: "온라인 신청",
  requiredDocuments: "신청서",
  contactInfo: "02-0000-0000",
  eventLocation: "서울",
  summaryShort: " 핵심 요약 ",
  verificationStatus: "verified",
  dataConfidence: "0.95",
  verifiedAt: "",
};

test("structured editor normalizes dates, nullable text, and verification audit", () => {
  const result = buildPosterStructuredUpdate({
    values,
    initialValues: { ...values, organizerName: "", verificationStatus: "needs_review" },
    fieldVerification: { organization: { confidence: 0.9 } },
    reviewerId: "admin-id",
    verificationReview: completedReview,
    canVerify: true,
    officialNoticeUrl: "https://example.com/notice",
    hasPosterImage: true,
    additionalChangedFields: ["poster_links"],
    now: new Date("2026-08-04T05:00:00.000Z"),
  });

  assert.equal(result.update.title, "청년 지원사업");
  assert.equal(result.update.application_start_at, "2026-08-04T00:00:00+09:00");
  assert.equal(result.update.application_end_at, "2026-08-10T23:59:59+09:00");
  assert.equal(result.update.target_age_min, 19);
  assert.equal(result.update.data_confidence, 0.95);
  assert.equal(result.update.verified_at, "2026-08-04T05:00:00.000Z");
  assert.deepEqual(result.changedFields, [
    "organizer_name",
    "verification_status",
    "poster_links",
    "human_structured_verification",
  ]);
  assert.deepEqual(
    (result.update.field_verification as any).humanReviewCorrection.fields,
    ["organizer_name", "verification_status", "poster_links", "human_structured_verification"],
  );
  assert.deepEqual((result.update.field_verification as any).organization, { confidence: 0.9 });
  assert.equal(
    (result.update.field_verification as any).humanStructuredVerification.reviewedBy,
    "admin-id",
  );
});

test("editing verified facts refreshes human verification while preserving prior correction fields", () => {
  const result = buildPosterStructuredUpdate({
    values: { ...values, benefitsSummary: "새 혜택", verifiedAt: "2026-08-01T00:00:00.000Z" },
    initialValues: { ...values, benefitsSummary: "기존 혜택", verifiedAt: "2026-08-01T00:00:00.000Z" },
    fieldVerification: { humanReviewCorrection: { source: "golden_set", fields: ["title"] } },
    reviewerId: "admin-id",
    verificationReview: completedReview,
    canVerify: true,
    officialNoticeUrl: "https://example.com/notice",
    hasPosterImage: true,
    now: new Date("2026-08-04T06:00:00.000Z"),
  });

  assert.equal(result.update.verified_at, "2026-08-04T06:00:00.000Z");
  assert.deepEqual(
    (result.update.field_verification as any).humanReviewCorrection.fields,
    ["title", "benefits_summary", "human_structured_verification"],
  );
  assert.deepEqual(
    (result.update.field_verification as any).humanReviewCorrection.sources,
    ["golden_set", "poster_structured_editor"],
  );
});

test("verified status requires administrator authority and a complete checklist", () => {
  const initialValues = { ...values, verificationStatus: "needs_review" as const };
  assert.throws(
    () => buildPosterStructuredUpdate({
      values,
      initialValues,
      fieldVerification: {},
      reviewerId: "operator-id",
      verificationReview: completedReview,
      canVerify: false,
      officialNoticeUrl: "https://example.com/notice",
      hasPosterImage: true,
    }),
    /관리자만 승인/,
  );

  assert.throws(
    () => buildPosterStructuredUpdate({
      values,
      initialValues,
      fieldVerification: {},
      reviewerId: "admin-id",
      verificationReview: {
        ...completedReview,
        checks: { ...completedReview.checks, officialLinks: false },
      },
      canVerify: true,
      officialNoticeUrl: "https://example.com/notice",
      hasPosterImage: true,
    }),
    /체크리스트를 모두/,
  );
});

test("partial human review is preserved as a draft", () => {
  const verificationReview = emptyPosterStructuredVerificationReview();
  verificationReview.checks.titleAndOrganizations = true;
  verificationReview.note = "기관과 제목까지 확인";

  const result = buildPosterStructuredUpdate({
    values: { ...values, verificationStatus: "needs_review", verifiedAt: "" },
    initialValues: { ...values, verificationStatus: "unverified", verifiedAt: "" },
    fieldVerification: {},
    reviewerId: "admin-id",
    verificationReview,
    canVerify: true,
    officialNoticeUrl: "https://example.com/notice",
    hasPosterImage: true,
    now: new Date("2026-08-04T06:00:00.000Z"),
  });

  assert.deepEqual(
    readPosterStructuredVerificationReview(result.update.field_verification),
    verificationReview,
  );
  assert.equal(
    (result.update.field_verification as any).humanStructuredVerificationDraft.updatedBy,
    "admin-id",
  );
});

test("a newer invalidation resets the completed checklist", () => {
  const review = readPosterStructuredVerificationReview({
    humanStructuredVerification: {
      ...completedReview,
      reviewedAt: "2026-08-04T05:00:00.000Z",
    },
    structuredVerificationInvalidation: {
      invalidatedAt: "2026-08-04T06:00:00.000Z",
      reason: "poster_links_changed",
    },
  });

  assert.deepEqual(review, emptyPosterStructuredVerificationReview());
});

test("downgrading a verified record leaves an invalidation audit", () => {
  const result = buildPosterStructuredUpdate({
    values: { ...values, verificationStatus: "needs_review", benefitsSummary: "수정된 혜택" },
    initialValues: { ...values, verifiedAt: "2026-08-04T05:00:00.000Z" },
    fieldVerification: {
      humanStructuredVerification: {
        ...completedReview,
        reviewedAt: "2026-08-04T05:00:00.000Z",
        reviewedBy: "admin-id",
      },
    },
    reviewerId: "operator-id",
    now: new Date("2026-08-04T06:00:00.000Z"),
  });

  assert.equal(result.update.verification_status, "needs_review");
  assert.equal(result.update.verified_at, null);
  assert.equal(
    (result.update.field_verification as any).structuredVerificationInvalidation.invalidatedBy,
    "operator-id",
  );
  assert.deepEqual(
    readPosterStructuredVerificationReview(result.update.field_verification),
    emptyPosterStructuredVerificationReview(),
  );
});

test("invalid ranges are rejected", () => {
  assert.throws(
    () => buildPosterStructuredUpdate({
      values: { ...values, targetAgeMin: "40", targetAgeMax: "20" },
      initialValues: values,
      fieldVerification: null,
      reviewerId: "admin-id",
    }),
    /최소 연령/,
  );
  assert.throws(
    () => buildPosterStructuredUpdate({
      values: { ...values, appStartAt: "2026-08-11", appEndAt: "2026-08-10" },
      initialValues: values,
      fieldVerification: null,
      reviewerId: "admin-id",
    }),
    /모집 기간/,
  );
});

test("database timestamps become Korea date inputs", () => {
  assert.equal(toKstDateInput("2026-08-04T15:30:00.000Z"), "2026-08-05");
  assert.equal(toKstDateInput(null), "");
});

test("unchanged date inputs preserve their original timestamps", () => {
  const result = buildPosterStructuredUpdate({
    values: { ...values, verificationStatus: "needs_review", verifiedAt: "" },
    initialValues: { ...values, verificationStatus: "needs_review", verifiedAt: "" },
    fieldVerification: null,
    reviewerId: "admin-id",
    originalTimestamps: {
      applicationStartAt: "2026-08-03T15:00:00.000Z",
      applicationEndAt: "2026-08-10T02:30:00.000Z",
      eventStartAt: "2026-08-31T15:00:00.000Z",
      eventEndAt: "2026-09-02T05:00:00.000Z",
    },
  });

  assert.equal(result.update.application_start_at, "2026-08-03T15:00:00.000Z");
  assert.equal(result.update.application_end_at, "2026-08-10T02:30:00.000Z");
  assert.equal(result.update.event_start_at, "2026-08-31T15:00:00.000Z");
  assert.equal(result.update.event_end_at, "2026-09-02T05:00:00.000Z");
});
