import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStructuredPosterFields,
  inferStructuredDeadlineType,
  normalizeStructuredDeadlineType,
} from "./poster-structured-fields.js";

test("deadline type stays unknown without explicit evidence", () => {
  assert.equal(inferStructuredDeadlineType({}), "unknown");
  assert.equal(normalizeStructuredDeadlineType("상시"), "ongoing");
});

test("deadline type uses explicit source wording before fixed date fallback", () => {
  assert.equal(
    inferStructuredDeadlineType({ sourceText: "참여자를 상시 모집합니다" }),
    "ongoing",
  );
  assert.equal(
    inferStructuredDeadlineType({ sourceText: "예산 소진 시 종료" }),
    "until_exhausted",
  );
  assert.equal(
    inferStructuredDeadlineType({ applicationEndAt: "2026-08-31" }),
    "fixed",
  );
});

test("structured fields preserve organization and readable notice facts", () => {
  const fields = buildStructuredPosterFields({
    fieldVerification: {
      confidence: 0.91,
      organization: {
        sourceOrgName: "수집 사이트",
        organizerName: "실제 주관기관",
        applicationOrganizationName: "접수 기관",
      },
      readableNotice: {
        facts: {
          target: "서울 거주 청년",
          application: "온라인 신청",
          contact: "02-1234-5678",
          location: "마포구청",
        },
      },
    },
    applicationEndAt: "2026-08-31",
    supportScale: "교육비 전액 지원",
  });

  assert.equal(fields.organizer_name, "실제 주관기관");
  assert.equal(fields.application_organization_name, "접수 기관");
  assert.equal(fields.deadline_type, "fixed");
  assert.equal(fields.eligibility_summary, "서울 거주 청년");
  assert.equal(fields.benefits_summary, "교육비 전액 지원");
  assert.equal(fields.application_method, "온라인 신청");
  assert.equal(fields.contact_info, "02-1234-5678");
  assert.equal(fields.event_location, "마포구청");
  assert.equal(fields.data_confidence, 0.91);
});
