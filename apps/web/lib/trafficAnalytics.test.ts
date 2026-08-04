import assert from "node:assert/strict";
import test from "node:test";

import {
  getTrafficPeriodStart,
  isExternalHumanTraffic,
} from "./trafficAnalytics";

test("today starts at midnight in Asia/Seoul", () => {
  const now = new Date("2026-08-04T13:25:00.000Z");

  assert.equal(
    getTrafficPeriodStart(1, now),
    "2026-08-03T15:00:00.000Z",
  );
  assert.equal(
    getTrafficPeriodStart(7, now),
    "2026-07-28T15:00:00.000Z",
  );
});

test("public traffic excludes staff and every automated visit", () => {
  assert.equal(isExternalHumanTraffic("visitor", false), true);
  assert.equal(isExternalHumanTraffic("member", false), true);
  assert.equal(isExternalHumanTraffic("admin", false), false);
  assert.equal(isExternalHumanTraffic("operator", false), false);
  assert.equal(isExternalHumanTraffic("automation", true), false);
  assert.equal(isExternalHumanTraffic("bot", true), false);
  assert.equal(isExternalHumanTraffic("admin", true), false);
});
