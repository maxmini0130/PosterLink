import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// One incident's reviewed plan and complete source/DB snapshots are Git-ignored.
const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261030/", import.meta.url),
);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261030"));
const read = async (name) =>
  JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
const [plan, backup, categories] = await Promise.all([
  read("plan"),
  read("backup"),
  read("categories"),
]);
const expectedIds = [
  "d326af9d-5552-42fa-acbf-00a3e6ef43f9",
  "8b5784bf-7ae7-4940-92e5-6b137643341b",
  "4082a6bc-5f93-46aa-ba81-6b42dd6be568",
  "114a869d-fdb4-4ec2-a732-6a2b5804037e",
  "36d7b20d-2673-408d-8ceb-fb3eb256a8d5",
  "5e6d7c1a-889f-45b2-a848-81b7d020d377",
  "f4b50e53-bf3f-4405-acf2-b818f4a05b22",
  "f0065caf-407a-4717-8b49-38db5714e255",
  "980c16a1-00ae-4fe9-ba48-b5745da2904a",
  "f9a04abc-2e80-4685-80f5-51412f124ff7",
  "309c3c02-ee56-4ff5-ab50-f15623510f5a",
  "4fd0bbf1-4e62-4993-a5ea-1a76460db838",
  "117dd7aa-da6a-4706-a145-a170db7bfb76",
  "6a0845d4-214b-4f7f-9560-bbbf987c4f6b",
  "532f5c6a-c8be-4852-9407-fa09f3aa0063",
  "79af05ec-fda3-4618-9ffd-0cacdc486671",
  "159acb77-156b-4244-b5f1-e3ffabad7fd5",
  "35e3bd9e-c7eb-4a53-af7e-49aea9d78856",
  "86d33f6a-bd33-47e9-a56b-3a81e636be7e",
  "f98954b4-bbda-4e3e-9b28-0795f44abf4f",
  "2e812cc9-ca30-4825-bc0a-ca225e4286cc",
  "1b481bf9-09af-43f3-880a-baa7597ee414",
  "d2e211c6-3711-47ad-87da-4da13c1c59d0",
  "a341b2a9-5b87-41c0-b999-97685454e863",
  "fef4a017-9692-49d3-9dd7-6590d02d7ffd",
  "d266f210-fd0d-495f-acbd-3072fcbf36f6",
  "695afcf0-8294-4521-92de-7ab43a437a94",
  "37272d2d-97a0-4250-b1de-295cea9ec174",
  "555711da-82c5-489b-9b00-892fbf00e436",
  "3e6a0f12-e5cd-40f8-b9bf-2bdf65aa9e92",
  "3ffe2ba6-bb3e-42f6-8241-a4275f167202",
  "21936c85-4d24-4c62-9dbd-71bcea2c64fa",
  "8708ca07-d8b3-4d65-8c97-5d25607e5f47",
  "aeb79dfc-3708-48a6-9f5f-060631abd573",
  "e8433baa-4bd4-41a6-af39-dc960ccf6717",
  "67ee7c0b-dd0e-4578-8123-ac71303938ca",
  "8c0ab9d9-e06a-4721-8cf7-95a2ac22bfb2",
  "4af75bdb-2c9e-43df-8da5-4e7bb890eab6",
];
assert.equal(plan.today_kst, "2026-10-30");
assert.deepEqual(
  plan.items.map((d) => d.id),
  expectedIds,
);
assert.equal(backup.length, expectedIds.length);
assert.equal(plan.items.filter((d) => d.approved).length, 19);
if (apply) {
  // A partial execution must be investigated from its journal, never blindly repeated.
  const exists = await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  );
  assert(
    !exists,
    "An apply journal already exists; inspect it before any recovery.",
  );
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) => {
        if (!apply) assert.equal(options?.method ?? "GET", "GET");
        return fetch(url, options);
      },
    },
  },
);
const checked = async (query) => {
  const r = await query;
  if (r.error) throw r.error;
  return r.data;
};
const select = "*,poster_links(*),poster_categories(*),poster_images(*)";
const current = await checked(
  db.from("posters").select(select).in("id", expectedIds),
);
const sorted = (rows) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const equivalent = (a, b) => {
  for (const key of ["poster_links", "poster_categories", "poster_images"]) {
    a = { ...a, [key]: sorted(a[key]) };
    b = { ...b, [key]: sorted(b[key]) };
  }
  assert.deepEqual(a, b);
};
const allowed = new Set([
  "field_verification",
  "poster_status",
  "published_at",
  "summary_short",
  "summary_long",
  "deadline_type",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "verification_status",
  "verified_at",
  "rejection_reason",
  "eligibility_summary",
  "event_location",
  "target_age_max",
  "target_age_min",
  "organizer_name",
  "application_organization_name",
  "contact_info",
  "recruitment_count",
  "participation_fee",
  "application_method",
  "category_id",
]);
for (const d of plan.items) {
  const before = backup.find((r) => r.id === d.id);
  assert.equal(before.poster_status, "review");
  equivalent(
    current.find((r) => r.id === d.id),
    before,
  );
  assert(
    d.reason && d.patch.field_verification.sourceReview20261030.sources.length,
  );
  assert.deepEqual(
    d.patch.field_verification.sourceReview20261030.previousVerification,
    before.field_verification,
  );
  for (const [key, value] of Object.entries(d.patch)) {
    assert(allowed.has(key) && Object.hasOwn(before, key));
    if (key.endsWith("_at") && value)
      assert(Number.isFinite(Date.parse(value)));
  }
  assert.deepEqual(
    d.patch.field_verification.humanStructuredVerification,
    before.field_verification.humanStructuredVerification,
  );
  assert.notEqual(d.patch.verification_status, "verified");
  if (!d.approved)
    assert(
      Object.keys(d.patch).every((key) =>
        ["field_verification", "category_id"].includes(key),
      ),
    );
  else {
    assert(["published", "closed"].includes(d.patch.poster_status));
    for (const prefix of ["application", "event"]) {
      const start = d.patch[`${prefix}_start_at`],
        end = d.patch[`${prefix}_end_at`];
      if (start && end) assert(Date.parse(start) <= Date.parse(end));
    }
  }
  if (d.links) {
    assert(d.approved);
    assert.deepEqual(
      d.links.map((l) => l.id).sort(),
      before.poster_links.map((l) => l.id).sort(),
    );
    assert.equal(d.links.filter((l) => l.is_primary).length, 1);
    for (const l of d.links) assert.equal(new URL(l.url).protocol, "https:");
  }
  if (d.category_codes) {
    assert(d.approved || d.index === 18);
    assert(
      d.category_codes.every((code) => categories.some((c) => c.code === code)),
    );
  }
}
console.log(
  JSON.stringify({
    apply,
    targets: plan.items.length,
    approved: 19,
    published: 19,
    closed: 0,
    held: 19,
  }),
);
const report = { apply, today_kst: plan.today_kst, items: [] };
const save = () =>
  fs.writeFile(
    `${root}/${apply ? "applied" : "dry-run"}.json`,
    JSON.stringify(report, null, 2),
  );
