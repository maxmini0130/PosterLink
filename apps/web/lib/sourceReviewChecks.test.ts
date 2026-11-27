import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRevertPlan,
  confirmedRecord,
  highRisks,
  riskLabel,
  type SourceReviewRecord,
} from "./sourceReviewChecks";

const actor = { id: "admin-1", at: "2026-11-27T06:00:00.000Z" };

function record(
  overrides: Partial<SourceReviewRecord> = {},
): SourceReviewRecord {
  return {
    version: "source-review-v1",
    model: "gpt-5",
    runId: "gh-1",
    reviewedAt: "2026-11-27T05:00:00.000Z",
    decision: "published",
    confidence: 0.9,
    reason: "원문 확인",
    risks: [
      { code: "deadline-unverified", detail: "마감 미확인", level: "high" },
      { code: "organizer-changed", detail: "a → b", level: "low" },
    ],
    needsPostCheck: true,
    postCheck: { status: "pending" },
    previous: {
      poster: {
        title: "old title",
        organizer_name: "기타 (구청)",
        application_end_at: null,
        poster_status: "review",
        published_at: null,
        rejection_reason: null,
        deadline_status: "unverified",
      },
      removedLinks: [
        {
          id: "l-old",
          poster_id: "p",
          url: "https://other/program",
          title: "다른 공고",
          link_type: "official_notice",
          is_primary: false,
        },
      ],
      patchedLinks: [
        { id: "l1", previous: { is_primary: true, title: "원문" } },
        { id: "l2", previous: { is_primary: false } },
      ],
      removedImages: [
        {
          id: "i-logo",
          poster_id: "p",
          storage_path: "https://img/logo.png",
          image_type: "original",
        },
      ],
      categories: ["cat-a", "cat-b"],
      audiences: ["youth"],
    },
    addedLinkIds: ["l-new"],
    ...overrides,
  };
}

const current = {
  poster_categories: [{ category_id: "cat-b" }, { category_id: "cat-c" }],
  poster_audiences: [{ audience_id: "child" }],
  poster_links: [
    { id: "l1", url: "https://notice", is_primary: false },
    { id: "l2", url: "https://apply", is_primary: true },
    { id: "l-new", url: "https://blog", is_primary: false },
  ],
  poster_images: [{ id: "i1", storage_path: "https://img/poster.jpg" }],
  field_verification: { readableNotice: { summaryShort: "new" } },
};

test("revert restores fields and relations and returns the poster to review", () => {
  const plan = buildRevertPlan(record(), current, actor);
  assert.equal(plan.posterUpdate.poster_status, "review");
  assert.equal(plan.posterUpdate.published_at, null);
  assert.equal(plan.posterUpdate.title, "old title");
  assert.equal(plan.posterUpdate.organizer_name, "기타 (구청)");
  assert.deepEqual(plan.deleteLinkIds, ["l-new"]);
  assert.deepEqual(plan.insertLinks, [
    {
      id: "l-old",
      url: "https://other/program",
      title: "다른 공고",
      link_type: "official_notice",
      is_primary: false,
    },
  ]);
  assert.deepEqual(plan.insertImages, [
    {
      id: "i-logo",
      storage_path: "https://img/logo.png",
      image_type: "original",
    },
  ]);
  assert.deepEqual(plan.deleteCategoryIds, ["cat-c"]);
  assert.deepEqual(plan.insertCategoryIds, ["cat-a"]);
  assert.deepEqual(plan.deleteAudienceIds, ["child"]);
  assert.deepEqual(plan.insertAudienceIds, ["youth"]);
});

test("revert demotes before it restores the primary link", () => {
  const plan = buildRevertPlan(record(), current, actor);
  assert.deepEqual(
    plan.linkUpdates.map((u) => u.id),
    ["l2", "l1"],
  );
});

test("revert keeps the review record and marks it reverted", () => {
  const plan = buildRevertPlan(record(), current, actor);
  const fv = plan.posterUpdate.field_verification as Record<string, any>;
  assert.equal(
    fv.readableNotice.summaryShort,
    "new",
    "other verification keys are kept",
  );
  assert.deepEqual(fv.sourceReviewAuto.postCheck, {
    status: "reverted",
    by: "admin-1",
    at: actor.at,
  });
  assert.equal(fv.sourceReviewAuto.previous.poster.title, "old title");
});

test("revert skips rows that are already gone or already back", () => {
  const plan = buildRevertPlan(
    record({ addedLinkIds: ["missing"] }),
    {
      ...current,
      poster_links: [
        ...current.poster_links,
        { id: "l-old", url: "https://other/program" },
      ],
    },
    actor,
  );
  assert.deepEqual(plan.deleteLinkIds, []);
  assert.deepEqual(plan.insertLinks, []);
});

test("confirming records who checked it", () => {
  assert.deepEqual(confirmedRecord(record(), actor, "원문 재확인").postCheck, {
    status: "confirmed",
    by: "admin-1",
    at: actor.at,
    note: "원문 재확인",
  });
});

test("only high risks are listed and codes have Korean labels", () => {
  assert.deepEqual(
    highRisks(record()).map((r) => r.code),
    ["deadline-unverified"],
  );
  assert.equal(riskLabel("rejected"), "반려");
  assert.equal(riskLabel("unknown-code"), "unknown-code");
});
