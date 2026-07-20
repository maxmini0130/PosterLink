// src/crawler.js
import axios from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import dayjs from "dayjs";
import { createLogger, format, transports } from "winston";
import PQueue from "p-queue";
import fs from "fs/promises";
import path from "path";
import { classifyPosterImage } from "./poster-image-classifier.js";
import { verifyPosterMatchesNotice } from "./poster-content-verifier.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";
import { selectBestPosterImage } from "./poster-image-rules.js";

// ── Logger ──────────────────────────────────────
export const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "data/crawler.log" }),
  ],
});

// ── HTTP Client ─────────────────────────────────
const client = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; data collection for public benefit info)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
  },
});

function detectCharset(contentType, htmlBuffer) {
  // 1. HTTP Content-Type 헤더에서 charset 추출
  if (contentType) {
    const m = contentType.match(/charset=([^\s;]+)/i);
    if (m) return m[1].toLowerCase();
  }
  // 2. HTML <meta charset> 또는 http-equiv에서 추출 (앞 2KB만 검색)
  const head = htmlBuffer.slice(0, 2048).toString("ascii");
  const m1 = head.match(/charset=["']?([^\s"';>]+)/i);
  if (m1) return m1[1].toLowerCase();
  return "utf-8";
}

export async function fetchPage(url) {
  try {
    const res = await client.get(url, { responseType: "arraybuffer" });
    const charset = detectCharset(res.headers["content-type"], res.data);
    const html = iconv.decode(Buffer.from(res.data), charset);
    return cheerio.load(html);
  } catch (err) {
    logger.error(`Fetch failed: ${url} — ${err.message}`);
    return null;
  }
}

// ── 이미지 다운로드 ───────────────────────────────
export async function downloadImage(imageUrl, savePath) {
  try {
    const res = await client.get(imageUrl, { responseType: "arraybuffer" });
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, res.data);
    logger.info(`Image saved: ${savePath}`);
    return savePath;
  } catch (err) {
    logger.error(`Image download failed: ${imageUrl} — ${err.message}`);
    return null;
  }
}

// ── 결과 저장 ────────────────────────────────────
export async function saveResults(siteId, posts) {
  const dir = "data/results";
  await fs.mkdir(dir, { recursive: true });
  const filename = `${dir}/${siteId}_${dayjs().format("YYYYMMDD_HHmmss")}.json`;
  await fs.writeFile(filename, JSON.stringify(posts, null, 2), "utf-8");
  logger.info(`Saved ${posts.length} posts → ${filename}`);
  return filename;
}

// ── 중복 체크 ────────────────────────────────────
const seenFile = "data/seen_urls.json";

export async function loadSeen() {
  try {
    const data = await fs.readFile(seenFile, "utf-8");
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

export async function saveSeen(seenSet) {
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(seenFile, JSON.stringify([...seenSet]), "utf-8");
}

function hasPosterImage(post) {
  return Array.isArray(post.images) && post.images.length > 0;
}

function pickImagesByPriority(detailImages, listImages) {
  if (Array.isArray(detailImages) && detailImages.length > 0) return detailImages;
  if (Array.isArray(listImages) && listImages.length > 0) return listImages;
  return [];
}

function shouldMarkImagelessSeen() {
  return process.env.CRAWLER_MARK_IMAGELESS_SEEN === "1";
}

function dropUndefinedValues(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}

const MAX_VERIFIED_IMAGE_CANDIDATES = Number(process.env.POSTER_IMAGE_VERIFY_TOP_N ?? "4");

function orderImagesWithSelected(images, selectedImageUrl) {
  return [...new Set([
    selectedImageUrl,
    ...(images ?? []).filter((imageUrl) => imageUrl !== selectedImageUrl),
  ].filter(Boolean))];
}

function getVerificationCandidates(imageSelection) {
  const candidatesByUrl = new Map();

  if (imageSelection?.selectedImageUrl) {
    candidatesByUrl.set(imageSelection.selectedImageUrl, {
      imageUrl: imageSelection.selectedImageUrl,
      rule: imageSelection.selectedRule,
    });
  }

  for (const candidate of imageSelection?.candidates ?? []) {
    if (!candidate.imageUrl) continue;
    if (!candidate.rule?.passes && candidatesByUrl.size > 0) continue;
    candidatesByUrl.set(candidate.imageUrl, candidate);
  }

  return [...candidatesByUrl.values()]
    .sort((a, b) => (b.rule?.score ?? 0) - (a.rule?.score ?? 0))
    .slice(0, MAX_VERIFIED_IMAGE_CANDIDATES);
}

async function selectVerifiedPosterImage(fullPost, imageSelection) {
  const candidateChecks = [];
  const baseContext = {
    title: fullPost.title,
    date: fullPost.date,
    deadline: fullPost.deadline,
    site: fullPost.site,
    board: fullPost.board,
    category: fullPost.category,
    content: fullPost.content,
    sourceUrl: fullPost.sourceUrl || fullPost.url,
  };

  for (const candidate of getVerificationCandidates(imageSelection)) {
    const imageClassification = await classifyPosterImage(candidate.imageUrl, {
      ...baseContext,
      rule: candidate.rule,
    });

    let contentVerification = null;
    if (imageClassification.isPoster) {
      contentVerification = await verifyPosterMatchesNotice(candidate.imageUrl, {
        ...baseContext,
        rule: candidate.rule,
        imageClassification,
      });
    } else {
      contentVerification = {
        isSameNotice: false,
        confidence: 0,
        decision: "skipped_not_poster",
        matchedFields: [],
        mismatchedFields: ["image"],
        posterTextSummary: "",
        reason: imageClassification.reason,
        checkedAt: new Date().toISOString(),
        model: "none",
      };
    }

    const check = {
      imageUrl: candidate.imageUrl,
      rule: candidate.rule,
      model: imageClassification,
      content: contentVerification,
    };
    candidateChecks.push(check);

    if (imageClassification.isPoster && contentVerification.isSameNotice) {
      return {
        selectedImageUrl: candidate.imageUrl,
        selectedRule: candidate.rule,
        imageClassification,
        contentVerification,
        candidateChecks,
      };
    }
  }

  return {
    selectedImageUrl: null,
    selectedRule: null,
    imageClassification: null,
    contentVerification: null,
    candidateChecks,
  };
}

// ── 메인 크롤 엔진 ───────────────────────────────
export async function crawlSite(site, adapter, options = {}) {
  const { maxPages = 3, dryRun = false } = options;
  const siteMaxPages = site.maxPages ?? maxPages;
  const seen = await loadSeen();
  const allPosts = [];
  const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 }); // 2초 간격

  logger.info(`━━━ Crawling: ${site.name} (${site.id}) ━━━`);

  for (const board of site.boards) {
    logger.info(`  Board: ${board.name} → ${board.url}`);

    await queue.add(async () => {
      try {
        // 1) 목록 페이지에서 게시물 링크 추출
        const posts = await adapter.parseList(board.url, site, siteMaxPages);
        logger.info(`  Found ${posts.length} posts on list page`);

        // 2) 각 게시물 상세 페이지 파싱
        for (const post of posts) {
          if (!dryRun && seen.has(post.url)) {
            logger.info(`  Skip (seen): ${post.title}`);
            continue;
          }

          const postExclusion = getPostExclusionReason(post);
          if (postExclusion) {
            if (!dryRun) seen.add(post.url);
            logger.info(`  Skip (post filter: ${postExclusion.rule}): ${post.title} — ${postExclusion.reason}`);
            continue;
          }

          if (dryRun) {
            logger.info(`  [DRY-RUN] Would fetch: ${post.title} — ${post.url}`);
            allPosts.push({ ...post, board: board.name, category: board.category, site: site.name, siteId: site.id });
            continue;
          }

          await new Promise((r) => setTimeout(r, 1500)); // 1.5초 대기

          try {
            const detail = await adapter.parseDetail(post.url, site);
            const images = pickImagesByPriority(detail.images, post.images);
            const usesDetailImages = Array.isArray(detail.images) && detail.images.length > 0;
            const fullPost = {
              ...post,
              ...dropUndefinedValues(detail),
              images,
              posterImageRule: usesDetailImages ? detail.posterImageRule : null,
              posterImageCandidates: usesDetailImages ? detail.posterImageCandidates : null,
              board: board.name,
              category: board.category,
              site: site.name,
              siteId: site.id,
              crawledAt: dayjs().toISOString(),
            };
            const detailExclusion = getPostExclusionReason(fullPost);
            if (detailExclusion) {
              seen.add(post.url);
              logger.info(`  Skip (detail filter: ${detailExclusion.rule}): ${post.title} - ${detailExclusion.reason}`);
              continue;
            }

            if (!hasPosterImage(fullPost)) {
              if (shouldMarkImagelessSeen()) seen.add(post.url);
              logger.info(`  Skip (no poster image): ${post.title}`);
              continue;
            }

            const imageSelection = fullPost.posterImageRule
              ? {
                  selectedImageUrl: fullPost.images[0],
                  selectedRule: fullPost.posterImageRule,
                  candidates: fullPost.posterImageCandidates ?? [],
                }
              : await selectBestPosterImage(fullPost.images, {
                  title: fullPost.title,
                  site: fullPost.site,
                  board: fullPost.board,
                  category: fullPost.category,
                  content: fullPost.content,
                  sourceUrl: fullPost.sourceUrl || fullPost.url,
                });

            if (!imageSelection.selectedImageUrl) {
              if (shouldMarkImagelessSeen()) seen.add(post.url);
              const bestRejected = imageSelection.candidates[0]?.rule;
              logger.info(`  Skip (image rules): ${post.title} — ${bestRejected?.reason ?? "no usable poster image"}`);
              continue;
            }

            const verifiedImage = await selectVerifiedPosterImage(fullPost, imageSelection);

            const posterImageCheck = {
              rule: verifiedImage.selectedRule ?? imageSelection.selectedRule,
              model: verifiedImage.imageClassification,
              content: verifiedImage.contentVerification,
              candidates: verifiedImage.candidateChecks,
            };

            if (!verifiedImage.selectedImageUrl) {
              if (shouldMarkImagelessSeen()) seen.add(post.url);
              const bestRejected = verifiedImage.candidateChecks[0];
              const reason = bestRejected?.content?.reason ?? bestRejected?.model?.reason ?? "no poster image matched original notice";
              logger.info(`  Skip (poster/content mismatch): ${post.title} - ${reason}`);
              continue;
            }

            const verifiedPost = {
              ...fullPost,
              images: orderImagesWithSelected(fullPost.images, verifiedImage.selectedImageUrl),
              imageClassification: verifiedImage.imageClassification,
              posterContentVerification: verifiedImage.contentVerification,
              posterImageCheck,
            };

            allPosts.push(verifiedPost);
            seen.add(post.url);
            logger.info(`  OK ${post.title} [rule ${verifiedImage.selectedRule?.score ?? 0}]${verifiedImage.imageClassification?.model !== "none" ? ` [poster ${Math.round(verifiedImage.imageClassification.confidence * 100)}%]` : ""}${verifiedImage.contentVerification?.model !== "none" ? ` [match ${Math.round(verifiedImage.contentVerification.confidence * 100)}%]` : ""}`);
          } catch (err) {
            logger.error(`  ✗ Detail parse failed: ${post.url} — ${err.message}`);
          }
        }
      } catch (err) {
        logger.error(`  Board crawl failed: ${board.name} — ${err.message}`);
      }
    });
  }

  if (!dryRun) {
    await saveSeen(seen);
  }

  if (allPosts.length > 0) {
    await saveResults(site.id, allPosts);
  }

  logger.info(`━━━ Done: ${site.name} — ${allPosts.length} posts collected ━━━\n`);
  return allPosts;
}
