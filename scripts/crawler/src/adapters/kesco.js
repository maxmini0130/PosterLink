import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const BASE_URL = "https://www.kesco.or.kr";
const DEFAULT_BBS_CODE = "MKB00001";
const FULL_DATE_PATTERN = /(\d{2,4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/g;

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

function normalizeDate(value) {
  FULL_DATE_PATTERN.lastIndex = 0;
  const match = FULL_DATE_PATTERN.exec(String(value ?? ""));
  if (!match) return null;

  const year = normalizeYear(match[1]);
  if (!year) return null;
  return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function extractDeadline(value) {
  const rangeWithShortEnd = String(value ?? "").match(
    /(\d{2,4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\s*\.?\s*(?:~|-|–|—)\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/
  );
  if (rangeWithShortEnd) {
    const year = normalizeYear(rangeWithShortEnd[1]);
    if (year) {
      return `${year}-${rangeWithShortEnd[4].padStart(2, "0")}-${rangeWithShortEnd[5].padStart(2, "0")}`;
    }
  }

  FULL_DATE_PATTERN.lastIndex = 0;
  const dates = [...String(value ?? "").matchAll(FULL_DATE_PATTERN)]
    .map((match) => {
      const year = normalizeYear(match[1]);
      if (!year) return null;
      return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    })
    .filter(Boolean);

  return dates[dates.length - 1] ?? null;
}

function bbsCodeFromUrl(url) {
  try {
    return new URL(url).searchParams.get("bbs_code") || DEFAULT_BBS_CODE;
  } catch {
    return DEFAULT_BBS_CODE;
  }
}

function buildListUrl(boardUrl, page) {
  const url = new URL(boardUrl, BASE_URL);
  if (!url.searchParams.get("bbs_code")) url.searchParams.set("bbs_code", DEFAULT_BBS_CODE);
  if (page > 1) url.searchParams.set("currentPage", String(page));
  return url.href;
}

function buildDetailUrl(boardUrl, bbsSeq) {
  const url = new URL("/bbs/selectBbs.do", BASE_URL);
  url.searchParams.set("bbs_code", bbsCodeFromUrl(boardUrl));
  url.searchParams.set("bbs_seq", bbsSeq);
  return url.href;
}

function extractDetailId(onclick) {
  return String(onclick ?? "").match(/fnDetail\(\s*['"]?(\d+)['"]?/i)?.[1] ?? null;
}

function extractFileId(onclick) {
  return String(onclick ?? "").match(/fnDownload\(\s*['"]([^'"]+)['"]/i)?.[1] ?? null;
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe, nav, header, footer, .btn_area, .file_list, .info_area").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section").each((_, child) => {
    $(child).append("\n");
  });
  return cleanText($copy.text());
}

function collectAttachments($) {
  const attachments = [];
  const seen = new Set();

  $("a[onclick*='fnDownload']").each((_, link) => {
    const fileId = extractFileId($(link).attr("onclick"));
    const name = compactText($(link).text());
    if (!fileId || !name || name === "미리보기") return;

    const url = `${BASE_URL}/common/file/FileDown.do?file_id=${encodeURIComponent(fileId)}`;
    if (seen.has(url)) return;
    seen.add(url);
    attachments.push({ name, url });
  });

  return attachments;
}

function isLikelyContentImage(src) {
  if (!src) return false;
  return !/logo|icon|btn|banner|sns|facebook|twitter|wa[_-]?mark|web[_-]?access|cert|favicon|default\.png/i.test(src);
}

function addImage(images, baseUrl, src) {
  if (!isLikelyContentImage(src)) return;
  const imageUrl = resolveUrl(baseUrl, src);
  if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
}

function collectImages($, postUrl) {
  const images = [];
  $(".board_view_con img, .editor_view img").each((_, img) => {
    addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
  });
  return images;
}

export default {
  name: "kesco",

  async parseList(boardUrl, _site = {}, maxPages = 2, board = {}) {
    const pageLimit = Number(board.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildListUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      $("table.board_list tbody tr, .board_list tbody tr").each((_, row) => {
        const $row = $(row);
        const $link = $row.find("a[onclick*='fnDetail']").first();
        const bbsSeq = extractDetailId($link.attr("onclick"));
        const title = compactText($link.text());
        if (!bbsSeq || !title) return;

        const cells = $row.find("td").map((__, cell) => compactText($(cell).text())).get();
        const date = normalizeDate(cells[3] ?? $row.text()) ?? "";
        const detailUrl = buildDetailUrl(boardUrl, bbsSeq);
        pagePosts.push({
          title,
          url: detailUrl,
          sourceUrl: detailUrl,
          date,
          content: [
            cells[0] ? `번호: ${cells[0]}` : "",
            date ? `작성일: ${date}` : "",
          ].filter(Boolean).join("\n"),
          images: [],
          attachments: [],
        });
      });

      posts.push(...pagePosts);
      if (pagePosts.length === 0) break;
    }

    return [...new Map(posts.map((post) => [post.url, post])).values()];
  },

  async parseDetail(postUrl, site = {}) {
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    const title = compactText($(".board_view_top .tit").first().text() || $("h3.tit").first().text());
    const infoText = compactText($(".board_view_top .info_area").first().text());
    const content = readableText($, $(".board_view_con .editor_view").first().length
      ? $(".board_view_con .editor_view").first()
      : $(".board_view_con").first());
    const images = collectImages($, postUrl);
    const attachments = collectAttachments($);
    const posterImages = await filterAndOrderPosterImages(images, {
      title,
      content,
      site: site.name ?? "한국전기안전공사",
      sourceUrl: postUrl,
    });

    return {
      title: title || undefined,
      content: content || undefined,
      date: normalizeDate(infoText) ?? normalizeDate(content) ?? undefined,
      deadline: extractDeadline(content),
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
