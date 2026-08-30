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

test("infers deadline from explicit application deadline followed by closing word", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uCCAD\uB144 \uD504\uB85C\uADF8\uB7A8 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    sourceText: "\uC2E0\uCCAD\uB9C8\uAC10: 2026. 8. 31. \uAE4C\uC9C0 \uC628\uB77C\uC778 \uC811\uC218",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-31");
  assert.match(row.evidence_text, /\uC2E0\uCCAD\uB9C8\uAC10/);
});

test("grounds normalized deadline when application window date is followed by closing word", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uCCAD\uB144 \uD504\uB85C\uADF8\uB7A8 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    sourceText: "\uC811\uC218\uAE30\uAC04: 2026. 8. 31. \uB9C8\uAC10 \uC2E0\uCCAD\uBC29\uBC95: \uC628\uB77C\uC778 \uC811\uC218",
    fieldVerification: {
      dateQuality: {
        decision: "review",
        normalizedDeadline: "2026-08-31",
      },
    },
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-31");
  assert.equal(row.extractor, "deadline-date-grounded-v1");
});

test("infers end date from generated recruitment period summary", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "서초청년센터 <바디밸런스> 모집",
    sourceText: "대상: 청년 · 모집 기간: 2026. 8. 14.(금) ~ 8. 25.(화) · 신청: 네이버폼",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-25");
});

test("infers normalized deadline from Korean period summary with application cue", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "송파구청 <2026 송파 청년축제 공연팀 모집>",
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
    title: "서울청년센터 광진 <예술 프로젝트 참여자 모집>(~8/30)",
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

test("does not infer recommendation notice receipt periods as deadlines", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uC911\uB791\uAD6C\uCCAD<\uC81C31\uD68C \uC911\uB791\uAD6C\uBBFC\uB300\uC0C1 \uC218\uC0C1\uD6C4\uBCF4\uC790 \uCD94\uCC9C \uACF5\uACE0>(~8/18)",
    sourceText: "\uC811\uC218\uAE30\uAC04 : 2026.8.3.~8.18. \uC218\uC0C1\uD6C4\uBCF4\uC790 \uCD94\uCC9C \uACF5\uACE0",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row, null);
});

test("does not infer open-ended or exhausted deadlines as fixed dates", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "청년 토크콘서트 참여자 모집",
    sourceText: "신청기간: 2026. 8. 1. ~ 모집 마감시까지 선착순 마감",
    createdAt: "2026-08-20T00:00:00Z",
  });

  assert.equal(row, null);
});

test("prefers grounded normalized deadline over stale suggested deadline", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "(사)한국ICT패션뷰티산업협회 <2026년 미래내일일경험 패션뷰티유통직무 청년인턴 4기> 모집",
    sourceText: "신청기간 /진행 일정 1. 청년모집 : 패션뷰티유통직무 ~ 26.09.04(금) / 경영사무직무 ~26.08.31(월) 5. 일경험 기간 2026.09.28(월) ~ 2026.12.04(금)",
    fieldVerification: {
      dateQuality: {
        decision: "review",
        suggestedDeadline: "2026-08-31",
        normalizedDeadline: "2026-09-04",
      },
    },
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-09-04");
  assert.equal(row.extractor, "deadline-date-grounded-v1");
});

test("uses title-level recruitment deadline when normalized date is grounded", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "소셜혁신연구소 사회적협동조합 <2026 미래내일 일경험 사업 소셜 WE 아트브릿지+ 3기> 모집",
    sourceText: "[참여자 모집] 2026 미래내일 일경험 사업 소셜 WE 아트브릿지+ 3기 교육생 모집 (~9/20) 교육기간 2026.10.26 ~ 2027.01.13",
    fieldVerification: {
      dateQuality: {
        decision: "review",
        suggestedDeadline: "2026-09-29",
        normalizedDeadline: "2026-09-20",
      },
    },
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-09-20");
});

test("accepts pass-quality stored date when grounded in recruitment title", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "강서구가족센터 <자립준비 청년대상 우리의 온(on)도(도예)> 참여자 모집",
    sourceText: "기간: 2026-08-21 ~ 2026-09-02 신청방법: 온라인 접수",
    fieldVerification: {
      dateQuality: {
        decision: "pass",
        suggestedDeadline: "2026-09-02",
        normalizedDeadline: "2026-09-02",
      },
    },
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-09-02");
  assert.equal(row.confidence, 0.95);
});

test("prefers 접수기간 over earlier 행사일 in the same service-reservation segment", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uAC15\uBD81\uAD6C\uCCAD <\uBA85\uC0AC\uD2B9\uAC15> \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    sourceText:
      "\uB300\uC0C1 \uAC15\uBD81\uAD6C\uBBFC \uD589\uC0AC\uC77C2026.09.30~2026.09.30 \uC7A5\uC18C \uAC15\uBD81\uBB38\uD654\uC608\uC220\uD68C\uAD00 \uC811\uC218\uAE30\uAC042026.08.10~2026.09.18 \uBAA8\uC9D1\uC778\uC6D0520\uBA85 \uC2E0\uCCAD\uBC29\uBC95 \uC628\uB77C\uC778 \uC811\uC218 / \uC120\uCC29\uC21C",
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-09-18");
  assert.match(row.evidence_text, /\uC811\uC218\uAE30\uAC04/);
  assert.doesNotMatch(row.evidence_text, /\uD589\uC0AC\uC77C/);
});

