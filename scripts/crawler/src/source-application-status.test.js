import assert from "node:assert/strict";
import test from "node:test";

import {
  blockingQualityIssueCodes,
  classifySourceApplicationLabel,
  planSourceApplicationStatusUpdate,
  shouldSkipNewClosedPost,
  sourceReviewIssuesOf,
} from "./source-application-status.js";

const NOW = new Date("2026-11-19T03:00:00.000Z");
const post = (state, label) => ({ sourceApplicationStatus: { state, label } });

test("button labels map to states; unknown text stays unknown", () => {
  assert.equal(classifySourceApplicationLabel("수강신청"), "open");
  assert.equal(classifySourceApplicationLabel(" 대기신청 "), "waitlist");
  assert.equal(classifySourceApplicationLabel("신청마감"), "closed");
  assert.equal(classifySourceApplicationLabel("접수마감"), "closed");
  assert.equal(classifySourceApplicationLabel("모집예정"), "upcoming");
  assert.equal(classifySourceApplicationLabel(""), "unknown");
  assert.equal(classifySourceApplicationLabel("상세보기"), "unknown");
});

test("a closed source never creates a new notice", () => {
  assert.equal(shouldSkipNewClosedPost(post("closed", "신청마감")), true);
  assert.equal(shouldSkipNewClosedPost(post("open", "수강신청")), false);
  assert.equal(shouldSkipNewClosedPost({}), false);
});

test("published poster closes when the source turns 신청마감 (compare-and-set on published)", () => {
  const existing = {
    id: "p1",
    poster_status: "published",
    field_verification: { sourceApplicationStatus: { state: "open", checkedAt: "2026-11-18T00:00:00.000Z" }, keep: 1 },
  };
  const plan = planSourceApplicationStatusUpdate(existing, post("closed", "신청마감"), { now: NOW });
  assert.equal(plan.action, "closed");
  assert.equal(plan.expectedStatus, "published");
  assert.equal(plan.updates.poster_status, "closed");
  assert.equal(plan.updates.field_verification.keep, 1);
  assert.deepEqual(
    {
      state: plan.updates.field_verification.sourceApplicationStatus.state,
      previousState: plan.updates.field_verification.sourceApplicationStatus.previousState,
      closedFromStatus: plan.updates.field_verification.sourceApplicationStatus.closedFromStatus,
      checkedAt: plan.updates.field_verification.sourceApplicationStatus.checkedAt,
    },
    { state: "closed", previousState: "open", closedFromStatus: "published", checkedAt: NOW.toISOString() },
  );
});

test("a review poster keeps its status and gets one blocking issue for the reviewer", () => {
  const existing = { id: "p2", poster_status: "review", field_verification: { qualityIssues: [{ code: "weak-summary" }] } };
  const plan = planSourceApplicationStatusUpdate(existing, post("closed", "신청마감"), { now: NOW });
  assert.equal(plan.action, "flagged_review");
  assert.equal(plan.updates.poster_status, undefined);
  assert.deepEqual(
    plan.updates.field_verification.qualityIssues.map((issue) => issue.code),
    ["weak-summary", "source-application-closed"],
  );
  assert.deepEqual(blockingQualityIssueCodes(plan.updates.field_verification), ["source-application-closed"]);
  // Running again does not add a second issue or rewrite the row.
  const again = planSourceApplicationStatusUpdate(
    { ...existing, field_verification: plan.updates.field_verification },
    post("closed", "신청마감"),
    { now: NOW },
  );
  assert.equal(again.action, "unchanged");
  assert.deepEqual(again.updates, {});
});

test("closed, rejected and unchanged records are left alone; reopening is recorded only", () => {
  for (const status of ["closed", "rejected", "draft"]) {
    const plan = planSourceApplicationStatusUpdate(
      { id: "p3", poster_status: status, field_verification: { sourceApplicationStatus: { state: "closed" } } },
      post("closed", "신청마감"),
      { now: NOW },
    );
    assert.deepEqual(plan.updates, {}, status);
  }
  const same = planSourceApplicationStatusUpdate(
    { id: "p4", poster_status: "published", field_verification: { sourceApplicationStatus: { state: "open" } } },
    post("open", "수강신청"),
    { now: NOW },
  );
  assert.equal(same.action, "unchanged");
  const reopened = planSourceApplicationStatusUpdate(
    { id: "p5", poster_status: "closed", field_verification: { sourceApplicationStatus: { state: "closed" } } },
    post("open", "수강신청"),
    { now: NOW },
  );
  assert.equal(reopened.action, "recorded");
  assert.equal(reopened.updates.poster_status, undefined);
  assert.equal(reopened.updates.field_verification.sourceApplicationStatus.state, "open");
  const waitlist = planSourceApplicationStatusUpdate(
    { id: "p6", poster_status: "published", field_verification: { sourceApplicationStatus: { state: "open" } } },
    post("waitlist", "대기신청"),
    { now: NOW },
  );
  assert.equal(waitlist.action, "recorded");
  assert.equal(waitlist.updates.poster_status, undefined);
});

test("posts from other adapters are not affected", () => {
  assert.deepEqual(planSourceApplicationStatusUpdate({ id: "p7", poster_status: "published" }, {}, { now: NOW }).updates, {});
  assert.deepEqual(sourceReviewIssuesOf({}), []);
});

test("adapter review issues: known codes only, once each, decision review", () => {
  const issues = sourceReviewIssuesOf({
    sourceReviewIssues: [
      { code: "eligibility-unconfirmed", reason: "대상 미확인" },
      { code: "eligibility-unconfirmed", reason: "dup" },
      { code: "made-up-code", reason: "x" },
      { code: "source-application-waitlist", reason: "대기" },
    ],
  });
  assert.deepEqual(issues.map((issue) => [issue.code, issue.decision]), [
    ["eligibility-unconfirmed", "review"],
    ["source-application-waitlist", "review"],
  ]);
  // Waitlist is informational; missing eligibility blocks AI auto-approval.
  assert.deepEqual(blockingQualityIssueCodes({ qualityIssues: issues }), ["eligibility-unconfirmed"]);
});
