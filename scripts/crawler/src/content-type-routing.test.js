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

test("classifyPosterContentType routes campaign and event announcements without application periods away from recruit", () => {
  assert.equal(
    classifyPosterContentType({
      title: "서울배달+ 땡겨요 8월 한달 간 한강 배달존 특별한 할인 혜택!",
      source_key: "https://news.seoul.go.kr/economy/archives/573918",
    }).contentType,
    "news",
  );

  assert.equal(
    classifyPosterContentType({
      title: "서울 주얼리 브랜드 14개사, 더현대 서울에 모인다 - 「갓서울(GOAT SEOUL), 서울 주얼리 공방」",
      summary_short: "더현대 서울에서 서울 주얼리 브랜드만을 위한 대형 팝업이 열립니다.",
      source_key: "https://news.seoul.go.kr/economy/archives/573913",
    }).contentType,
    "news",
  );

  assert.equal(
    classifyPosterContentType({
      title: "2026년 제3회 서초 청년 FESTA x 한불수교 140주년 페스티벌 Bonjour, Fête!",
      summary_short: "청년의 날 기념식 사전 신청자 대상 선착순 기념품 증정. 자세한 프로그램과 참여 방법은 곧 공개됩니다.",
    }).contentType,
    "news",
  );
});

test("classifyPosterContentType routes general guides and candidate recommendation notices to admin", () => {
  assert.equal(
    classifyPosterContentType({
      title: "수인성·식품매개감염병 6대 예방수칙",
      source_key: "https://news.seoul.go.kr/welfare/archives/582238",
    }).contentType,
    "admin",
  );

  assert.equal(
    classifyPosterContentType({
      title: "중랑구청<제31회 중랑구민대상 수상후보자 추천 공고>(~8/18)",
      summary_short: "추천방법: 관내 기관, 단체, 학교장 추천 또는 구민 10명 이상 연명 추천",
    }).contentType,
    "admin",
  );

  assert.equal(
    classifyPosterContentType({
      title: "교육문화사업 온라인접수 안내",
      summary_short: "온라인접수 안내입니다.",
    }).contentType,
    "admin",
  );
});

test("classifyPosterContentType keeps festival volunteer recruitment as recruit when application period is explicit", () => {
  const result = classifyPosterContentType({
    title: "서리풀 뮤직 페스티벌 청년봉사단 3기 모집",
    summary_short: "신청기간: 2026. 8. 7. ~ 8. 28. 활동내용: 페스티벌 운영 지원",
  });

  assert.equal(result.contentType, "recruit");
});

test("classifyPosterContentType keeps event participant recruitment when the title has an action", () => {
  const result = classifyPosterContentType({
    title: "'푸른 하늘을 위한 나의 실천 인증' 이벤트 참여자 모집(8.24.~9.11.)",
    summary_short: "인증 이벤트 참여자를 모집합니다.",
  });

  assert.equal(result.contentType, "recruit");
});

test("classifyPosterContentType keeps ticket reservation events with application periods as recruit", () => {
  const result = classifyPosterContentType({
    title: "\uC11C\uCD08\uAD6C\uCCAD <\uC81C1300\uD68C \uC11C\uCD08\uAE08\uC694\uC74C\uC545\uD68C -\uD55C\uC5EC\uB984 \uBC24\uC758 \uBC14\uB85C\uD06C Festa> \uC548\uB0B4",
    summary_short: "\uBAA8\uC9D1\uAE30\uAC04 : [\uC628\uB77C\uC778\uC608\uB9E4] 2026\uB144 8\uC6D4 21\uC77C ~ 2026\uB144 9\uC6D4 3\uC77C. \uC2E0\uCCAD: YES24 \uC628\uB77C\uC778 \uC0AC\uC804 \uC608\uB9E4",
  });

  assert.equal(result.contentType, "recruit");
  assert.equal(result.confidence, 0.82);
  assert.equal(result.reason, "recruit_reservation_period_signal");
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
