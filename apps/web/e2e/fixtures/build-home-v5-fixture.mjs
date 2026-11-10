// Builds e2e/fixtures/home-v5.json: a local-only home fixture that fills
// every home v5 section (picks, 7-day deadline, new pages, three curated
// bundles, institution suggestions). Dates are relative ({"$days": n},
// {"$weekday": 6}) and resolved by lib/homeFeedServer when the server runs
// with UI_SHOWCASE=1 HOME_FEED_FIXTURE=<path>. Titles echo the v5 mockups;
// none of this is real notice data.
//   node e2e/fixtures/build-home-v5-fixture.mjs
import { writeFileSync } from "node:fs";

const id = (prefix, n) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const R = {
  nation: id("bbbbbbbb", 1),
  seoul: id("bbbbbbbb", 2),
  mapo: id("bbbbbbbb", 3),
  gangseo: id("bbbbbbbb", 4),
  jongno: id("bbbbbbbb", 5),
};
const regions = [
  {
    id: R.nation,
    name: "전국",
    full_name: "전국",
    code: "REG_NATION",
    level: "nation",
    parent_id: null,
  },
  {
    id: R.seoul,
    name: "서울특별시",
    full_name: "서울특별시",
    code: "REG_SEOUL",
    level: "sido",
    parent_id: null,
  },
  {
    id: R.mapo,
    name: "마포구",
    full_name: "서울특별시 마포구",
    code: "REG_SEOUL_MAPO",
    level: "sigungu",
    parent_id: R.seoul,
  },
  {
    id: R.gangseo,
    name: "강서구",
    full_name: "서울특별시 강서구",
    code: "REG_SEOUL_GANGSEO",
    level: "sigungu",
    parent_id: R.seoul,
  },
  {
    id: R.jongno,
    name: "종로구",
    full_name: "서울특별시 종로구",
    code: "REG_SEOUL_JONGNO",
    level: "sigungu",
    parent_id: R.seoul,
  },
  // No posters: the home says so and shows the nationwide ones.
  {
    id: "bbbbbbbb-0000-4000-8000-000000000006",
    name: "부산광역시",
    full_name: "부산광역시",
    code: "REG_BUSAN",
    level: "sido",
    parent_id: null,
  },
];
const categoryDefs = [
  ["CAT_WELFARE", "지원금/복지"],
  ["CAT_EDUCATION", "교육/취업"],
  ["CAT_CULTURE", "문화/행사"],
  ["CAT_HOUSING", "주거/금융"],
  ["CAT_BUSINESS", "소상공인"],
  ["CAT_FAMILY", "육아/가족"],
  ["CAT_HEALTH", "건강/의료"],
  ["CAT_OTHER", "기타"],
  ["CAT_COURSE", "교육강좌"],
  ["CAT_EVENT_RECRUIT", "행사모집"],
  ["CAT_SUPPORT_PROGRAM", "지원사업"],
];
const C = {};
const categories = categoryDefs.map(([code, name], i) => {
  C[code] = id("cccccccc", i + 1);
  return { id: C[code], name, code, parent_id: null };
});
const O = {
  a: id("dddddddd", 1),
  b: id("dddddddd", 2),
  c: id("dddddddd", 3),
  d: id("dddddddd", 4),
};
const institutions = [
  [O.a, "fixture-youth-center", "서울청년센터 마포"],
  [O.b, "fixture-culture", "마포문화재단"],
  [O.c, "fixture-welfare", "서울시복지재단"],
  [O.d, "fixture-health", "마포구보건소"],
].map(([iid, slug, name]) => ({ id: iid, slug, name }));

const rows = [];
const regionLinks = [];
const categoryLinks = [];
const popularity = {};
const images = [];
let n = 0;
// Poster images: Storage-style URLs; specs serve them through a mocked
// /_next/image. Every other poster falls back to the default image.
const IMAGE_HOST =
  "https://fixture.supabase.co/storage/v1/object/public/posters";
const imageFor = (n) =>
  n === 4
    ? { width: 1600, height: 600, image_status: "unsuitable" } // wide banner
    : n === 8
      ? { width: 600, height: 1800, image_status: "ok" } // very long
      : n % 2 === 1
        ? { width: 600, height: 800, image_status: "ok" }
        : null;

