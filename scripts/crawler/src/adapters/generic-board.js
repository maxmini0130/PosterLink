// src/adapters/generic-board.js
// 그누보드(Gnuboard) 기반 게시판 파서
// 한국 공공기관 사이트의 80% 이상이 그누보드 또는 유사 구조를 사용합니다.
// 사이트별로 selector가 다를 수 있으므로 site.selectors로 오버라이드 가능

import { fetchPage, logger } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

// 기본 셀렉터 (그누보드 표준)
const DEFAULT_SELECTORS = {
  // 목록 페이지
  listRow: ".bo_tit a, .td_subject a, table tbody tr td.td_subject a, .list_item a, .board_list tbody tr a",
  listTitle: null, // listRow의 text 사용
  listDate: ".td_date, .date, .bo_date",

  // 상세 페이지
  detailTitle: "#bo_v_title, .bo_v_tit, .view_title, h3.title, .board_view_title, .subject, .board-detail-tbl thead th",
  detailContent: "#bo_v_con, .bo_v_con, .view_content, .board_view_content, .detail-content, .content",
  detailDate: "#bo_v_info .date, .bo_v_info, .view_info, .board_view_info, .board-detail-tbl thead th",
  detailImages: "#bo_v_con img, .bo_v_con img, .view_content img, .board_view_content img, .detail-content img",
  detailAttachments: ".bo_v_file a, .view_file a, .file_list a, .board_view_file a",
};

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function isLikelyContentImage(src) {
  if (!src) return false;
  const normalized = src.toLowerCase();
  return ![
    "icon",
    "logo",
    "btn",
    "banner",
    "bul_",
    "bg_",
    "addfile",
    "skin001",
    "anyboard/skin",
    "sns",
    "facebook",
    "twitter",
    "accessibility",
    "web_access",
    "webaccess",
    "wa_mark",
    "wamark",
    "wa-logo",
    "cert",
  ].some((word) => normalized.includes(word));
}

function addImage(images, baseUrl, src) {
  if (!isLikelyContentImage(src)) return;
  const resolved = resolveUrl(baseUrl, src);
  if (!images.includes(resolved)) images.push(resolved);
}

function collectImages($, baseUrl, root) {
  const images = [];
  $(root).find("img").each((_, img) => {
    addImage(images, baseUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
  });
  return images;
}

function cleanTitleCandidate(value, site) {
  let title = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!title) return "";
  title = title
    .replace(/^제목\s*:\s*/i, "")
    .replace(/\s+\d{4}[-./]\d{1,2}[-./]\d{1,2}\s*$/, "")
    .trim();
  if (title === site?.name) return "";
  if (/^[^/]+(?:\s*\/\s*[^/]+){2,}$/i.test(title)) return "";
  if (/상세보기|공지사항\s*\|/.test(title)) return "";
  return title;
}

