import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Original snapshots and fetched source evidence are ignored local artifacts.
// Restore only after comparing subsequent edits, using the full snapshot and relations.
const root = "../../data/results/";
const date = "20261025";
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261025"));
const backup = JSON.parse(
  await fs.readFile(`${root}review-queue-backup-${date}-direct.json`, "utf8"),
);
const plan = JSON.parse(
  await fs.readFile(`${root}review-queue-plan-${date}-direct.json`, "utf8"),
);
const decisions = plan.items;
assert.equal(plan.today_kst, "2026-10-25");
assert.equal(new Set(decisions.map((d) => d.id)).size, 28);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checked = async (q) => {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
};
assert.equal(backup.length, 28);
const cats = await checked(db.from("categories").select("id,code,name"));
const current = await checked(
  db
    .from("posters")
    .select("id,updated_at,poster_status")
    .in(
      "id",
      decisions.map((x) => x.id),
    ),
);
for (const d of decisions) {
  const before = backup.find((x) => x.id === d.id),
    row = current.find((x) => x.id === d.id);
  assert(before && row);
  assert.equal(d.expected_updated_at, before.updated_at);
  assert(["published", "closed", "review", "rejected"].includes(d.status));
  assert(d.reason && d.source && d.patch.summary_short);
  assert.equal(row.poster_status, "review");
  assert.equal(row.updated_at, before.updated_at);
  for (const code of d.codes) assert(cats.some((x) => x.code === code));
  for (const prefix of ["application", "event"]) {
    const start = d.patch[`${prefix}_start_at`],
      end = d.patch[`${prefix}_end_at`];
    if (start && end) assert(Date.parse(start) <= Date.parse(end));
  }
  assert.equal(d.links.filter((x) => x.is_primary).length, 1);
  if (d.image) assert((await fs.stat(d.image)).size > 10000);
}
console.log(
  JSON.stringify({
    apply,
    targets: decisions.length,
    statuses: decisions.reduce((a, d) => {
      a[d.status] = (a[d.status] ?? 0) + 1;
      return a;
    }, {}),
  }),
);
const report = { dateKst: "2026-10-25", apply, items: [] };
const save = () =>
  fs.writeFile(
    `${root}review-queue-${apply ? "applied" : "dry-run"}-${date}-direct.json`,
    JSON.stringify(report, null, 2),
  );
