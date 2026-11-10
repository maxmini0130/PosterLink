import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeLayout,
  kstWeekMonday,
  kstWeekend,
  type HomePoster,
} from "./homeFeed";

// Tuesday 2026-11-03 12:00 KST.
const NOW = new Date("2026-11-03T03:00:00Z");
const DAY = 86400000;

let seq = 0;
function poster(overrides: Partial<HomePoster> = {}): HomePoster {
  seq += 1;
  const id = overrides.id ?? `p${String(seq).padStart(3, "0")}`;
  return {
    id,
    publishedAt: NOW.getTime() - seq * 3600000,
    regionIds: ["seoul"],
    categoryIds: [],
    interestCode: "CAT_EDUCATION",
    application: {
      applicationStartAt: "2026-10-01T00:00:00Z",
      applicationEndAt: "2026-11-30T14:59:00Z",
      deadlineType: "fixed",
      posterStatus: "published",
    },
    schedule: {},
    hasBenefit: false,
    popularity: 0,
    youth: false,
    organizerKey: null,
    card: {
      id,
      title: id,
      image: "https://x.supabase.co/storage/v1/object/public/a.jpg",
    },
    ...overrides,
  };
}

const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

function allIds(layout: ReturnType<typeof buildHomeLayout>) {
  return [
    ...ids(layout.picks),
    ...ids(layout.deadline),
    ...layout.pages.flatMap((blocks) =>
      blocks.flatMap((block) =>
        block.kind === "orgs" ? [] : ids(block.items),
      ),
    ),
  ];
}

test("KST week helpers", () => {
  assert.equal(kstWeekMonday(NOW), "2026-11-02");
  // Sunday 23:30 KST still belongs to the week starting the previous Monday.
  assert.equal(kstWeekMonday(new Date("2026-11-08T14:30:00Z")), "2026-11-02");
  assert.deepEqual(kstWeekend(NOW), { sat: "2026-11-07", sun: "2026-11-08" });
});

test("a poster shows once; picks then deadline then new", () => {
  const list = [
    ...Array.from({ length: 4 }, () =>
      poster({ hasBenefit: true, cardFactsStatus: "verified", popularity: 5 }),
    ),
    // v6.1: only confirmed dates count as "7일 안에 마감".
    ...Array.from({ length: 5 }, (_, i) => {
      const id = `due-${i}`;
      return poster({
        id,
        application: {
          applicationStartAt: "2026-10-01T00:00:00Z",
          applicationEndAt: new Date(
            NOW.getTime() + (i + 1) * DAY,
          ).toISOString(),
          deadlineType: "fixed",
          posterStatus: "published",
        },
        card: {
          id,
          title: id,
          image: "https://x.supabase.co/storage/v1/object/public/a.jpg",
          deadlineVerification: {
            deadlineStatus: "verified",
            receptionVerified: true,
          },
        },
      });
    }),
    ...Array.from({ length: 30 }, () => poster()),
  ];
  const layout = buildHomeLayout({ posters: list, now: NOW, pageCount: 3 });
  assert.equal(layout.picks.length, 4);
  assert.equal(layout.deadline.length, 5);
  assert.equal(layout.deadlineTotal, 5);
  const shown = allIds(layout);
  assert.equal(new Set(shown).size, shown.length);
  assert.equal(shown.length, list.length);
  assert.equal(layout.pages[0][0].kind, "new");
  assert.equal(
    layout.pages[0][0].kind === "new" && layout.pages[0][0].items.length,
    12,
  );
  assert.equal(layout.hasMore, false);
});

test("sections under 3 posters are hidden, and their posters flow on", () => {
  const list = [
    poster({ hasBenefit: true, cardFactsStatus: "verified" }),
    poster({ hasBenefit: true, cardFactsStatus: "needs_review" }),
    ...Array.from({ length: 3 }, () => poster()),
  ];
  const layout = buildHomeLayout({ posters: list, now: NOW });
  assert.deepEqual(layout.picks, []);
  assert.deepEqual(layout.deadline, []);
  const first = layout.pages[0][0];
  assert.equal(first.kind === "new" && first.items.length, 5);
});

test("operator picks of this week come first; unverified benefits never auto-fill", () => {
  const list = [
    poster({ id: "old-pick", featuredWeek: "2026-10-26" }),
    poster({ id: "pick-a", featuredWeek: "2026-11-02" }),
    poster({ id: "pick-b", featuredWeek: "2026-11-02" }),
    poster({ id: "auto", hasBenefit: true, cardFactsStatus: "verified" }),
    poster({
      id: "review",
      hasBenefit: true,
      cardFactsStatus: "needs_review",
      popularity: 99,
    }),
  ];
  const layout = buildHomeLayout({ posters: list, now: NOW });
  assert.deepEqual(ids(layout.picks), ["pick-a", "pick-b", "auto"]);
});

