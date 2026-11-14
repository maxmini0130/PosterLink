import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-14 source-review decisions for the 16-row review queue, including
// the 3 rows held on 2026-11-12 (their 11-12 held plan went stale when the crawler
// refreshed posterImageOcr on 11-13). Not a reusable automatic approval rule.
// Usage: node src/apply-source-review-20261114.js            (dry-run, GET only)
//        node src/apply-source-review-20261114.js --apply --confirm=SOURCE_REVIEW_20261114
const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261114/", import.meta.url),
);
const PLAN_SHA256 = process.env.SOURCE_REVIEW_20261114_PLAN_SHA256;
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
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261114"));
const [plan, backup] = await Promise.all([read("plan"), read("backup")]);
const hash = sha(plan);
assert(
  PLAN_SHA256,
  "Set SOURCE_REVIEW_20261114_PLAN_SHA256 to the reviewed plan hash",
);
assert.equal(hash, PLAN_SHA256, "Plan changed after review");
assert.equal(plan.today_kst, "2026-11-14");
assert.equal(backup.length, 16);
const counts = {
  approved: plan.items.length,
  published: plan.items.filter((x) => x.status === "published").length,
  closed: plan.items.filter((x) => x.status === "closed").length,
  rejected: plan.rejected.length,
  held: plan.held.length,
  thumbnailReplacements: plan.items.filter((x) => x.patch.thumbnail_url).length,
  removedImageRelations: plan.items.reduce(
    (s, x) => s + x.removeImages.length,
    0,
  ),
  removedLinks: plan.items.reduce((s, x) => s + x.removeLinks.length, 0),
};
assert.equal(counts.approved + counts.rejected + counts.held, backup.length);
assert.equal(counts.published + counts.closed, counts.approved);
assert.equal(
  new Set([
    ...plan.items.map((x) => x.n),
    ...plan.rejected.map((x) => x.n),
    ...plan.held.map((x) => x.n),
  ]).size,
  backup.length,
);
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
const deadlineKeys = [
  "deadline_status",
  "deadline_source",
  "deadline_time_verified",
  "deadline_note",
];
const audienceIds = new Set([
  "93cac6ad-69df-414a-9eba-983d03292e30",
  "bae228e2-01cc-4059-bad6-595b72442b08",
  "bde3d1fe-3190-4e85-8c5e-4136fa2fb8a0",
  "81fa32bd-9319-48b4-b162-625c7f02b2e7",
  "94f74165-1afc-4144-91b0-e1829a733086",
  "4e530bcd-8873-4527-a185-631ef3dd50b4",
]);
const now = Date.parse("2026-11-14T00:00:00+09:00");
const current = await check(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      backup.map((x) => x.id),
    ),
);
assert.equal(current.length, backup.length);
for (const held of plan.held) {
  assert.equal(backup[held.n].id, held.id);
  assert(held.reason);
  same(
    current.find((r) => r.id === held.id),
    backup[held.n],
    `Held row changed ${held.n}`,
  );
}
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
    item.reason &&
      item.resolution &&
      item.sources.some((r) => r.status === 200),
  );
  assert(["published", "closed"].includes(item.status));
  assert.equal(item.image.status, 200);
  for (const key of Object.keys(item.patch)) assert(allowed.has(key), key);
  assert(
    item.patch.summary_short &&
      item.patch.summary_long &&
      item.patch.category_id,
  );
  assert(item.patch.title && item.patch.organizer_name);
  assert(
    ["fixed", "until_exhausted", "ongoing", "unknown"].includes(
      item.patch.deadline_type,
    ),
  );
  for (const key of [
    "application_start_at",
    "application_end_at",
    "event_start_at",
    "event_end_at",
  ])
    if (item.patch[key])
      assert(Number.isFinite(Date.parse(item.patch[key])), key);
  for (const [s, e] of [
    ["application_start_at", "application_end_at"],
    ["event_start_at", "event_end_at"],
  ])
    if (item.patch[s] && item.patch[e])
      assert(
        Date.parse(item.patch[s]) <= Date.parse(item.patch[e]),
        `${item.n} ${s}`,
      );
  if (["unknown", "ongoing"].includes(item.patch.deadline_type))
    assert.equal(item.patch.application_end_at, null);
  if (item.patch.deadline_type === "fixed")
    assert(item.patch.application_end_at);
  if (item.status === "published" && item.patch.application_end_at)
    assert(
      Date.parse(item.patch.application_end_at) >= now,
      `${item.n} expired`,
    );
  if (item.status === "closed")
    assert(
      item.closedReason ||
        (item.patch.application_end_at &&
          Date.parse(item.patch.application_end_at) < now),
      `${item.n} closed without passed deadline`,
    );
  assert(!item.uploadImage);
  if (item.closedReason) assert.equal(typeof item.closedReason, "string");
  for (const id of item.removeLinks) {
    assert(old.poster_links.some((r) => r.id === id));
    assert(!item.linkPatches.some((p) => p.id === id));
    // A removed primary link must be replaced by another primary link.
    if (old.poster_links.find((r) => r.id === id).is_primary)
      assert(
        item.linkPatches.filter((p) => p.patch.is_primary === true).length +
          item.addLinks.filter((l) => l.is_primary === true).length ===
          1,
        `${item.n} removes its primary link without a replacement`,
      );
  }
  assert(
    old.poster_links.filter((r) => !item.removeLinks.includes(r.id)).length +
      item.addLinks.length >
      0,
    `${item.n} would be left without links`,
  );
  assert.deepEqual(Object.keys(item.deadline).sort(), [...deadlineKeys].sort());
  assert(["verified", "unverified"].includes(item.deadline.deadline_status));
  if (item.deadline.deadline_status === "verified") {
    assert(item.patch.application_end_at);
    assert(
      ["portal", "notice", "poster", "apply_page"].includes(
        item.deadline.deadline_source,
      ),
    );
  }
  if (item.deadline.deadline_time_verified) {
    assert.equal(item.deadline.deadline_status, "verified");
    assert(!/T23:59:59\+09:00$/.test(item.patch.application_end_at));
  }
  if (item.deadline.deadline_note)
    assert(item.deadline.deadline_note.length <= 80);
  for (const id of item.removeAudiences)
    assert(old.poster_audiences.some((r) => r.audience_id === id));
  for (const id of item.addAudiences)
    assert(
      audienceIds.has(id) &&
        !old.poster_audiences.some((r) => r.audience_id === id),
    );
  for (const id of item.removeImages) {
    assert(old.poster_images.some((r) => r.id === id));
    const path = old.poster_images.find((r) => r.id === id).storage_path;
    assert.notEqual(path, item.patch.thumbnail_url ?? old.thumbnail_url);
  }
  for (const p of item.linkPatches) {
    assert(old.poster_links.some((r) => r.id === p.id));
    for (const key of Object.keys(p.patch))
      assert(["title", "link_type", "url", "is_primary"].includes(key));
    if (p.patch.url) assert(/^https?:\/\//.test(p.patch.url));
  }
  for (const link of item.addLinks)
    assert(
      /^https?:\/\//.test(link.url) &&
        !old.poster_links.some((r) => r.url === link.url),
    );
  if (item.uploadImage) {
    const bytes = await fs.readFile(`${root}/${item.uploadImage.file}`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      item.uploadImage.sha256,
    );
    assert(
      item.uploadImage.storagePath.startsWith(
        "crawler/source-review-20261112/",
      ),
    );
    assert.equal(item.patch.thumbnail_url, item.uploadImage.publicUrl);
    assert(
      item.uploadImage.publicUrl.endsWith(
        `/storage/v1/object/public/poster-originals/${item.uploadImage.storagePath}`,
      ),
    );
    assert(/^https:\/\//.test(item.uploadImage.sourceUrl));
  } else if (item.patch.thumbnail_url) {
    assert.equal(item.replacementImage?.status, 200);
    assert.equal(item.replacementImage.url, item.patch.thumbnail_url);
    assert(
      old.poster_images.some(
        (r) => r.storage_path === item.patch.thumbnail_url,
      ),
    );
  }
}
for (const rej of plan.rejected) {
  const old = backup[rej.n];
  assert.equal(rej.id, old.id);
  assert.equal(old.poster_status, "review");
  assert(rej.reason && rej.rejection_reason);
  same(
    current.find((r) => r.id === rej.id),
    old,
    `Concurrent change ${rej.n}`,
  );
}
console.log(
  JSON.stringify({ mode: apply ? "apply" : "dry-run", ...counts, hash }),
);
if (!apply) {
  await save("dry-run", {
    hash,
    passed: true,
    ...counts,
    at: new Date().toISOString(),
  });
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
  const reviewedAt = new Date().toISOString();
  const verification = structuredClone(old.field_verification || {});
  verification.sourceReview20261114 = {
    reviewer: "Claude source and visual review",
    heldOn20261112: Boolean(item.originalN !== undefined),
    reviewedAt,
    approved: true,
    status: item.status,
    reason: item.reason,
    resolution: item.resolution,
    sources: item.sources,
    evidence: item.evidence,
    image: item.image,
    imageReview: item.imageReview,
    replacementImage: item.replacementImage || null,
    deadline: item.deadline,
    datePrecision: plan.datePrecision,
    backupSha256: sha(old),
    planSha256: hash,
    previous: Object.fromEntries(
      [...Object.keys(item.patch), ...deadlineKeys].map((k) => [
        k,
        old[k] ?? null,
      ]),
    ),
    removedImages: old.poster_images.filter((r) =>
      item.removeImages.includes(r.id),
    ),
    removedLinks: old.poster_links.filter((r) =>
      item.removeLinks.includes(r.id),
    ),
    closedReason: item.closedReason,
    uploadImage: item.uploadImage,
    overrides: item.overrides,
    removedAudiences: old.poster_audiences.filter((r) =>
      item.removeAudiences.includes(r.audience_id),
    ),
    addedAudiences: item.addAudiences,
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
    updatedBy: "source-review-20261114",
  };
  if (item.removeAudiences.length || item.addAudiences.length)
    verification.classification = {
      ...verification.classification,
      audiencesReviewedBy: "source-review-20261114",
    };
  if (item.patch.thumbnail_url) {
    // Keep the historical AI image result bound to the image it judged.
    verification.posterImageOcr = {
      ...verification.posterImageOcr,
      evidenceImageUrl: old.thumbnail_url,
      currentImageSourceReview: {
        imageUrl: item.patch.thumbnail_url,
        reviewer: "Claude visual comparison against the official notice",
        isPoster: true,
        note: item.imageReview?.note ?? null,
        checkedAt: reviewedAt,
        separateClassifierStatus: "not run in this review",
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
          sourceReviewWriteInProgress: "20261114",
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
  for (const id of item.addAudiences)
    await check(
      db
        .from("poster_audiences")
        .insert({ poster_id: item.id, audience_id: id }),
    );
  for (const id of item.removeImages)
    await check(
      db.from("poster_images").delete().eq("poster_id", item.id).eq("id", id),
    );
  const expectedImages = old.poster_images.filter(
    (r) => !item.removeImages.includes(r.id),
  );
  if (item.uploadImage) {
    const bytes = await fs.readFile(`${root}/${item.uploadImage.file}`);
    const up = await db.storage
      .from("poster-originals")
      .upload(item.uploadImage.storagePath, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
    assert.ifError(up.error);
    const res = await fetch(item.uploadImage.publicUrl, {
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(res.status, 200);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await res.arrayBuffer()))
        .digest("hex"),
      item.uploadImage.sha256,
    );
    const added = await check(
      db
        .from("poster_images")
        .insert({
          poster_id: item.id,
          image_type: "original",
          storage_path: item.uploadImage.publicUrl,
        })
        .select("*")
        .single(),
    );
    expectedImages.push(added);
    journal.items.at(-1).uploaded = item.uploadImage.storagePath;
    await save("applied", journal);
  }
  for (const id of item.removeLinks)
    await check(
      db.from("poster_links").delete().eq("poster_id", item.id).eq("id", id),
    );
  const expectedLinks = structuredClone(
    old.poster_links.filter((r) => !item.removeLinks.includes(r.id)),
  );
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
    ...item.deadline,
    deadline_checked_at: reviewedAt,
    field_verification: verification,
    poster_status: item.status,
    published_at: reviewedAt,
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
      assert.equal(
        Date.parse(after[key]),
        Date.parse(value),
        `${item.n}/${key}`,
      );
    else same(after[key], value, `Patch ${item.n}/${key}`);
  same(after.poster_images, expectedImages);
  same(after.poster_links, expectedLinks);
  same(
    after.poster_audiences.map((r) => r.audience_id),
    [
      ...old.poster_audiences
        .map((r) => r.audience_id)
        .filter((id) => !item.removeAudiences.includes(id)),
      ...item.addAudiences,
    ],
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
for (const rej of plan.rejected) {
  const old = backup[rej.n];
  same(
    await check(db.from("posters").select(select).eq("id", rej.id).single()),
    old,
    `Changed before reject ${rej.n}`,
  );
  const verification = structuredClone(old.field_verification || {});
  verification.sourceReview20261114 = {
    reviewer: "Claude source review",
    reviewedAt: new Date().toISOString(),
    approved: false,
    status: "rejected",
    reason: rej.reason,
    evidence: rej.evidence,
    backupSha256: sha(old),
    planSha256: hash,
  };
  journal.items.push({ n: rej.n, id: rej.id, phase: "reject" });
  await save("applied", journal);
  const written = await check(
    db
      .from("posters")
      .update({
        poster_status: "rejected",
        rejection_reason: rej.rejection_reason,
        field_verification: verification,
      })
      .eq("id", rej.id)
      .eq("poster_status", "review")
      .eq("updated_at", old.updated_at)
      .select("id,poster_status,rejection_reason"),
  );
  assert.equal(written.length, 1);
  assert.equal(written[0].poster_status, "rejected");
  journal.items.at(-1).phase = "verified";
  await save("applied", journal);
  console.log(JSON.stringify({ n: rej.n, status: "rejected", verified: true }));
}
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "source_review_20261114",
    metadata_json: {
      ...counts,
      approved: plan.items.map((x) => x.id),
      rejected: plan.rejected.map((x) => x.id),
      planSha256: hash,
    },
  }),
);
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(JSON.stringify({ verified: journal.items.length, ...counts }));
