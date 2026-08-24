import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPosterDetectionEvidence,
  decidePosterDetection,
  extractPosterSignals,
  titleSimilarity,
} from "./poster-detection-signals.js";

test("titleSimilarity measures overlap against OCR/source text", () => {
  assert.equal(
    titleSimilarity("청년 커리어 패스 참여자 모집", "청년 커리어 패스 참여자 모집 신청기간 8월 31일까지"),
    1,
  );
  assert.equal(titleSimilarity("청년 커리어 패스", "주차 통제 안내"), 0);
});

test("extractPosterSignals computes geometry, text, and token signals", () => {
  const signals = extractPosterSignals({
    width: 800,
    height: 1200,
    title: "청년 커리어 패스",
    ocrText: "청년 커리어 패스 참여자 모집 신청기간 2026.8.1~8.31 문의 02-123-4567",
  });

  assert.equal(signals.aspectRatio, 1.5);
  assert.equal(signals.megapixels, 0.96);
  assert.equal(signals.hasDateToken, true);
  assert.equal(signals.hasContactToken, true);
  assert.ok(signals.textDensity > 40);
  assert.equal(signals.titleSimilarity, 1);
});

test("decidePosterDetection rejects tiny images and wide banners without VLM", () => {
  assert.deepEqual(
    decidePosterDetection({ megapixels: 0.01, aspectRatio: 1, textDensity: 100 }),
    {
      isRealPoster: false,
      confidence: 0.9,
      route: "reject",
      needsVlm: false,
      reasons: ["too_small"],
    },
  );

  assert.equal(
    decidePosterDetection({ megapixels: 0.4, aspectRatio: 0.3, textDensity: 100 }).route,
    "reject",
  );
});

test("low text density rejects only when OCR text exists", () => {
  assert.equal(
    decidePosterDetection({
      megapixels: 1,
      aspectRatio: 1.4,
      ocrTextLength: 0,
      textDensity: 0,
      titleSimilarity: 0.5,
      hasDateToken: true,
      hasContactToken: false,
    }).route,
    "needs_vlm",
  );

  assert.equal(
    decidePosterDetection({
      megapixels: 1,
      aspectRatio: 1.4,
      ocrTextLength: 5,
      textDensity: 5,
      titleSimilarity: 0.5,
      hasDateToken: true,
      hasContactToken: false,
    }).route,
    "reject",
  );
});

test("decidePosterDetection accepts strong rule signals or high-confidence classifier results", () => {
  assert.equal(
    decidePosterDetection({
      megapixels: 1,
      aspectRatio: 1.5,
      textDensity: 80,
      titleSimilarity: 0.5,
      hasDateToken: true,
      hasContactToken: false,
    }).route,
    "rule_accept",
  );

  const classifier = decidePosterDetection({
    megapixels: 0.5,
    aspectRatio: 0.8,
    textDensity: 15,
    titleSimilarity: 0,
    hasDateToken: false,
    hasContactToken: false,
    hasClassifierPoster: true,
    classifierConfidence: 0.91,
  });
  assert.equal(classifier.isRealPoster, true);
  assert.equal(classifier.confidence, 0.91);
});

test("ambiguous signals are routed to VLM and do not create evidence", () => {
  const decision = decidePosterDetection({
    megapixels: 0.5,
    aspectRatio: 0.9,
    textDensity: 20,
    titleSimilarity: 0.1,
    hasDateToken: false,
    hasContactToken: false,
  });

  assert.equal(decision.needsVlm, true);
  assert.equal(
    buildPosterDetectionEvidence({ posterId: "poster-1", decision, signals: {} }),
    null,
  );
});

test("buildPosterDetectionEvidence creates is_real_poster rows", () => {
  const row = buildPosterDetectionEvidence({
    posterId: "poster-1",
    signals: { aspectRatio: 1.5 },
    decision: {
      isRealPoster: true,
      confidence: 0.82,
      route: "rule_accept",
      reasons: ["poster_aspect_ratio", "text_dense"],
    },
  });

  assert.equal(row.field_key, "is_real_poster");
  assert.deepEqual(row.value_json.value, true);
  assert.equal(row.extractor, "poster-detection-signals-v1");
});
