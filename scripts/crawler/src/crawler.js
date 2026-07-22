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

function shouldCollectTextNotices() {
  return process.env.CRAWLER_COLLECT_TEXT_NOTICES !== "0";
}

const TEXT_NOTICE_POSITIVE_PATTERN = /\uBAA8\uC9D1|\uACF5\uACE0|\uCC44\uC6A9|\uC9C0\uC6D0\s*\uC0AC\uC5C5|\uC9C0\uC6D0\uC0AC\uC5C5|\uAD50\uC721|\uD504\uB85C\uADF8\uB7A8|\uCC38\uC5EC\uC790|\uC218\uAC15\uC0DD|\uACF5\uBAA8|\uC811\uC218|\uC2E0\uCCAD\uC790|\uD6C8\uB828|\uAC15\uC88C|\uD074\uB798\uC2A4/i;
const TEXT_NOTICE_STRONG_TITLE_PATTERN = /\uBAA8\uC9D1|\uACF5\uACE0|\uCC44\uC6A9|\uC9C0\uC6D0\s*\uC0AC\uC5C5|\uC9C0\uC6D0\uC0AC\uC5C5|\uAD50\uC721|\uD504\uB85C\uADF8\uB7A8|\uCC38\uC5EC\uC790|\uC218\uAC15\uC0DD|\uACF5\uBAA8|\uD6C8\uB828|\uAC15\uC88C|\uD074\uB798\uC2A4/i;
const TEXT_NOTICE_NEGATIVE_PATTERN = /\uCD5C\uC885\s*\uC120\uBC1C\s*\uBA85\uB2E8|\uC120\uBC1C\s*\uBA85\uB2E8|\uCC38\uAC00\uC0C1\s*\uBA85\uB2E8|\uC6B4\uC601\s*\uC885\uB8CC|\uD589\uC0AC\s*\uC77C\uC815|\uC778\uAD6C\s*\uBC0F\s*\uC138\uB300\uC218\s*\uD604\uD669/i;
const ALWAYS_OPEN_TEXT_PATTERN = /\uC0C1\uC2DC|\uC218\uC2DC|\uC5F0\uC911/i;
const DEFAULT_MAX_POST_AGE_DAYS = 540;
const CENTRAL_TEXT_NOTICE_SOURCE_PATTERN = /(?:k-startup|K-Startup|k-startup\.go\.kr|bizinfo|bizinfo\.go\.kr|youthcenter|youthcenter\.go\.kr|\uAE30\uC5C5\uB9C8\uB2F9|\uC628\uD1B5\uCCAD\uB144)/i;
const CENTRAL_TEXT_NOTICE_SIGNAL_PATTERN = /(?:\uC2E0\uCCAD|\uC811\uC218)\s*\uAE30\uAC04|\uC2E0\uCCAD\s*\uBC29\uBC95|\uC8FC\uAD00\uAE30\uAD00|\uCC3D\uC5C5|\uC2A4\uD0C0\uD2B8\uC5C5|\uCC38\uAC00\uAE30\uC5C5|\uCC38\uC5EC\uAE30\uC5C5|\uCC3D\uC5C5\uAE30\uC5C5|\uC785\uC8FC\uAE30\uC5C5|\uC9C0\uC6D0\s*\uC0AC\uC5C5|\uC0AC\uC5C5\s*\uACF5\uACE0|\uC561\uC140\uB7EC\uB808\uC774\uD305|\uCEE8\uC124\uD305|\uD22C\uC790|\uBCF4\uC721\uC13C\uD130|\bIR\b/i;

function isCentralTextNotice(post, text) {
  const sourceText = [
    post?.site,
    post?.siteId,
    post?.collectionSourceSlug,
    post?.sourceUrl,
    post?.url,
  ].filter(Boolean).join(" ");

  return CENTRAL_TEXT_NOTICE_SOURCE_PATTERN.test(sourceText)
    && CENTRAL_TEXT_NOTICE_SIGNAL_PATTERN.test(text);
}

function isCollectableTextNotice(post) {
  if (!shouldCollectTextNotices()) return false;
  const title = String(post?.title ?? "").replace(/\s+/g, " ").trim();
  const content = String(post?.content ?? "").replace(/\s+/g, " ").trim();
  const attachmentText = Array.isArray(post?.attachments)
    ? post.attachments.map((attachment) => attachment?.name).filter(Boolean).join(" ")
    : "";
  const text = `${title} ${content} ${attachmentText}`;

  if (title.length < 8) return false;
  if (TEXT_NOTICE_NEGATIVE_PATTERN.test(text) && !isCentralTextNotice(post, text)) return false;
  if (!TEXT_NOTICE_POSITIVE_PATTERN.test(text)) return false;
  return content.length >= 40 || attachmentText.length >= 8 || TEXT_NOTICE_STRONG_TITLE_PATTERN.test(title);
}

