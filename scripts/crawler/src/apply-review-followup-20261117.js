import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-17 follow-up: e9da7e03 (서울청년센터 양천 찾아가는 청년 고용정책상담,
// notice 71372) is still published although its walk-in session was on 6/30(화)
// 16:00~18:00. The 11/17 session is a separate notice (75902) reviewed in
// source-review-20261117.
// Usage: node src/apply-review-followup-20261117.js            (dry-run, GET only)
//        node src/apply-review-followup-20261117.js --apply --confirm=REVIEW_FOLLOWUP_20261117
const root = fileURLToPath(
  new URL("../../../data/results/followup-20261117/", import.meta.url),
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
if (apply) assert(process.argv.includes("--confirm=REVIEW_FOLLOWUP_20261117"));

const ID = "e9da7e03-fa63-4e6d-8edf-414c90711621";
const action = {
  id: ID,
  kind: "close",
  patch: { poster_status: "closed" },
  reason:
    "원문 71372의 상담 일시는 '6월 30일(화) 16:00~18:00', 참여방법은 '예약 없이 현장 방문'으로 신청 마감이 따로 없는 1회성 현장 상담이다. 일정이 끝났는데 마감일이 미확인(unknown)으로 저장돼 공개 목록에 남아 있었다. 11/17 회차는 별도 공고(75902)로 검수했다.",
};
const [old] = await read("backup");
assert.equal(old.id, ID);
const planHash = sha(action);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "never replay",
);
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
const current = await check(
  db.from("posters").select(select).eq("id", ID).single(),
);
same(current, old, "Concurrent change");
assert.equal(old.poster_status, "published");
assert.equal(old.application_end_at, null);
assert(old.summary_long.includes("6월 30일(화) 16:00~18:00"));
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    id: ID.slice(0, 8),
    kind: action.kind,
    planHash,
  }),
);
if (!apply) {
  await save("dry-run", {
    planHash,
    passed: true,
    at: new Date().toISOString(),
  });
} else {
  const at = new Date().toISOString();
  const verification = structuredClone(old.field_verification || {});
  verification.reviewFollowup20261117 = {
    reviewer: "Claude source review",
    reviewedAt: at,
    kind: action.kind,
    reason: action.reason,
    previousStatus: old.poster_status,
    backupSha256: sha(old),
    planSha256: planHash,
  };
  const journal = { planHash, phase: "start" };
  await save("applied", journal);
  const written = await check(
    db
      .from("posters")
      .update({ ...action.patch, field_verification: verification })
      .eq("id", ID)
      .eq("poster_status", "published")
      .eq("updated_at", old.updated_at)
      .select("id"),
  );
  assert.equal(written.length, 1);
  const after = await check(
    db.from("posters").select(select).eq("id", ID).single(),
  );
  assert.equal(after.poster_status, "closed");
  for (const k of [
    "title",
    "summary_short",
    "application_end_at",
    "thumbnail_url",
    "poster_links",
  ])
    same(after[k], old[k], k);
  await save(`after-${ID}`, after);
  await check(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "review_followup_20261117",
      metadata_json: { id: ID, kind: action.kind, planSha256: planHash },
    }),
  );
  journal.phase = "verified";
  journal.completedAt = new Date().toISOString();
  await save("applied", journal);
  console.log(JSON.stringify({ verified: 1 }));
}
