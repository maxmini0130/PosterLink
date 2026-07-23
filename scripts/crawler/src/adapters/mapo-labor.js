import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const BASE_URL = "https://mapolabor.org";
const DATE_PATTERN = /(20\d{2})[-./]\d{1,2}[-./]\d{1,2}/;

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
  const match = String(value ?? "").match(DATE_PATTERN);
  return match ? match[0].replace(/[./]/g, "-") : "";
}

function buildListUrl(boardUrl, page) {
  if (page === 1) return boardUrl;
  const url = new URL(boardUrl, BASE_URL);
  url.searchParams.set("pageNo", String(page));
  return url.href;
}

function extractSeq(value) {
  const match = String(value ?? "").match(/goView\((\d+)\)/i);
  return match?.[1] ?? "";
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section").each((_, child) => {
    $(child).append("\n");
  });
  return cleanText($copy.text());
}

function isLikelyContentImage(src) {
  if (!src) return false;
  return !/logo|icon|btn|banner|sns|facebook|twitter|instagram|youtube|kakao|search|sprite|favicon|ccl|modal|wa[_-]?mark|web[_-]?access|cert/i.test(src);
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

export default {
  name: "mapo-labor",

  async parseList(boardUrl, site = {}, maxPages = 2, board = {}) {
    const pageLimit = Number(board.maxPages ?? site.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildListUrl(boardUrl, page);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const pagePosts = [];
      $(".item-box").each((_, item) => {
        const $item = $(item);
        const href = $item.find("a[href*='Page.goView']").first().attr("href");
        const seq = extractSeq(href);
        const title = compactText($item.find(".item-box-desc h3, h3").first().text());
        if (!seq || !title) return;

        const imageSrc = $item.find("figure img, img").first().attr("src");
        pagePosts.push({
          title,
          url: resolveUrl(pageUrl, `/community/news/post?seq=${seq}`),
          sourceUrl: resolveUrl(pageUrl, `/community/news/post?seq=${seq}`),
          date: "",
          images: imageSrc && isLikelyContentImage(imageSrc) ? [resolveUrl(pageUrl, imageSrc)] : [],
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

    const $root = $(".right-content").first().length ? $(".right-content").first() : $("body").first();
    const title = compactText($(".blog-post-title").first().text()) || compactText($("h1, h2").first().text());
    const date = normalizeDate($(".blog-post-info").first().text());
    const $content = $(".contents").first().length ? $(".contents").first() : $root;
    const content = readableText($, $content);
    const images = collectImages($, $content, postUrl);
    const posterImages = await filterAndOrderPosterImages(images, {
      title,
      content,
      site: site.name ?? "mapo-labor",
      sourceUrl: postUrl,
    });

    return {
      title: title || undefined,
      content: content || undefined,
      date: date || undefined,
      deadline: undefined,
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments: [],
      sourceUrl: postUrl,
    };
  },
};
