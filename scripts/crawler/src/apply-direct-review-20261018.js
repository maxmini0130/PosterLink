import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Original snapshots and fetched source evidence are ignored local artifacts.
// Restore only after comparing subsequent edits, using the full snapshot and relations.
const root = "../../data/results/";
const date = "20261018";
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261018"));
const backup = JSON.parse(
  await fs.readFile(`${root}review-queue-backup-${date}-direct.json`, "utf8"),
);
const kst = (day, time = "00:00:00") => `2026-10-${day}T${time}+09:00`;
const notice = (id) =>
  `https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=${id}`;
const link = (url, type, primary = false) => ({
  url,
  link_type: type,
  title: type === "official_apply" ? "공식 신청 링크" : "공고 원문",
  is_primary: primary,
});
const decisions = [
  {
    id: "caced31e-133c-4c0b-93bb-e246a86c82a0",
    status: "published",
    codes: ["CAT_HEALTH", "CAT_EVENT_RECRUIT"],
    source: notice(74967),
    reason:
      "2026년 명시 원문·실제 포스터 및 네이버폼 제목 일치. 신청 10/12~22(선착순), 행사 10/24 14:00~15:30. 마음건강 힐링 프로그램으로 건강/의료·행사모집. 포스터의 강남구 주최와 강남힐링센터 신사 장소를 구분.",
    patch: {
      application_start_at: kst("12"),
      application_end_at: kst("22", "23:59:59"),
      event_start_at: kst("24", "14:00:00"),
      event_end_at: kst("24", "15:30:00"),
      deadline_type: "until_exhausted",
      organizer_name: "강남구",
      application_organization_name: "강남힐링센터 신사",
      summary_short:
        "강남구민 100명 선착순 모집(가족 참여 가능). 2026.10.22까지 네이버폼 신청. 10.24(토) 14:00~15:30 강남힐링센터 신사에서 컬러클레이와 힐링 음악 콘서트를 진행합니다. 주차 불가·대중교통 이용. 문의: 강남구 주민자치과 02-3423-5224.",
    },
    links: [
      link(
        "https://form.naver.com/response/EZsXHlp3ap8",
        "official_apply",
        true,
      ),
      link(notice(74967), "official_notice"),
    ],
  },
  {
    id: "43cbe4d2-107f-4c5b-a01e-1340b1bf6717",
    status: "published",
    codes: ["CAT_EVENT_RECRUIT"],
    source: notice(74966),
    reason:
      "공공기관 원문과 최종 포스터가 2026.10.31 13:00~17:00 현장 참여로 일치. 사전 모집이 아닌 행사 당일 현장 참여 시간을 기록. 반려동물 행사이므로 행사모집. 기존 original은 행사 로고만 있어 실제 최종 포스터로 교체. 포스터의 주최 서초구·주관 THE ABLE DOG를 구분.",
    image: `${root}review-pet-official-${date}.jpg`,
    patch: {
      application_start_at: kst("31", "13:00:00"),
      application_end_at: kst("31", "17:00:00"),
      event_start_at: kst("31", "13:00:00"),
      event_end_at: kst("31", "17:00:00"),
      deadline_type: "fixed",
      organizer_name: "서초구",
      application_organization_name: null,
      application_method:
        "2026.10.31 13:00~17:00 행사 당일 현장 참여(사전 신청 아님)",
      summary_short:
        "2026.10.31(토) 13:00~17:00 서초문화예술공원 잔디광장에서 현장 참여합니다. 사전 신청 없이 반려동물을 사랑하는 누구나 참여 가능. 건강·운동·케어 체험 부스, 독댄스, 어질리티, 퀴즈 등을 운영합니다. 주최 서초구·주관 THE ABLE DOG. 문의: 서초구청 동물복지팀 02-2155-5354.",
    },
    links: [
      link(notice(74966), "official_notice", true),
      {
        url: "https://seocho2026.kr/",
        title: "행사 홈페이지",
        link_type: "other",
        is_primary: false,
      },
    ],
  },
  {
    id: "7dae8b68-0f2f-4a02-8af4-cb8e24434085",
    status: "published",
    codes: ["CAT_COURSE"],
    source: notice(74945),
    reason:
      "원문 신청기간의 2026년, 10/26 월요일·10/29 목요일 및 포스터 일정 일치로 잘못 추출한 2023년을 교정. 상세 모집마감 10/26 오전 8시를 상단 자정 메타데이터보다 우선. 행사 10/29 15~17시. 실제 강의/실습 모집으로 교육강좌. 미니인턴 서버 403 접근 제한은 별도 기록하며 포스터·공공기관 원문에서 신청 주소 확인.",
    patch: {
      application_start_at: kst("16"),
      application_end_at: kst("26", "08:00:00"),
      event_start_at: kst("29", "15:00:00"),
      event_end_at: kst("29", "17:00:00"),
      deadline_type: "until_exhausted",
      organizer_name: "용산 청년지음·용산구광역일자리카페",
      application_organization_name: "미니인턴",
      target_age_min: 19,
      target_age_max: 39,
      summary_short:
        "만 19~39세 청년 15명 모집. 2026.10.26(월) 오전 8시까지 미니인턴에서 신청하며 조기 마감될 수 있습니다. 10.29(목) 15:00~17:00 용산 청년지음 커뮤니티홀에서 AI 취업 준비 특강과 NAIM 실습을 진행합니다. 참여동기 등을 확인해 선정·개별 안내. 문의: 02-6261-1933.",
    },
    links: [
      link("https://miniintern.com/event/3351", "official_apply", true),
      link(notice(74945), "official_notice"),
    ],
  },
  {
    id: "bd1e867d-8323-428b-bdcc-1dd6caaac413",
    status: "review",
    codes: ["CAT_EVENT_RECRUIT"],
    source: notice(74851),
    reason:
      "원문과 수정 포스터는 2026년 2차 모집 마감 10/28, 실제 Google 신청서는 10/13으로 충돌. 깨진 주소의 끝 하이픈을 제거하면 담당기관 링크와 동일한 신청서로 연결되어 별도 최신 신청서가 아님을 확인. 운영기관은 동작구1인가구지원센터(동작구가족센터), 서울동물복지지원센터 동대문은 활동 장소. 확정 불가한 신청 종료일은 비우고 승인 보류.",
    patch: {
      application_start_at: kst("08"),
      application_end_at: null,
      event_start_at: kst("16", "14:00:00"),
      event_end_at: kst("30", "16:00:00"),
      deadline_type: "unknown",
      organizer_name: "동작구1인가구지원센터(동작구가족센터)",
      application_organization_name: "동작구1인가구지원센터",
      summary_short:
        "서울시 생활권 1인가구 12명 대상 유기동물 봉사활동. 2026.10.16·10.30 각 14:00~16:00 서울동물복지지원센터 동대문에서 진행합니다. 원문·수정 포스터의 2차 모집 마감 10.28과 실제 신청서의 10.13이 달라 확인 대기 중입니다. 문의: 동작구1인가구지원센터 02-6294-1621.",
    },
    links: [
      link("https://forms.gle/X9FbS2pFmREoPDZJ6", "official_apply", true),
      link(notice(74851), "official_notice"),
    ],
  },
];
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
assert.equal(backup.length, 4);
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
  JSON.stringify({ apply, targets: decisions.length, published: 3, held: 1 }),
);
const report = { dateKst: "2026-10-18", apply, items: [] };
const save = () =>
  fs.writeFile(
    `${root}review-queue-${apply ? "applied" : "dry-run"}-${date}-direct.json`,
    JSON.stringify(report, null, 2),
  );
