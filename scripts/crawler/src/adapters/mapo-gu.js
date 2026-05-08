// src/adapters/mapo-gu.js
// 마포구청 (mapo.go.kr) 전용 파서
// 마포구청은 자체 CMS를 사용하며, 동 주민센터도 동일 도메인 하위 경로 사용

import { fetchPage } from "../crawler.js";

function resolveUrl(base, relative) {
  try { return new URL(relative, base).href; } catch { return relative; }
}

function isLikelyContentImage(src) {
  if (!src) return false;
  const normalized = src.toLowerCase();
  return !["icon", "logo", "btn", "banner", "sns", "facebook", "twitter"].some((word) => normalized.includes(word));
}

function addImage(images, baseUrl, src) {
  if (!isLikelyContentImage(src)) return;
  const resolved = resolveUrl(baseUrl, src);
  if (!images.includes(resolved)) images.push(resolved);
}

export default {
  name: "mapo-gu",

  async parseList(boardUrl, site, maxPages = 3) {
    const posts = [];

    for (let page = 1; page <= maxPages; page++) {
      const sep = boardUrl.includes("?") ? "&" : "?";
      const pageUrl = page === 1 ? boardUrl : `${boardUrl}${sep}pageIndex=${page}`;
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      // 마포구청 게시판: table.board_list 또는 ul.board_list
      $("table tbody tr, .board_list li, .list_wrap li").each((_, el) => {
        const $el = $(el);
        const $a = $el.find("a").first();
        let href = $a.attr("href");
        const title = $a.text().trim().replace(/\s+/g, " ");

        if (!href || !title || title.length < 3) return;
        if (title.match(/^\d+$/) || title === "제목") return;

        href = resolveUrl(boardUrl, href);

        // 날짜 추출
        let date = "";
        $el.find("td, span, .date").each((_, d) => {
          const text = $(d).text().trim();
          const m = text.match(/\d{4}[-./]\d{2}[-./]\d{2}/);
          if (m) date = m[0].replace(/[./]/g, "-");
        });

        posts.push({ title, url: href, date });
      });

      if (posts.length === 0 && page === 1) {
        // Fallback: 모든 링크 스캔
        $("a[href*='/board/']").each((_, el) => {
          const $a = $(el);
          const href = $a.attr("href");
          const title = $a.text().trim();
          if (href && title && title.length > 3 && !href.includes("/list")) {
            posts.push({ title, url: resolveUrl(boardUrl, href), date: "" });
          }
        });
      }
    }

    return [...new Map(posts.map((p) => [p.url, p])).values()];
  },

  async parseDetail(postUrl, site) {
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    // 마포구청 상세 페이지
    const title = $(".view_title, .board_view h3, .subject, h3.tit").first().text().trim();
    const content = $(".view_con, .board_view_content, .content, .view_content").first().text().trim();

    let date = "";
    $(".view_info, .board_info, .info").each((_, el) => {
      const text = $(el).text();
      const m = text.match(/\d{4}[-./]\d{2}[-./]\d{2}/);
      if (m) date = m[0].replace(/[./]/g, "-");
    });

    // 이미지
    const images = [];
    $("meta[property='og:image'], meta[name='twitter:image'], link[rel='image_src']").each((_, el) => {
      addImage(images, postUrl, $(el).attr("content") || $(el).attr("href"));
    });

    $(".view_con img, .board_view_content img, .content img").each((_, img) => {
      addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
    });

    if (images.length === 0) {
      $("img").each((_, img) => {
        addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
      });
    }

    // 첨부파일 (포스터 이미지 포함)
    const attachments = [];
    $(".file_list a, .view_file a, a[href*='download'], a[href*='FileDown']").each((_, a) => {
      const href = $(a).attr("href");
      const name = $(a).text().trim();
      if (href && name) {
        attachments.push({ name, url: resolveUrl(postUrl, href) });
      }
    });

    // 마감일 추출
    let deadline = null;
    const fullText = content || $("body").text();
    const patterns = [
      /마감[일:]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/,
      /접수[기]?간[:]?\s*[\s\S]*?~\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/,
      /(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s*[까~]?\s*지/,
    ];
    for (const p of patterns) {
      const m = fullText.match(p);
      if (m) { deadline = m[1].replace(/[./]/g, "-"); break; }
    }

    return {
      title: title || undefined,
      content: content ? content.substring(0, 500) : undefined,
      date,
      deadline,
      images,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
