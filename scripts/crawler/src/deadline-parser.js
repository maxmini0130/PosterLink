// SNS_INGESTION.md Phase 2 — 마감일 파서(킬러 필드).
// deadline_text(자유형 한국어)를 apply_start/apply_end/deadline_type으로 변환한다.
// 규칙 기반 우선, 실패 시에만 LLM 폴백(비용 절감 — 대부분의 한국 공고 날짜 표현은
// 정규식으로 충분히 커버된다).

import dayjs from "dayjs";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { attachAiUsageMetadata } from "./ai-usage-logger.js";

const CACHE_PATH = "data/deadline_parse_llm_fallback.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const PARSER_MODE = (process.env.POSTER_DEADLINE_PARSER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_DEADLINE_MODEL?.trim() || "gpt-5-mini";
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

const ONGOING_PATTERN = /상시(?:\s*모집|\s*접수)?|연중(?!무휴)/;
const BUDGET_EXHAUSTED_PATTERN = /예산\s*소진\s*시|소진\s*시까지|소진\s*시\s*마감|조기\s*마감(?:될\s*수\s*있음)?/;

// 날짜 토큰: "2026.3.15", "2026-03-15", "3.15", "3/15", "3월 15일"
const DATE_TOKEN_PATTERN =
  /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?|(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?(?!\s*\d)/g;

function toIsoDate(year, month, day) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const candidate = `${year}-${m}-${d}`;
  return dayjs(candidate, "YYYY-MM-DD", true).isValid() ? candidate : null;
}

function extractDateTokens(text, referenceDate) {
  const tokens = [];
  const ref = dayjs(referenceDate ?? undefined);
  let match;
  DATE_TOKEN_PATTERN.lastIndex = 0;
  while ((match = DATE_TOKEN_PATTERN.exec(text)) !== null) {
    let year, month, day;
    if (match[1]) {
      [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else {
      [month, day] = [Number(match[4]), Number(match[5])];
      year = ref.year();
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const iso = toIsoDate(year, month, day);
    if (iso) tokens.push({ iso, hadExplicitYear: Boolean(match[1]), index: match.index });
  }
  return tokens;
}

// 연도 미기재 날짜가 게시일보다 과거로 크게 튀면(예: 게시일이 12월인데 날짜가 1월) 다음 해로 추정.
function reconcileYear(iso, referenceDate) {
  const ref = dayjs(referenceDate ?? undefined);
  let date = dayjs(iso);
  if (date.isBefore(ref.subtract(60, "day"))) {
    date = date.add(1, "year");
  }
  return date.format("YYYY-MM-DD");
}

/**
 * @param {string} text SNS_INGESTION.md Phase 2 라우터가 추출한 deadline_text(원문 표현)
 * @param {{postedAt?: string}} options 게시일(연도 미기재 날짜 추정 기준)
 * @returns {{applyStart: string|null, applyEnd: string|null, deadlineType: string|null, note: string|null, matched: boolean}}
 */
export function parseDeadlineTextWithRegex(text, { postedAt } = {}) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return { applyStart: null, applyEnd: null, deadlineType: null, note: "empty deadline_text", matched: false };
  }

  if (ONGOING_PATTERN.test(trimmed)) {
    return { applyStart: null, applyEnd: null, deadlineType: "상시", note: null, matched: true };
  }

  if (BUDGET_EXHAUSTED_PATTERN.test(trimmed)) {
    const tokens = extractDateTokens(trimmed, postedAt);
    const applyStart = tokens.length > 0
      ? (tokens[0].hadExplicitYear ? tokens[0].iso : reconcileYear(tokens[0].iso, postedAt))
      : null;
    return { applyStart, applyEnd: null, deadlineType: "소진시", note: null, matched: true };
  }

  const tokens = extractDateTokens(trimmed, postedAt);
  if (tokens.length === 0) {
    return { applyStart: null, applyEnd: null, deadlineType: null, note: "no date pattern matched — LLM 폴백 필요", matched: false };
  }

  const resolved = tokens.map((t) => ({
    ...t,
    iso: t.hadExplicitYear ? t.iso : reconcileYear(t.iso, postedAt),
  }));

  if (resolved.length >= 2) {
    // 기간형: "3.10 ~ 3.15", "접수기간: 3.10 ~ 3.15"
    const [start, end] = resolved;
    return {
      applyStart: start.iso,
      applyEnd: end.iso,
      deadlineType: "고정",
      note: resolved.length > 2 ? `${resolved.length}개 날짜 중 처음 2개만 사용` : null,
      matched: true,
    };
  }

  // 단일 날짜: "~ 3.15.", "3월 15일까지", "2026.03.15" → 마감일만
  const isFuturePosting = trimmed.includes("예정")
    ? true
    : dayjs(resolved[0].iso).isAfter(dayjs(postedAt ?? undefined));

  return {
    applyStart: null,
    applyEnd: resolved[0].iso,
    deadlineType: isFuturePosting ? "고정" : "고정",
    note: null,
    matched: true,
  };
}

function cacheKey(text, postedAt) {
  return crypto.createHash("sha256").update(JSON.stringify({ text, postedAt })).digest("hex");
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
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

async function parseDeadlineTextWithLlm(text, postedAt) {
  if (PARSER_MODE === "off" || !OPENAI_API_KEY) {
    return { applyStart: null, applyEnd: null, deadlineType: null, note: "LLM 폴백 비활성화", matched: false };
  }

  const cache = await loadCache();
  const key = cacheKey(text, postedAt);
  if (cache[key]) return cache[key];

  try {
    const prompt = [
      "다음은 한국 공공기관 공고에서 추출한 마감/접수기간 표현이다.",
      `게시일(연도 미기재 시 기준): ${postedAt ?? "알 수 없음"}`,
      `마감 표현: "${text}"`,
      "이 표현을 apply_start(YYYY-MM-DD|null), apply_end(YYYY-MM-DD|null),",
      'deadline_type("고정"|"소진시"|"상시"|"예정") 로 변환하라.',
      "JSON만 출력: { \"apply_start\": string|null, \"apply_end\": string|null, \"deadline_type\": string }",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: createOpenAiTimeoutSignal(),
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "deadline_parse_fallback",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                apply_start: { type: ["string", "null"] },
                apply_end: { type: ["string", "null"] },
                deadline_type: { type: "string", enum: ["고정", "소진시", "상시", "예정"] },
              },
              required: ["apply_start", "apply_end", "deadline_type"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const outputText = payload.output_text
      ?? payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("\n")
      ?? "";
    const parsed = parseJson(outputText);
    const result = attachAiUsageMetadata({
      applyStart: parsed.apply_start ?? null,
      applyEnd: parsed.apply_end ?? null,
      deadlineType: parsed.deadline_type ?? null,
      note: "LLM 폴백으로 파싱됨",
      matched: true,
    }, {
      model: MODEL,
      operation: "deadline_parse_fallback",
      stageLabel: "high_text",
      status: "success",
      inputTokens: payload.usage?.input_tokens ?? payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? payload.usage?.completion_tokens ?? null,
    });
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    return { applyStart: null, applyEnd: null, deadlineType: null, note: `LLM 폴백 실패: ${error.message}`, matched: false };
  }
}

/**
 * 규칙 기반 우선, 실패 시에만 LLM 폴백.
 * @param {string} text
 * @param {{postedAt?: string}} options
 */
export async function parseDeadlineText(text, options = {}) {
  const regexResult = parseDeadlineTextWithRegex(text, options);
  if (regexResult.matched) return regexResult;
  return parseDeadlineTextWithLlm(text, options.postedAt);
}
