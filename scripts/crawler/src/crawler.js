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
import { classifyPosterImageClip } from "./poster-clip-classifier.js";
import { extractPosterOcrText } from "./poster-ocr.js";
import { verifyPosterMatchesNotice } from "./poster-content-verifier.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";
import { selectBestPosterImage } from "./poster-image-rules.js";
import { analyzePostAttachments } from "./attachment-text-extractor.js";
import { mergeAttachmentImageCandidates } from "./attachment-image-candidates.js";
import { evaluateRelevanceHeuristic } from "./relevance-heuristic.js";
import { extractAiUsageMetadata } from "./ai-usage-logger.js";

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

function serializeAiUsageEvent(result, metadata = {}) {
  const usage = extractAiUsageMetadata(result);
  if (!usage?.model || !usage.operation) return null;

  return {
    model: usage.model,
    operation: usage.operation,
    fieldKey: usage.fieldKey ?? null,
    stageLabel: usage.stageLabel ?? "cheap_text",
    status: usage.status ?? "success",
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    imageCount: usage.imageCount ?? 0,
    metadata: {
      ...metadata,
      ...(usage.metadata ?? {}),
    },
  };
}

function collectAiUsageEvents({ candidateChecks = [], ocrResult = null, selectedImageUrl = null } = {}) {
  const events = [];
  for (const [index, check] of candidateChecks.entries()) {
    const baseMetadata = {
      imageUrl: check.imageUrl,
      candidateIndex: index,
      selected: Boolean(selectedImageUrl && check.imageUrl === selectedImageUrl),
    };
    const classificationEvent = serializeAiUsageEvent(check.model, {
      ...baseMetadata,
      source: "poster_image_classification",
    });
    const contentEvent = serializeAiUsageEvent(check.content, {
      ...baseMetadata,
      source: "poster_content_verification",
    });
    if (classificationEvent) events.push(classificationEvent);
    if (contentEvent) events.push(contentEvent);
  }

  const ocrEvent = serializeAiUsageEvent(ocrResult, {
    imageUrl: selectedImageUrl,
    source: "poster_ocr",
    selected: true,
  });
  if (ocrEvent) events.push(ocrEvent);

  return events;
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
const LOCAL_SCHOLARSHIP_TEXT_NOTICE_SOURCE_PATTERN = /(?:mapo-scholarship|mapojh\.or\.kr|\uB9C8\uD3EC\uC778\uC7AC\uC721\uC131\uC7A5\uD559\uC7AC\uB2E8)/i;
const LOCAL_SCHOLARSHIP_TEXT_NOTICE_SIGNAL_PATTERN = /(?:\uC7A5\uD559(?:\uC0DD|\uAE08)?).*(?:\uC120\uBC1C|\uBAA8\uC9D1|\uC811\uC218|\uC2E0\uCCAD|\uC9C0\uC6D0\s*\uB300\uC0C1)|(?:\uC120\uBC1C|\uBAA8\uC9D1|\uC811\uC218|\uC2E0\uCCAD|\uC9C0\uC6D0\s*\uB300\uC0C1).*(?:\uC7A5\uD559(?:\uC0DD|\uAE08)?)/i;
const SCHOLARSHIP_RESULT_OR_CEREMONY_PATTERN = /\uACB0\uACFC|\uBC1C\uD45C|\uBA85\uB2E8|\uC218\uC5EC\uC2DD/i;
const SEOUL_TEXT_NOTICE_SOURCE_PATTERN = /(?:seoul-city|www\.seoul\.go\.kr\/news\/news_notice\.do|news\.seoul\.go\.kr)/i;
const SEOUL_TEXT_NOTICE_TITLE_PATTERN = /\uBAA8\uC9D1|\uC2E0\uCCAD|\uC811\uC218|\uACF5\uBAA8|\uCD94\uCC9C|\uC9C0\uC6D0\s*\uC0AC\uC5C5|\uC9C0\uC6D0\uC0AC\uC5C5|\uC218\uAC15\uC0DD|\uAD50\uC721\uC0DD|\uCC38\uC5EC\uC790|\uCC38\uAC00\uC790|\uC11C\uC6B8\uB18D\uC7A5/i;
const SEOUL_TEXT_NOTICE_DETAIL_PATTERN = /(?:\uBAA8\uC9D1|\uC2E0\uCCAD|\uC811\uC218|\uC81C\uCD9C)\s*(?:\uAE30\uAC04|\uBC29\uBC95|\uC11C\uB958)|\uC2E0\uCCAD\s*\uB300\uC0C1|\uBAA8\uC9D1\s*\uB300\uC0C1|\uC811\uC218\uCC98|\uB9C8\uAC10|\uC120\uCC29\uC21C/i;
const SEOUL_TEXT_NOTICE_ADMIN_PATTERN = /\uD589\uC815\uCC98\uBD84|\uACF5\uC2DC\uC1A1\uB2EC|\uBB34\uC5F0\uACE0|\uB4F1\uB85D\s*\uB9D0\uC18C|\uACFC\uD0DC\uB8CC|\uC5C5\uBB34\s*\uC815\uC9C0|\uB3C4\uC2DC\uAD00\uB9AC\uACC4\uD68D|CCTV|\uC601\uC5C5\uC815\uC9C0|\uCCAD\uBB38/i;

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

function isLocalScholarshipTextNotice(post, text) {
  if (SCHOLARSHIP_RESULT_OR_CEREMONY_PATTERN.test(text)) return false;

  const sourceText = [
    post?.site,
    post?.siteId,
    post?.collectionSourceSlug,
    post?.sourceUrl,
    post?.url,
  ].filter(Boolean).join(" ");

  return LOCAL_SCHOLARSHIP_TEXT_NOTICE_SOURCE_PATTERN.test(sourceText)
    && LOCAL_SCHOLARSHIP_TEXT_NOTICE_SIGNAL_PATTERN.test(text);
}

function getSourceText(post) {
  return [
    post?.site,
    post?.siteId,
    post?.collectionSourceSlug,
    post?.sourceUrl,
    post?.url,
  ].filter(Boolean).join(" ");
}

function isSeoulTextNotice(post, title, text) {
  if (!SEOUL_TEXT_NOTICE_SOURCE_PATTERN.test(getSourceText(post))) return null;
  if (SEOUL_TEXT_NOTICE_ADMIN_PATTERN.test(title)) return false;
  return SEOUL_TEXT_NOTICE_TITLE_PATTERN.test(title)
    && SEOUL_TEXT_NOTICE_DETAIL_PATTERN.test(text);
}

export function isCollectableTextNotice(post) {
  if (!shouldCollectTextNotices()) return false;
  const title = String(post?.title ?? "").replace(/\s+/g, " ").trim();
  const content = String(post?.content ?? "").replace(/\s+/g, " ").trim();
  const attachmentText = Array.isArray(post?.attachments)
    ? post.attachments.map((attachment) => attachment?.name).filter(Boolean).join(" ")
    : "";
  const text = `${title} ${content} ${attachmentText}`;
  const localScholarshipText = isLocalScholarshipTextNotice(post, text);
  const seoulTextNotice = isSeoulTextNotice(post, title, text);

  if (title.length < 8) return false;
  if (seoulTextNotice === false) return false;
  if (TEXT_NOTICE_NEGATIVE_PATTERN.test(text) && !isCentralTextNotice(post, text)) return false;
  if (!TEXT_NOTICE_POSITIVE_PATTERN.test(text) && !localScholarshipText) return false;
  return content.length >= 40
    || attachmentText.length >= 8
    || TEXT_NOTICE_STRONG_TITLE_PATTERN.test(title)
    || localScholarshipText;
}

function buildTextNoticePost(fullPost, reason, candidateChecks = []) {
  return {
    ...fullPost,
    images: [],
    aiUsageEvents: collectAiUsageEvents({ candidateChecks }),
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
  if (years.length > 0 && isLocalScholarshipTextNotice(post, text) && Math.max(...years) < currentYear) {
    return `scholarship notice year is stale (${Math.max(...years)})`;
  }
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
    attachmentAnalyzed: 0,
    attachmentTextExtracted: 0,
    attachmentUnsupported: 0,
    attachmentFailed: 0,
    externalOriginalAttempted: 0,
    externalOriginalResolved: 0,
    externalOriginalFailed: 0,
    skippedSeen: 0,
    detailFailed: 0,
    boardFailed: 0,
    skipReasons: {},
    attachmentFailureCodes: {},
    skipSamples: [],
    attachmentSamples: [],
    externalOriginalSamples: [],
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

function rememberExternalOriginal(stats, post, trace) {
  if (!trace?.attempted) return;
  stats.externalOriginalAttempted += 1;
  if (trace.resolved) {
    stats.externalOriginalResolved += 1;
  } else {
    stats.externalOriginalFailed += 1;
  }

  if (stats.externalOriginalSamples.length >= 20) return;
  stats.externalOriginalSamples.push({
    title: String(post?.title ?? "").slice(0, 160),
    resolved: Boolean(trace.resolved),
    reason: String(trace.reason ?? "").slice(0, 120),
    label: String(trace.label ?? "").slice(0, 120),
    originalUrl: trace.originalUrl ?? null,
    viaUrl: trace.viaUrl ?? post?.url ?? post?.sourceUrl ?? null,
  });
}

function rememberAttachmentAnalysis(stats, post, analysis) {
  if (!analysis?.checked) return;

  stats.attachmentAnalyzed += Number(analysis.checked ?? 0);
  stats.attachmentTextExtracted += Number(analysis.extracted ?? 0);
  stats.attachmentUnsupported += Number(analysis.unsupported ?? 0);
  stats.attachmentFailed += Number(analysis.failed ?? 0);

  for (const source of analysis.sources ?? []) {
    if (source.failureCode) {
      stats.attachmentFailureCodes[source.failureCode] = (stats.attachmentFailureCodes[source.failureCode] ?? 0) + 1;
    }
    if (stats.attachmentSamples.length >= 20) return;
    stats.attachmentSamples.push({
      title: String(post?.title ?? "").slice(0, 160),
      name: String(source.name ?? "").slice(0, 160),
      url: source.url ?? null,
      kind: String(source.kind ?? "").slice(0, 40),
      status: String(source.status ?? "").slice(0, 40),
      reason: String(source.reason ?? "").slice(0, 240),
      failureCode: String(source.failureCode ?? "").slice(0, 80) || null,
      textLength: Number(source.textLength ?? 0),
    });
  }
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

  const selected = imageSelection?.selectedImageUrl
    ? candidatesByUrl.get(imageSelection.selectedImageUrl)
    : null;
  const remaining = [...candidatesByUrl.values()]
    .filter((candidate) => candidate.imageUrl !== selected?.imageUrl)
    .sort((a, b) => (b.rule?.score ?? 0) - (a.rule?.score ?? 0));

  return [...(selected ? [selected] : []), ...remaining].slice(
    0,
    MAX_VERIFIED_IMAGE_CANDIDATES,
  );
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
    // SNS_INGESTION.md Phase 2 Stage 2 — 로컬 CLIP으로 값싸게 1차 선별.
    // CLIP이 "확실히 아니다"라고 판단한 경우에만 유료 GPT Vision 호출을 건너뛴다.
    const clipTriage = await classifyPosterImageClip(candidate.imageUrl);

    let imageClassification;
    if (!clipTriage.isPosterLayout) {
      imageClassification = {
        isPoster: false,
        confidence: clipTriage.confidence,
        reason: `CLIP triage: ${clipTriage.reason}`,
        visualType: clipTriage.bestLabel,
        checkedAt: new Date().toISOString(),
        model: `clip:${clipTriage.model}`,
      };
    } else {
      imageClassification = await classifyPosterImage(candidate.imageUrl, {
        ...baseContext,
        rule: candidate.rule,
      });
    }

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
            rememberExternalOriginal(stats, post, detail.externalOriginal);
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
            const mergedAttachmentImages = mergeAttachmentImageCandidates(
              fullPost.images,
              fullPost.attachments,
              fullPost.sourceUrl || fullPost.url,
            );
            const addedAttachmentImage = mergedAttachmentImages.images.some(
              (imageUrl) => !fullPost.images.includes(imageUrl),
            );
            if (mergedAttachmentImages.attachmentCandidates.length > 0) {
              fullPost.images = mergedAttachmentImages.images;
              fullPost.attachmentImageCandidates = mergedAttachmentImages.attachmentCandidates;
              fullPost.preferredImageUrls = mergedAttachmentImages.attachmentImageUrls;
            }
            if (addedAttachmentImage) {
              fullPost.posterImageRule = null;
              fullPost.posterImageCandidates = null;
            }
            const detailExclusion = getPostExclusionReason(fullPost);
            if (detailExclusion) {
              stats.detailFiltered += 1;
              rememberSkip(stats, `detail_filter:${detailExclusion.rule}`, fullPost, detailExclusion.reason);
              seen.add(post.url);
              logger.info(`  Skip (detail filter: ${detailExclusion.rule}): ${post.title} - ${detailExclusion.reason}`);
              continue;
            }

            if (board.analyzeAttachments !== false && site.analyzeAttachments !== false) {
              const attachmentAnalysis = await analyzePostAttachments(fullPost);
              rememberAttachmentAnalysis(stats, fullPost, attachmentAnalysis);
              if (attachmentAnalysis.contentAdded) {
                fullPost.content = [fullPost.content, attachmentAnalysis.addedText].filter(Boolean).join("\n\n");
                fullPost.attachmentAnalysis = attachmentAnalysis;
                if (!fullPost.deadline && attachmentAnalysis.suggestedDeadline) {
                  fullPost.deadline = attachmentAnalysis.suggestedDeadline;
                }
              } else if (attachmentAnalysis.checked > 0) {
                fullPost.attachmentAnalysis = attachmentAnalysis;
              }
            }

            const staleReason = getStaleNoticeReason(fullPost);
            if (staleReason) {
              stats.detailFiltered += 1;
              rememberSkip(stats, "detail_filter:stale_notice", fullPost, staleReason);
              seen.add(post.url);
              logger.info(`  Skip (stale notice): ${post.title} - ${staleReason}`);
              continue;
            }

            // SNS_INGESTION.md Phase 2 Stage 1 — 휴리스틱 정규식 관련성 분류.
            // 인사말/축하 등으로 확정되면 즉시 폐기하고, 그 외에는 Stage 4 LLM 라우터가
            // 참고할 수 있도록 힌트만 붙여 계속 진행한다(휴리스틱은 여기서 공고를 확정할 뿐
            // 폐기 외에는 파이프라인을 막지 않는다 — 이미지/업로드 단계는 기존과 동일하게 진행).
            const relevanceHeuristic = evaluateRelevanceHeuristic(fullPost);
            if (relevanceHeuristic.route === "폐기") {
              stats.detailFiltered += 1;
              rememberSkip(stats, `detail_filter:relevance_heuristic:${relevanceHeuristic.matchedRule}`, fullPost, relevanceHeuristic.reason);
              seen.add(post.url);
              logger.info(`  Skip (relevance heuristic: ${relevanceHeuristic.matchedRule}): ${post.title} - ${relevanceHeuristic.reason}`);
              continue;
            }
            fullPost.relevanceHeuristic = relevanceHeuristic;

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
                  preferredImageUrls: fullPost.preferredImageUrls,
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

            // SNS_INGESTION.md Phase 2 Stage 3 — 최종 선택된 대표 이미지 1장에 대해서만 OCR.
            const ocrResult = await extractPosterOcrText(verifiedImage.selectedImageUrl);

            const verifiedPost = {
              ...fullPost,
              images: orderImagesWithSelected(fullPost.images, verifiedImage.selectedImageUrl),
              imageClassification: verifiedImage.imageClassification,
              posterContentVerification: verifiedImage.contentVerification,
              posterImageCheck,
              posterOcr: ocrResult,
              aiUsageEvents: collectAiUsageEvents({
                candidateChecks: verifiedImage.candidateChecks,
                ocrResult,
                selectedImageUrl: verifiedImage.selectedImageUrl,
              }),
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
