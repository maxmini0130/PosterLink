// Re-reads a review-queue notice from its sources: every stored link, the
// application pages those pages point to, and the stored images.
// Each request has its own timeout and a failure only marks that source.
import axios from "axios";
import * as cheerio from "cheerio";
import {
  cleanExtractedText,
  decodeBuffer,
} from "./attachment-text-extractor.js";
import { resolveImageContentType } from "./image-content-type.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const PAGE_TIMEOUT_MS = 20000;
const IMAGE_TIMEOUT_MS = 20000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGE_TEXT = 12000;
const MAX_FOLLOWED_LINKS = 4;
const MAX_IMAGES = 5;

// Anchors on a notice that usually lead to the real application page or form.
const APPLY_LINK_TEXT =
  /신청|접수|참여\s*하기|바로\s*가기|구글\s*폼|google\s*form|forms\.gle|apply/i;
const APPLY_LINK_HREF =
  /forms\.gle|docs\.google\.com\/forms|form\.naver\.com|naver\.me|apply|reserv|lecture|edu.*view|course/i;

// Some public sites answer with HTTP that undici rejects (e.g. "Unexpected
// space after start line") while browsers and curl accept it. Only for that
// failure, retry with Node's lenient HTTP parser through axios.
async function fetchBytesLenient(url, { timeoutMs, maxBytes, accept }) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: timeoutMs,
    maxContentLength: maxBytes,
    maxRedirects: 5,
    insecureHTTPParser: true,
    validateStatus: () => true,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });
  const headers = new Map(
    Object.entries(response.headers).map(([k, v]) => [
      k.toLowerCase(),
      String(v),
    ]),
  );
  return {
    response: {
      status: response.status,
      url: response.request?.res?.responseUrl || url,
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    },
    bytes: Buffer.from(response.data),
  };
}

async function fetchBytes(url, options) {
  const { timeoutMs, maxBytes, accept } = options;
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
      },
    });
  } catch (error) {
    if (
      /HTTP\/1\.1 protocol|HPE_/i.test(
        String(error?.cause?.message ?? error?.cause?.code ?? ""),
      )
    ) {
      return fetchBytesLenient(url, options);
    }
    throw error;
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new Error(`too large: ${length} bytes`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes)
    throw new Error(`too large: ${bytes.length} bytes`);
  return { response, bytes };
}

// The readable copy of a page when the stored URL is only a frame.
export function readableUrl(url) {
  try {
    const u = new URL(url);
    // blog.naver.com/{blogId}/{logNo} only wraps the post in an iframe.
    const blog =
      u.hostname === "blog.naver.com" &&
      u.pathname.match(/^\/([A-Za-z0-9_-]+)\/(\d+)\/?$/);
    if (blog)
      return `https://blog.naver.com/PostView.naver?blogId=${blog[1]}&logNo=${blog[2]}`;
  } catch {
    // Not a URL; fetch as is.
  }
  return url;
}

// Google Forms keep the title, description and questions in a script value.
export function googleFormText(html) {
  const match = html.match(
    /FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/,
  );
  if (!match) return "";
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return "";
  }
  const strings = [];
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.trim().length >= 2 && !/^https?:\/\//.test(value))
        strings.push(value.trim());
    } else if (Array.isArray(value)) value.forEach(walk);
  };
  walk(data);
  return cleanExtractedText([...new Set(strings)].join("\n"), MAX_PAGE_TEXT);
}

// Portal or site home pages behind a generic "신청하기" button carry nothing about the notice.
function isHomePage(url) {
  try {
    const { pathname, search } = new URL(url);
    return (
      (pathname === "/" && !search) ||
      /\/(main|index|home)[A-Za-z]*\.(do|jsp|php|html?)$/i.test(pathname)
    );
  } catch {
    return true;
  }
}

export function pageTextFromHtml(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();
  // Navigation, headers and footers are noise for a single notice.
  $("header, footer, nav").remove();
  const title = cleanExtractedText($("title").first().text(), 300);
  const body = $("body").length ? $("body") : $.root();
  body.find("br").replaceWith("\n");
  body.find("p, div, li, tr, h1, h2, h3, h4, h5, h6, dt, dd").each((_, el) => {
    $(el).append("\n");
  });
  const text = cleanExtractedText(body.text(), MAX_PAGE_TEXT);
  return { title, text, $ };
}

