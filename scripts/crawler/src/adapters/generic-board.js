import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";

const DEFAULT_SELECTORS = {
  listItem: [
    "table tbody tr",
    ".board-list li",
    ".bbs-list li",
    ".notice-list li",
    ".list_item",
    ".list-item",
    "article",
  ],
  listLink: "a[href]",
  listTitle: null,
  listDate: ".td_date, .date, .bo_date, .write-date, .reg-date, .created-at, td:last-child",
  listImage: "img",
  fallbackLinks: [
    ".bo_tit a",
    ".td_subject a",
    "table tbody tr td.td_subject a",
    ".list_item a",
    ".list-item a",
    ".board_list tbody tr a",
    "a[href*='wr_id']",
    "a[href*='board']",
    "a[href*='view']",
    "a[href*='detail']",
    "a[href*='notice']",
  ],

  detailRoot: "body",
  detailTitle: [
    "#bo_v_title",
    ".bo_v_tit",
    ".view_title",
    ".board_view_title",
    ".subject",
    ".view-subject",
    ".detail-title",
    ".board-detail-tbl thead th",
    "h1",
    "h2",
    "h3.title",
  ],
  detailContent: [
    "#bo_v_con",
    ".bo_v_con",
    ".view_content",
    ".board_view_content",
    ".detail-content",
    ".view-cont",
    ".view-contents",
    ".view_area",
    ".viewArea",
    ".board-view",
    ".boardView",
    ".bbs-view",
    ".bbs_view",
    "#contents",
    ".contents",
    ".sub_content",
    ".board-view",
    ".content",
    "article",
  ],
  detailDate: "#bo_v_info .date, .bo_v_info, .view_info, .board_view_info, .board-detail-tbl thead th, .date, .reg-date",
  detailImages: "#bo_v_con img, .bo_v_con img, .view_content img, .board_view_content img, .detail-content img, .view-cont img, article img",
  detailAttachments: ".bo_v_file a, .view_file a, .file_list a, .board_view_file a, a[href*='download'], a[href*='file']",
  removeBeforeText: "script, style, noscript, iframe, nav, header, footer, aside, .sns, .share, .btn, .buttons, .pagination, .gnb, .lnb, .snb, .menu, .nav, .header, .footer, .breadcrumb, .location, .search",
};

const DATE_PATTERN = /(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/;
const DEADLINE_PATTERNS = [
  /(?:\uB9C8\uAC10|\uC811\uC218|\uC2E0\uCCAD|\uAE30\uAC04)[^\d]{0,30}(20\d{2}[-./]\d{1,2}[-./]\d{1,2})/i,
  /(20\d{2}[-./]\d{1,2}[-./]\d{1,2})\s*(?:\uAE4C\uC9C0|\uC774\uB0B4|\uB9C8\uAC10)/i,
  /(?:~|\uC885\uB8CC|until)[^\d]{0,10}(20\d{2}[-./]\d{1,2}[-./]\d{1,2})/i,
];

const DEFAULT_URL_EXCLUDE_PATTERNS = [
  /^#/i,
  /^javascript:/i,
  /^mailto:/i,
  /^tel:/i,
  /\/login/i,
  /\/member/i,
];

const DEFAULT_TITLE_EXCLUDE_PATTERNS = [
  /^\d+$/,
  /^[\d\s/|·.<>-]+$/,
  /^(prev|next|first|last|more|view)$/i,
  /^(이전|다음|처음|마지막|목록|더보기)$/,
];

const VOLATILE_LIST_PARAMS = [
  "cp",
  "cpage",
  "page",
  "pageIndex",
  "pageNum",
  "pageNo",
  "recordCountPerPage",
  "rows",
  "rowsSel",
  "perPage",
  "hashCode",
  "cat",
  "schPblancDiv",
  "schJrsdCodeTy",
  "schWntyAt",
  "schAreaDetailCodes",
  "schEndAt",
  "orderGb",
  "sort",
  "preKeywords",
  "condition",
  "condition1",
  "searchKeyword",
  "searchCondition",
  "keyword",
];

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toArray);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeObjects(...values) {
  return Object.assign({}, ...values.filter((value) => value && typeof value === "object" && !Array.isArray(value)));
}

