import https from "node:https";
import axios from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const client = axios.create({
  responseType: "arraybuffer",
  timeout: 15000,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; maposc notices)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
  },
});

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

async function fetchMaposcPage(url) {
  const response = await client.get(url);
  const html = iconv.decode(Buffer.from(response.data), "euc-kr");
  return cheerio.load(html);
}

function readableText($, element) {
  const $copy = $(element).clone();
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

function cleanContent(text, title, date) {
  return [
    title,
    date ? `작성일: ${date}` : null,
    text
      .replace(/공지사항 상세보기|사이트 바로가기|상단메뉴 바로가기|서브메뉴 바로가기|본문영역 바로가기|하단메뉴 바로가기/g, " ")
      .replace(/목록보기|하단 배너|이전배너표시|다음배너 표시/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ].filter(Boolean).join("\n");
}

export default {
  name: "maposc-yeyak",

  async parseList(boardUrl, site, maxPages = 2) {
    const posts = [];
    const pageUrls = [boardUrl];

    for (let page = 1; page <= maxPages; page += 1) {
      pageUrls.push(`https://yeyak.maposc.or.kr/news/board/llist/NOTICE/L/MAPO01/0/0/-/0/${page}`);
    }

    for (const pageUrl of [...new Set(pageUrls)]) {
      const $ = await fetchMaposcPage(pageUrl);
      $("a[href*='/news/board/view/NOTICE/MAPOSC/']").each((_, anchor) => {
        const $anchor = $(anchor);
        const title = $anchor.text().replace(/\s+/g, " ").trim();
        const href = $anchor.attr("href");
        if (!title || !href) return;

        const $row = $anchor.closest("tr");
        const rowText = $row.text().replace(/\s+/g, " ").trim();
        const date = rowText.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
        posts.push({ title, url: resolveUrl(pageUrl, href), date });
      });
    }

    return [...new Map(posts.map((post) => [post.url, post])).values()];
  },

  async parseDetail(postUrl, site) {
    const $ = await fetchMaposcPage(postUrl);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const title = bodyText.match(/게시판 내용보기\s+(.+?)\s+작성자\s*:/)?.[1]?.trim()
      ?? $("h3, h4, .title").first().text().replace(/\s+/g, " ").trim();
    const date = bodyText.match(/작성일\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";

    const images = [];
    $("img").each((_, img) => {
      const src = $(img).attr("src");
      if (!src) return;
      if (/logo|btn_|gnb_|lnb_|ico_|banner|accessibility|web_access|webaccess|wa[_-]?mark|wamark|wa-logo|cert/i.test(src)) return;
      if (!/file_upload|tmp|upload|attach/i.test(src)) return;
      const resolved = resolveUrl(postUrl, src);
      if (!images.includes(resolved)) images.push(resolved);
    });

    const contentRoot = $("table, .board_view, .view, #contents").filter((_, element) => {
      const text = $(element).text();
      return title && text.includes(title);
    }).first();
    const rawContent = contentRoot.length > 0 ? readableText($, contentRoot) : bodyText;
    const content = cleanContent(rawContent, title, date);

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
      deadline: null,
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments: [],
      sourceUrl: postUrl,
    };
  },
};