function buildTextNoticePost(fullPost, reason, candidateChecks = []) {
  return {
    ...fullPost,
    images: [],
    contentMode: "text_notice",
    noticeOnly: true,
    posterImageCheck: {
      rule: null,
      model: {
        isPoster: false,
        confidence: 0,
        reason,
        visualType: "missing",
        checkedAt: new Date().toISOString(),
        model: "none",
      },
      content: {
        isSameNotice: true,
        confidence: 0.5,
        decision: "text_notice",
        matchedFields: ["title", "source"],
        mismatchedFields: ["image"],
        posterTextSummary: "",
        reason: "Official notice is collected without a verified poster image",
        checkedAt: new Date().toISOString(),
        model: "none",
      },
      candidates: candidateChecks,
    },
  };
}

function getStaleNoticeReason(post) {
  const maxAgeDays = Number(process.env.CRAWLER_MAX_POST_AGE_DAYS ?? DEFAULT_MAX_POST_AGE_DAYS);
  const text = `${post?.title ?? ""} ${post?.content ?? ""}`.replace(/\s+/g, " ").trim();
  if (ALWAYS_OPEN_TEXT_PATTERN.test(text)) return null;

  const currentYear = new Date().getFullYear();
  const years = [...text.matchAll(/(?:^|[^\d])(20\d{2})\s*\uB144/g)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year));
  if (years.length > 0 && Math.max(...years) < currentYear - 1) {
    return `notice year is stale (${Math.max(...years)})`;
  }

  const rawDate = post?.date || post?.createdAt || post?.publishedAt;
  if (!rawDate || !Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return null;

  const postedAt = new Date(rawDate);
  if (Number.isNaN(postedAt.getTime())) return null;
  const ageDays = (Date.now() - postedAt.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > maxAgeDays ? `posted ${Math.round(ageDays)} days ago` : null;
}

function dropUndefinedValues(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}

function createCrawlStats() {
  return {
    found: 0,
    checked: 0,
    collected: 0,
    postFiltered: 0,
    detailFiltered: 0,
    noPosterImage: 0,
    imageRuleRejected: 0,
    verificationRejected: 0,
    textNoticeCollected: 0,
    skippedSeen: 0,
    detailFailed: 0,
    boardFailed: 0,
    skipReasons: {},
    skipSamples: [],
    latestPostFoundAt: null,
  };
}

function updateLatestPostFoundAt(stats, post) {
  const date = new Date(post?.date || post?.deadline || post?.crawledAt);
  if (Number.isNaN(date.getTime())) return;
  const iso = date.toISOString();
  if (!stats.latestPostFoundAt || iso > stats.latestPostFoundAt) {
    stats.latestPostFoundAt = iso;
  }
}

function rememberSkip(stats, bucket, post, reason) {
  stats.skipReasons[bucket] = (stats.skipReasons[bucket] ?? 0) + 1;
  if (stats.skipSamples.length >= 20) return;
  stats.skipSamples.push({
    bucket,
    title: String(post?.title ?? "").slice(0, 160),
    url: post?.url ?? post?.sourceUrl ?? null,
    reason: String(reason ?? "").slice(0, 300),
  });
}

function attachCrawlStats(posts, stats) {
  const rejected = stats.postFiltered
    + stats.detailFiltered
    + stats.noPosterImage
    + stats.imageRuleRejected
    + stats.verificationRejected;
  const failed = stats.detailFailed + stats.boardFailed;

  Object.defineProperty(posts, "crawlerStats", {
    enumerable: false,
    value: {
      ...stats,
      valid: stats.collected,
      rejected,
      duplicate: stats.skippedSeen,
      failed,
    },
  });
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
  const { maxPages = 3, dryRun = false, ignoreSeen = false } = options;
  const siteMaxPages = site.maxPages ?? maxPages;
  const seen = await loadSeen();
  const allPosts = [];
  const stats = createCrawlStats();
  const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 }); // 2초 간격

  logger.info(`━━━ Crawling: ${site.name} (${site.id}) ━━━`);

  for (const board of site.boards) {
    logger.info(`  Board: ${board.name} → ${board.url}`);

    await queue.add(async () => {
      try {
        // 1) 목록 페이지에서 게시물 링크 추출
        const boardMaxPages = board.maxPages ?? siteMaxPages;
        const posts = await adapter.parseList(board.url, site, boardMaxPages, board);
        stats.found += posts.length;
        stats.checked += posts.length;
        logger.info(`  Found ${posts.length} posts on list page`);

        // 2) 각 게시물 상세 페이지 파싱
        for (const post of posts) {
          updateLatestPostFoundAt(stats, post);

          if (!dryRun && !ignoreSeen && seen.has(post.url)) {
            stats.skippedSeen += 1;
            rememberSkip(stats, "seen", post, "already crawled in seen_urls");
            logger.info(`  Skip (seen): ${post.title}`);
            continue;
          }

          const postExclusion = getPostExclusionReason(post);
          if (postExclusion) {
            stats.postFiltered += 1;
            rememberSkip(stats, `post_filter:${postExclusion.rule}`, post, postExclusion.reason);
            if (!dryRun) seen.add(post.url);
            logger.info(`  Skip (post filter: ${postExclusion.rule}): ${post.title} — ${postExclusion.reason}`);
            continue;
          }

          if (dryRun) {
            logger.info(`  [DRY-RUN] Would fetch: ${post.title} — ${post.url}`);
            allPosts.push({ ...post, board: board.name, category: board.category, site: site.name, siteId: site.id });
            stats.collected += 1;
            continue;
          }

          await new Promise((r) => setTimeout(r, 1500)); // 1.5초 대기

          try {
            const detail = await adapter.parseDetail(post.url, site, board);
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
              stats.detailFiltered += 1;
              rememberSkip(stats, `detail_filter:${detailExclusion.rule}`, fullPost, detailExclusion.reason);
              seen.add(post.url);
              logger.info(`  Skip (detail filter: ${detailExclusion.rule}): ${post.title} - ${detailExclusion.reason}`);
              continue;
            }

            const staleReason = getStaleNoticeReason(fullPost);
            if (staleReason) {
              stats.detailFiltered += 1;
              rememberSkip(stats, "detail_filter:stale_notice", fullPost, staleReason);
              seen.add(post.url);
              logger.info(`  Skip (stale notice): ${post.title} - ${staleReason}`);
              continue;
            }

            if (!hasPosterImage(fullPost)) {
              if (isCollectableTextNotice(fullPost)) {
                allPosts.push(buildTextNoticePost(
                  fullPost,
                  "No poster image found; collected as text notice for admin review",
                ));
                stats.collected += 1;
                stats.textNoticeCollected += 1;
                seen.add(post.url);
                logger.info(`  OK text notice: ${post.title}`);
              } else {
                stats.noPosterImage += 1;
                rememberSkip(stats, "no_poster_image", fullPost, "no usable poster image found on detail page");
                if (shouldMarkImagelessSeen()) seen.add(post.url);
                logger.info(`  Skip (no poster image): ${post.title}`);
              }
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
              const bestRejected = imageSelection.candidates[0]?.rule;
              if (isCollectableTextNotice(fullPost)) {
                allPosts.push(buildTextNoticePost(
                  fullPost,
                  bestRejected?.reason ?? "No usable poster image; collected as text notice for admin review",
                ));
                stats.collected += 1;
                stats.textNoticeCollected += 1;
                seen.add(post.url);
                logger.info(`  OK text notice (image rules): ${post.title}`);
              } else {
                stats.imageRuleRejected += 1;
                if (shouldMarkImagelessSeen()) seen.add(post.url);
                rememberSkip(stats, "image_rules", fullPost, bestRejected?.reason ?? "no usable poster image");
                logger.info(`  Skip (image rules): ${post.title} — ${bestRejected?.reason ?? "no usable poster image"}`);
              }
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
              const bestRejected = verifiedImage.candidateChecks[0];
              const reason = bestRejected?.content?.reason ?? bestRejected?.model?.reason ?? "no poster image matched original notice";
              if (isCollectableTextNotice(fullPost)) {
                allPosts.push(buildTextNoticePost(fullPost, reason, verifiedImage.candidateChecks));
                stats.collected += 1;
                stats.textNoticeCollected += 1;
                seen.add(post.url);
                logger.info(`  OK text notice (image mismatch): ${post.title}`);
              } else {
                stats.verificationRejected += 1;
                if (shouldMarkImagelessSeen()) seen.add(post.url);
                rememberSkip(stats, "poster_content_mismatch", fullPost, reason);
                logger.info(`  Skip (poster/content mismatch): ${post.title} - ${reason}`);
              }
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
            stats.collected += 1;
            seen.add(post.url);
            logger.info(`  OK ${post.title} [rule ${verifiedImage.selectedRule?.score ?? 0}]${verifiedImage.imageClassification?.model !== "none" ? ` [poster ${Math.round(verifiedImage.imageClassification.confidence * 100)}%]` : ""}${verifiedImage.contentVerification?.model !== "none" ? ` [match ${Math.round(verifiedImage.contentVerification.confidence * 100)}%]` : ""}`);
          } catch (err) {
            stats.detailFailed += 1;
            rememberSkip(stats, "detail_failed", post, err.message);
            logger.error(`  ✗ Detail parse failed: ${post.url} — ${err.message}`);
          }
        }
      } catch (err) {
        stats.boardFailed += 1;
        rememberSkip(stats, "board_failed", { title: board.name, url: board.url }, err.message);
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
  attachCrawlStats(allPosts, stats);
  return allPosts;
}
