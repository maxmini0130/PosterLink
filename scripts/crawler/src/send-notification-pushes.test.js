import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPushPlans,
  summarizePushPlans,
} from "./send-notification-pushes.js";

test("buildPushPlans marks users with enabled push tokens as eligible", () => {
  const plans = buildPushPlans([
    {
      id: "notification-1",
      user_id: "user-1",
      type: "new_match",
      title: "새 포스터",
      body: "관심 조건과 맞는 공고입니다.",
      target_type: "poster",
      target_id: "poster-1",
    },
  ], new Map([
    ["user-1", { id: "user-1", is_notified: true, expo_push_token: "ExponentPushToken[ok]" }],
  ]));

  assert.equal(plans.length, 1);
  assert.equal(plans[0].eligible, true);
  assert.deepEqual(plans[0].blocked_reasons, []);
  assert.equal(plans[0].expo_push_token, "ExponentPushToken[ok]");
});

test("buildPushPlans blocks missing, opted-out, and tokenless profiles", () => {
  const plans = buildPushPlans([
    { id: "notification-1", user_id: "missing", type: "new_match" },
    { id: "notification-2", user_id: "off", type: "new_match" },
    { id: "notification-3", user_id: "tokenless", type: "favorite_deadline" },
  ], new Map([
    ["off", { id: "off", is_notified: false, expo_push_token: "ExponentPushToken[off]" }],
    ["tokenless", { id: "tokenless", is_notified: true, expo_push_token: null }],
  ]));

  assert.deepEqual(plans[0].blocked_reasons, ["missing_profile"]);
  assert.deepEqual(plans[1].blocked_reasons, ["notification_opted_out"]);
  assert.deepEqual(plans[2].blocked_reasons, ["missing_push_token"]);
});

test("summarizePushPlans counts eligible rows, types, and blocked reasons", () => {
  const summary = summarizePushPlans([
    { type: "new_match", eligible: true, blocked_reasons: [] },
    { type: "new_match", eligible: false, blocked_reasons: ["missing_push_token"] },
    { type: "favorite_deadline", eligible: false, blocked_reasons: ["notification_opted_out"] },
  ]);

  assert.deepEqual(summary, {
    checked_count: 3,
    eligible_count: 1,
    blocked_count: 2,
    by_type: {
      new_match: 2,
      favorite_deadline: 1,
    },
    blocked_reasons: {
      missing_push_token: 1,
      notification_opted_out: 1,
    },
  });
});