test("prefers 모집기간 over earlier 강좌기간 in the same library segment", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "[\uAC00\uC0B0\uD37C\uBE14\uB9AD] \uC791\uAC00\uC640\uC758 \uB9CC\uB0A8",
    sourceText:
      "\uAC15\uC88C\uAE30\uAC04: 2026-08-26 19:00 ~ 2026-08-26 20:30 \uAC15\uC88C\uC2DC\uAC04: \uC218\uC694\uC77C 19:00 ~ 20:30 \uBAA8\uC9D1\uAE30\uAC04: 2026-08-04 10:00 ~ 2026-08-25 10:00 \uC218\uAC15\uB8CC: \uBB34\uB8CC",
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-25");
  assert.match(row.evidence_text, /\uBAA8\uC9D1\uAE30\uAC04/);
});

test("does not use 서울농장 여행기간 when 신청기간 only has a start date", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uC11C\uC6B8\uB18D\uC7A5 \uB18D\uCD0C\uCCB4\uD5D8 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    sourceText:
      "\uC9C0\uC5ED \uBC0F \uC7A5\uC18C: \uCDA9\uB0A8 \uBD80\uC5EC\uAD70 \uBD80\uC5EC\uC11C\uC6B8\uB18D\uC7A5 \uC2E0\uCCAD\uAE30\uAC04: 2026. 8. 24.(\uC6D4) 10:00~ \uC2E0\uCCAD\uBC29\uBC95: \uC11C\uC6B8\uC2DC \uACF5\uACF5\uC11C\uBE44\uC2A4\uC608\uC57D\uC2DC\uC2A4\uD15C\uC5D0\uC11C \uC2E0\uCCAD \uC5EC\uD589\uAE30\uAC04: 2026. 9. 5.(\uAE08)~9. 6.(\uD1A0)",
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row, null);
});

test("ignores normalized start date when application window has a later end date", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    sourceText:
      "\uC811\uC218\uAE30\uAC04: 2026-08-19 ~ 2026-08-28 23:00 \uC8FC\uAD00\uAE30\uAD00\uBA85: (\uC7AC)\uD55C\uAD6D\uCCAD\uB144\uAE30\uC5C5\uAC00\uC815\uC2E0\uC7AC\uB2E8",
    fieldVerification: {
      dateQuality: {
        decision: "review",
        normalizedDeadline: "2026-08-19",
      },
    },
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-08-28");
});

test("ignores normalized start date when application window is open-ended", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "\uC11C\uC6B8\uB18D\uC7A5 \uB18D\uCD0C\uCCB4\uD5D8 \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    sourceText:
      "\uC2E0\uCCAD\uAE30\uAC04: 2026. 8. 24.(\uC6D4) 10:00~ \uC2E0\uCCAD\uBC29\uBC95: \uC11C\uC6B8\uC2DC \uACF5\uACF5\uC11C\uBE44\uC2A4\uC608\uC57D\uC2DC\uC2A4\uD15C\uC5D0\uC11C \uC2E0\uCCAD \uC5EC\uD589\uAE30\uAC04: 2026. 9. 5.(\uAE08)~9. 6.(\uD1A0)",
    fieldVerification: {
      dateQuality: {
        decision: "review",
        normalizedDeadline: "2026-08-24",
      },
    },
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row, null);
});

test("carries explicit application-period year to slash-form end date before stale stored date", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "[\uBAA8\uC9D1] 2026\uB144 \uB610\uB798\uBA58\uD1A0\uB9C1 '\uB180\uC27C\uCEA0\uD504' 2\uD68C\uCC28 \uCC38\uAC00\uC790 \uBAA8\uC9D1",
    sourceText:
      "\uC2E0\uCCAD\uAE30\uAC04 2026\uB144 8/26(\uC218) ~ 9/10(\uBAA9) \uCC38\uAC00\uC790 \uBAA8\uC9D1 \uC2E0\uCCAD\uBC29\uBC95 \uC628\uB77C\uC778 \uC811\uC218",
    applicationEndAt: "2023-09-10T00:00:00Z",
    fieldVerification: {
      dateQuality: {
        decision: "review",
        normalizedDeadline: "2023-09-10",
      },
    },
    createdAt: "2026-08-27T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-09-10");
  assert.deepEqual(row.value_json, { date: "2026-09-10" });
  assert.match(row.evidence_text, /2026\uB144 8\/26/);
});

test("prefers application deadline over later experience period", () => {
  const row = inferDeadlineDateEvidence({
    posterId: "poster-1",
    title: "[26\uB144 \uD558\uBC18\uAE30, \uC601\uC6D4] \uB2E4\uBB38\uD654\uAC00\uC871 \uC11C\uC6B8\uB18D\uC7A5 \uD504\uB85C\uADF8\uB7A8 9\uC6D4 2\uC8FC\uCC28",
    sourceText:
      "\uC811\uC218\uAE30\uAC04: 2026.08.20 ~ 2026.09.03 \uC811\uC218\uB294 2026.09.03\uAE4C\uC9C0\uC785\uB2C8\uB2E4. \uCCB4\uD5D8\uAE30\uAC04: 2026.09.12~2026.09.13",
    applicationEndAt: "2026-09-13T00:00:00Z",
    createdAt: "2026-08-25T00:00:00Z",
  });

  assert.equal(row.value_text, "2026-09-03");
  assert.match(row.evidence_text, /\uC811\uC218/);
});
