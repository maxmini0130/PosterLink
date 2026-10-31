import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { CATEGORY_CODE_BY_LABEL } from "./poster-category-classifier.js";

// Source decisions and original snapshots are local, ignored operational artifacts.
const root = "../../data/results/";
const date =
  process.argv.find((arg) => arg.startsWith("--date="))?.slice(7) ?? "20261010";
assert(/^2026\d{4}$/.test(date), "Expected --date=YYYYMMDD in 2026");
const plan = JSON.parse(
  await fs.readFile(`${root}review-queue-direct-plan-${date}.json`, "utf8"),
);
const backup = JSON.parse(
  await fs.readFile(`${root}review-queue-backup-${date}-direct.json`, "utf8"),
);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes(`--confirm=SOURCE_REVIEW_${date}`));
assert.equal(plan.today_kst.replaceAll("-", ""), date);
const reviewedItems = [...plan.items, ...plan.held];
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checked = async (query) => {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
};
const categories = await checked(db.from("categories").select("id,code"));
const categoryIds = new Map(categories.map((x) => [x.code, x.id]));
const current = await checked(
  db
    .from("posters")
    .select("id,poster_status,updated_at")
    .in(
      "id",
      reviewedItems.map((x) => x.id),
    ),
);
assert.equal(new Set(plan.items.map((x) => x.id)).size, plan.items.length);
assert.equal(
  new Set(reviewedItems.map((x) => x.id)).size,
  reviewedItems.length,
);
assert.equal(
  reviewedItems.length,
  backup.length,
  "Every snapshot row needs a decision",
);
for (const item of reviewedItems) {
  const row = current.find((x) => x.id === item.id);
  const before = backup.find((x) => x.id === item.id);
  assert(before, `Missing backup: ${item.id}`);
  assert.equal(row?.poster_status, "review", `Status changed: ${item.id}`);
  assert.equal(
    row.updated_at,
    before.updated_at,
    `Snapshot changed: ${item.id}`,
  );
}
for (const item of plan.items) {
  const row = current.find((x) => x.id === item.id);
  assert.equal(row?.poster_status, "review", `Status changed: ${item.id}`);
  assert.equal(
    row.updated_at,
    item.expected_updated_at,
    `Snapshot changed: ${item.id}`,
  );
  assert(backup.some((x) => x.id === item.id));
  const d = item.decision;
  assert(["published", "closed"].includes(d.status));
  assert(
    ["fixed", "until_exhausted", "unknown", "ongoing"].includes(
      d.deadline_type,
    ),
  );
  for (const key of [
    "application_start_at",
    "application_end_at",
    "event_start_at",
    "event_end_at",
  ]) {
    assert(
      d[key] === null ||
        (/^2026-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/.test(d[key]) &&
          Number.isFinite(Date.parse(d[key]))),
    );
  }
  for (const prefix of ["application", "event"]) {
    if (d[`${prefix}_start_at`] && d[`${prefix}_end_at`])
      assert(
        Date.parse(d[`${prefix}_start_at`]) <=
          Date.parse(d[`${prefix}_end_at`]),
      );
  }
  assert(
    d.reason &&
      d.source_url &&
      d.category_labels.length > 0 &&
      d.category_labels.length <= 2,
  );
  for (const label of d.category_labels)
    assert(categoryIds.has(CATEGORY_CODE_BY_LABEL[label]));
}
const results = [];
for (const item of plan.items) {
  const before = backup.find((x) => x.id === item.id);
  const d = item.decision;
  const codes = d.category_labels.map((label) => CATEGORY_CODE_BY_LABEL[label]);
  const now = new Date().toISOString();
  const verification = {
    ...before.field_verification,
    dateIssues: [],
    deadlineMatches: true,
    decision: "approved",
    reason: d.reason,
    dateQuality: {
      ...before.field_verification?.dateQuality,
      decision: "pass",
      storedDeadline: d.application_end_at,
      normalizedDeadline: d.application_end_at,
      suggestedDeadline: d.application_end_at,
      reviewedAt: now,
      reviewedBy: plan.reviewer,
    },
    classification: {
      ...before.field_verification?.classification,
      categoryCodes: codes,
      primaryCategory: codes[0],
      categories: codes.map((code, i) => ({
        code,
        label: d.category_labels[i],
        evidence: d.reason,
        source: plan.reviewer,
      })),
      reason: d.reason,
      updatedBy: plan.reviewer,
      updatedAt: now,
    },
    directSourceReview: {
      reviewer: plan.reviewer,
      reviewedAt: now,
      todayKst: plan.today_kst,
      decision: d,
      previousTitle: before.title,
      previousCorrectedDeadline:
        before.field_verification?.correctedDeadline ?? null,
      previousDateIssues: before.field_verification?.dateIssues ?? [],
      previousDuplicateIssues: before.field_verification?.duplicateIssues ?? [],
      previousClassificationIssues:
        before.field_verification?.classificationIssues ?? [],
    },
  };
  // Only these three signals were disproved by comparing the referenced records.
  if (
    item.resolved_duplicate ||
    (date === "20261010" && [2, 5, 18].includes(item.n))
  )
    verification.duplicateIssues = [];
  assert.equal(
    (verification.duplicateIssues ?? []).length,
    0,
    `Unresolved duplicate: ${item.id}`,
  );
  verification.correctedDeadline = d.application_end_at;
  verification.classificationIssues = (
    before.field_verification?.classificationIssues ?? []
  ).filter((x) => x.code !== "ambiguous-category");
  const patch = {
    poster_status: d.status,
    application_start_at: d.application_start_at,
    application_end_at: d.application_end_at,
    event_start_at: d.event_start_at,
    event_end_at: d.event_end_at,
    deadline_type: d.deadline_type,
    published_at: now,
    rejection_reason: null,
    field_verification: verification,
    ...(d.title ? { title: d.title } : {}),
  };
  if (apply) {
    const links = codes.map((code) => ({
      poster_id: item.id,
      category_id: categoryIds.get(code),
    }));
    try {
      // Complete categories while the row is still hidden in review.
      await checked(
        db
          .from("poster_categories")
          .upsert(links, { onConflict: "poster_id,category_id" }),
      );
      await checked(
        db
          .from("poster_categories")
          .delete()
          .eq("poster_id", item.id)
          .not(
            "category_id",
            "in",
            `(${links.map((x) => x.category_id).join(",")})`,
          ),
      );
      const updated = await checked(
        db
          .from("posters")
          .update(patch)
          .eq("id", item.id)
          .eq("poster_status", "review")
          .eq("updated_at", item.expected_updated_at)
          .select("id")
          .maybeSingle(),
      );
      assert(updated, `Concurrent update blocked: ${item.id}`);
    } catch (error) {
      await checked(
        db.from("poster_categories").delete().eq("poster_id", item.id),
      );
      if (before.poster_categories.length)
        await checked(
          db.from("poster_categories").insert(before.poster_categories),
        );
      throw error;
    }
    const actual = await checked(
      db
        .from("posters")
        .select(
          "title,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type,poster_categories(category_id)",
        )
        .eq("id", item.id)
        .single(),
    );
    assert.equal(actual.poster_status, patch.poster_status);
    assert.equal(actual.title, d.title ?? before.title);
    assert.equal(actual.deadline_type, patch.deadline_type);
    for (const key of [
      "application_start_at",
      "application_end_at",
      "event_start_at",
      "event_end_at",
    ]) {
      assert.equal(
        actual[key] ? Date.parse(actual[key]) : null,
        patch[key] ? Date.parse(patch[key]) : null,
      );
    }
    assert.deepEqual(
      actual.poster_categories.map((x) => x.category_id).sort(),
      links.map((x) => x.category_id).sort(),
    );
  }
  results.push({
    id: item.id,
    title: item.title,
    status: d.status,
    verified: apply,
  });
  await fs.writeFile(
    `${root}review-queue-direct-${apply ? "applied" : "dry-run"}-${date}.json`,
    JSON.stringify({ results, held: plan.held }, null, 2),
  );
}
// Keep unresolved source conflicts visible without changing their status or fields.
if (apply && date !== "20261010") {
  for (const item of plan.held) {
    const before = backup.find((x) => x.id === item.id);
    const verification = {
      ...before.field_verification,
      directSourceReviewHold: {
        reviewer: plan.reviewer,
        todayKst: plan.today_kst,
        reviewedAt: new Date().toISOString(),
        reason: item.reason,
      },
    };
    const updated = await checked(
      db
        .from("posters")
        .update({ field_verification: verification })
        .eq("id", item.id)
        .eq("poster_status", "review")
        .eq("updated_at", before.updated_at)
        .select("id,poster_status,field_verification")
        .maybeSingle(),
    );
    assert(updated, `Concurrent held-row change: ${item.id}`);
    assert.equal(updated.poster_status, "review");
    assert.equal(
      updated.field_verification.directSourceReviewHold.reason,
      item.reason,
    );
  }
}
if (apply)
  await checked(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: `codex_direct_source_review_${date}`,
      metadata_json: {
        reviewer: plan.reviewer,
        today_kst: plan.today_kst,
        applied_ids: results.map((x) => x.id),
        held_ids: plan.held.map((x) => x.id),
        published: results.filter((x) => x.status === "published").length,
        closed: results.filter((x) => x.status === "closed").length,
      },
    }),
  );
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    checked: results.length,
    published: results.filter((x) => x.status === "published").length,
    closed: results.filter((x) => x.status === "closed").length,
    held: plan.held.length,
  }),
);
