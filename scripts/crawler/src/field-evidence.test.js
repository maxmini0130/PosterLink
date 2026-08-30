import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustConfidence,
  effectiveEvidenceConfidence,
  evidenceRowsFromReadableFacts,
  findEvidenceSentence,
  normalizeEvidenceRow,
} from "./field-evidence.js";

test("adjustConfidence caps missing evidence at 0.4", () => {
  assert.equal(adjustConfidence({ modelConfidence: 0.95, valueText: "만 18세" }), 0.4);
});

test("adjustConfidence penalizes values not present in evidence", () => {
  assert.equal(
    adjustConfidence({
      modelConfidence: 0.9,
      valueText: "만 39세",
      evidenceText: "신청 대상은 만 18세 청년입니다.",
    }),
    0.54,
  );
});

test("adjustConfidence accepts equivalent Korean date evidence", () => {
  assert.equal(
    adjustConfidence({
      fieldKey: "deadline_date",
      modelConfidence: 0.85,
      valueText: "2026-08-31",
      evidenceText: "신청기간 2026년 8월 1일부터 8월 31일까지",
      extractor: "regex-date-v1",
    }),
    1,
  );
});

test("adjustConfidence does not penalize deterministic deadline type enums", () => {
  assert.equal(
    adjustConfidence({
      fieldKey: "deadline_type",
      modelConfidence: 0.9,
      valueText: "fixed",
      evidenceText: "신청기간 2026년 8월 1일부터 8월 31일까지",
      extractor: "deadline-type-v1",
    }),
    0.9,
  );
});

test("adjustConfidence boosts regex extractors and corroborated fields", () => {
  assert.equal(
    adjustConfidence({
      modelConfidence: 0.75,
      valueText: "2026-08-31",
      evidenceText: "2026-08-31까지 신청",
      extractor: "regex-date-v1",
      corroboratedBy: ["ocr"],
    }),
    1,
  );
});

test("adjustConfidence penalizes conflicts and trusts human entries", () => {
  assert.equal(
    adjustConfidence({
      modelConfidence: 0.8,
      valueText: "서울",
      evidenceText: "서울 지원 대상",
      conflictsWith: ["ocr"],
    }),
    0.4,
  );
  assert.equal(
    adjustConfidence({
      modelConfidence: 0.1,
      valueText: "서울",
      evidenceText: "부산",
      extractor: "human",
    }),
      1,
  );
});

test("adjustConfidence treats short evidence as the upper confidence cap", () => {
  assert.equal(
    adjustConfidence({
      modelConfidence: 0.85,
      valueText: "지원 대상",
      evidenceText: "ok",
      extractor: "ocr",
    }),
    0.4,
  );
});

test("effectiveEvidenceConfidence caps audit deadline evidence", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_date",
      value_json: { date: "2026-08-31" },
      confidence: 0.95,
      evidence_text: "신청기간 2026년 8월 1일 ~ 8월 31일",
      extractor: "youth-seoul-application-period-audit-v1",
    }),
    0.65,
  );
});

test("effectiveEvidenceConfidence trusts positive human and golden corrections", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_type",
      value_json: { type: "fixed" },
      confidence: 0.6,
      evidence_text: "Phase 2 golden-set correction for deadline_type",
      extractor: "golden-correction-v1",
    }),
    1,
  );

  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_date",
      value_json: { date: "2026-08-31" },
      confidence: 0,
      evidence_text: "suppressed old correction",
      extractor: "golden-correction-v1",
    }),
    0,
  );
});

test("effectiveEvidenceConfidence caps ambiguous first-come deadline type", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_type",
      value_json: { type: "until_exhausted" },
      confidence: 0.95,
      evidence_text: "선착순 마감",
      extractor: "deadline-type-rule-v2",
    }),
    0.65,
  );
});

test("effectiveEvidenceConfidence caps regex dates without application cue", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_date",
      value_json: { date: "2026-08-31" },
      confidence: 0.95,
      evidence_text: "교육기간 2026년 8월 1일 ~ 8월 31일",
      extractor: "regex-date-v1",
    }),
    0.65,
  );
});

