import assert from "node:assert/strict";
import test from "node:test";

import { scorePosterDuplicate } from "./poster-duplicate-detector.js";
import { evaluatePosterQuality } from "./poster-quality-gate.js";

const org = "금천구";

test("weekday variants of the same futsal program merge", () => {
  const result = scorePosterDuplicate(
    { title: "2026년 금천구 생활체육교실 <여성풋살교실(8~10월 매주 월요일)> 참여자 모집", source_org_name: org },
    { title: "2026년 금천구 생활체육교실 <여성풋살교실(8~10월 매주 금요일)> 참여자 모집", source_org_name: org },
  );
  assert.equal(result.decision, "merge");
});

test("month/new-program variants of the same badminton lesson merge", () => {
  const result = scorePosterDuplicate(
    { title: "여름맞이 배드민턴 소그룹 집중 레슨(특강) 신규 프로그램 안내", source_org_name: org },
    { title: "여름맞이 배드민턴 소그룹 집중 레슨(특강) 8월", source_org_name: org },
  );
  assert.equal(result.decision, "merge");
});

for (const title of [
  "[마포구가족센터] 공고 제 2026-5호 마포구가족센터 직원 채용공고",
  "마포구가족센터 - 건강관리 교육 및 근력운동 프로그램 강사 모집(안내)",
  "[채용공고] 마포구고용복지지원센터 신규사업 실시에 따른 계약직 직원 채용 재공고",
  "2026년 제4회 마포문화재단 직원 채용 공고( ~ 7.10.(금) 18:00 한)",
  "통장 모집 공고(제7통)",
]) {
  test(`reject non-poster recruitment notice: ${title}`, () => {
    const result = evaluatePosterQuality({
      title,
      source_org_name: "마포구",
      summary_short: "공식 홈페이지에 게시된 모집 및 채용 관련 행정 공고입니다.",
      source_key: `https://example.test/${encodeURIComponent(title)}`,
      images: ["https://example.test/poster.jpg"],
    });
    assert.equal(result.decision, "reject");
    assert.ok(result.issues.some((issue) => issue.code === "employment-recruitment-notice"));
  });
}

test("reject Taegeukgi administrative campaign attachment", () => {
  const result = evaluatePosterQuality({
    title: "제107주년 삼일절 나라사랑 태극기 달기운동",
    source_org_name: "마포구",
    summary_short: "국경일을 맞아 각 가정에서 태극기를 게양해 주시기 바랍니다.",
    source_key: "https://example.test/taegeukgi",
    images: ["https://example.test/attachment.jpg"],
  });
  assert.equal(result.decision, "reject");
  assert.ok(result.issues.some((issue) => issue.code === "administrative-campaign-attachment"));
});
