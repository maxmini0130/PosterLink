import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Incident-only manual source review; evidence/backups stay outside Git.
const root = fileURLToPath(
  new URL("../../../data/results/deep-review-20261107/", import.meta.url),
);
const read = async (name) =>
  JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
const save = async (name, value) =>
  fs.writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2));
const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
const same = (a, b, message) =>
  assert.deepEqual(canonical(a), canonical(b), message);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=DEEP_REVIEW_20261107"));
const [plan, backup] = await Promise.all([read("plan"), read("backup")]);
const hash = sha(plan);
assert.equal(
  hash,
  "74d8aa4f3445f609486645e9fadc0d86e1603b209069bb80046b488af568c5dc",
);
assert.equal(backup.length, 86);
assert.equal(plan.today_kst, "2026-11-07");
assert.deepEqual(
  plan.items.map((x) => x.i),
  [
    0, 4, 9, 12, 13, 15, 17, 25, 29, 40, 41, 42, 46, 50, 51, 53, 56, 57, 62, 70,
    71, 72, 77, 86, 97, 100, 101, 102,
  ],
);
assert.equal(plan.items.filter((x) => x.status === "published").length, 25);
assert.equal(plan.items.filter((x) => x.status === "closed").length, 3);
assert.equal(plan.held.length, 58);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Existing journal: inspect before recovery; never replay",
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
  "source_key",
]);
const current = await checked(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      plan.items.map((x) => x.id),
    ),
);
for (const item of plan.items) {
  const old = backup.find((r) => r.id === item.id);
  assert.equal(old.poster_status, "review");
  same(
    current.find((r) => r.id === item.id),
    old,
    `Concurrent change ${item.i}`,
  );
  assert(
    item.approved && item.reason && item.sources.some((s) => s.status === 200),
  );
  assert.equal(item.image.status, 200);
  assert(
    !old.field_verification?.humanStructuredVerification,
    "Human judgement needs explicit reconciliation",
  );
  assert(!old.field_verification?.sourceReviewWriteInProgress);
  assert(
    item.patch.summary_short &&
      item.patch.summary_long &&
      item.patch.category_id,
  );
  assert(
    ["fixed", "ongoing", "until_exhausted", "unknown"].includes(
      item.patch.deadline_type,
    ),
  );
  for (const key of Object.keys(item.patch)) assert(allowed.has(key), key);
  for (const key of [
    "application_start_at",
    "application_end_at",
    "event_start_at",
    "event_end_at",
  ])
    if (item.patch[key])
      assert(Number.isFinite(Date.parse(item.patch[key])), key);
  for (const [start, end] of [
    ["application_start_at", "application_end_at"],
    ["event_start_at", "event_end_at"],
  ])
    if (item.patch[start] && item.patch[end])
      assert(Date.parse(item.patch[start]) <= Date.parse(item.patch[end]));
  if (item.patch.deadline_type === "unknown")
    assert.equal(item.patch.application_end_at, null);
  if (item.status === "published" && item.patch.deadline_type === "fixed")
    assert(
      Date.parse(item.patch.application_end_at) >=
        Date.parse("2026-11-07T00:00:00+09:00"),
    );
  for (const id of item.removeAudiences)
    assert(old.poster_audiences.some((r) => r.audience_id === id));
  for (const id of item.removeImages)
    assert(old.poster_images.some((r) => r.id === id));
  const keptImages = old.poster_images.filter(
    (r) => !item.removeImages.includes(r.id),
  );
  assert(
    keptImages.some((r) => r.storage_path === old.thumbnail_url),
    "Keep reviewed thumbnail",
  );
  for (const id of item.removeLinks)
    assert(old.poster_links.some((r) => r.id === id));
  for (const link of item.linkPatches)
    assert(
      old.poster_links.some((r) => r.id === link.id) &&
        !item.removeLinks.includes(link.id),
    );
  for (const link of item.addLinks)
    assert(
      !old.poster_links.some((r) => r.url === link.url) &&
        /^https:\/\//.test(link.url),
    );
  if (item.patch.source_key && item.patch.source_key !== old.source_key) {
    const duplicates = await checked(
      db
        .from("posters")
        .select("id")
        .eq("source_key", item.patch.source_key)
        .neq("id", item.id),
    );
    assert.equal(duplicates.length, 0, "Duplicate stable source key");
  }
}
const counts = {
  targets: 28,
  published: 25,
  closed: 3,
  held: 58,
  removedImageRelations: 37,
};
console.log(
  JSON.stringify({ mode: apply ? "apply" : "dry-run", ...counts, hash }),
);
if (!apply) {
  await save("dry-run", { hash, passed: true, ...counts });
  process.exit(0);
}
const journal = { hash, items: [] };
for (const item of plan.items) {
  const old = backup.find((r) => r.id === item.id);
  // Recheck the complete row and relations immediately before claiming it.
  same(
    await checked(db.from("posters").select(select).eq("id", item.id).single()),
    old,
    `Changed before claim ${item.i}`,
  );
  const verification = structuredClone(old.field_verification || {});
  verification.sourceDeepReview20261107 = {
    reviewer: "Codex manual source, public application form and poster review",
    reviewedAt: new Date().toISOString(),
    approved: true,
    status: item.status,
    reason: item.reason,
    sources: item.sources,
    image: item.image,
    datePrecision: plan.datePrecision,
    backupSha256: sha(old),
    planSha256: hash,
    removedImageRelations: old.poster_images.filter((r) =>
      item.removeImages.includes(r.id),
    ),
    removedLinks: old.poster_links.filter((r) =>
      item.removeLinks.includes(r.id),
    ),
    removedAudienceRelations: old.poster_audiences.filter((r) =>
      item.removeAudiences.includes(r.audience_id),
    ),
  };
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
    updatedBy: "deep-review-20261107",
  };
  if (item.removeAudiences.length)
    verification.classification = {
      ...verification.classification,
      audiences: [],
    };
  same(
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
          sourceReviewWriteInProgress: "deep-20261107",
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
  for (const id of item.removeImages)
    await checked(
      db.from("poster_images").delete().eq("poster_id", item.id).eq("id", id),
    );
  for (const id of item.removeLinks)
    await checked(
      db.from("poster_links").delete().eq("poster_id", item.id).eq("id", id),
    );
  const expectedLinks = structuredClone(
    old.poster_links.filter((r) => !item.removeLinks.includes(r.id)),
  );
  for (const link of item.linkPatches) {
    await checked(
      db
        .from("poster_links")
        .update(link.patch)
        .eq("poster_id", item.id)
        .eq("id", link.id),
    );
    Object.assign(
      expectedLinks.find((r) => r.id === link.id),
      link.patch,
    );
  }
  for (const link of item.addLinks) {
    const added = await checked(
      db
        .from("poster_links")
        .insert({ ...link, poster_id: item.id })
        .select("*")
        .single(),
    );
    for (const [key, value] of Object.entries(link))
      assert.deepEqual(added[key], value);
    expectedLinks.push(added);
  }
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
    !old.poster_categories.some((r) => r.category_id === item.patch.category_id)
  )
    await checked(
      db
        .from("poster_categories")
        .insert({ poster_id: item.id, category_id: item.patch.category_id }),
    );
  const patch = {
    ...item.patch,
    field_verification: verification,
    poster_status: item.status,
    published_at: new Date().toISOString(),
    rejection_reason: null,
  };
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
      same(after[key], value, `Unexpected ${item.i}/${key}`);
  for (const [key, value] of Object.entries(patch))
    if (key.endsWith("_at") && value)
      assert.equal(Date.parse(after[key]), Date.parse(value));
    else same(after[key], value, `Patch ${item.i}/${key}`);
  same(after.poster_links, expectedLinks);
  same(
    after.poster_images,
    old.poster_images.filter((r) => !item.removeImages.includes(r.id)),
  );
  same(
    after.poster_audiences,
    old.poster_audiences.filter(
      (r) => !item.removeAudiences.includes(r.audience_id),
    ),
  );
  same(
    after.poster_categories.map((r) => r.category_id),
    [item.patch.category_id],
  );
  await save(`after-${item.id}`, after);
  journal.items.at(-1).phase = "verified";
  await save("applied", journal);
  console.log(
    JSON.stringify({ i: item.i, status: item.status, verified: true }),
  );
}
await checked(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "deep_source_review_20261107",
    metadata_json: {
      ...counts,
      approved: plan.items.map((x) => x.id),
      planSha256: hash,
    },
  }),
);
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(JSON.stringify({ verified: journal.items.length, ...counts }));
