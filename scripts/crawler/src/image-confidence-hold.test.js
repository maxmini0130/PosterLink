import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActiveImageConfidenceHold,
  imageConfidenceState,
  planImageConfidenceHold,
  summarizeImageConfidence,
  withImageConfidenceHold,
} from "./image-confidence-hold.js";
import { planHolds } from "./hold-quality-gate-posters.js";

const cls = (value) => ({ posterImageOcr: { imageClassification: value } });
const poster = (id, fv, extra = {}) => ({
  id,
  title: `공고 ${id}`,
  poster_status: "published",
  thumbnail_url: `https://example.test/${id}.jpg`,
  published_at: "2026-10-23T00:00:00.000Z",
  field_verification: fv,
  ...extra,
});

test("이미지 판정 상태: 모델 점수, 없는 점수, 수동 검수", () => {
  assert.equal(
    imageConfidenceState(cls({ isPoster: true, confidence: 0.9, model: "gpt" }))
      .state,
    "ok",
  );
  assert.equal(
    imageConfidenceState(cls({ isPoster: true, confidence: 0.55 })).state,
    "ok",
  );
  assert.equal(
    imageConfidenceState(cls({ isPoster: true, confidence: 0.4, model: "gpt" }))
      .state,
    "low",
  );
  assert.equal(
    imageConfidenceState(cls({ isPoster: true, confidence: "0.3" })).state,
    "low",
  );
  // A missing score is unknown, never 0 and never passed.
  assert.equal(
    imageConfidenceState(cls({ isPoster: true, model: "gpt" })).state,
    "unscored",
  );
  assert.equal(
    imageConfidenceState(cls({ isPoster: true, confidence: null })).state,
    "unscored",
  );
  // 785ce221: written by a direct source review, not by a model.
  assert.equal(
    imageConfidenceState(
      cls({
        isPoster: true,
        source: "codex-visual-inspection",
        checkedAt: "2026-10-23T00:21:07.284Z",
      }),
    ).state,
    "manual",
  );
  assert.equal(imageConfidenceState({}).state, "none");
  assert.equal(
    imageConfidenceState({
      attachmentPosterRepair: { imageClassification: { confidence: 0.2 } },
    }).state,
    "low",
  );
});

test("보류 대상: 게시 중인 저신뢰·무점수만, 검수 대기·수동 검수는 제외", () => {
  const rows = [
    poster("low", cls({ confidence: 0.3, model: "gpt", checkedAt: "c1" })),
    poster("unscored", cls({ isPoster: true, model: "gpt" })),
    poster("ok", cls({ confidence: 0.92, model: "gpt" })),
    poster(
      "manual",
      cls({ isPoster: true, source: "codex-visual-inspection" }),
    ),
    poster("review", cls({ confidence: 0.2 }), { poster_status: "review" }),
    poster("noimage", cls({ confidence: 0.2 }), { thumbnail_url: null }),
  ];
  assert.deepEqual(
    planHolds(rows).map(({ row }) => row.id),
    ["low", "unscored"],
  );
  const summary = summarizeImageConfidence(rows);
  assert.equal(summary.public_needs_hold, 2);
  assert.equal(summary.manual, 1);
  assert.equal(summary.review_low_or_unscored, 1);
});

test("보류 기록과 사람의 재승인", () => {
  const row = poster(
    "low",
    cls({ confidence: 0.3, model: "gpt", checkedAt: "c1" }),
  );
  const plan = planImageConfidenceHold(row);
  const fv = withImageConfidenceHold(row.field_verification, plan, {
    now: "2026-11-12T01:00:00.000Z",
    runId: "42",
  });
  assert.equal(
    fv.posterImageOcr.imageClassification.confidence,
    0.3,
    "the image check is kept",
  );
  assert.equal(fv.imageConfidenceHold.reason, "low");
  assert.equal(fv.imageConfidenceHold.previousStatus, "published");
  assert.equal(fv.imageConfidenceHold.classificationCheckedAt, "c1");

  const held = { ...row, poster_status: "review", field_verification: fv };
  assert.equal(
    hasActiveImageConfidenceHold(held),
    true,
    "blocks automatic approval",
  );

  // A person approves it again: not held again for the same image check.
  const approved = {
    ...held,
    poster_status: "published",
    published_at: "2026-11-12T03:00:00.000Z",
  };
  assert.equal(hasActiveImageConfidenceHold(approved), false);
  assert.equal(planImageConfidenceHold(approved).reason, "released_by_person");
  assert.equal(summarizeImageConfidence([approved]).public_needs_hold, 0);

  // A new low image check after that is judged again.
  const recheck = {
    ...approved,
    field_verification: {
      ...approved.field_verification,
      posterImageOcr: {
        imageClassification: {
          confidence: 0.25,
          model: "gpt",
          checkedAt: "c2",
        },
      },
    },
  };
  assert.equal(planImageConfidenceHold(recheck).action, "hold");
});
