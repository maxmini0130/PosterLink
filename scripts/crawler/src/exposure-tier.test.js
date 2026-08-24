import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTier,
  DEFAULT_EXTRACTION_THRESHOLDS,
} from "./exposure-tier.js";

function field(value, confidence = 1) {
  return { value_text: String(value), confidence };
}

function completeCritical(overrides = {}) {
  return {
    deadline_date: { value_json: { date: "2026-08-31" }, confidence: 0.95 },
    deadline_type: { value_json: { type: "fixed" }, confidence: 0.95 },
    host_org: field("서울청년센터", 0.95),
    official_url: { value_json: { url: "https://example.go.kr/notice/1" }, confidence: 0.95 },
    is_real_poster: { value_json: { value: true }, confidence: 0.95 },
    ...overrides,
  };
}

test("computeTier returns A when all critical fields pass and no blockers exist", () => {
  const result = computeTier({
    fields: {
      ...completeCritical(),
      category: field("교육", 0.9),
    },
    contentType: "recruit",
    isDuplicate: false,
    hasPosterImage: true,
  });

  assert.equal(result.tier, "A");
  assert.equal(result.gates.seo, true);
  assert.equal(result.gates.deadlineAlert, true);
  assert.equal(result.gates.calendar, true);
  assert.equal(result.gates.recommendation, true);
});

test("computeTier returns B when critical passes but a provided noncritical field is low confidence", () => {
  const result = computeTier({
    fields: {
      ...completeCritical(),
      benefit: field("참여수당 50만원", DEFAULT_EXTRACTION_THRESHOLDS.benefit - 0.01),
    },
    contentType: "recruit",
    isDuplicate: false,
    hasPosterImage: true,
  });

  assert.equal(result.tier, "B");
  assert.ok(result.reason.includes("field_low_confidence_benefit"));
  assert.equal(result.gates.seo, true);
});

test("computeTier returns C for missing critical evidence, duplicates, or non-recruit content", () => {
  assert.equal(
    computeTier({
      fields: completeCritical({ is_real_poster: undefined }),
      contentType: "recruit",
      isDuplicate: false,
      hasPosterImage: true,
    }).tier,
    "C",
  );

  assert.equal(
    computeTier({
      fields: completeCritical(),
      contentType: "recruit",
      isDuplicate: true,
      hasPosterImage: true,
    }).tier,
    "C",
  );

  assert.equal(
    computeTier({
      fields: completeCritical(),
      contentType: "admin",
      isDuplicate: false,
      hasPosterImage: true,
    }).tier,
    "C",
  );
});

test("deadline gates require fixed deadline type while SEO can still pass", () => {
  const result = computeTier({
    fields: completeCritical({
      deadline_type: { value_json: { type: "rolling" }, confidence: 0.95 },
    }),
    contentType: "recruit",
    isDuplicate: false,
    hasPosterImage: true,
  });

  assert.equal(result.tier, "A");
  assert.equal(result.gates.seo, true);
  assert.equal(result.gates.deadlineAlert, false);
  assert.equal(result.gates.calendar, false);
});

test("non-fixed deadline types do not require a deadline date", () => {
  const result = computeTier({
    fields: completeCritical({
      deadline_date: undefined,
      deadline_type: { value_json: { type: "until_exhausted" }, confidence: 0.95 },
    }),
    contentType: "recruit",
    isDuplicate: false,
    hasPosterImage: true,
  });

  assert.equal(result.tier, "A");
  assert.equal(result.reason.includes("critical_missing_deadline_date"), false);
  assert.equal(result.gates.deadlineAlert, false);
  assert.equal(result.gates.calendar, false);
});

test("missing deadline type still requires a deadline date", () => {
  const result = computeTier({
    fields: completeCritical({
      deadline_date: undefined,
      deadline_type: undefined,
    }),
    contentType: "recruit",
    isDuplicate: false,
    hasPosterImage: true,
  });

  assert.equal(result.tier, "C");
  assert.ok(result.reason.includes("critical_missing_deadline_date"));
  assert.ok(result.reason.includes("critical_missing_deadline_type"));
});
