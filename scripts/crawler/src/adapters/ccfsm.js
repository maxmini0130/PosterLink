import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const BASE_URL = "https://dietary4u.mfds.go.kr";
const LIST_URL = `${BASE_URL}/board.es?mid=at0501000000&bid=AT07`;
const DATE_PATTERN = /(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/g;

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
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function extractDates(value) {
  DATE_PATTERN.lastIndex = 0;
  return [...String(value ?? "").matchAll(DATE_PATTERN)].map(
    (match) => `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`,
  );
}

function stripTrailingDate(value) {
  return compactText(value)
    .replace(/\s*20\d{2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2}\s*$/, "")
    .trim();
}

function buildPageUrl(boardUrl, page) {
  const base = boardUrl || LIST_URL;
  if (page === 1) return base;
  const url = new URL(base, BASE_URL);
  url.searchParams.set("nPage", String(page));
  return url.href;
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe, nav, header, footer, aside, .share, .controller").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section").each((_, child) => {
    $(child).append("\n");
  });
  return cleanText($copy.text());
}

function isLikelyContentImage(src) {
  if (!src) return false;
  const normalized = src.toLowerCase();
  return ![
    "icon",
    "logo",
    "btn",
    "banner",
    "sns",
    "facebook",
    "twitter",
    "accessibility",
    "web_access",
    "webaccess",
    "wa_mark",
    "wamark",
    "cert",
  ].some((word) => normalized.includes(word));
}

function collectImages($, root, postUrl) {
  const images = [];
  $(root).find("img").each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original");
    if (!isLikelyContentImage(src)) return;
    const url = resolveUrl(postUrl, src);
    if (!images.includes(url)) images.push(url);
  });
  return images;
}

function collectAttachments($, root, postUrl) {
  const attachments = [];
  const seen = new Set();

  $(root).find("a[href]").each((_, link) => {
    const href = $(link).attr("href") || "";
    if (!/boardDownload\.es|download|\.pdf|\.hwp|\.hwpx|\.docx?|\.xlsx?|\.zip/i.test(href)) return;

    const url = resolveUrl(postUrl, href);
    if (seen.has(url)) return;
    seen.add(url);

    attachments.push({
      name: compactText($(link).text()) || `attachment-${attachments.length + 1}`,
      url,
    });
  });

  return attachments;
}

function getListRow($, link) {
  const $titleCell = $(link).closest("li");
  if ($titleCell.length && /\btitle\b/.test($titleCell.attr("class") || "")) {
    return $titleCell.closest("ul");
  }
  return $(link).closest("li, tr, .list, .bbs_list, .board-list, .brdList");
}

export default {
  name: "ccfsm",

  async parseList(boardUrl, site = {}, maxPages = 1, board = {}) {
    const pageLimit = Number(board.maxPages ?? site.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildPageUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      $("a[href*='board.es'][href*='bid=AT07'][href*='list_no=']").each((_, link) => {
        const $link = $(link);
        const href = $link.attr("href");
        const rawTitle = compactText($link.text());
        const title = stripTrailingDate(rawTitle);
        if (!href || !title) return;

        const rowText = compactText(getListRow($, link).text()) || rawTitle;
        pagePosts.push({
          title,
          url: resolveUrl(pageUrl, href),
          sourceUrl: resolveUrl(pageUrl, href),
          date: normalizeDate(rowText),
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

    const $root = $(".bbs_view").first().length ? $(".bbs_view").first() : $("body").first();
    const titleFromPage = compactText($(".bbs_view .subject, .bbs_view .tit, .bbs_view h4").first().text());
    const titleFromMeta = compactText($("title").first().text()).split("|")[0]?.trim();
    const title = titleFromPage || titleFromMeta;
    const content = readableText($, $root);
    const dates = extractDates(content);
    const images = collectImages($, $root, postUrl);
    const attachments = collectAttachments($, $root, postUrl);
    const posterImages = await filterAndOrderPosterImages(images, {
      title,
      content,
      site: site.name,
      sourceUrl: postUrl,
    });

    return {
      title: title || undefined,
      content: content || undefined,
      date: dates[0] ?? undefined,
      deadline: dates.length > 1 ? dates[dates.length - 1] : undefined,
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
