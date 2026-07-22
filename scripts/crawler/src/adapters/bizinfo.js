import { fetchPage } from "../crawler.js";

const BASE_URL = "https://www.bizinfo.go.kr";
const LIST_URL = `${BASE_URL}/sii/siia/selectSIIA200View.do?null=&rows=15&cpage=1`;
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

function extractDates(value) {
  FULL_DATE_PATTERN.lastIndex = 0;
  return [...String(value ?? "").matchAll(FULL_DATE_PATTERN)]
    .map((match) => {
      const year = normalizeYear(match[1]);
      if (!year) return null;
      return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    })
    .filter(Boolean);
}

function extractDeadline(value) {
  const dates = extractDates(value);
  return dates[dates.length - 1] ?? null;
}

function buildPageUrl(boardUrl, page) {
  const base = /selectSIIA200View\.do/i.test(boardUrl) ? boardUrl : LIST_URL;
  const url = new URL(base, BASE_URL);
  url.searchParams.set("rows", url.searchParams.get("rows") || "15");
  url.searchParams.set("cpage", String(page));
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

function buildListContent(cells) {
  const lines = [];
  appendLine(lines, "지원분야", cells[1]);
  appendLine(lines, "신청기간", cells[3]);
  appendLine(lines, "소관부처·지자체", cells[4]);
  appendLine(lines, "사업수행기관", cells[5]);
  appendLine(lines, "등록일", normalizeDate(cells[6]) ?? cells[6]);
  appendLine(lines, "조회수", cells[7]);
  return lines.join("\n");
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe, nav, header, footer, .btn_area2, .hashtags_modal, .satisfaction, img").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section, h3, h4, h5").each((_, child) => {
    $(child).append("\n");
  });
  return cleanText($copy.text());
}

function collectFieldLines($, root) {
  const lines = [];
  const fields = [];

  $(root).find(".view_cont li").each((_, item) => {
    const label = compactText($(item).find(".s_title").first().text());
    const value = readableText($, $(item).find(".txt").first());
    if (!label || !value) return;

    lines.push(`${label}: ${compactText(value)}`);
    fields.push({ label, value });
  });

  return { lines, fields };
}

function collectAttachments($, root, postUrl) {
  const attachments = [];
  const seen = new Set();

  $(root).find(".attached_file_list a[href]").each((_, link) => {
    const href = $(link).attr("href") || "";
    if (!/\/cmm\/fms\/fileDown\.do/i.test(href)) return;

    const url = resolveUrl(postUrl, href);
    if (seen.has(url)) return;
    seen.add(url);

    const $row = $(link).closest("li");
    const name = compactText($row.find(".file_name").first().text())
      || compactText($(link).text())
      || `첨부파일 ${attachments.length + 1}`;
    attachments.push({ name, url });
  });

  const sourceLink = $(root).find("a[href^='http']").filter((_, link) => /출처\s*바로가기/.test(compactText($(link).text()))).first();
  if (sourceLink.length) {
    const url = sourceLink.attr("href");
    if (url && !seen.has(url)) {
      seen.add(url);
      attachments.push({ name: "출처 바로가기", url });
    }
  }

  return attachments;
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

function findField(fields, pattern) {
  return fields.find((field) => pattern.test(field.label))?.value ?? "";
}

function extractRegisteredDate($, root) {
  const titleAreaText = compactText($(root).find(".title_area").first().text());
  const metaText = compactText($(root).find("ul").first().text());
  return normalizeDate(titleAreaText) ?? normalizeDate(metaText);
}

export default {
  name: "bizinfo",

  async parseList(boardUrl, site = {}, maxPages = 2, board = {}) {
    const pageLimit = Number(board.maxPages ?? site.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildPageUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      $("table tbody tr").each((_, row) => {
        const $link = $(row).find("a[href*='selectSIIA200Detail.do']").first();
        const title = compactText($link.text());
        const href = $link.attr("href");
        if (!title || !href) return;

        const cells = getCellTexts($, row);
        const url = resolveUrl(pageUrl, href);
        pagePosts.push({
          title,
          url,
          sourceUrl: url,
          date: normalizeDate(cells[6]) ?? "",
          deadline: extractDeadline(cells[3]),
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

    const $root = $(".support_project_detail").first().length
      ? $(".support_project_detail").first()
      : $("body").first();
    const title = compactText($root.find(".title_area .title").first().text())
      || compactText($("title").first().text());
    const { lines: fieldLines, fields } = collectFieldLines($, $root);
    const bodyText = readableText($, $root.find(".view_cont").first().length ? $root.find(".view_cont").first() : $root);
    const attachments = collectAttachments($, $root, postUrl);
    const content = dedupeLines([
      fieldLines.join("\n"),
      fieldLines.length === 0 ? bodyText : "",
    ].filter(Boolean).join("\n\n"));
    const applicationPeriod = findField(fields, /신청\s*기간/);

    return {
      title: title || undefined,
      content: content || undefined,
      date: extractRegisteredDate($, $root) ?? undefined,
      deadline: extractDeadline(applicationPeriod || content),
      images: [],
      attachments,
      sourceUrl: postUrl,
    };
  },
};
