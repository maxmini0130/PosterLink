import * as cheerio from "cheerio";
import { fetchPage } from "./crawler.js";

const DEFAULT_ROOT_SELECTORS = [
  ".sub_cont",
  "#skip_contents",
  "#contents",
  "#content",
  ".contents",
  ".content",
  "main",
  "article",
];

const DEFAULT_LINK_SIGNAL_PATTERN = /(?:\uB2F4\uB2F9\uAE30\uAD00\s*\uBC14\uB85C\uAC00\uAE30|\uC6D0\uBB38|\uC0C1\uC138|\uC790\uC138\uD788|\uD648\uD398\uC774\uC9C0)/i;
const DEFAULT_LINK_DETAIL_PATTERN = /(?:programDetail|detail|view|bbs|board)/i;
const DEFAULT_LINK_SUPPORT_PATTERN = /(?:\uC2E0\uCCAD|\uC811\uC218|\uD504\uB85C\uADF8\uB7A8)/i;
const BAD_LINK_PATTERN = /(?:login|logout|siteMap|mainB\.do|javascript:)/i;
const DEFAULT_TITLE_LABEL_PATTERN = /^(?:\uAC15\uC88C\uBA85|\uD504\uB85C\uADF8\uB7A8\uBA85|\uD589\uC0AC\uBA85|\uC81C\uBAA9|\uACF5\uACE0\uBA85)$/;
const DEFAULT_CONTENT_STOP_PATTERNS = [
  /\s+\uAC15\uC0AC\uC18C\uAC1C\s+\uAC15\uC88C\uC2E0\uCCAD\uC2B9\uC778\uC870\uAC74/i,
  /\s+\uAC15\uC88C\uC2E0\uCCAD\uC2B9\uC778\uC870\uAC74/i,
  /\s+\uAC1C\uC778\uC815\uBCF4\s*\uC218\uC9D1\s*\uBC0F\s*\uC774\uC6A9/i,
];

const NON_CONTENT_IMAGE_PATTERN = /(?:logo|btn_|gnb_|lnb_|ico_|banner|accessibility|web_access|webaccess|wa[_-]?mark|wamark|wa-logo|cert|favicon|sprite)/i;

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toArray);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPattern(value, fallback = null) {
  if (!value) return fallback;
  if (value instanceof RegExp) return value;

  const raw = String(value);
  try {
    if (raw.startsWith("/") && raw.lastIndexOf("/") > 0) {
      const end = raw.lastIndexOf("/");
      return new RegExp(raw.slice(1, end), raw.slice(end + 1) || "i");
    }
    return new RegExp(raw, "i");
  } catch {
    return fallback;
  }
}

export function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

export function cleanText(value) {
  if (!value) return "";
  let text = String(value).replace(/\s+/g, " ").trim();
  for (let index = 0; index < 2; index += 1) {
    text = cheerio.load(`<span>${text}</span>`)("span").text().replace(/\s+/g, " ").trim();
  }
  return text.replace(/\.{2,}\d+$/, "").trim();
}

export function getHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeHost(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return getHost(text) || getHost(`https://${text}`) || text.replace(/^www\./, "").toLowerCase();
}

export function extractDateRange(text) {
  const match = String(text ?? "").match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  return {
    start: match?.[1] ?? null,
    end: match?.[2] ?? null,
  };
}

