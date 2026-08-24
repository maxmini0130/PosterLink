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

test("keeps existing non-unknown deadline types untouched", () => {
  const row = inferDeadlineTypeEvidence({
    posterId: "poster-1",
    sourceText: "신청기간: 2026. 8. 1. ~ 2026. 8. 31.",
    applicationEndAt: "2026-08-31",
    existingDeadlineType: "fixed",
  });

  assert.equal(row, null);
});
