import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPosterStructuredUpdate,
  type PosterStructuredEditorValues,
  toKstDateInput,
} from "./posterStructuredEditor";

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
    additionalChangedFields: ["poster_links"],
    now: new Date("2026-08-04T05:00:00.000Z"),
  });

  assert.equal(result.update.title, "청년 지원사업");
  assert.equal(result.update.application_start_at, "2026-08-04T00:00:00+09:00");
  assert.equal(result.update.application_end_at, "2026-08-10T23:59:59+09:00");
  assert.equal(result.update.target_age_min, 19);
  assert.equal(result.update.data_confidence, 0.95);
  assert.equal(result.update.verified_at, "2026-08-04T05:00:00.000Z");
  assert.deepEqual(result.changedFields, ["organizer_name", "verification_status", "poster_links"]);
  assert.deepEqual(
    (result.update.field_verification as any).humanReviewCorrection.fields,
    ["organizer_name", "verification_status", "poster_links"],
  );
  assert.deepEqual((result.update.field_verification as any).organization, { confidence: 0.9 });
});

test("existing human correction fields and verified timestamp are preserved", () => {
  const result = buildPosterStructuredUpdate({
    values: { ...values, benefitsSummary: "새 혜택", verifiedAt: "2026-08-01T00:00:00.000Z" },
    initialValues: { ...values, benefitsSummary: "기존 혜택", verifiedAt: "2026-08-01T00:00:00.000Z" },
    fieldVerification: { humanReviewCorrection: { source: "golden_set", fields: ["title"] } },
    reviewerId: "admin-id",
  });

  assert.equal(result.update.verified_at, "2026-08-01T00:00:00.000Z");
  assert.deepEqual(
    (result.update.field_verification as any).humanReviewCorrection.fields,
    ["title", "benefits_summary"],
  );
  assert.deepEqual(
    (result.update.field_verification as any).humanReviewCorrection.sources,
    ["golden_set", "poster_structured_editor"],
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
    values,
    initialValues: values,
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
