// SNS_INGESTION.md 후속 — 기존 게시물(posters)을 새 10개 카테고리 체계로 재분류.
// poster-relevance-router.js와 같은 스켈레톤(OpenAI /v1/responses + json_schema, 디스크 캐시)을
// 쓰되, 목적이 다르다: 이미 이미지 검증까지 끝난 완성된 포스터에 대해 "어느 카테고리(복수 가능)에
// 속하는가"만 판단한다(공고/소식/폐기 라우팅은 이미 끝난 데이터라 필요 없음).

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_category_classifications.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const MODE = (process.env.POSTER_CATEGORY_CLASSIFIER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_CATEGORY_MODEL?.trim() || "gpt-5-mini";

const VALID_CATEGORIES = [
  "지원사업", "채용", "공모전", "교육강좌", "행사모집", "입찰",
  "정책안내", "보도자료", "생활정보", "기타",
];

function isAiModeEnabled() {
  return MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(context) {
  return crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_PATH, "utf-8")); } catch { return {}; }
}
async function saveCache(cache) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}
function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in model response: ${text}`);
  return JSON.parse(match[0]);
}

/**
 * @param {{title: string, summaryShort?: string, summaryLong?: string}} context
 * @returns {Promise<{categories: string[], reason: string, model: string}>}
 */
export async function classifyPosterCategories(context) {
  if (!isAiModeEnabled()) {
    return { categories: ["기타"], reason: "OPENAI_API_KEY not configured", model: "none" };
  }

  const stableContext = {
    title: context.title ?? "",
    summaryShort: context.summaryShort ?? "",
    summaryLong: String(context.summaryLong ?? "").slice(0, 2000),
  };
  const cache = await loadCache();
  const key = cacheKey(stableContext);
  if (cache[key]) return cache[key];

  try {
    const prompt = [
      "당신은 한국 공공기관 공고 카테고리 분류기다. 제목과 요약을 읽고",
      "아래 카테고리 중 이 게시물에 해당하는 것을 1개 이상 골라라(복수 가능,",
      "예: 채용 공고이면서 동시에 정책안내 성격도 있으면 둘 다).",
      "",
      `카테고리: ${VALID_CATEGORIES.join(", ")}`,
      "",
      "제목: " + stableContext.title,
      "요약: " + (stableContext.summaryShort || stableContext.summaryLong || "(없음)"),
      "",
      "JSON만 출력: { \"categories\": [\"...\"], \"reason\": \"한 문장 근거\" }",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "poster_category_classification",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                categories: { type: "array", items: { type: "string", enum: VALID_CATEGORIES }, minItems: 1, maxItems: 3 },
                reason: { type: "string" },
              },
              required: ["categories", "reason"],
            },
          },
        },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);

    const payload = await response.json();
    const outputText = payload.output_text
      ?? payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("\n")
      ?? "";
    const parsed = parseJson(outputText);
    const categories = (Array.isArray(parsed.categories) ? parsed.categories : [parsed.categories])
      .filter((c) => VALID_CATEGORIES.includes(c));
    const result = {
      categories: categories.length > 0 ? categories : ["기타"],
      reason: String(parsed.reason ?? "").slice(0, 300),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    const result = { categories: ["기타"], reason: `분류 실패: ${error.message}`, model: MODEL };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}
