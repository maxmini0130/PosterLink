import assert from "node:assert/strict";
import test from "node:test";

import { findPortalDeadline } from "./adapters/k-startup.js";

test("K-Startup: the 접수기간 field is the portal deadline, with its time", () => {
  const evidence = findPortalDeadline([
    { label: "지원대상", value: "예비창업자" },
    { label: "접수기간", value: "2026-10-27 ~ 2026-11-10 14:00" },
  ]);
  assert.equal(evidence.site, "k-startup");
  assert.equal(evidence.field, "접수기간");
  assert.equal(evidence.date, "2026-11-10");
  assert.equal(evidence.time, "14:00");
});

test("K-Startup: 신청방법 or a field without a date is not a deadline field", () => {
  assert.equal(
    findPortalDeadline([
      { label: "신청방법", value: "2026-11-10까지 이메일 접수" },
      { label: "접수기간", value: "예산 소진 시까지" },
    ]),
    null,
  );
});