function extractReadableText($, element) {
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

export default {
  name: "generic-board",

  async parseList(boardUrl, site, maxPages = 3) {
    const sel = { ...DEFAULT_SELECTORS, ...(site.selectors || {}) };
    const posts = [];

    for (let page = 1; page <= maxPages; page++) {
      const sep = boardUrl.includes("?") ? "&" : "?";
      const pageUrl = page === 1 ? boardUrl : `${boardUrl}${sep}page=${page}`;
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      // 다양한 게시판 구조를 시도
      const links = [];

      // 패턴 1: 테이블 기반 (가장 흔함)
      $("table tbody tr").each((_, tr) => {
        const $tr = $(tr);
        const $a = $tr.find("td a").first();
        const href = $a.attr("href");
        const title = $a.text().trim();
        const date = $tr.find("td").last().text().trim();
        if (href && title && !title.includes("공지") === false) {
          links.push({ title, url: resolveUrl(boardUrl, href), date, images: collectImages($, boardUrl, $tr) });
        }
      });

      // 패턴 2: div/li 기반
      if (links.length === 0) {
        $(sel.listRow).each((_, el) => {
          const $a = $(el);
          const href = $a.attr("href");
          const title = $a.text().trim();
          if (href && title && title.length > 2) {
            links.push({ title, url: resolveUrl(boardUrl, href), date: "", images: collectImages($, boardUrl, $a.closest("li, div, article, tr")) });
          }
        });
      }

      // 패턴 3: 게시판 리스트 아이템
      if (links.length === 0) {
        $("a[href*='wr_id'], a[href*='board'], a[href*='view'], a[href*='detail']").each((_, el) => {
          const $a = $(el);
          const href = $a.attr("href");
          const title = $a.text().trim();
          if (href && title && title.length > 2 && !title.match(/^\d+$/)) {
            links.push({ title, url: resolveUrl(boardUrl, href), date: "", images: collectImages($, boardUrl, $a.closest("li, div, article, tr")) });
          }
        });
      }

      posts.push(...links);
      if (links.length === 0) break; // 더 이상 페이지 없음
    }

    // 중복 제거
    const unique = [...new Map(posts.map((p) => [p.url, p])).values()];
    return unique;
  },

  async parseDetail(postUrl, site) {
    const sel = { ...DEFAULT_SELECTORS, ...(site.selectors || {}) };
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    // 제목
    let title = "";
    for (const s of sel.detailTitle.split(", ")) {
      title = $(s).first().text().trim();
      if (title) break;
    }
    title = cleanTitleCandidate(title, site);
    if (!title) {
      title = cleanTitleCandidate($("th").first().text().replace(/^\[[^\]]+\]\s*/, ""), site);
    }
    if (!title) {
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      const match = bodyText.match(/게시판\s*내용보기\s+(.+?)\s+작성자\s*:/);
      title = cleanTitleCandidate(match?.[1], site);
    }
    if (!title) {
      title = cleanTitleCandidate($("title").first().text(), site);
    }

    // 본문
    let content = "";
    for (const s of sel.detailContent.split(", ")) {
      const contentElement = $(s).first();
      content = contentElement.length > 0 ? extractReadableText($, contentElement) : "";
      if (content) break;
    }

    // 날짜
    let date = "";
    for (const s of sel.detailDate.split(", ")) {
      const text = $(s).first().text().trim();
      const match = text.match(/\d{4}[-./]\d{2}[-./]\d{2}/);
      if (match) { date = match[0].replace(/[./]/g, "-"); break; }
    }

    // 이미지 URL 추출
    const images = [];
    $("meta[property='og:image'], meta[name='twitter:image'], link[rel='image_src']").each((_, el) => {
      addImage(images, postUrl, $(el).attr("content") || $(el).attr("href"));
    });

    for (const s of sel.detailImages.split(", ")) {
      $(s).each((_, img) => {
        addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
      });
      if (images.length > 0) break;
    }

    if (images.length === 0) {
      $("img").each((_, img) => {
        addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
      });
    }

    // 첨부파일
    const attachments = [];
    for (const s of sel.detailAttachments.split(", ")) {
      $(s).each((_, a) => {
        const href = $(a).attr("href");
        const name = $(a).text().trim();
        if (href && name) {
          attachments.push({ name, url: resolveUrl(postUrl, href) });
        }
      });
      if (attachments.length > 0) break;
    }

    // 본문에서 마감일 추출 시도
    let deadline = null;
    const deadlinePatterns = [
      /마감[일:]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/,
      /접수[기]?간[:]?\s*~?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/,
      /신청[기]?간[:]?\s*~?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/,
      /(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s*[까~]?\s*지/,
    ];
    const fullText = content || $("body").text();
    for (const pattern of deadlinePatterns) {
      const m = fullText.match(pattern);
      if (m) { deadline = m[1].replace(/[./]/g, "-"); break; }
    }

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
      deadline,
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      sourceUrl: postUrl,
    };
  },
};
