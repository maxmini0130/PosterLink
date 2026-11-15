import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-15 follow-up: the published 강북구 빌라관리사무소 무료법률상담실 row
// (70bd7f86, notice 71230) has empty place/contact/method fields, a summary cut at
// "https://www", and deadline_type ongoing with a 12-31 end date. The duplicate
// review row (notice 75836, rejected in source-review-20261115b) and 71230 both state
// the details below and point to the same 강북구청 page (prgmNo=2539).
// Usage: node src/apply-review-followup-20261115b.js            (dry-run, GET only)
//        node src/apply-review-followup-20261115b.js --apply --confirm=REVIEW_FOLLOWUP_20261115B
const root = fileURLToPath(
  new URL("../../../data/results/followup-20261115b/", import.meta.url),
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
if (apply) assert(process.argv.includes("--confirm=REVIEW_FOLLOWUP_20261115B"));

const ID = "70bd7f86-13eb-4c8f-8512-de2fcb5641c1";
const APPLY_URL =
  "https://www.gangbuk.go.kr/rsvt/anytm/anytmPrgm/view.do?menuNo=800002&prgmNo=2539";
const [old] = await read("backup");
assert.equal(old.id, ID);
const summaryShort =
  "강북구청 주택과가 연립·다세대 등 소규모 공동주택 거주 강북구민을 위해 매월 셋째 주 목요일 무료 변호사 법률상담(층간소음·임대차분쟁 등)을 운영합니다. 회당 4명 선착순이며 2026년 12월 31일까지 접수합니다.";
const action = {
  patch: {
    deadline_type: "fixed",
    application_end_at: "2026-12-31T23:59:59+09:00",
    deadline_status: "verified",
    deadline_source: "notice",
    deadline_time_verified: false,
    deadline_note: "회당 4명 선착순, 매월 셋째 주 목요일 10~12시 상담",
    eligibility_summary:
      "연립·다세대 등 소규모 공동주택에 거주(주소지)하는 강북구민 우선(아파트 거주자는 공석 발생 시 추가 접수)",
    event_location: "코스타타워 10층 소회의실(서울 강북구 도봉로 358)",
    contact_info: "강북구청 주택과 02-901-6836, 02-901-6823",
    application_method:
      "강북구청 통합예약 홈페이지(구정참여/공모 > 수시접수프로그램), 전화 또는 방문으로 선착순 사전예약. 담당자가 서류를 받은 뒤 신청확정 문자를 보내며, 이 문자를 받아야 신청이 확정됩니다.",
    recruitment_count: "회당 4명(연 40명)",
    participation_fee: "무료",
    summary_short: summaryShort,
    summary_long: `${summaryShort}

상담 일시: 매월 셋째 주 목요일 10:00~12:00(변호사 상담)
상담 장소: 코스타타워 10층 소회의실(서울 강북구 도봉로 358)
상담 대상: 연립·다세대 등 소규모 공동주택에 거주(주소지)하는 강북구민 우선(아파트 거주자는 공석 발생 시 추가 접수)
상담 방법: 1명당 30분 내외 1:1 대면상담, 회당 4명
상담 내용: 층간소음, 임대차분쟁 등 공동주택 주거문제에 한함(일반 민사·형사·가사·채권채무 상담 제외)
비용: 무료

신청: 강북구청 통합예약 홈페이지(구정참여/공모 > 수시접수프로그램), 전화 또는 방문으로 선착순 사전예약. 담당자가 서류를 받은 뒤 신청확정 문자를 보내며, 이 문자를 받아야 신청이 확정됩니다.

문의: 강북구청 주택과 02-901-6836, 02-901-6823`,
  },
  addLink: {
    url: APPLY_URL,
    title: "강북구청 수시접수 신청",
    link_type: "official_apply",
    is_primary: false,
  },
  reason:
    "청년몽땅정보통 71230(이 행의 원문)과 75836(중복으로 반려한 검수 대기 행)이 모두 강북구청 수시접수 prgmNo=2539, 접수기간 ~2026.12.31(선착순), 매월 셋째 주 목요일 10~12시, 코스타타워 10층 소회의실, 회당 4명/연 40명, 무료, 주택과 901-6836·6823을 명시함. 기존 행은 장소·문의·신청방법이 비어 있고 요약이 'https://www'에서 잘렸으며, 마감일이 있는데 ongoing으로 저장돼 있었음.",
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
assert(!old.poster_links.some((l) => l.url.includes("prgmNo=2539")));
assert(action.patch.deadline_note.length <= 80);
assert(
  Date.parse(action.patch.application_end_at) ===
    Date.parse(old.application_end_at),
);
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    id: ID.slice(0, 8),
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
  verification.reviewFollowup20261115b = {
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
  for (const k of ["title", "poster_status", "thumbnail_url", "organizer_name"])
    same(after[k], old[k], k);
  await save(`after-${ID}`, after);
  await check(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "review_followup_20261115b",
      metadata_json: { id: ID, kind: "fill_fields", planSha256: planHash },
    }),
  );
  journal.phase = "verified";
  journal.completedAt = new Date().toISOString();
  await save("applied", journal);
  console.log(JSON.stringify({ verified: 1 }));
}