function add(o) {
  n += 1;
  const pid = id("aaaaaaaa", n);
  const at = o.at ?? { $days: -(n % 9), $hour: 9 };
  rows.push({
    id: pid,
    title: o.title,
    organizer_name: o.org ?? null,
    organizer_id: o.orgId ?? null,
    application_start_at: { $days: -20 },
    application_end_at: o.end ?? { $days: 20, $hour: 23 },
    deadline_type: "fixed",
    event_start_at: o.eventStart ?? null,
    event_end_at: o.eventEnd ?? null,
    event_location: o.place ?? null,
    eligibility_summary: o.elig ?? null,
    target_age_min: o.ageMin ?? null,
    target_age_max: o.ageMax ?? null,
    thumbnail_url: imageFor(n) ? `${IMAGE_HOST}/feed-test-${n}.png` : null,
    source_key: `https://example.invalid/notice/${n}`,
    created_at: at,
    published_at: at,
    poster_status: "published",
    favorite_count: 0,
    primary_category_code: o.cat,
    fv_regions: null,
    audiences: null,
    benefit_summary: o.benefit ?? null,
    benefit_kind: o.kind ?? null,
    event_schedule_kind: o.sched ?? null,
    card_facts_status: o.benefit ? "verified" : null,
    featured_week: null,
  });
  for (const region of o.regions ?? ["mapo"])
    regionLinks.push({
      poster_id: pid,
      region_id: R[region],
      basis: o.basis ?? null,
    });
  categoryLinks.push({ poster_id: pid, category_id: C[o.cat] });
  if (o.pop) popularity[pid] = o.pop;
  const image = imageFor(n);
  if (image)
    images.push({
      poster_id: pid,
      storage_path: `${IMAGE_HOST}/feed-test-${n}.png`,
      image_width: image.width,
      image_height: image.height,
      image_status: image.image_status,
    });
}

// 눈여겨볼 공고: verified benefits, most popular.
add({
  title: "2026 하반기 청년 월세 지원 추가 모집",
  cat: "CAT_HOUSING",
  regions: ["seoul"],
  benefit: "월 최대 20만원 × 12개월",
  kind: "grant",
  ageMin: 19,
  ageMax: 39,
  pop: 40,
  org: "서울특별시",
  end: { $days: 18, $hour: 18 },
});
add({
  title: "이머시브 미디어아트 & 테크 전문가 교육생 5기",
  cat: "CAT_COURSE",
  regions: ["seoul"],
  benefit: "교육비 전액 지원",
  kind: "free",
  elig: "청년 구직자",
  pop: 35,
  org: "서울경제진흥원",
});
add({
  title: "자전거타기 좋은 서울 영상 공모전",
  cat: "CAT_CULTURE",
  regions: ["seoul"],
  benefit: "총상금 500만원",
  kind: "prize",
  elig: "대한민국 국민 누구나",
  pop: 30,
  org: "서울특별시",
});
add({
  title: "2026 에너지 바우처 추가 신청 안내",
  cat: "CAT_WELFARE",
  regions: ["seoul"],
  benefit: "가구당 최대 70만원",
  kind: "grant",
  elig: "저소득 가구",
  pop: 25,
  org: "서울특별시",
});
add({
  title: "2026 마포구 소상공인 온라인 판로 지원사업 참여 업체 모집",
  cat: "CAT_BUSINESS",
  regions: ["mapo"],
  benefit: "업체당 최대 200만원",
  kind: "grant",
  elig: "마포구 소재 소상공인",
  basis: "eligibility",
  pop: 20,
  org: "마포구청",
});
add({
  title: "청년 마음건강 상담 지원 11월 신청",
  cat: "CAT_SUPPORT_PROGRAM",
  regions: ["seoul"],
  benefit: "상담 8회 무료",
  kind: "free",
  ageMin: 19,
  ageMax: 39,
  pop: 18,
  org: "서울시복지재단",
  orgId: O.c,
});

// 7일 안에 마감.
[
  [
    "마포러닝메이트 참여자 모집",
    "CAT_EVENT_RECRUIT",
    "무료 · 매주 목요일",
    "free",
    "recurring",
    2,
    "서울청년센터 마포",
    O.a,
  ],
  [
    "KBS 전국노래자랑 마포구편 참가자 모집",
    "CAT_EVENT_RECRUIT",
    null,
    null,
    null,
    3,
    "마포문화재단",
    O.b,
  ],
  [
    "청년 전월세 보증금 이자 지원",
    "CAT_HOUSING",
    "이자 최대 연 3% 지원",
    "service",
    null,
    4,
    "서울특별시",
    null,
  ],
  [
    "「제2회 마포구민 체육대회」 참여자(선수) 모집",
    "CAT_EVENT_RECRUIT",
    "참가비 무료 · 기념품",
    "free",
    "single",
    5,
    "마포구청",
    null,
  ],
  [
    "망원한강공원 가을 음악회 관람 신청",
    "CAT_EVENT_RECRUIT",
    "무료",
    "free",
    "single",
    6,
    "마포문화재단",
    O.b,
  ],
].forEach(([title, cat, benefit, kind, sched, days, org, orgId], i) =>
  add({
    title,
    cat,
    benefit,
    kind,
    sched,
    org,
    orgId,
    end: { $days: days, $hour: 18 },
    regions: ["mapo"],
    basis: i % 2 ? "venue" : null,
    place: i % 2 ? "마포구청 2층 대강당" : null,
    elig: i === 0 ? "청년" : null,
    eventStart: sched === "single" ? { $days: 12, $hour: 17 } : null,
  }),
);

