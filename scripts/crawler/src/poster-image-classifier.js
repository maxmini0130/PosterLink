import axios from "axios";
import { execFile } from "node:child_process";
import crypto from "crypto";
import { existsSync } from "node:fs";
import fs from "fs/promises";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";

const CACHE_PATH = "data/poster_image_classifications.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const CLASSIFIER_MODE = (process.env.POSTER_IMAGE_CLASSIFIER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_IMAGE_MODEL?.trim() || "gpt-5-mini";
const MIN_CONFIDENCE = Number(process.env.POSTER_IMAGE_MIN_CONFIDENCE ?? "0.65");
const ALLOW_UNVERIFIED = process.env.POSTER_IMAGE_ALLOW_UNVERIFIED === "1";
const LOCAL_MODEL_PATH = process.env.POSTER_LOCAL_MODEL_PATH?.trim();
const LOCAL_MODEL_THRESHOLD = Number(process.env.POSTER_LOCAL_MODEL_THRESHOLD ?? MIN_CONFIDENCE);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PREDICT_SCRIPT = path.resolve(__dirname, "../ml/predict_poster.py");
const PYTHON_BIN = process.env.POSTER_AI_PYTHON?.trim() || findPythonBin();

function findPythonBin() {
  const candidates = [
    path.resolve(__dirname, "../.venv/Scripts/python.exe"),
    path.resolve(__dirname, "../.venv/bin/python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "python";
}

function isAiModeEnabled() {
  return CLASSIFIER_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function isLocalModeEnabled() {
  return Boolean(LOCAL_MODEL_PATH) && CLASSIFIER_MODE !== "off";
}

function cacheKey(imageUrl) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      imageUrl,
      localModel: LOCAL_MODEL_PATH || null,
      model: isLocalModeEnabled() ? "local" : MODEL,
    }))
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
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; poster image classification)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });

  const contentType = response.headers["content-type"]?.split(";")[0] || "image/jpeg";
  return `data:${contentType};base64,${Buffer.from(response.data).toString("base64")}`;
}

function execFileJson(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Invalid local classifier JSON: ${parseError.message}\n${stdout}`));
      }
    });
  });
}

async function imageUrlToTempFile(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    maxContentLength: 10 * 1024 * 1024,
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; local poster classifier)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });

  const ext = response.headers["content-type"]?.includes("png") ? "png"
    : response.headers["content-type"]?.includes("webp") ? "webp"
      : response.headers["content-type"]?.includes("gif") ? "gif"
        : "jpg";
  const tempDir = path.join(os.tmpdir(), "posterlink-ai");
  await fs.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${crypto.randomUUID()}.${ext}`);
  await fs.writeFile(tempPath, response.data);
  return tempPath;
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

async function classifyWithLocalModel(imageUrl) {
  const tempPath = await imageUrlToTempFile(imageUrl);
  try {
    const prediction = await execFileJson(PYTHON_BIN, [
      LOCAL_PREDICT_SCRIPT,
      "--model",
      LOCAL_MODEL_PATH,
      "--image",
      tempPath,
      "--threshold",
      String(LOCAL_MODEL_THRESHOLD),
    ]);

    return {
      isPoster: Boolean(prediction.isPoster),
      confidence: Math.max(0, Math.min(1, Number(prediction.confidence ?? 0))),
      reason: `Local PosterLink model predicted ${prediction.label}`,
      visualType: prediction.label || "unknown",
      checkedAt: new Date().toISOString(),
      model: `local:${path.basename(LOCAL_MODEL_PATH)}`,
      scores: prediction.scores,
    };
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

function isUsableCachedResult(result) {
  if (!result) return false;
  if (ALLOW_UNVERIFIED) return true;
  if (result.model === "none") return false;
  return !/^Classifier failed; allowed by default:/i.test(String(result.reason ?? ""));
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

  if (!isLocalModeEnabled() && !isAiModeEnabled()) {
    return {
      isPoster: ALLOW_UNVERIFIED,
      confidence: ALLOW_UNVERIFIED ? 1 : 0,
      reason: OPENAI_API_KEY
        ? "Poster image classifier disabled"
        : "OPENAI_API_KEY not configured; rejected by default",
      visualType: "unknown",
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  const cache = await loadCache();
  const key = cacheKey(imageUrl);
  if (isUsableCachedResult(cache[key])) return cache[key];

  try {
    if (isLocalModeEnabled()) {
      const result = await classifyWithLocalModel(imageUrl);
      cache[key] = result;
      await saveCache(cache);
      return result;
    }

    const dataUrl = await imageUrlToDataUrl(imageUrl);
    const prompt = [
      "You are PosterLink's strict image classifier.",
      "Decide whether the image is a public-service poster, flyer, notice, recruitment graphic, event/program card, or announcement image.",
      "Return isPoster=false for logos, icons, website UI screenshots, unrelated photos, maps, profile images, decorative banners, file icons, or generic layout assets.",
      "Return isPoster=false for plain facility-use notices, court schedules, reservation/use guides, operating-hour notices, fee tables, or text-only administrative pages even if they include an image.",
      "Return isPoster=false for web accessibility images/certification marks, WA marks, alt-text/accessibility guide images, homepage-use notices, parking-control notices, facility rental schedule tables, or center operation schedules.",
      "Return isPoster=true for real flyer images announcing craft classes, career-pass running/community events, job-training courses, youth-center week/festival programs, or new studio/facility opening programs when they include dates, audience, place, application, or program details.",
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
      isPoster: ALLOW_UNVERIFIED,
      confidence: ALLOW_UNVERIFIED ? 0.5 : 0,
      reason: `Classifier failed; ${ALLOW_UNVERIFIED ? "allowed" : "rejected"} by default: ${error.message}`,
      visualType: "unknown",
      checkedAt: new Date().toISOString(),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}
