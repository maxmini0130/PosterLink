import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-19 cleanup of links that wrong duplicate merges appended to
// published posters (fixed in the crawler by PR #56). Built from
// build-snowball-link-cleanup-20261119.js (backup.json + candidates.json).
// Each listed batch is the set of links one wrong merge inserted: a
// youth.seoul.go.kr notice for a different program or session, plus that
// notice's own apply/source links. Batches kept on purpose: reposts of the same
// notice, the 강동 티톡 추가모집, the 커리어 위크 umbrella notice, and batches
// whose origin cannot be told (no youth link).
// Merged categories/audiences are not touched here.
// Usage: node src/apply-snowball-link-cleanup-20261119.js           (dry-run, GET only)
//        node src/apply-snowball-link-cleanup-20261119.js --apply --confirm=SNOWBALL_LINKS_20261119
const root = fileURLToPath(
  new URL("../../../data/results/snowball-links-20261119/", import.meta.url),
);
const read = async (n) => JSON.parse(await fs.readFile(`${root}/${n}.json`, "utf8"));
const save = async (n, v) => fs.writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2));
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v;
const same = (a, b, label) => assert.deepEqual(canonical(a), canonical(b), label);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SNOWBALL_LINKS_20261119"));

// poster id prefix -> { batch index: youth notice id that identifies the batch }
const REMOVE = {
  "0ce32763": { 1: "75823" }, // 관악드림온 IT직무프리뷰
  "0e62a2ff": { 1: "74697" }, // 관악구 Climate Action Lab
  "0eccbbb6": { 3: "75939", 4: "75938" }, // 마포 리부트 옷장편/화장대편
  "10c750cc": { 1: "75382" }, // 강동 김앤장 법률 교육
  "28d05c71": { 1: "74845" }, // 은평 다독임 진로탐색
  "2be96e7b": { 1: "73491" }, // KU 청소년 인지행동 연구(다른 연구)
  "2d3da4e8": {
    1: "75889", // 도예 입문 과정
    2: "75888", // 강북구 무료법률상담실
    3: "75887", // 보건소 대학생 자원봉사자
    4: "75838", // 문화관광해설 코스 예약
    5: "75837", // 건축 법률 상담실
    6: "75836", // 빌라관리사무소 법률상담실
    7: "75835", // ChatGPT 업무자동화
    8: "75833", // 겨울 청년아르바이트
  },
  "36ad216f": { 1: "73561" }, // 꿈꾸는어린이도서관 미술 강연
  "4305d42a": { 1: "73849" }, // 성북 청년주간 오픈데이
  "6e5b5cce": { 1: "72317" }, // 그린아카데미 8월(포스터는 7월)
  "6fd72252": { 1: "75040", 2: "74918" }, // 서초 LH 주거 상담, 금천 명상
  a41bbe31: { 1: "74342" }, // YDP 드론교육
  b360af42: { 1: "74882" }, // 11월 주거 상담(포스터는 10월)
  b946fc35: { 1: "75784" }, // 커피 창업 11월(포스터는 10월)
  bceb17be: { 1: "75042", 3: "75824" }, // 어스메이트 멘토링, 타로 클래스
  be46a746: { 1: "73279" }, // 푸른들청소년도서관 다른 작가 프로그램
  d48ba469: { 1: "73435" }, // 강서 워리스톤 만들기
  ec4a6f97: { 1: "75718", 2: "75719", 3: "75722" }, // 건축물 안전교육, 일러스트레이터, 독서동아리
  f4ed9e00: {
    1: "73220", // eDISC 워크숍
    2: "73218", // 취업고민 스위치 ON
    3: "73215", // 면접 스피치
    4: "73214", // 인사이트 특강
    5: "73212", // 취업사진촬영
    6: "73213", // 퍼스널 이미지 컨설팅
  },
};

const backup = await read("backup");
const candidates = await read("candidates");
assert(
  !(await fs.access(`${root}/applied.json`).then(() => true, () => false)),
  "never replay",
);

