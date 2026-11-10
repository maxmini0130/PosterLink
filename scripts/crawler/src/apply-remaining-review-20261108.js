import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// One frozen, individually researched incident plan. Never an auto-approval rule.
const nestFollowup = process.argv.includes("--nest-followup");
const attachmentFollowup = process.argv.includes("--attachment-followup");
assert(!(nestFollowup && attachmentFollowup));
const followup = nestFollowup || attachmentFollowup;
const root = fileURLToPath(
  new URL(
    `../../../data/results/remaining-review-20261108/${nestFollowup ? "nest-followup/" : attachmentFollowup ? "attachment-followup/" : ""}`,
    import.meta.url,
  ),
);
const read = async (name) =>
  JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
const save = async (name, value) =>
  fs.writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2));
const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value
        .map(canonical)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const same = (a, b, label) =>
  assert.deepEqual(canonical(a), canonical(b), label);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=REMAINING_REVIEW_20261108"));
const [plan, backup, categories] = await Promise.all([
  read("plan"),
  read("backup"),
  read("categories"),
]);
const hash = sha(plan);
assert.equal(
  hash,
  nestFollowup
    ? "ec0b8bc31217646e5ec518ba15060995497533c1ab8439a61dfd953b722e62cc"
    : attachmentFollowup
      ? "86c5f4f37099f9c43ccdfb33991d9b1317d1b69963ee15bba902ad1fdf2ddf83"
      : "f5dec5ed2e6386f3377e6ebb278f2248ee25fefea3161e60a6173beecdfc1ae5",
);
assert.equal(plan.reviewDateKst, "2026-11-08");
const targetCount = nestFollowup ? 1 : attachmentFollowup ? 2 : 47;
assert.equal(plan.items.length, targetCount);
assert.equal(backup.length, targetCount);
assert.equal(new Set(plan.items.map((item) => item.id)).size, targetCount);
const counts = plan.items.reduce((result, item) => {
  result[item.status] = (result[item.status] || 0) + 1;
  return result;
}, {});
same(
  counts,
  followup
    ? { published: targetCount }
    : { review: 20, published: 21, closed: 4, rejected: 2 },
);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Inspect journal before any recovery; never replay",
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
const check = async (query) => {
  const result = await query;
  assert.ifError(result.error);
  return result.data;
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
  "participation_fee",
  "benefits_summary",
  "recruitment_count",
  "application_method",
  "required_documents",
  "contact_info",
  "event_location",
  "summary_short",
  "summary_long",
  "category_id",
]);
const current = await check(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      plan.items.map((item) => item.id),
    ),
);
const representativeIds = plan.items
  .filter((item) => item.duplicateOf)
  .map((item) => item.duplicateOf);
const representatives = representativeIds.length
  ? await check(db.from("posters").select(select).in("id", representativeIds))
  : [];
assert.equal(representatives.length, followup ? 0 : 2);
assert(representatives.every((row) => row.poster_status === "published"));
if (apply)
  same(
    representatives,
    (await read("dry-run")).representatives,
    "Duplicate representative changed",
  );