test("closed posters and posters whose event already took place are left out", () => {
  const list = [
    poster({
      id: "ended",
      schedule: {
        eventStartAt: "2026-10-20T01:00:00Z",
        eventEndAt: "2026-11-01T09:00:00Z",
      },
    }),
    poster({
      id: "closed",
      application: {
        applicationStartAt: "2026-09-01T00:00:00Z",
        applicationEndAt: "2026-10-01T00:00:00Z",
        deadlineType: "fixed",
        posterStatus: "published",
      },
    }),
    poster({ id: "ok" }),
  ];
  const layout = buildHomeLayout({ posters: list, now: NOW });
  assert.deepEqual(allIds(layout), ["ok"]);
  assert.equal(layout.openTotal, 1);
});

test("v6.1 without upper rows: picks are not used up, every poster is in the feed", () => {
  const list = [
    ...Array.from({ length: 4 }, () =>
      poster({ hasBenefit: true, cardFactsStatus: "verified", popularity: 5 }),
    ),
    ...Array.from({ length: 3 }, () => poster()),
  ];
  const layout = buildHomeLayout({ posters: list, now: NOW, upperRows: false });
  assert.deepEqual(layout.picks, []);
  assert.deepEqual(layout.deadline, []);
  assert.equal(allIds(layout).length, list.length);
});

test("v6.1 chips: counts in the chosen region, and a chip narrows the feed", () => {
  const list = [
    ...Array.from({ length: 6 }, () =>
      poster({ contentCodes: ["CAT_COURSE"], regionIds: ["mapo"] }),
    ),
    poster({
      id: "job",
      contentCodes: ["CAT_RECRUITMENT"],
      regionIds: ["mapo"],
    }),
    poster({
      id: "far-job",
      contentCodes: ["CAT_RECRUITMENT"],
      regionIds: ["gangnam"],
    }),
  ];
  const conditions = {
    regionScope: new Set(["mapo"]),
    categoryScope: new Set<string>(),
  };
  const all = buildHomeLayout({ posters: list, now: NOW, conditions });
  assert.equal(all.chipCounts.education, 6);
  assert.equal(all.chipCounts.jobs, 1);
  assert.equal(all.openTotal, 7);
  const jobs = buildHomeLayout({
    posters: list,
    now: NOW,
    conditions,
    chip: "jobs",
  });
  const first = jobs.pages[0][0];
  // The chip keeps condition-first order: the chosen region's job first.
  assert.deepEqual(first.kind === "new" && ids(first.items), [
    "job",
    "far-job",
  ]);
  assert.equal(jobs.chip, "jobs");
});

test("v6.1 '지난 방문 이후': only posters published after the last visit", () => {
  const since = NOW.getTime() - 2.5 * 3600000;
  const list = [
    poster({ id: "new-1" }),
    poster({ id: "new-2" }),
    poster({ id: "old" }),
  ];
  // publishedAt: NOW - seq hours; seq continues from earlier tests, so pin them.
  list[0].publishedAt = NOW.getTime() - 3600000;
  list[1].publishedAt = NOW.getTime() - 2 * 3600000;
  list[2].publishedAt = NOW.getTime() - 3 * 3600000;
  const layout = buildHomeLayout({
    posters: list,
    now: NOW,
    since,
    onlySince: true,
  });
  const first = layout.pages[0][0];
  assert.deepEqual(first.kind === "new" && ids(first.items), [
    "new-1",
    "new-2",
  ]);
  assert.equal(layout.freshSince, 2);
  assert.equal(layout.onlySince, true);
  // Without a baseline (first visit) the filter is off.
  assert.equal(
    buildHomeLayout({ posters: list, now: NOW, onlySince: true }).onlySince,
    false,
  );
});

test("bundles: weekend free needs a verified free benefit and a weekend day", () => {
  const weekend = (
    id: string,
    start: string,
    extra: Partial<HomePoster> = {},
  ) =>
    poster({
      id,
      benefitKind: "free",
      cardFactsStatus: "verified",
      hasBenefit: true,
      schedule: { eventStartAt: start },
      publishedAt: 0,
      ...extra,
    });
  const list = [
    ...Array.from({ length: 12 }, () => poster()),
    weekend("sat", "2026-11-07T02:00:00Z"),
    weekend("sun", "2026-11-08T05:00:00Z"),
    weekend("sat-late", "2026-11-07T14:30:00Z"), // Sat 23:30 KST
    weekend("weekday", "2026-11-05T02:00:00Z"),
    weekend("unverified", "2026-11-07T02:00:00Z", {
      cardFactsStatus: "needs_review",
    }),
  ];
  const picks = Array.from({ length: 6 }, () =>
    poster({ featuredWeek: "2026-11-02", publishedAt: 0 }),
  );
  const layout = buildHomeLayout({ posters: [...picks, ...list], now: NOW });
  assert.equal(layout.picks.length, 6);
  const bundle = layout.pages[0].find((block) => block.kind === "bundle");
  assert.equal(bundle?.kind === "bundle" && bundle.id, "curated_weekend_free");
  assert.deepEqual(bundle?.kind === "bundle" ? ids(bundle.items).sort() : [], [
    "sat",
    "sat-late",
    "sun",
  ]);
});

