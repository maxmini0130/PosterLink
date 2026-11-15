import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-15 follow-up: the published 강동 티톡 row (87519969) still closes on
// 11-15 although its extra-recruitment notice (75860, reviewed as queue item 11 and
// rejected as a duplicate of this row) extends applications to 11-23 23:59.
// Usage: node src/apply-review-followup-20261115.js            (dry-run, GET only)
//        node src/apply-review-followup-20261115.js --apply --confirm=REVIEW_FOLLOWUP_20261115
const root = fileURLToPath(
  new URL("../../../data/results/followup-20261115/", import.meta.url),
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
if (apply) assert(process.argv.includes("--confirm=REVIEW_FOLLOWUP_20261115"));

const ID = "87519969-af47-4e88-a9a6-4ce497ed6cad";
const NOTICE_75860 =
  "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75860";
const [old] = await read("backup");
assert.equal(old.id, ID);
const swap = (text, from, to) => {
  assert(text.includes(from), `missing text: ${from}`);
  return text.replace(from, to);
};
const summaryShort = swap(
  old.summary_short,
  "11/15 23:59까지 신청",
  "추가모집으로 11/23 23:59까지 신청(11/24 회차는 모집 마감)",
);
let summaryLong = swap(old.summary_long, old.summary_short, summaryShort);
summaryLong = swap(
  summaryLong,
  "11/16 선정자에게 개별 연락하며",
  "11/24(화) 선정자에게 문자로 개별 연락하며",
);
const action = {
  patch: {
    application_end_at: "2026-11-23T23:59:00+09:00",
    deadline_status: "verified",
    deadline_source: "notice",
    deadline_time_verified: true,
    deadline_note: "11/24 회차는 모집 마감, 11/26·12/1·12/3 회차 신청 가능",
    summary_short: summaryShort,
    summary_long: summaryLong,
  },
  addLink: {
    url: NOTICE_75860,
    title: "추가모집 공고 원문",
    link_type: "official_notice",
    is_primary: false,
  },
  reason:
    "추가모집 원문(청년몽땅정보통 75860)에 '모집 기간 : 11/2(월) ~ 11/23(월) 23:59까지', '11/24(화) 19:30~21:00 (모집마감)', '참여자 선정 :11/24(화) 개별 연락'이 명시됨. 같은 구글폼(forms.gle/GSYENxRWqQcSfepK9)·같은 4회차라 검수 대기 행은 중복으로 반려하고 이 행의 마감을 연장. 기존 값 11/15는 최초 원문 75482의 11/16 23:59와도 달랐음.",
};
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
assert(!old.poster_links.some((l) => l.url === NOTICE_75860));
assert(action.patch.deadline_note.length <= 80);
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    id: ID.slice(0, 8),
    end: action.patch.application_end_at,
    planHash,
  }),
);
if (!apply) {
  await save("dry-run", {
    planHash,
    passed: true,
    at: new Date().toISOString(),
  });
  process.exit(0);
}
const at = new Date().toISOString();
const verification = structuredClone(old.field_verification || {});
verification.reviewFollowup20261115 = {
  reviewer: "Claude source review",
  reviewedAt: at,
  reason: action.reason,
  previous: Object.fromEntries(
    Object.keys(action.patch).map((k) => [k, old[k] ?? null]),
  ),
  backupSha256: sha(old),
  planSha256: planHash,
};
const journal = { planHash, phase: "start" };
await save("applied", journal);
const added = await check(
  db
    .from("poster_links")
    .insert({ ...action.addLink, poster_id: ID })
    .select("*")
    .single(),
);
const written = await check(
  db
    .from("posters")
    .update({
      ...action.patch,
      deadline_checked_at: at,
      field_verification: verification,
    })
    .eq("id", ID)
    .eq("poster_status", "published")
    .eq("updated_at", old.updated_at)
    .select("id"),
);
assert.equal(written.length, 1);
const after = await check(
  db.from("posters").select(select).eq("id", ID).single(),
);
for (const [k, v] of Object.entries(action.patch))
  if (k.endsWith("_at")) assert.equal(Date.parse(after[k]), Date.parse(v));
  else same(after[k], v, k);
same(after.poster_links, [...old.poster_links, added], "links");
for (const k of [
  "title",
  "poster_status",
  "event_start_at",
  "event_end_at",
  "thumbnail_url",
])
  same(after[k], old[k], k);
await save(`after-${ID}`, after);
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "review_followup_20261115",
    metadata_json: { id: ID, kind: "extend_deadline", planSha256: planHash },
  }),
);
journal.phase = "verified";
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(JSON.stringify({ verified: 1 }));
