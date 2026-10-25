import assert from "node:assert/strict";
import test from "node:test";
import {
  getPosterApplicationState,
  isPosterAcceptingApplications,
} from "./posterApplication";
import {
  posterListCounts,
  publicPosterQuery,
  countOpenPosters,
} from "./publicPosterRepository";
import { resolvePosterActionLinks } from "./posterActionLinks";
import { posterRegionDisplay } from "./posterRegionDisplay";
import type { SupabaseClient } from "@supabase/supabase-js";

test("default request clock crosses KST midnight with fake Date", (context) => {
  context.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-25T23:59:00+09:00"),
  });
  const input = { applicationEndAt: "2026-10-25", deadlineType: "fixed" };
  assert.equal(getPosterApplicationState(input).status, "due_today");
  context.mock.timers.tick(120_000);
  assert.equal(getPosterApplicationState(input).status, "closed");
});

test("KST midnight closes yesterday and changes tomorrow's D-day without a rebuild", () => {
  const input = { applicationEndAt: "2026-10-25", deadlineType: "fixed" };
  assert.equal(
    getPosterApplicationState({
      ...input,
      now: new Date("2026-10-25T23:59:00+09:00"),
    }).status,
    "due_today",
  );
  assert.equal(
    isPosterAcceptingApplications({
      ...input,
      now: new Date("2026-10-26T00:01:00+09:00"),
    }),
    false,
  );
  assert.equal(
    getPosterApplicationState({
      applicationEndAt: "2026-10-26",
      now: new Date("2026-10-25T23:59:00+09:00"),
    }).daysLeft,
    1,
  );
  assert.equal(
    getPosterApplicationState({
      applicationEndAt: "2026-10-26",
      now: new Date("2026-10-26T00:01:00+09:00"),
    }).daysLeft,
    0,
  );
  assert.equal(
    isPosterAcceptingApplications({ deadlineType: "unknown" }),
    false,
  );
  assert.equal(
    isPosterAcceptingApplications({
      deadlineType: "ongoing",
      posterStatus: "closed",
    }),
    false,
  );
});
test("explicit closing time is not extended to end of day", () => {
  assert.equal(
    isPosterAcceptingApplications({
      applicationEndAt: "2026-10-25T17:00:00+09:00",
      now: new Date("2026-10-25T17:01:00+09:00"),
    }),
    false,
  );
});
test("visible, loaded and not-yet-loaded counts are arithmetically consistent", () => {
  assert.deepEqual(posterListCounts(293, 240, 12), {
    visible: 12,
    loadedRemaining: 228,
    remaining: 281,
    unloaded: 53,
  });
  assert.equal(posterListCounts(3, 3, 12).visible, 3);
});
test("count uses exactly the same default RPC filters as discovery and fails on unavailable count", async () => {
  let actual: unknown;
  const client = {
    rpc: (name: string, args: unknown) => {
      assert.equal(name, "count_public_posters");
      actual = args;
      return Promise.resolve({ data: 293, error: null });
    },
  } as unknown as SupabaseClient;
  assert.equal(await countOpenPosters(client), 293);
  assert.deepEqual(actual, publicPosterQuery());
  await assert.rejects(
    countOpenPosters({
      rpc: () =>
        Promise.resolve({ data: null, error: { code: "unavailable" } }),
    } as unknown as SupabaseClient),
  );
});
test("closed notice exposes no application and a homepage never competes with the actual form", () => {
  const links = [
    {
      id: "form",
      url: "https://forms.gle/XmBDs3oQurtmkBBJ9",
      link_type: "official_apply",
      is_primary: true,
    },
    {
      id: "home",
      url: "https://startup.ssu.ac.kr/",
      link_type: "official_apply",
      is_primary: false,
    },
    {
      id: "notice",
      url: "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179117",
      link_type: "official_notice",
      is_primary: false,
    },
  ];
  assert.equal(resolvePosterActionLinks(links).primary?.id, "form");
  assert.equal(
    resolvePosterActionLinks(links).references.some(
      (link) => link.link_type === "official_apply",
    ),
    false,
  );
  assert.equal(
    resolvePosterActionLinks(links, null, true).primary?.id,
    "notice",
  );
  assert.equal(
    resolvePosterActionLinks(links, null, true).label,
    "공식 공고 보기",
  );
});
test("conflicting legacy region values become the same unconfirmed display without changing raw text", () => {
  const raw = "지역: 서울특별시\n지역\n서울특별시\n대상: 대학생";
  const display = posterRegionDisplay("전국", raw);
  assert.equal(display.label, "지역 확인 필요");
  assert.equal(display.summary.includes("서울특별시"), false);
  assert.equal(raw.includes("서울특별시"), true);
});
