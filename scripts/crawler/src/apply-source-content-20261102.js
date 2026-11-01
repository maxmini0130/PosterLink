import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Incident-scoped, reviewed plan. Original text and removed link relations remain
// in the snapshot and field_verification archive; no poster is deleted/published.
const root = fileURLToPath(
  new URL(
    "../../../data/results/source-review-20261102-followup/",
    import.meta.url,
  ),
);
const expectedIds = [
  "717bfc55-73cd-42fe-b221-b598e503c8b9",
  "d9badcf3-0b8a-4df7-86ba-26cfc35cd7a1",
  "affcc302-3dcb-46b1-a098-ae0c4f320ad0",
  "0eccbbb6-40bf-4556-87e5-9a38a5f4a756",
  "40b85fe8-e76f-42d0-b4a3-76f99430ea5b",
  "acc2cb4e-4469-423a-8858-181c5201b2b1",
  "f66471b0-6242-46f3-8fb2-b2150ab94575",
  "eaf45461-a294-4e8e-a5cb-b1999d08f7eb",
  "ab4ac090-5885-4ca1-a40e-e697581e1055",
  "5e6d7c1a-889f-45b2-a848-81b7d020d377",
  "f9a04abc-2e80-4685-80f5-51412f124ff7",
  "86d33f6a-bd33-47e9-a56b-3a81e636be7e",
  "1b481bf9-09af-43f3-880a-baa7597ee414",
  "d2e211c6-3711-47ad-87da-4da13c1c59d0",
  "d266f210-fd0d-495f-acbd-3072fcbf36f6",
  "555711da-82c5-489b-9b00-892fbf00e436",
  "3e6a0f12-e5cd-40f8-b9bf-2bdf65aa9e92",
  "3ffe2ba6-bb3e-42f6-8241-a4275f167202",
  "21936c85-4d24-4c62-9dbd-71bcea2c64fa",
  "8708ca07-d8b3-4d65-8c97-5d25607e5f47",
  "aeb79dfc-3708-48a6-9f5f-060631abd573",
  "67ee7c0b-dd0e-4578-8123-ac71303938ca",
  "8c0ab9d9-e06a-4721-8cf7-95a2ac22bfb2",
];
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_CONTENT_20261102"));
const read = async (name) =>
  JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
const save = async (name, value) =>
  fs.writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2));
