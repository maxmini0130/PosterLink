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

test("classifyPosterContentType routes civil defense notices to admin", () => {
  const result = classifyPosterContentType({
    title: "2026년 마포구 민방위 보충교육 안내",
    summary_short: "민방위 교육 및 통지서 수령 안내입니다.",
  });

  assert.equal(result.contentType, "admin");
});

test("classifyPosterContentType routes retrospective and community notices to news", () => {
  assert.equal(
    classifyPosterContentType({
      title: "청년 행사 결과 발표 및 활동 보고",
      summary_short: "지원 프로그램 운영 결과를 안내합니다.",
    }).contentType,
    "news",
  );

  assert.equal(
    classifyPosterContentType({
      title: "5월 걷기모임 소식",
      summary_short: "마포구노동자종합지원센터 활동 소식입니다.",
    }).contentType,
    "news",
  );
});

test("classifyPosterContentType routes QA notices to discard", () => {
  const result = classifyPosterContentType({
    title: "[QA 테스트] 검수 플로우 확인 공고",
    summary_short: "PosterLink QA팀 임시 공고입니다. 확인 후 삭제됩니다.",
  });

  assert.equal(result.contentType, "discard");
  assert.equal(result.reason, "qa_test_notice");
});

test("classifyPosterContentType routes event notices polluted by next links to news", () => {
  const result = classifyPosterContentType({
    title: "강남구청 <2026 대치2동 제로마켓 개최 및 주민 셀러 모집> 안내",
    summary_short: "2026 대치2동 제로마켓 개최 안내 행사개요 행 사 명 일 시 장소 프로그램 플리마켓 다음글 시민특강 참여자 모집",
  });

  assert.equal(result.contentType, "news");
  assert.equal(result.reason, "event_notice_without_application_period");
});

test("classifyPosterContentType separates rejected admin and news documents", () => {
  assert.equal(
    classifyPosterContentType({
      poster_status: "rejected",
      title: "무연고 사망자 공고",
      summary_short: "서울특별시 강서구청 무연고 사망자 공고",
    }).contentType,
    "admin",
  );

  assert.equal(
    classifyPosterContentType({
      poster_status: "rejected",
      title: "4월 걷기모임 소식",
      summary_short: "마포구노동자종합지원센터 활동 소식입니다.",
    }).contentType,
    "news",
  );
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

test("buildContentTypeEvidence does not split emoji surrogate pairs", () => {
  const row = buildContentTypeEvidence({
    id: "poster-emoji",
    title: "주거 수리 교육 참여자 모집",
    summary_short: `${"모집 ".repeat(130)}🙂`,
    summary_long: "교육 프로그램 신청 접수",
  });

  assert.doesNotThrow(() => JSON.stringify(row));
  assert.doesNotThrow(() => encodeURIComponent(row.evidence_text));
});
