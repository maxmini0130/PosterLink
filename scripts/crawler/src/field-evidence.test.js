import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustConfidence,
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
