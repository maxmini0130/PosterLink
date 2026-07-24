import { fetchPage } from "../crawler.js";
import {
  addImage,
  cleanText,
  extractDateRange,
  resolveExternalOriginalDetailWithTrace,
  resolveUrl,
} from "../external-original-resolver.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const BASE_URL = "https://youth.seoul.go.kr";
const IMAGE_ONLY_CONTENT =
  "\uC0C1\uC138 \uB0B4\uC6A9\uC740 \uC774\uBBF8\uC9C0\uB85C \uC81C\uACF5\uB429\uB2C8\uB2E4. " +
  "\uC774\uBBF8\uC9C0 \uAC24\uB7EC\uB9AC\uC5D0\uC11C \uC804\uCCB4 \uC548\uB0B4\uB97C \uD655\uC778\uD558\uC138\uC694.";

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

export function choosePreferredDetailTitle(youthTitle, externalTitle) {
  const youth = cleanText(youthTitle);
  const external = cleanText(externalTitle);

  if (!youth) return external;
  if (!external) return youth;

  // Youth Seoul often exposes the full program name inside angle brackets while
  // the linked application page only returns an organization/menu title.
  if (/<[^<>]{2,}>/.test(youth) && !/<[^<>]{2,}>/.test(external)) {
    return youth;
  }

  return external;
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

    const externalOriginalResult = await resolveExternalOriginalDetailWithTrace($, postUrl, title, {
      scopeSelector: ".feed-view",
      viaLinkTitle: "\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5 \uACBD\uC720 \uCD9C\uCC98",
    });
    const externalDetail = externalOriginalResult.detail;

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
    const sourceLinks = externalDetail?.viaLink ? [externalDetail.viaLink] : [];
    const preferredTitle = choosePreferredDetailTitle(title, externalDetail?.title);
    const inferredTitle = inferSpecificTitle(preferredTitle, content, attachments);

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
      externalOriginal: externalOriginalResult.trace?.attempted ? externalOriginalResult.trace : undefined,
    };
  },
};
