import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRegionEligibility,
  organizerGroup,
  targetLines,
  targetTexts,
} from "./region-eligibility.js";

const kind = (text) => classifyRegionEligibility([text]).kind;

// Phrases taken from open posters on 2026-11-10 (구-only links).
test("서울 as a whole", () => {
  for (const text of [
    "만 19 ~ 39세 서울특별시 권역 청년 10명",
    "공고일 기준 만19~39세 서울시 거점 청년.",
    "서울시 생활권 만 19~39세 청년.",
    "서울 생활권 만 19~39세 청년 15~20명. 양천구 및 취약청년 우선 선발.",
    "아동기 자녀를 둔 서울생활권 부모",
    "서울시 거주 및 생활권인 1인가구 청년(만 20~39세) 20명",
    ": 서울시에서 일하거나 거주하는 노동자",
    "서울시 소재 중소기업 근로자 중 요리·소셜 다이닝에 관심 있는 1인 가구 청년.",
    "만 19세 이상 서울시민으로 심한 스트레스, 우울감 등",
    "채무·재무 고민이 있는 서울 청년(만 19~39세)",
    "서울시 청년 만 19세~39세",
    "서울시 생활권(거주, 직장, 학교) 1인가구, 영등포구민, 신규 참여자 우선",
  ])
    assert.equal(kind(text), "seoul_wide", text);
});

test("organisation names are not an area", () => {
  assert.equal(kind("담당기관 서울청년센터 진행"), "unknown");
  assert.equal(kind("서울청년센터 강동 이용 청년"), "unknown");
  assert.equal(
    kind("탐방내용: 전문해설가와 함께하는 서울시 내 인권현장 도보탐방"),
    "unknown",
  );
});

test("residents of one 구 only", () => {
  for (const text of [
    "강북구민(강북구에 주소 또는 거소를 둔 주민 등)",
    "금천구 주민",
    "만 19세 이상 ~ 만 65세 이하 영등포구민",
    "만 19~39세 강북구 거주 청년 또는 강북구 소재 대학 재학·휴학생.",
    "동대문구 거주 또는 활동 청년으로 구성된 1~4인 팀.",
    "마포구민 누구나. 성별 제한 없음. 회차별 20명 선착순.",
    "금천구민 누구나",
    "강동구민 청년, 서울청년센터 강동 이용 청년 (선착순 15명)",
  ]) {
    const result = classifyRegionEligibility([text]);
    assert.equal(result.kind, "gu_restricted", text);
    assert.ok(result.gus.length > 0, text);
  }
  assert.deepEqual(classifyRegionEligibility(["금천구 주민"]).gus, ["금천구"]);
});

test("a 구 preferred, nobody excluded", () => {
  for (const text of [
    "39세 이하 청년 누구나, 송파구민 우대",
    "만19~39세 청년.4대 취약청년 및 마포구·서대문구 거주자 우선 선발 안내.",
    "만 19~39세 청년, 강북구 거주·생활권 청년 우대",
    "공고일 기준 만 19~39세 청년. 제대군인 최대 3세 연장. 강동·송파 생활권 등 우대하며 필수 거주 제한으로 해석하지 않음.",
    "강사 활동을 꿈꾸는 만 19~39세 청년(용산구민·용산일자리카페 참여자 우대, 전 회차 필수 참석)",
  ])
    assert.equal(kind(text), "gu_preferred", text);
});

test("no regional limit, ambiguous and silent texts", () => {
  assert.equal(kind("제한없음"), "open");
  assert.equal(kind("노무 관련 고민이 있는 청년 누구나"), "open");
  // A 구 limit and an open clause together: a person decides.
  assert.equal(kind("성북구민 및 방문객 누구나"), "review");
  assert.equal(
    kind("동대문구민 및 문화·경제 분야에 관심 있는 누구나"),
    "review",
  );
  assert.equal(kind("청년 및 은평구민 누구나 환영!(현장 참여)"), "review");
  assert.equal(kind("구민 누구나"), "review");
  assert.equal(kind("지역주민 누구나. 가족·친구 동반 관람 가능."), "review");
  assert.equal(kind("관내 생활·활동 청년 및 지역주민 누구나"), "review");
  assert.equal(kind("관심 있는 사람 누구나"), "open");
  // "또는" inside the 구 condition itself still limits to that 구.
  assert.equal(
    kind(
      "공고일 기준 성동구 거주 또는 성동구 학교·직장 생활권 만19~39세 청년.",
    ),
    "gu_restricted",
  );
  // "성별 제한 없음" says nothing about region.
  assert.equal(kind("활동가 15명. 성별 제한은 없습니다."), "unknown");
  assert.equal(kind("만 15~39세 청년, 미취업 청년 우선."), "unknown");
  assert.equal(classifyRegionEligibility([]).kind, "unknown");
});

