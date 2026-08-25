import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePosterSummaryFallbackFacts,
  extractTargetAgeRange,
} from "./posterSummaryFacts";

test("derives fallback facts only from explicit summary labels", () => {
  const facts = derivePosterSummaryFallbackFacts([
    { text: "청년 지원사업입니다." },
    { label: "신청대상", text: "만 19세 ~ 39세 서울 청년" },
    { label: "참여혜택", text: "교육비 전액 지원" },
    { label: "신청방법", text: "온라인 신청" },
    { label: "비용", text: "무료" },
  ]);

  assert.equal(facts.eligibilitySummary, "만 19세 ~ 39세 서울 청년");
  assert.equal(facts.benefitsSummary, "교육비 전액 지원");
  assert.equal(facts.applicationMethod, "온라인 신청");
  assert.equal(facts.participationFee, "무료");
  assert.equal(facts.targetAgeMin, 19);
  assert.equal(facts.targetAgeMax, 39);
});

test("ignores unlabeled summary text for user-facing facts", () => {
  const facts = derivePosterSummaryFallbackFacts([
    { text: "만 19세 이상이면 신청할 수 있고 혜택이 있습니다." },
  ]);

  assert.equal(facts.eligibilitySummary, null);
  assert.equal(facts.benefitsSummary, null);
  assert.equal(facts.applicationMethod, null);
  assert.equal(facts.participationFee, null);
});

test("derives fallback facts from inline explicit labels", () => {
  const facts = derivePosterSummaryFallbackFacts([
    {
      text:
        "모집대상: 만 18세 이상 지역 주민 지원내용: 활동비 및 교육 제공 신청방법: 온라인 접수 비용: 무료",
    },
  ]);

  assert.equal(facts.eligibilitySummary, "만 18세 이상 지역 주민");
  assert.equal(facts.benefitsSummary, "활동비 및 교육 제공");
  assert.equal(facts.applicationMethod, "온라인 접수");
  assert.equal(facts.participationFee, "무료");
  assert.equal(facts.targetAgeMin, 18);
  assert.equal(facts.targetAgeMax, null);
});

test("extracts one-sided age conditions", () => {
  assert.deepEqual(extractTargetAgeRange("만 18세 이상"), {
    targetAgeMin: 18,
    targetAgeMax: null,
  });
  assert.deepEqual(extractTargetAgeRange("39세 이하 청년"), {
    targetAgeMin: null,
    targetAgeMax: 39,
  });
});
