import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFieldReportEscalationPlans,
  groupFieldReports,
} from "./field-report-escalation.js";

test("groupFieldReports groups reports by poster and field", () => {
  const groups = groupFieldReports([
    { id: "r1", poster_id: "p1", field_key: "benefit", created_at: "2026-08-25T00:00:00Z", note: "wrong" },
    { id: "r2", poster_id: "p1", field_key: "benefit", created_at: "2026-08-25T01:00:00Z", note: "also wrong" },
    { id: "r3", poster_id: "p1", field_key: "cost", created_at: "2026-08-25T02:00:00Z" },
  ]);

  assert.equal(groups.length, 2);
  const benefit = groups.find((group) => group.field_key === "benefit");
  assert.equal(benefit.report_count, 2);
  assert.deepEqual(benefit.report_ids, ["r1", "r2"]);
  assert.equal(benefit.latest_reported_at, "2026-08-25T01:00:00Z");
});

test("buildFieldReportEscalationPlans only escalates fields over threshold", () => {
  const plans = buildFieldReportEscalationPlans({
    reports: [
      { id: "r1", poster_id: "p1", field_key: "benefit", created_at: "2026-08-25T00:00:00Z" },
      { id: "r2", poster_id: "p1", field_key: "benefit", created_at: "2026-08-25T01:00:00Z" },
      { id: "r3", poster_id: "p2", field_key: "region", created_at: "2026-08-25T02:00:00Z" },
    ],
    posters: [
      { id: "p1", title: "Poster 1", poster_status: "published" },
      { id: "p2", title: "Poster 2", poster_status: "published" },
    ],
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].poster_id, "p1");
  assert.equal(plans[0].field_key, "benefit");
  assert.equal(plans[0].should_move_to_review, true);
  assert.equal(plans[0].should_zero_evidence, true);
});

test("buildFieldReportEscalationPlans does not move already non-published posters", () => {
  const [plan] = buildFieldReportEscalationPlans({
    reports: [
      { id: "r1", poster_id: "p1", field_key: "benefit", created_at: "2026-08-25T00:00:00Z" },
      { id: "r2", poster_id: "p1", field_key: "benefit", created_at: "2026-08-25T01:00:00Z" },
    ],
    posters: [{ id: "p1", title: "Poster 1", poster_status: "review" }],
  });

  assert.equal(plan.should_move_to_review, false);
});
