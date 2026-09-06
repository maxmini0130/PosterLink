import assert from "node:assert/strict";
import test from "node:test";

test("semantic poster category classifier returns labels with confidence", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-openai-key";

  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          output_text: JSON.stringify({
            categories: ["교육강좌"],
            reason: "복지관 주관이지만 핵심은 생활 인테리어 코칭 교육이다.",
            confidence: 0.89,
          }),
        };
      },
    };
  };

  try {
    const module = await import(`./poster-category-classifier.js?semantic-test=${Date.now()}`);
    const result = await module.classifyPosterCategories({
      title: `신길종합사회복지관 <일상생활 인테리어 코칭> ${Date.now()}`,
      sourceOrgName: "신길종합사회복지관",
      summaryShort: "생활 인테리어 코칭 강좌 참여자 모집",
      summaryLong: "공간 정리와 수리 기초를 배우는 코칭 프로그램입니다.",
      currentCategories: ["지원금/복지"],
    });

    assert.equal(module.CATEGORY_CODE_BY_LABEL["교육강좌"], "CAT_COURSE");
    assert.equal(module.CATEGORY_CODE_BY_LABEL["건강/의료"], "CAT_HEALTH");
    assert.deepEqual(result.categories, ["교육강좌"]);
    assert.equal(result.confidence, 0.89);
    assert.match(result.reason, /코칭 교육/);
    assert.match(requestBody.input[0].content[0].text, /핵심 목적/);
    assert.match(requestBody.input[0].content[0].text, /심리상담.*건강\/의료/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});