for (const d of plan.items) {
  const before = backup.find((r) => r.id === d.id);
  const result = { id: d.id, phase: "planned", verified: false };
  report.items.push(result);
  await save();
  if (!apply) continue;
  let stamp = before.updated_at;
  if (d.links || d.category_codes) {
    const claim = await checked(
      db
        .from("posters")
        .update({
          field_verification: {
            ...before.field_verification,
            directReviewWriteInProgress: { todayKst: plan.today_kst },
          },
        })
        .eq("id", d.id)
        .eq("poster_status", "review")
        .eq("updated_at", stamp)
        .select("updated_at")
        .maybeSingle(),
    );
    assert(claim, `Concurrent change: ${d.id}`);
    stamp = claim.updated_at;
    result.phase = "claimed";
    await save();
  }
  if (d.links)
    for (const l of d.links) {
      const prev = before.poster_links.find((x) => x.id === l.id);
      const values = Object.fromEntries(
        ["url", "title", "link_type", "is_primary"].map((key) => [key, l[key]]),
      );
      if (Object.entries(values).every(([key, value]) => prev[key] === value))
        continue;
      const changed = await checked(
        db
          .from("poster_links")
          .update(values)
          .eq("id", l.id)
          .eq("poster_id", d.id)
          .eq("url", prev.url)
          .select("id")
          .maybeSingle(),
      );
      assert(changed);
    }
  if (d.category_codes) {
    const desired = d.category_codes.map(
      (code) => categories.find((c) => c.code === code).id,
    );
    // Add desired relations while still hidden, then remove only backed-up obsolete relations.
    for (const id of desired.filter(
      (id) => !before.poster_categories.some((c) => c.category_id === id),
    ))
      await checked(
        db
          .from("poster_categories")
          .insert({ poster_id: d.id, category_id: id }),
      );
    for (const c of before.poster_categories.filter(
      (c) => !desired.includes(c.category_id),
    ))
      await checked(
        db
          .from("poster_categories")
          .delete()
          .eq("poster_id", d.id)
          .eq("category_id", c.category_id),
      );
  }
  result.phase = "relations-updated";
  await save();
  const changed = await checked(
    db
      .from("posters")
      .update(d.patch)
      .eq("id", d.id)
      .eq("poster_status", "review")
      .eq("updated_at", stamp)
      .select("id")
      .maybeSingle(),
  );
  assert(changed, `Concurrent final change: ${d.id}`);
  result.phase = "fields-updated";
  await save();
  const after = await checked(
    db.from("posters").select(select).eq("id", d.id).single(),
  );
  for (const [key, value] of Object.entries(d.patch)) {
    if (key.endsWith("_at") && value)
      assert.equal(Date.parse(after[key]), Date.parse(value));
    else assert.deepEqual(after[key], value);
  }
  assert.deepEqual(sorted(after.poster_images), sorted(before.poster_images));
  assert.equal(after.thumbnail_url, before.thumbnail_url);
  assert.deepEqual(
    sorted(after.poster_links),
    sorted(d.links ?? before.poster_links),
  );
  const expectedCategories = d.category_codes
    ? d.category_codes
        .map((code) => categories.find((c) => c.code === code).id)
        .sort()
    : before.poster_categories.map((c) => c.category_id).sort();
  assert.deepEqual(
    after.poster_categories.map((c) => c.category_id).sort(),
    expectedCategories,
  );
  await fs.writeFile(
    `${root}/after-${d.id}.json`,
    JSON.stringify(after, null, 2),
  );
  result.phase = "complete";
  result.verified = true;
  await save();
}
if (apply)
  await checked(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "update",
      action_reason: "ai_direct_source_review_20261030",
      metadata_json: {
        reviewer: plan.reviewer,
        target_ids: expectedIds,
        approved: 19,
        published: 19,
        closed: 0,
        held: 19,
      },
    }),
  );
report.completed_at = new Date().toISOString();
await save();
console.log(
  JSON.stringify({
    completed: report.items.length,
    verified: report.items.filter((r) => r.verified).length,
  }),
);
