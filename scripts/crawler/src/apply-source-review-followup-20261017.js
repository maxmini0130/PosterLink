import "./load-env.js";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { CATEGORY_CODE_BY_LABEL } from "./poster-category-classifier.js";

const root = "../../data/results/";
const plan = JSON.parse(
  await fs.readFile(`${root}review-queue-plan-20261017-followup.json`, "utf8"),
);
const backup = JSON.parse(
  await fs.readFile(
    `${root}review-queue-backup-20261017-followup.json`,
    "utf8",
  ),
);
const apply = process.argv.includes("--apply");
if (apply)
  assert(process.argv.includes("--confirm=FOLLOWUP_SOURCE_REVIEW_20261017"));
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
const categoryByCode = new Map(categories.map((row) => [row.code, row.id]));
const current = await checked(
  db
    .from("posters")
    .select("id,poster_status,updated_at,source_key")
    .in(
      "id",
      plan.items.map((row) => row.id),
    ),
);
assert.equal(plan.items.length, 20);
assert.equal(new Set(plan.items.map((row) => row.id)).size, backup.length);
const duplicateIds = plan.items
  .filter((row) => row.duplicate_of)
  .map((row) => row.duplicate_of);
const canonical = await checked(
  db.from("posters").select("id,poster_status").in("id", duplicateIds),
);
const sourceKeys = plan.items
  .filter((row) => row.patch.source_key)
  .map((row) => row.patch.source_key);
const sources = await checked(
  db.from("posters").select("id,source_key").in("source_key", sourceKeys),
);
const fields = new Set([
  "title",
  "source_key",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "deadline_type",
  "summary_short",
  "summary_long",
  "organizer_name",
  "application_organization_name",
]);
const sortedLinks = (links) =>
  links
    .map((row) => `${row.link_type}|${row.url}|${row.title}|${row.is_primary}`)
    .sort();
const categoryIds = (item) =>
  item.category_labels.map((label) =>
    categoryByCode.get(CATEGORY_CODE_BY_LABEL[label]),
  );
for (const item of plan.items) {
  const row = current.find((row) => row.id === item.id);
  const before = backup.find((row) => row.id === item.id);
  assert(before);
  assert.equal(row?.poster_status, "review", `Status changed: ${item.id}`);
  assert.equal(
    row.updated_at,
    item.expected_updated_at,
    `Snapshot changed: ${item.id}`,
  );
  assert.equal(before.updated_at, item.expected_updated_at);
  assert(["published", "closed", "rejected"].includes(item.status));
  assert(item.reason);
  assert(Object.keys(item.patch).every((field) => fields.has(field)));
  if (item.duplicate_of) {
    assert.equal(item.status, "rejected");
    assert.equal(
      canonical.find((row) => row.id === item.duplicate_of)?.poster_status,
      "published",
    );
    continue;
  }
  assert(item.category_labels.length > 0 && item.category_labels.length <= 2);
  assert(categoryIds(item).every(Boolean));
  assert(
    ["fixed", "until_exhausted", "unknown", "ongoing"].includes(
      item.patch.deadline_type,
    ),
  );
  for (const field of [
    "application_start_at",
    "application_end_at",
    "event_start_at",
    "event_end_at",
  ]) {
    const value = item.patch[field];
    assert(
      value === null ||
        (/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(value) &&
          Number.isFinite(Date.parse(value))),
    );
  }
  for (const prefix of ["application", "event"]) {
    const start = item.patch[`${prefix}_start_at`],
      end = item.patch[`${prefix}_end_at`];
    if (start && end) assert(Date.parse(start) <= Date.parse(end));
  }
  assert(item.links.length >= 2);
  assert(item.links.some((row) => row.link_type === "official_notice"));
  assert.equal(item.links.filter((row) => row.is_primary).length, 1);
  for (const row of item.links) assert(/^(https?:\/\/|mailto:)/.test(row.url));
  assert(
    !sources.some(
      (row) => row.source_key === item.patch.source_key && row.id !== item.id,
    ),
    `Canonical source collision: ${item.id}`,
  );
}
const counts = plan.items.reduce((result, item) => {
  result[item.status] = (result[item.status] ?? 0) + 1;
  return result;
}, {});
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    targets: plan.items.length,
    status_counts: counts,
  }),
);

