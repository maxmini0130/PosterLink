import assert from "node:assert/strict";
import test from "node:test";

import { inferDeadlineTypeEvidence } from "./deadline-type-evidence.js";

test("infers fixed deadline type from explicit application period evidence", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    applicationEndAt: "2026-08-31T00:00:00.000Z",
    sourceText: "신청기간: 2026. 8. 1. ~ 2026. 8. 31. 청년 참여자를 모집합니다.",
    existingDeadlineType: "unknown",
  });

  assert.equal(row.field_key, "deadline_type");
  assert.equal(row.value_text, "fixed");
  assert.deepEqual(row.value_json, {
    type: "fixed",
    deadline_date: "2026-08-31",
  });
  assert.equal(row.confidence, 0.9);
});

test("does not infer fixed type from event dates without application context", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    applicationEndAt: "2026-08-31T00:00:00.000Z",
    sourceText: "행사일: 2026. 8. 31. 장소는 구청 강당입니다.",
    existingDeadlineType: "unknown",
  });

  assert.equal(row, null);
});

test("infers ongoing only from explicit always-open wording", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    sourceText: "참여자를 상시 모집합니다. 자세한 내용은 원문을 확인하세요.",
    existingDeadlineType: null,
  });

  assert.equal(row.value_text, "ongoing");
  assert.deepEqual(row.value_json, { type: "ongoing" });
});

test("infers until_exhausted from explicit exhaustion wording", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    sourceText: "예산 소진 시 마감되며 선착순 접수로 진행합니다.",
    existingDeadlineType: "unknown",
  });

  assert.equal(row.value_text, "until_exhausted");
  assert.deepEqual(row.value_json, { type: "until_exhausted" });
});

test("keeps fixed type when a bounded application period also mentions first-come capacity", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    existingDeadlineType: "unknown",
    sourceText: "모집 인원은 선착순 마감입니다.",
    deadlineDateEvidence: {
      value_text: "2026-09-14",
      value_json: { date: "2026-09-14" },
      confidence: 0.95,
      evidence_text: "신청기간 2026.08.25 09:00 ~ 2026.09.14 17:00 까지",
      extractor: "deadline-date-grounded-v1",
    },
  });

  assert.equal(row.field_key, "deadline_type");
  assert.equal(row.value_text, "fixed");
  assert.deepEqual(row.value_json, {
    type: "fixed",
    deadline_date: "2026-09-14",
  });
});

test("infers fixed type from high-confidence application deadline evidence", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    existingDeadlineType: "unknown",
    deadlineDateEvidence: {
      value_text: "2026-08-31",
      value_json: { date: "2026-08-31" },
      confidence: 0.9,
      evidence_text: "신청기간: 2026년 8월 1일(토) ~ 8월 31일(월) 18:00",
    },
  });

  assert.equal(row.field_key, "deadline_type");
  assert.equal(row.value_text, "fixed");
  assert.deepEqual(row.value_json, {
    type: "fixed",
    deadline_date: "2026-08-31",
  });
  assert.equal(row.extractor, "deadline-type-from-date-evidence-v1");
});

test("infers fixed type from grounded Korean period summary deadline evidence", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    existingDeadlineType: "unknown",
    deadlineDateEvidence: {
      value_text: "2026-08-25",
      value_json: { date: "2026-08-25" },
      confidence: 0.9,
      evidence_text: "대상: 송파구 청년 · 기간: 2026. 8. 18.(화) ~ 8. 25.(화) · 신청: 네이버폼 작성",
      extractor: "deadline-date-grounded-v1",
    },
  });

  assert.equal(row.field_key, "deadline_type");
  assert.equal(row.value_text, "fixed");
  assert.deepEqual(row.value_json, {
    type: "fixed",
    deadline_date: "2026-08-25",
  });
  assert.equal(row.extractor, "deadline-type-from-date-evidence-v1");
});

test("does not infer fixed type from a travel period after an open application period", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    existingDeadlineType: "unknown",
    deadlineDateEvidence: {
      value_text: "2026-09-06",
      value_json: { date: "2026-09-06" },
      confidence: 0.9,
      evidence_text: "신청기간 : 2026. 8. 24.(월) 10:00~ 신청방법 : 공공서비스예약 여행기간 : 2026. 9. 5.(토)~9. 6.(일)",
    },
  });

  assert.equal(row, null);
});

test("does not infer fixed type when the date is only the start of an open application period", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    existingDeadlineType: "unknown",
    deadlineDateEvidence: {
      value_text: "2026-06-18",
      value_json: { date: "2026-06-18" },
      confidence: 0.9,
      evidence_text: "신청기간 2026-06-18 ~ 진행일정 대상 담당기관 기타",
    },
  });

  assert.equal(row, null);
});

test("does not infer fixed type from a selection notice date after the application window", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    existingDeadlineType: "unknown",
    deadlineDateEvidence: {
      value_text: "2026-08-31",
      value_json: { date: "2026-08-31" },
      confidence: 0.9,
      evidence_text: "모집기간 ~ 8/30(일) 선발안내 - 8/31(월)",
    },
  });

  assert.equal(row, null);
});

test("keeps existing non-unknown deadline types untouched", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    sourceText: "신청기간: 2026. 8. 1. ~ 2026. 8. 31.",
    applicationEndAt: "2026-08-31",
    existingDeadlineType: "fixed",
  });

  assert.equal(row, null);
});
