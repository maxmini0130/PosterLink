// SNS_INGESTION.md 후속 — 기존 게시물(posters)을 새 10개 카테고리 체계로 재분류.
// poster-relevance-router.js와 같은 스켈레톤(OpenAI /v1/responses + json_schema, 디스크 캐시)을
// 쓰되, 목적이 다르다: 이미 이미지 검증까지 끝난 완성된 포스터에 대해 "어느 카테고리(복수 가능)에
// 속하는가"만 판단한다(공고/소식/폐기 라우팅은 이미 끝난 데이터라 필요 없음).

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_category_classifications.json";
const CACHE_VERSION = "semantic-category-classifier-v2";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const MODE = (process.env.POSTER_CATEGORY_CLASSIFIER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_CATEGORY_MODEL?.trim() || "gpt-5-mini";
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

const VALID_CATEGORIES = [
  "지원사업", "채용", "공모전", "교육강좌", "행사모집", "입찰",
  "정책안내", "보도자료", "생활정보", "주거/금융", "소상공인",
  "육아/가족", "건강/의료", "기타",
];

export const CATEGORY_CODE_BY_LABEL = {
  "지원사업": "CAT_SUPPORT_PROGRAM",
  "채용": "CAT_RECRUITMENT",
  "공모전": "CAT_CONTEST",
  "교육강좌": "CAT_COURSE",
  "행사모집": "CAT_EVENT_RECRUIT",
  "입찰": "CAT_BID",
  "정책안내": "CAT_POLICY_INFO",
  "보도자료": "CAT_PRESS_RELEASE",
  "생활정보": "CAT_LIFE_INFO",
  "주거/금융": "CAT_HOUSING",
  "소상공인": "CAT_BUSINESS",
  "육아/가족": "CAT_FAMILY",
  "건강/의료": "CAT_HEALTH",
  "기타": "CAT_OTHER",
};

function isAiModeEnabled() {
  return MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(context) {
  return crypto.createHash("sha256").update(JSON.stringify({ version: CACHE_VERSION, context })).digest("hex");
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

function normalizeContext(context) {
  return {
    title: context.title ?? "",
    summaryShort: context.summaryShort ?? "",
    summaryLong: String(context.summaryLong ?? context.content ?? "").slice(0, 800),
    sourceOrgName: context.sourceOrgName ?? "",
    currentCategories: Array.isArray(context.currentCategories) ? context.currentCategories.slice(0, 5) : [],
  };
}

function categoryGuidanceLines() {
  return [
    "당신은 한국 공공기관 공고 카테고리 분류기다.",
    "제목, 요약, 본문, 주관기관을 모두 읽고 게시물의 핵심 목적을 기준으로 분류한다.",
    "단어 하나에 끌려가지 말고 사용자가 실제로 얻는 것과 해야 하는 행동을 판단한다.",
    "",
    "카테고리 정의:",
    "- 지원사업: 돈, 물품, 대여, 바우처, 서비스, 자격취득비, 컨설팅 비용 등 실질 지원을 신청하는 공고",
    "- 채용: 직원, 강사, 기간제, 공무직, 일자리 채용/모집",
    "- 공모전: 작품, 아이디어, 문안, 제안, 영상, 사진 등을 응모해 심사/시상하는 공고",
    "- 교육강좌: 강좌, 교육, 코칭, 수업, 특강, 워크숍, 아카데미, 멘토링 등 학습/역량강화 프로그램",
    "- 행사모집: 축제, 체험, 캠페인, 봉사단, 서포터즈, 참여 이벤트 등 행사나 활동 참가자 모집",
    "- 입찰: 입찰, 용역, 구매, 계약, 제안서 제출 등 조달/계약 공고",
    "- 정책안내: 제도 변경, 운영 안내, 행정 절차, 고시/공고처럼 신청 모집이 아닌 정책 정보",
    "- 보도자료: 성과, 소식, 행사 결과, 수상, 협약 등 이미 일어난 사실을 알리는 기사형 게시물",
    "- 생활정보: 안전점검, 교통, 생활 편의, 시설 이용, 예방 안내 등 시민 생활 안내",
    "- 주거/금융: 임대주택, 월세/전세/이사비, 주거환경, 집수리, 금융교육이 아닌 금융·대출·자산 지원 안내",
    "- 소상공인: 자영업자, 소상공인, 전통시장, 점포, 창업자 대상 사업 운영 지원",
    "- 육아/가족: 임신, 출산, 양육, 가족돌봄, 부모교육, 아동·가족 대상 프로그램",
    "- 건강/의료: 심리상담, 마음건강, 정신건강, 검진, 치료, 재활, 보건, 의료 서비스나 건강 프로그램",
    "- 기타: 위 기준으로도 핵심 목적이 불명확한 경우",
    "",
    "판정 원칙:",
    "- 주관기관명이 복지관/센터여도 내용이 코칭·강좌·수업이면 교육강좌로 본다.",
    "- 심리상담, 마음건강, 정신건강, 치유상담, TCI/기질검사 등은 참여자 모집 형식이어도 건강/의료를 우선한다.",
    "- 주거환경 개선, 집수리, 월세/전세/이사비, 임대주택 지원은 주거/금융을 우선한다.",
    "- 참여자를 모집해 일정에 참여하는 문화·체험·봉사 활동은 행사모집, 학습 커리큘럼이 핵심이면 교육강좌다.",
    "- 여러 성격이 강하면 최대 2개까지 고르되, 첫 번째가 대표 카테고리다.",
    "",
    `허용 카테고리: ${VALID_CATEGORIES.join(", ")}`,
  ];
}

function normalizeResult(parsed, fallback = "기타") {
  const categories = (Array.isArray(parsed.categories) ? parsed.categories : [parsed.categories])
    .filter((category) => VALID_CATEGORIES.includes(category));
  return {
    categories: categories.length > 0 ? categories : [fallback],
    reason: String(parsed.reason ?? "").slice(0, 300),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    model: MODEL,
  };
}

function isRetryableCachedFailure(result) {
  return Number(result?.confidence ?? 0) <= 0 && /^분류 실패:/.test(String(result?.reason ?? ""));
}

/**
 * @param {{title: string, summaryShort?: string, summaryLong?: string, content?: string, sourceOrgName?: string, currentCategories?: string[]}} context
 * @returns {Promise<{categories: string[], reason: string, confidence: number, model: string}>}
 */
export async function classifyPosterCategories(context) {
  if (!isAiModeEnabled()) {
    return { categories: ["기타"], reason: "OPENAI_API_KEY not configured", confidence: 0, model: "none" };
  }

  const stableContext = normalizeContext(context);
  const cache = await loadCache();
  const key = cacheKey(stableContext);
  if (cache[key] && !isRetryableCachedFailure(cache[key])) return cache[key];

  try {
    const prompt = [
      ...categoryGuidanceLines(),
      "",
      "제목: " + stableContext.title,
      "주관기관: " + (stableContext.sourceOrgName || "(없음)"),
      "현재 카테고리: " + (stableContext.currentCategories.join(", ") || "(없음)"),
      "요약: " + (stableContext.summaryShort || stableContext.summaryLong || "(없음)"),
      "본문 일부: " + (stableContext.summaryLong || "(없음)"),
      "",
      "JSON만 출력: { \"categories\": [\"대표\", \"보조\"], \"reason\": \"한 문장 근거\", \"confidence\": 0.0 }",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: createOpenAiTimeoutSignal(),
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
                categories: { type: "array", items: { type: "string", enum: VALID_CATEGORIES }, minItems: 1, maxItems: 2 },
                reason: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["categories", "reason", "confidence"],
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
    const result = normalizeResult(parsed);
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    const result = { categories: ["기타"], reason: `분류 실패: ${error.message}`, confidence: 0, model: MODEL };
    return result;
  }
}

export async function classifyPosterCategoryBatch(contexts) {
  if (!isAiModeEnabled()) {
    return contexts.map(() => ({ categories: ["기타"], reason: "OPENAI_API_KEY not configured", confidence: 0, model: "none" }));
  }

  const stableContexts = contexts.map(normalizeContext);
  const cache = await loadCache();
  const results = new Array(stableContexts.length);
  const missing = [];
  stableContexts.forEach((context, index) => {
    const key = cacheKey(context);
    if (cache[key] && !isRetryableCachedFailure(cache[key])) {
      results[index] = cache[key];
    } else {
      missing.push({ index, key, context });
    }
  });
  if (missing.length === 0) return results;

  try {
    const prompt = [
      ...categoryGuidanceLines(),
      "",
      "아래 items 각각을 독립적으로 분류하라. index는 그대로 반환한다.",
      JSON.stringify({
        items: missing.map(({ index, context }) => ({
          index,
          title: context.title,
          sourceOrgName: context.sourceOrgName,
          currentCategories: context.currentCategories,
          summary: context.summaryShort || context.summaryLong,
          content: context.summaryLong,
        })),
      }, null, 2),
      "",
      "JSON만 출력: { \"items\": [{ \"index\": 0, \"categories\": [\"대표\", \"보조\"], \"reason\": \"한 문장 근거\", \"confidence\": 0.0 }] }",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: createOpenAiTimeoutSignal(),
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "poster_category_batch_classification",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                items: {
                  type: "array",
                  minItems: missing.length,
                  maxItems: missing.length,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      index: { type: "integer" },
                      categories: { type: "array", items: { type: "string", enum: VALID_CATEGORIES }, minItems: 1, maxItems: 2 },
                      reason: { type: "string" },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                    },
                    required: ["index", "categories", "reason", "confidence"],
                  },
                },
              },
              required: ["items"],
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
    const byIndex = new Map((parsed.items ?? []).map((item) => [Number(item.index), item]));
    for (const item of missing) {
      const result = normalizeResult(byIndex.get(item.index) ?? {});
      cache[item.key] = result;
      results[item.index] = result;
    }
    await saveCache(cache);
    return results;
  } catch (error) {
    for (const item of missing) {
      results[item.index] = { categories: ["기타"], reason: `분류 실패: ${error.message}`, confidence: 0, model: MODEL };
    }
    return results;
  }
}
