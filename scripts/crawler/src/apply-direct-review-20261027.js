import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

// Evidence and full before/after snapshots stay in ignored local artifacts.
const root = "../../data/results/manual-review-20261027";
const apply = process.argv.includes("--apply");
const resume = process.argv.includes("--resume");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261027"));
const plan = JSON.parse(await fs.readFile(`${root}/plan.json`, "utf8"));
const backup = JSON.parse(await fs.readFile(`${root}/backup.json`, "utf8"));
const regionBackup = JSON.parse(
  await fs.readFile(`${root}/poster_regions-before.json`, "utf8"),
);
const expected = new Map([
  ["fb8295ca-c8b5-4ee5-95ed-9e46268eedef", "published"],
  ["cacff1bf-1dad-4f36-b81b-cbe84c75faf2", "review"],
  ["341e85ac-4ced-462b-86cf-544071480da3", "review"],
  ["aa7964e4-817e-4729-b3fc-fb1ee0d1c35b", "review"],
  ["8c0ab9d9-e06a-4721-8cf7-95a2ac22bfb2", "review"],
  ["4af75bdb-2c9e-43df-8da5-4e7bb890eab6", "review"],
]);
assert.equal(plan.today_kst, "2026-10-27");
assert.equal(plan.items.length, expected.size);
assert.equal(new Set(plan.items.map((d) => d.id)).size, expected.size);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    // A dry-run cannot issue any database mutations, even accidentally.
    global: {
      fetch: (url, options) => {
        if (!apply) assert.equal(options?.method ?? "GET", "GET");
        return fetch(url, options);
      },
    },
  },
);
const checked = async (query) => {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
};
const select = "*,poster_links(*),poster_categories(*),poster_images(*)";
const current = await checked(
  db
    .from("posters")
    .select(select)
    .in("id", [...expected.keys()]),
);
const resumableId = "fb8295ca-c8b5-4ee5-95ed-9e46268eedef";
let resumeCompleted = false;
const sortedRelation = (rows) =>
  [...rows].sort((a, b) =>
    String(a.id ?? a.category_id).localeCompare(String(b.id ?? b.category_id)),
  );
