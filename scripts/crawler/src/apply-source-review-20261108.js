import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen incident decisions, not a reusable automatic approval rule.
const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261108/", import.meta.url),
);
const read = async (n) =>
  JSON.parse(await fs.readFile(`${root}/${n}.json`, "utf8"));
const save = async (n, v) =>
  fs.writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2));
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
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
const same = (a, b, label) =>
  assert.deepEqual(canonical(a), canonical(b), label);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261108"));
const [plan, backup] = await Promise.all([read("plan"), read("backup")]);
const hash = sha(plan);
assert.equal(
  hash,
  "0db47e973df4f54796258be57336bf1ff4e68df64c093e2af2a9e8e71b649be2",
);
assert.equal(plan.today_kst, "2026-11-08");
assert.equal(backup.length, 60);
assert.deepEqual(
  plan.items.map((x) => x.n),
  [0, 2, 9, 32, 34, 35, 36, 44, 46, 49, 52, 58],
);
const counts = {
  approved: 12,
  published: 7,
  closed: 5,
  held: 48,
  thumbnailReplacements: 2,
  removedImageRelations: 2,
};
assert.equal(
  plan.items.filter((x) => x.status === "published").length,
  counts.published,
);
assert.equal(
  plan.items.filter((x) => x.status === "closed").length,
  counts.closed,
);
assert.equal(plan.held.length, counts.held);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Inspect journal before recovery; never replay",
);
if (apply) assert.equal((await read("dry-run")).hash, hash);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (u, o) => {
        if (!apply) assert.equal(o?.method || "GET", "GET");
        return fetch(u, { ...o, signal: AbortSignal.timeout(30000) });
      },
    },
  },
);
const check = async (q) => {
  const r = await q;
  assert.ifError(r.error);
  return r.data;
};
const select =
  "*,poster_links(*),poster_images(*),poster_categories(*),poster_audiences(*)";