test("effectiveEvidenceConfidence caps event schedules presented as fixed deadlines", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_type",
      value_json: { type: "fixed" },
      confidence: 0.9,
      evidence_text: "\uC77C\uC2DC: 2026. 8. 26. 14:00~16:00 \uC7A5\uC18C: \uCCAD\uB144\uC13C\uD130 \uCC38\uC5EC\uC2E0\uCCAD \uB9C1\uD06C: https://example.com",
      extractor: "deadline-type-rule-v2",
    }),
    0.65,
  );

  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_date",
      value_json: { date: "2026-08-26" },
      confidence: 0.95,
      evidence_text: "\uC77C\uC2DC: 2026. 8. 26. 14:00~16:00 \uC7A5\uC18C: \uCCAD\uB144\uC13C\uD130 \uCC38\uC5EC\uC2E0\uCCAD \uB9C1\uD06C: https://example.com",
      extractor: "deadline-date-grounded-v1",
    }),
    0.65,
  );
});

test("effectiveEvidenceConfidence preserves explicit application deadline evidence", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_type",
      value_json: { type: "fixed" },
      confidence: 0.9,
      evidence_text: "\uC811\uC218\uAE30\uAC04: 2026. 8. 1. ~ 2026. 8. 31. \uC811\uC218\uB294 8\uC6D4 31\uC77C\uAE4C\uC9C0",
      extractor: "deadline-type-rule-v2",
    }),
    0.9,
  );
});

test("effectiveEvidenceConfidence trusts operator-reviewed fixed deadline types", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_type",
      value_json: { type: "fixed" },
      confidence: 0.9,
      evidence_text: "\uC0AC\uC6A9\uC790 \uC218\uB3D9 \uAC80\uC218: \uD3EC\uC2A4\uD130/\uC6D0\uBB38 \uB9C8\uAC10\uC77C 2026-09-04 \uD655\uC778",
      extractor: "operator-manual-review-v1",
    }),
    0.9,
  );
});

test("effectiveEvidenceConfidence does not treat 지금까지 as a deadline closing word", () => {
  assert.equal(
    effectiveEvidenceConfidence({
      field_key: "deadline_type",
      value_json: { type: "fixed" },
      confidence: 0.9,
      evidence_text: "\uD0C0\uB300\uC0DD \uC2E0\uCCAD \uAC00\uB2A5! \uC9C0\uAE08\uAE4C\uC9C0\uC758 \uACBD\uD5D8\uC744 \uC0B4\uB824\uBCF4\uC138\uC694. \uC2E0\uCCAD: \uAD6C\uAE00\uD3FC",
      extractor: "deadline-type-rule-v2",
    }),
    0.65,
  );
});

test("adjustConfidence handles corroborated evidence bonus with conflicts", () => {
  assert.equal(
    adjustConfidence({
      modelConfidence: 0.55,
      evidenceText: "서울시 공고 2026-08-31",
      valueText: "서울시",
      extractor: "ocr",
      corroboratedBy: ["openai", "body"],
      conflictsWith: ["ocr"],
    }),
    0.38,
  );
});

test("normalizeEvidenceRow canonicalizes known structured fields", () => {
  assert.deepEqual(
    normalizeEvidenceRow({
      posterId: "poster-1",
      fieldKey: "benefits_summary",
      valueText: "참여자당 50만원",
      evidenceText: "이수 시 참여자당 50만원 지급",
      evidenceSrc: "body",
      extractor: "readable-notice-v1",
      confidence: 0.8,
    }),
    {
      poster_id: "poster-1",
      field_key: "benefit",
      value_text: "참여자당 50만원",
      value_json: null,
      confidence: 0.8,
      evidence_text: "이수 시 참여자당 50만원 지급",
      evidence_src: "body",
      extractor: "readable-notice-v1",
    },
  );
});

