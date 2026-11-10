import assert from "node:assert/strict";
import test from "node:test";

import {
  cardOrganization,
  cardTitleText,
  posterCardFitClass,
} from "./posterCardText";

const WJ = "⁠";
const NBSP = " ";

test("brackets lose their inner spaces and never start or end a line alone", () => {
  assert.equal(
    cardTitleText("집 보는 수업 < 보여줘! 강북홈즈 >"),
    `집 보는 수업${NBSP}<${WJ}보여줘! 강북홈즈${WJ}>`,
  );
  assert.equal(
    cardTitleText("  또오리랑   가죽공방 모집 "),
    "또오리랑 가죽공방 모집",
  );
});

test("a middle dot keeps both neighbours on its line", () => {
  assert.equal(
    cardTitleText("서초구 거주 · 생활권"),
    `서초구 거주${WJ}·${WJ}생활권`,
  );
});

test("poster fit: nearly square or landscape is contained, tall fills from the top", () => {
  assert.equal(posterCardFitClass(1080, 1080), "object-contain object-center");
  assert.equal(posterCardFitClass(1000, 1190), "object-contain object-center");
  assert.equal(posterCardFitClass(1000, 1200), "object-cover object-top");
  assert.equal(posterCardFitClass(1520, 10686), "object-cover object-top");
  assert.equal(posterCardFitClass(null, null), "object-cover object-top");
});

test("the card shows the first organisation only", () => {
  assert.equal(cardOrganization("강북구청, 강북구보건소"), "강북구청");
  assert.equal(cardOrganization("서울청년센터 양천"), "서울청년센터 양천");
  assert.equal(cardOrganization(""), null);
  assert.equal(cardOrganization(null), null);
});