test("bundles fill from posters not used above and skip short ones", () => {
  const list = [
    ...Array.from({ length: 12 }, () => poster()),
    ...Array.from({ length: 4 }, () =>
      poster({ youth: true, interestCode: "CAT_WELFARE", publishedAt: 0 }),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      poster({
        organizerKey: `org-${i}`,
        publishedAt: NOW.getTime() - 10 * DAY,
      }),
    ),
  ];
  const layout = buildHomeLayout({
    posters: list,
    now: NOW,
    pageCount: 2,
    orgs: [
      { id: "a", slug: "a", name: "A", recentCount: 3 },
      { id: "b", slug: "b", name: "B", recentCount: 2 },
      { id: "c", slug: "c", name: "C", recentCount: 1 },
    ],
  });
  const kinds = layout.pages[0].map((block) => block.kind);
  assert.deepEqual(kinds, ["new", "bundle", "orgs"]);
  const bundle = layout.pages[0][1];
  assert.equal(bundle.kind === "bundle" && bundle.id, "curated_youth_support");
  assert.equal(bundle.kind === "bundle" && bundle.items.length, 4);
  // Organisers posted 10 days ago: no "이번 주 새 공고를 올린 기관" bundle.
  assert.equal(
    layout.pages
      .flat()
      .some((b) => b.kind === "bundle" && b.id === "curated_new_orgs"),
    false,
  );
  const shown = allIds(layout);
  assert.equal(new Set(shown).size, shown.length);
});

test("one poster per institution in the new-institutions bundle", () => {
  const list = [
    ...Array.from({ length: 12 }, () =>
      poster({ publishedAt: NOW.getTime() - 30 * DAY + seq }),
    ),
    poster({ organizerKey: "a" }),
    poster({ organizerKey: "a" }),
    poster({ organizerKey: "b" }),
    poster({ organizerKey: "c" }),
  ];
  // The organiser posters are the newest, so page 1 takes them: lay out with
  // them pushed below by making the rest newer.
  const layout = buildHomeLayout({
    posters: list.map((p) =>
      p.organizerKey
        ? { ...p, publishedAt: NOW.getTime() - 2 * DAY }
        : { ...p, publishedAt: NOW.getTime() - DAY },
    ),
    now: NOW,
  });
  const bundle = layout.pages[0].find((b) => b.kind === "bundle");
  assert.equal(bundle?.kind === "bundle" && bundle.id, "curated_new_orgs");
  assert.equal(bundle?.kind === "bundle" && bundle.items.length, 3);
});

test("conditions put matching posters first without hiding the rest", () => {
  const list = [
    ...Array.from({ length: 5 }, () => poster({ regionIds: ["gangseo"] })),
    poster({ id: "mapo-1", regionIds: ["mapo"], publishedAt: 1 }),
    poster({ id: "mapo-2", regionIds: ["mapo"], publishedAt: 2 }),
  ];
  const layout = buildHomeLayout({
    posters: list,
    now: NOW,
    conditions: { regionScope: new Set(["mapo"]), categoryScope: new Set() },
  });
  const first = layout.pages[0][0];
  assert.deepEqual(first.kind === "new" && ids(first.items).slice(0, 2), [
    "mapo-2",
    "mapo-1",
  ]);
  assert.equal(first.kind === "new" && first.items.length, 7);
});

test("pages are stable: page 2 continues where page 1 stopped", () => {
  const list = Array.from({ length: 30 }, () => poster());
  const one = buildHomeLayout({ posters: list, now: NOW, pageCount: 1 });
  const two = buildHomeLayout({ posters: list, now: NOW, pageCount: 2 });
  assert.deepEqual(two.pages[0], one.pages[0]);
  assert.equal(one.hasMore, true);
  const second = two.pages[1][0];
  assert.equal(second.kind === "new" && second.items.length, 12);
});

test("찜 '이번 주에 마감되는 공고': confirmed deadlines by Sunday, soonest first", () => {
  // NOW is Tuesday 11-03; this week ends Sunday 11-08 (KST).
  const closing = (id: string, days: number, verified = true) =>
    poster({
      id,
      application: {
        applicationStartAt: "2026-10-01T00:00:00Z",
        applicationEndAt: new Date(NOW.getTime() + days * DAY).toISOString(),
        deadlineType: "fixed",
        posterStatus: "published",
      },
      card: {
        id,
        title: id,
        image: "https://x.supabase.co/storage/v1/object/public/a.jpg",
        deadlineVerification: verified
          ? { deadlineStatus: "verified", receptionVerified: true }
          : undefined,
      },
    });
  const list = [
    closing("sun", 5),
    closing("wed", 1),
    closing("next-mon", 6),
    closing("unverified", 2, false),
    poster(),
  ];
  const none = buildHomeLayout({ posters: list, now: NOW, upperRows: false });
  assert.equal(none.dueWeek, undefined);
  const layout = buildHomeLayout({
    posters: list,
    now: NOW,
    upperRows: false,
    dueWeekLimit: 4,
  });
  assert.deepEqual(ids(layout.dueWeek ?? []), ["wed", "sun"]);
  // The feed is unchanged: these posters stay in "새로 올라온 공고".
  assert.deepEqual(allIds(layout).sort(), allIds(none).sort());
});