test("target texts come from the summary, facts and 대상 lines", () => {
  assert.deepEqual(
    targetLines(
      "행사 안내\n- 대상: 서울시 거주 청년\n신청 대상 : 강북구민\n장소: 강북구청",
    ),
    ["서울시 거주 청년", "강북구민"],
  );
  assert.deepEqual(
    targetTexts({
      eligibility_summary: " 만 19~39세 ",
      field_verification: { readableNotice: { facts: { target: "청년" } } },
      summary_long: "대상: 금천구 주민",
    }),
    ["만 19~39세", "청년", "금천구 주민"],
  );
});

test("organiser groups", () => {
  assert.equal(organizerGroup("서울청년센터 강서"), "seoul_affiliate");
  assert.equal(organizerGroup("서울시여성가족재단"), "seoul_affiliate");
  assert.equal(organizerGroup("SH서울주택도시공사"), "seoul_affiliate");
  assert.equal(organizerGroup("강북구청"), "gu_office");
  assert.equal(organizerGroup("동대문구가족센터"), "gu_office");
  assert.equal(organizerGroup("성북구보건소·서울청년센터 성북"), "gu_office");
  assert.equal(organizerGroup("KB금융공익재단"), "other");
  assert.equal(organizerGroup(null), "unknown");
});

test("crawler: the decision sets the 서울 link and any eligibility basis", async () => {
  const { applyRegionEligibility } = await import("./region-eligibility.js");
  const placeOnly = [
    {
      code: "REG_SEOUL_GANGBUK",
      basis: "eligibility",
      evidence: "target: 강북구 거주",
    },
    {
      code: "REG_SEOUL_MAPO",
      basis: "venue",
      evidence: "location contains 마포구",
    },
  ];
  const decide = (text) => classifyRegionEligibility([text]);
  const codes = (items) =>
    items.map((i) => `${i.code}:${i.basis}${i.added ? "+" : ""}`);

  // 서울 전체: 서울 link added; the keyword "eligibility" on a 구 becomes 근거 없음.
  assert.deepEqual(
    codes(
      applyRegionEligibility(
        placeOnly,
        decide("서울시 생활권 만 19~39세 청년"),
      ),
    ),
    [
      "REG_SEOUL_GANGBUK:related",
      "REG_SEOUL_MAPO:venue",
      "REG_SEOUL:eligibility+",
    ],
  );
  // 구 우대 (approved): 서울 link too, 강북구 is not "residents only".
  assert.deepEqual(
    codes(
      applyRegionEligibility(
        placeOnly,
        decide("만 19~39세 청년, 강북구 거주·생활권 청년 우대"),
      ),
    ),
    [
      "REG_SEOUL_GANGBUK:related",
      "REG_SEOUL_MAPO:venue",
      "REG_SEOUL:eligibility+",
    ],
  );
  // 구 주민 한정: that 구 only, nothing added.
  assert.deepEqual(
    codes(applyRegionEligibility(placeOnly, decide("강북구민"))),
    ["REG_SEOUL_GANGBUK:eligibility", "REG_SEOUL_MAPO:venue"],
  );
  // Ambiguous: no 서울 link, eligibility left as 근거 없음 for a person.
  const ambiguous = applyRegionEligibility(
    placeOnly,
    decide("성북구민 및 방문객 누구나"),
  );
  assert.deepEqual(codes(ambiguous), [
    "REG_SEOUL_GANGBUK:related",
    "REG_SEOUL_MAPO:venue",
  ]);
  assert.match(ambiguous[0].evidence, /review: 근거 없음$/);
  // An existing 서울 link stays as it is when the text says nothing.
  assert.deepEqual(
    codes(
      applyRegionEligibility(
        [
          {
            code: "REG_SEOUL",
            basis: "eligibility",
            evidence: "eligibility_scope",
          },
        ],
        decide("청년"),
      ),
    ),
    ["REG_SEOUL:eligibility"],
  );
});

