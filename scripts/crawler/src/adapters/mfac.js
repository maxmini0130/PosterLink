import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const BOARD_CODE = "BOARD_1207683401";

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr").each((_, child) => {
    $(child).append("\n");
  });
  return $copy
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDate(value) {
  const match = String(value ?? "").match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function buildPageUrl(boardUrl, page) {
  if (page === 1) return boardUrl;
  const url = new URL(boardUrl);
  url.searchParams.set("page", String(page));
  return url.href;
}

function buildDetailUrl(pageUrl, seq, page, scType) {
  const url = new URL("notice_all_view.jsp", pageUrl);
  url.searchParams.set("sc_b_code", BOARD_CODE);
  url.searchParams.set("sc_type", scType || "1");
  url.searchParams.set("pk_seq", seq);
  url.searchParams.set("sc_cond", "b_subject");
  url.searchParams.set("page", String(page));
  return url.href;
}

function isLikelyContentImage(src) {
  if (!src) return false;
  return !/logo|btn_|gnb_|lnb_|ico_|banner|sns|facebook|twitter|instagram|youtube|accessibility|web_access|webaccess|wa[_-]?mark|wamark|wa-logo|cert/i.test(src);
}

function addImage(images, baseUrl, src) {
  if (!isLikelyContentImage(src)) return;
  const resolved = resolveUrl(baseUrl, src);
  if (resolved && !images.includes(resolved)) images.push(resolved);
}

function extractDeadline(text) {
  const shortEndRange = text.match(
    /(?:모집|접수|신청)\s*기?간\s*[:：]?\s*[\s\S]{0,120}?(\d{4})\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}[\s\S]{0,40}?~\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/
  );
  if (shortEndRange) {
    const [, year, month, day] = shortEndRange;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const patterns = [
    /(?:모집|접수|신청)\s*기?간\s*[:：]?\s*[\s\S]{0,120}?~\s*(\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2})/,
    /마감[일:]?\s*(\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2})/,
    /(\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2})\s*(?:까지|마감|종료)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const date = normalizeDate(match?.[1]);
    if (date) return date;
  }

  return null;
}

export default {
  name: "mfac",

  async parseList(boardUrl, _site, maxPages = 2) {
    const posts = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const pageUrl = buildPageUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      const scType = $("#sc_type").attr("value") || new URL(pageUrl).searchParams.get("sc_type") || "1";

      $("a.btnDetail[seq]").each((_, anchor) => {
        const $anchor = $(anchor);
        const seq = $anchor.attr("seq");
        const title = cleanText($anchor.text());
        if (!seq || !title || title.length < 3) return;

        const $row = $anchor.closest("li, tr, div");
        const rowText = cleanText($row.text());
        pagePosts.push({
          title,
          url: buildDetailUrl(pageUrl, seq, page, scType),
          date: normalizeDate(rowText) ?? "",
        });
      });

      posts.push(...pagePosts);
      if (pagePosts.length === 0) break;
    }

    const uniquePosts = new Map();
    for (const post of posts) {
      const key = new URL(post.url).searchParams.get("pk_seq") || post.url;
      if (!uniquePosts.has(key)) uniquePosts.set(key, post);
    }
    return [...uniquePosts.values()];
  },

  async parseDetail(postUrl, site) {
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    const title = cleanText($(".board_view .board_tit h3").first().text());
    const date = normalizeDate($(".board_view .board_tit .date").first().text()) ?? "";
    const $contentRoot = $(".board_view .board_cont").first();
    const content = $contentRoot.length > 0 ? readableText($, $contentRoot) : "";

    const images = [];
    $contentRoot.find("img").each((_, img) => {
      addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
    });

    const attachments = [];
    $(".board_view .file a, .board_view .board_file a, .board_view a[href*='download']").each((_, a) => {
      const href = $(a).attr("href");
      const name = cleanText($(a).text());
      if (href && name) attachments.push({ name, url: resolveUrl(postUrl, href) });
    });

    const posterImages = await filterAndOrderPosterImages(images, {
      title,
      content,
      site: site.name,
      sourceUrl: postUrl,
    });

    return {
      title: title || undefined,
      content: content || undefined,
      date,
      deadline: extractDeadline(content),
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