export function addImage(images, baseUrl, src) {
  const raw = String(src ?? "").trim();
  if (!raw || /\s/.test(raw) || /^img\s+src/i.test(raw)) return;
  if (NON_CONTENT_IMAGE_PATTERN.test(raw)) return;

  const imageUrl = resolveUrl(baseUrl, raw);
  if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function isExcludedHost(url, excludedHosts) {
  const host = getHost(url);
  if (!host) return true;
  return excludedHosts.some((excludedHost) => host === excludedHost || host.endsWith(`.${excludedHost}`));
}

export function extractExternalOriginalLink($, postUrl, options = {}) {
  const candidates = [];
  const scopeSelector = options.scopeSelector ?? options.scope_selector;
  const selectedScope = scopeSelector ? $(scopeSelector).first() : $("body");
  const $scope = selectedScope.length ? selectedScope : $("body");
  const linkSelector = options.linkSelector ?? options.link_selector ?? "a[href]";
  const excludedHosts = uniqueValues([
    getHost(postUrl),
    ...toArray(options.excludeHosts ?? options.exclude_hosts),
  ].map(normalizeHost));
  const linkSignalPattern = toPattern(options.linkSignalPattern ?? options.link_signal_pattern, DEFAULT_LINK_SIGNAL_PATTERN);
  const detailPattern = toPattern(options.detailUrlPattern ?? options.detail_url_pattern, DEFAULT_LINK_DETAIL_PATTERN);
  const supportPattern = toPattern(options.supportSignalPattern ?? options.support_signal_pattern, DEFAULT_LINK_SUPPORT_PATTERN);

  $scope.find(linkSelector).each((_, link) => {
    const href = $(link).attr("href");
    if (!href || /^javascript:|^#|^mailto:|^tel:/i.test(href)) return;

    const url = resolveUrl(postUrl, href);
    if (!/^https?:\/\//i.test(url) || isExcludedHost(url, excludedHosts)) return;

    const label = cleanText($(link).text() || $(link).attr("title") || $(link).attr("aria-label"));
    const context = cleanText($(link).closest("li, tr, dl, div, p").text());
    const signal = `${label} ${context} ${url}`;
    let score = 0;

    if (linkSignalPattern?.test(signal)) score += 10;
    if (detailPattern?.test(url)) score += 4;
    if (supportPattern?.test(signal)) score += 2;
    if (BAD_LINK_PATTERN.test(url)) score -= 20;

    if (score > 0) candidates.push({ url, label, context, score });
  });

  return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
}

function selectExternalRoot($, options = {}) {
  const rootSelectors = toArray(options.rootSelectors ?? options.root_selectors);
  const selectors = rootSelectors.length > 0 ? rootSelectors : DEFAULT_ROOT_SELECTORS;
  const minLength = Number(options.minRootTextLength ?? options.min_root_text_length ?? 80);

  for (const selector of selectors) {
    const roots = $(selector).toArray()
      .map((element) => $(element))
      .filter(($root) => cleanText($root.text()).length >= minLength);
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

function extractExternalTitle($, $root, fallbackTitle, options = {}) {
  const labelPattern = toPattern(options.titleLabelPattern ?? options.title_label_pattern, DEFAULT_TITLE_LABEL_PATTERN);
  return findLabeledValue($, $root, labelPattern)
    || cleanText($root.find("h1, h2, h3, h4, .tit, .title, .subject").first().text())
    || fallbackTitle;
}

function trimExternalContent(value, options = {}) {
  let text = cleanText(value);
  const stopPatterns = [
    ...DEFAULT_CONTENT_STOP_PATTERNS,
    ...toArray(options.contentStopPatterns ?? options.content_stop_patterns).map((pattern) => toPattern(pattern)).filter(Boolean),
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
    const name = cleanText($(link).text() || $(link).attr("title") || $(link).attr("aria-label"));
    if (!href || !name || /^javascript:|^#/i.test(href)) return;
    const url = resolveUrl(originalUrl, href);
    if (!/^https?:\/\//i.test(url) && !/^mailto:|^tel:/i.test(url)) return;
    attachments.push({ name, url });
  });

  return attachments;
}

export async function parseExternalOriginalDetail(originalUrl, fallbackTitle = "", options = {}) {
  const $ = await fetchPage(originalUrl);
  if (!$) return null;

  const $root = selectExternalRoot($, options);
  const tableLines = extractTableLines($, $root);
  const $textRoot = $root.clone();
  $textRoot.find("script, style, noscript, caption, table").remove();
  const rootText = cleanText($textRoot.text());
  const content = trimExternalContent(uniqueValues([...tableLines, rootText]).join(" "), options)
    .slice(0, Number(options.maxContentLength ?? options.max_content_length ?? 8000));
  const images = [];
  const imageSelector = options.imageSelector ?? options.image_selector ?? "img";

  $root.find(imageSelector).each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || $(img).attr("data-original");
    addImage(images, originalUrl, src);
  });

  $("meta[property='og:image'], meta[name='twitter:image']").each((_, element) => {
    addImage(images, originalUrl, $(element).attr("content"));
  });

  const { end } = extractDateRange(content);

  return {
    url: originalUrl,
    title: extractExternalTitle($, $root, fallbackTitle, options),
    content,
    deadline: end,
    images,
    attachments: extractExternalAttachments($, $root, originalUrl),
  };
}

export async function resolveExternalOriginalDetail($, postUrl, fallbackTitle = "", options = {}) {
  const originalLink = extractExternalOriginalLink($, postUrl, options);
  if (!originalLink) return null;

  const detail = await parseExternalOriginalDetail(originalLink.url, fallbackTitle, options);
  if (!detail || (!detail.content && detail.images.length === 0)) return null;

  return {
    ...detail,
    originalLink,
    viaLink: {
      link_type: "other",
      title: options.viaLinkTitle ?? options.via_link_title ?? "\uACBD\uC720 \uCD9C\uCC98",
      url: postUrl,
    },
  };
}
