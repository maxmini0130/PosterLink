import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Incident-only approvals. Never reuse this frozen decision list for later crawls.
const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261107/", import.meta.url),
);
const read = async (name) =>
  JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
const save = async (name, value) =>
  fs.writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2));
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261107"));
const [plan, backup] = await Promise.all([read("plan"), read("backup")]);
assert.equal(plan.today_kst, "2026-11-07");
assert.equal(plan.items.length, 103);
assert.equal(backup.length, 103);
assert.deepEqual(
  plan.items.filter((x) => x.approved).map((x) => x.i),
  [3, 10, 21, 22, 23, 24, 27, 30, 36, 37, 38, 47, 49, 58, 59, 63, 66, 74],
);
assert.equal(plan.items.filter((x) => x.status === "published").length, 11);
assert.equal(plan.items.filter((x) => x.status === "closed").length, 7);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Existing journal: inspect before recovery; do not replay",
);
const hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
assert.equal(
  hash,
  "4c77da9377db41ad898f33cade311e34820ebc0e424cf7e8a8c054efa7f06bc8",
  "Frozen source-review plan changed",
);
if (apply) assert.equal((await read("dry-run")).hash, hash);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) => {
        if (!apply) assert.equal(options?.method || "GET", "GET");
        return fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      },
    },
  },
);
const checked = async (query) => {
  const r = await query;
  assert.ifError(r.error);
  return r.data;
};
const relations = [
  "poster_links",
  "poster_images",
  "poster_categories",
  "poster_audiences",
];
const select =
  "*,poster_links(*),poster_images(*),poster_categories(*),poster_audiences(*)";
