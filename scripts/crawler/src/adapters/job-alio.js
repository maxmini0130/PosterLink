import { fetchPage } from "../crawler.js";

const BASE_URL = "https://job.alio.go.kr";
const LIST_URL = `${BASE_URL}/recruit.do`;
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

function extractLabelDate(text, label) {
  const pattern = new RegExp(`${label}\\s*:\\s*([^\\n]+)`);
  const match = String(text ?? "").match(pattern);
  return normalizeDate(match?.[1]);
}

function extractLabelDeadline(text, label) {
  const pattern = new RegExp(`${label}\\s*:\\s*([^\\n]+)`);
  const match = String(text ?? "").match(pattern);
  return extractDeadline(match?.[1]);
}

function buildPageUrl(boardUrl, page) {
  if (page === 1) return boardUrl;
  const url = new URL(boardUrl);
  url.searchParams.set("pageNo", String(page));
  return url.href;
}

function appendLine(lines, label, value) {
  const text = compactText(value);
  if (!text) return;
  lines.push(`${label}: ${text}`);
}

function getCellTexts($, row) {
  return $(row).find("td").map((_, cell) => compactText($(cell).text())).get();
}

function extractIdx(value) {
  try {
    return new URL(value, BASE_URL).searchParams.get("idx");
  } catch {
    return null;
  }
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe, nav, header, footer, .btn_register, img").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, h2, h3, h4, table").each((_, child) => {
    $(child).append("\n");
  });

  return cleanText($copy.text());
}

function dedupeLines(text) {
  const seen = new Set();
  const lines = [];

  for (const line of cleanText(text).split("\n")) {
    const normalized = compactText(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    lines.push(line.trim());
  }

  return lines.join("\n");
}

function collectTableLines($, root) {
  const lines = [];

  $(root).find("table").each((_, table) => {
    $(table).find("tr").each((__, row) => {
      const cells = $(row).find("th,td").map((___, cell) => compactText($(cell).text())).get();
      if (cells.length === 0) return;

      if (cells.length === 1) {
        appendLine(lines, "항목", cells[0]);
        return;
      }

      for (let index = 0; index < cells.length; index += 2) {
        const label = cells[index];
        const value = cells[index + 1];
        if (label && value) appendLine(lines, label, value);
      }
    });
  });

  return lines;
}

function collectSectionLines($, root) {
  const lines = [];

  $(root).find("#tab-1 h4").each((_, heading) => {
    const label = compactText($(heading).text());
    const value = readableText($, $(heading).next("p"));
    appendLine(lines, label, value);
  });

  return lines;
}

function collectAttachments($, root, postUrl) {
  const attachments = [];
  const seen = new Set();

  $(root).find("a[href]").each((_, link) => {
    const href = $(link).attr("href") || "";
    const text = compactText($(link).text() || $(link).attr("title"));
    if (!href || /^javascript:/i.test(href)) return;

    const isDownload = /download|fileNo=|\.hwp|\.hwpx|\.pdf|\.docx?|\.xlsx?|\.zip/i.test(href + " " + text);
    const isOfficialNotice = /^https?:\/\//i.test(href) && text === href;
    if (!isDownload && !isOfficialNotice) return;

    const url = resolveUrl(postUrl, href);
    if (seen.has(url)) return;
    seen.add(url);

    attachments.push({
      name: isOfficialNotice ? "공고 URL" : text || `첨부파일 ${attachments.length + 1}`,
      url,
    });
  });

  return attachments;
}

function buildListContent(cells) {
  const lines = [];
  appendLine(lines, "기관명", cells[3]);
  appendLine(lines, "근무지", cells[4]);
  appendLine(lines, "고용형태", cells[5]);
  appendLine(lines, "등록일", normalizeDate(cells[6]) ?? cells[6]);
  appendLine(lines, "마감일", extractDeadline(cells[7]) ?? cells[7]);
  appendLine(lines, "상태", cells[8]);
  return lines.join("\n");
}

export default {
  name: "job-alio",

  async parseList(boardUrl, site = {}, maxPages = 3, board = {}) {
    const pageLimit = Number(board.maxPages ?? site.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildPageUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      $("a[href*='recruitview.do?idx=']").each((_, link) => {
        const $link = $(link);
        const title = compactText($link.text());
        const href = $link.attr("href");
        if (!title || !href) return;

        const url = resolveUrl(pageUrl, href);
        const idx = extractIdx(url);
        if (!idx) return;

        const $row = $link.closest("tr");
        const cells = getCellTexts($, $row);
        const date = normalizeDate(cells[6]) ?? "";
        const deadline = extractDeadline(cells[7]);

        pagePosts.push({
          title,
          url,
          sourceUrl: url,
          date,
          deadline,
          content: buildListContent(cells),
          images: [],
          attachments: [],
        });
      });

      posts.push(...pagePosts);
      if (pagePosts.length === 0) break;
    }

    return [...new Map(posts.map((post) => [post.url, post])).values()];
  },

  async parseDetail(postUrl) {
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    const $root = $("#txt").first().length ? $("#txt").first() : $("body").first();
    const orgName = compactText($root.find(".topInfo h2").first().text());
    const title = compactText($root.find(".titleH2").first().text() || $root.find(".titleH2").first().attr("title"));
    const bodyText = readableText($, $root);
    const tableLines = collectTableLines($, $root);
    const sectionLines = collectSectionLines($, $root);
    const attachments = collectAttachments($, $root, postUrl);
    const content = dedupeLines([
      orgName ? `기관명: ${orgName}` : "",
      tableLines.join("\n"),
      sectionLines.join("\n"),
      bodyText,
    ].filter(Boolean).join("\n\n"));

    return {
      title: title || undefined,
      content: content || undefined,
      date: extractLabelDate(content, "등록일") ?? normalizeDate(content) ?? undefined,
      deadline: extractLabelDeadline(content, "채용기간") ?? extractLabelDeadline(content, "마감일") ?? extractDeadline(content),
      images: [],
      attachments,
      sourceUrl: postUrl,
    };
  },
};
