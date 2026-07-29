import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyVisitActor,
  detectVisitAutomation,
  getVisitActorLabel,
  getVisitAutomationLabel,
} from "./siteVisitClassification";

test("authenticated roles remain visible even in automated browsers", () => {
  const automation = detectVisitAutomation({
    userAgent: "Mozilla/5.0 HeadlessChrome/126",
    webdriver: true,
  });

  assert.equal(
    classifyVisitActor({ role: "super_admin", automation }),
    "admin",
  );
  assert.equal(getVisitActorLabel("admin", "super_admin"), "최고 관리자");
  assert.equal(automation.isAutomated, true);
});

test("webdriver visits are classified as automated browser checks", () => {
  const automation = detectVisitAutomation({
    userAgent: "Mozilla/5.0 Chrome/126",
    webdriver: true,
  });

  assert.deepEqual(automation, {
    isAutomated: true,
    isBot: false,
    source: "webdriver",
  });
  assert.equal(classifyVisitActor({ automation }), "automation");
  assert.equal(
    getVisitAutomationLabel(automation.source, automation.isBot),
    "자동 브라우저",
  );
});

test("explicit AI review source receives a specific label", () => {
  const automation = detectVisitAutomation({
    userAgent: "Mozilla/5.0 Chrome/126",
    explicitSource: "codex-ai-review",
  });

  assert.equal(classifyVisitActor({ automation }), "automation");
  assert.equal(
    getVisitAutomationLabel(automation.source, automation.isBot),
    "AI 검사",
  );
});

test("search bots stay separate from AI and human traffic", () => {
  const automation = detectVisitAutomation({
    userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
  });

  assert.equal(automation.isBot, true);
  assert.equal(classifyVisitActor({ automation }), "bot");
  assert.equal(
    getVisitAutomationLabel(automation.source, automation.isBot),
    "검색/서비스 봇",
  );
});

test("ordinary signed-in and anonymous visits remain human traffic", () => {
  const automation = detectVisitAutomation({
    userAgent: "Mozilla/5.0 Chrome/126",
  });

  assert.equal(classifyVisitActor({ role: "user", automation }), "member");
  assert.equal(classifyVisitActor({ automation }), "visitor");
  assert.equal(getVisitAutomationLabel(null), null);
});

test("stored privileged actor labels are ignored without a matching profile role", () => {
  const automation = detectVisitAutomation({
    userAgent: "Mozilla/5.0 Chrome/126",
  });

  assert.equal(
    classifyVisitActor({
      automation,
      storedActorType: "admin",
    }),
    "visitor",
  );
});
