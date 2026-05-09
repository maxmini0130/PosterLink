// src/crawler.js
import axios from "axios";
import * as cheerio from "cheerio";
import dayjs from "dayjs";
import { createLogger, format, transports } from "winston";
import PQueue from "p-queue";
import fs from "fs/promises";
import path from "path";
import { classifyPosterImage } from "./poster-image-classifier.js";
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

export async function fetchPage(url) {
  try {
    const res = await client.get(url, { responseType: "text" });
    return cheerio.load(res.data);
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

function dropUndefinedValues(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
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
          if (seen.has(post.url)) {
            logger.info(`  Skip (seen): ${post.title}`);
            continue;
          }

          const postExclusion = getPostExclusionReason(post);
          if (postExclusion) {
            seen.add(post.url);
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
            const fullPost = {
              ...post,
              ...dropUndefinedValues(detail),
              board: board.name,
              category: board.category,
              site: site.name,
              siteId: site.id,
              crawledAt: dayjs().toISOString(),
            };
            if (!hasPosterImage(fullPost)) {
              seen.add(post.url);
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
              seen.add(post.url);
              const bestRejected = imageSelection.candidates[0]?.rule;
              logger.info(`  Skip (image rules): ${post.title} — ${bestRejected?.reason ?? "no usable poster image"}`);
              continue;
            }

            const imageClassification = await classifyPosterImage(imageSelection.selectedImageUrl, {
              title: fullPost.title,
              site: fullPost.site,
              board: fullPost.board,
              category: fullPost.category,
              content: fullPost.content,
              sourceUrl: fullPost.sourceUrl || fullPost.url,
              rule: imageSelection.selectedRule,
            });

            const posterImageCheck = {
              rule: imageSelection.selectedRule,
              model: imageClassification,
            };

            if (!imageClassification.isPoster) {
              seen.add(post.url);
              logger.info(`  Skip (not poster image): ${post.title} — ${imageClassification.reason}`);
              continue;
            }

            allPosts.push({ ...fullPost, imageClassification, posterImageCheck });
            seen.add(post.url);
            logger.info(`  ✓ ${post.title} [rule ${imageSelection.selectedRule.score}]${imageClassification.model !== "none" ? ` [poster ${Math.round(imageClassification.confidence * 100)}%]` : ""}`);
          } catch (err) {
            logger.error(`  ✗ Detail parse failed: ${post.url} — ${err.message}`);
          }
        }
      } catch (err) {
        logger.error(`  Board crawl failed: ${board.name} — ${err.message}`);
      }
    });
  }

  await saveSeen(seen);

  if (allPosts.length > 0) {
    await saveResults(site.id, allPosts);
  }

  logger.info(`━━━ Done: ${site.name} — ${allPosts.length} posts collected ━━━\n`);
  return allPosts;
}
