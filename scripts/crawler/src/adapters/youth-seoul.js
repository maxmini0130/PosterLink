import * as cheerio from "cheerio";
import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const BASE_URL = "https://youth.seoul.go.kr";
const IMAGE_ONLY_CONTENT =
  "\uC0C1\uC138 \uB0B4\uC6A9\uC740 \uC774\uBBF8\uC9C0\uB85C \uC81C\uACF5\uB429\uB2C8\uB2E4. " +
  "\uC774\uBBF8\uC9C0 \uAC24\uB7EC\uB9AC\uC5D0\uC11C \uC804\uCCB4 \uC548\uB0B4\uB97C \uD655\uC778\uD558\uC138\uC694.";

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function cleanText(value) {
  if (!value) return "";
  let text = String(value).replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i += 1) {
    text = cheerio.load(`<span>${text}</span>`)("span").text().replace(/\s+/g, " ").trim();
  }
  return text.replace(/\.{2,}\d+$/, "").trim();
}

function isMeaningfulContent(value) {
  const text = cleanText(value);
  return Boolean(text) && !["상세정보", "상세 정보"].includes(text);
}

function extractInfoId(onclick) {
  return onclick?.match(/goView\('([^']+)'\)/)?.[1] ?? null;
}

function extractDateRange(text) {
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  return {
    start: match?.[1] ?? null,
    end: match?.[2] ?? null,
  };
}

function addImage(images, baseUrl, src) {
  if (!src) return;
  const imageUrl = resolveUrl(baseUrl, src);
  if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
}

export default {
  name: "youth-seoul",

  async parseList(boardUrl, _site, maxPages = 5) {
    const posts = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(boardUrl);
      url.searchParams.set("pageIndex", String(page));
      url.searchParams.set("recordCountPerPage", "8");

      const $ = await fetchPage(url.href);
      if (!$) break;

      const pagePosts = [];
      $(".item").each((_, item) => {
        const $item = $(item);
        const $link = $item.find("[onclick*=\"goView\"]").first();
        const infoId = extractInfoId($link.attr("onclick") || $item.attr("onclick"));
        if (!infoId) return;

        const title = cleanText($item.find(".tit").first().text() || $link.text());
        if (!title) return;

        pagePosts.push({
          title,
          url: `${BASE_URL}/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=${infoId}`,
          date: "",
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

    const title = cleanText($(".feed-view .overview .tit").first().text() || $("h3").first().text());
    const overviewText = cleanText($(".feed-view .overview").first().text());
    const detailText = cleanText($(".feed-view .detail").first().text());
    const { end } = extractDateRange(overviewText);

    const images = [];
    const detailImages = [];

    $(".feed-view .detail img, .feed-view .editor-text img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original");
      addImage(images, postUrl, src);
      addImage(detailImages, postUrl, src);
    });

    $(".feed-view img[src*='/atch/getImg.do'], .feed-view .thum-img img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original");
      addImage(images, postUrl, src);
    });

    if (images.length === 0) {
      $("meta[property='og:image'], meta[name='twitter:image']").each((_, el) => {
        const imageUrl = resolveUrl(postUrl, $(el).attr("content"));
        if (imageUrl && !imageUrl.includes("/layout/logo") && !images.includes(imageUrl)) images.push(imageUrl);
      });
    }

    const attachments = [];
    $(".feed-view a[href*='/atch/']").each((_, a) => {
      const href = $(a).attr("href");
      const name = cleanText($(a).text());
      if (href && name) attachments.push({ name, url: resolveUrl(postUrl, href) });
    });

    const content = isMeaningfulContent(detailText)
      ? detailText
      : isMeaningfulContent(overviewText)
        ? overviewText
        : detailImages.length > 0
          ? IMAGE_ONLY_CONTENT
          : "";

    const posterImages = await filterAndOrderPosterImages(images, {
      title,
      content,
      site: "\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5",
      sourceUrl: postUrl,
      preferredImageUrls: detailImages,
    });
    const orderedImages = posterImages.images.length > 0
      ? posterImages.images
      : detailImages.length > 0
        ? detailImages
        : [];

    return {
      title: title || undefined,
      content: content || undefined,
      deadline: end,
      images: orderedImages,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
