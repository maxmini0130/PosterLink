// SNS_INGESTION.md Phase 2, Stage 2 — CLIP 시각 선별기 Node 래퍼.
// poster-image-classifier.js의 로컬 모델 서브프로세스 패턴(execFile + 임시파일 다운로드)을 그대로 따른다.
// 비용 0원(로컬 zero-shot CLIP)이므로 캐시는 두지 않고, 매번 재계산해도 부담 없다.

import axios from "axios";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import path from "path";

const CLIP_MODE = (process.env.POSTER_CLIP_CLASSIFIER ?? "auto").trim().toLowerCase();
const CLIP_MIN_CONFIDENCE = Number(process.env.POSTER_CLIP_MIN_CONFIDENCE ?? "0.5");
const CLIP_MODEL_NAME = process.env.POSTER_CLIP_MODEL_NAME?.trim() || "ViT-B-32";
const CLIP_PRETRAINED = process.env.POSTER_CLIP_PRETRAINED?.trim() || "openai";

const __dirname = process.env.POSTER_CRAWLER_SRC_DIR?.trim()
  || path.dirname(path.resolve(process.argv[1] || path.join(process.cwd(), "src", "index.js")));
const CLIP_SCRIPT = path.resolve(__dirname, "../ml/clip_classify.py");
const PYTHON_BIN = process.env.POSTER_AI_PYTHON?.trim() || findPythonBin();

function findPythonBin() {
  const candidates = [
    path.resolve(__dirname, "../.venv/Scripts/python.exe"),
    path.resolve(__dirname, "../.venv/bin/python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "python";
}

function isClipEnabled() {
  return CLIP_MODE !== "off";
}

function execFileJson(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Invalid CLIP classifier JSON: ${parseError.message}\n${stdout}`));
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
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; local CLIP triage)",
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

/**
 * 확실히 "포스터 레이아웃이 아님"으로 판단될 때만 isPosterLayout=false를 반환한다.
 * 애매하거나 CLIP이 비활성/실패한 경우 항상 true를 반환해 GPT Vision 단계로 넘긴다
 * (포스터를 잘못 걸러내는 것을 방지 — 이 단계의 목적은 "확실한 부정"만 값싸게 골라내는 것).
 * @param {string} imageUrl
 * @returns {Promise<{isPosterLayout: boolean, confidence: number, bestLabel: string, reason: string, model: string}>}
 */
export async function classifyPosterImageClip(imageUrl) {
  if (!imageUrl || !isClipEnabled()) {
    return {
      isPosterLayout: true,
      confidence: 0,
      bestLabel: "unknown",
      reason: !imageUrl ? "No image URL" : "CLIP triage disabled",
      model: "none",
    };
  }

  let tempPath;
  try {
    tempPath = await imageUrlToTempFile(imageUrl);
    const prediction = await execFileJson(PYTHON_BIN, [
      CLIP_SCRIPT,
      "--image",
      tempPath,
      "--threshold",
      String(CLIP_MIN_CONFIDENCE),
      "--model-name",
      CLIP_MODEL_NAME,
      "--pretrained",
      CLIP_PRETRAINED,
    ]);

    return {
      isPosterLayout: Boolean(prediction.isPosterLayout),
      confidence: Math.max(0, Math.min(1, Number(prediction.confidence ?? 0))),
      bestLabel: prediction.bestLabel ?? "unknown",
      reason: `CLIP best label: ${prediction.bestLabel}`,
      model: prediction.model ?? `${CLIP_MODEL_NAME}/${CLIP_PRETRAINED}`,
      scores: prediction.scores,
    };
  } catch (error) {
    // 실패 시 fail-open: GPT Vision이 최종 판단을 내리도록 넘긴다.
    return {
      isPosterLayout: true,
      confidence: 0,
      bestLabel: "unknown",
      reason: `CLIP triage failed, allowed by default: ${error.message}`,
      model: "none",
    };
  } finally {
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
  }
}