const normalizedLinks = (items) =>
  items
    .map(({ url, title, link_type, is_primary }) => ({
      url,
      title,
      link_type,
      is_primary,
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
if (resume) {
  // Only the observed, journaled failure after the first record's link edits.
  const prior = JSON.parse(await fs.readFile(`${root}/applied.json`, "utf8"));
  assert.equal(prior.items.length, 1);
  assert.equal(prior.items[0].id, resumableId);
  assert.equal(prior.items[0].phase, "links-updated");
  const row = current.find((r) => r.id === resumableId);
  const before = backup.find((r) => r.id === resumableId);
  const decision = plan.items.find((d) => d.id === resumableId);
  assert.deepEqual(
    normalizedLinks(row.poster_links),
    normalizedLinks(decision.links),
  );
  if (!row.field_verification.directReviewWriteInProgress) {
    const expectedRow = {
      ...before,
      ...decision.patch,
      updated_at: row.updated_at,
      poster_links: row.poster_links,
    };
    for (const [key, value] of Object.entries(expectedRow)) {
      if (key.endsWith("_at") && value)
        assert.equal(Date.parse(row[key]), Date.parse(value));
      else if (["poster_images", "poster_categories"].includes(key))
        assert.deepEqual(sortedRelation(row[key]), sortedRelation(value));
      else assert.deepEqual(row[key], value);
    }
    resumeCompleted = true;
  } else
    assert.deepEqual(row, {
      ...before,
      updated_at: row.updated_at,
      poster_status: "review",
      poster_links: row.poster_links,
      field_verification: {
        ...before.field_verification,
        directReviewWriteInProgress: { todayKst: plan.today_kst },
      },
    });
}
for (const d of plan.items) {
  const before = backup.find((r) => r.id === d.id);
  assert(before && expected.has(d.id));
  assert.equal(before.poster_status, expected.get(d.id));
  assert.deepEqual(
    current.find((r) => r.id === d.id),
    resume && d.id === resumableId
      ? current.find((r) => r.id === d.id)
      : before,
    `Snapshot changed: ${d.id}`,
  );
  assert(
    ["published", "closed", "review", "rejected"].includes(
      d.patch.poster_status,
    ),
  );
  assert(d.reason && d.sources.length && d.patch.summary_short);
  // AI/source review does not confer the administrator-only human verification badge.
  assert.notEqual(d.patch.verification_status, "verified");
  assert.deepEqual(
    d.patch.field_verification.humanStructuredVerification,
    before.field_verification.humanStructuredVerification,
  );
  assert.deepEqual(
    d.patch.field_verification.directSourceReview.previousVerification,
    before.field_verification,
  );
  assert.equal(
    d.patch.field_verification.directSourceReview.todayKst,
    plan.today_kst,
  );
  for (const [key, value] of Object.entries(d.patch)) {
    assert(Object.hasOwn(before, key), `Unknown column: ${key}`);
    if (key.endsWith("_at") && value)
      assert(Number.isFinite(Date.parse(value)));
  }
  for (const prefix of ["application", "event"]) {
    const start = d.patch[`${prefix}_start_at`],
      end = d.patch[`${prefix}_end_at`];
    if (start && end) assert(Date.parse(start) <= Date.parse(end));
  }
  for (const link of d.links) {
    assert(
      ["official_notice", "official_apply", "other"].includes(link.link_type),
    );
    assert.equal(new URL(link.url).protocol, "https:");
    if (link.id) assert(before.poster_links.some((l) => l.id === link.id));
  }
  assert.equal(d.links.filter((l) => l.is_primary).length, 1);
  if (d.regions) {
    assert(
      [
        "8c0ab9d9-e06a-4721-8cf7-95a2ac22bfb2",
        "aa7964e4-817e-4729-b3fc-fb1ee0d1c35b",
      ].includes(d.id),
    );
    const actual = await checked(
      db.from("poster_regions").select("*").eq("poster_id", d.id),
    );
    const sort = (rows) =>
      [...rows].sort((a, b) => a.region_id.localeCompare(b.region_id));
    assert.deepEqual(
      sort(actual),
      sort(regionBackup.filter((r) => r.poster_id === d.id)),
    );
    assert(
      d.regions.every((id) => id === "0f744192-4411-48ab-bc68-161a8b63110b"),
    );
  }
  assert(
    before.poster_links.every((l) => d.links.some((next) => next.id === l.id)),
  );
  if (d.patch.poster_status === "rejected") {
    const canonical = plan.items.find((item) => item.id === d.duplicate_of);
    assert.equal(canonical?.patch.poster_status, "closed");
  }
}
console.log(
  JSON.stringify({
    apply,
    targets: plan.items.length,
    statuses: plan.items.map((d) => ({
      id: d.id,
      status: d.patch.poster_status,
    })),
  }),
);
const report = { today_kst: plan.today_kst, apply, items: [] };
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
  if (resumeCompleted && d.id === resumableId) {
    await fs.writeFile(
      `${root}/after-${d.id}.json`,
      JSON.stringify(
        current.find((r) => r.id === d.id),
        null,
        2,
      ),
    );
    result.phase = "complete";
    result.verified = true;
    await save();
    continue;
  }
  // Hide the one previously public record while correcting its links and fields.
  const resuming = resume && d.id === resumableId;
  const claim = resuming
    ? { updated_at: current.find((r) => r.id === d.id).updated_at }
    : await checked(
        db
          .from("posters")
          .update({
            poster_status: "review",
            field_verification: {
              ...before.field_verification,
              directReviewWriteInProgress: { todayKst: plan.today_kst },
            },
          })
          .eq("id", d.id)
          .eq("poster_status", before.poster_status)
          .eq("updated_at", before.updated_at)
          .select("updated_at")
          .maybeSingle(),
      );
  assert(claim, `Concurrent edit blocked: ${d.id}`);
  result.phase = "claimed";
  await save();
  for (const link of d.links) {
    if (resuming) continue;
    const { id, ...values } = link;
    if (id) {
      const previous = before.poster_links.find((l) => l.id === id);
      if (
        Object.entries(values).every(([key, value]) => previous[key] === value)
      )
        continue;
      const changed = await checked(
        db
          .from("poster_links")
          .update(values)
          .eq("id", id)
          .eq("poster_id", d.id)
          .eq("url", previous.url)
          .select("id")
          .maybeSingle(),
      );
      assert(changed, `Link changed concurrently: ${id}`);
    } else {
      await checked(
        db.from("poster_links").insert({ ...values, poster_id: d.id }),
      );
    }
  }
  result.phase = "links-updated";
  await save();
  if (d.regions) {
    for (const old of regionBackup.filter((r) => r.poster_id === d.id)) {
      // Remove only the backed-up, demonstrably incorrect scope assignments.
      await checked(
        db
          .from("poster_regions")
          .delete()
          .eq("poster_id", d.id)
          .eq("region_id", old.region_id),
      );
    }
    if (d.regions.length)
      await checked(
        db
          .from("poster_regions")
          .insert(
            d.regions.map((region_id) => ({ poster_id: d.id, region_id })),
          ),
      );
    const actual = await checked(
      db.from("poster_regions").select("region_id").eq("poster_id", d.id),
    );
    assert.deepEqual(
      actual.map((r) => r.region_id).sort(),
      [...d.regions].sort(),
    );
  }
  const changed = await checked(
    db
      .from("posters")
      .update(d.patch)
      .eq("id", d.id)
      .eq("poster_status", "review")
      .eq("updated_at", claim.updated_at)
      .select("id")
      .maybeSingle(),
  );
  assert(changed, `Final concurrent edit blocked: ${d.id}`);
  const after = await checked(
    db.from("posters").select(select).eq("id", d.id).single(),
  );
  for (const [key, value] of Object.entries(d.patch)) {
    if (key.endsWith("_at") && value)
      assert.equal(Date.parse(after[key]), Date.parse(value));
    else assert.deepEqual(after[key], value);
  }
  const links = (items) =>
    items
      .map(({ url, title, link_type, is_primary }) => ({
        url,
        title,
        link_type,
        is_primary,
      }))
      .sort((a, b) => a.url.localeCompare(b.url));
  assert.deepEqual(links(after.poster_links), links(d.links));
  for (const relation of ["poster_images", "poster_categories"]) {
    assert.deepEqual(
      sortedRelation(after[relation]),
      sortedRelation(before[relation]),
    );
  }
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
      action_reason: "direct_source_review_20261027",
      metadata_json: {
        reviewer: plan.reviewer,
        target_ids: plan.items.map((d) => d.id),
        verified_count: report.items.filter((r) => r.verified).length,
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