const canonical = (v) =>
  Array.isArray(v)
    ? v
        .map(canonical)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const current = await checked(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      backup.map((x) => x.id),
    ),
);
const allowed = new Set([
  "title",
  "organizer_name",
  "application_organization_name",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "event_location",
  "eligibility_summary",
  "recruitment_count",
  "application_method",
  "contact_info",
  "summary_short",
  "summary_long",
  "target_age_min",
  "target_age_max",
  "participation_fee",
  "benefits_summary",
  "required_documents",
  "category_id",
  "deadline_type",
]);
for (const item of plan.items) {
  const old = backup[item.i];
  assert.equal(item.id, old.id);
  assert.equal(old.poster_status, "review");
  assert.deepEqual(
    canonical(current.find((x) => x.id === item.id)),
    canonical(old),
    `Concurrent change ${item.i}`,
  );
  assert(item.reason && item.sources.length && item.image.status === 200);
  for (const key of Object.keys(item.patch)) assert(allowed.has(key), key);
  assert(["review", "published", "closed"].includes(item.status));
  if (item.approved) {
    assert(item.patch.summary_short && item.patch.summary_long);
    assert(["fixed", "until_exhausted"].includes(item.patch.deadline_type));
  } else {
    assert.equal(item.status, "review");
    assert.equal(item.removeAudiences.length, 0);
    assert.equal(item.linkPatches.length, 0);
    assert(
      [50, 57, 77].includes(item.i) || Object.keys(item.patch).length === 0,
    );
  }
  for (const id of item.removeAudiences)
    assert(old.poster_audiences.some((r) => r.audience_id === id));
  for (const link of item.linkPatches)
    assert(old.poster_links.some((l) => l.id === link.id));
  const next = { ...old, ...item.patch };
  if (next.application_start_at && next.application_end_at)
    assert(
      Date.parse(next.application_start_at) <=
        Date.parse(next.application_end_at),
    );
  if (
    item.approved &&
    item.status === "published" &&
    next.deadline_type === "fixed"
  )
    assert(
      Date.parse(next.application_end_at) >=
        Date.parse("2026-11-07T00:00:00+09:00"),
    );
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    targets: 103,
    approved: 18,
    published: 11,
    closed: 7,
    held: 85,
    hash,
  }),
);
if (!apply) {
  await save("dry-run", { hash, passed: true });
  process.exit(0);
}
const journal = { hash, items: [] };
for (const item of plan.items) {
  const old = backup[item.i];
  const verification = structuredClone(old.field_verification || {});
  verification.sourceReview20261107 = {
    reviewer: "Codex source and visual review",
    todayKst: plan.today_kst,
    reviewedAt: new Date().toISOString(),
    approved: item.approved,
    status: item.status,
    reason: item.reason,
    sources: item.sources,
    image: item.image,
    aiReport: plan.aiReport,
    backupSha256: createHash("sha256")
      .update(JSON.stringify(old))
      .digest("hex"),
    datePrecision:
      "Date-only boundaries are not evidence of an exact closing time",
    removedAudienceRelations: old.poster_audiences.filter((r) =>
      item.removeAudiences.includes(r.audience_id),
    ),
  };
  if (item.approved) {
    verification.readableNotice = {
      ...verification.readableNotice,
      summaryShort: item.patch.summary_short,
      summaryLong: item.patch.summary_long,
      facts: {
        ...verification.readableNotice?.facts,
        target: item.patch.eligibility_summary,
        applicationMethod: item.patch.application_method,
        location: item.patch.event_location,
      },
      updatedBy: "source-review-20261107",
    };
    if (item.removeAudiences.length)
      verification.classification = {
        ...verification.classification,
        audiences: [],
      };
  }
  assert.deepEqual(
    verification.humanStructuredVerification,
    old.field_verification?.humanStructuredVerification,
  );
  journal.items.push({ id: item.id, i: item.i, phase: "claim" });
  await save("applied", journal);
  const claim = await checked(
    db
      .from("posters")
      .update({
        field_verification: {
          ...old.field_verification,
          sourceReviewWriteInProgress: "20261107",
        },
      })
      .eq("id", item.id)
      .eq("poster_status", "review")
      .eq("updated_at", old.updated_at)
      .select("id,updated_at"),
  );
  assert.equal(claim.length, 1);
  for (const id of item.removeAudiences)
    await checked(
      db
        .from("poster_audiences")
        .delete()
        .eq("poster_id", item.id)
        .eq("audience_id", id),
    );
  let expectedCategories = old.poster_categories;
  if (item.approved) {
    for (const rel of old.poster_categories.filter(
      (r) => r.category_id !== item.patch.category_id,
    ))
      await checked(
        db
          .from("poster_categories")
          .delete()
          .eq("poster_id", item.id)
          .eq("category_id", rel.category_id),
      );
    if (
      !old.poster_categories.some(
        (r) => r.category_id === item.patch.category_id,
      )
    )
      await checked(
        db
          .from("poster_categories")
          .insert({ poster_id: item.id, category_id: item.patch.category_id }),
      );
    expectedCategories = [{ category_id: item.patch.category_id }];
  }
  const expectedLinks = structuredClone(old.poster_links);
  for (const link of item.linkPatches) {
    await checked(
      db
        .from("poster_links")
        .update(link.patch)
        .eq("poster_id", item.id)
        .eq("id", link.id),
    );
    Object.assign(
      expectedLinks.find((l) => l.id === link.id),
      link.patch,
    );
  }
  const patch = { ...item.patch, field_verification: verification };
  if (item.approved)
    Object.assign(patch, {
      poster_status: item.status,
      published_at: new Date().toISOString(),
      rejection_reason: null,
    });
  const written = await checked(
    db
      .from("posters")
      .update(patch)
      .eq("id", item.id)
      .eq("poster_status", "review")
      .eq("updated_at", claim[0].updated_at)
      .select("id"),
  );
  assert.equal(written.length, 1);
  journal.items.at(-1).phase = "written";
  await save("applied", journal);
  const after = await checked(
    db.from("posters").select(select).eq("id", item.id).single(),
  );
  for (const [key, value] of Object.entries(old))
    if (![...relations, "updated_at", ...Object.keys(patch)].includes(key))
      assert.deepEqual(after[key], value, `Unexpected ${item.i}/${key}`);
  for (const [key, value] of Object.entries(patch))
    if (key.endsWith("_at") && value)
      assert.equal(Date.parse(after[key]), Date.parse(value));
    else assert.deepEqual(after[key], value, `Patch ${item.i}/${key}`);
  assert.deepEqual(
    canonical(after.poster_images),
    canonical(old.poster_images),
  );
  assert.deepEqual(canonical(after.poster_links), canonical(expectedLinks));
  assert.deepEqual(
    canonical(after.poster_audiences),
    canonical(
      old.poster_audiences.filter(
        (r) => !item.removeAudiences.includes(r.audience_id),
      ),
    ),
  );
  assert.deepEqual(
    after.poster_categories.map((r) => r.category_id).sort(),
    expectedCategories.map((r) => r.category_id).sort(),
  );
  await save(`after-${item.id}`, after);
  journal.items.at(-1).phase = "verified";
  await save("applied", journal);
}
await checked(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "source_review_20261107",
    metadata_json: {
      approved: plan.items.filter((x) => x.approved).map((x) => x.id),
      published: 11,
      closed: 7,
      held: 85,
      planSha256: hash,
    },
  }),
);
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(
  JSON.stringify({
    verified: journal.items.length,
    approved: 18,
    published: 11,
    closed: 7,
    held: 85,
  }),
);
