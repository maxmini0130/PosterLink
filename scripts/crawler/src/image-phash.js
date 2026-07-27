// SNS_INGESTION.md 8-3 후속 — 이미지 phash 계산 + 대표이미지(해상도 우선) 선정.
// poster-clip-classifier.js와 동일한 서브프로세스 패턴(execFile + 임시파일 다운로드)을 따른다.
// 비용 0원(로컬 계산)이므로 캐시는 두지 않는다.

import axios from "axios";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import path from "path";

const PHASH_MODE = (process.env.POSTER_IMAGE_PHASH ?? "auto").trim().toLowerCase();

const __dirname = process.env.POSTER_CRAWLER_SRC_DIR?.trim()
  || path.dirname(path.resolve(process.argv[1] || path.join(process.cwd(), "src", "index.js")));
const PHASH_SCRIPT = path.resolve(__dirname, "../ml/image_phash.py");
const PYTHON_BIN = process.env.POSTER_AI_PYTHON?.trim() || findPythonBin();

function findPythonBin() {
  const candidates = [
    path.resolve(__dirname, "../.venv/Scripts/python.exe"),
    path.resolve(__dirname, "../.venv/bin/python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "python";
}

function isPhashEnabled() {
  return PHASH_MODE !== "off";
}

function execFileJson(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Invalid phash JSON: ${parseError.message}\n${stdout}`));
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
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; image phash)",
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
 * @param {string} imageUrl
 * @returns {Promise<{phash: string, width: number, height: number}|null>} 실패 시 null(fail-open — 호출부는
 *   phash 없이도 기존 텍스트/URL 기반 dedup으로 계속 동작한다).
 */
export async function computeImagePhash(imageUrl) {
  if (!imageUrl || !isPhashEnabled()) return null;

  let tempPath;
  try {
    tempPath = await imageUrlToTempFile(imageUrl);
    const result = await execFileJson(PYTHON_BIN, [PHASH_SCRIPT, "--image", tempPath]);
    if (!result.phash) return null;
    return {
      phash: String(result.phash),
      width: Number(result.width) || 0,
      height: Number(result.height) || 0,
    };
  } catch {
    return null;
  } finally {
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
  }
}

/** 두 64비트 hex phash 사이의 해밍 거리(다른 비트 개수, 0~64). */
export function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let distance = 0;
  for (let i = 0; i < hexA.length; i++) {
    let xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/** 해밍 거리 10 이하(64비트 중 약 15% 이내 차이)면 같은 이미지로 취급한다. */
export function arePhashSimilar(hexA, hexB, threshold = 10) {
  if (!hexA || !hexB) return false;
  return hammingDistance(hexA, hexB) <= threshold;
}

/**
 * 같은 후보(candidate/poster)에 대한 여러 출처의 이미지 중 대표 이미지 1장을 고른다.
 * 해상도(width*height)가 가장 큰 것을 우선하고, 해상도 정보가 없으면 source_priority가
 * 높은(게시판 > 블로그) 쪽을 우선한다.
 * @param {{imageUrl: string, imageWidth?: number, imageHeight?: number, sourcePriority?: number}[]} candidates
 * @returns {string|null}
 */
export function selectRepresentativeImage(candidates) {
  const usable = (candidates ?? []).filter((c) => c?.imageUrl);
  if (usable.length === 0) return null;

  const best = usable.reduce((current, next) => {
    const currentArea = (current.imageWidth ?? 0) * (current.imageHeight ?? 0);
    const nextArea = (next.imageWidth ?? 0) * (next.imageHeight ?? 0);
    if (nextArea !== currentArea) return nextArea > currentArea ? next : current;
    return (next.sourcePriority ?? 0) > (current.sourcePriority ?? 0) ? next : current;
  });

  return best.imageUrl;
}
