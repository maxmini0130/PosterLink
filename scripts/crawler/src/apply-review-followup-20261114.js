import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-14 follow-ups to the 11-12 / 11-14 source reviews (4 published rows).
// Usage: node src/apply-review-followup-20261114.js            (dry-run, GET only)
//        node src/apply-review-followup-20261114.js --apply --confirm=REVIEW_FOLLOWUP_20261114
const root = fileURLToPath(
  new URL("../../../data/results/followup-20261114/", import.meta.url),
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
if (apply) assert(process.argv.includes("--confirm=REVIEW_FOLLOWUP_20261114"));

const HANAM_DUPLICATE_HWP_SHA256_PREFIX = "71dbddbadc649c12";
const actions = [
  {
    id: "37e62400-2d84-4696-b8a9-61fae8fdc92e",
    kind: "reject",
    patch: {
      poster_status: "rejected",
      rejection_reason:
        "중복: 같은 프로그램(강북구청 수시접수 prgmNo=2620)의 최신 공고 66511a36-22e9-4fe7-a017-6315b1018393으로 대체",
    },
    reason:
      "원문 71231과 새 공고 75838이 같은 강북구청 수시접수 신청 페이지(prgmNo=2620)를 가리키는 같은 프로그램. 이 행의 요약 '내용: 진행 불가합니다'는 원문 유의사항 '방역 지침 이행 거부 시 해설프로그램 진행 불가합니다'를 잘못 추출한 값. 11-14 검수로 내용이 정확한 66511a36을 공개했으므로 이 행은 비공개 처리.",
    supersededBy: "66511a36-22e9-4fe7-a017-6315b1018393",
  },
  {
    id: "70f44b8c-4092-44c4-8100-109e7e108027",
    kind: "links",
    removeLinks: [
      "fd342a53-6105-4952-88ce-493b3b150b0a",
      "f7de3fa0-313f-470a-a925-dd4a940afd55",
      "a8d166e6-348b-4db6-b01a-380011e41e36",
      "0da9def5-4cdb-436c-8ac9-707a65a8a38c",
    ],
    linkPatches: [
      {
        id: "82f86c8b-73ac-474d-86ef-2a2db3425547",
        patch: { title: "입주기업 모집 신청서·사업계획서 양식(hwp)" },
      },
    ],
    reason: `신청서 hwp 링크 5개를 내려받아 비교한 결과 모두 같은 파일(SHA-256 ${HANAM_DUPLICATE_HWP_SHA256_PREFIX}…, 1,153,024 bytes). 대표 링크 1개만 남김.`,
  },
  {
    id: "b649bf17-99ee-4c63-bc53-60a076a0fb19",
    kind: "close",
    patch: { poster_status: "closed" },
    reason:
      "신청 마감이 없는 상영 행사로, 마지막 상영일 11/13(금)이 지나 종료.",
  },
  {
    id: "785ce221-e77e-4f75-8a46-98f87eed9fa0",
    kind: "close",
    patch: { poster_status: "closed" },
    reason: "모집 종료일이 공고에 없고 행사가 2026-11-13 19~21시에 종료됨.",
  },
];

const backup = await read("backup");
const planHash = sha(actions);
assert(
  !(await fs.access(`${root}/applied.json`).then(
    () => true,
    () => false,
  )),
  "Inspect journal before recovery; never replay",
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
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      actions.map((a) => a.id),
    ),
);
assert.equal(current.length, actions.length);
for (const a of actions) {
  const old = backup.find((r) => r.id === a.id);
  assert(old, `missing backup ${a.id}`);
  assert.equal(old.poster_status, "published");
  same(
    current.find((r) => r.id === a.id),
    old,
    `Concurrent change ${a.id}`,
  );
  for (const id of a.removeLinks ?? []) {
    const link = old.poster_links.find((r) => r.id === id);
    assert(
      link && !link.is_primary,
      `${id} must be an existing non-primary link`,
    );
    const bytes = await fs.readFile(`${root}/dl/${id}.bin`);
    assert(
      createHash("sha256")
        .update(bytes)
        .digest("hex")
        .startsWith(HANAM_DUPLICATE_HWP_SHA256_PREFIX),
    );
  }
  for (const p of a.linkPatches ?? [])
    assert(old.poster_links.some((r) => r.id === p.id));
}
const superseding = await check(
  db
    .from("posters")
    .select("id,poster_status,poster_links(url)")
    .eq("id", actions[0].supersededBy)
    .single(),
);
assert.equal(superseding.poster_status, "published");
assert(superseding.poster_links.some((l) => /prgmNo=2620/.test(l.url)));
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    actions: actions.map((a) => [a.id.slice(0, 8), a.kind]),
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
const journal = { planHash, items: [] };
for (const a of actions) {
  const old = backup.find((r) => r.id === a.id);
  const at = new Date().toISOString();
  const verification = structuredClone(old.field_verification || {});
  verification.reviewFollowup20261114 = {
    reviewer: "Claude source review",
    reviewedAt: at,
    kind: a.kind,
    reason: a.reason,
    supersededBy: a.supersededBy ?? null,
    previousStatus: old.poster_status,
    removedLinks: old.poster_links.filter((r) =>
      (a.removeLinks ?? []).includes(r.id),
    ),
    backupSha256: sha(old),
    planSha256: planHash,
  };
  journal.items.push({ id: a.id, phase: "start" });
  await save("applied", journal);
  for (const id of a.removeLinks ?? [])
    await check(
      db.from("poster_links").delete().eq("poster_id", a.id).eq("id", id),
    );
  for (const p of a.linkPatches ?? [])
    await check(
      db
        .from("poster_links")
        .update(p.patch)
        .eq("poster_id", a.id)
        .eq("id", p.id),
    );
  const written = await check(
    db
      .from("posters")
      .update({ ...(a.patch ?? {}), field_verification: verification })
      .eq("id", a.id)
      .eq("poster_status", "published")
      .eq("updated_at", old.updated_at)
      .select("id"),
  );
  assert.equal(written.length, 1);
  const after = await check(
    db.from("posters").select(select).eq("id", a.id).single(),
  );
  assert.equal(after.poster_status, a.patch?.poster_status ?? "published");
  if (a.patch?.rejection_reason)
    assert.equal(after.rejection_reason, a.patch.rejection_reason);
  const expectedLinks = structuredClone(
    old.poster_links.filter((r) => !(a.removeLinks ?? []).includes(r.id)),
  );
  for (const p of a.linkPatches ?? [])
    Object.assign(
      expectedLinks.find((r) => r.id === p.id),
      p.patch,
    );
  same(after.poster_links, expectedLinks, `links ${a.id}`);
  for (const key of [
    "title",
    "summary_short",
    "application_end_at",
    "thumbnail_url",
  ])
    same(after[key], old[key], `unexpected ${a.id}/${key}`);
  await save(`after-${a.id}`, after);
  journal.items.at(-1).phase = "verified";
  await save("applied", journal);
  console.log(
    JSON.stringify({ id: a.id.slice(0, 8), kind: a.kind, verified: true }),
  );
}
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "approve",
    action_reason: "review_followup_20261114",
    metadata_json: {
      actions: actions.map((a) => ({ id: a.id, kind: a.kind })),
      planSha256: planHash,
    },
  }),
);
journal.completedAt = new Date().toISOString();
await save("applied", journal);
console.log(JSON.stringify({ verified: journal.items.length }));