for (const d of decisions) {
  const before = backup.find((x) => x.id === d.id),
    now = new Date().toISOString();
  const categories = d.codes.map((code) => cats.find((x) => x.code === code));
  if (d.status === "rejected") {
    assert(d.duplicate_of);
    const canonical = await checked(
      db
        .from("posters")
        .select("id,poster_status")
        .eq("id", d.duplicate_of)
        .single(),
    );
    assert.equal(canonical.poster_status, "published");
    const verification = {
      ...before.field_verification,
      decision: "rejected",
      reason: d.reason,
      directSourceReview: {
        reviewer: plan.reviewer,
        todayKst: plan.today_kst,
        reviewedAt: now,
        decision: d,
        previousVerification: before.field_verification,
      },
    };
    const result = {
      id: d.id,
      status: d.status,
      phase: "planned",
      verified: false,
    };
    report.items.push(result);
    await save();
    if (!apply) continue;
    const updated = await checked(
      db
        .from("posters")
        .update({
          poster_status: "rejected",
          rejection_reason: `중복 공고: ${d.duplicate_of}`,
          field_verification: verification,
        })
        .eq("id", d.id)
        .eq("poster_status", "review")
        .eq("updated_at", before.updated_at)
        .select("id")
        .maybeSingle(),
    );
    assert(updated, `Concurrent edit blocked: ${d.id}`);
    const actual = await checked(
      db
        .from("posters")
        .select(
          "poster_status,rejection_reason,poster_links(*),poster_categories(category_id),poster_images(*)",
        )
        .eq("id", d.id)
        .single(),
    );
    assert.equal(actual.poster_status, "rejected");
    assert.equal(actual.rejection_reason, `중복 공고: ${d.duplicate_of}`);
    assert.deepEqual(
      actual.poster_links.map((x) => x.id).sort(),
      before.poster_links.map((x) => x.id).sort(),
    );
    assert.deepEqual(
      actual.poster_images.map((x) => x.id).sort(),
      before.poster_images.map((x) => x.id).sort(),
    );
    assert.deepEqual(
      actual.poster_categories.map((x) => x.category_id).sort(),
      before.poster_categories.map((x) => x.category_id).sort(),
    );
    result.verified = true;
    result.phase = "complete";
    await save();
    continue;
  }
  const resolved = d.status !== "review";
  const verification = {
    ...before.field_verification,
    decision: resolved ? "approved" : "needs_review",
    reason: d.reason,
    correctedOrgName: d.patch.organizer_name,
    organizerName: d.patch.organizer_name,
    orgNameMatches: true,
    correctedDeadline: d.patch.application_end_at,
    deadlineMatches: resolved,
    dateIssues: resolved
      ? []
      : [
          {
            code: "deadline-mismatch",
            decision: "review",
            severity: "high",
            reason: d.reason,
          },
        ],
    dateQuality: {
      decision: resolved ? "pass" : "review",
      normalizedDeadline: d.patch.application_end_at,
      storedDeadline: d.patch.application_end_at,
      reviewedAt: now,
      evidence: d.reason,
      sourcePrecision: d.date_precision,
    },
    duplicateIssues: resolved
      ? []
      : (before.field_verification?.duplicateIssues ?? []),
    classificationIssues: resolved
      ? []
      : (before.field_verification?.classificationIssues ?? []),
    organization: {
      ...before.field_verification?.organization,
      organizerName: d.patch.organizer_name,
      displayOrgName: d.patch.organizer_name,
      evidence: d.reason,
    },
    classification: {
      ...before.field_verification?.classification,
      primaryCategory: d.codes[0],
      categoryCodes: d.codes,
      categories: categories.map((c) => ({
        code: c.code,
        label: c.name,
        source: "codex-direct-source-review",
        evidence: d.reason,
      })),
    },
    readableNotice: {
      ...before.field_verification?.readableNotice,
      summaryShort: d.patch.summary_short,
      facts: {
        ...before.field_verification?.readableNotice?.facts,
        period:
          d.patch.application_end_at ??
          (resolved
            ? "확정 신청 종료일 미기재: 상세 안내 확인"
            : "신청 종료일 미확정: 원문 간 차이 확인 중"),
        application:
          d.patch.application_method ??
          d.links.find((x) => x.link_type === "official_apply")?.url,
      },
    },
    directSourceReview: {
      reviewer: "codex-direct-source-review",
      todayKst: "2026-10-25",
      reviewedAt: now,
      sourceUrl: d.source,
      reason: d.reason,
      decision: d,
      previousVerification: before.field_verification,
      previousLinks: before.poster_links,
      previousImages: before.poster_images,
    },
  };
  if (d.status === "review")
    verification.directSourceReviewHold = {
      reviewer: "codex-direct-source-review",
      reviewedAt: now,
      reason: d.reason,
    };
  else delete verification.directSourceReviewHold;
  const patch = {
    ...d.patch,
    field_verification: verification,
    poster_status: d.status,
    ...(resolved ? { published_at: now, rejection_reason: null } : {}),
  };
  const result = {
    id: d.id,
    status: d.status,
    phase: "planned",
    verified: false,
  };
  report.items.push(result);
  await save();
  if (!apply) continue;
  // Guard the original snapshot and keep all relation edits hidden until complete.
  const claim = await checked(
    db
      .from("posters")
      .update({
        field_verification: {
          ...before.field_verification,
          directReviewWriteInProgress: { reviewedAt: now },
        },
      })
      .eq("id", d.id)
      .eq("poster_status", "review")
      .eq("updated_at", before.updated_at)
      .select("updated_at")
      .maybeSingle(),
  );
  assert(claim, `Concurrent edit blocked: ${d.id}`);
  result.phase = "claimed";
  await save();
  await checked(db.from("poster_links").delete().eq("poster_id", d.id));
  await checked(
    db
      .from("poster_links")
      .insert(d.links.map((l) => ({ ...l, poster_id: d.id }))),
  );
  await checked(db.from("poster_categories").delete().eq("poster_id", d.id));
  await checked(
    db
      .from("poster_categories")
      .insert(categories.map((c) => ({ poster_id: d.id, category_id: c.id }))),
  );
  if (d.image) {
    const bytes = await fs.readFile(d.image),
      hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const storagePath = `crawler/source-review/${date}-${hash}.jpg`;
    await checked(
      db.storage.from("poster-originals").upload(storagePath, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      }),
    );
    const url = db.storage.from("poster-originals").getPublicUrl(storagePath)
      .data.publicUrl;
    patch.thumbnail_url = url;
    result.imageUrl = url;
    await checked(db.from("poster_images").delete().eq("poster_id", d.id));
    await checked(
      db.from("poster_images").insert(
        ["thumbnail", "original"].map((image_type) => ({
          poster_id: d.id,
          storage_path: url,
          image_type,
        })),
      ),
    );
    verification.posterImageOcr = {
      imageClassification: {
        isPoster: true,
        visualType: "event/program poster",
        source: "codex-visual-inspection",
        checkedAt: now,
        reason: d.reason,
      },
      contentMatch: { isSameNotice: true, checkedAt: now, reason: d.reason },
    };
  }
  result.phase = "relations-updated";
  await save();
  const updated = await checked(
    db
      .from("posters")
      .update(patch)
      .eq("id", d.id)
      .eq("poster_status", "review")
      .eq("updated_at", claim.updated_at)
      .select("id")
      .maybeSingle(),
  );
  assert(updated, `Final concurrent edit blocked: ${d.id}`);
  const actual = await checked(
    db
      .from("posters")
      .select(
        "*,poster_categories(category_id),poster_links(*),poster_images(*)",
      )
      .eq("id", d.id)
      .single(),
  );
  for (const [key, value] of Object.entries(patch)) {
    if (key === "field_verification") assert.deepEqual(actual[key], value);
    else if (key.endsWith("_at") && value)
      assert.equal(Date.parse(actual[key]), Date.parse(value));
    else assert.deepEqual(actual[key], value);
  }
  assert.deepEqual(
    actual.poster_categories.map((c) => c.category_id).sort(),
    categories.map((c) => c.id).sort(),
  );
  assert.deepEqual(
    actual.poster_links
      .map((l) => ({
        url: l.url,
        link_type: l.link_type,
        title: l.title,
        is_primary: l.is_primary,
      }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    [...d.links].sort((a, b) => a.url.localeCompare(b.url)),
  );
  if (d.image)
    assert(
      actual.poster_images.length === 2 &&
        actual.poster_images.every(
          (i) => i.storage_path === patch.thumbnail_url,
        ),
    );
  result.phase = "complete";
  result.verified = true;
  await save();
}
report.completedAt = new Date().toISOString();
await save();
console.log(
  JSON.stringify({
    completed: report.items.length,
    verified: report.items.filter((x) => x.verified).length,
  }),
);
