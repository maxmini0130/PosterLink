import assert from "node:assert/strict";
import test from "node:test";

import { inferDeadlineDateEvidence } from "./deadline-date-evidence.js";

test("uses dateQuality suggested deadline when present", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "참여자 모집",
    sourceText: "신청기간: 2026. 8. 1. ~ 2026. 8. 31.",
    fieldVerification: {
      dateQuality: { suggestedDeadline: "2026-08-31" },
    },
  });

  assert.equal(row.field_key, "deadline_date");
  assert.equal(row.value_text, "2026-08-31");
  assert.equal(row.confidence, 0.9);
});

test("infers end date from explicit application period range", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "청년 프로그램 참여자 모집",
    sourceText: "신청기간: 2026. 8. 14.(금) ~ 8. 25.(화) 문의 바랍니다.",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-25");
  assert.deepEqual(row.value_json, { date: "2026-08-25" });
});

test("infers end date from generated recruitment period summary", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "서초청년센터 <바디밸런스> 모집",
    sourceText: "대상: 청년 ♦ 모집 · 기간: 2026. 8. 14.(금) ~ 8. 25.(화) · 신청: 홈페이지",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-25");
});

test("infers normalized deadline from Korean period summary with application cue", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "송파구청 <2026년 송파 청년축제 공연팀 모집>",
    sourceText: "대상: 송파구 청년 · 기간: 2026. 8. 18.(화) ~ 8. 25.(화) · 신청: 네이버폼 작성",
    fieldVerification: {
      dateQuality: {
        normalizedDeadline: "2026-08-25",
      },
    },
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row.field_key, "deadline_date");
  assert.equal(row.value_text, "2026-08-25");
  assert.equal(row.confidence, 0.9);
});

test("does not infer Korean period summary when normalized deadline is a different date", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "광진구1인가구지원센터 <교육 및 여가문화 프로그램>(~8/12)",
    sourceText: "기간: 2026.8.24.(월) ~ 2026.9.14.(월) · 신청: 광진1인가구플랫폼",
    fieldVerification: {
      dateQuality: {
        normalizedDeadline: "2026-08-12",
      },
    },
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row, null);
});

test("does not infer generic generated period summaries as deadlines", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "서울청년센터 광진 <느슨한가드닝 참여자 모집>(~8/30)",
    sourceText: "대상: 청년 · 기간: 2026.09.03.(목)~11.12.(목) · 내용: 정원활동 · 신청: 링크",
    fieldVerification: {
      dateQuality: { suggestedDeadline: "2026-09-03" },
    },
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row, null);
});

test("does not infer event period as application deadline", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "전시 안내",
    sourceText: "행사기간: 2026. 9. 1. ~ 9. 30. 신청은 현장 접수입니다.",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row, null);
});

test("does not infer open-ended or exhausted deadlines as fixed dates", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "청년 워크숍 참여자 모집",
    sourceText: "신청기간: 2026. 8. 1. ~ 모집 마감시 선착순 마감",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row, null);
});