function buildConfig(site = {}, board = {}) {
  const siteSelectors = mergeObjects(site.selectors);
  const boardSelectors = mergeObjects(board.selectors);
  const selectors = { ...DEFAULT_SELECTORS, ...siteSelectors, ...boardSelectors };
  const pagination = mergeObjects(site.pagination, board.pagination);
  const urlFilters = mergeObjects(site.urlFilters, board.urlFilters);

  return {
    selectors,
    pagination,
    sameHostOnly: Boolean(board.sameHostOnly ?? site.sameHostOnly ?? urlFilters.sameHostOnly ?? false),
    includeUrlPatterns: [
      ...toArray(site.includeUrlPatterns ?? urlFilters.include),
      ...toArray(board.includeUrlPatterns ?? board.urlIncludePatterns),
    ],
    excludeUrlPatterns: [
      ...DEFAULT_URL_EXCLUDE_PATTERNS,
      ...toArray(site.excludeUrlPatterns ?? urlFilters.exclude),
      ...toArray(board.excludeUrlPatterns ?? board.urlExcludePatterns),
    ],
    excludeTitlePatterns: [
      ...DEFAULT_TITLE_EXCLUDE_PATTERNS,
      ...toArray(site.excludeTitlePatterns),
      ...toArray(board.excludeTitlePatterns),
    ],
  };
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function getHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function patternMatches(value, pattern) {
  if (!pattern) return false;
  if (pattern instanceof RegExp) return pattern.test(value);

  const raw = String(pattern);
  try {
    if (raw.startsWith("/") && raw.lastIndexOf("/") > 0) {
      const end = raw.lastIndexOf("/");
      return new RegExp(raw.slice(1, end), raw.slice(end + 1) || "i").test(value);
    }
    return new RegExp(raw, "i").test(value);
  } catch {
    return value.toLowerCase().includes(raw.toLowerCase());
  }
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => patternMatches(value, pattern));
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
    "attach",
    "attached",
    "file.gif",
    "file_icon",
    "icon_file",
    "ico_file",
    "clip",
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

function collectImages($, baseUrl, root, selectors = ["img"]) {
  const images = [];
  const selectorList = toArray(selectors);
  for (const selector of selectorList.length ? selectorList : ["img"]) {
    $(root).find(selector).each((_, img) => {
      addImage(images, baseUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
    });
  }
  return images;
}

function cleanTitleCandidate(value, site) {
  let title = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!title) return "";
  if (/^(logo|home|menu|search|skip navigation|본문 바로가기)$/i.test(title)) return "";
  title = title
    .replace(/^\uC81C\uBAA9\s*:\s*/i, "")
    .replace(/\s*(?:페이지\s*이동|새창(?:으로)?\s*열림|상세\s*보기|자세히\s*보기)\s*$/i, "")
    .replace(/\s+\d{4}[-./]\d{1,2}[-./]\d{1,2}\s*$/, "")
    .trim();
  if (/^(logo|home|menu|search|skip navigation|본문 바로가기)$/i.test(title)) return "";
  if (title.length < 4) return "";
  if (title === site?.name) return "";
  if (/^[^/]+(?:\s*\/\s*[^/]+){2,}$/i.test(title)) return "";
  if (/(상세보기|공지사항\s*\|)/.test(title)) return "";
  return title;
}

function extractReadableText($, element, removeSelectors = "") {
  const $copy = $(element).clone();
  for (const selector of toArray(removeSelectors)) {
    $copy.find(selector).remove();
  }
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr, section").each((_, child) => {
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

function firstText($, root, selectors, removeSelectors = "") {
  for (const selector of toArray(selectors)) {
    const $el = root ? $(root).find(selector).first() : $(selector).first();
    if ($el.length === 0) continue;
    const text = extractReadableText($, $el, removeSelectors).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function normalizeDate(value) {
  const text = String(value ?? "");
  const match = text.match(DATE_PATTERN);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractDeadline(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ");
  const rangeMatch = normalized.match(/(?:\uC2E0\uCCAD\uAE30\uAC04|\uC811\uC218\uAE30\uAC04|\uBAA8\uC9D1\uAE30\uAC04|\uC2E0\uCCAD|\uC811\uC218|\uBAA8\uC9D1|\uAE30\uAC04)[^\d]{0,40}(20\d{2}[-./]\d{1,2}[-./]\d{1,2})\s*(?:~|\uBD80\uD130|[-\u2013\u2014])\s*(20\d{2}[-./]\d{1,2}[-./]\d{1,2})/i);
  if (rangeMatch?.[2]) return normalizeDate(rangeMatch[2]);

  for (const pattern of DEADLINE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.[1]) return normalizeDate(match[1]);
  }
  return null;
}

function getLinkTitle($, $row, $link, selectors, site) {
  const configured = firstText($, $row, selectors.listTitle, selectors.removeBeforeText);
  const raw = configured
    || $link.text()
    || $link.attr("title")
    || $link.attr("aria-label")
    || $row.text();
  return cleanTitleCandidate(raw, site);
}

function shouldKeepLink({ url, title, baseUrl, config }) {
  if (!url || !title || title.length <= 1) return false;
  if (matchesAny(url, config.excludeUrlPatterns)) return false;
  if (matchesAny(title, config.excludeTitlePatterns)) return false;
  if (config.includeUrlPatterns.length > 0 && !matchesAny(url, config.includeUrlPatterns)) return false;
  if (config.sameHostOnly && getHost(url) && getHost(baseUrl) && getHost(url) !== getHost(baseUrl)) return false;
  return true;
}

function extractListItem($, row, pageUrl, site, config) {
  const selectors = config.selectors;
  const $row = $(row);
  const linkSelectors = toArray(selectors.listLink);
  const candidates = [];

  if ($row.is("a[href]")) candidates.push($row);
  for (const selector of linkSelectors.length ? linkSelectors : ["a[href]"]) {
    $row.find(selector).each((_, link) => candidates.push($(link)));
  }

  for (const $link of candidates) {
    const href = $link.attr("href");
    if (!href || matchesAny(href, config.excludeUrlPatterns)) continue;
    const url = resolveUrl(pageUrl, href);
    const title = getLinkTitle($, $row, $link, selectors, site);
    if (!shouldKeepLink({ url, title, baseUrl: pageUrl, config })) continue;

    const rowText = extractReadableText($, $row, selectors.removeBeforeText);
    const dateText = firstText($, $row, selectors.listDate, selectors.removeBeforeText) || rowText;
    return {
      title,
      url,
      date: normalizeDate(dateText),
      images: collectImages($, pageUrl, $row, selectors.listImage),
      sourceUrl: url,
    };
  }

  return null;
}

function buildPageUrl(boardUrl, page, pagination = {}) {
  const firstPage = Number(pagination.firstPage ?? pagination.first_page ?? 1);
  const pageValue = Number(pagination.startAt ?? pagination.start_at ?? firstPage) + page - 1;
  if (page === 1 && pagination.includeFirstPage !== true) return boardUrl;

  const pageUrls = pagination.pageUrls ?? pagination.page_urls;
  if (Array.isArray(pageUrls) && pageUrls[page - 1]) {
    return resolveUrl(boardUrl, String(pageUrls[page - 1]));
  }

  const pattern = pagination.pattern ?? pagination.pageUrlPattern ?? pagination.page_url_pattern;
  if (pattern) {
    return String(pattern)
      .replaceAll("{page}", String(pageValue))
      .replaceAll("{url}", boardUrl);
  }

  try {
    const url = new URL(boardUrl);
    const offsetParam = pagination.offsetParam ?? pagination.offset_param;
    if (offsetParam) {
      const pageSize = Number(pagination.pageSize ?? pagination.page_size ?? 10);
      url.searchParams.set(String(offsetParam), String((pageValue - firstPage) * pageSize));
      return url.href;
    }

    const param = pagination.param ?? pagination.pageParam ?? pagination.page_param ?? "page";
    url.searchParams.set(String(param), String(pageValue));
    return url.href;
  } catch {
    const sep = boardUrl.includes("?") ? "&" : "?";
    const param = pagination.param ?? pagination.pageParam ?? pagination.page_param ?? "page";
    return `${boardUrl}${sep}${param}=${pageValue}`;
  }
}

function extractListPosts($, pageUrl, site, config) {
  const posts = [];
  for (const selector of toArray(config.selectors.listItem)) {
    $(selector).each((_, row) => {
      const item = extractListItem($, row, pageUrl, site, config);
      if (item) posts.push(item);
    });
    if (posts.length > 0) break;
  }

  if (posts.length > 0) return posts;

  for (const selector of toArray(config.selectors.fallbackLinks)) {
    $(selector).each((_, link) => {
      const item = extractListItem($, link, pageUrl, site, config);
      if (item) posts.push(item);
    });
    if (posts.length > 0) break;
  }

  return posts;
}

function uniquePosts(posts) {
  const byUrl = new Map();
  for (const post of posts) {
    const identity = normalizePostIdentity(post?.url);
    if (!identity || byUrl.has(identity)) continue;
    byUrl.set(identity, post);
  }
  return [...byUrl.values()];
}

function normalizePostIdentity(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    for (const param of VOLATILE_LIST_PARAMS) {
      url.searchParams.delete(param);
    }
    const sortedParams = [...url.searchParams.entries()]
      .filter(([, paramValue]) => String(paramValue ?? "").trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, paramValue] of sortedParams) {
      url.searchParams.append(key, paramValue);
    }
    url.hash = "";
    return url.href;
  } catch {
    return String(value).trim();
  }
}

function collectAttachments($, postUrl, selectors) {
  const attachments = [];
  for (const selector of toArray(selectors.detailAttachments)) {
    $(selector).each((_, a) => {
      const href = $(a).attr("href");
      const name = $(a).text().trim() || $(a).attr("title") || href;
      if (href && name) attachments.push({ name, url: resolveUrl(postUrl, href) });
    });
    if (attachments.length > 0) break;
  }
  return attachments;
}

function collectDetailImages($, postUrl, selectors) {
  const images = [];
  $("meta[property='og:image'], meta[name='twitter:image'], link[rel='image_src']").each((_, el) => {
    addImage(images, postUrl, $(el).attr("content") || $(el).attr("href"));
  });

  for (const selector of toArray(selectors.detailImages)) {
    $(selector).each((_, img) => {
      addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
    });
    if (images.length > 0) break;
  }

  if (images.length === 0) {
    $("img").each((_, img) => {
      addImage(images, postUrl, $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original"));
    });
  }

  return images;
}

export default {
  name: "generic-board",

  async parseList(boardUrl, site, maxPages = 3, board = {}) {
    const config = buildConfig(site, board);
    const pageLimit = Number(board?.maxPages ?? site?.maxPages ?? maxPages) || maxPages;
    const posts = [];

    for (let page = 1; page <= pageLimit; page += 1) {
      const pageUrl = buildPageUrl(boardUrl, page, config.pagination);
      const $ = await fetchPage(pageUrl);
      if (!$) break;

      const links = extractListPosts($, pageUrl, site, config);
      posts.push(...links);
      if (links.length === 0) break;
    }

    return uniquePosts(posts);
  },

  async parseDetail(postUrl, site, board = {}) {
    const config = buildConfig(site, board);
    const { selectors } = config;
    const $ = await fetchPage(postUrl);
    if (!$) return {};

    const rootSelector = toArray(selectors.detailRoot)[0] || "body";
    const $root = $(rootSelector).first().length ? $(rootSelector).first() : $("body").first();

    let title = cleanTitleCandidate(firstText($, null, selectors.detailTitle, selectors.removeBeforeText), site);
    if (!title) title = cleanTitleCandidate($("title").first().text(), site);

    let content = "";
    for (const selector of toArray(selectors.detailContent)) {
      const $content = $(selector).first();
      if ($content.length === 0) continue;
      content = extractReadableText($, $content, selectors.removeBeforeText);
      if (content) break;
    }
    if (!content) content = extractReadableText($, $root, selectors.removeBeforeText);

    const date = normalizeDate(firstText($, null, selectors.detailDate, selectors.removeBeforeText) || content);
    const deadline = extractDeadline(content);
    const rawImages = collectDetailImages($, postUrl, selectors);
    const attachments = collectAttachments($, postUrl, selectors);

    const posterImages = await filterAndOrderPosterImages(rawImages, {
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