for (const d of decisions) {
  const before = backup.find((x) => x.id === d.id),
    now = new Date().toISOString();
  const categories = d.codes.map((code) => cats.find((x) => x.code === code));
  const verification = {
    ...before.field_verification,
    decision: d.status === "published" ? "approved" : "needs_review",
    reason: d.reason,
    correctedOrgName: d.patch.organizer_name,
    organizerName: d.patch.organizer_name,
    orgNameMatches: true,
    correctedDeadline: d.patch.application_end_at,
    deadlineMatches: d.status === "published",
    dateIssues:
      d.status === "published"
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
      decision: d.status === "published" ? "pass" : "review",
      normalizedDeadline: d.patch.application_end_at,
      storedDeadline: d.patch.application_end_at,
      reviewedAt: now,
      evidence: d.reason,
    },
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
          "신청 종료일 미확정: 원문과 신청서의 차이 확인 중",
        application:
          d.patch.application_method ??
          d.links.find((x) => x.link_type === "official_apply")?.url,
      },
    },
    directSourceReview: {
      reviewer: "codex-direct-source-review",
      todayKst: "2026-10-18",
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
  const patch = {
    ...d.patch,
    field_verification: verification,
    poster_status: d.status,
    ...(d.status === "published"
      ? { published_at: now, rejection_reason: null }
      : {}),
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
