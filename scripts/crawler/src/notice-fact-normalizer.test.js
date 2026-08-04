import assert from "node:assert/strict";
import test from "node:test";

import {
  restoreNoticeSectionBreaks,
  sanitizeNoticeFacts,
  sanitizeNoticeFactValue,
} from "./notice-fact-normalizer.js";

test("collapsed numbered sections are separated before extraction", () => {
  const restored = restoreNoticeSectionBreaks(
    "2. 신청대상: 취업 희망 여성 3. 신청기간: 2026.7.1~2026.8.21 4. 진행일정: 2026.9.1~2026.11.27 5. 진행내용: 디자인 교육",
  );
  assert.match(restored, /취업 희망 여성\n3\. 신청기간/);
  assert.match(restored, /2026\.8\.21\n4\. 진행일정/);
});

test("bullet sections do not leak into the previous fact", () => {
  const facts = sanitizeNoticeFacts({
    target: "5년 이상 강남구 거주 주민 ● 모집인원 : 12개 부문",
    application: "전자우편, 우편, 방문 제출 ● 문의방법 : 담당자 02-3423-5198",
  });
  assert.equal(facts.target, "5년 이상 강남구 거주 주민");
  assert.equal(facts.application, "전자우편, 우편, 방문 제출");
});

test("unfinished dates and URLs are rejected from user-facing facts", () => {
  assert.equal(sanitizeNoticeFactValue("~2026", "period"), null);
  assert.equal(sanitizeNoticeFactValue("2026. 8. 4.(", "period"), null);
  assert.equal(sanitizeNoticeFactValue("온라인 신청 https://www", "application"), null);
  assert.equal(sanitizeNoticeFactValue("온라인 신청 https://forms", "application"), null);
  assert.equal(sanitizeNoticeFactValue("https://m", "application"), null);
  assert.equal(sanitizeNoticeFactValue("2026.7.1~2026.8.21", "period"), "2026.7.1~2026.8.21");
});

test("attachment, route, hashtags, and newly observed sections are removed", () => {
  assert.equal(
    sanitizeNoticeFactValue("마포구청 ✔️ 정원: 20명", "location"),
    "마포구청",
  );
  assert.equal(
    sanitizeNoticeFactValue("02-1234-5678 첨부파일 poster.jpg", "contact"),
    "02-1234-5678",
  );
  assert.equal(
    sanitizeNoticeFactValue("02-1234-5678 #서울 #청년 찾아가기 서울 마포구", "contact"),
    "02-1234-5678",
  );
  assert.equal(
    sanitizeNoticeFactValue("서울 청년 2) 진행일정 1회기 상담", "target"),
    "서울 청년",
  );
});

test("a following labeled section is removed even without a bullet", () => {
  assert.equal(
    sanitizeNoticeFactValue(
      "취업 및 창업을 희망하는 여성 누구나 3. 신청기간: 2026.7.1~2026.8.21",
      "target",
    ),
    "취업 및 창업을 희망하는 여성 누구나",
  );
  assert.equal(
    sanitizeNoticeFactValue("연락처 02-2186-5823 1. 목적: 출판 실무 교육", "contact"),
    "연락처 02-2186-5823",
  );
});

test("a month-specific program label is not exposed as an application method", () => {
  assert.equal(
    sanitizeNoticeFactValue(
      '광진1인가구플랫폼 어플 → 지원서비스1[동행지원] → "광진인(IN) 5월 신청자 모집" 신청 후 서류 제출',
      "application",
    ),
    null,
  );
  assert.equal(
    sanitizeNoticeFactValue("홈페이지에서 신청 후 서류 제출", "application"),
    "홈페이지에서 신청 후 서류 제출",
  );
});

test("a source reference URL is removed after direct contact details", () => {
  assert.equal(
    sanitizeNoticeFactValue(
      "연구 책임자 김예닮 010-9727-9610 https://www.smyc.kr/program/?idx=171867698&bmode=view",
      "contact",
    ),
    "연구 책임자 김예닮 010-9727-9610",
  );
  assert.equal(
    sanitizeNoticeFactValue("https://pf.kakao.com/_poster", "contact"),
    "https://pf.kakao.com/_poster",
  );
});
