// SNS_INGESTION.md 8-3 후속 — Vision OCR/원문 텍스트를 6개 필드(기간/대상/내용/신청방법/
// 장소/문의처)로 구조화하는 readableNotice.facts는 원래 라벨 키워드("대상:", "문의처:" 등)를
// 찾는 정규식(buildReadableNoticeInfo의 pickField)만으로 채워져 있었다 — 라벨이 없거나
// OCR 노이즈가 섞인 텍스트에서는 채워지지 않는 필드가 많았다.
//
// 여기서는 정규식이 못 채운 필드만 LLM으로 보완한다(비용 절감 — 정규식이 이미 다 채웠으면
// 호출하지 않음). poster-relevance-router.js와 동일한 OpenAI /v1/responses + json_schema
// 스켈레톤을 따르되, 환각 방지를 위해 각 필드가 원문에 실제로 근거하는지 자가검증
// (allFactsGroundedInText)도 함께 받는다.

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  NOTICE_FACT_KEYS,
  sanitizeNoticeFacts,
  sanitizeNoticeFactValue,
} from "./notice-fact-normalizer.js";
import { attachAiUsageMetadata } from "./ai-usage-logger.js";

const CACHE_PATH = process.env.NOTICE_FACTS_CACHE_PATH?.trim() || "data/notice_facts_llm.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const MODE = (process.env.NOTICE_FACTS_EXTRACTOR ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_NOTICE_FACTS_MODEL?.trim() || "gpt-5-mini";
const MAX_CONTEXT_CHARS = Number(process.env.NOTICE_FACTS_CONTEXT_CHARS ?? "4500");
// 정규식이 6개 중 이 개수 미만을 채웠을 때만 LLM을 호출한다 — 대부분의 공고는 장소/문의처처럼
// 본문에 아예 없는 필드가 있는 게 정상이라(추출 실패가 아님), "하나라도 비면 호출"이 아니라
// 명백히 추출이 잘 안 된 경우(라벨 없는 텍스트, OCR 노이즈 등)에만 호출하도록 임계값을 둔다.
const MIN_REGEX_FACTS_BEFORE_LLM = Number(process.env.NOTICE_FACTS_MIN_REGEX_FIELDS ?? "3");
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");

const FACT_KEYS = NOTICE_FACT_KEYS;
// 필드값의 몇 %가 원문에 실제로 등장해야 "근거 있음"으로 볼지 — LLM의 자기 판단
// (allFactsGroundedInText)만 믿지 않고, 여기서 독립적으로 재확인한다.
const GROUNDING_BIGRAM_OVERLAP_THRESHOLD = 0.4;

function completeFactShape(facts = {}) {
  return Object.fromEntries(
    FACT_KEYS.map((key) => [key, facts[key] ?? null]),
  );
}

function bigrams(text) {
  const compact = text.replace(/\s+/g, "");
  if (compact.length <= 1) return compact ? [compact] : [];
  const grams = [];
  for (let i = 0; i < compact.length - 1; i += 1) grams.push(compact.slice(i, i + 2));
  return grams;
}

// factValue가 실제로 content 안에 등장하는 표현인지, 순수 문자열 오버랩(bigram containment)으로
// 독립 검증한다 — LLM이 "true"라고 자가보고해도 이 프로그램적 체크를 같이 통과해야 grounded로 친다.
function isGroundedInText(factValue, content) {
  const value = String(factValue ?? "").trim();
  if (!value) return true; // null/빈 값은 검증 대상 아님
  const valueGrams = bigrams(value);
  if (valueGrams.length === 0) return content.includes(value);

  const contentCompact = content.replace(/\s+/g, "");
  const matched = valueGrams.filter((gram) => contentCompact.includes(gram)).length;
  return matched / valueGrams.length >= GROUNDING_BIGRAM_OVERLAP_THRESHOLD;
}

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function isAiModeEnabled() {
  return MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(title, content, existingFacts) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ title, content: content.slice(0, MAX_CONTEXT_CHARS), existingFacts }))
    .digest("hex");
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

function normalizeText(value, maxLength = 300) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

/**
 * 정규식으로 이미 채운 필드는 그대로 두고, 못 채운 필드만 LLM으로 보완한다.
 * @param {{title?: string, content?: string}} source
 * @param {Record<string, string|null>} existingFacts buildReadableNoticeInfo가 정규식으로 뽑은 facts
 * @returns {Promise<{facts: Record<string,string|null>, allFactsGroundedInText: boolean|null, filledByLlm: string[], reason: string, model: string}>}
 */
