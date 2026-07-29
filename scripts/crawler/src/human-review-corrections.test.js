import test from "node:test";
import assert from "node:assert/strict";
import {
  HUMAN_REVIEW_TARGET_IDS,
  IMAGE_CORRECTIONS,
  REJECTION_CORRECTIONS,
  REVIEWED_NO_CHANGE,
  SOURCE_LINK_CORRECTIONS,
} from "./human-review-corrections.js";
import { isHardRejectedPosterImageUrl } from "./poster-image-rules.js";

test("human review correction manifest covers all reviewed issue rows", () => {
  assert.equal(HUMAN_REVIEW_TARGET_IDS.length, 20);
  assert.equal(SOURCE_LINK_CORRECTIONS.length, 10);
  assert.equal(IMAGE_CORRECTIONS.length, 7);
  assert.equal(REJECTION_CORRECTIONS.length, 1);
  assert.equal(REVIEWED_NO_CHANGE.length, 4);
});

test("source and application links are distinct and use expected hosts", () => {
  for (const item of SOURCE_LINK_CORRECTIONS) {
    assert.match(item.sourceUrl, /^https:\/\/youth\.seoul\.go\.kr\//);
    assert.notEqual(item.sourceUrl, item.applicationUrl);
    assert.ok(item.title);
    assert.ok(item.org);
  }
});

test("image corrections provide dimensions and explicit cleanup behavior", () => {
  for (const item of IMAGE_CORRECTIONS) {
    assert.ok(item.width >= 400);
    assert.ok(item.height >= 400);
    assert.equal(typeof item.removePreviousThumbnail, "boolean");
  }
});

test("KakaoTalk upload filenames are not mistaken for social media assets", () => {
  assert.equal(
    isHardRejectedPosterImageUrl(
      "https://example.com/images/KakaoTalk_20260722_184233144.png",
    ),
    false,
  );
  assert.equal(
    isHardRejectedPosterImageUrl(
      "https://example.com/images/ico-sns-kakao.png",
    ),
    true,
  );
  assert.equal(
    isHardRejectedPosterImageUrl("https://example.com/images/kakao.png"),
    true,
  );
});
