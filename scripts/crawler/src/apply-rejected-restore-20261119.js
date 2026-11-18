import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Frozen 2026-11-19 restore of three rejected posters that were not duplicates.
// The user reviewed the rejected list: only duplicates should be rejected; a
// passed date means approve then close. The 16 other listed rejections are
// duplicates whose originals still exist and stay rejected.
//   78826238 에코마일리지: rejected 11-14 as "no recruitment"; the poster asks
//            citizens to apply (ecomileage.seoul.go.kr / 동 주민센터).
//   349c22ac 청소년 대관 안내: quality-gate cleanup (weak summary, facility notice);
//            application_end_at 04-14 was the post date, not a deadline.
//   d187a009 성동구 일자리박람회: cleanup (AI said image is not a poster); the image
//            is the real poster; the 11-13 event has passed, so it is closed.
// Usage: node src/apply-rejected-restore-20261119.js            (dry-run, GET only)
//        node src/apply-rejected-restore-20261119.js --apply --confirm=REJECTED_RESTORE_20261119
const root = fileURLToPath(
  new URL("../../../data/results/rejected-audit-20261119/", import.meta.url),
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
if (apply) assert(process.argv.includes("--confirm=REJECTED_RESTORE_20261119"));

const STORAGE =
  "https://zxndgzsfrgwahwsdbjdj.supabase.co/storage/v1/object/public/poster-originals/crawler/";
const ecoShort =
  "서울시 에코마일리지는 참여를 신청한 시민이 에너지 절약·승용차 주행거리 감축·녹색실천을 하면 마일리지를 적립해 주는 사업입니다. 에코마일리지 누리집이나 동 주민센터에서 신청합니다.";
const rentalShort =
  "구립도화청소년문화의집이 청소년에게 강당·음악실·댄스실·프로그램실 등을 최대 2시간 무료로 빌려 줍니다. 이용 하루 전까지 예약하고 신청서를 작성하면 됩니다.";
const fairShort =
  "성동구와 성동광진고용복지플러스센터가 11월 13일(금) 14:00~17:00 성동구청 3층 대강당에서 연 2026 성동구 일자리박람회입니다. 구인기업 현장면접과 취업 컨설팅·특강이 열렸습니다.";

const ACTIONS = [
  {
    id: "78826238-551c-4e7c-8cba-117ab9828ffc",
    status: "published",
    reason:
      "11-14 반려 사유('모집·신청이 없는 단순 제도 소개')는 본문만 본 판단이었다. 포스터에 '에코마일리지는 이제 참여 신청해야 마일리지가 쌓여요', 분야별 신청 기간·대상·방법, 누리집(ecomileage.seoul.go.kr)·동 주민센터 신청이 명시돼 있다.",
    patch: {
      organizer_name: "서울특별시",
      application_organization_name:
        "서울특별시 에코마일리지(누리집·동 주민센터)",
      eligibility_summary:
        "서울시민. 건물: 세대 대표 1명 / 승용차: 서울시 등록 비사업용 12인승 이하 승용·승합차 소유자(전기·수소·하이브리드 제외) / 녹색실천: 만 14세 이상",
      application_method:
        "에코마일리지 누리집(ecomileage.seoul.go.kr)에서 신청하거나 동 주민센터 방문 신청",
      contact_info: "120 다산콜재단(02-120)",
      benefits_summary:
        "건물 에너지 절약 6개월 최대 5만, 승용차 주행거리 감축 연간 최대 5만, 녹색실천 연간 최대 2만 마일리지",
      application_start_at: null,
      application_end_at: null,
      deadline_type: "unknown",
      deadline_status: "unverified",
      deadline_source: null,
      deadline_time_verified: false,
      deadline_note:
        "분야별 신청 시기가 달라요(건물 6개월마다, 승용차 매년 2월)",
      summary_short: ecoShort,
      summary_long: `${ecoShort}

대상: 서울시민
신청: 에코마일리지 누리집(ecomileage.seoul.go.kr) 또는 동 주민센터 방문

[건물] 에너지 절약
- 신청 기간: 6개월마다, 개인별 평가 기간 안에 신청
- 대상: 서울시민(세대 대표 1명)
- 방법: 전기·수도·도시가스 사용량을 줄인 만큼 적립(6개월 사용량을 직전 2개년과 비교)
- 혜택: 6개월 최대 5만 마일리지

[승용차] 주행거리 감축
- 신청 기간: 매년 2월
- 대상: 서울시 등록 비사업용 12인승 이하 승용·승합차 소유자(전기·수소·하이브리드 제외)
- 혜택: 연간 최대 5만 마일리지

[녹색실천] 친환경 행동
- 대상: 만 14세 이상 서울시민
- 항목: 에코 문제 풀이, 친환경 운전, 음식물쓰레기 감량 등
- 혜택: 연간 최대 2만 마일리지

문의: 120 다산콜재단(02-120)`,
    },
    addLinks: [
      {
        url: "https://ecomileage.seoul.go.kr",
        title: "에코마일리지 누리집 신청",
        link_type: "official_apply",
        is_primary: false,
      },
    ],
    removeImageIds: [],
  },
  {
    id: "349c22ac-60ce-49a1-bba6-9b9e67b4c7e2",
    status: "published",
    reason:
      "자동 품질 정리(요약 부족·시설 이용 안내)로 반려됐지만, 포스터는 청소년 무료 대관(최대 2시간)의 시설·이용 시간·예약 방법·문의를 담은 실제 안내다. 저장된 마감 2026-04-14는 게시일이라 지웠다.",
    patch: {
      organizer_name: "구립도화청소년문화의집",
      application_organization_name: "구립도화청소년문화의집",
      eligibility_summary: "청소년",
      application_method:
        "최소 이용 하루 전 사전 예약 및 신청서 작성(2층 해봄이네 사무실). 대관 가능 여부 확인 필요",
      event_location:
        "구립도화청소년문화의집(우리家강당, 상상해봄, 프로그램실, 음악해봄, 댄스해봄 등)",
      contact_info: "운영지원팀 070-4337-0647",
      participation_fee: "무료(최대 2시간)",
      benefits_summary:
        "공부, 동아리 활동, 악기 연주, 춤 연습 등에 시설을 무료로 대관(화~토 9:00~21:00, 일 9:00~18:00)",
      application_start_at: null,
      application_end_at: null,
      deadline_type: "unknown",
      deadline_status: "unverified",
      deadline_source: null,
      deadline_time_verified: false,
      deadline_note: null,
      summary_short: rentalShort,
      summary_long: `${rentalShort}

대상: 청소년
신청: 최소 이용 하루 전 사전 예약 및 신청서 작성(2층 해봄이네 사무실), 대관 가능 여부 확인 필요

사용 가능 시설: 우리家강당, 상상해봄, 프로그램실, 음악해봄, 댄스해봄 등
이용 시간: 화~토 9:00~21:00, 일요일 9:00~18:00
이용 목적: 공부, 동아리 활동, 악기 연주, 춤 연습 등
비용: 무료(최대 2시간)

문의: 운영지원팀 070-4337-0647`,
    },
    addLinks: [],
    removeImageIds: [],
  },
  {
    id: "d187a009-d74d-4613-ae5a-ab2841e9c8ad",
    status: "closed",
    closedReason: "일자리박람회가 2026-11-13 14:00~17:00에 종료됨",
    reason:
      "자동 품질 정리(AI 이미지 판정: 포스터 아님)로 반려됐지만, 이미지는 일시·장소·채용존·특강·문의가 담긴 실제 행사 포스터다. 행사가 11/13에 끝나 승인 후 마감 처리한다.",
    thumbnail: `${STORAGE}b59e0754aa1ff2f870c44bc0.jpg`,
    patch: {
      organizer_name: "성동구, 성동광진고용복지플러스센터",
      application_organization_name: null,
      eligibility_summary: "구직자 누구나(행사 당일 참여 가능)",
      application_method:
        "구직자는 행사 당일 현장 참여. 취업특강은 성동구 통합예약에서 사전 신청",
      event_location: "성동구청 3층 대강당",
      contact_info: "성동구 희망일자리센터 02-2286-5408~9",
      benefits_summary:
        "구인기업 20개 내외 현장면접·채용상담, 이력서 사진 촬영·컨설팅, AI 건강검진·직무역량 테스트, 취업특강(15:00~17:00, 이소영 경력개발컨설팅 전문가)",
      event_start_at: "2026-11-13T14:00:00+09:00",
      event_end_at: "2026-11-13T17:00:00+09:00",
      application_start_at: null,
      application_end_at: null,
      deadline_type: "unknown",
      deadline_status: "unverified",
      deadline_source: null,
      deadline_time_verified: false,
      deadline_note: null,
      summary_short: fairShort,
      summary_long: `${fairShort}

대상: 구직자 누구나(행사 당일 참여 가능)
신청: 현장 참여, 취업특강은 성동구 통합예약 사전 신청

일시: 2026년 11월 13일(금) 14:00~17:00
장소: 성동구청 3층 대강당
규모: 구인기업 20개 내외, 구직자 300여 명
채용존: 구인기업·구직자 현장면접 및 채용상담
홍보존: 유관기관 취업지원정책·프로그램 홍보
체험존: 이력서 사진 촬영·컨설팅, AI 건강검진, 취업타로, AI 직무역량 테스트 등
취업특강: 15:00~17:00 「취업 준비부터 경력 설계까지」

문의: 성동구 희망일자리센터 02-2286-5408~9`,
    },
    addLinks: [],
    // Same JPEG (1,607,173 bytes) as the stored copy; drop the two external URLs.
    removeImageIds: ["4b08de53", "e5942805"],
  },
];

const backup = await read("backup");
const planHash = sha(ACTIONS);
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
  db
    .from("posters")
    .select(select)
    .in(
      "id",
      ACTIONS.map((a) => a.id),
    ),
);
assert.equal(current.length, ACTIONS.length);
for (const a of ACTIONS) {
  const old = backup.find((r) => r.id === a.id);
  assert(old, `missing backup ${a.id}`);
  const { _asked, ...oldRow } = old;
  same(
    current.find((r) => r.id === a.id),
    oldRow,
    `Concurrent change ${a.id}`,
  );
  assert.equal(oldRow.poster_status, "rejected");
  assert(
    !/중복|duplicate/i.test(oldRow.rejection_reason ?? ""),
    `${a.id} is a duplicate rejection`,
  );
  a.removeImageFullIds = a.removeImageIds.map((s) => {
    const m = oldRow.poster_images.filter((i) => i.id.startsWith(s));
    assert.equal(m.length, 1, s);
    return m[0].id;
  });
  if (a.thumbnail)
    assert(
      oldRow.poster_images.some((i) => i.storage_path === a.thumbnail),
      "thumbnail must be a stored image",
    );
  for (const l of a.addLinks)
    assert(!oldRow.poster_links.some((r) => r.url === l.url));
  if (a.patch.deadline_note) assert(a.patch.deadline_note.length <= 80);
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    actions: ACTIONS.map((a) => [a.id.slice(0, 8), a.status]),
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
  const journal = { planHash, items: [] };
  for (const a of ACTIONS) {
    const old = backup.find((r) => r.id === a.id);
    const at = new Date().toISOString();
    const verification = structuredClone(old.field_verification || {});
    verification.sourceReview20261119Restore = {
      reviewer: "Claude source review",
      reviewedAt: at,
      reason: a.reason,
      closedReason: a.closedReason ?? null,
      previousStatus: old.poster_status,
      previousRejectionReason: old.rejection_reason ?? null,
      previous: Object.fromEntries(
        Object.keys(a.patch).map((k) => [k, old[k] ?? null]),
      ),
      removedImages: old.poster_images.filter((i) =>
        a.removeImageFullIds.includes(i.id),
      ),
      backupSha256: sha(old),
      planSha256: planHash,
      userDecision:
        "2026-11-19: reject only duplicates; passed dates are approved then closed",
    };
    if (a.thumbnail) {
      verification.posterImageOcr = {
        ...verification.posterImageOcr,
        currentImageSourceReview: {
          imageUrl: a.thumbnail,
          reviewer: "Claude visual check",
          isPoster: true,
          note: "실제 행사 포스터(일시·장소·프로그램·문의 포함); 기존 AI 판정 isPoster=false는 오판",
          checkedAt: at,
        },
      };
    }
    journal.items.push({ id: a.id, phase: "start" });
    await save("applied", journal);
    for (const imageId of a.removeImageFullIds)
      await check(
        db
          .from("poster_images")
          .delete()
          .eq("poster_id", a.id)
          .eq("id", imageId),
      );
    const added = [];
    for (const l of a.addLinks)
      added.push(
        await check(
          db
            .from("poster_links")
            .insert({ ...l, poster_id: a.id })
            .select("*")
            .single(),
        ),
      );
    const written = await check(
      db
        .from("posters")
        .update({
          ...a.patch,
          ...(a.thumbnail ? { thumbnail_url: a.thumbnail } : {}),
          poster_status: a.status,
          published_at: at,
          rejection_reason: null,
          deadline_checked_at: at,
          field_verification: verification,
        })
        .eq("id", a.id)
        .eq("poster_status", "rejected")
        .eq("updated_at", old.updated_at)
        .select("id"),
    );
    assert.equal(written.length, 1);
    const after = await check(
      db.from("posters").select(select).eq("id", a.id).single(),
    );
    assert.equal(after.poster_status, a.status);
    assert.equal(after.rejection_reason, null);
    for (const [k, v] of Object.entries(a.patch))
      if (k.endsWith("_at"))
        assert.equal(
          v === null ? null : Date.parse(after[k]),
          v === null ? null : Date.parse(v),
          k,
        );
      else same(after[k], v, k);
    if (a.thumbnail) assert.equal(after.thumbnail_url, a.thumbnail);
    same(after.poster_links, [...old.poster_links, ...added], "links");
    same(
      after.poster_images,
      old.poster_images.filter((i) => !a.removeImageFullIds.includes(i.id)),
      "images",
    );
    same(after.poster_categories, old.poster_categories, "categories");
    same(after.poster_audiences, old.poster_audiences, "audiences");
    await save(`after-${a.id}`, after);
    journal.items.at(-1).phase = "verified";
    await save("applied", journal);
    console.log(
      JSON.stringify({
        id: a.id.slice(0, 8),
        status: a.status,
        verified: true,
      }),
    );
  }
  await check(
    db.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "rejected_restore_20261119",
      metadata_json: {
        actions: ACTIONS.map((a) => ({ id: a.id, status: a.status })),
        planSha256: planHash,
      },
    }),
  );
  journal.completedAt = new Date().toISOString();
  await save("applied", journal);
  console.log(JSON.stringify({ verified: journal.items.length }));
}
