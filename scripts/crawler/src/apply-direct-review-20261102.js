import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261102/", import.meta.url),
);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261102"));
const read = async (n) =>
  JSON.parse(await fs.readFile(`${root}/${n}.json`, "utf8"));
const save = async (n, v) =>
  fs.writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2));
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (u, o) => {
        if (!apply) assert.equal(o?.method || "GET", "GET");
        return fetch(u, o);
      },
    },
  },
);
const checked = async (q) => {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
};
const specs = await read("reviewed-specs");
assert.deepEqual(
  specs.map((s) => s.i),
  [2, 3, 4, 7, 8],
);
assert.deepEqual(
  specs.map((s) => s.id),
  [
    "40acf883-8fdc-469c-9f5f-ee3e5474e2d3",
    "662e26ec-f777-4df8-a1a5-e9050d822acb",
    "0fbb3309-791f-464b-a9d9-5e3dc394e506",
    "09516798-ea55-4bba-96c8-ed7ab6808530",
    "56a42e3b-b0b6-43d9-98d6-dfb4a0310859",
  ],
);
const select =
  "*,poster_links(*),poster_categories(*),poster_images(*),poster_audiences(*)";
const rows = await checked(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      specs.map((s) => s.id),
    ),
);
if (process.argv.includes("--prepare")) {
  assert(!apply);
  await save("approval-backup", rows);
  const categories = await read("categories");
  const items = specs.map((s) => {
    const r = rows.find((r) => r.id === s.id);
    assert.equal(r.poster_status, "review");
    const fv = structuredClone(r.field_verification || {});
    const review = {
      todayKst: "2026-11-02",
      reviewer: "Codex source and poster review",
      reason: s.reason,
      sources: r.poster_links.map((l) => l.url),
      previousVerification: r.field_verification,
      approved: true,
    };
    fv.sourceReview20261102 = review;
    fv.readableNotice = {
      ...fv.readableNotice,
      summaryShort: s.summary_short,
      facts: {
        ...fv.readableNotice?.facts,
        target: s.eligibility_summary,
        period: s.summary_short,
      },
    };
    if (s.i === 3) fv.classification = { ...fv.classification, audiences: [] };
    const category = categories.find((c) => c.name === s.category);
    assert(category);
    assert(r.poster_categories.some((c) => c.category_id === category.id));
    const patch = {
      poster_status: "published",
      published_at: new Date().toISOString(),
      rejection_reason: null,
      organizer_name: s.organizer_name,
      application_organization_name: s.organizer_name,
      application_end_at: s.application_end_at,
      event_start_at: s.event_start_at,
      event_end_at: s.event_end_at,
      deadline_type: s.deadline_type,
      eligibility_summary: s.eligibility_summary,
      summary_short: s.summary_short,
      category_id: category.id,
      field_verification: fv,
    };
    if (s.i === 7) patch.application_start_at = "2026-10-30T10:00:00+09:00";
    return { id: s.id, approved: true, reason: s.reason, patch };
  });
  await save("plan", { today_kst: "2026-11-02", items });
  console.log(JSON.stringify({ prepared: items.length }));
  process.exit(0);
}
const [backup, plan] = await Promise.all([
  read("approval-backup"),
  read("plan"),
]);
assert.equal(plan.today_kst, "2026-11-02");
assert.deepEqual(
  plan.items.map((x) => x.id),
  specs.map((x) => x.id),
);
const normalized = (r) => ({
  ...r,
  ...Object.fromEntries(
    [
      "poster_links",
      "poster_categories",
      "poster_images",
      "poster_audiences",
    ].map((k) => [
      k,
      [...r[k]].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    ]),
  ),
});
for (const d of plan.items) {
  const r = rows.find((r) => r.id === d.id),
    old = backup.find((r) => r.id === d.id);
  assert.deepEqual(normalized(r), normalized(old));
  assert.equal(r.poster_status, "review");
  assert.deepEqual(
    d.patch.field_verification.sourceReview20261102.previousVerification,
    r.field_verification,
  );
  assert.deepEqual(
    d.patch.field_verification.humanStructuredVerification,
    r.field_verification?.humanStructuredVerification,
  );
  for (const prefix of ["application", "event"]) {
    const start = d.patch[`${prefix}_start_at`] ?? r[`${prefix}_start_at`],
      end = d.patch[`${prefix}_end_at`];
    if (start && end) assert(Date.parse(start) <= Date.parse(end));
  }
}
console.log(
  JSON.stringify({
    apply,
    targets: plan.items.length,
    condition: "fixed IDs, full snapshot, review status and updated_at match",
  }),
);
if (!apply) {
  await save("dry-run", { targets: plan.items.length, passed: true });
  process.exit(0);
}
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Existing journal: investigate before retry",
);
const journal = { items: [] };
for (const d of plan.items) {
  const old = backup.find((r) => r.id === d.id);
  journal.items.push({ id: d.id, phase: "planned" });
  await save("applied", journal);
  let stamp = old.updated_at;
  if (d.id === "662e26ec-f777-4df8-a1a5-e9050d822acb") {
    assert.deepEqual(
      old.poster_audiences.map((x) => x.audience_id),
      ["81fa32bd-9319-48b4-b162-625c7f02b2e7"],
    );
    const claim = await checked(
      db
        .from("posters")
        .update({
          field_verification: {
            ...old.field_verification,
            sourceReviewWriteInProgress: "20261102",
          },
        })
        .eq("id", d.id)
        .eq("poster_status", "review")
        .eq("updated_at", stamp)
        .select("updated_at")
        .maybeSingle(),
    );
    assert(claim, "Concurrent claim");
    stamp = claim.updated_at;
    journal.items.at(-1).phase = "claimed";
    await save("applied", journal);
    await checked(
      db
        .from("poster_audiences")
        .delete()
        .eq("poster_id", d.id)
        .eq("audience_id", "81fa32bd-9319-48b4-b162-625c7f02b2e7"),
    );
    journal.items.at(-1).phase = "incorrect-women-only-relation-removed";
    await save("applied", journal);
  }
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
  assert(changed, "Concurrent update");
  const after = await checked(
    db.from("posters").select(select).eq("id", d.id).single(),
  );
  for (const [k, v] of Object.entries(d.patch)) {
    if (k.endsWith("_at") && v)
      assert.equal(Date.parse(after[k]), Date.parse(v));
    else assert.deepEqual(after[k], v);
  }
  for (const k of ["poster_images", "poster_categories", "poster_links"])
    assert.deepEqual(normalized(after)[k], normalized(old)[k]);
  assert.deepEqual(
    normalized(after).poster_audiences,
    d.id === "662e26ec-f777-4df8-a1a5-e9050d822acb"
      ? []
      : normalized(old).poster_audiences,
  );
  assert.equal(after.thumbnail_url, old.thumbnail_url);
  assert.equal(after.verification_status, old.verification_status);
  await save(`after-${d.id}`, after);
  journal.items.at(-1).phase = "verified";
  await save("applied", journal);
}
await checked(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "ai_direct_source_review_20261102",
    metadata_json: {
      target_ids: specs.map((s) => s.id),
      approved: 5,
      source_snapshot: "source-review-20261102",
    },
  }),
);
journal.completed_at = new Date().toISOString();
await save("applied", journal);
console.log(
  JSON.stringify({
    approved: journal.items.length,
    verified: journal.items.filter((x) => x.phase === "verified").length,
  }),
);
