import assert from "node:assert/strict";
import test from "node:test";

import { planPosterBackfill } from "./plan-deadline-fact-backfill.js";

test("backfill plan re-reads unsupported open-ended types and fills stated facts only", () => {
  const goesan = planPosterBackfill({
    title: "[괴산서울농장] 수확행-표고편 (261024)",
    summary_long:
      "신청기간: 2026. 10. 12.(월) 10:00~\n여행기간: 2026. 10. 24.(토)~10. 25.(일)\n참가인원: 서울시민 20명",
    deadline_type: "until_exhausted",
    application_end_at: null,
    eligibility_summary: null,
    recruitment_count: null,
  });
  assert.deepEqual(goesan.changes, {
    deadline_type: "unknown",
    eligibility_summary: "서울시민",
    recruitment_count: "20명",
  });

  // Stated wording and filled fields are left alone.
  assert.equal(
    planPosterBackfill({
      title: "독서회",
      summary_long: "선착순 10명 모집",
      deadline_type: "until_exhausted",
      eligibility_summary: "누구나",
      recruitment_count: "10명",
    }),
    null,
  );
  // A fixed type is never touched by this plan.
  assert.equal(
    planPosterBackfill({
      title: "강좌",
      summary_long: "",
      deadline_type: "fixed",
      application_end_at: "2026-11-20T14:59:59Z",
      eligibility_summary: "청년",
      recruitment_count: "5명",
    }),
    null,
  );
});
