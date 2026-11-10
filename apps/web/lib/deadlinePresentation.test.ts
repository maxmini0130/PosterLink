import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getDeadlinePresentation,
  type DeadlineInput,
} from "./deadlinePresentation";

/**
 * docs/design/v6.1/fixtures/deadline-cases.json (SPEC 10장 1단계), copied
 * next to the test because the handoff folder is not tracked. Input names in
 * the fixture are SPEC's suggestions; they map to the repository names here.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/deadline-cases.v6.1.json", import.meta.url),
    "utf8",
  ),
) as {
  cases: Array<{
    name: string;
    now: string;
    input: Record<string, unknown>;
    expected: Record<string, unknown>;
  }>;
};

const KIND: Record<string, string> = {
  fixed: "fixed",
  per_session: "per_session",
  until_full: "until_exhausted",
  rolling: "ongoing",
  unknown: "unknown",
};

function toInput(raw: Record<string, unknown>, now: string): DeadlineInput {
  const date = raw.date as string | undefined;
  const time = raw.time as string | null | undefined;
  return {
    deadlineType: KIND[String(raw.kind)],
    // Stored as posters.application_end_at: a date-only deadline is 23:59:59.
    applicationEndAt: date
      ? `${date}T${time ? `${time}:00` : "23:59:59"}+09:00`
      : null,
    deadlineStatus: raw.status as DeadlineInput["deadlineStatus"],
    deadlineTimeVerified: raw.time_verified as boolean | undefined,
    receptionVerified: raw.reception_verified as boolean | undefined,
    sessionRuleText: raw.session_rule_text as string | undefined,
    sessionRuleVerified: raw.session_rule_verified as boolean | undefined,
    lastSessionDeadlineDate: raw.last_session_deadline_date as
      | string
      | undefined,
    deadlineLabel: raw.label as string | undefined,
    applied: raw.applied as boolean | undefined,
    now: new Date(now),
  };
}

const FIELD: Record<string, string> = {
  state: "state",
  card: "card",
  row: "row",
  detail: "detail",
  detail_caption: "detailCaption",
  stamp: "stamp",
  dday: "dday",
  status_tag: "statusTag",
  alert: "homeAlert",
  push_alert: "pushAlert",
  tone: "tone",
};

for (const item of fixture.cases) {
  test(`fixture: ${item.name}`, () => {
    const result = getDeadlinePresentation(toInput(item.input, item.now));
    for (const [key, value] of Object.entries(item.expected)) {
      if (key === "must_not_contain") {
        for (const text of value as string[])
          for (const shown of [result.card, result.row, result.detail])
            assert.ok(!shown.includes(text), `"${shown}" shows "${text}"`);
        continue;
      }
      const field = FIELD[key];
      assert.ok(field, `unmapped expectation ${key}`);
      assert.deepEqual(
        result[field as keyof typeof result],
        value,
        `${item.name}: ${key}`,
      );
    }
  });
}

const at = (iso: string) => new Date(iso);

test("a stored 23:59:59 is a date-only deadline unless the time is verified", () => {
  const input = {
    deadlineType: "fixed",
    deadlineStatus: "verified" as const,
    applicationEndAt: "2026-11-15T14:59:59+00:00",
    receptionVerified: true,
    now: at("2026-11-09T10:00:00+09:00"),
  };
  // deadlineTimeVerified left out: the default is false.
  assert.equal(getDeadlinePresentation(input).state, "date_only");
  assert.equal(getDeadlinePresentation(input).card, "11.15(일)까지");
  const verified = getDeadlinePresentation({
    ...input,
    deadlineTimeVerified: true,
  });
  assert.equal(verified.card, "11.15(일) 23:59까지");
  assert.equal(verified.detail, "11.15(일) 밤 11시 59분까지");
});

test("hours read 오전, 낮, 오후, 밤 and a later year shows the year", () => {
  const show = (iso: string) =>
    getDeadlinePresentation({
      deadlineType: "fixed",
      deadlineStatus: "verified",
      deadlineTimeVerified: true,
      applicationEndAt: iso,
      receptionVerified: true,
      now: at("2026-11-09T10:00:00+09:00"),
    }).detail;
  assert.equal(show("2026-11-20T12:00:00+09:00"), "11.20(금) 낮 12시까지");
  assert.equal(
    show("2026-11-20T20:30:00+09:00"),
    "11.20(금) 오후 8시 30분까지",
  );
  assert.equal(show("2026-11-20T21:00:00+09:00"), "11.20(금) 밤 9시까지");
  assert.equal(show("2027-01-05T18:00:00+09:00"), "2027.1.5(화) 오후 6시까지");
});

test("a closed poster names the day reception ended only when it is known", () => {
  const base = {
    deadlineType: "fixed",
    deadlineStatus: "verified" as const,
    applicationEndAt: "2026-08-17T23:59:59+09:00",
    receptionVerified: true,
    now: at("2026-11-09T10:00:00+09:00"),
  };
  const ended = getDeadlinePresentation(base);
  assert.equal(ended.state, "closed");
  assert.equal(ended.row, "8.17 마감");
  assert.equal(ended.detail, "이 공고는 8월 17일에 접수가 끝났어요");
  // Closed by an operator before its deadline: no end day is claimed.
  const early = getDeadlinePresentation({
    ...base,
    applicationEndAt: "2026-12-11T23:59:59+09:00",
    posterStatus: "closed",
  });
  assert.equal(early.state, "closed");
  assert.equal(early.detail, "이 공고는 접수가 끝났어요");
  assert.equal(early.closedOn, null);
});

test("an unverified date in the past is not presented as open or closed", () => {
  const result = getDeadlinePresentation({
    deadlineType: "fixed",
    deadlineStatus: "unverified",
    applicationEndAt: "2026-11-01T23:59:59+09:00",
    receptionVerified: true,
    now: at("2026-11-09T10:00:00+09:00"),
  });
  assert.equal(result.state, "reception_unknown");
  assert.equal(result.stamp, null);
  assert.equal(result.homeAlert, false);
});

test("reception that starts later is 접수 예정, by the Seoul date", () => {
  const input = {
    deadlineType: "fixed",
    deadlineStatus: "verified" as const,
    applicationStartAt: "2026-11-10T00:00:00+00:00",
    applicationEndAt: "2026-11-20T23:59:59+09:00",
    receptionVerified: true,
  };
  assert.equal(
    getDeadlinePresentation({ ...input, now: at("2026-11-09T23:00:00+09:00") })
      .state,
    "scheduled",
  );
  // Start stored as UTC midnight (09:00 KST) still opens at 00:00 KST.
  assert.equal(
    getDeadlinePresentation({ ...input, now: at("2026-11-10T00:30:00+09:00") })
      .state,
    "date_only",
  );
});

test("a per-session last date is shown in the detail aside, never as the deadline", () => {
  const result = getDeadlinePresentation({
    deadlineType: "per_session",
    sessionRuleText: "각 클래스 전날까지 접수",
    sessionRuleVerified: true,
    lastSessionDeadlineDate: "2026-12-13",
    receptionVerified: true,
    now: at("2026-11-09T10:00:00+09:00"),
  });
  assert.equal(result.detailAside, "마지막 접수 12.13(일)");
  assert.equal(result.stamp, null);
  assert.equal(result.dday, null);
  const after = getDeadlinePresentation({
    deadlineType: "per_session",
    sessionRuleText: "각 클래스 전날까지 접수",
    sessionRuleVerified: true,
    lastSessionDeadlineDate: "2026-12-13",
    receptionVerified: true,
    now: at("2026-12-14T00:00:00+09:00"),
  });
  assert.equal(after.state, "closed");
});

test("a finished event closes posters whose deadline is not verified", () => {
  const result = getDeadlinePresentation({
    deadlineType: "ongoing",
    deadlineLabel: "상시 모집",
    eventEndAt: "2026-10-23T18:00:00+09:00",
    receptionVerified: true,
    now: at("2026-11-09T10:00:00+09:00"),
  });
  assert.equal(result.state, "closed");
});

test("conflicting sources explain why there is no D-day", () => {
  const result = getDeadlinePresentation({
    deadlineType: "fixed",
    deadlineStatus: "conflict",
    applicationEndAt: "2026-12-03T23:59:59+09:00",
    receptionVerified: true,
    now: at("2026-11-09T10:00:00+09:00"),
  });
  assert.equal(result.detail, "공고문에서 확인");
  assert.equal(
    result.detailCaption,
    "마감일이 서로 다르게 올라와 있어 확인하고 있어요. 확인 전에는 D-day와 마감 알림을 표시하지 않아요.",
  );
});

test("home and suggestions leave out posters that are over or probably over", () => {
  const now = at("2026-11-09T10:00:00+09:00");
  const pastUnverified = getDeadlinePresentation({
    deadlineType: "fixed",
    deadlineStatus: "unverified",
    applicationEndAt: "2026-11-01T23:59:59+09:00",
    receptionVerified: true,
    now,
  });
  assert.equal(pastUnverified.state, "reception_unknown");
  assert.equal(pastUnverified.showOnHome, false);
  assert.equal(pastUnverified.recommendable, false);

  const noDateUnknown = getDeadlinePresentation({
    deadlineType: "unknown",
    now,
  });
  assert.equal(noDateUnknown.state, "reception_unknown");
  assert.equal(noDateUnknown.showOnHome, true);
  assert.equal(noDateUnknown.recommendable, false);

  const open = getDeadlinePresentation({
    deadlineType: "fixed",
    deadlineStatus: "verified",
    applicationEndAt: "2026-11-20T23:59:59+09:00",
    receptionVerified: true,
    now,
  });
  assert.equal(open.showOnHome, true);
  assert.equal(open.recommendable, true);

  const over = getDeadlinePresentation({
    deadlineType: "fixed",
    deadlineStatus: "verified",
    applicationEndAt: "2026-11-01T23:59:59+09:00",
    now,
  });
  assert.equal(over.showOnHome, false);
  assert.equal(over.recommendable, false);
});

test("a verified 00:00 closed in the past names the day before", () => {
  const result = getDeadlinePresentation({
    deadlineType: "fixed",
    deadlineStatus: "verified",
    deadlineTimeVerified: true,
    applicationEndAt: "2026-08-18T00:00:00+09:00",
    now: at("2026-11-09T10:00:00+09:00"),
  });
  assert.equal(result.row, "8.17 마감");
  assert.equal(result.closedOn, "8월 17일");
});
