import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Incident-only: frozen source/attachment review, not a reusable auto-approval rule.
const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261103/", import.meta.url),
);
const read = async (name) =>
  JSON.parse(await fs.readFile(`${root}/${name}.json`, "utf8"));
const save = async (name, value) =>
  fs.writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2));
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261103"));
const [plan, backup, categories] = await Promise.all([
  read("plan"),
  read("backup"),
  read("categories"),
]);
assert.equal(plan.today_kst, "2026-11-03");
assert.equal(plan.items.length, 40);
assert.equal(backup.length, 40);
const approvedIndices = [0, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15, 16, 28, 34, 38];
assert.deepEqual(
  plan.items.filter((x) => x.approved).map((x) => x.i),
  approvedIndices,
);
const approvedIds = [
  "29b0ca07-2272-42bc-9eff-d5a8b54d7d81",
  "75d0f2fb-a4af-4479-b737-d5e05fb39d3c",
  "cac5459b-53a8-4df4-8f9c-80d55e864794",
  "0a46840d-8a77-4190-9b03-102b73a4679c",
  "80a5419d-059e-4c58-8f99-7323931339ca",
  "ba2c3b0c-686d-4978-8b80-f688e304717d",
  "4f2bf491-e2eb-4d2c-b3c9-1e22136695c1",
  "87519969-af47-4e88-a9a6-4ce497ed6cad",
  "e5a81899-ba4a-4491-979f-b8349a2653f2",
  "76077cd2-088e-46c5-ace2-2d009fe772ae",
  "cd16782b-3ab8-410c-9b96-76b5c77091ed",
  "639ba048-ce0d-4311-8fd9-3c7150aeb00b",
  "86d33f6a-bd33-47e9-a56b-3a81e636be7e",
  "3ffe2ba6-bb3e-42f6-8241-a4275f167202",
  "67ee7c0b-dd0e-4578-8123-ac71303938ca",
];
assert.deepEqual(
  plan.items.filter((x) => x.approved).map((x) => x.id),
  approvedIds,
);
const finalizeAudit = process.argv.includes("--finalize-audit");
assert(
  finalizeAudit ||
    !(await fs.access(`${root}/applied.json`).then(
      () => true,
      () => false,
    )),
  "Journal exists: inspect before recovery",
);
const hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
if (apply) assert.equal((await read("dry-run")).hash, hash);
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
const ordered = (values) => values.map((x) => JSON.stringify(x)).sort();
const normalized = (row) => ({
  ...row,
  ...Object.fromEntries(relations.map((k) => [k, ordered(row[k])])),
});
const current = await checked(
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      backup.map((x) => x.id),
    ),
);
if (finalizeAudit) {
  assert(apply);
  const journal = await read("applied");
  assert.equal(journal.hash, hash);
  assert(!journal.completedAt);
  assert.equal(journal.items.length, 40);
  assert(journal.items.every((item) => item.phase === "verified"));
  for (const item of journal.items) {
    const expected = await read(`after-${item.id}`);
    assert.deepEqual(
      normalized(current.find((row) => row.id === item.id)),
      normalized(expected),
    );
  }
  await checked(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "source_review_20261103",
      metadata_json: { approved: approvedIds, held: 25, planSha256: hash },
    }),
  );
  journal.completedAt = new Date().toISOString();
  journal.auditRecovery =
    "All 40 verified snapshots rechecked; corrected admin_actions metadata_json column. No poster changes replayed.";
  await save("applied", journal);
  console.log(
    JSON.stringify({
      verified: 40,
      approved: 15,
      held: 25,
      auditFinalized: true,
    }),
  );
  process.exit(0);
}
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
]);
for (const item of plan.items) {
  const old = backup[item.i];
  assert.equal(item.id, old.id);
  assert.equal(old.poster_status, "review");
  assert.deepEqual(
    normalized(current.find((x) => x.id === item.id)),
    normalized(old),
    `Concurrent change ${item.id}`,
  );
  for (const key of Object.keys(item.patch)) assert(allowed.has(key), key);
  assert(item.reason);
  assert(item.sources.length);
  assert.equal(item.image.status, 200);
  for (const id of item.removeAudiences)
    assert(old.poster_audiences.some((x) => x.audience_id === id));
  if (!item.approved) {
    assert.deepEqual(item.patch, {});
    assert.equal(item.removeAudiences.length, 0);
  }
  if (item.approved) {
    assert.equal(item.patch.deadline_type, "fixed");
    assert(item.patch.application_end_at || old.application_end_at);
    assert.equal(
      item.patch.category_id,
      categories.find((c) => c.name === item.category).id,
    );
  }
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    targets: 40,
    approve: 15,
    hold: 25,
    hash,
  }),
);
if (!apply) {
  await save("dry-run", { hash, passed: true, approve: 15, hold: 25 });
} else {
  const journal = { hash, items: [] };
  for (const item of plan.items) {
    const old = backup[item.i];
    let stamp = old.updated_at;
    const verification = structuredClone(old.field_verification || {});
    verification.sourceReview20261103 = {
      reviewer: "Codex AI source and visual review",
      todayKst: plan.today_kst,
      reviewedAt: new Date().toISOString(),
      approved: item.approved,
      reason: item.reason,
      sources: item.sources,
      image: item.image,
      backupSha256: createHash("sha256")
        .update(JSON.stringify(old))
        .digest("hex"),
      aiReport: "41561813009 (report-only; no automatic approvals)",
      datePrecision: "Date-only boundaries do not assert an exact closing time",
      removedAudienceRelations: old.poster_audiences.filter((x) =>
        item.removeAudiences.includes(x.audience_id),
      ),
    };
    if (item.approved) {
      verification.readableNotice = {
        ...verification.readableNotice,
        summaryShort: item.patch.summary_short || old.summary_short,
        facts: {
          ...verification.readableNotice?.facts,
          target: item.patch.eligibility_summary || old.eligibility_summary,
          applicationMethod:
            item.patch.application_method || old.application_method,
          location: item.patch.event_location || old.event_location,
        },
        updatedBy: "source-review-20261103",
      };
      if (item.removeAudiences.length)
        verification.classification = {
          ...verification.classification,
          audiences: [],
        };
    }
    assert.deepEqual(
      verification.humanStructuredVerification,
      old.field_verification?.humanStructuredVerification,
    );
    journal.items.push({ id: item.id, phase: "claim" });
    await save("applied", journal);
    const claim = await checked(
      db
        .from("posters")
        .update({
          field_verification: {
            ...old.field_verification,
            sourceReviewWriteInProgress: "20261103",
          },
        })
        .eq("id", item.id)
        .eq("poster_status", "review")
        .eq("updated_at", stamp)
        .select("id,updated_at"),
    );
    assert.equal(claim.length, 1);
    stamp = claim[0].updated_at;
    for (const audienceId of item.removeAudiences)
      await checked(
        db
          .from("poster_audiences")
          .delete()
          .eq("poster_id", item.id)
          .eq("audience_id", audienceId),
      );
    // Correct actual category relations only where stale relation rows contradict reviewed facts.
    let expectedCategories = old.poster_categories;
    if ([28, 34].includes(item.i)) {
      const labels = item.i === 28 ? ["주거/금융", "지원사업"] : ["교육강좌"];
      const ids = labels.map(
        (label) => categories.find((c) => c.name === label).id,
      );
      for (const rel of old.poster_categories.filter(
        (x) => !ids.includes(x.category_id),
      ))
        await checked(
          db
            .from("poster_categories")
            .delete()
            .eq("poster_id", item.id)
            .eq("category_id", rel.category_id),
        );
      const missing = ids
        .filter(
          (id) => !old.poster_categories.some((x) => x.category_id === id),
        )
        .map((category_id) => ({ poster_id: item.id, category_id }));
      if (missing.length)
        await checked(db.from("poster_categories").insert(missing));
      expectedCategories = ids.map((category_id) => ({
        poster_id: item.id,
        category_id,
      }));
    }
    const expectedLinks = structuredClone(old.poster_links);
    if (item.i === 4) {
      for (const link of expectedLinks.filter(
        (l) =>
          l.url.includes("cVxHgw9TMxHD56Sy8") ||
          l.url.includes("sprtInfoId=75416"),
      )) {
        await checked(
          db
            .from("poster_links")
            .delete()
            .eq("id", link.id)
            .eq("poster_id", item.id),
        );
      }
      for (let n = expectedLinks.length - 1; n >= 0; n--)
        if (
          expectedLinks[n].url.includes("cVxHgw9TMxHD56Sy8") ||
          expectedLinks[n].url.includes("sprtInfoId=75416")
        )
          expectedLinks.splice(n, 1);
    }
    for (const link of expectedLinks) {
      let patch = null;
      if (item.i === 14 && link.url.includes("/www.startup-plus.kr/"))
        patch = {
          url: "https://www.startup-plus.kr/project/PRJ007656",
          title: "키친인큐베이터 개별 사업 신청",
        };
      if (item.i === 14 && link.url === "https://www.startup-plus.kr/")
        patch = {
          link_type: "other",
          title: "스타트업플러스 홈페이지(신청은 개별 사업 링크)",
        };
      if (item.i === 16 && link.link_type === "official_apply")
        patch = {
          link_type: link.url.includes("/afile/") ? "other" : "official_notice",
          is_primary: false,
        };
      if (patch) {
        await checked(
          db
            .from("poster_links")
            .update(patch)
            .eq("id", link.id)
            .eq("poster_id", item.id),
        );
        Object.assign(link, patch);
      }
    }
    const patch = { ...item.patch, field_verification: verification };
    if (item.approved)
      Object.assign(patch, {
        poster_status: "published",
        published_at: new Date().toISOString(),
        rejection_reason: null,
      });
    const written = await checked(
      db
        .from("posters")
        .update(patch)
        .eq("id", item.id)
        .eq("poster_status", "review")
        .eq("updated_at", stamp)
        .select("id"),
    );
    assert.equal(written.length, 1);
    journal.items.at(-1).phase = "written";
    await save("applied", journal);
    const after = await checked(
      db.from("posters").select(select).eq("id", item.id).single(),
    );
    for (const [key, value] of Object.entries(old)) {
      if ([...relations, "updated_at", ...Object.keys(patch)].includes(key))
        continue;
      assert.deepEqual(after[key], value, `Unexpected ${item.id}/${key}`);
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key.endsWith("_at") && value) {
        assert.equal(Date.parse(after[key]), Date.parse(value));
      } else assert.deepEqual(after[key], value, `Patch ${item.id}/${key}`);
    }
    assert.deepEqual(ordered(after.poster_images), ordered(old.poster_images));
    assert.deepEqual(ordered(after.poster_links), ordered(expectedLinks));
    assert.deepEqual(
      ordered(after.poster_audiences),
      ordered(
        old.poster_audiences.filter(
          (x) => !item.removeAudiences.includes(x.audience_id),
        ),
      ),
    );
    const catKeys = (values) => values.map((x) => x.category_id).sort();
    assert.deepEqual(
      catKeys(after.poster_categories),
      catKeys(expectedCategories),
    );
    await save(`after-${item.id}`, after);
    journal.items.at(-1).phase = "verified";
    await save("applied", journal);
  }
  await checked(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "source_review_20261103",
      metadata_json: { approved: approvedIds, held: 25, planSha256: hash },
    }),
  );
  journal.completedAt = new Date().toISOString();
  await save("applied", journal);
  console.log(
    JSON.stringify({ verified: journal.items.length, approved: 15, held: 25 }),
  );
}