test("normalizeEvidenceRow strips lone surrogate characters", () => {
  const row = normalizeEvidenceRow({
    posterId: "poster-1",
    fieldKey: "deadline_date",
    valueText: "2026-05-18",
    valueJson: { date: "2026-05-18" },
    evidenceText: "Apply by 2026-05-18 \ud83d",
    evidenceSrc: "body",
    extractor: "deadline-date-grounded-v1",
    confidence: 0.9,
  });

  assert.equal(row.evidence_text, "Apply by 2026-05-18");
});

test("normalizeEvidenceRow does not split surrogate pairs when truncating", () => {
  const prefix = "A".repeat(299);
  const row = normalizeEvidenceRow({
    posterId: "poster-1",
    fieldKey: "deadline_date",
    valueText: "2026-05-18",
    valueJson: { date: "2026-05-18" },
    evidenceText: `${prefix}🙂 trailing`,
    evidenceSrc: "body",
    extractor: "deadline-date-grounded-v1",
    confidence: 0.9,
  });

  assert.equal(row.evidence_text.length, 299);
  assert.equal(row.evidence_text, prefix);
});

test("readable facts become grounded evidence rows", () => {
  const rows = evidenceRowsFromReadableFacts({
    posterId: "poster-1",
    facts: {
      target: "만 18~34세",
      application: "구글폼 신청",
    },
    sourceText: "신청 대상은 만 18~34세입니다. 구글폼 신청으로 접수합니다.",
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].field_key, "target_desc");
  assert.equal(rows[0].evidence_text, "신청 대상은 만 18~34세입니다.");
  assert.equal(rows[1].field_key, "apply_method");
});

test("readable period facts become ISO deadline date only with application context", () => {
  const rows = evidenceRowsFromReadableFacts({
    posterId: "poster-1",
    facts: {
      period: "신청기간: 2026. 8. 18.(화) ~ 8. 27.(목) 자정까지",
      application: "이메일 신청",
    },
    sourceText: "신청기간: 2026. 8. 18.(화) ~ 8. 27.(목) 자정까지 이메일로 접수합니다.",
  });

  const deadline = rows.find((row) => row.field_key === "deadline_date");
  assert.equal(deadline.value_text, "2026-08-27");
  assert.deepEqual(deadline.value_json, { date: "2026-08-27" });
});

test("readable period facts carry explicit year to slash-form end date before stale stored text", () => {
  const rows = evidenceRowsFromReadableFacts({
    posterId: "poster-1",
    facts: {
      period: "\uC2E0\uCCAD\uAE30\uAC04 2026\uB144 8/26(\uC218) ~ 9/10(\uBAA9)",
      application: "\uC628\uB77C\uC778 \uC811\uC218",
    },
    sourceText:
      "\uD604\uC7AC \uC800\uC7A5 \uB9C8\uAC10\uC77C 2023-09-10. \uC2E0\uCCAD\uAE30\uAC04 2026\uB144 8/26(\uC218) ~ 9/10(\uBAA9) \uCC38\uAC00\uC790 \uBAA8\uC9D1",
  });

  const deadline = rows.find((row) => row.field_key === "deadline_date");
  assert.equal(deadline.value_text, "2026-09-10");
  assert.deepEqual(deadline.value_json, { date: "2026-09-10" });
});

test("readable period facts skip event or education periods without application context", () => {
  const rows = evidenceRowsFromReadableFacts({
    posterId: "poster-1",
    facts: {
      period: "2026.09.03.(목)~11.12.(목)",
      application: "구글폼 신청",
    },
    sourceText: "진행기간: 2026.09.03.(목)~11.12.(목) 매주 목요일 신청방법: 구글폼 신청",
  });

  assert.equal(rows.some((row) => row.field_key === "deadline_date"), false);
  assert.equal(rows.some((row) => row.field_key === "apply_method"), true);
});

test("findEvidenceSentence returns the matching source sentence", () => {
  assert.equal(
    findEvidenceSentence("첫 문장입니다. 이수 시 참여자당 50만원을 지급합니다.", "참여자당 50만원"),
    "이수 시 참여자당 50만원을 지급합니다.",
  );
});