export async function extractNoticeFactsWithLlm(source = {}, existingFacts = {}) {
  const safeExistingFacts = sanitizeNoticeFacts(existingFacts);
  const missingKeys = FACT_KEYS.filter((key) => !safeExistingFacts[key]);
  const filledByRegexCount = FACT_KEYS.length - missingKeys.length;
  const baseResult = { facts: completeFactShape(safeExistingFacts), allFactsGroundedInText: null, filledByLlm: [], rejectedUngrounded: [], reason: "", model: "none" };

  // 정규식이 이미 충분히 채웠으면(임계값 이상) 굳이 LLM을 부르지 않는다 — 남은 빈 필드는
  // 대개 본문에 정말 없는 정보(예: 장소가 필요 없는 정책 안내문)이지 추출 실패가 아니다.
  if (missingKeys.length === 0 || filledByRegexCount >= MIN_REGEX_FACTS_BEFORE_LLM) {
    return baseResult;
  }
  if (!isAiModeEnabled()) {
    return { ...baseResult, reason: OPENAI_API_KEY ? "Notice facts extractor disabled" : "OPENAI_API_KEY not configured" };
  }

  const content = String(source.content ?? "").slice(0, MAX_CONTEXT_CHARS);
  const title = String(source.title ?? "");
  if (!content && !title) return baseResult;

  const cache = await loadCache();
  const key = cacheKey(title, content, safeExistingFacts);
  if (cache[key]) {
    return { ...cache[key], facts: completeFactShape(sanitizeNoticeFacts(cache[key].facts)) };
  }

  try {
    const prompt = [
      "당신은 한국 공공기관 공고문에서 핵심 필드를 뽑아내는 구조화 엔진이다.",
      "아래 제목/본문(OCR 또는 원문 텍스트)을 읽고, 이미 정규식으로 채워진 필드는 그대로 두고",
      "비어있는(null) 필드만 본문에서 근거를 찾아 채워라. 본문에 명확한 근거가 없으면 반드시 null로 남겨라",
      "— 절대로 본문에 없는 내용을 추측하거나 지어내지 마라(환각 금지).",
      "",
      `제목: ${title}`,
      "본문:",
      content,
      "",
      "이미 채워진 필드(그대로 유지):",
      JSON.stringify(safeExistingFacts),
      "",
      "출력 필드: period(모집/신청 기간), target(지원 대상 — 거주지/연령/자격요건),",
      "content(사업/프로그램 내용 요약), application(신청 방법),",
      "location(행사·교육·접수가 실제로 열리는 장소/주소 — target의 거주지 자격요건과 다름,",
      "본문에 그런 장소가 없으면 null), contact(문의처). 전부 string 또는 null.",
      "추가로 allFactsGroundedInText: 최종 6개 필드 값이 전부 본문에 실제로 등장하거나",
      "명확히 뒷받침되는지 스스로 재검토한 boolean.",
      "JSON만 출력.",
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
            name: "notice_facts_extraction",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                period: { type: ["string", "null"] },
                target: { type: ["string", "null"] },
                content: { type: ["string", "null"] },
                application: { type: ["string", "null"] },
                location: { type: ["string", "null"] },
                contact: { type: ["string", "null"] },
                allFactsGroundedInText: { type: "boolean" },
                reason: { type: "string" },
              },
              required: ["period", "target", "content", "application", "location", "contact", "allFactsGroundedInText", "reason"],
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

    const filledByLlm = [];
    const rejectedUngrounded = [];
    const facts = completeFactShape(safeExistingFacts);
    const fullSourceText = `${title}\n${content}`;
    for (const key of FACT_KEYS) {
      if (facts[key]) continue; // 정규식 값이 있으면 절대 덮어쓰지 않는다
      const value = sanitizeNoticeFactValue(normalizeText(parsed[key]), key);
      if (!value) continue;
      // LLM의 자가보고(allFactsGroundedInText)만 믿지 않고, 값이 실제로 원문에 등장하는지
      // 문자열 오버랩으로 독립 검증한다 — 통과 못 하면 환각으로 간주해 버린다(null 유지).
      if (isGroundedInText(value, fullSourceText)) {
        facts[key] = value;
        filledByLlm.push(key);
      } else {
        rejectedUngrounded.push(key);
      }
    }

    const result = attachAiUsageMetadata({
      facts: completeFactShape(sanitizeNoticeFacts(facts)),
      allFactsGroundedInText: Boolean(parsed.allFactsGroundedInText) && rejectedUngrounded.length === 0,
      filledByLlm,
      rejectedUngrounded,
      reason: normalizeText(parsed.reason, 300) ?? "",
      model: MODEL,
    }, {
      model: MODEL,
      operation: "notice_facts_extraction",
      stageLabel: "cheap_text",
      status: "success",
      inputTokens: payload.usage?.input_tokens ?? payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? payload.usage?.completion_tokens ?? null,
    });
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    // 실패 시 fail-open: 정규식 결과만 그대로 사용한다.
    return { ...baseResult, reason: `Notice facts extraction failed: ${error.message}` };
  }
}
