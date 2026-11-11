import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActiveQualityGateHold,
  lastPersonReviewAt,
  planQualityGateHold,
  summarizeQualityGate,
  withQualityGateHold,
} from "./quality-gate-hold.js";
import { planHolds } from "./hold-quality-gate-posters.js";

const NONPOSTER_CLS = {
  model: "gpt-5-mini",
  isPoster: false,
  confidence: 0.93,
  reason: "scanned administrative notice",
  checkedAt: "2026-11-01T17:05:34.713Z",
};

const poster = (id, fv, extra = {}) => ({
  id,
  title: `합정동 제8통장 공개모집 공고 ${id}`,
  poster_status: "published",
  exposure_tier: null,
  thumbnail_url: `https://example.test/${id}.jpg`,
  source_key: `https://example.test/board/${id}`,
  source_org_name: "마포구 합정동 주민센터",
  summary_short: "모집 안내",
  summary_long: "자격, 접수기간, 문의처가 있는 모집 안내입니다.",
  application_end_at: "2026-11-10T14:59:59+00:00",
  created_at: "2026-11-01T00:00:00Z",
  published_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
  field_verification: fv,
  ...extra,
});

const codes = (plan) => plan.reasons.map((reason) => reason.code);

test("비포스터 이미지: 게시 중이면 보류, 검수 대기는 건드리지 않음", () => {
  const fv = { posterImageOcr: { imageClassification: NONPOSTER_CLS } };
  const plan = planQualityGateHold(poster("a", fv));
  assert.equal(plan.action, "hold");
  assert.ok(codes(plan).includes("public_nonposter"));

  const inReview = planQualityGateHold(poster("b", fv, { poster_status: "review" }));
  assert.equal(inReview.action, "skip");
  // Not public (exposure tier C): no public_nonposter finding.
  const tierC = planQualityGateHold(poster("c", fv, { exposure_tier: "C" }));
  assert.ok(!codes(tierC).includes("public_nonposter"));
});

test("사람 검수 기록이 판정 뒤에 있으면 보류하지 않고 따로 셈 (eaf45461)", () => {
  const fv = {
    posterImageOcr: { imageClassification: NONPOSTER_CLS },
    // 11/02 direct review as stored: no timestamp, the date is in the key.
    // It comes after the 11/01 17:05 UTC image check.
    sourceReview20261102: {
      approved: true,
      reviewer: "Codex direct image inspection",
      reason: "실제 모집 안내문",
    },
  };
  const plan = planQualityGateHold(poster("eaf45461", fv));
  assert.ok(!codes(plan).includes("public_nonposter"));
  assert.ok(
    plan.skipped.some((s) => s.code === "public_nonposter" && s.why === "person_reviewed"),
  );

  // A review older than the check does not cover it.
  const older = {
    posterImageOcr: { imageClassification: NONPOSTER_CLS },
    sourceReview20261030: { reviewer: "codex-ai-direct-source-review", todayKst: "2026-10-30" },
  };
  assert.ok(codes(planQualityGateHold(poster("x", older))).includes("public_nonposter"));
});

test("AI 검수 큐 기록은 사람 검수로 보지 않음", () => {
  assert.equal(
    lastPersonReviewAt({
      // The automatic queue also writes reviewer "codex"; the key decides.
      aiQueueReview: { reviewer: "codex", model: "gpt-4o-mini", reviewedAt: "2026-11-05T00:00:00Z" },
    }),
    null,
  );
  assert.equal(
    lastPersonReviewAt({
      directSourceReview: { reviewer: "codex", reviewedAt: "2026-11-05T00:00:00Z" },
    }),
    Date.parse("2026-11-05T00:00:00Z"),
  );
});

test("마감일 정정 후보: 보류, 사람이 다시 게시하면 같은 후보로는 다시 보류하지 않음", () => {
  const fv = {
    confidence: 0.92,
    checkedAt: "2026-11-03T00:00:00Z",
    deadlineMatches: false,
    correctedDeadline: "2026-11-20",
  };
  const row = poster("d", fv);
  const plan = planQualityGateHold(row);
  assert.ok(codes(plan).includes("field_correction"));

  const now = "2026-11-04T00:00:00.000Z";
  const held = {
    ...row,
    poster_status: "review",
    field_verification: withQualityGateHold(fv, plan, { now, runId: "1" }),
  };
  assert.equal(hasActiveQualityGateHold(held), true);
  assert.equal(held.field_verification.qualityGateHold.previousStatus, "published");

  // A person approves it again after the hold.
  const released = { ...held, poster_status: "published", published_at: "2026-11-05T00:00:00Z" };
  assert.equal(hasActiveQualityGateHold(released), false);
  const again = planQualityGateHold(released);
  assert.ok(!codes(again).includes("field_correction"));
  assert.ok(again.skipped.some((s) => s.code === "field_correction" && s.why === "released_by_person"));

  // A different correction later is judged again.
  const newer = {
    ...released,
    field_verification: { ...released.field_verification, correctedDeadline: "2026-11-25" },
  };
  assert.ok(codes(planQualityGateHold(newer)).includes("field_correction"));
});

test("이미지 저신뢰도 같은 보류에 포함되고 이미지 보류 기록도 남김", () => {
  const fv = {
    posterImageOcr: {
      imageClassification: {
        isPoster: true,
        confidence: 0.4,
        model: "gpt",
        checkedAt: "2026-11-03T00:00:00Z",
      },
    },
  };
  const row = poster("e", fv);
  const plan = planQualityGateHold(row);
  assert.deepEqual(codes(plan), ["image_low"]);
  const next = withQualityGateHold(fv, plan, { now: "2026-11-04T00:00:00Z" });
  assert.equal(next.imageConfidenceHold.reason, "low");
  assert.equal(next.qualityGateHold.reasons[0].code, "image_low");
});

test("요약: 사유별 보류 건수와 건너뛴 건수", () => {
  const ok = poster("ok", {
    posterImageOcr: {
      imageClassification: { isPoster: true, confidence: 0.9, model: "gpt", checkedAt: "2026-11-01T00:00:00Z" },
    },
  });
  const bad = poster("bad", { posterImageOcr: { imageClassification: NONPOSTER_CLS } });
  const summary = summarizeQualityGate([ok, bad]);
  assert.equal(summary.public_needs_hold, 1);
  assert.equal(summary.by_reason.public_nonposter, 1);
  assert.equal(planHolds([ok, bad]).length, 1);
});
