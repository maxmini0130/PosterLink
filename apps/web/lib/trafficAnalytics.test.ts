import assert from "node:assert/strict";
import test from "node:test";

import {
  getTrafficPeriodStart,
  getTrafficSourceLabel,
  isExternalHumanTraffic,
} from "./trafficAnalytics";
import {
  readTrafficTestBrowser,
  writeTrafficTestBrowser,
} from "./trafficTestBrowser";
import {
  detectVisitAutomation,
  getVisitAutomationLabel,
} from "./siteVisitClassification";

test("unknown and self referrals are not evidence of direct external entry", () => {
  const own = new Set(["posterlink.kr"]);
  const source = (
    referrer_host: string | null,
    utm_source: string | null = null,
  ) => getTrafficSourceLabel({ referrer_host, utm_source }, own);
  assert.equal(source(null), "출처 미확인");
  assert.equal(source("www.posterlink.kr"), "사이트 내부 이동");
  assert.equal(source("www.google.com"), "Google");
  assert.equal(source("m.naver.com"), "Naver");
  assert.equal(source("google.com.evil.test"), "google.com.evil.test");
  assert.equal(source("notgoogle.com"), "notgoogle.com");
  assert.equal(source("posterlink.kr", " pl_campaign "), "pl_campaign");
});

test("manual test browser flag persists independently of login and can be cleared", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  assert.equal(readTrafficTestBrowser(storage), false);
  writeTrafficTestBrowser(storage, true);
  assert.equal(readTrafficTestBrowser(storage), true);
  const detected = detectVisitAutomation({
    explicitSource: "manual-test",
    userAgent: "Mozilla/5.0 Chrome/126",
  });
  assert.equal(isExternalHumanTraffic("visitor", detected.isAutomated), false);
  assert.equal(getVisitAutomationLabel(detected.source), "내부 수동 테스트");
  writeTrafficTestBrowser(storage, false);
  assert.equal(readTrafficTestBrowser(storage), false);
});

test("today starts at midnight in Asia/Seoul", () => {
  const now = new Date("2026-08-04T13:25:00.000Z");

  assert.equal(getTrafficPeriodStart(1, now), "2026-08-03T15:00:00.000Z");
  assert.equal(getTrafficPeriodStart(7, now), "2026-07-28T15:00:00.000Z");
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
