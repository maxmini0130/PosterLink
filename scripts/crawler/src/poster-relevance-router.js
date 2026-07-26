// SNS_INGESTION.md Phase 2, Stage 4 — LLM 라우터(최종 3방향 분류 + 필드 추출).
// 문서의 시스템 프롬프트/출력 스키마를 그대로 사용한다.
// poster-field-verifier.js / poster-image-classifier.js와 동일한 OpenAI /v1/responses +
// json_schema 스켈레톤, env 변수 명명 규칙, 디스크 캐시 패턴을 따른다.
//
// 비용 절감: upload-to-supabase.js 쪽에서 Stage 1 휴리스틱이 이미 확정한 글(공고/폐기)은
// 이 함수를 호출하지 않고 넘어간다 — 애매한 글만 여기까지 온다.

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_relevance_routes.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const ROUTER_MODE = (process.env.POSTER_RELEVANCE_ROUTER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_ROUTER_MODEL?.trim() || "gpt-5-mini";
const MIN_CONFIDENCE = Number(process.env.POSTER_RELEVANCE_ROUTER_MIN_CONFIDENCE ?? "0.6");
const MAX_CONTEXT_CHARS = Number(process.env.POSTER_RELEVANCE_ROUTER_CONTEXT_CHARS ?? "4500");
const ALLOW_ON_ERROR = process.env.POSTER_RELEVANCE_ROUTER_ALLOW_ON_ERROR !== "0";
const ROUTER_SCHEMA_VERSION = 1;

const VALID_ROUTES = ["공고", "소식", "폐기"];
const VALID_CATEGORIES = [
  "지원사업", "채용", "공모전", "교육강좌", "행사모집", "입찰",
  "정책안내", "보도자료", "생활정보", "기타",
];

function isAiModeEnabled() {
  return ROUTER_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(context = {}) {
  const stableContext = {
    schemaVersion: ROUTER_SCHEMA_VERSION,
    title: context.title ?? "",
    body: String(context.body ?? "").slice(0, MAX_CONTEXT_CHARS),
    ocrText: String(context.ocrText ?? "").slice(0, MAX_CONTEXT_CHARS),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stableContext)).digest("hex");
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

function normalizeText(value, maxLength = 300) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : "";
}

function normalizeResult(result) {
  const route = VALID_ROUTES.includes(result.route) ? result.route : "소식";
  const category = VALID_CATEGORIES.includes(result.category) ? result.category : "기타";
  return {
    route,
    category,
    hasDeadline: Boolean(result.has_deadline),
    deadlineText: normalizeText(result.deadline_text),
    target: normalizeText(result.target),
    supportScale: normalizeText(result.support_scale),
    confidence: Math.max(0, Math.min(1, Number(result.confidence ?? 0))),
    reason: normalizeText(result.reason, 500),
    checkedAt: new Date().toISOString(),
    model: MODEL,
  };
}

function isUsableCachedResult(result) {
  if (!result) return false;
  if (ALLOW_ON_ERROR) return true;
  return result.decision !== "router_failed";
}

function buildContext(context = {}) {
  return [
    `제목: ${context.title ?? ""}`,
    `본문: ${String(context.body ?? "").slice(0, MAX_CONTEXT_CHARS)}`,
    `이미지OCR: ${String(context.ocrText ?? "").slice(0, MAX_CONTEXT_CHARS)}`,
  ].join("\n");
}

/**
 * @param {{title?: string, body?: string, ocrText?: string}} context
 * @returns {Promise<{route: '공고'|'소식'|'폐기', category: string, hasDeadline: boolean,
 *   deadlineText: string, target: string, supportScale: string, confidence: number, reason: string, model: string}>}
 */
export async function routePosterRelevance(context = {}) {
  if (!isAiModeEnabled()) {
    return {
      route: "소식",
      category: "기타",
      hasDeadline: false,
      deadlineText: "",
      target: "",
      supportScale: "",
      confidence: 0,
      reason: OPENAI_API_KEY ? "Relevance router disabled" : "OPENAI_API_KEY not configured",
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  const cache = await loadCache();
  const key = cacheKey(context);
  if (isUsableCachedResult(cache[key])) return cache[key];

  try {
    const prompt = [
      "당신은 한국 공공기관 게시글 분류기다. 입력(제목/본문/이미지OCR)을 읽고",
      "아래 JSON만 출력한다. 설명·마크다운·코드펜스 절대 금지.",
      "",
      "라우팅 기준:",
      '- "공고": 마감일 또는 접수기간이 있고, 사용자가 취할 신청·모집·지원·',
      "  응모·참가·제출 액션이 있음",
      '- "소식": 액션/마감 없으나 지역민에 유용(정책·제도 안내, 카드뉴스,',
      "  시설 개관·변경, 행사 후기, 보도자료, 생활정보)",
      '- "폐기": 지역 유용성 없음(기관장 인사말, 내부 일상, 축하, 무관 홍보)',
      "",
      "출력 스키마:",
      "{",
      '  "route": "공고" | "소식" | "폐기",',
      '  "category": "지원사업|채용|공모전|교육강좌|행사모집|입찰|정책안내|보도자료|생활정보|기타",',
      '  "has_deadline": true | false,',
      '  "deadline_text": "원문의 마감/기간 표현 그대로 (없으면 \\"\\")",',
      '  "target": "대상 표현 (없으면 \\"\\")",',
      '  "support_scale": "지원금액/규모 (없으면 \\"\\")",',
      '  "confidence": 0.0,',
      '  "reason": "한 문장 근거"',
      "}",
      "",
      "입력:",
      buildContext(context),
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
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
            name: "poster_relevance_route",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                route: { type: "string", enum: VALID_ROUTES },
                category: { type: "string", enum: VALID_CATEGORIES },
                has_deadline: { type: "boolean" },
                deadline_text: { type: "string" },
                target: { type: "string" },
                support_scale: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" },
              },
              required: [
                "route", "category", "has_deadline", "deadline_text",
                "target", "support_scale", "confidence", "reason",
              ],
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
    const result = normalizeResult(parseJson(outputText));
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    // 실패 시 fail-open: 기존 파이프라인 동작(공고로 취급, 관리자 검수 대상)을 그대로 유지한다.
    const result = {
      route: "공고",
      category: "기타",
      hasDeadline: false,
      deadlineText: "",
      target: "",
      supportScale: "",
      confidence: 0,
      reason: `Relevance router failed; defaulted to 공고: ${error.message}`,
      decision: "router_failed",
      checkedAt: new Date().toISOString(),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}

export { MIN_CONFIDENCE as ROUTER_MIN_CONFIDENCE };
