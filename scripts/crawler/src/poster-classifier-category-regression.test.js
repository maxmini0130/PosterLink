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

test("welfare-center coaching programs are classified as education", () => {
  const result = inferPosterClassification({
    title: "신길종합사회복지관 <일상생활 인테리어 코칭> 참여자 모집",
    category: "복지",
    summary_short: "일상생활 공간 정리와 인테리어 방법을 배우는 코칭 프로그램입니다.",
    content: "복지관에서 진행하는 생활 인테리어 코칭 강좌로 참여자를 모집합니다.",
    source_org_name: "신길종합사회복지관",
  });

  assert.equal(result.categoryCodes[0], "CAT_COURSE");
  assert.equal(result.categoryCodes.includes("CAT_WELFARE"), false);
});

test("direct housing repair support is not overridden by education keywords", () => {
  const result = inferPosterClassification({
    title: "종합사회복지관 <주거환경 개선 집수리 지원 교육 안내>",
    category: "복지",
    summary_short: "저소득 가구의 주거환경 개선과 집수리 지원을 안내합니다.",
    content: "수리비 지원과 주거환경 개선 대상자를 모집하며 사전 교육이 포함됩니다.",
    source_org_name: "종합사회복지관",
  });

  assert.equal(result.categoryCodes[0], "CAT_HOUSING");
});