for (const item of plan.items) {
  const old = backup.find((row) => row.id === item.id);
  assert.equal(sha(old), item.backupSha256);
  assert.equal(old.poster_status, "review");
  assert(
    !old.field_verification?.humanStructuredVerification,
    "Do not override human judgment",
  );
  assert(!old.field_verification?.sourceReviewWriteInProgress);
  same(
    current.find((row) => row.id === item.id),
    old,
    `Concurrent change ${item.n}`,
  );
  assert(item.reason && item.sources.some((source) => source.status === 200));
  for (const key of Object.keys(item.patch)) assert(allowed.has(key), key);
  const approved = ["published", "closed"].includes(item.status);
  if (approved) {
    assert(
      item.patch.summary_short &&
        item.patch.summary_long &&
        item.patch.category_id,
    );
    assert(
      categories.some((category) => category.id === item.patch.category_id),
    );
    assert(
      ["fixed", "until_exhausted", "unknown"].includes(
        item.patch.deadline_type,
      ),
    );
    if (item.patch.deadline_type === "unknown")
      assert.equal(item.patch.application_end_at, null);
    for (const [start, end] of [
      ["application_start_at", "application_end_at"],
      ["event_start_at", "event_end_at"],
    ]) {
      for (const key of [start, end])
        if (item.patch[key])
          assert(Number.isFinite(Date.parse(item.patch[key])));
      if (item.patch[start] && item.patch[end])
        assert(Date.parse(item.patch[start]) <= Date.parse(item.patch[end]));
    }
    if (item.status === "closed")
      assert(Date.parse(item.patch.application_end_at) < Date.now());
    if (item.status === "published" && item.patch.deadline_type === "fixed")
      assert(Date.parse(item.patch.application_end_at) > Date.now());
    assert.equal(item.visualReview.imageUrl, old.thumbnail_url);
    assert.equal(item.visualReview.isPoster, true);
    assert(item.images.every((image) => image.status === 200));
    for (const image of item.images)
      assert.equal(
        createHash("sha256")
          .update(await fs.readFile(`${root}/${image.key}.bin`))
          .digest("hex"),
        image.hash,
      );
  } else assert.equal(Object.keys(item.patch).length, 0);
  for (const id of item.removeImages)
    assert(
      old.poster_images.some(
        (image) => image.id === id && image.storage_path !== old.thumbnail_url,
      ),
    );
  for (const id of item.removeAudiences)
    assert(
      old.poster_audiences.some((audience) => audience.audience_id === id),
    );
  for (const id of item.removeLinkIds || [])
    assert(old.poster_links.some((link) => link.id === id));
  for (const link of item.addLinks || [])
    assert(!old.poster_links.some((prior) => prior.url === link.url));
  if (item.duplicateOf) {
    const representative = representatives.find(
      (row) => row.id === item.duplicateOf,
    );
    assert(representative && representative.id !== item.id);
    const expectedDate = item.n === 15 ? "2026-11-13" : "2026-11-19";
    assert.equal(
      new Date(Date.parse(representative.event_start_at) + 9 * 3600000)
        .toISOString()
        .slice(0, 10),
      expectedDate,
    );
  }
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    targets: targetCount,
    ...counts,
    hash,
  }),
);
if (!apply) {
  await save("dry-run", { hash, passed: true, counts, representatives });
  process.exit(0);
}

