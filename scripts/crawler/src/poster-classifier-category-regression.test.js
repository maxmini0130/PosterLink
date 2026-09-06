import assert from "node:assert/strict";
import test from "node:test";

import { inferPosterClassification } from "./poster-classifier.js";

test("vehicle safety inspection notices are classified as life information", () => {
  const result = inferPosterClassification({
    title: "구로구청<추석귀성길 전 확인! 자동차 무상안전점검 실시(9/6)>",
    category: "안전",
    summary_short: "추석 귀성길 전 자동차 무상안전점검을 실시합니다.",
    content: "자동차 무상안전점검 실시. 안전한 추석 귀성길을 위해 차량 점검을 받으세요.",
  });

  assert.equal(result.categoryCodes[0], "CAT_LIFE_INFO");
  assert.equal(
    result.issues.some((issue) => issue.code === "low-category-confidence"),
    false,
  );
});

test("mental health counseling notices override welfare source categories", () => {
  const result = inferPosterClassification({
    title: "서울청년센터 은평 <9월 은평 바로(BARO) 심리상담데이> 참여자 모집",
    category: "지원금/복지",
    summary_short:
      "TCI 기질검사를 통해 기질과 성향을 알아보고 심리전문가와 검사 결과를 해석합니다.",
    content:
      "그룹 해석상담 이후 개인 심리상담 3회를 연계하여 마음건강 관리를 지원합니다.",
  });

  assert.equal(result.categoryCodes[0], "CAT_HEALTH");
  assert.equal(result.categoryCodes.includes("CAT_WELFARE"), false);
});
