import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("LLM-filled notice facts are independently grounded against source text", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "posterlink-notice-facts-"));
  process.env.OPENAI_API_KEY = "test-key";
  process.env.NOTICE_FACTS_MIN_REGEX_FIELDS = "6";
  process.env.NOTICE_FACTS_CACHE_PATH = path.join(tempDir, "notice_facts_llm.json");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        period: "2026년 9월 1일부터",
        target: null,
        content: null,
        application: null,
        location: "마포청년나루 2층",
        contact: "02-1234-5678",
        allFactsGroundedInText: true,
        reason: "mock response claiming every fact is grounded",
      }),
    }),
  });

  try {
    const { extractNoticeFactsWithLlm } = await import(`./notice-facts-extractor.js?cache=${Date.now()}`);
    const result = await extractNoticeFactsWithLlm(
      {
        title: "청년 특강",
        content: "마포청년나루 2층에서 진행됩니다. 문의는 02-1234-5678로 해주세요.",
      },
      {
        period: null,
        target: null,
        content: null,
        application: null,
        location: null,
        contact: null,
      },
    );

    assert.equal(result.facts.period, null);
    assert.equal(result.facts.location, "마포청년나루 2층");
    assert.equal(result.facts.contact, "02-1234-5678");
    assert.deepEqual(result.filledByLlm, ["location", "contact"]);
    assert.deepEqual(result.rejectedUngrounded, ["period"]);
    assert.equal(result.allFactsGroundedInText, false);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
    delete process.env.OPENAI_API_KEY;
    delete process.env.NOTICE_FACTS_MIN_REGEX_FIELDS;
    delete process.env.NOTICE_FACTS_CACHE_PATH;
  }
});