const [plan, backup] = await Promise.all([read("plan"), read("backup")]);
assert.equal(plan.today_kst, "2026-11-02");
assert.deepEqual(
  plan.items.map((d) => d.id),
  expectedIds,
);
assert.equal(backup.length, 23);
const hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
const journalExists = await fs.access(`${root}/applied-content.json`).then(
  () => true,
  () => false,
);
assert(
  !journalExists,
  "An apply journal exists. Inspect partial/completed work before recovery.",
);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) => {
        if (!apply) assert.equal(options?.method || "GET", "GET");
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
const sorted = (rows) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const normalized = (r) => ({
  ...r,
  ...Object.fromEntries(
    ["poster_links", "poster_categories", "poster_images"].map((k) => [
      k,
      sorted(r[k]),
    ]),
  ),
});
const current = await checked(
  db.from("posters").select(select).in("id", expectedIds),
);
const allowed = new Set([
  "title",
  "organizer_name",
  "eligibility_summary",
  "summary_short",
  "summary_long",
  "event_location",
  "contact_info",
  "application_method",
  "required_documents",
  "application_organization_name",
  "participation_fee",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "deadline_type",
  "target_age_min",
  "target_age_max",
  "field_verification",
]);
const linkKeys = ["id", "poster_id", "url", "title", "link_type", "is_primary"];
const linkValues = (link) =>
  Object.fromEntries(linkKeys.map((k) => [k, link[k]]));
for (const d of plan.items) {
  const before = backup.find((r) => r.id === d.id);
  assert.equal(before.poster_status, "review");
  assert.deepEqual(
    normalized(current.find((r) => r.id === d.id)),
    normalized(before),
  );
  for (const [key, value] of Object.entries(d.patch)) {
    assert(
      allowed.has(key) && Object.hasOwn(before, key),
      `Unsupported field ${key}`,
    );
    if (key.endsWith("_at") && value)
      assert(Number.isFinite(Date.parse(value)));
  }
  assert(
    d.patch.summary_long.length > 300 && d.patch.summary_short.length > 20,
  );
  const review = d.patch.field_verification.sourceReview20261102Followup;
  assert.deepEqual(review.previousVerification, before.field_verification);
  assert.equal(review.previousSummaryLong, before.summary_long);
  assert.deepEqual(
    d.patch.field_verification.humanStructuredVerification,
    before.field_verification?.humanStructuredVerification,
  );
  assert.equal(d.approved, false);
  assert.deepEqual(
    sorted(review.archivedUnrelatedLinks.map((l) => l.id)),
    sorted(d.removed_link_ids),
  );
  for (const id of d.removed_link_ids)
    assert(before.poster_links.some((l) => l.id === id));
  assert.deepEqual(
    sorted(
      before.poster_links
        .filter((l) => !d.removed_link_ids.includes(l.id))
        .map((l) => l.id),
    ),
    sorted(
      d.links
        .filter((l) => before.poster_links.some((old) => old.id === l.id))
        .map((l) => l.id),
    ),
  );
  assert.equal(d.links.filter((l) => l.is_primary).length, 1);
  for (const l of d.links) {
    assert.equal(l.poster_id, d.id);
    assert(["http:", "https:"].includes(new URL(l.url).protocol));
    assert(
      ["official_apply", "official_notice", "other"].includes(l.link_type),
    );
  }
  for (const prefix of ["application", "event"]) {
    const start = Object.hasOwn(d.patch, `${prefix}_start_at`)
      ? d.patch[`${prefix}_start_at`]
      : before[`${prefix}_start_at`];
    const end = Object.hasOwn(d.patch, `${prefix}_end_at`)
      ? d.patch[`${prefix}_end_at`]
      : before[`${prefix}_end_at`];
    if (start && end)
      assert(Date.parse(start) <= Date.parse(end), `Date order ${d.id}`);
  }
}
console.log(
  JSON.stringify({
    apply,
    targets: 23,
    planHash: hash,
    statusChanges: 0,
    unrelatedLinkRelations: plan.items.reduce(
      (n, d) => n + d.removed_link_ids.length,
      0,
    ),
    condition:
      "fixed IDs, entire original snapshot, review status, updated_at and reviewed plan hash",
  }),
);
if (!apply) {
  await save("dry-run-content", { passed: true, targets: 23, planHash: hash });
} else {
  assert.equal(
    (await read("dry-run-content")).planHash,
    hash,
    "Plan changed after dry-run",
  );
  const journal = { planHash: hash, items: [] };
  for (const d of plan.items) {
    const before = backup.find((r) => r.id === d.id);
    assert.deepEqual(
      normalized(
        await checked(
          db.from("posters").select(select).eq("id", d.id).single(),
        ),
      ),
      normalized(before),
    );
    const entry = { id: d.id, phase: "planned" };
    journal.items.push(entry);
    await save("applied-content", journal);
    const claim = await checked(
      db
        .from("posters")
        .update({
          field_verification: {
            ...before.field_verification,
            sourceContentWriteInProgress: {
              todayKst: "2026-11-02",
              planHash: hash,
            },
          },
        })
        .eq("id", d.id)
        .eq("poster_status", "review")
        .eq("updated_at", before.updated_at)
        .select("updated_at")
        .maybeSingle(),
    );
    assert(claim, "Concurrent poster change");
    entry.phase = "claimed";
    await save("applied-content", journal);
    for (const l of d.links) {
      const old = before.poster_links.find((x) => x.id === l.id);
      if (!old) await checked(db.from("poster_links").insert(linkValues(l)));
      else if (
        JSON.stringify(linkValues(old)) !== JSON.stringify(linkValues(l))
      ) {
        const changed = await checked(
          db
            .from("poster_links")
            .update(
              Object.fromEntries(
                linkKeys
                  .filter((k) => !["id", "poster_id"].includes(k))
                  .map((k) => [k, l[k]]),
              ),
            )
            .eq("id", l.id)
            .eq("poster_id", d.id)
            .eq("url", old.url)
            .select("id")
            .maybeSingle(),
        );
        assert(changed, "Concurrent link update");
      }
    }
    if (d.removed_link_ids.length) {
      const removed = await checked(
        db
          .from("poster_links")
          .delete()
          .eq("poster_id", d.id)
          .in("id", d.removed_link_ids)
          .select("id"),
      );
      assert.deepEqual(
        sorted(removed.map((x) => x.id)),
        sorted(d.removed_link_ids),
      );
    }
    entry.phase = "links-corrected";
    await save("applied-content", journal);
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
    assert(changed, "Concurrent final update");
    entry.phase = "fields-corrected";
    await save("applied-content", journal);
    const after = await checked(
      db.from("posters").select(select).eq("id", d.id).single(),
    );
    for (const [k, v] of Object.entries(d.patch)) {
      if (k.endsWith("_at") && v)
        assert.equal(Date.parse(after[k]), Date.parse(v));
      else assert.deepEqual(after[k], v);
    }
    assert.deepEqual(
      sorted(after.poster_links.map(linkValues)),
      sorted(d.links.map(linkValues)),
    );
    assert.deepEqual(sorted(after.poster_images), sorted(before.poster_images));
    assert.deepEqual(
      sorted(after.poster_categories),
      sorted(before.poster_categories),
    );
    for (const [k, v] of Object.entries(before)) {
      if (
        !Object.hasOwn(d.patch, k) &&
        ![
          "updated_at",
          "poster_links",
          "poster_images",
          "poster_categories",
        ].includes(k)
      )
        assert.deepEqual(after[k], v, `Unexpected change ${k}`);
    }
    await save(`content-after-${d.id}`, after);
    entry.phase = "verified";
    await save("applied-content", journal);
    console.log(
      JSON.stringify({ verified: journal.items.length, targets: 23 }),
    );
  }
  await checked(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "update",
      action_reason: "direct_source_content_review_20261102",
      metadata_json: {
        target_ids: expectedIds,
        plan_hash: hash,
        corrected: 23,
        published: 0,
        archived_unrelated_links: 69,
      },
    }),
  );
  journal.completed_at = new Date().toISOString();
  await save("applied-content", journal);
}
