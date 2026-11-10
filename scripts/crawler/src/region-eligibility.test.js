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
