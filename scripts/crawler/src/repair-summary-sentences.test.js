import assert from "node:assert/strict";
import test from "node:test";

import { planRollback, planTextFix } from "./repair-summary-sentences.js";
import {
  DATE_ONLY_REPAIR_CHANGES,
  DATE_ONLY_REPAIR_KEEP,
  SUMMARY_TEXT_FIXES,
} from "./date-only-deadline-manifest-20261110.js";

const fix = {
  id: "00000000-0000-4000-8000-000000000001",
  from: "신청 종료는 포털 기준 11월 12일 00시입니다",
  to: "신청은 11월 12일(목)까지입니다",
};
const row = {
  id: fix.id,
  title: "t",
  updated_at: "2026-11-10T01:00:00+00:00",
  summary_short: "특강입니다. 신청 종료는 포털 기준 11월 12일 00시입니다.",
  summary_long:
    "노트북 필요. 신청 종료는 포털 기준 11월 12일 00시입니다.\n자세한 내용",
  application_method: "tally 신청",
  field_verification: {
    keep: 1,
    readableNotice: {
      facts: {
        period: "진행. 신청 종료는 포털 기준 11월 12일 00시입니다.",
        target: "청년",
      },
    },
  },
};

test("replaces the sentence in every field that has it", () => {
  const plan = planTextFix(row, fix);
  assert.equal(plan.action, "update");
  assert.deepEqual(plan.fields, [
    "summary_short",
    "summary_long",
    "field_verification",
  ]);
  assert.equal(
    plan.after.summary_short,
    "특강입니다. 신청은 11월 12일(목)까지입니다.",
  );
  assert.equal(
    plan.after.field_verification.readableNotice.facts.period,
    "진행. 신청은 11월 12일(목)까지입니다.",
  );
  assert.equal(plan.after.field_verification.keep, 1);
  assert.equal(
    plan.after.field_verification.readableNotice.facts.target,
    "청년",
  );
  // The read row is not modified.
  assert.match(row.field_verification.readableNotice.facts.period, /00시/);
  assert.equal(plan.before.summary_long, row.summary_long);
});

test("a second run finds nothing to do", () => {
  const plan = planTextFix(row, fix);
  const fixed = { ...row, ...plan.after };
  assert.equal(planTextFix(fixed, fix).action, "already");
});

test("reports a missing row and a sentence that is not there", () => {
  assert.equal(planTextFix(undefined, fix).action, "missing");
  assert.equal(
    planTextFix(
      { ...row, summary_short: "", summary_long: "", field_verification: {} },
      fix,
    ).action,
    "text-not-found",
  );
});

test("rollback restores only rows still holding the repaired text", () => {
  const plan = planTextFix(row, fix);
  const repaired = {
    ...row,
    ...plan.after,
    updated_at: "2026-11-10T02:00:00+00:00",
  };
  const restore = planRollback(repaired, plan);
  assert.equal(restore.action, "restore");
  assert.equal(restore.updatedAt, "2026-11-10T02:00:00+00:00");
  const edited = { ...repaired, summary_long: "운영자가 다시 고침" };
  assert.equal(planRollback(edited, plan).action, "changed-since-repair");
});

test("text fixes point at posters in the deadline manifest", () => {
  const ids = new Set(
    [...DATE_ONLY_REPAIR_CHANGES, ...DATE_ONLY_REPAIR_KEEP].map(
      (row) => row.id,
    ),
  );
  for (const item of SUMMARY_TEXT_FIXES) assert.ok(ids.has(item.id), item.id);
});