export function applyLinkCandidates($, baseUrl) {
  const found = [];
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") ?? "").trim();
    const label = cleanExtractedText($(el).text(), 120);
    if (
      !href ||
      href.startsWith("#") ||
      /^javascript:/i.test(href) ||
      /^mailto:|^tel:/i.test(href)
    )
      return;
    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:\/\//.test(url)) return;
    if (APPLY_LINK_TEXT.test(label) || APPLY_LINK_HREF.test(url))
      found.push({ url, label });
  });
  const seen = new Set();
  return found.filter((link) =>
    seen.has(link.url) ? false : seen.add(link.url),
  );
}

export async function fetchPage(url, via = null) {
  const startedAt = Date.now();
  try {
    const { response, bytes } = await fetchBytes(readableUrl(url), {
      timeoutMs: PAGE_TIMEOUT_MS,
      maxBytes: MAX_PAGE_BYTES,
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const base = {
      url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      via,
    };
    if (!/html|xml|text\/plain/i.test(contentType) && contentType) {
      return {
        ...base,
        text: "",
        title: "",
        applyLinks: [],
        note: "not a text page",
        ms: Date.now() - startedAt,
      };
    }
    const decoded = decodeBuffer(bytes, contentType);
    const { title, text, $ } = pageTextFromHtml(decoded);
    const formText = /docs\.google\.com\/forms/.test(base.finalUrl)
      ? googleFormText(decoded)
      : "";
    return {
      ...base,
      title,
      text: formText
        ? cleanExtractedText(`${text}\n${formText}`, MAX_PAGE_TEXT)
        : text,
      applyLinks: applyLinkCandidates($, base.finalUrl).slice(0, 20),
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url,
      finalUrl: url,
      status: null,
      via,
      text: "",
      title: "",
      applyLinks: [],
      error: String(error?.message ?? error).slice(0, 200),
      ms: Date.now() - startedAt,
    };
  }
}

export async function fetchImage(image) {
  const url = image.storage_path;
  try {
    const { response, bytes } = await fetchBytes(url, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: MAX_IMAGE_BYTES,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    });
    const contentType = resolveImageContentType(
      response.headers.get("content-type"),
      bytes,
    );
    if (response.status !== 200 || !contentType) {
      return {
        id: image.id,
        url,
        status: response.status,
        error: "not an image",
      };
    }
    return {
      id: image.id,
      url,
      status: 200,
      contentType,
      bytes: bytes.length,
      dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  } catch (error) {
    return {
      id: image.id,
      url,
      status: null,
      error: String(error?.message ?? error).slice(0, 200),
    };
  }
}

// Fetches stored links first, then up to MAX_FOLLOWED_LINKS application pages they
// point to. Images: the thumbnail first, then the others, MAX_IMAGES in total.
export async function fetchSourcesForPoster(row) {
  const links = row.poster_links ?? [];
  const storedUrls = new Set(links.map((link) => link.url));
  const pages = await Promise.all(links.map((link) => fetchPage(link.url)));

  const follow = [];
  for (const page of pages) {
    for (const candidate of page.applyLinks ?? []) {
      if (
        storedUrls.has(candidate.url) ||
        follow.some((f) => f.url === candidate.url)
      )
        continue;
      if (pages.some((p) => p.finalUrl === candidate.url)) continue;
      if (isHomePage(candidate.url)) continue;
      follow.push({
        url: candidate.url,
        via: page.url,
        label: candidate.label,
      });
    }
  }
  const followed = await Promise.all(
    follow
      .slice(0, MAX_FOLLOWED_LINKS)
      .map((f) =>
        fetchPage(f.url, f.via).then((p) => ({ ...p, label: f.label })),
      ),
  );

  const images = [...(row.poster_images ?? [])].sort(
    (a, b) =>
      Number(b.storage_path === row.thumbnail_url) -
      Number(a.storage_path === row.thumbnail_url),
  );
  const fetchedImages = await Promise.all(
    images.slice(0, MAX_IMAGES).map(fetchImage),
  );

  return { pages, followed, images: fetchedImages };
}

// Text the model saw, used to check that the evidence it quotes really exists.
export function sourceCorpus(fetched) {
  return [...fetched.pages, ...fetched.followed]
    .filter((page) => page.status === 200 && page.text)
    .map((page) => `${page.title}\n${page.text}`)
    .join("\n\n");
}

export function readableSourceCount(fetched) {
  return [...fetched.pages, ...fetched.followed].filter(
    (page) => page.status === 200 && page.text.length >= 80,
  ).length;
}