const ACTIONS = Object.entries(REMOVE).map(([prefix, batches]) => {
  const c = candidates.filter((p) => p.id.startsWith(prefix));
  assert.equal(c.length, 1, prefix);
  const p = c[0];
  const old = backup.find((r) => r.id === p.id);
  assert(old, `backup ${prefix}`);
  const own = String(old.source_key ?? "");
  const removed = [];
  const notices = [];
  for (const [index, youthId] of Object.entries(batches)) {
    const b = p.batches.find((x) => x.index === Number(index));
    assert(b, `${prefix} batch ${index}`);
    assert(b.youth.some((y) => y.sprtInfoId === youthId), `${prefix} batch ${index} youth ${youthId}`);
    assert(Number(index) > 0, "the creation batch is never removed");
    for (const l of b.links) {
      assert(!l.is_primary, `${prefix} primary link`);
      assert.notEqual(l.url, own, `${prefix} own source link`);
      removed.push(l.id);
    }
    notices.push(b.youth.map((y) => ({ sprtInfoId: y.sprtInfoId, title: y.title })));
  }
  assert(old.poster_links.length - removed.length >= 1);
  return { id: p.id, title: p.title, removeLinkIds: removed.sort(), notices: notices.flat() };
});
const planHash = sha(ACTIONS);

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
const select = "*,poster_links(*),poster_images(*),poster_categories(*),poster_audiences(*)";
const current = await check(db.from("posters").select(select).in("id", ACTIONS.map((a) => a.id)));
assert.equal(current.length, ACTIONS.length);
for (const a of ACTIONS) {
  const old = backup.find((r) => r.id === a.id);
  same(current.find((r) => r.id === a.id), old, `Concurrent change ${a.id}`);
  assert.equal(old.poster_status, "published");
  for (const id of a.removeLinkIds) assert(old.poster_links.some((l) => l.id === id), id);
}
const total = ACTIONS.reduce((n, a) => n + a.removeLinkIds.length, 0);
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    posters: ACTIONS.length,
    links: total,
    perPoster: ACTIONS.map((a) => [a.id.slice(0, 8), a.removeLinkIds.length]),
    planHash,
  }),
);
if (!apply) {
  await save("dry-run", { planHash, posters: ACTIONS.length, links: total, passed: true, at: new Date().toISOString() });
} else {
  const journal = { planHash, items: [] };
  for (const a of ACTIONS) {
    const old = backup.find((r) => r.id === a.id);
    journal.items.push({ id: a.id, phase: "start" });
    await save("applied", journal);
    const deleted = await check(
      db.from("poster_links").delete().eq("poster_id", a.id).in("id", a.removeLinkIds).select("id"),
    );
    assert.equal(deleted.length, a.removeLinkIds.length, `${a.id} deleted`);
    // The link trigger only downgrades verification_status='verified'; none of
    // these posters is verified, but keep the guard explicit.
    const mid = await check(db.from("posters").select("updated_at,verification_status,verified_at,field_verification").eq("id", a.id).single());
    assert.equal(mid.verification_status, old.verification_status, "verification status unchanged");
    const verification = structuredClone(mid.field_verification || {});
    verification.snowballLinkCleanup20261119 = {
      reviewer: "Claude source review",
      reviewedAt: new Date().toISOString(),
      reason: "중복 판정 오류(PR #56 이전)로 덧붙은 다른 공고 링크 제거",
      removedLinks: old.poster_links.filter((l) => a.removeLinkIds.includes(l.id)),
      notices: a.notices,
      backupSha256: sha(old),
      planSha256: planHash,
      userDecision: "2026-11-19: user approved the snowball link cleanup",
    };
    const written = await check(
      db.from("posters").update({ field_verification: verification }).eq("id", a.id).eq("updated_at", mid.updated_at).select("id"),
    );
    assert.equal(written.length, 1);
    const after = await check(db.from("posters").select(select).eq("id", a.id).single());
    same(after.poster_links, old.poster_links.filter((l) => !a.removeLinkIds.includes(l.id)), "links");
    same(after.poster_images, old.poster_images, "images");
    same(after.poster_categories, old.poster_categories, "categories");
    same(after.poster_audiences, old.poster_audiences, "audiences");
    assert.equal(after.poster_status, "published");
    await save(`after-${a.id}`, after);
    journal.items.at(-1).phase = "verified";
    await save("applied", journal);
    console.log(JSON.stringify({ id: a.id.slice(0, 8), removed: a.removeLinkIds.length, verified: true }));
  }
  await check(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "update",
      action_reason: "snowball_link_cleanup_20261119",
      metadata_json: { actions: ACTIONS.map((a) => ({ id: a.id, links: a.removeLinkIds.length })), planSha256: planHash },
    }),
  );
  journal.completedAt = new Date().toISOString();
  await save("applied", journal);
  console.log(JSON.stringify({ verified: journal.items.length }));
}
