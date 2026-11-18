import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePosterQuality } from "./poster-quality-gate.js";
import { hasActiveQualityGateHold } from "./quality-gate-hold.js";
import { REVIEW_CLEANUP_HOLD_RULES, withReviewCleanupHold } from "./review-cleanup-hold.js";
import {
  REVIEW_IMAGE_CLEAR_RULES,
  clearedImageUrls,
  isClearedToTextNotice,
  planImageClear,
  withImageCleared,
} from "./review-image-clear.js";

const NOW = "2026-11-19T03:00:00.000Z";
const IMAGE = "https://example.supabase.co/storage/v1/object/public/poster-originals/crawler/banner.png";
const SUMMARY = "서울청년센터 성동에서 청년 대상 재무 상담 프로그램 참여자를 모집합니다. 신청기간 2026-11-20 ~ 2026-11-30, 대상 서울 거주 청년, 문의 02-123-4567";

function reviewRow(overrides = {}) {
  return {
    id: "p1",
    title: "서울청년센터 성동 <청년 재무상담> 참여자 모집",
    source_org_name: "서울청년센터 성동",
    summary_short: SUMMARY,
    summary_long: SUMMARY,
    thumbnail_url: IMAGE,
    source_key: "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75900",
    poster_images: [{ id: "img1", storage_path: IMAGE, image_type: "thumbnail", width: 1200, height: 300 }],
    field_verification: {
      posterImageOcr: {
        imageClassification: {
          isPoster: false,
          confidence: 0.92,
          visualType: "website banner",
          reason: "A wide decorative banner with the center logo, not a poster.",
          model: "gpt-5-mini",
          checkedAt: "2026-11-18T00:00:00.000Z",
        },
      },
    },
    ...overrides,
  };
}

function plan(row) {
  const { poster_images: _images, ...base } = row;
  const quality = evaluatePosterQuality({ ...base, images: row.thumbnail_url ? [row.thumbnail_url] : [] });
  const textQuality = evaluatePosterQuality({ ...base, thumbnail_url: null, images: [], contentMode: "text_notice" });
  return { quality, textQuality, plan: planImageClear(row, quality, textQuality) };
}

test("a banner as the only problem clears the image instead of holding the notice", () => {
  const row = reviewRow();
  const { quality, plan: result } = plan(row);
  assert.equal(quality.decision, "reject");
  assert.equal(result.action, "clear");
  assert.equal(result.imageUrl, IMAGE);
  assert.deepEqual(result.codes, ["image-not-poster"]);
});

test("the cleared record is reversible and the notice continues as a text notice in review", () => {
  const row = reviewRow();
  const { quality, plan: result } = plan(row);
  const fv = withImageCleared(row.field_verification, result, { now: NOW, runId: "77", removedPosterImages: row.poster_images, quality });
  assert.equal(fv.imageCleanup.rules, REVIEW_IMAGE_CLEAR_RULES);
  assert.equal(fv.imageCleanup.imageUrl, IMAGE);
  assert.equal(fv.imageCleanup.removedPosterImages[0].id, "img1");
  assert.equal(fv.imageCleanup.imageClassification.visualType, "website banner");
  assert.equal(fv.imageCleanup.reasons[0].code, "image-not-poster");
  assert.deepEqual(clearedImageUrls(fv), [IMAGE]);
  assert.equal(isClearedToTextNotice(fv), true);
  assert.ok(fv.qualityIssues.some((issue) => issue.code === "image-cleared-nonposter" && issue.decision === "review"));
  // Nothing approves it: the row as stored afterwards is a text notice the gate sends to review.
  const after = { ...row, thumbnail_url: null, poster_images: [], field_verification: fv };
  const gate = evaluatePosterQuality({ ...after, images: [] });
  assert.equal(gate.decision, "review");
  assert.ok(gate.issues.some((issue) => issue.code === "text-notice-no-image"));
  assert.ok(!gate.issues.some((issue) => issue.code === "missing-image"));
});

test("an earlier cleanup hold for the same image finding is released; other holds stay", () => {
  const row = reviewRow();
  const { quality, plan: result } = plan(row);
  const held = withReviewCleanupHold(row.field_verification, quality, { now: "2026-11-18T05:00:00.000Z" });
  assert.equal(held.qualityGateHold.rules, REVIEW_CLEANUP_HOLD_RULES);
  const fv = withImageCleared(held, result, { now: NOW, quality });
  assert.equal(fv.qualityGateHold, undefined);
  assert.equal(fv.imageCleanup.releasedHold.rules, REVIEW_CLEANUP_HOLD_RULES);

  const other = { ...row.field_verification, qualityGateHold: { rules: "quality-gate-hold-20261111", heldAt: "2026-11-18T00:00:00.000Z", reasons: [{ code: "field_correction" }] } };
  const kept = withImageCleared(other, result, { now: NOW, quality });
  assert.deepEqual(kept.qualityGateHold, other.qualityGateHold);
  assert.equal(hasActiveQualityGateHold({ poster_status: "review", published_at: null, field_verification: kept }), true);
});

test("other problems keep the whole notice on hold", () => {
  const row = reviewRow({ title: "주차장 이용 안내", summary_short: "주차장 이용 안내", summary_long: "주차장 이용 안내" });
  const { plan: result } = plan(row);
  assert.equal(result.action, "hold");
  assert.equal(result.reason, "other_problems");
});

test("an unsure classifier or a notice-document image is held for a person", () => {
  const unsure = reviewRow();
  unsure.field_verification.posterImageOcr.imageClassification.confidence = 0.7;
  assert.equal(plan(unsure).plan.reason, "classifier_unsure");

  const documentImage = reviewRow();
  Object.assign(documentImage.field_verification.posterImageOcr.imageClassification, {
    visualType: "public notice / administrative recruitment notice",
    reason: "A scanned official recruitment notice with tables and a seal.",
  });
  assert.equal(plan(documentImage).plan.reason, "notice_document_image");

  const cardNews = reviewRow();
  cardNews.field_verification.posterImageOcr.imageClassification.visualType = "a chart, table, infographic, or card-news graphic";
  assert.equal(plan(cardNews).plan.reason, "notice_document_image");
});

test("a person's review or a manual image check is never overridden", () => {
  const reviewed = reviewRow();
  reviewed.field_verification.sourceReview20261118 = { reviewer: "maxmini", reviewedAt: "2026-11-18T09:00:00.000Z" };
  assert.equal(plan(reviewed).plan.reason, "person_reviewed");

  const manual = reviewRow();
  manual.field_verification.posterImageOcr.imageClassification = { isPoster: false, source: "visual-inspection", reason: "checked by admin" };
  assert.equal(plan(manual).plan.reason, "manual_image_review");
});

test("another gallery image or no image keeps the hold", () => {
  const gallery = reviewRow({
    poster_images: [
      { id: "img1", storage_path: IMAGE },
      { id: "img2", storage_path: "https://example.supabase.co/storage/v1/object/public/poster-originals/crawler/poster.png" },
    ],
  });
  assert.equal(plan(gallery).plan.reason, "other_images");

  const noImage = reviewRow({ thumbnail_url: null, poster_images: [] });
  assert.equal(plan(noImage).plan.reason, "no_image");
});

test("a logo URL (rule-based bad-image-url) is cleared without a classifier", () => {
  const logo = "https://www.example.go.kr/images/common/logo.png";
  const row = reviewRow({ thumbnail_url: logo, poster_images: [{ id: "img9", storage_path: logo }], field_verification: {} });
  const { plan: result } = plan(row);
  assert.equal(result.action, "clear");
  assert.deepEqual(result.codes, ["bad-image-url"]);
});
