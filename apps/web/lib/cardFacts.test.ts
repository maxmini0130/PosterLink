import assert from "node:assert/strict";
import test from "node:test";
import {
  benefitLine,
  cardMetaLine,
  eventDayFor,
  eventEnded,
  inferRegionBasis,
  regionPhrase,
  targetLabel,
  type CardRegion,
} from "./cardFacts";

const MAPO: CardRegion = {
  id: "m",
  code: "REG_SEOUL_MAPO",
  name: "마포구",
  level: "sigungu",
};
const GANGSEO: CardRegion = {
  id: "g",
  code: "REG_SEOUL_GANGSEO",
  name: "강서구",
  level: "sigungu",
};
const SEOUL: CardRegion = {
  id: "s",
  code: "REG_SEOUL",
  name: "서울특별시",
  level: "sido",
};
const NATION: CardRegion = {
  id: "n",
  code: "REG_NATION",
  name: "전국",
  level: "nation",
};

test("region phrase uses the stored basis first", () => {
  assert.equal(regionPhrase([{ ...MAPO, basis: "venue" }]), "마포구에서");
  assert.equal(
    regionPhrase([{ ...MAPO, basis: "eligibility" }]),
    "마포구 주민",
  );
  assert.equal(regionPhrase([{ ...MAPO, basis: "related" }]), "마포구 관련");
  assert.equal(
    regionPhrase([{ ...MAPO, basis: "institution" }]),
    "마포구 관련",
  );
});

test("without a stored basis, only evidence upgrades 관련", () => {
  assert.equal(regionPhrase([MAPO]), "마포구 관련");
  assert.equal(
    regionPhrase(
      [MAPO],
      [{ code: "REG_SEOUL_MAPO", source: "eligibility_scope" }],
    ),
    "마포구 주민",
  );
  assert.equal(regionPhrase([MAPO], [], "마포구청 2층 대강당"), "마포구에서");
  assert.equal(
    inferRegionBasis(MAPO, [{ code: "REG_SEOUL_MAPO", source: "keyword" }]),
    "related",
  );
});

test("district beats city and nation; city-wide and nationwide wording", () => {
  assert.equal(regionPhrase([SEOUL, MAPO]), "마포구 관련");
  assert.equal(regionPhrase([SEOUL]), "서울 전체");
  assert.equal(regionPhrase([NATION]), "전국");
  assert.equal(regionPhrase([]), null);
  assert.equal(regionPhrase([MAPO, GANGSEO]), "마포구·강서구 관련");
  assert.equal(
    regionPhrase([
      MAPO,
      GANGSEO,
      { ...GANGSEO, id: "x", name: "종로구", code: "REG_SEOUL_JONGNO" },
    ]),
    "마포구 외 2곳 관련",
  );
  assert.equal(
    regionPhrase([MAPO, { ...GANGSEO, basis: "venue" }]),
    "강서구에서",
  );
});

test("target label reads only the 대상 text or the stored ages", () => {
  assert.equal(
    targetLabel({ targetAgeMin: 19, targetAgeMax: 39 }),
    "만 19~39세",
  );
  assert.equal(targetLabel({ targetAgeMin: 65 }), "만 65세 이상");
  assert.equal(
    targetLabel({ eligibilitySummary: "관악구 거주 또는 활동 청년" }),
    "청년",
  );
  assert.equal(
    targetLabel({ eligibilitySummary: "출품자격: 제한없음 (국내외 누구나)" }),
    "누구나",
  );
  assert.equal(
    targetLabel({ eligibilitySummary: "예비창업팀 및 초기 스타트업" }),
    "창업기업",
  );
  assert.equal(
    targetLabel({
      eligibilitySummary:
        "서울시 소재 중소기업 근로자 중 요리에 관심 있는 1인 가구 청년",
    }),
    "1인 가구",
  );
  assert.equal(
    targetLabel({ eligibilitySummary: "중소기업 재직자" }),
    "직장인",
  );
  assert.equal(
    targetLabel({ eligibilitySummary: "혼인 7년 이내 신혼부부·한부모가족" }),
    "신혼부부",
  );
  assert.equal(targetLabel({ eligibilitySummary: "" }), null);
  assert.equal(targetLabel({ eligibilitySummary: "기타 문의 바람" }), null);
});

test("meta line drops a target the 주민 wording already covers", () => {
  assert.equal(cardMetaLine("마포구에서", "청년"), "마포구에서 · 청년");
  assert.equal(cardMetaLine("마포구 주민", "구민"), "마포구 주민");
  assert.equal(cardMetaLine(null, "청년"), "청년");
  assert.equal(cardMetaLine(null, null), null);
});

const NOW = new Date("2026-11-03T03:00:00Z"); // 11.03 12:00 KST

test("event day: single days and short runs, in KST, never past ones", () => {
  assert.equal(
    eventDayFor({ eventStartAt: "2026-11-15T08:00:00Z" }, NOW),
    "11.15(일)",
  );
  // 2026-11-14 23:30 KST is stored as the 14th in UTC.
  assert.equal(
    eventDayFor({ eventStartAt: "2026-11-14T14:30:00Z" }, NOW),
    "11.14(토)",
  );
  assert.equal(
    eventDayFor(
      {
        eventStartAt: "2026-11-21T01:00:00Z",
        eventEndAt: "2026-11-22T09:00:00Z",
      },
      NOW,
    ),
    "11.21(토)",
  );
  assert.equal(
    eventDayFor(
      {
        eventStartAt: "2026-09-01T00:00:00Z",
        eventEndAt: "2026-12-20T00:00:00Z",
      },
      NOW,
    ),
    null,
  );
  assert.equal(
    eventDayFor({ eventStartAt: "2026-11-01T00:00:00Z" }, NOW),
    null,
  );
  assert.equal(
    eventDayFor(
      { eventStartAt: "2026-11-15T08:00:00Z", scheduleKind: "recurring" },
      NOW,
    ),
    null,
  );
  assert.equal(eventEnded({ eventEndAt: "2026-11-02T10:00:00Z" }, NOW), true);
  assert.equal(eventEnded({ eventEndAt: "2026-11-02T16:00:00Z" }, NOW), false);
  assert.equal(eventEnded({}, NOW), false);
});

test("benefit line shows only verified values, plus the event day for events", () => {
  const event = {
    primaryCategoryCode: "CAT_EVENT_RECRUIT",
    eventStartAt: "2026-11-15T08:00:00Z",
  };
  assert.equal(
    benefitLine(
      { ...event, benefitSummary: "무료", cardFactsStatus: "verified" },
      NOW,
    ),
    "무료 · 11.15(일) 진행",
  );
  assert.equal(
    benefitLine(
      { ...event, benefitSummary: "무료", cardFactsStatus: "needs_review" },
      NOW,
    ),
    "11.15(일) 진행",
  );
  assert.equal(
    benefitLine(
      {
        primaryCategoryCode: "CAT_SUPPORT_PROGRAM",
        eventStartAt: "2026-11-15T08:00:00Z",
        benefitSummary: "월 최대 20만원",
        cardFactsStatus: "verified",
      },
      NOW,
    ),
    "월 최대 20만원",
  );
  assert.equal(benefitLine({ primaryCategoryCode: "CAT_HOUSING" }, NOW), null);
});