const report = {
  started_at: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
  status_counts: counts,
  items: [],
};
const reportPath = `${root}review-queue-${apply ? "applied" : "dry-run"}-20261017-followup.json`;
const save = () =>
  fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
await save();
for (const item of plan.items) {
  const before = backup.find((row) => row.id === item.id);
  const now = new Date().toISOString();
  const codes = item.category_labels?.map(
    (label) => CATEGORY_CODE_BY_LABEL[label],
  );
  const verification = {
    ...before.field_verification,
    directFollowupReview: {
      reviewer: "codex-direct-source-followup",
      reviewedAt: now,
      todayKst: plan.today_kst,
      reason: item.reason,
      finalStatus: item.status,
      duplicateOf: item.duplicate_of ?? null,
      decision: item.patch,
      previousVerification: before.field_verification,
      previousSummaryLong: before.summary_long,
      previousSummaryShort: before.summary_short,
      previousLinks: before.poster_links,
      previousImages: before.poster_images,
    },
  };
  if (!item.duplicate_of) {
    verification.dateIssues = [];
    verification.duplicateIssues = [];
    verification.classificationIssues = (
      verification.classificationIssues ?? []
    ).filter((row) => row.code !== "ambiguous-category");
    verification.decision = "approved";
    verification.reason = item.reason;
    verification.correctedDeadline = item.patch.application_end_at;
    verification.deadlineMatches = true;
    verification.dateQuality = {
      ...verification.dateQuality,
      decision: "pass",
      normalizedDeadline: item.patch.application_end_at,
      storedDeadline: item.patch.application_end_at,
      suggestedDeadline: item.patch.application_end_at,
      reviewedBy: "codex-direct-source-followup",
      reviewedAt: now,
      deadlineType: item.patch.deadline_type,
      evidence: item.reason,
    };
    verification.classification = {
      ...verification.classification,
      categoryCodes: codes,
      primaryCategory: codes[0],
      reason: item.reason,
      updatedBy: "codex-direct-source-followup",
      updatedAt: now,
      categories: codes.map((code, index) => ({
        code,
        label: item.category_labels[index],
        evidence: item.reason,
        source: "codex-direct-source-followup",
      })),
    };
    verification.readableNotice = {
      ...verification.readableNotice,
      summaryShort: item.patch.summary_short,
      facts: {
        ...verification.readableNotice?.facts,
        period: item.patch.application_end_at
          ? `신청 종료 ${item.patch.application_end_at}`
          : item.patch.deadline_type === "unknown"
            ? "공통 또는 확정 신청 종료일 미기재 · 상세 일정과 실제 신청처 확인"
            : null,
        ...(item.n === 5 ? { target: "서비스별 공식 이용대상 확인" } : {}),
      },
    };
    delete verification.directSourceReviewHold;
  } else {
    verification.decision = "rejected";
    verification.reason = `${item.reason} 기존 공개 ID: ${item.duplicate_of}`;
  }
  const patch = {
    ...item.patch,
    poster_status: item.status,
    field_verification: verification,
    ...(item.duplicate_of
      ? { rejection_reason: `중복 공고: ${item.duplicate_of}` }
      : { rejection_reason: null, published_at: now }),
  };
  const entry = {
    id: item.id,
    status: item.status,
    phase: "planned",
    verified: false,
  };
  report.items.push(entry);
  await save();
  if (!apply) continue;

  // Claim the unchanged review row first. All relation edits occur while hidden.
  const claimed = await checked(
    db
      .from("posters")
      .update({
        field_verification: {
          ...before.field_verification,
          followupWriteInProgress: {
            startedAt: now,
            reviewer: "codex-direct-source-followup",
          },
        },
      })
      .eq("id", item.id)
      .eq("poster_status", "review")
      .eq("updated_at", item.expected_updated_at)
      .select("id,updated_at")
      .maybeSingle(),
  );
  assert(claimed, `Concurrent change blocked: ${item.id}`);
  entry.phase = "claimed";
  await save();
  if (!item.duplicate_of) {
    await checked(db.from("poster_links").delete().eq("poster_id", item.id));
    await checked(
      db
        .from("poster_links")
        .insert(item.links.map((row) => ({ ...row, poster_id: item.id }))),
    );
    await checked(
      db.from("poster_categories").delete().eq("poster_id", item.id),
    );
    await checked(
      db.from("poster_categories").insert(
        categoryIds(item).map((id) => ({
          poster_id: item.id,
          category_id: id,
        })),
      ),
    );
    if (item.image_upload) {
      const bytes = await fs.readFile(`${root}program-official-20261017.jpg`);
      const digest = crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 24);
      const path = `crawler/source-review/20261017-${digest}.jpg`;
      await checked(
        db.storage
          .from("poster-originals")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: true }),
      );
      const { data } = db.storage.from("poster-originals").getPublicUrl(path);
      await checked(db.from("poster_images").delete().eq("poster_id", item.id));
      await checked(
        db.from("poster_images").insert(
          ["thumbnail", "original"].map((type) => ({
            poster_id: item.id,
            image_type: type,
            storage_path: data.publicUrl,
            width: 1920,
            height: 12579,
          })),
        ),
      );
      entry.image_url = data.publicUrl;
    }
    if (item.keep_thumbnail_only) {
      const thumbnail = before.poster_images.find(
        (row) => row.image_type === "thumbnail",
      );
      assert(thumbnail);
      await checked(
        db
          .from("poster_images")
          .delete()
          .eq("poster_id", item.id)
          .neq("id", thumbnail.id),
      );
    }
  }
  entry.phase = "relations-ready";
  await save();
  const updated = await checked(
    db
      .from("posters")
      .update(patch)
      .eq("id", item.id)
      .eq("poster_status", "review")
      .eq("updated_at", claimed.updated_at)
      .select("id")
      .maybeSingle(),
  );
  assert(updated, `Concurrent change before publish: ${item.id}`);
  entry.phase = "saved";
  await save();
  const actual = await checked(
    db
      .from("posters")
      .select("*,poster_links(*),poster_categories(*),poster_images(*)")
      .eq("id", item.id)
      .single(),
  );
  assert.equal(actual.poster_status, item.status);
  for (const [key, value] of Object.entries(item.patch)) {
    if (key.endsWith("_at"))
      assert.equal(
        actual[key] ? Date.parse(actual[key]) : null,
        value ? Date.parse(value) : null,
      );
    else assert.equal(actual[key], value, `Mismatch ${key}: ${item.id}`);
  }
  if (!item.duplicate_of) {
    assert.deepEqual(sortedLinks(actual.poster_links), sortedLinks(item.links));
    assert.deepEqual(
      actual.poster_categories.map((row) => row.category_id).sort(),
      categoryIds(item).sort(),
    );
    if (item.keep_thumbnail_only) assert.equal(actual.poster_images.length, 1);
    if (item.image_upload)
      assert(
        actual.poster_images.every(
          (row) => row.storage_path === entry.image_url,
        ),
      );
  }
  entry.phase = "verified";
  entry.verified = true;
  await save();
}
if (apply) {
  await checked(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "direct_source_followup_20261017",
      metadata_json: {
        reviewed_by: "codex",
        applied_ids: plan.items.map((row) => row.id),
        status_counts: counts,
        duplicate_ids: duplicateIds,
      },
    }),
  );
  report.completed_at = new Date().toISOString();
  await save();
}
console.log(
  JSON.stringify({
    mode: report.mode,
    verified: report.items.filter((row) => row.verified).length,
    status_counts: counts,
  }),
);