// 이번 주말 무료 체험: verified free, event this Saturday/Sunday, not popular.
add({
  title: "주말 목공 원데이 클래스",
  cat: "CAT_COURSE",
  regions: ["mapo"],
  benefit: "무료",
  kind: "free",
  eventStart: { $weekday: 6, $hour: 14 },
  sched: "single",
  org: "마포청년나루",
  at: { $days: -14 },
  place: "마포청년나루",
});
add({
  title: "한강 선셋 요가 클래스 참가자 모집",
  cat: "CAT_EVENT_RECRUIT",
  regions: ["mapo"],
  benefit: "무료",
  kind: "free",
  eventStart: { $weekday: 7, $hour: 17 },
  sched: "single",
  org: "마포구체육회",
  at: { $days: -14 },
});
add({
  title: "청년 1인 가구 집밥 요리 클래스",
  cat: "CAT_COURSE",
  regions: ["seoul"],
  benefit: "참가비 무료",
  kind: "free",
  eventStart: { $weekday: 6, $hour: 11 },
  sched: "single",
  org: "서울시 1인가구지원센터",
  elig: "1인 가구 청년",
  at: { $days: -14 },
});

// 청년 지원금·월세 모음.
add({
  title: "청년 교통비 지원 2차 신청",
  cat: "CAT_SUPPORT_PROGRAM",
  regions: ["seoul"],
  ageMin: 19,
  ageMax: 39,
  org: "서울특별시",
  at: { $days: -15 },
});
add({
  title: "청년 취업 준비 비용 지원사업 신청자 모집",
  cat: "CAT_SUPPORT_PROGRAM",
  regions: ["mapo"],
  elig: "마포구 거주 미취업 청년",
  org: "마포구청",
  at: { $days: -15 },
});
add({
  title: "청년 임차보증금 이자 지원",
  cat: "CAT_HOUSING",
  regions: ["seoul"],
  ageMin: 19,
  ageMax: 39,
  org: "서울특별시",
  at: { $days: -16 },
});
add({
  title: "청년 면접정장 무료 대여",
  cat: "CAT_SUPPORT_PROGRAM",
  regions: ["mapo"],
  elig: "청년 구직자",
  org: "마포구청",
  at: { $days: -16 },
});

// Organiser posters (institution suggestions, 최근 30일).
for (let i = 0; i < 8; i += 1) {
  const inst = institutions[i % 4];
  add({
    title: `${inst.name} 11월 프로그램 안내 ${i + 1}`,
    cat: i % 2 ? "CAT_COURSE" : "CAT_EVENT_RECRUIT",
    regions: ["mapo"],
    org: inst.name,
    orgId: inst.id,
    at: { $days: -(20 + i) },
  });
}

// 새로 올라온 공고.
[
  "AI로 일하는 법 입문 특강",
  "영유아 가정 찾아가는 건강 상담 신청 안내",
  "경의선숲길 주말 플리마켓 셀러 모집",
  "강서구립도서관 가을 독서회",
  "종로 청년 문화 축제 안내",
  "서울 청년 창업 아카데미",
  "마포 평생학습 강좌 수강생 모집",
  "어르신 스마트폰 교실",
  "다문화가족 수채화 클래스",
  "청소년 밴드 페스티벌 참가 밴드 모집",
  "장애인 체육 프로그램 참여자 모집",
  "소상공인 세무 상담 주간",
  "가족 캠핑 체험 신청",
  "청년 재무 상담",
  "노무 상담 데이",
  "도시농업 텃밭 분양",
  "반려동물 교육 특강",
  "생활 법률 강좌",
  "구민 건강 걷기 대회",
  "청년 동아리 지원",
  "주민 사진 공모전",
  "주거 안전 점검 신청",
  "청년 커리어 코칭",
  "독립영화 상영회",
  "전통시장 축제",
  "에너지 절약 캠페인",
].forEach((title, i) =>
  add({
    title,
    cat: [
      "CAT_COURSE",
      "CAT_EVENT_RECRUIT",
      "CAT_HEALTH",
      "CAT_FAMILY",
      "CAT_SUPPORT_PROGRAM",
    ][i % 5],
    regions: [["mapo", "gangseo", "jongno", "seoul"][i % 4]],
    org: i % 3 ? "마포구청" : null,
    elig: i % 4 === 0 ? "구민 누구나" : null,
    at: { $days: -(i % 6), $hour: 8 + (i % 10) },
    benefit: i % 7 === 0 ? "무료" : null,
    kind: i % 7 === 0 ? "free" : null,
    eventStart: i % 5 === 1 ? { $days: 9, $hour: 14 } : null,
    sched: i % 5 === 1 ? "single" : null,
  }),
);

writeFileSync(
  new URL("./home-v5.json", import.meta.url),
  `${JSON.stringify({ taxonomy: { regions, categories }, rows, regionLinks, categoryLinks, institutions, popularity, images }, null, 1)}\n`,
);
console.log(`${rows.length} rows`);
