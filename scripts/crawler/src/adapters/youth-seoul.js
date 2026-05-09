import * as cheerio from "cheerio";
import { fetchPage } from "../crawler.js";

const BASE_URL = "https://youth.seoul.go.kr";

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function cleanText(value) {
  if (!value) return "";
  let text = value.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) {
    text = cheerio.load(`<span>${text}</span>`)("span").text().replace(/\s+/g, " ").trim();
  }
  return text.replace(/\.{2,}\d+$/, "").trim();
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

export default {
  name: "youth-seoul",

  async parseList(boardUrl, _site, maxPages = 5) {
    const posts = [];

    for (let page = 1; page <= maxPages; page++) {
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
    $(".feed-view .thum-img img, .feed-view img[src*='/atch/getImg.do']").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original");
      const imageUrl = resolveUrl(postUrl, src);
      if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
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

    return {
      title: title || undefined,
      content: detailText || overviewText || undefined,
      deadline: end,
      images,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
