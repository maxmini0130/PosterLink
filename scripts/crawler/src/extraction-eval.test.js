import assert from "node:assert/strict";
import test from "node:test";

import {
  bestEvidenceByField,
  evaluateGoldenSet,
  valuesMatch,
} from "./extraction-eval.js";

test("valuesMatch compares dates, numbers, URLs, and grounded text", () => {
  assert.equal(valuesMatch("deadline_date", "2026년 8월 31일", "2026-08-31"), true);
  assert.equal(valuesMatch("age_min", "만 18세", 18), true);
  assert.equal(valuesMatch("official_url", "https://posterlink.kr/", "https://posterlink.kr"), true);
  assert.equal(valuesMatch("benefit", "이수 시 참여수당 50만원 지급", "참여수당 50만원"), true);
  assert.equal(valuesMatch("benefit", "교육비 무료", "참여수당 50만원"), false);
});

test("bestEvidenceByField keeps the highest confidence evidence per field", () => {
  const best = bestEvidenceByField([
    { field_key: "deadline_date", confidence: 0.4, value_text: "2026-08-30" },
    { field_key: "deadline_date", confidence: 0.8, value_text: "2026-08-31" },
  ]);

  assert.equal(best.get("deadline_date").value_text, "2026-08-31");
});

test("evaluateGoldenSet reports field accuracy, precision, coverage, and thresholds", () => {
  const report = evaluateGoldenSet(
    [
      {
        poster_id: "poster-1",
        truth: {
          deadline_date: "2026-08-31",
          host_org: "서울청년센터",
          benefit: "참여수당 50만원",
        },
      },
      {
        poster_id: "poster-2",
        truth: {
          deadline_date: "2026-09-01",
          benefit: null,
        },
      },
    ],
    [
      {
        poster_id: "poster-1",
        field_key: "deadline_date",
        value_json: { date: "2026-08-31" },
        confidence: 0.95,
        evidence_text: "8월 31일까지",
        extractor: "regex-date-v1",
      },
      {
        poster_id: "poster-1",
        field_key: "host_org",
        value_text: "서울청년센터 동대문",
        confidence: 0.9,
        evidence_text: "서울청년센터 동대문",
        extractor: "field-verifier-v1",
      },
      {
        poster_id: "poster-1",
        field_key: "benefit",
        value_text: "참여수당 50만원",
        confidence: 0.7,
        evidence_text: "참여수당 50만원",
        extractor: "readable-notice-v1",
      },
      {
        poster_id: "poster-2",
        field_key: "deadline_date",
        value_json: { date: "2026-09-02" },
        confidence: 0.8,
        evidence_text: "9월 2일까지",
        extractor: "regex-date-v1",
      },
      {
        poster_id: "poster-2",
        field_key: "benefit",
        value_text: "무료 교육",
        confidence: 0.6,
        evidence_text: "무료 교육",
        extractor: "readable-notice-v1",
      },
    ],
  );

  assert.equal(report.labeled_posters, 2);
  assert.equal(report.labeled_field_count, 5);
  assert.equal(report.field_metrics.deadline_date.labeled, 2);
  assert.equal(report.field_metrics.deadline_date.correct, 1);
  assert.equal(report.field_metrics.deadline_date.thresholds["0.90"].precision, 1);
  assert.equal(report.field_metrics.deadline_date.thresholds["0.90"].coverage, 0.5);
  assert.equal(report.field_metrics.benefit.false_positive, 1);
  assert.equal(report.field_metrics.benefit.hallucination_rate, 0.5);
});
