import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePosterDateQuality } from "./poster-date-quality.js";

function codesOf(result) {
  return result.issues.map((issue) => issue.code);
}

// --- 오탐 제거 --------------------------------------------------------------

test("프로그램 일정과 신청기간이 섞여도 date-end-before-start 오탐이 나지 않는다", () => {
  const result = evaluatePosterDateQuality({
    content: "프로그램 운영: 2026.03.01 ~ 03.05, 신청기간: 2026.02.10 ~ 2026.02.20",
    deadline: "2026-02-20",
  });
  assert.ok(!codesOf(result).includes("date-end-before-start"));
  assert.ok(!codesOf(result).includes("deadline-mismatch"));
});

test("섞인 세그먼트에서 실제 신청기간 마감일을 정확히 잡는다", () => {
  const result = evaluatePosterDateQuality({
    content: "프로그램 운영: 2026.03.01 ~ 03.05, 신청기간: 2026.02.10 ~ 2026.02.20",
  });
  // 프로그램 시작일(03-01)이 아니라 신청 마감일(02-20)을 제안해야 한다
  assert.equal(result.suggestedDeadline, "2026-02-20");
});

test("마감 키워드에서 멀리 떨어진 프로그램 날짜를 마감일로 오인하지 않는다", () => {
  const result = evaluatePosterDateQuality({
    content:
      "행사 개최일: 2026.03.01. 신청 방법과 자세한 사항은 각 기관 홈페이지를 참고하시기 바랍니다. 접수는 선착순 마감입니다.",
  });
  assert.equal(result.suggestedDeadline, null);
  assert.ok(!codesOf(result).includes("missing-clear-deadline"));
});

// --- 정상(참) 케이스 보존 ---------------------------------------------------

test("정상 신청기간 범위는 이슈 없이 통과한다", () => {
  const result = evaluatePosterDateQuality({
    content: "신청기간: 2026.02.10 ~ 2026.02.20",
    deadline: "2026-02-20",
  });
  assert.equal(result.decision, "pass");
  assert.equal(result.issues.length, 0);
});

test("실제로 종료일이 시작일보다 빠르면 date-end-before-start 를 감지한다", () => {
  const result = evaluatePosterDateQuality({
    content: "신청기간: 2026.02.20 ~ 2026.02.10",
  });
  assert.ok(codesOf(result).includes("date-end-before-start"));
});

test("추출 마감일이 본문 신청기간과 다르면 deadline-mismatch 를 감지한다", () => {
  const result = evaluatePosterDateQuality({
    content: "신청기간: 2026.02.10 ~ 2026.02.25",
    deadline: "2026-02-20",
  });
  assert.ok(codesOf(result).includes("deadline-mismatch"));
  assert.equal(result.suggestedDeadline, "2026-02-25");
});

test("마감 키워드 근처의 단일 날짜는 마감일로 채택한다", () => {
  const result = evaluatePosterDateQuality({
    content: "접수 마감: 2026.02.20 까지 신청하세요.",
  });
  assert.equal(result.suggestedDeadline, "2026-02-20");
  assert.ok(!codesOf(result).includes("date-end-before-start"));
});
