import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_content_verifications.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const VERIFIER_MODE = (process.env.POSTER_CONTENT_VERIFIER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_CONTENT_MODEL?.trim() || "gpt-5-mini";
const MIN_CONFIDENCE = Number(process.env.POSTER_CONTENT_MIN_CONFIDENCE ?? "0.6");
const MAX_CONTEXT_CHARS = Number(process.env.POSTER_CONTENT_CONTEXT_CHARS ?? "4500");
const ALLOW_ON_ERROR = process.env.POSTER_CONTENT_ALLOW_ON_ERROR === "1";
const ALLOW_UNVERIFIED = process.env.POSTER_CONTENT_ALLOW_UNVERIFIED === "1";

function isAiModeEnabled() {
  return VERIFIER_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(imageUrl, context = {}) {
  const stableContext = {
    title: context.title ?? "",
    date: context.date ?? "",
    deadline: context.deadline ?? "",
    site: context.site ?? "",
    board: context.board ?? "",
    category: context.category ?? "",
    sourceUrl: context.sourceUrl ?? "",
    content: String(context.content ?? "").slice(0, MAX_CONTEXT_CHARS),
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ imageUrl, stableContext }))
    .digest("hex");
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
    maxContentLength: 8 * 1024 * 1024,
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; poster content verification)",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });

  const contentType = response.headers["content-type"]?.split(";")[0] || "image/jpeg";
  return `data:${contentType};base64,${Buffer.from(response.data).toString("base64")}`;
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in model response: ${text}`);
  return JSON.parse(match[0]);
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).slice(0, 120)).filter(Boolean).slice(0, 12);
}

function normalizeResult(result, fallbackReason = "") {
  const confidence = Math.max(0, Math.min(1, Number(result.confidence ?? 0)));
  return {
    isSameNotice: Boolean(result.isSameNotice) && confidence >= MIN_CONFIDENCE,
    confidence,
    decision: String(result.decision ?? (confidence >= MIN_CONFIDENCE ? "match" : "uncertain")).slice(0, 40),
    matchedFields: normalizeList(result.matchedFields),
    mismatchedFields: normalizeList(result.mismatchedFields),
    posterTextSummary: String(result.posterTextSummary ?? "").slice(0, 500),
    reason: String(result.reason ?? fallbackReason).slice(0, 500),
    checkedAt: new Date().toISOString(),
    model: MODEL,
  };
}

function buildNoticeContext(context = {}) {
  return [
    `Title: ${context.title ?? ""}`,
    `Date: ${context.date ?? ""}`,
    `Deadline: ${context.deadline ?? ""}`,
    `Organization/site: ${context.site ?? context.sourceOrgName ?? ""}`,
    `Board: ${context.board ?? ""}`,
    `Category: ${context.category ?? ""}`,
    `Source URL: ${context.sourceUrl ?? ""}`,
    "Original page text:",
    String(context.content ?? "").slice(0, MAX_CONTEXT_CHARS),
  ].join("\n");
}

function isUsableCachedResult(result) {
  if (!result) return false;
  if (ALLOW_UNVERIFIED || ALLOW_ON_ERROR) return true;
  if (result.model === "none") return false;
  if (result.decision === "verification_failed_allowed") return false;
  return !/allowed by default/i.test(String(result.reason ?? ""));
}

export async function verifyPosterMatchesNotice(imageUrl, context = {}) {
  if (!imageUrl) {
    return {
      isSameNotice: false,
      confidence: 0,
      decision: "missing_image",
      matchedFields: [],
      mismatchedFields: ["imageUrl"],
      posterTextSummary: "",
      reason: "No image URL",
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  if (!isAiModeEnabled()) {
    return {
      isSameNotice: ALLOW_UNVERIFIED,
      confidence: ALLOW_UNVERIFIED ? 1 : 0,
      decision: "not_checked",
      matchedFields: [],
      mismatchedFields: ALLOW_UNVERIFIED ? [] : ["verification"],
      posterTextSummary: "",
      reason: OPENAI_API_KEY
        ? "Poster content verifier disabled"
        : "OPENAI_API_KEY not configured; rejected by default",
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  const cache = await loadCache();
  const key = cacheKey(imageUrl, context);
  if (isUsableCachedResult(cache[key])) return cache[key];

  try {
    const dataUrl = await imageUrlToDataUrl(imageUrl);
    const prompt = [
      "You are PosterLink's strict poster-to-source verifier.",
      "Compare the poster image with the original notice text and decide whether they describe the same public notice, event, recruitment, program, or announcement.",
      "Use visible text in the poster image, especially title, date/period/deadline, place, organization, target audience, and program/recruitment details.",
      "Return isSameNotice=false when the image is a generic site thumbnail, unrelated banner, logo, different event, or when key fields conflict.",
      "Return isSameNotice=false for facility-use guides, sports court schedules, reservation instructions, operating-hour notices, fee tables, or text-only administrative notices when the source is not a real poster/flyer announcement.",
      "Return isSameNotice=true only when enough visible poster content matches the original notice. If the poster has little readable text but strongly matches title/organization/context, use lower confidence.",
      "Original notice context:",
      buildNoticeContext(context),
      "Return JSON only with: isSameNotice boolean, confidence number 0..1, decision string, matchedFields string[], mismatchedFields string[], posterTextSummary string, reason string.",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
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
            name: "poster_content_verification",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                isSameNotice: { type: "boolean" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                decision: { type: "string" },
                matchedFields: { type: "array", items: { type: "string" } },
                mismatchedFields: { type: "array", items: { type: "string" } },
                posterTextSummary: { type: "string" },
                reason: { type: "string" },
              },
              required: [
                "isSameNotice",
                "confidence",
                "decision",
                "matchedFields",
                "mismatchedFields",
                "posterTextSummary",
                "reason",
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
    const result = {
      isSameNotice: ALLOW_ON_ERROR,
      confidence: ALLOW_ON_ERROR ? 0.5 : 0,
      decision: ALLOW_ON_ERROR ? "verification_failed_allowed" : "verification_failed",
      matchedFields: [],
      mismatchedFields: ["verification"],
      posterTextSummary: "",
      reason: `Content verifier failed: ${error.message}`,
      checkedAt: new Date().toISOString(),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}
