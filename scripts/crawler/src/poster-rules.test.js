import assert from "node:assert/strict";
import test from "node:test";

import { scorePosterDuplicate } from "./poster-duplicate-detector.js";
import { evaluatePosterQuality } from "./poster-quality-gate.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";

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

test("do not reject a recruitment title because shared detail text contains an event schedule", () => {
  const result = getPostExclusionReason({
    title: "2026 마포구민 노래자랑 참가신청 공고",
    content: "문화원 공통 메뉴 상상마당 밴드존 행사 일정 8.1 ~ 8.31",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result, null);
});

test("reject a street event schedule when the schedule is the title itself", () => {
  const result = getPostExclusionReason({
    title: "상상마당 밴드존 행사 일정 8.1 ~ 8.31",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result?.rule, "street-event-schedule");
});

test("reject recruitment screening schedule follow-up notices", () => {
  const result = getPostExclusionReason({
    title: "2026년 마포구립예술단 단원 추가모집 심사 일정 공고",
    collectionSourceSlug: "mfac",
  });
  assert.equal(result?.rule, "recruitment-screening-schedule");
});

test("do not reject a participant recruitment because shared detail text contains a timetable", () => {
  const result = getPostExclusionReason({
    title: "2026 전통성년식 개최 및 참가 학생 모집",
    content: "문화원 공통 메뉴 2026년 3분기 문화학교 시간표",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result, null);
});

test("do not reject a participant recruitment because shared detail text contains a monthly calendar", () => {
  const result = getPostExclusionReason({
    title: "2026 전통성년식 개최 및 참가 학생 모집",
    content: "문화원 공통 메뉴 7월 프로그램 안내 캘린더",
    collectionSourceSlug: "mapo-culture",
  });
  assert.equal(result, null);
});

for (const title of [
  "[2026 마포구민노래자랑] 본선 진출자 공지",
  "2025 삼개시낭송경연대회 본선 진출 대상자 안내",
  "2026 정월대보름 민속놀이 행사 취소 알림",
  "[2026 마포구민노래자랑] 시상부문 내용 변경 안내",
]) {
  test(`reject result or cancellation follow-up: ${title}`, () => {
    assert.ok(getPostExclusionReason({ title, collectionSourceSlug: "mapo-culture" }));
  });
}
