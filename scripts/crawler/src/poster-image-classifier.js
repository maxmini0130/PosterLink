import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_image_classifications.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const CLASSIFIER_MODE = (process.env.POSTER_IMAGE_CLASSIFIER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_IMAGE_MODEL?.trim() || "gpt-5-mini";
const MIN_CONFIDENCE = Number(process.env.POSTER_IMAGE_MIN_CONFIDENCE ?? "0.65");

function isAiModeEnabled() {
  return CLASSIFIER_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(imageUrl) {
  return crypto.createHash("sha256").update(imageUrl).digest("hex");
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
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; poster image classification)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
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

function normalizeResult(result, fallbackReason = "") {
  const confidence = Math.max(0, Math.min(1, Number(result.confidence ?? 0)));
  return {
    isPoster: Boolean(result.isPoster) && confidence >= MIN_CONFIDENCE,
    confidence,
    reason: String(result.reason ?? fallbackReason).slice(0, 300),
    visualType: String(result.visualType ?? "unknown").slice(0, 80),
    checkedAt: new Date().toISOString(),
    model: MODEL,
  };
}

export async function classifyPosterImage(imageUrl, context = {}) {
  if (!imageUrl) {
    return {
      isPoster: false,
      confidence: 0,
      reason: "No image URL",
      visualType: "missing",
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  if (!isAiModeEnabled()) {
    return {
      isPoster: true,
      confidence: 1,
      reason: OPENAI_API_KEY ? "Poster image classifier disabled" : "OPENAI_API_KEY not configured; allowed by default",
      visualType: "unknown",
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
      "You are PosterLink's strict image classifier.",
      "Decide whether the image is a public-service poster, flyer, notice, recruitment graphic, event/program card, or announcement image.",
      "Return isPoster=false for logos, icons, website UI screenshots, unrelated photos, maps, profile images, decorative banners, file icons, or generic layout assets.",
      "A real poster usually contains substantial readable Korean/English announcement text, dates, organization names, QR/contact info, application/recruitment/event details, or a designed flyer layout.",
      `Known title: ${context.title ?? ""}`,
      `Known organization/site: ${context.site ?? context.sourceOrgName ?? ""}`,
      "Return JSON only with: isPoster boolean, confidence number 0..1, visualType string, reason string.",
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
              { type: "input_image", image_url: dataUrl, detail: "low" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "poster_image_classification",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                isPoster: { type: "boolean" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                visualType: { type: "string" },
                reason: { type: "string" },
              },
              required: ["isPoster", "confidence", "visualType", "reason"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("\n") ?? "";
    const result = normalizeResult(parseJson(outputText));
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    const result = {
      isPoster: true,
      confidence: 0.5,
      reason: `Classifier failed; allowed by default: ${error.message}`,
      visualType: "unknown",
      checkedAt: new Date().toISOString(),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}
