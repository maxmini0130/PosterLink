import { fetchPage } from "../crawler.js";

const BASE_URL = "https://www.k-startup.go.kr";
const LIST_URL = `${BASE_URL}/web/contents/bizpbanc-ongoing.do`;
const DATE_PATTERN = /(20\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/g;

const LIST_LABELS = {
  category: "\uC9C0\uC6D0\uBD84\uC57C",
  dday: "\uB9C8\uAC10\uC0C1\uD0DC",
  program: "\uC9C0\uC6D0\uC0AC\uC5C5",
  organization: "\uC8FC\uAD00\uAE30\uAD00",
  registeredAt: "\uB4F1\uB85D\uC77C\uC790",
  startsAt: "\uC2DC\uC791\uC77C\uC790",
  endsAt: "\uB9C8\uAC10\uC77C\uC790",
};

const ATTACHMENT_LABEL = "\uCCA8\uBD80\uD30C\uC77C";
const APPLICATION_LABEL = "\uC2E0\uCCAD URL";

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

function normalizeDate(value) {
  DATE_PATTERN.lastIndex = 0;
  const match = DATE_PATTERN.exec(String(value ?? ""));
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function getDates(value) {
  DATE_PATTERN.lastIndex = 0;
  return [...String(value ?? "").matchAll(DATE_PATTERN)]
    .map((match) => `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
}

function extractDeadline(value) {
  const dates = getDates(value);
  if (dates.length === 0) return null;
  return dates[dates.length - 1];
}

function buildPageUrl(boardUrl, page) {
  if (page === 1) return boardUrl;
  const url = new URL(boardUrl);
  url.searchParams.set("page", String(page));
  return url.href;
}

function extractPbancSn(value) {
  const match = String(value ?? "").match(/go_view\s*\(\s*['"]?(\d+)/i);
  return match?.[1] ?? null;
}

function buildDetailUrl(pbancSn) {
  const url = new URL(LIST_URL);
  url.searchParams.set("schM", "view");
  url.searchParams.set("pbancSn", pbancSn);
  return url.href;
}

function appendLine(lines, label, value) {
  const text = compactText(value);
  if (!text) return;
  lines.push(`${label}: ${text}`);
}

function getTitle($, row) {
  const $title = $(row).find(".middle .tit").first().clone();
  $title.find(".new").remove();
  return compactText($title.text()).replace(/\s*새로운게시글\s*$/g, "").trim();
}

function parseListMeta($, row) {
  const values = [];
  $(row).find(".bottom .list").each((_, item) => {
    const text = compactText($(item).text());
    if (text) values.push(text);
  });

  const meta = {
    program: values[0] ?? "",
    organization: values[1] ?? "",
    date: "",
    startDate: "",
    deadline: "",
  };

  for (const value of values) {
    if (/^\uB4F1\uB85D\uC77C\uC790/.test(value)) meta.date = normalizeDate(value) ?? "";
    if (/^\uC2DC\uC791\uC77C\uC790/.test(value)) meta.startDate = normalizeDate(value) ?? "";
    if (/^\uB9C8\uAC10\uC77C\uC790/.test(value)) meta.deadline = normalizeDate(value) ?? "";
  }

  return meta;
}

function buildListContent($, row, meta) {
  const lines = [];
  const category = compactText($(row).find(".top .flag").not(".day").first().text());
  const dday = compactText($(row).find(".top .flag.day").first().text());

  appendLine(lines, LIST_LABELS.category, category);
  appendLine(lines, LIST_LABELS.dday, dday);
  appendLine(lines, LIST_LABELS.program, meta.program);
  appendLine(lines, LIST_LABELS.organization, meta.organization);
  appendLine(lines, LIST_LABELS.registeredAt, meta.date);
  appendLine(lines, LIST_LABELS.startsAt, meta.startDate);
  appendLine(lines, LIST_LABELS.endsAt, meta.deadline);
  return lines.join("\n");
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe, nav, header, footer, .btn_wrap, .btn_view, .btn_down, .paging, .pagination, .sns").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section, h3, h4, h5").each((_, child) => {
    $(child).append("\n");
  });

  return cleanText($copy.text());
}

function collectKeyValueLines($, root) {
  const lines = [];
  const fields = [];

  $(root).find(".bg_box .dot_list, .information_list .dot_list").each((_, item) => {
    const $item = $(item);
    const label = compactText($item.find(".tit").first().text());
    const value = readableText($, $item.find(".txt").first());

    if (label && value) {
      const line = `${label}: ${compactText(value)}`;
      lines.push(line);
      fields.push({ label, value });
      return;
    }

    if (label) {
      lines.push(label);
      fields.push({ label, value: "" });
    }
  });

  return { lines, fields };
}

function extractOpenWindowUrl(value) {
  const match = String(value ?? "").match(/fn_open_window\s*\(\s*['"]([^'"]+)['"]/i);
  return match?.[1] ?? null;
}

function getAttachmentName($, link, index) {
  const $row = $(link).closest("li.clear");
  const fileName = compactText($row.find(".file_bg").first().text() || $row.find(".file_bg").first().attr("title"));
  if (fileName) return fileName.replace(/^\[\uCCA8\uBD80\uD30C\uC77C\]\s*/, "");

  const text = compactText($(link).text() || $(link).attr("title"));
  if (text && text !== "\uB2E4\uC6B4\uB85C\uB4DC") return text;
  return `${ATTACHMENT_LABEL} ${index}`;
}

function collectAttachments($, root, postUrl) {
  const attachments = [];
  const seen = new Set();
  let fileIndex = 1;

  $(root).find("a[href], a[onclick]").each((_, link) => {
    const href = $(link).attr("href") || "";
    const onclick = $(link).attr("onclick") || "";
    const openedUrl = extractOpenWindowUrl(href) || extractOpenWindowUrl(onclick);

    if (openedUrl) {
      const url = resolveUrl(BASE_URL, openedUrl);
      if (!seen.has(url)) {
        seen.add(url);
        attachments.push({
          name: compactText($(link).text()) || APPLICATION_LABEL,
          url,
        });
      }
      return;
    }

    if (!/\/afile\/fileDownload\//i.test(href)) return;
    const url = resolveUrl(postUrl, href);
    if (seen.has(url)) return;

    seen.add(url);
    attachments.push({
      name: getAttachmentName($, link, fileIndex),
      url,
    });
    fileIndex += 1;
  });

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

function findDeadline(fields, fallbackText) {
  for (const field of fields) {
    if (!/(\uB9C8\uAC10|\uC811\uC218\uAE30\uAC04|\uC2E0\uCCAD\uAE30\uAC04|\uC811\uC218|\uC2E0\uCCAD)/.test(field.label)) continue;
    const deadline = extractDeadline(field.value || field.label);
    if (deadline) return deadline;
  }

  return extractDeadline(fallbackText);
}

export default {
  name: "k-startup",

  async parseList(boardUrl, site = {}, maxPages = 2, board = {}) {
    const pageLimit = Number(board.maxPages ?? site.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildPageUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      $("#bizPbancList li.notice, #bizPbancList li").each((_, row) => {
        const href = $(row).find("a[href*='go_view']").first().attr("href") || "";
        const pbancSn = extractPbancSn(href);
        const title = getTitle($, row);
        if (!pbancSn || !title) return;

        const meta = parseListMeta($, row);
        pagePosts.push({
          title,
          url: buildDetailUrl(pbancSn),
          sourceUrl: buildDetailUrl(pbancSn),
          date: meta.date,
          deadline: meta.deadline,
          content: buildListContent($, row, meta),
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

    const $root = $("#contentViewHtml").first().length ? $("#contentViewHtml").first() : $("body").first();
    const title = compactText($root.find("#scrTitle h3").first().text()) || compactText($("title").first().text());
    const { lines: keyValueLines, fields } = collectKeyValueLines($, $root);
    const fallbackText = readableText($, $root);
    const attachments = collectAttachments($, $root, postUrl);

    const content = dedupeLines([
      keyValueLines.join("\n"),
      fallbackText,
    ].filter(Boolean).join("\n\n"));

    return {
      title: title || undefined,
      content: content || undefined,
      deadline: findDeadline(fields, content),
      images: [],
      attachments,
      sourceUrl: postUrl,
    };
  },
};
