// SNS_INGESTION.md Phase 2, Stage 3 — OCR 텍스트 추출.
// CLIP(Stage 2)이 포스터 레이아웃으로 판단하고 GPT Vision(poster-image-classifier.js)이
// isPoster=true로 확정한, 최종 선택된 대표 이미지 1장에 대해서만 호출한다(후보 이미지마다
// 부르지 않음 — 비용 절감). 결과는 Stage 4 LLM 라우터의 "이미지OCR" 입력으로 쓰이고,
// notice_sightings.ocr_text에도 저장된다.
//
// poster-image-classifier.js / poster-field-verifier.js와 동일한 OpenAI /v1/responses +
// json_schema 스켈레톤을 따른다.

import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { attachAiUsageMetadata } from "./ai-usage-logger.js";
import { resolveImageContentType } from "./image-content-type.js";

const CACHE_PATH = "data/poster_ocr_texts.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OCR_MODE = (process.env.POSTER_OCR ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_OCR_MODEL?.trim() || "gpt-5-mini";
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");

function isAiModeEnabled() {
  return OCR_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(imageUrl) {
  return crypto.createHash("sha256").update(JSON.stringify({ imageUrl, model: MODEL })).digest("hex");
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

async function imageUrlToDataUrl(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; poster OCR)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });

  const imageBytes = Buffer.from(response.data);
  const contentType = resolveImageContentType(response.headers["content-type"], imageBytes) || "image/jpeg";
  return `data:${contentType};base64,${imageBytes.toString("base64")}`;
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in model response: ${text}`);
  return JSON.parse(match[0]);
}

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function normalizeResult(result) {
  return {
    ocrText: String(result.ocrText ?? "").slice(0, 4000),
    hasReadableText: Boolean(result.hasReadableText),
    confidence: Math.max(0, Math.min(1, Number(result.confidence ?? 0))),
    checkedAt: new Date().toISOString(),
    model: MODEL,
  };
}

/**
 * @param {string} imageUrl 최종 선택된 대표 포스터 이미지
 * @returns {Promise<{ocrText: string, hasReadableText: boolean, confidence: number, model: string}>}
 */
export async function extractPosterOcrText(imageUrl) {
  if (!imageUrl || !isAiModeEnabled()) {
    return {
      ocrText: "",
      hasReadableText: false,
      confidence: 0,
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  const cache = await loadCache();
  const key = cacheKey(imageUrl);
  if (cache[key]) return cache[key];

  try {
    const dataUrl = await imageUrlToDataUrl(imageUrl);
    const prompt = [
      "You are an OCR engine for Korean public-notice poster images.",
      "Transcribe ALL visible text in the image verbatim, in its original language (mostly Korean), preserving line breaks where they help readability.",
      "Do not translate, summarize, or interpret — only transcribe what is literally printed on the image.",
      "If the image has no meaningful readable text, return an empty string and hasReadableText=false.",
      "Return JSON only with: ocrText string, hasReadableText boolean, confidence number 0..1.",
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
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "poster_ocr_extraction",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                ocrText: { type: "string" },
                hasReadableText: { type: "boolean" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["ocrText", "hasReadableText", "confidence"],
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
    const result = attachAiUsageMetadata(normalizeResult(parseJson(outputText)), {
      model: MODEL,
      operation: "poster_ocr",
      stageLabel: "vlm",
      status: "success",
      inputTokens: payload.usage?.input_tokens ?? payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? payload.usage?.completion_tokens ?? null,
      imageCount: 1,
    });
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    // OCR 실패는 fail-open: 빈 텍스트만 반환하고 파이프라인은 계속 진행한다
    // (Stage 4 라우터는 원문 content만으로도 분류할 수 있음).
    const result = {
      ocrText: "",
      hasReadableText: false,
      confidence: 0,
      reason: `OCR failed: ${error.message}`,
      checkedAt: new Date().toISOString(),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}
