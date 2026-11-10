import assert from "node:assert/strict";
import test from "node:test";

import {
  existingColumnsPatch,
  planBackfill,
  receptionVerifiedByRule,
  step1ByRule,
  step1Targets,
  toSeoulDate,
} from "./deadline-verification-backfill.js";
import { DEADLINE_VERIFICATION_OVERRIDES } from "./deadline-verification-overrides-20261110.js";

const today = "2026-11-10";
const row = (extra) => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "t",
  poster_status: "published",
  deadline_type: "fixed",
  start_at: null,
  end_at: "2026-11-19T14:59:59+00:00",
  ev_start: null,
  ev_end: null,
  ...extra,
});

test("a stored fixed date is kept as a confirmed date with no confirmed time", () => {
  const { values, rule } = step1ByRule(row(), today);
  assert.equal(rule, "legacy-date");
  assert.equal(values.deadline_status, "verified");
  assert.equal(values.deadline_source, "legacy");
  assert.equal(values.deadline_time_verified, false);
});

test("a deadline equal to the event date is not confirmed (SPEC 4.7)", () => {
  for (const extra of [
    { ev_start: "2026-11-19T10:00:00+09:00" },
    { ev_end: "2026-11-19T20:00:00+09:00" },
  ]) {
    const { values, rule } = step1ByRule(row(extra), today);
    assert.equal(rule, "auto-unverified-event-date");
    assert.equal(values.deadline_status, "unverified");
  }
});

test("reception is unconfirmed only for no dates or an ended open-ended event", () => {
  assert.equal(receptionVerifiedByRule(row(), today), true);
  assert.equal(receptionVerifiedByRule(row({ end_at: null }), today), false);
  assert.equal(
    receptionVerifiedByRule(
      row({
        deadline_type: "unknown",
        end_at: null,
        ev_end: "2026-10-23T18:00:00+09:00",
      }),
      today,
    ),
    false,
  );
  // A fixed poster with a later deadline stays confirmed even after its event.
  assert.equal(
    receptionVerifiedByRule(
      row({ ev_end: "2026-10-23T18:00:00+09:00" }),
      today,
    ),
    true,
  );
});

test("an override wins over the rule and a correction carries its own confirmation", () => {
  const id = "00000000-0000-4000-8000-000000000002";
  const [plan] = planBackfill(
    [row({ id, end_at: null })],
    [
      {
        id,
        why: "w",
        deadline_status: "verified",
        deadline_source: "poster",
        deadline_time_verified: true,
        correct: { application_end_at: "2026-11-10T09:00:00+09:00" },
      },
    ],
    today,
  );
  assert.equal(plan.rule, "override");
  // Not confirmed before the stored value is corrected.
  assert.equal(plan.step1.deadline_time_verified, false);
  assert.equal(plan.step1.deadline_status, "unverified");
  assert.equal(plan.step1.reception_verified, true);
  assert.deepEqual(plan.step2, {
    application_end_at: "2026-11-10T09:00:00+09:00",
    deadline_status: "verified",
    deadline_time_verified: true,
    deadline_source: "poster",
  });
});

test("step 1 skips rows that were already filled", () => {
  const plans = planBackfill([row(), row({ id: "x" })], [], today);
  const rows = new Map([
    [
      "00000000-0000-4000-8000-000000000001",
      { deadline_checked_at: "2026-11-11T00:00:00Z" },
    ],
    ["x", { deadline_checked_at: null }],
  ]);
  assert.deepEqual(
    step1Targets(plans, rows).map((plan) => plan.id),
    ["x"],
  );
});

test("overrides are well formed", () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ids = DEADLINE_VERIFICATION_OVERRIDES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of DEADLINE_VERIFICATION_OVERRIDES) {
    assert.match(item.id, uuid);
    assert.ok(item.why);
    // A verified time always names where it was read.
    if (item.deadline_time_verified)
      assert.ok(
        ["portal", "notice", "poster", "apply_page", "operator"].includes(
          item.deadline_source,
        ),
      );
    if (item.release_type)
      assert.ok(["per_session", "ongoing"].includes(item.release_type));
  }
  assert.equal(toSeoulDate("2026-11-19T14:59:59+00:00"), "2026-11-19");
});

test("posters collected after the A-1 cutoff are not given a legacy date", () => {
  const { values, rule } = step1ByRule(
    row({ created_at: "2026-11-10T03:00:00+00:00" }),
    today,
  );
  assert.equal(rule, "after-cutoff-unverified");
  assert.equal(values.deadline_status, "unverified");
  assert.equal(
    step1ByRule(row({ created_at: "2026-11-09T12:00:00+00:00" }), today).rule,
    "legacy-date",
  );
});

test("before the migration, step 2 writes only the deadline and event values", () => {
  const id = "00000000-0000-4000-8000-000000000003";
  const [plan] = planBackfill(
    [row({ id })],
    [
      {
        id,
        why: "w",
        deadline_status: "verified",
        deadline_source: "poster",
        deadline_time_verified: true,
        correct: {
          application_end_at: "2026-11-20T18:00:00+09:00",
          event_start_at: "2026-12-03T00:00:00+09:00",
        },
      },
    ],
    today,
  );
  const stored = {
    application_end_at: "2026-12-03T14:59:59+00:00",
    event_start_at: null,
  };
  assert.deepEqual(existingColumnsPatch(plan, stored), {
    application_end_at: "2026-11-20T18:00:00+09:00",
    event_start_at: "2026-12-03T00:00:00+09:00",
  });
  // Already corrected: nothing to write.
  assert.equal(
    existingColumnsPatch(plan, {
      application_end_at: "2026-11-20T09:00:00+00:00",
      event_start_at: "2026-12-02T15:00:00+00:00",
    }),
    null,
  );
});