const journal = { hash, items: [] };
for (const item of plan.items) {
  const old = backup.find((row) => row.id === item.id);
  same(
    await check(db.from("posters").select(select).eq("id", item.id).single()),
    old,
    `Changed before claim ${item.n}`,
  );
  const approved = ["published", "closed"].includes(item.status);
  const verification = structuredClone(old.field_verification || {});
  verification.remainingSourceReview20261108 = {
    reviewer: "Codex source and visual re-review",
    reviewedAt: new Date().toISOString(),
    approved,
    status: item.status,
    reason: item.reason,
    sources: item.sources,
    images: item.images || [],
    visualReview: item.visualReview || null,
    backupSha256: item.backupSha256,
    planSha256: hash,
    datePrecision: plan.datePrecision,
    previousHold: verification.directSourceReviewHold || null,
    removedImages: old.poster_images.filter((image) =>
      item.removeImages.includes(image.id),
    ),
    removedAudiences: old.poster_audiences.filter((audience) =>
      item.removeAudiences.includes(audience.audience_id),
    ),
    removedLinks: old.poster_links.filter((link) =>
      item.removeLinkIds?.includes(link.id),
    ),
    duplicateOf: item.duplicateOf || null,
    externalClassifierStatus:
      "not run: OPENAI_API_KEY not configured; historical model evidence preserved",
  };
  if (approved) {
    delete verification.directSourceReviewHold;
    const category = categories.find(
      (row) => row.id === item.patch.category_id,
    );
    verification.classification = {
      ...verification.classification,
      categories: [
        {
          code: category.code,
          label: category.name,
          source: "official-source-review",
          evidence: item.reason,
        },
      ],
    };
    if (item.removeAudiences.length)
      verification.classification.audiences = (
        verification.classification.audiences || []
      ).filter(
        (audience) =>
          !["청소년", "AUD_TEEN"].includes(audience.label || audience.code),
      );
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
      updatedBy: "remaining-review-20261108",
    };
  } else if (item.status === "review") {
    verification.directSourceReviewHold = {
      ...verification.directSourceReviewHold,
      reason: item.reason,
      reviewedAt: new Date().toISOString(),
      reviewer: "remaining-review-20261108",
    };
  } else {
    verification.duplicateResolution20261108 = {
      duplicateOf: item.duplicateOf,
      reason: item.reason,
      preserveRepresentative: true,
    };
  }
  same(
    verification.humanStructuredVerification,
    old.field_verification?.humanStructuredVerification,
  );
  journal.items.push({
    n: item.n,
    id: item.id,
    status: item.status,
    phase: "claim",
  });
  await save("applied", journal);
  const claim = await check(
    db
      .from("posters")
      .update({
        field_verification: {
          ...old.field_verification,
          sourceReviewWriteInProgress: "remaining-20261108",
        },
      })
      .eq("id", item.id)
      .eq("poster_status", "review")
      .eq("updated_at", old.updated_at)
      .select("id,updated_at"),
  );
  assert.equal(claim.length, 1);
  for (const id of item.removeImages)
    await check(
      db.from("poster_images").delete().eq("poster_id", item.id).eq("id", id),
    );
  for (const id of item.removeAudiences)
    await check(
      db
        .from("poster_audiences")
        .delete()
        .eq("poster_id", item.id)
        .eq("audience_id", id),
    );
  for (const id of item.removeLinkIds || [])
    await check(
      db.from("poster_links").delete().eq("poster_id", item.id).eq("id", id),
    );
  const expectedLinks = old.poster_links.filter(
    (link) => !item.removeLinkIds?.includes(link.id),
  );
  for (const link of item.addLinks || [])
    expectedLinks.push(
      await check(
        db
          .from("poster_links")
          .insert({ ...link, poster_id: item.id })
          .select("*")
          .single(),
      ),
    );
  if (approved) {
    for (const rel of old.poster_categories.filter(
      (rel) => rel.category_id !== item.patch.category_id,
    ))
      await check(
        db
          .from("poster_categories")
          .delete()
          .eq("poster_id", item.id)
          .eq("category_id", rel.category_id),
      );
    if (
      !old.poster_categories.some(
        (rel) => rel.category_id === item.patch.category_id,
      )
    )
      await check(
        db
          .from("poster_categories")
          .insert({ poster_id: item.id, category_id: item.patch.category_id }),
      );
  }
  const patch = {
    ...item.patch,
    field_verification: verification,
    poster_status: item.status,
  };
  if (approved) {
    patch.published_at = new Date().toISOString();
    patch.rejection_reason = null;
  }
  if (item.status === "rejected")
    patch.rejection_reason = `동일 회차 중복: ${item.duplicateOf}. ${item.reason}`;
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
  same(
    after.poster_images,
    old.poster_images.filter((image) => !item.removeImages.includes(image.id)),
  );
  same(
    after.poster_audiences,
    old.poster_audiences.filter(
      (audience) => !item.removeAudiences.includes(audience.audience_id),
    ),
  );
  same(after.poster_links, expectedLinks);
  if (approved)
    same(
      after.poster_categories.map((rel) => rel.category_id),
      [item.patch.category_id],
    );
  else same(after.poster_categories, old.poster_categories);
  await save(`after-${item.id}`, after);
  await check(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: item.id,
      action_type: approved
        ? "approve"
        : item.status === "rejected"
          ? "reject"
          : "update",
      action_reason: "remaining_source_review_20261108",
      metadata_json: {
        reason: item.reason,
        status: item.status,
        planSha256: hash,
        duplicateOf: item.duplicateOf || null,
      },
    }),
  );
  journal.items.at(-1).phase = "verified";
  await save("applied", journal);
  console.log(
    JSON.stringify({ n: item.n, status: item.status, verified: true }),
  );
}
if (representativeIds.length)
  same(
    await check(db.from("posters").select(select).in("id", representativeIds)),
    representatives,
    "Representatives must remain unchanged",
  );
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(JSON.stringify({ verified: journal.items.length, ...counts }));
