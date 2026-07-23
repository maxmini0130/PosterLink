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

function isInvalidDetailTitle(value) {
  const title = cleanText(value);
  return (
    !title ||
    title === "\uC2DC\uC2A4\uD15C \uC624\uB958 \uC785\uB2C8\uB2E4." ||
    title === "@\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5" ||
    /^\uC11C\uC6B8\uD2B9\uBCC4\uC2DC\s+\S+\uAD6C$/.test(title) ||
    /\uCCAD\uB144\uC815\uCC45\s*>\s*\uCCAD\uB144\uC815\uCC45\uAC80\uC0C9\s*>\s*\uCCAD\uB144\uC9C0\uC6D0\uC815\uBCF4/.test(title)
  );
}

function inferSpecificTitle(title, content, attachments = []) {
  const text = [title, content, ...attachments.map((attachment) => attachment?.name)]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return title;

  if (title === "\uB3D9\uC544\uC77C\uBCF4" && /D-Bridge|\uBBF8\uB514\uC5B4\s*\uCEE4\uB9AC\uC5B4\s*\uBE4C\uB4DC\uC5C5/i.test(text)) {
    return "\uD55C\uAD6D\uB2A5\uB960\uD611\uD68C&\uB3D9\uC544\uC77C\uBCF4 <D-Bridge \uBBF8\uB514\uC5B4 \uCEE4\uB9AC\uC5B4 \uBE4C\uB4DC\uC5C5>";
  }

  if (title === "(\uC8FC)\uC5D0\uB4C0\uC70C") {
    if (/\uC601\uC0C1\uCF58\uD150\uCE20|ai-vide/i.test(text)) {
      return "(\uC8FC)\uC5D0\uB4C0\uC70C <[AI Worker] AI \uC735\uD569 \uC601\uC0C1\uCF58\uD150\uCE20 \uC2E4\uBB34 \uACFC\uC815>";
    }
    if (/\uC2A4\uB9C8\uD2B8\s*\uD37C\uBE14\uB9AC\uC2F1|\uD3B8\uC9D1\uB514\uC790\uC778|\uC804\uC790\uCD9C\uD310|ai-worker-la/i.test(text)) {
      return "(\uC8FC)\uC5D0\uB4C0\uC70C <[AI Worker] \uC2A4\uB9C8\uD2B8 \uD37C\uBE14\uB9AC\uC2F1: AI \uC735\uD569 \uD3B8\uC9D1\uB514\uC790\uC778\u00B7\uC804\uC790\uCD9C\uD310 \uC2E4\uBB34 \uC804\uBB38\uAC00 \uACFC\uC815>";
    }
    if (/AI\s*\uD65C\uC6A9\s*\uB178\uB3D9\uC790\s*\uC591\uC131\uACFC\uC815/i.test(text)) {
      return "(\uC8FC)\uC5D0\uB4C0\uC70C <AI \uD65C\uC6A9 \uB178\uB3D9\uC790 \uC591\uC131\uACFC\uC815>";
    }
  }

  if (/^\uC5D0\uC774\uBE14\uB7F0(?:\s*\uC548\uB0B4)?$/.test(title)) {
    if (/AI\s*\uC5D0\uC774\uC804\uD2B8|\uC5C5\uBB34\s*\uD601\uC2E0\s*\uD074\uB798\uC2A4|n8n/i.test(text)) {
      return "\uC5D0\uC774\uBE14\uB7F0 <AI \uC5D0\uC774\uC804\uD2B8 \uC5C5\uBB34 \uD601\uC2E0 \uD074\uB798\uC2A4>";
    }
    if (/\uC5C5\uBB34\uC790\uB3D9\uD654\s*\uB9C8\uC2A4\uD130|\uC5D1\uC140\s*\uC5C5\uBB34\s*\uC790\uB3D9\uD654|ChatGPT\s*&\s*Excel/i.test(text)) {
      return "\uC5D0\uC774\uBE14\uB7F0 <\uC5C5\uBB34\uC790\uB3D9\uD654 \uB9C8\uC2A4\uD130 \uD074\uB798\uC2A4>";
    }
    if (/\uC0DD\uC131\uD615\s*\uBE14\uB85C\uADF8|\uBE14\uB85C\uADF8\s*\uC62C\uC778\uC6D0/i.test(text)) {
      return "\uC5D0\uC774\uBE14\uB7F0 <\uC218\uC775\uD654\uBD80\uD130 \uC790\uB3D9\uD654\uAE4C\uC9C0! \uC0DD\uC131\uD615 \uBE14\uB85C\uADF8 \uC62C\uC778\uC6D0 \uD074\uB798\uC2A4>";
    }
  }

  return title;
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
  if (/\s/.test(String(src).trim()) || /^img\s+src/i.test(String(src).trim())) return;
  if (/logo|btn_|gnb_|lnb_|ico_|banner|accessibility|web_access|webaccess|wa[_-]?mark|wamark|wa-logo|cert/i.test(src)) return;
  const imageUrl = resolveUrl(baseUrl, src);
  if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isYouthSeoulUrl(value) {
  return getHost(value) === "youth.seoul.go.kr";
}

function isExternalOriginalUrl(value) {
  const host = getHost(value);
  return Boolean(host) && !isYouthSeoulUrl(value);
}

function extractExternalOriginalLink($, postUrl) {
  const candidates = [];

  $(".feed-view a[href]").each((_, link) => {
    const href = $(link).attr("href");
    if (!href || /^javascript:|^#|^mailto:|^tel:/i.test(href)) return;

    const url = resolveUrl(postUrl, href);
    if (!/^https?:\/\//i.test(url) || !isExternalOriginalUrl(url)) return;

    const label = cleanText($(link).text() || $(link).attr("title"));
    const context = cleanText($(link).closest("li, tr, dl, div, p").text());
    const signal = `${label} ${context} ${url}`;
    let score = 0;

    if (/담당기관\s*바로가기|원문|상세|자세히|홈페이지/i.test(signal)) score += 10;
    if (/programDetail|detail|view|bbs|board/i.test(url)) score += 4;
    if (/신청|접수|프로그램/i.test(signal)) score += 2;
    if (/login|logout|siteMap|mainB\.do/i.test(url)) score -= 20;

    if (score > 0) candidates.push({ url, label, score });
  });

  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}

function selectExternalRoot($) {
  const selectors = [
    ".sub_cont",
    "#skip_contents",
    "#contents",
    "#content",
    ".contents",
    ".content",
    "main",
    "article",
  ];

  for (const selector of selectors) {
    const roots = $(selector).toArray()
      .map((element) => $(element))
      .filter(($root) => cleanText($root.text()).length >= 80);
    if (roots.length > 0) return roots[0];
  }

  return $("body");
}

function findLabeledValue($, $root, labelPattern) {
  let result = "";

  $root.find("tr").each((_, row) => {
    if (result) return;
    const cells = $(row).children("th, td")
      .map((__, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    for (let index = 0; index < cells.length - 1; index += 1) {
      if (labelPattern.test(cells[index])) {
        result = cells[index + 1];
        return;
      }
    }
  });

  return result;
}

function extractTableLines($, $root) {
  const lines = [];

  $root.find("tr").each((_, row) => {
    const cells = $(row).children("th, td")
      .map((__, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 2) return;
    for (let index = 0; index < cells.length - 1; index += 2) {
      const label = cells[index].replace(/[:：]\s*$/, "");
      const value = cells[index + 1];
      if (!label || !value || label.length > 30 || value === label) continue;
      lines.push(`${label}: ${value}`);
    }
  });

  return uniqueValues(lines);
}

function extractExternalTitle($, $root, fallbackTitle) {
  return findLabeledValue($, $root, /^(강좌명|프로그램명|행사명|제목|공고명)$/)
    || cleanText($root.find("h1, h2, h3, h4, .tit, .title, .subject").first().text())
    || fallbackTitle;
}

function trimExternalContent(value) {
  let text = cleanText(value);
  const stopPatterns = [
    /\s+강사소개\s+강좌신청승인조건/i,
    /\s+강좌신청승인조건/i,
    /\s+개인정보\s*수집\s*및\s*이용/i,
  ];

  for (const pattern of stopPatterns) {
    const match = text.match(pattern);
    if (match?.index && match.index > 100) {
      text = text.slice(0, match.index).trim();
    }
  }

  return text;
}

function extractExternalAttachments($, $root, originalUrl) {
  const attachments = [];

  $root.find("a[href]").each((_, link) => {
    const href = $(link).attr("href");
    const name = cleanText($(link).text() || $(link).attr("title"));
    if (!href || !name || /^javascript:|^#/i.test(href)) return;
    const url = resolveUrl(originalUrl, href);
    if (!/^https?:\/\//i.test(url) && !/^mailto:|^tel:/i.test(url)) return;
    attachments.push({ name, url });
  });

  return attachments;
}

async function parseExternalOriginalDetail(originalUrl, fallbackTitle) {
  const $ = await fetchPage(originalUrl);
  if (!$) return null;

  const $root = selectExternalRoot($);
  const tableLines = extractTableLines($, $root);
  const $textRoot = $root.clone();
  $textRoot.find("script, style, noscript, caption, table").remove();
  const rootText = cleanText($textRoot.text());
  const content = trimExternalContent(uniqueValues([...tableLines, rootText]).join(" ")).slice(0, 8000);
  const images = [];

  $root.find("img").each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original");
    addImage(images, originalUrl, src);
  });

  $("meta[property='og:image'], meta[name='twitter:image']").each((_, el) => {
    addImage(images, originalUrl, $(el).attr("content"));
  });

  const { end } = extractDateRange(content);

  return {
    url: originalUrl,
    title: extractExternalTitle($, $root, fallbackTitle),
    content,
    deadline: end,
    images,
    attachments: extractExternalAttachments($, $root, originalUrl),
  };
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

    const parsedTitle = cleanText($(".feed-view .overview .tit").first().text() || $("h3").first().text());
    const title = isInvalidDetailTitle(parsedTitle) ? "" : parsedTitle;
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

    const externalOriginalLink = extractExternalOriginalLink($, postUrl);
    const externalDetail = externalOriginalLink
      ? await parseExternalOriginalDetail(externalOriginalLink.url, title)
      : null;

    const baseContent = isMeaningfulContent(detailText)
      ? detailText
      : isMeaningfulContent(overviewText)
        ? overviewText
        : detailImages.length > 0
          ? IMAGE_ONLY_CONTENT
          : "";

    if (externalDetail?.images?.length) {
      images.unshift(...externalDetail.images.filter((imageUrl) => !images.includes(imageUrl)));
      detailImages.unshift(...externalDetail.images.filter((imageUrl) => !detailImages.includes(imageUrl)));
    }

    if (externalDetail?.attachments?.length) {
      attachments.push(...externalDetail.attachments);
    }

    const content = externalDetail?.content && externalDetail.content.length > baseContent.length
      ? externalDetail.content
      : baseContent;
    const sourceUrl = externalDetail?.url ?? postUrl;
    const sourceLinks = externalDetail
      ? [{ link_type: "other", title: "\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5 \uACBD\uC720 \uCD9C\uCC98", url: postUrl }]
      : [];
    const inferredTitle = inferSpecificTitle(externalDetail?.title || title, content, attachments);

    const posterImages = await filterAndOrderPosterImages(images, {
      title: inferredTitle,
      content,
      site: "\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5",
      sourceUrl,
      preferredImageUrls: detailImages,
    });
    return {
      title: inferredTitle || undefined,
      content: content || undefined,
      deadline: externalDetail?.deadline ?? end,
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
      attachments,
      links: sourceLinks,
      sourceUrl,
    };
  },
};
