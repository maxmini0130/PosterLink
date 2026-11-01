import assert from "node:assert/strict";
import test from "node:test";

import { searchCategoryScope, sortLikeSearch } from "./categoryScopedSearch";

type Row = {
  id: string;
  created_at: string;
  application_end_at?: string | null;
};
const row = (id: string, created: string, end?: string | null): Row => ({
  id,
  created_at: created,
  application_end_at: end ?? null,
});

test("a main category searches every folded type once and merges in search order", async () => {
  const byCategory: Record<string, Row[]> = {
    edu: [row("a", "2026-11-01")],
    course: [row("b", "2026-11-03"), row("a", "2026-11-01")],
    job: [row("c", "2026-10-30")],
  };
  const calls: Array<[string | null, number]> = [];
  const result = await searchCategoryScope({
    categoryIds: ["edu", "course", "job"],
    sort: "latest",
    limit: 240,
    search: async (id, limit) => {
      calls.push([id, limit]);
      return { data: byCategory[id ?? ""] ?? [], error: null };
    },
  });
  assert.deepEqual(
    calls.map(([id]) => id),
    ["edu", "course", "job"],
  );
  assert.deepEqual(
    result.rows.map((r) => r.id),
    ["b", "a", "c"],
  );
  assert.equal(result.exact, true);
  assert.equal(result.total, 3);

  // One category keeps the single call and its own limit.
  const single: Array<[string | null, number]> = [];
  await searchCategoryScope({
    categoryIds: [],
    sort: "latest",
    limit: 60,
    search: async (id, limit) => {
      single.push([id, limit]);
      return { data: [], error: null };
    },
  });
  assert.deepEqual(single, [[null, 60]]);
});

test("a failed call fails the search; a full call makes the count inexact", async () => {
  const failed = await searchCategoryScope({
    categoryIds: ["x", "y"],
    sort: "latest",
    limit: 10,
    search: async (id) =>
      id === "y"
        ? { data: null, error: new Error("boom") }
        : { data: [], error: null },
  });
  assert.ok(failed.error);
  assert.deepEqual(failed.rows, []);

  const full = await searchCategoryScope({
    categoryIds: ["x", "y"],
    sort: "latest",
    limit: 2,
    search: async (id, limit) => ({
      data: Array.from({ length: id === "x" ? limit : 1 }, (_, i) =>
        row(`${id}${i}`, `2026-10-${String(10 + i).padStart(2, "0")}`),
      ),
      error: null,
    }),
  });
  assert.equal(full.exact, false);
  assert.equal(full.rows.length, 2);
});

test("deadline order puts dated posters first, soonest first, like the database", () => {
  const rows = [
    row("none", "2026-11-05", null),
    row("late", "2026-11-01", "2026-11-30T00:00:00Z"),
    row("soon", "2026-10-01", "2026-11-03T00:00:00Z"),
  ];
  assert.deepEqual(
    sortLikeSearch(rows, "deadline").map((r) => r.id),
    ["soon", "late", "none"],
  );
  assert.deepEqual(
    sortLikeSearch(rows, "latest").map((r) => r.id),
    ["none", "late", "soon"],
  );
});

test("a URL with 교육/취업 finds posters tagged only 교육강좌 or 채용 (first render)", async () => {
  const { categoryScopeIds } = await import("./categoryTaxonomy");
  const { searchPublicPostersInScope } = await import("./categoryScopedSearch");
  const categories = [
    { id: "education", code: "CAT_EDUCATION" },
    { id: "course", code: "CAT_COURSE" },
    { id: "job", code: "CAT_RECRUITMENT" },
  ];
  const tagged: Record<string, Row[]> = {
    education: [row("edu-only", "2026-10-01")],
    course: [row("course-only", "2026-11-01")],
    job: [row("job-only", "2026-10-20")],
  };
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    rpc: (_fn: "search_public_posters", args: Record<string, unknown>) => {
      calls.push(args);
      return {
        select: () =>
          Promise.resolve({
            data: tagged[String(args.p_category_id)] ?? [],
            error: null,
          }),
      };
    },
  };
  const result = await searchPublicPostersInScope<Row>(client, {
    categoryIds: categoryScopeIds("education", categories),
    query: null,
    regionIds: ["seoul"],
    includeClosed: false,
    sort: "latest",
    limit: 240,
    select: "id",
  });
  assert.deepEqual(
    calls.map((args) => [args.p_category_id, args.p_region_ids]),
    [
      ["education", ["seoul"]],
      ["course", ["seoul"]],
      ["job", ["seoul"]],
    ],
  );
  assert.deepEqual(
    result.rows.map((r) => r.id),
    ["course-only", "job-only", "edu-only"],
  );
});
