import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Correct this one mistakenly held event; no general duplicate/approval rule changes.
const root = fileURLToPath(
  new URL("../../../data/results/sinchon-review-20261108/", import.meta.url),
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
if (apply) assert(process.argv.includes("--confirm=SINCHON_REVIEW_20261108"));
const [plan, snapshot] = await Promise.all([read("plan"), read("snapshot")]);
const hash = sha(plan);
assert.equal(
  hash,
  "5500572750d888052089618cf3c1b813f010f860310b0ea8dde46004d0e257a3",
);
assert.equal(plan.id, "a73a432f-10e8-4c71-8d8d-7b644b84dab2");
const old = snapshot.find((r) => r.id === plan.id);
assert.equal(sha(old), plan.backupSha256);
assert.equal(old.poster_status, "review");
assert(!old.field_verification?.humanStructuredVerification);
assert(!old.field_verification?.sourceReviewWriteInProgress);
assert.equal(plan.sourceCategory, "마음건강");
assert.equal(plan.schedule, "2026-11-14 17:00 ~ 19:00");
assert(plan.sources.every((s) => s.status === 200));
assert.equal(plan.images.length, 3);
assert(plan.images.every((s) => s.status === 200));
assert(
  old.poster_images.some((r) => r.storage_path === plan.patch.thumbnail_url),
);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Inspect existing journal; never replay",
);
if (apply) assert.equal((await read("dry-run")).hash, hash);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false },
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
same(
  await check(db.from("posters").select(select).eq("id", plan.id).single()),
  old,
  "Concurrent change",
);
assert.equal(
  (
    await check(
      db
        .from("poster_links")
        .select("poster_id")
        .eq("url", "https://forms.gle/THucv5nkLgiesNR69")
        .neq("poster_id", plan.id),
    )
  ).length,
  0,
  "Another row now has the same application form",
);
assert.equal(
  (
    await check(
      db
        .from("posters")
        .select("id")
        .eq("source_key", old.source_key)
        .neq("id", plan.id),
    )
  ).length,
  0,
  "Duplicate source now exists",
);
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    targets: 1,
    status: "published",
    category: "건강/의료 (원문: 마음건강)",
    hash,
  }),
);
if (!apply) {
  await save("dry-run", { hash, passed: true });
  process.exit(0);
}
const journal = { hash, id: plan.id, phase: "claim" };
await save("applied", journal);
const claim = await check(
  db
    .from("posters")
    .update({
      field_verification: {
        ...old.field_verification,
        sourceReviewWriteInProgress: "sinchon-20261108",
      },
    })
    .eq("id", plan.id)
    .eq("poster_status", "review")
    .eq("updated_at", old.updated_at)
    .select("id,updated_at"),
);
assert.equal(claim.length, 1);
const verification = structuredClone(old.field_verification || {});
verification.sourceReview20261108Sinchon = {
  approved: true,
  status: "published",
  reviewer: "Codex source and visual re-review",
  reviewedAt: new Date().toISOString(),
  reason: plan.reason,
  sourceCategory: plan.sourceCategory,
  schedule: plan.schedule,
  sources: plan.sources,
  images: plan.images,
  backupSha256: plan.backupSha256,
  planSha256: hash,
  datePrecision: plan.datePrecision,
  previousHoldMetadata: verification.directSourceReviewHold || null,
  previousImageEvidence: verification.posterImageOcr || null,
};
delete verification.directSourceReviewHold;
verification.readableNotice = {
  ...verification.readableNotice,
  summaryShort: plan.patch.summary_short,
  summaryLong: plan.patch.summary_long,
  facts: {
    ...verification.readableNotice?.facts,
    target: plan.patch.eligibility_summary,
    applicationMethod: plan.patch.application_method,
    location: plan.patch.event_location,
    sourceCategory: "마음건강",
  },
  updatedBy: "sinchon-review-20261108",
};
verification.classification = {
  ...verification.classification,
  categories: [
    {
      code: "CAT_HEALTH",
      label: "건강/의료",
      source: "official-source-review",
      evidence: "원문의 마음건강 분류 및 펫로스 애도 모임 내용",
      sourceLabel: "마음건강",
    },
  ],
};
verification.posterImageOcr = {
  ...verification.posterImageOcr,
  evidenceImageUrl: old.thumbnail_url,
  currentImageSourceReview: {
    imageUrl: plan.patch.thumbnail_url,
    reviewer: "Codex visual inspection",
    isPoster: true,
    matched: [
      "눈물은 건강에 좋다",
      "2026-11-14 17:00",
      "신촌문화발전소",
      "주최·주관·후원",
    ],
  },
};
same(
  verification.humanStructuredVerification,
  old.field_verification?.humanStructuredVerification,
);
for (const rel of old.poster_categories.filter(
  (r) => r.category_id !== plan.patch.category_id,
))
  await check(
    db
      .from("poster_categories")
      .delete()
      .eq("poster_id", plan.id)
      .eq("category_id", rel.category_id),
  );
if (
  !old.poster_categories.some((r) => r.category_id === plan.patch.category_id)
)
  await check(
    db
      .from("poster_categories")
      .insert({ poster_id: plan.id, category_id: plan.patch.category_id }),
  );
for (const id of plan.removeAudiences)
  await check(
    db
      .from("poster_audiences")
      .delete()
      .eq("poster_id", plan.id)
      .eq("audience_id", id),
  );
await check(
  db
    .from("poster_images")
    .update({ storage_path: plan.patch.thumbnail_url })
    .eq("id", plan.thumbnailRelationId)
    .eq("poster_id", plan.id),
);
const patch = {
  ...plan.patch,
  poster_status: "published",
  published_at: new Date().toISOString(),
  rejection_reason: null,
  field_verification: verification,
};
const written = await check(
  db
    .from("posters")
    .update(patch)
    .eq("id", plan.id)
    .eq("poster_status", "review")
    .eq("updated_at", claim[0].updated_at)
    .select("id"),
);
assert.equal(written.length, 1);
journal.phase = "written";
await save("applied", journal);
const after = await check(
  db.from("posters").select(select).eq("id", plan.id).single(),
);
for (const [key, value] of Object.entries(old))
  if (
    ![
      "updated_at",
      "poster_links",
      "poster_images",
      "poster_categories",
      "poster_audiences",
      ...Object.keys(patch),
    ].includes(key)
  )
    same(after[key], value, `Unexpected ${key}`);
for (const [key, value] of Object.entries(patch))
  if (key.endsWith("_at") && value)
    assert.equal(Date.parse(after[key]), Date.parse(value));
  else same(after[key], value, `Patch ${key}`);
same(after.poster_links, old.poster_links);
same(
  after.poster_categories.map((r) => r.category_id),
  [plan.patch.category_id],
);
same(
  after.poster_audiences,
  old.poster_audiences.filter(
    (r) => !plan.removeAudiences.includes(r.audience_id),
  ),
);
same(
  after.poster_images,
  old.poster_images.map((r) =>
    r.id === plan.thumbnailRelationId
      ? { ...r, storage_path: plan.patch.thumbnail_url }
      : r,
  ),
);
await save("after", after);
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: plan.id,
    action_type: "approve",
    action_reason: "resolve_incorrect_duplicate_hold_sinchon_20261108",
    metadata_json: {
      reason: plan.reason,
      planSha256: hash,
      sourceCategory: "마음건강",
      category: "건강/의료",
    },
  }),
);
journal.phase = "verified";
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(
  JSON.stringify({ id: plan.id, approved: true, readbackVerified: true }),
);
