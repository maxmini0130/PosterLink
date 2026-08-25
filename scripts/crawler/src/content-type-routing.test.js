import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentTypeEvidence,
  classifyPosterContentType,
} from "./content-type-routing.js";

test("classifyPosterContentType keeps recruitment programs as recruit", () => {
  const result = classifyPosterContentType({
    title: "청년 창업 멘토링 프로그램 참여자 모집",
    summary_short: "창업 교육과 멘토링 참여자를 모집합니다. 신청 접수 중입니다.",
  });

  assert.equal(result.contentType, "recruit");
  assert.ok(result.confidence >= 0.8);
});

test("classifyPosterContentType routes public restroom manager notices to admin", () => {
  const result = classifyPosterContentType({
    title: "공중화장실 관리인 모집 공고",
    summary_short: "시설 관리인을 채용하기 위한 공고입니다.",
  });

  assert.equal(result.contentType, "admin");
  assert.equal(result.reason, "admin_title_rule");
});

test("classifyPosterContentType routes retrospective result notices to news", () => {
  const result = classifyPosterContentType({
    title: "청년 행사 결과 발표 및 활동 보고",
    summary_short: "지난 프로그램 운영 결과를 안내합니다.",
  });

  assert.equal(result.contentType, "news");
});

test("classifyPosterContentType routes rejected posters to discard", () => {
  const result = classifyPosterContentType({
    poster_status: "rejected",
    title: "QA 테스트 검수 플로우 확인 공고",
  });

  assert.equal(result.contentType, "discard");
  assert.equal(result.reason, "poster_rejected");
});

test("classifyPosterContentType honors known quality issue routes", () => {
  assert.equal(
    classifyPosterContentType({
      title: "중복 공고",
      field_verification: { duplicateIssues: [{ code: "duplicate_suspected" }] },
    }).contentType,
    "discard",
  );

  assert.equal(
    classifyPosterContentType({
      title: "기간제 근로자 채용 공고",
      field_verification: { qualityIssues: [{ code: "employment-recruitment-notice" }] },
    }).contentType,
    "admin",
  );
});

test("buildContentTypeEvidence emits poster_field_evidence compatible rows", () => {
  const row = buildContentTypeEvidence({
    id: "poster-1",
    title: "공중화장실 관리인 모집 공고",
  });

  assert.equal(row.poster_id, "poster-1");
  assert.equal(row.field_key, "content_type");
  assert.equal(row.value_text, "admin");
  assert.deepEqual(row.value_json, {
    type: "admin",
    reason: "admin_title_rule",
  });
  assert.equal(row.evidence_src, "rule");
  assert.equal(row.extractor, "content-type-routing-v1");
});