const relations = [
  "poster_links",
  "poster_images",
  "poster_categories",
  "poster_audiences",
];
const allowed = new Set([
  "title",
  "organizer_name",
  "application_organization_name",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "deadline_type",
  "eligibility_summary",
  "target_age_min",
  "target_age_max",
  "application_method",
  "event_location",
  "contact_info",
  "participation_fee",
  "required_documents",
  "recruitment_count",
  "benefits_summary",
  "summary_short",
  "summary_long",
  "category_id",
  "thumbnail_url",
]);
const current = await check(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      plan.items.map((x) => x.id),
    ),
);
for (const item of plan.items) {
  const old = backup[item.n];
  assert.equal(item.id, old.id);
  assert.equal(old.poster_status, "review");
  same(
    current.find((r) => r.id === item.id),
    old,
    `Concurrent change ${item.n}`,
  );
  assert(
    !old.field_verification?.humanStructuredVerification,
    "Human judgment must be explicitly reconciled",
  );
  assert(!old.field_verification?.sourceReviewWriteInProgress);
  assert(
    item.approved &&
      item.reason &&
      item.resolution &&
      item.sources.some((r) => r.status === 200),
  );
  assert.equal(item.image.status, 200);
  for (const key of Object.keys(item.patch)) assert(allowed.has(key), key);
  assert(
    item.patch.summary_short &&
      item.patch.summary_long &&
      item.patch.category_id,
  );
  assert(
    ["fixed", "until_exhausted", "unknown"].includes(item.patch.deadline_type),
  );
  for (const key of [
    "application_start_at",
    "application_end_at",
    "event_start_at",
    "event_end_at",
  ])
    if (item.patch[key]) assert(Number.isFinite(Date.parse(item.patch[key])));
  for (const [s, e] of [
    ["application_start_at", "application_end_at"],
    ["event_start_at", "event_end_at"],
  ])
    if (item.patch[s] && item.patch[e])
      assert(Date.parse(item.patch[s]) <= Date.parse(item.patch[e]));
  if (item.patch.deadline_type === "unknown")
    assert.equal(item.patch.application_end_at, null);
  if (item.status === "published" && item.patch.deadline_type === "fixed")
    assert(Date.parse(item.patch.application_end_at) > Date.now());
  for (const id of item.removeAudiences)
    assert(old.poster_audiences.some((r) => r.audience_id === id));
  for (const id of item.removeImages)
    assert(old.poster_images.some((r) => r.id === id));
  for (const p of item.imagePatches) {
    assert(old.poster_images.some((r) => r.id === p.id));
    assert.deepEqual(Object.keys(p.patch), ["storage_path"]);
    assert(!item.removeImages.includes(p.id));
  }
  for (const p of item.linkPatches)
    assert(old.poster_links.some((r) => r.id === p.id));
  for (const link of item.addLinks)
    assert(
      /^https:\/\//.test(link.url) &&
        !old.poster_links.some((r) => r.url === link.url),
    );
  if (item.patch.thumbnail_url) {
    assert([2, 46].includes(item.n));
    assert.equal(item.replacementImage.status, 200);
    assert.equal(item.replacementImage.url, item.patch.thumbnail_url);
    assert(
      old.poster_images.some(
        (r) => r.storage_path === item.patch.thumbnail_url,
      ),
    );
  }
}
console.log(
  JSON.stringify({ mode: apply ? "apply" : "dry-run", ...counts, hash }),
);
if (!apply) {
  await save("dry-run", { hash, passed: true, ...counts });
  process.exit(0);
}
const journal = { hash, items: [] };
for (const item of plan.items) {
  const old = backup[item.n];
  same(
    await check(db.from("posters").select(select).eq("id", item.id).single()),
    old,
    `Changed before claim ${item.n}`,
  );
  const verification = structuredClone(old.field_verification || {});
  verification.sourceReview20261108 = {
    reviewer: "Codex source and visual review",
    reviewedAt: new Date().toISOString(),
    approved: true,
    status: item.status,
    reason: item.reason,
    resolution: item.resolution,
    sources: item.sources,
    image: item.image,
    replacementImage: item.replacementImage || null,
    datePrecision: plan.datePrecision,
    backupSha256: sha(old),
    planSha256: hash,
    removedImages: old.poster_images.filter((r) =>
      item.removeImages.includes(r.id),
    ),
    removedAudiences: old.poster_audiences.filter((r) =>
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
      participationFee: item.patch.participation_fee,
    },
    updatedBy: "source-review-20261108",
  };
  if (item.removeAudiences.length)
    verification.classification = {
      ...verification.classification,
      audiences: [],
    };
  if (item.patch.thumbnail_url) {
    verification.sourceReview20261108.previousImageEvidence =
      old.field_verification?.posterImageOcr || null;
    // Retain the actual historical AI result and explicitly bind it to its old image.
    // The unavailable external classifier is never represented as a successful run.
    verification.posterImageOcr = {
      ...verification.posterImageOcr,
      evidenceImageUrl: old.thumbnail_url,
      currentImageSourceReview: {
        imageUrl: item.patch.thumbnail_url,
        reviewer:
          "Codex visual comparison against the official notice and full poster",
        matched: ["title", "event dates", "organizer", "program"],
        isPoster: true,
        checkedAt: new Date().toISOString(),
        separateClassifierStatus: "unavailable: OPENAI_API_KEY not configured",
      },
    };
  }
  same(
    verification.humanStructuredVerification,
    old.field_verification?.humanStructuredVerification,
  );
  journal.items.push({ n: item.n, id: item.id, phase: "claim" });
  await save("applied", journal);
  const claim = await check(
    db
      .from("posters")
      .update({
        field_verification: {
          ...old.field_verification,
          sourceReviewWriteInProgress: "20261108",
        },
      })
      .eq("id", item.id)
      .eq("poster_status", "review")
      .eq("updated_at", old.updated_at)
      .select("id,updated_at"),
  );
  assert.equal(claim.length, 1);
  for (const id of item.removeAudiences)
    await check(
      db
        .from("poster_audiences")
        .delete()
        .eq("poster_id", item.id)
        .eq("audience_id", id),
    );
  for (const id of item.removeImages)
    await check(
      db.from("poster_images").delete().eq("poster_id", item.id).eq("id", id),
    );
  const expectedImages = structuredClone(
    old.poster_images.filter((r) => !item.removeImages.includes(r.id)),
  );
  for (const p of item.imagePatches) {
    await check(
      db
        .from("poster_images")
        .update(p.patch)
        .eq("poster_id", item.id)
        .eq("id", p.id),
    );
    Object.assign(
      expectedImages.find((r) => r.id === p.id),
      p.patch,
    );
  }
  const expectedLinks = structuredClone(old.poster_links);
  for (const p of item.linkPatches) {
    await check(
      db
        .from("poster_links")
        .update(p.patch)
        .eq("poster_id", item.id)
        .eq("id", p.id),
    );
    Object.assign(
      expectedLinks.find((r) => r.id === p.id),
      p.patch,
    );
  }
  for (const link of item.addLinks) {
    const added = await check(
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
    await check(
      db
        .from("poster_categories")
        .delete()
        .eq("poster_id", item.id)
        .eq("category_id", rel.category_id),
    );
  if (
    !old.poster_categories.some((r) => r.category_id === item.patch.category_id)
  )
    await check(
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
  const written = await check(
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
  const after = await check(
    db.from("posters").select(select).eq("id", item.id).single(),
  );
  for (const [key, value] of Object.entries(old))
    if (![...relations, "updated_at", ...Object.keys(patch)].includes(key))
      same(after[key], value, `Unexpected ${item.n}/${key}`);
  for (const [key, value] of Object.entries(patch))
    if (key.endsWith("_at") && value)
      assert.equal(Date.parse(after[key]), Date.parse(value));
    else same(after[key], value, `Patch ${item.n}/${key}`);
  same(after.poster_images, expectedImages);
  same(after.poster_links, expectedLinks);
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
    JSON.stringify({ n: item.n, status: item.status, verified: true }),
  );
}
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "source_review_20261108",
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
