import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";
import genericBoard from "./generic-board.js";

const FULL_DATE_PATTERN = /(\d{2,4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?/g;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactText(value) {
  return cleanText(value).replace(/\s+/g, " ").trim();
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (String(value).length === 2) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function normalizeDateMatch(match) {
  const year = normalizeYear(match?.[1]);
  if (!year || !match?.[2] || !match?.[3]) return null;
  return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function extractDates(value) {
  FULL_DATE_PATTERN.lastIndex = 0;
  return [...String(value ?? "").matchAll(FULL_DATE_PATTERN)]
    .map(normalizeDateMatch)
    .filter(Boolean);
}

function normalizeDate(value) {
  return extractDates(value)[0] ?? null;
}

function extractDeadline(value) {
  const text = String(value ?? "");
  const recruitmentSegment = text.match(/(?:모집|접수|신청)\s*기간[\s\S]{0,180}/i)?.[0] ?? "";
  const dates = extractDates(recruitmentSegment || text);
  return dates.length > 1 ? dates[dates.length - 1] : null;
}

function readableText($, element) {
  if (!element?.length) return "";
  const $copy = element.clone();
  $copy.find("script, style, noscript, iframe, .btnArea, .rd_nav, .rd_ft, .sns, .tag, .reply, .comment, .bd_lst, .bd_pg, .bd_tb").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section, article").each((_, child) => {
    $(child).append("\n");
  });
  return cleanText($copy.text());
}

function isLikelyContentImage(src) {
  if (!src) return false;
  return !/logo|icon|btn|banner|menu_button|sns|facebook|twitter|kakao|search|file\.gif|sprite|favicon|wa[_-]?mark|web[_-]?access|cert/i.test(src);
}

function addImage(images, baseUrl, src) {
  if (!isLikelyContentImage(src)) return;
  const imageUrl = resolveUrl(baseUrl, src);
  if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
}

function collectImages($, postUrl) {
  const images = [];
  $(".rd_body img, article img").each((_, img) => {
    addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
  });
  return images;
}

function collectAttachments($, postUrl) {
  const attachments = [];
  const seen = new Set();

  $("a[href*='procFileDownload']").each((_, link) => {
    const href = $(link).attr("href");
    const name = compactText($(link).text()) || $(link).attr("title") || href;
    if (!href || !name || /^첨부$|^전체\s*다운로드/i.test(name)) return;

    const url = resolveUrl(postUrl, href);
    if (seen.has(url)) return;
    seen.add(url);
    attachments.push({ name, url });
  });

  return attachments;
}

function buildContent(title, bodyText, attachments) {
  const lines = [];
  if (bodyText) lines.push(bodyText);
  if (!bodyText && title) lines.push(title);
  if (attachments.length > 0) {
    lines.push(`첨부파일: ${attachments.map((attachment) => attachment.name).join(", ")}`);
  }
  return cleanText(lines.join("\n\n"));
}

export default {
  name: "mapo-employ",

  async parseList(boardUrl, site = {}, maxPages = 2, board = {}) {
    return genericBoard.parseList(boardUrl, site, maxPages, board);
  },

  async parseDetail(postUrl, site = {}) {
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    const title = compactText($("h1.np_18px").first().text());
    const headerText = compactText($(".rd_hd").first().text() || $(".board").first().text());
    const bodyRoot = $(".rd_body .xe_content").first().length
      ? $(".rd_body .xe_content").first()
      : $(".rd_body article").first().length
        ? $(".rd_body article").first()
        : $(".rd_body").first();
    const bodyText = readableText($, bodyRoot);
    const images = collectImages($, postUrl);
    const attachments = collectAttachments($, postUrl);
    const content = buildContent(title, bodyText, attachments);
    const posterImages = await filterAndOrderPosterImages(images, {
      title,
      content,
      site: site.name ?? "마포구고용복지지원센터",
      sourceUrl: postUrl,
    });

    return {
      title: title || undefined,
      content: content || undefined,
      date: normalizeDate(headerText) ?? normalizeDate(content) ?? undefined,
      deadline: extractDeadline(content),
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