test("crawler: buildCardFacts keeps the decision as evidence", async () => {
  const { buildCardFacts } = await import("./poster-card-facts.js");
  const facts = buildCardFacts({
    title: "서울청년센터 강서 <마음 가드닝>",
    eligibility_summary: "만 19 ~ 39세 서울특별시 권역 청년 10명",
    event_location: "서울청년센터 강서",
    regions: [{ code: "REG_SEOUL_GANGSEO", name: "강서구" }],
    fv_regions: [
      {
        code: "REG_SEOUL_GANGSEO",
        source: "keyword",
        evidence: "서울청년센터 강서",
      },
    ],
  });
  assert.equal(facts.regionEligibility.kind, "seoul_wide");
  assert.ok(
    facts.regionBasis.some((item) => item.code === "REG_SEOUL" && item.added),
  );
  assert.equal(
    facts.regionBasis.find((item) => item.code === "REG_SEOUL_GANGSEO").basis,
    "venue",
  );
});

test("구 우대 names the preferred 구, also when written without 구", () => {
  const gus = (text) => classifyRegionEligibility([text]).gus;
  assert.deepEqual(
    gus("강동·송파 생활권 등 우대하며 필수 거주 제한으로 해석하지 않음."),
    ["강동구", "송파구"],
  );
  assert.deepEqual(gus("강동·송파 생활권 등 우선 선발 기준은 신청서 확인"), [
    "강동구",
    "송파구",
  ]);
  assert.deepEqual(gus("마포구·서대문구 거주자 우선 선발 안내."), [
    "마포구",
    "서대문구",
  ]);
  assert.deepEqual(gus("만 19~39세 청년, 강북구 거주·생활권 청년 우대"), [
    "강북구",
  ]);
  // Not a 구 name: nothing guessed.
  assert.deepEqual(gus("학교 생활권 등 우대"), []);
});

test("구 주민 한정: 거주만, 거주·생활권, 애매함", () => {
  const residency = (text) => classifyRegionEligibility([text]).residency;
  // 거주만
  for (const text of [
    "금천구 주민",
    "중랑구민 12명 ✔ 교육",
    "마포구민 누구나. 성별 제한 없음. 회차별 20명 선착순.",
    "금천구에 거주하는 만 19세~39세 청년",
    "여성합창단20~54세·시니어합창단55~70세 영등포구 거주 여성. 성량·음악성 등 기본자질, 사회봉사정신, 건강상 활동 가능자.",
    "강남구 거주자 중 '그냥드림서비스 이용자 자가 점검 체크리스트' 항목에 하나 이상 해당되는 가구",
    "우울, 불안 등 정신과적 상담이 필요한 서초구민",
  ])
    assert.equal(residency(text), "resident", text);
  // 거주·생활권: school, work or activity there counts too.
  for (const text of [
    "공고일 기준 성동구 거주 또는 성동구 학교·직장 생활권 만19~39세 청년.",
    "만 19~39세 강북구 거주 청년 또는 강북구 소재 대학 재학·휴학생.",
    "금천구 거주 청년 또는 금천구 소재 사업장 청년 노동자, 월 평균임금 300만원 이하",
    "영등포구 거주·생활권 만 19~39세 청년 100명.",
    "동대문구 거주 또는 활동 청년으로 구성된 1~4인 팀.",
    "노원구에 거주 또는 생활 기반이 있는 만 19~39세 청년",
    "성북구 거주자 및 생활권자",
  ])
    assert.equal(residency(text), "life_area", text);
  // 애매함: both or either? another group alongside?
  for (const text of [
    "만 19세 ~ 39세 성북구 거주 및 활동 1인가구 청년 10명",
    "강동구민 청년, 서울청년센터 강동 이용 청년 (선착순 15명)",
  ])
    assert.equal(residency(text), "unclear", text);
  const decision = classifyRegionEligibility([
    "공고일 기준 성동구 거주 또는 성동구 학교·직장 생활권 만19~39세 청년. 만 나이를 우선 안내",
  ]);
  assert.equal(decision.kind, "gu_restricted");
  assert.equal(
    decision.residencyEvidence,
    "성동구 거주 또는 성동구 학교·직장 생활권 만19~39세 청년",
  );
  // Other kinds carry no residency.
  assert.equal(classifyRegionEligibility(["송파구민 우대"]).residency, undefined);
});
