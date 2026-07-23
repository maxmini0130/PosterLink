// src/upload-to-supabase.js
// 크롤링 결과를 PosterLink Supabase DB에 업로드
//
// 사용법:
//   node src/upload-to-supabase.js data/results/all_2026-05-08.json
//
// 환경변수 (.env 파일 또는 환경변수 직접 설정):
//   SUPABASE_URL      — Supabase 프로젝트 URL
//   SUPABASE_KEY      — Supabase service_role 키 (RLS 우회)
//   CRAWLER_USER_ID   — 크롤러 봇 계정 UUID (profiles 테이블에 미리 등록)

import "./load-env.js";
import crypto from "node:crypto";
import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { inferPosterClassification } from "./poster-classifier.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";
import { evaluatePosterQuality, summarizeQualityIssues } from "./poster-quality-gate.js";
import { verifyPosterFields, applyFieldVerification } from "./poster-field-verifier.js";
import {
  chooseDeadlineForStorage,
  evaluatePosterDateQuality,
  mergeDateQualityIntoFieldVerification,
} from "./poster-date-quality.js";
import { embedPosterText, embeddingToPgVector } from "./poster-embedder.js";
import {
  deletePostersWithStorage,
  replacePosterImagesWithStorageCleanup,
} from "./storage-cleanup.js";
import {
  createCollectionSourceStats,
  flushCollectionSourceStats,
  loadCollectionSources,
} from "./collection-source-tracker.js";
import {
  duplicateIssueFromMatch,
  findBestPosterDuplicate,
  normalizeSourceUrl,
} from "./poster-duplicate-detector.js";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();
const CRAWLER_USER_ID = process.env.CRAWLER_USER_ID?.trim() || null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env 파일에 SUPABASE_URL 과 SUPABASE_KEY 를 설정하세요.");
  process.exit(1);
}

const keyType = SUPABASE_KEY.startsWith("sb_secret_")
  ? "secret"
  : SUPABASE_KEY.startsWith("sb_publishable_")
    ? "publishable"
    : SUPABASE_KEY.startsWith("eyJ")
      ? "legacy-jwt"
      : "unknown";

console.log(`Supabase URL: ${new URL(SUPABASE_URL).host}`);
console.log(`Supabase key type: ${keyType}, length: ${SUPABASE_KEY.length}`);

if (SUPABASE_KEY.includes("*")) {
  console.error("❌ SUPABASE_KEY가 마스킹된 값처럼 보입니다. Dashboard의 실제 키 전체를 복사해야 합니다.");
  process.exit(1);
}

if (keyType === "publishable") {
  console.error("❌ SUPABASE_KEY에 publishable/anon 계열 키가 들어갔습니다. secret 또는 legacy service_role 키가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

const POSTER_IMAGE_BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";
const POSTER_DUPLICATE_LOOKUP_LIMIT = Number(process.env.POSTER_DUPLICATE_LOOKUP_LIMIT ?? "5000");

function removeInvalidSurrogates(value) {
  return String(value ?? "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
}

function sanitizeForPostgrest(value) {
  if (typeof value === "string") return removeInvalidSurrogates(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(sanitizeForPostgrest);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForPostgrest(item)])
    );
  }
  return value ?? null;
}

// 카테고리 코드 → DB UUID 매핑 (시작 시 한 번 로드)
async function loadCategoryMap() {
  const { data, error } = await supabase.from("categories").select("id, code, name, sort_order");
  if (error) throw new Error("categories 로드 실패: " + error.message);
  const map = {};
  for (const cat of data) {
    if (cat.code) map[cat.code] = cat.id;
    if (cat.name) map[cat.name] = cat.id;
  }
  return map;
}

async function loadRegionMap() {
  const { data, error } = await supabase.from("regions").select("id, code, name, full_name");
  if (error) throw new Error("regions 로드 실패: " + error.message);
  const map = {};
  for (const region of data) {
    if (region.code) map[region.code] = region.id;
    if (region.name) map[region.name] = region.id;
    if (region.full_name) map[region.full_name] = region.id;
  }
  return map;
}

async function loadAudienceMap() {
  const { data, error } = await supabase
    .from("audience_groups")
    .select("id, name, min_age, max_age, gender_restriction");
  if (error) throw new Error("audience_groups 로드 실패: " + error.message);

  const map = {};
  for (const audience of data ?? []) {
    if (audience.name) map[audience.name] = audience;
  }
  return map;
}

const AUDIENCE_DEFINITIONS = {
  youth: { name: "청년", description: "청년 대상 공고", min_age: 19, max_age: 39, gender_restriction: "None" },
  teen: { name: "청소년", description: "청소년 대상 공고", min_age: 9, max_age: 24, gender_restriction: "None" },
  middle_aged: { name: "중장년", description: "중장년 대상 공고", min_age: 40, max_age: 64, gender_restriction: "None" },
  senior: { name: "어르신", description: "어르신 대상 공고", min_age: 65, max_age: null, gender_restriction: "None" },
  child: { name: "아동", description: "아동 대상 공고", min_age: 0, max_age: 12, gender_restriction: "None" },
  women: { name: "여성", description: "여성 대상 공고", min_age: null, max_age: null, gender_restriction: "female" },
};

const CATEGORY_DEFINITIONS = {
  CAT_WELFARE: {
    name: "지원금/복지",
    sort_order: 1,
    keywords: ["복지", "지원금", "수당", "보조금", "급여", "장애", "장애인", "노인", "저소득", "취약", "돌봄", "상담", "센터", "가족돌봄", "생활지원", "누구나"],
  },
  CAT_EDUCATION: {
    name: "교육/취업",
    sort_order: 2,
    keywords: ["교육", "취업", "채용", "일자리", "훈련", "강좌", "강의", "특강", "멘토링", "컨설팅", "자격증", "학교", "교육생", "수강", "커리어", "NCS", "AI", "창업"],
  },
  CAT_CULTURE: {
    name: "문화/행사",
    sort_order: 3,
    keywords: ["문화", "행사", "축제", "전시", "공연", "체험", "클래스", "원데이", "버스킹", "도서관", "예술", "영화", "음악", "공예", "탐방"],
  },
  CAT_HOUSING: {
    name: "주거/금융",
    sort_order: 4,
    keywords: ["주거", "월세", "전세", "임대", "부동산", "대출", "금융", "재무", "자산", "저축", "계좌", "카드", "환급"],
  },
  CAT_BUSINESS: {
    name: "소상공인",
    sort_order: 5,
    keywords: ["소상공인", "자영업", "상인", "가게", "점포", "시장", "사업자", "로컬", "벤처", "창업", "기업", "중소기업"],
  },
  CAT_FAMILY: {
    name: "육아/가족",
    sort_order: 6,
    keywords: ["육아", "가족", "부모", "아동", "어린이", "청소년", "보육", "출산", "아이", "돌봄", "가족센터", "1인가구", "반려"],
  },
  CAT_HEALTH: {
    name: "건강/의료",
    sort_order: 7,
    keywords: ["건강", "의료", "병원", "검진", "치료", "재활", "운동", "체육", "보건", "심리", "마음", "상담", "고혈압", "장애인돌봄"],
  },
  CAT_OTHER: {
    name: "기타",
    sort_order: 99,
    keywords: [],
  },
};

// 크롤러 카테고리 레이블 → PosterLink categories.code 매핑
const CATEGORY_CODE_MAP = {
  "공지": "CAT_OTHER",
  "공고": "CAT_OTHER",
  "채용": "CAT_EDUCATION",
  "문화": "CAT_CULTURE",
  "장학": "CAT_EDUCATION",
  "일자리": "CAT_EDUCATION",
  "노동": "CAT_WELFARE",
  "청소년": "CAT_EDUCATION",
  "복지": "CAT_WELFARE",
  "노인복지": "CAT_WELFARE",
  "체육": "CAT_HEALTH",
  "안전": "CAT_OTHER",
  "급식": "CAT_FAMILY",
  "동주민센터": "CAT_OTHER",
  "입법": "CAT_OTHER",
};

async function ensureCategory(categoryMap, code) {
  if (categoryMap[code]) return categoryMap[code];

  const definition = CATEGORY_DEFINITIONS[code] ?? CATEGORY_DEFINITIONS.CAT_OTHER;
  const { data, error } = await supabase
    .from("categories")
    .upsert({
      code,
      name: definition.name,
      sort_order: definition.sort_order,
      is_active: true,
    }, { onConflict: "code" })
    .select("id")
    .single();

  if (error) {
    console.warn(`  카테고리 자동 생성 실패: ${code} — ${error.message}`);
    return categoryMap.CAT_OTHER;
  }

  categoryMap[code] = data.id;
  categoryMap[definition.name] = data.id;
  console.log(`\n  카테고리 자동 생성/확인: ${definition.name} (${code})`);
  return data.id;
}

function inferCategoryCodes(post, classification = null) {
  const categories = classification?.categories ?? inferPosterClassification(post).categories;
  const codes = categories.map((category) => category.code).filter(Boolean);
  return codes.length > 0 ? [...new Set(codes)].slice(0, 2) : ["CAT_OTHER"];
}

async function assignPosterCategories(posterId, post, categoryMap, classification = null) {
  const categoryCodes = inferCategoryCodes(post, classification);
  for (const categoryCode of categoryCodes) {
    const categoryId = await ensureCategory(categoryMap, categoryCode);
    if (!categoryId) continue;
    await supabase.from("poster_categories").upsert({
      poster_id: posterId,
      category_id: categoryId,
    }, { onConflict: "poster_id,category_id", ignoreDuplicates: true });
  }
}

async function assignPosterRegions(posterId, post, regionMap, classification = null) {
  const regionCodes = classification?.regionCodes ?? inferPosterClassification(post).regionCodes;
  for (const regionCode of regionCodes) {
    const regionId = regionMap[regionCode];
    if (!regionId) continue;
    await supabase.from("poster_regions").upsert({
      poster_id: posterId,
      region_id: regionId,
    }, { onConflict: "poster_id,region_id", ignoreDuplicates: true });
  }
}

async function ensureAudience(audienceMap, audienceCode) {
  const definition = AUDIENCE_DEFINITIONS[audienceCode];
  if (!definition) return null;
  if (audienceMap[definition.name]?.id) return audienceMap[definition.name].id;

  const { data: existing, error: lookupError } = await supabase
    .from("audience_groups")
    .select("id, name, min_age, max_age, gender_restriction")
    .eq("name", definition.name)
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    console.warn(`  audience lookup failed: ${definition.name} - ${lookupError.message}`);
    return null;
  }
  if (existing?.id) {
    audienceMap[definition.name] = existing;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("audience_groups")
    .insert({
      name: definition.name,
      description: definition.description,
      min_age: definition.min_age,
      max_age: definition.max_age,
      gender_restriction: definition.gender_restriction,
      is_active: true,
    })
    .select("id, name, min_age, max_age, gender_restriction")
    .single();

  if (error) {
    console.warn(`  audience create failed: ${definition.name} - ${error.message}`);
    return null;
  }

  audienceMap[definition.name] = data;
  return data.id;
}

async function assignPosterAudiences(posterId, classification, audienceMap) {
  const audiences = (classification?.audiences ?? [])
    .filter((audience) => audience.assignable && audience.confidence >= 0.58)
    .slice(0, 3);
  for (const audience of audiences) {
    const audienceId = await ensureAudience(audienceMap, audience.code);
    if (!audienceId) continue;
    await supabase.from("poster_audiences").upsert({
      poster_id: posterId,
      audience_id: audienceId,
    }, { onConflict: "poster_id,audience_id", ignoreDuplicates: true });
  }
}

function hasPosterImage(post) {
  return Array.isArray(post.images) && post.images.length > 0 && Boolean(post.images[0]);
}

const VOLATILE_SOURCE_PARAMS = new Set([
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
  "sortOrder",
  "sortDirection",
  "listType",
  "baNotice",
  "baCommSelec",
  "baOpenDay",
  "baUse",
  "searchKeyword",
  "searchCondition",
]);

function normalizeSourceKey(sourceUrl) {
  if (!sourceUrl) return null;

  try {
    const url = new URL(sourceUrl);
    for (const param of VOLATILE_SOURCE_PARAMS) {
      url.searchParams.delete(param);
    }

    const sortedParams = [...url.searchParams.entries()]
      .filter(([, value]) => String(value ?? "").trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, value] of sortedParams) {
      url.searchParams.append(key, value);
    }

    url.hash = "";
    return url.href;
  } catch {
    return String(sourceUrl).trim();
  }
}

const APPLICATION_LINK_LABEL_PATTERN = /신청|접수|지원|응모|등록|apply|application/i;
const POSTER_LINK_TYPES = new Set([
  "official_notice",
  "official_apply",
  "official_homepage",
  "reference_blog",
  "reference_news",
  "reference_video",
  "other",
]);

function normalizeCrawlerLinkUrl(value, baseUrl) {
  const text = String(value ?? "").trim();
  if (!text || /^javascript:/i.test(text) || text === "#") return null;
  if (/^(mailto|tel):/i.test(text)) return text;
  if (/^\/\//.test(text)) return `https:${text}`;
  try {
    return new URL(text, baseUrl || undefined).href;
  } catch {
    return null;
  }
}

function linkIdentity(url) {
  if (/^(mailto|tel):/i.test(url)) return url.toLowerCase();
  return normalizeSourceUrl(url);
}

function isUsableApplicationLink(url, sourceUrl) {
  if (!url) return false;
  if (/^(mailto|tel):/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".") || /^localhost$/i.test(parsed.hostname)) return false;

    const sourceHost = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "";
    const linkHost = parsed.hostname.replace(/^www\./, "");
    const meaningfulPath = `${parsed.pathname}${parsed.search}`.replace(/[/?&=_-]/g, "").length >= 4;
    if (sourceHost && linkHost === sourceHost && !meaningfulPath) return false;
    return true;
  } catch {
    return false;
  }
}

function getAttachmentLabel(attachment) {
  return String(attachment?.name ?? attachment?.title ?? attachment?.label ?? "").replace(/\s+/g, " ").trim();
}

function extractInlineUrls(text) {
  const source = String(text ?? "");
  return [...source.matchAll(/https?:\/\/[^\s<>"')\]}]+/gi)].map((match) => {
    const index = match.index ?? 0;
    return {
      url: match[0].replace(/[.,;:]+$/, ""),
      context: source.slice(Math.max(0, index - 80), Math.min(source.length, index + match[0].length + 80)),
    };
  });
}

function buildPosterLinkEntries(post, sourceUrl) {
  const linkMap = new Map();
  const addLink = (linkType, url, title, isPrimary = false) => {
    const normalizedUrl = normalizeCrawlerLinkUrl(url, sourceUrl);
    if (!normalizedUrl) return;
    const normalizedLinkType = POSTER_LINK_TYPES.has(linkType) ? linkType : "other";
    const key = `${normalizedLinkType}:${linkIdentity(normalizedUrl)}`;
    if (linkMap.has(key)) {
      const existing = linkMap.get(key);
      existing.is_primary = Boolean(existing.is_primary || isPrimary);
      return;
    }
    linkMap.set(key, {
      link_type: normalizedLinkType,
      url: normalizedUrl,
      title,
      is_primary: isPrimary,
    });
  };

  for (const entry of post.links ?? post.poster_links ?? []) {
    const label = getAttachmentLabel(entry) || "참고 링크";
    const url = normalizeCrawlerLinkUrl(entry?.url, sourceUrl);
    const linkType = POSTER_LINK_TYPES.has(entry?.link_type) ? entry.link_type : "other";
    if (!url) continue;
    if (linkType === "official_apply" && !isUsableApplicationLink(url, sourceUrl)) continue;
    if (linkType === "official_notice" && linkIdentity(url) === linkIdentity(sourceUrl)) continue;
    addLink(linkType, url, label, Boolean(entry?.is_primary));
  }

  for (const attachment of post.attachments ?? []) {
    const label = getAttachmentLabel(attachment);
    const url = normalizeCrawlerLinkUrl(attachment?.url, sourceUrl);
    if (!url || !APPLICATION_LINK_LABEL_PATTERN.test(label)) continue;
    if (!isUsableApplicationLink(url, sourceUrl)) continue;
    if (linkIdentity(url) === linkIdentity(sourceUrl)) continue;
    addLink("official_apply", url, label || "공식 신청 링크", true);
  }

  for (const entry of extractInlineUrls(post.content)) {
    if (!APPLICATION_LINK_LABEL_PATTERN.test(entry.context)) continue;
    if (!isUsableApplicationLink(entry.url, sourceUrl)) continue;
    if (linkIdentity(entry.url) === linkIdentity(sourceUrl)) continue;
    addLink("official_apply", entry.url, "공식 신청 링크", true);
  }

  const hasApplyLink = [...linkMap.values()].some((link) => link.link_type === "official_apply");
  addLink("official_notice", sourceUrl, "공식 공고 원문", !hasApplyLink);

  let primaryAssigned = false;
  return [...linkMap.values()].map((link) => {
    const isPrimary = !primaryAssigned && Boolean(link.is_primary);
    if (isPrimary) primaryAssigned = true;
    return { ...link, is_primary: isPrimary };
  });
}

async function insertPosterLinks(posterId, links) {
  if (!posterId || links.length === 0) return;

  const rows = links.map((link) => ({
    poster_id: posterId,
    link_type: link.link_type,
    url: link.url,
    title: link.title,
    is_primary: link.is_primary,
  }));

  const { error } = await supabase.from("poster_links").insert(sanitizeForPostgrest(rows));
  if (error) throw error;
}

function cleanSummaryText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\bRSS\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOcrText(value, maxLength = 1200) {
  const text = cleanSummaryText(value);
  return text ? Array.from(text).slice(0, maxLength).join("") : "";
}

function getPosterImageInsight(post = {}) {
  const contentVerification = post.posterContentVerification ?? post.posterImageCheck?.content ?? null;
  const imageClassification = post.imageClassification ?? post.posterImageCheck?.model ?? null;
  const posterTextSummary = cleanOcrText(contentVerification?.posterTextSummary ?? "");
  if (!posterTextSummary && !contentVerification && !imageClassification) return null;

  return {
    posterTextSummary: posterTextSummary || null,
    contentMatch: contentVerification
      ? {
          isSameNotice: Boolean(contentVerification.isSameNotice),
          confidence: typeof contentVerification.confidence === "number" ? contentVerification.confidence : null,
          decision: contentVerification.decision ?? null,
          reason: contentVerification.reason ? String(contentVerification.reason).slice(0, 500) : null,
          matchedFields: Array.isArray(contentVerification.matchedFields) ? contentVerification.matchedFields.slice(0, 12) : [],
          mismatchedFields: Array.isArray(contentVerification.mismatchedFields) ? contentVerification.mismatchedFields.slice(0, 12) : [],
          model: contentVerification.model ?? null,
          checkedAt: contentVerification.checkedAt ?? null,
        }
      : null,
    imageClassification: imageClassification
      ? {
          isPoster: Boolean(imageClassification.isPoster),
          confidence: typeof imageClassification.confidence === "number" ? imageClassification.confidence : null,
          visualType: imageClassification.visualType ?? null,
          reason: imageClassification.reason ? String(imageClassification.reason).slice(0, 500) : null,
          model: imageClassification.model ?? null,
          checkedAt: imageClassification.checkedAt ?? null,
        }
      : null,
  };
}

function buildAiContentWithPosterImageText(post = {}, posterImageInsight = null) {
  const posterTextSummary = cleanOcrText(posterImageInsight?.posterTextSummary ?? "");
  return [
    post.content,
    posterTextSummary ? `Poster image OCR/vision text summary:\n${posterTextSummary}` : "",
  ].filter(Boolean).join("\n\n");
}

function mergePosterImageInsightIntoFieldVerification(verification = {}, posterImageInsight = null) {
  if (!posterImageInsight) return verification;
  return {
    ...verification,
    posterImageOcr: posterImageInsight,
  };
}

function looksMojibake(value) {
  const text = String(value ?? "");
  if (!text) return false;
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  return replacementCount >= 2 || /[�]{1,}/.test(text);
}

function isInvalidCrawlerTitle(value) {
  const title = String(value ?? "").replace(/\s+/g, " ").trim();
  return (
    !title ||
    /^(\uC791\uC131\uC790|\uAD00\uB9AC\uC790|\uBC88\uD638|\uC81C\uBAA9|\uACF5\uC9C0\uC0AC\uD56D|\uC870\uD68C\uC218|\uCCA8\uBD80\uD30C\uC77C|maposc)$/i.test(title) ||
    /^\uC791\uC131\uC790\s*:/i.test(title) ||
    title === "\uC2DC\uC2A4\uD15C \uC624\uB958 \uC785\uB2C8\uB2E4." ||
    title === "@\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5" ||
    title === "\uB3D9\uC544\uC77C\uBCF4" ||
    title === "(\uC8FC)\uC5D0\uB4C0\uC70C" ||
    title === "\uC5D0\uC774\uBE14\uB7F0" ||
    title === "\uC5D0\uC774\uBE14\uB7F0 \uC548\uB0B4" ||
    /^\uC11C\uC6B8\uD2B9\uBCC4\uC2DC\s+\S+\uAD6C$/.test(title) ||
    /\uCCAD\uB144\uC815\uCC45\s*>\s*\uCCAD\uB144\uC815\uCC45\uAC80\uC0C9\s*>\s*\uCCAD\uB144\uC9C0\uC6D0\uC815\uBCF4/.test(title)
  );
}

function pickField(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]?\\s*([^\\n。.!?]{4,90})`, "i");
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function pickDateRange(text) {
  const patterns = [
    /(신청|접수|모집|운영|교육)\s*(기간|일시)?\s*[:：]?\s*([~.\-\/()\d\s년월일:]+(?:까지|부터)?)/,
    /(\d{4}[.\-\/년]\s*\d{1,2}[.\-\/월]\s*\d{1,2}일?\s*(?:\([^)]*\))?\s*[~\-]\s*\d{4}?[.\-\/년]?\s*\d{1,2}[.\-\/월]\s*\d{1,2}일?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[3] ?? match?.[1];
    if (value) return value.replace(/\s+/g, " ").trim();
  }

  return null;
}

function normalizeSummary(post) {
  const title = cleanSummaryText(post.title);
  const content = cleanSummaryText(post.content);
  if (!content && !title) return null;

  const source = `${title}\n${content}`;
  const parts = [];
  const period = pickDateRange(source);
  const target = pickField(source, ["대상", "지원대상", "모집대상", "참여대상", "신청대상"]);
  const benefit = pickField(source, ["내용", "지원내용", "주요내용", "사업내용", "교육내용", "프로그램"]);
  const contact = pickField(source, ["문의", "문의처", "연락처"]);

  if (target) parts.push(`대상: ${target}`);
  if (period) parts.push(`기간: ${period}`);
  if (benefit) parts.push(`내용: ${benefit}`);
  if (contact) parts.push(`문의: ${contact}`);

  if (parts.length > 0) {
    return parts.join(" · ").slice(0, 300);
  }

  const sentence = content
    .split(/(?<=[.!?。])\s+|[\n\r]+/)
    .map((line) => line.trim())
    .find((line) => line.length >= 20 && !/(목록|공유|첨부파일|이전글|다음글)/.test(line));

  const fallback = sentence || content || title;
  return fallback.length > 300 ? `${fallback.slice(0, 297).trim()}...` : fallback;
}

function normalizeImageUrl(imageUrl, sourceUrl) {
  if (!imageUrl) return null;
  const value = String(imageUrl).trim();
  if (!value) return null;
  if (/^(https?:|data:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  try {
    return new URL(value, sourceUrl).href;
  } catch {
    return value;
  }
}

function normalizePostImages(post, sourceUrl) {
  return [...new Set((post.images ?? [])
    .map((imageUrl) => normalizeImageUrl(imageUrl, sourceUrl))
    .filter(Boolean))];
}

function isTextNoticePost(post, sourceImages = []) {
  return sourceImages.length === 0
    && !hasPosterImage(post)
    && (post?.noticeOnly === true || post?.contentMode === "text_notice");
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createQualityReportEntry(post, sourceUrl, quality) {
  return {
    title: post.title ?? null,
    site: post.site ?? null,
    board: post.board ?? null,
    category: post.category ?? null,
    source_url: sourceUrl ?? null,
    decision: quality.decision,
    issue_score: quality.issue_score,
    issues: quality.issues,
    images: post.images ?? [],
  };
}

const QUALITY_ISSUE_FIELD_CODES = new Set([
  "bad-application-url",
  "known-source-title-risk",
  "weak-summary",
  "missing-org",
  "low-image-confidence",
  "low-content-match-confidence",
  "text-notice-no-image",
]);

function mergeQualityIssuesIntoFieldVerification(verification = {}, quality = {}) {
  const qualityIssues = (quality.issues ?? [])
    .filter((issue) => QUALITY_ISSUE_FIELD_CODES.has(issue.code))
    .slice(0, 8);
  if (qualityIssues.length === 0) return verification;

  const qualityReason = qualityIssues
    .slice(0, 4)
    .map((issue) => `${issue.code}: ${issue.reason}`)
    .join("; ");
  const confidence = typeof verification.confidence === "number"
    ? Math.min(verification.confidence, 0.45)
    : 0.45;

  return {
    ...verification,
    confidence,
    decision: "needs_review",
    reason: [verification.reason, qualityReason].filter(Boolean).join(" | ").slice(0, 800),
    qualityIssues,
  };
}

function normalizeOrgInfoText(value, maxLength = 200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeOrgCompare(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]{}]/g, "")
    .trim();
}

function enrichOrganizationVerification(verification = {}, post = {}, sourceUrl = null) {
  const existing = verification?.organization && typeof verification.organization === "object"
    ? verification.organization
    : {};
  const sourceOrgName = normalizeOrgInfoText(
    existing.sourceOrgName ??
    verification.sourceOrgName ??
    post.site
  );
  const organizerName = normalizeOrgInfoText(
    existing.organizerName ??
    verification.organizerName ??
    verification.correctedOrgName
  );
  const hostName = normalizeOrgInfoText(existing.hostName ?? verification.hostName);
  const operatorName = normalizeOrgInfoText(existing.operatorName ?? verification.operatorName);
  const displayOrgName = normalizeOrgInfoText(
    existing.displayOrgName ??
    verification.correctedOrgName ??
    organizerName ??
    hostName ??
    sourceOrgName
  );
  const sourceDiffersFromOrganizer = Boolean(
    sourceOrgName &&
    displayOrgName &&
    normalizeOrgCompare(sourceOrgName) !== normalizeOrgCompare(displayOrgName)
  );

  return {
    ...verification,
    sourceOrgName,
    organizerName,
    hostName,
    operatorName,
    organization: {
      ...existing,
      sourceOrgName,
      organizerName,
      hostName,
      operatorName,
      displayOrgName,
      sourceDiffersFromOrganizer,
      sourceOrgRole: normalizeOrgInfoText(existing.sourceOrgRole ?? verification.sourceOrgRole, 80),
      evidence: normalizeOrgInfoText(existing.evidence ?? verification.organizationEvidence, 500),
      confidence: Number(existing.confidence ?? verification.organizationConfidence ?? verification.confidence ?? 0),
      boardName: normalizeOrgInfoText(post.board, 160),
      collectionSourceSlug: normalizeOrgInfoText(post.collectionSourceSlug ?? post.siteId, 120),
      sourceUrl,
    },
  };
}

function mergeClassificationIntoFieldVerification(verification = {}, classification = {}) {
  const classificationIssues = (classification.issues ?? []).slice(0, 8);
  if (classificationIssues.length === 0) {
    return {
      ...verification,
      classification: {
        categories: classification.categories ?? [],
        regions: classification.regions ?? [],
        audiences: classification.audiences ?? [],
        confidence: classification.confidence ?? null,
      },
    };
  }

  const classificationReason = classificationIssues
    .slice(0, 4)
    .map((issue) => `${issue.code}: ${issue.reason}`)
    .join("; ");
  const confidence = typeof verification.confidence === "number"
    ? Math.min(verification.confidence, 0.5)
    : 0.5;

  return {
    ...verification,
    confidence,
    decision: "needs_review",
    reason: [verification.reason, classificationReason].filter(Boolean).join(" | ").slice(0, 800),
    classificationIssues,
    classification: {
      categories: classification.categories ?? [],
      regions: classification.regions ?? [],
      audiences: classification.audiences ?? [],
      confidence: classification.confidence ?? null,
    },
  };
}

async function upsertNoticeCandidate(post, {
  sourceUrl,
  sourceKey,
  verifiedOrgName,
  finalDeadline,
  fieldVerification,
  quality,
}) {
  const summaryShort = normalizeSummary(post);
  const summaryLong = cleanSummaryText(post.content) || null;
  const record = sanitizeForPostgrest({
    source_key: sourceKey,
    source_url: sourceUrl,
    title: (post.title || "제목 없음").substring(0, 200),
    source_org_name: verifiedOrgName || post.site || null,
    summary_short: summaryShort,
    summary_long: summaryLong,
    candidate_status: "pending",
    candidate_type: "text_notice",
    source_site_id: post.siteId ?? null,
    collection_source_slug: post.collectionSourceSlug ?? post.siteId ?? null,
    board_name: post.board ?? null,
    category_name: post.category ?? null,
    notice_date: toIsoOrNull(post.date ?? post.createdAt ?? post.publishedAt),
    application_end_at: finalDeadline ? toIsoOrNull(finalDeadline) : null,
    reason: "poster image missing; stored as notice candidate",
    quality_issues: quality?.issues ?? [],
    field_verification: fieldVerification ?? {},
    raw_payload: post,
  });

  const { data: existing, error: existingError } = await supabase
    .from("poster_notice_candidates")
    .select("id,candidate_status")
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (existingError) throw new Error(`notice_candidate_lookup:${existingError.message}`);

  if (existing?.id) {
    const updateRecord = { ...record };
    delete updateRecord.source_key;
    delete updateRecord.candidate_status;

    const { error: updateError } = await supabase
      .from("poster_notice_candidates")
      .update(updateRecord)
      .eq("id", existing.id);

    if (updateError) throw new Error(`notice_candidate_update:${updateError.message}`);
    return { created: false, id: existing.id };
  }

  const { data, error } = await supabase
    .from("poster_notice_candidates")
    .insert(record)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`notice_candidate_insert:${error?.message ?? "insert returned no row"}`);
  }

  return { created: true, id: data.id };
}

async function writeUploadQualityReport(inputFilePath, qualityReport) {
  const rejected = qualityReport.rejected ?? [];
  const review = qualityReport.review ?? [];
  if (rejected.length === 0 && review.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = `data/results/upload-quality-${timestamp}.json`;
  await fs.mkdir("data/results", { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    input_file: inputFilePath,
    summary: {
      rejected_count: rejected.length,
      review_warning_count: review.length,
    },
    rejected,
    review,
  }, null, 2), "utf-8");
  return reportPath;
}

function getImageExtension(imageUrl, contentType) {
  const contentTypeExtension = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[contentType?.split(";")[0]?.toLowerCase()];
  if (contentTypeExtension) return contentTypeExtension;

  try {
    const pathname = new URL(imageUrl).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    // Keep default extension below.
  }

  return "jpg";
}

async function importImageToStorage(imageUrl, sourceKey, index) {
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.includes("/storage/v1/object/public/")) return imageUrl;

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 image import",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
    },
  });

  if (!response.ok) throw new Error(`image download failed (${response.status})`);

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`not an image content type: ${contentType}`);
  }

  const imageBytes = new Uint8Array(await response.arrayBuffer());
  const hash = crypto.createHash("sha256").update(`${sourceKey}:${imageUrl}:${index}`).digest("hex").slice(0, 24);
  const ext = getImageExtension(imageUrl, contentType);
  const storagePath = `crawler/${hash}.${ext}`;

  const { error } = await supabase.storage
    .from(POSTER_IMAGE_BUCKET)
    .upload(storagePath, imageBytes, { contentType, upsert: true });
  if (error) throw error;

  return supabase.storage.from(POSTER_IMAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

async function importPostImagesToStorage(post, sourceUrl, sourceKey) {
  const imageUrls = normalizePostImages(post, sourceUrl);
  const imported = [];

  for (const [index, imageUrl] of imageUrls.entries()) {
    try {
      imported.push(await importImageToStorage(imageUrl, sourceKey, index));
    } catch (error) {
      console.warn(`\n  이미지 스토리지 가져오기 실패: ${imageUrl} — ${error.message}`);
      imported.push(imageUrl);
    }
  }

  return [...new Set(imported)];
}

async function syncPosterImages(posterId, post, sourceUrl) {
  const images = normalizePostImages(post, sourceUrl);
  if (images.length === 0) return;

  try {
    await replacePosterImagesWithStorageCleanup(supabase, posterId, images, {
      bucket: POSTER_IMAGE_BUCKET,
    });
  } catch (error) {
    console.warn(`\n  poster_images 저장 실패: ${post.title} — ${error.message}`);
  }
}

function chunkArray(items, size = 100) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function groupByPosterId(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.poster_id) ?? [];
    list.push(row);
    map.set(row.poster_id, list);
  }
  return map;
}

async function fetchByPosterIds(table, columns, posterIds, batchSize = 100) {
  const rows = [];
  for (const batchIds of chunkArray(posterIds, batchSize)) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("poster_id", batchIds);

    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function loadNoticeCandidateDuplicateCandidates(limit) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("poster_notice_candidates")
      .select("id,title,source_org_name,candidate_status,created_at,application_end_at,source_key,source_url,summary_short,summary_long,field_verification")
      .in("candidate_status", ["pending", "drafting"])
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (error) {
      console.warn(`Notice candidate duplicate load failed: ${error.message}`);
      return [];
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows.map((row) => ({
    ...row,
    duplicateTargetType: "notice_candidate",
    poster_status: row.candidate_status,
    sourceUrl: row.source_url,
    url: row.source_url,
    poster_images: [],
    poster_links: row.source_url
      ? [{
          url: row.source_url,
          title: "이미지 없는 후보 원문",
          link_type: "official_notice",
          is_primary: true,
        }]
      : [],
  }));
}

async function loadDuplicateCandidates() {
  const limit = Number.isFinite(POSTER_DUPLICATE_LOOKUP_LIMIT)
    ? Math.max(0, POSTER_DUPLICATE_LOOKUP_LIMIT)
    : 5000;
  if (limit === 0) return [];

  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,created_at,application_end_at,thumbnail_url,source_key,summary_short,summary_long,field_verification")
      .in("poster_status", ["review", "published"])
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (error) {
      console.warn(`Duplicate candidate load failed: ${error.message}`);
      return [];
    }

    rows.push(...(data ?? []).map((row) => ({ ...row, duplicateTargetType: "poster" })));
    if (!data || data.length < pageSize) break;
  }

  const posterIds = rows.map((row) => row.id).filter(Boolean);
  if (posterIds.length === 0) {
    const noticeRows = await loadNoticeCandidateDuplicateCandidates(limit);
    return noticeRows;
  }

  let posterRows = rows;
  try {
    const [imageRows, linkRows] = await Promise.all([
      fetchByPosterIds("poster_images", "poster_id,storage_path,width,height", posterIds),
      fetchByPosterIds("poster_links", "poster_id,url,title,link_type,is_primary", posterIds),
    ]);
    const imagesByPosterId = groupByPosterId(imageRows);
    const linksByPosterId = groupByPosterId(linkRows);
    posterRows = rows.map((row) => ({
      ...row,
      poster_images: imagesByPosterId.get(row.id) ?? [],
      poster_links: linksByPosterId.get(row.id) ?? [],
    }));
  } catch (error) {
    console.warn(`Duplicate relation load failed: ${error.message}`);
  }

  const noticeRows = await loadNoticeCandidateDuplicateCandidates(limit);
  return [...posterRows, ...noticeRows];
}

async function addSupplementalPosterLinks(posterId, linkEntries) {
  if (!posterId || !Array.isArray(linkEntries) || linkEntries.length === 0) return 0;

  const { data: existingLinks, error: selectError } = await supabase
    .from("poster_links")
    .select("id,url,is_primary")
    .eq("poster_id", posterId);

  if (selectError) {
    console.warn(`Supplemental link lookup failed: ${selectError.message}`);
    return 0;
  }

  const existing = existingLinks ?? [];
  const existingIdentities = new Set(existing.map((link) => linkIdentity(link.url)));
  const hasPrimary = existing.some((link) => link.is_primary);
  let assignedPrimary = hasPrimary;
  const rows = [];

  for (const link of linkEntries) {
    const identity = linkIdentity(link.url);
    if (!identity || existingIdentities.has(identity)) continue;
    existingIdentities.add(identity);
    const isPrimary = !assignedPrimary && Boolean(link.is_primary);
    if (isPrimary) assignedPrimary = true;
    rows.push({
      poster_id: posterId,
      link_type: link.link_type,
      url: link.url,
      title: link.title,
      is_primary: isPrimary,
    });
  }

  if (rows.length === 0) return 0;
  const { error: insertError } = await supabase.from("poster_links").insert(sanitizeForPostgrest(rows));
  if (insertError) {
    console.warn(`Supplemental link insert failed: ${insertError.message}`);
    return 0;
  }
  return rows.length;
}

function mergeDuplicateIssueIntoFieldVerification(verification = {}, issue) {
  if (!issue) return verification;

  const duplicateIssues = Array.isArray(verification.duplicateIssues)
    ? [...verification.duplicateIssues]
    : [];
  const alreadyPresent = duplicateIssues.some((existingIssue) => (
    existingIssue.duplicatePosterId === issue.duplicatePosterId
    && existingIssue.code === issue.code
  ));
  if (!alreadyPresent) duplicateIssues.push(issue);

  const duplicateReason = duplicateIssues
    .slice(0, 3)
    .map((entry) => `${entry.code}: ${entry.reason}`)
    .join("; ");
  const confidence = typeof verification.confidence === "number"
    ? Math.min(verification.confidence, 0.45)
    : 0.45;

  return {
    ...verification,
    confidence,
    decision: "needs_review",
    reason: [verification.reason, duplicateReason].filter(Boolean).join(" | ").slice(0, 800),
    duplicateIssues,
  };
}

function addDuplicateCandidate(candidates, posterId, posterRecord, post, sourceUrl, storedImages) {
  if (!posterId) return;
  candidates.unshift({
    id: posterId,
    title: posterRecord.title,
    source_org_name: posterRecord.source_org_name,
    poster_status: posterRecord.poster_status,
    application_end_at: posterRecord.application_end_at,
    thumbnail_url: posterRecord.thumbnail_url,
    source_key: posterRecord.source_key,
    summary_short: posterRecord.summary_short,
    summary_long: posterRecord.summary_long,
    images: storedImages,
    poster_images: storedImages.map((storagePath) => ({ storage_path: storagePath })),
    poster_links: sourceUrl
      ? [{
          url: sourceUrl,
          title: "\uACF5\uC2DD \uACF5\uACE0 \uC6D0\uBB38",
          link_type: "official_notice",
          is_primary: true,
        }]
      : [],
    deadline: post.deadline ?? null,
  });
}

function addNoticeDuplicateCandidate(candidates, candidateId, post, sourceKey, sourceUrl, verifiedOrgName, finalDeadline, fieldVerification) {
  if (!candidateId) return;
  candidates.unshift({
    id: candidateId,
    duplicateTargetType: "notice_candidate",
    title: post.title,
    source_org_name: verifiedOrgName || post.site || null,
    poster_status: "pending",
    application_end_at: finalDeadline ?? post.deadline ?? null,
    source_key: sourceKey,
    sourceUrl,
    url: sourceUrl,
    summary_short: normalizeSummary(post),
    summary_long: cleanSummaryText(post.content) || null,
    field_verification: fieldVerification ?? {},
    poster_images: [],
    poster_links: sourceUrl
      ? [{
          url: sourceUrl,
          title: "이미지 없는 후보 원문",
          link_type: "official_notice",
          is_primary: true,
        }]
      : [],
    deadline: finalDeadline ?? post.deadline ?? null,
  });
}

async function cleanupImageLessCrawlerReviews() {
  const { data, error } = await supabase
    .from("posters")
    .select("id")
    .not("source_key", "is", null)
    .eq("poster_status", "review")
    .is("thumbnail_url", null);

  if (error) {
    console.warn(`이미지 없는 크롤러 검수대기 정리 실패: ${error.message}`);
    return 0;
  }

  const ids = (data ?? []).map((row) => row.id);
  const { deletedRows } = await deletePostersWithStorage(supabase, ids, {
    bucket: POSTER_IMAGE_BUCKET,
    status: "review",
  });
  return deletedRows;
}

async function cleanupExcludedCrawlerReviews() {
  const { data, error } = await supabase
    .from("posters")
    .select("id, title")
    .not("source_key", "is", null)
    .eq("poster_status", "review")
    .limit(1000);

  if (error) {
    console.warn(`Excluded crawler review cleanup failed: ${error.message}`);
    return 0;
  }

  const excludedIds = (data ?? [])
    .filter((row) => getPostExclusionReason(row))
    .map((row) => row.id);

  if (excludedIds.length === 0) return 0;

  try {
    const { deletedRows } = await deletePostersWithStorage(supabase, excludedIds, {
      bucket: POSTER_IMAGE_BUCKET,
      status: "review",
    });
    return deletedRows;
  } catch (error) {
    console.warn(`Excluded crawler review delete failed: ${error.message}`);
    return 0;
  }
}

async function uploadToSupabase(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const posts = JSON.parse(raw);
  const textNoticePosts = posts.filter((post) => !hasPosterImage(post) && (post.noticeOnly === true || post.contentMode === "text_notice"));
  const collectionSources = await loadCollectionSources(supabase);
  const collectionStats = createCollectionSourceStats(collectionSources);

  for (const post of posts) {
    collectionStats.recordChecked(post);
  }

  console.log(`\n📤 ${posts.length}건을 Supabase에 업로드합니다. (텍스트 공고: ${textNoticePosts.length}건)\n`);

  const cleanedCount = process.env.CRAWLER_DELETE_IMAGELESS_REVIEWS === "1"
    ? await cleanupImageLessCrawlerReviews()
    : 0;
  const cleanedExcludedCount = await cleanupExcludedCrawlerReviews();
  if (cleanedCount > 0) {
    console.log(`이미지 없는 기존 크롤러 검수대기 ${cleanedCount}건 정리`);
  }
  if (cleanedExcludedCount > 0) {
    console.log(`제외 규칙에 걸린 기존 크롤러 검수대기 ${cleanedExcludedCount}건 정리`);
  }

  // 카테고리/지역 맵 로드
  const categoryMap = await loadCategoryMap();
  const regionMap = await loadRegionMap();
  const audienceMap = await loadAudienceMap();
  const duplicateCandidates = await loadDuplicateCandidates();

  let success = 0;
  let skip = 0;
  let fail = 0;
  let noticeCandidateSuccess = 0;
  let noticeCandidateDuplicate = 0;
  const skippedSourceKeys = [];
  const qualityRejected = [];
  const qualityReview = [];

  for (const post of posts) {
    const sourceUrl = post.sourceUrl || post.url;
    const sourceKey = normalizeSourceKey(sourceUrl);
    if (!sourceKey) {
      fail++;
      collectionStats.recordFailed(post, "missing_source_key");
      continue;
    }

    const postExclusion = getPostExclusionReason(post);
    if (postExclusion) {
      skip++;
      collectionStats.recordRejected(post, `post_filter:${postExclusion.rule}`);
      process.stdout.write("x");
      console.log(`\n  제외 규칙(${postExclusion.rule})으로 업로드 건너뜀: ${post.title} - ${postExclusion.reason}`);
      continue;
    }

    const sourceImages = normalizePostImages(post, sourceUrl);
    const linkEntries = buildPosterLinkEntries(post, sourceUrl);
    const posterImageInsight = getPosterImageInsight(post);
    const aiContent = buildAiContentWithPosterImageText(post, posterImageInsight);
    const aiPost = {
      ...post,
      content: aiContent || post.content,
      sourceUrl,
      source_key: sourceKey,
    };
    const classification = inferPosterClassification(aiPost);
    const quality = evaluatePosterQuality({ ...post, images: sourceImages }, {
      sourceKey,
      images: sourceImages,
      links: linkEntries.map((link) => link.url),
      linkEntries,
      sourceUrl,
      extractedDeadline: post.deadline ?? null,
      contentMode: post.contentMode,
    });
    const duplicateSearchCandidates = duplicateCandidates.filter((row) => !(
      row.duplicateTargetType === "notice_candidate" &&
      normalizeSourceKey(row.source_key ?? row.sourceUrl ?? row.url) === sourceKey
    ));
    const duplicateMatch = findBestPosterDuplicate({
      ...post,
      source_key: sourceKey,
      sourceUrl,
      url: sourceUrl,
      images: sourceImages,
      application_end_at: post.deadline ?? null,
    }, duplicateSearchCandidates);
    const duplicateIssue = duplicateIssueFromMatch(duplicateMatch);
    const duplicateTargetType = duplicateMatch.row?.duplicateTargetType ?? "poster";
    const shouldMergeDuplicate = duplicateMatch.decision === "merge" && duplicateTargetType === "poster" && duplicateMatch.row?.id;
    const shouldReviewDuplicate = duplicateIssue && !shouldMergeDuplicate && duplicateMatch.decision !== "none";
    if (shouldMergeDuplicate) {
      skip++;
      collectionStats.recordDuplicate(post);
      skippedSourceKeys.push(sourceKey);
      await addSupplementalPosterLinks(duplicateMatch.row.id, linkEntries);
      await assignPosterCategories(duplicateMatch.row.id, post, categoryMap, classification);
      await assignPosterRegions(duplicateMatch.row.id, post, regionMap, classification);
      await assignPosterAudiences(duplicateMatch.row.id, classification, audienceMap);
      process.stdout.write("=");
      console.log(`\n  Duplicate merged into existing poster ${duplicateMatch.row.id}: ${post.title} (${duplicateMatch.score})`);
      continue;
    }
    if (shouldReviewDuplicate) {
      quality.issues.push(duplicateIssue);
      quality.decision = "review";
      quality.issue_score += duplicateIssue.severity === "high" ? 5 : 3;
    }
    if (quality.decision === "reject") {
      skip++;
      collectionStats.recordRejected(post, `quality:${summarizeQualityIssues(quality)}`);
      qualityRejected.push(createQualityReportEntry({ ...post, images: sourceImages }, sourceUrl, quality));
      process.stdout.write("q");
      console.warn(`\n  Quality gate rejected: ${post.title} - ${summarizeQualityIssues(quality)}`);
      continue;
    }
    if (quality.issues.length > 0) {
      qualityReview.push(createQualityReportEntry({ ...post, images: sourceImages }, sourceUrl, quality));
    }

    const fieldVerificationResult = enrichOrganizationVerification(await verifyPosterFields({
      title: post.title,
      content: aiContent || post.content,
      site: post.site,
      sourceUrl,
      extractedDeadline: post.deadline ?? null,
      extractedOrgName: post.site ?? null,
    }), post, sourceUrl);
    const { deadline: verifiedDeadline, orgName: verifiedOrgName } = applyFieldVerification(post, fieldVerificationResult);
    const finalDateQuality = evaluatePosterDateQuality({
      ...post,
      content: aiContent || post.content,
    }, {
      extractedDeadline: verifiedDeadline ?? post.deadline ?? null,
    });
    const finalDeadline = chooseDeadlineForStorage(verifiedDeadline ?? post.deadline ?? null, finalDateQuality);
    let fieldVerification = mergeDateQualityIntoFieldVerification(fieldVerificationResult, finalDateQuality, {
      storedDeadline: finalDeadline,
    });
    fieldVerification = mergeClassificationIntoFieldVerification(fieldVerification, classification);
    fieldVerification = mergeQualityIssuesIntoFieldVerification(fieldVerification, quality);
    fieldVerification = mergePosterImageInsightIntoFieldVerification(fieldVerification, posterImageInsight);
    if (shouldReviewDuplicate) {
      fieldVerification = mergeDuplicateIssueIntoFieldVerification(fieldVerification, duplicateIssue);
    }

    if (isTextNoticePost(post, sourceImages)) {
      try {
        const candidateResult = await upsertNoticeCandidate(post, {
          sourceUrl,
          sourceKey,
          verifiedOrgName,
          finalDeadline,
          fieldVerification,
          quality,
        });
        addNoticeDuplicateCandidate(duplicateCandidates, candidateResult.id, post, sourceKey, sourceUrl, verifiedOrgName, finalDeadline, fieldVerification);
        if (candidateResult.created) {
          success++;
          noticeCandidateSuccess++;
          collectionStats.recordCreated(post);
          process.stdout.write("t");
        } else {
          skip++;
          noticeCandidateDuplicate++;
          collectionStats.recordDuplicate(post);
          skippedSourceKeys.push(sourceKey);
          process.stdout.write("~");
        }
      } catch (error) {
        fail++;
        collectionStats.recordFailed(post, error.message);
        process.stdout.write("!");
        console.error(`\n  Notice candidate save failed: ${post.title} — ${error.message}`);
      }
      continue;
    }

    const storedImages = await importPostImagesToStorage(post, sourceUrl, sourceKey);
    const postWithStoredImages = { ...post, images: storedImages };

    // ── 1. posters 테이블 upsert ─────────────────────────────
    const summaryShort = normalizeSummary(postWithStoredImages);
    const summaryLong = cleanSummaryText(postWithStoredImages.content) || posterImageInsight?.posterTextSummary || null;
    const embedding = await embedPosterText({ title: post.title, summaryShort, summaryLong });

    const posterRecord = sanitizeForPostgrest({
      title: (post.title || "제목 없음").substring(0, 200),
      source_org_name: verifiedOrgName || null,
      summary_short: summaryShort,
      summary_long: summaryLong,
      poster_status: "review",         // 관리자 검수 대기
      source_key: sourceKey,           // 중복 방지 키
      created_by: CRAWLER_USER_ID,     // 크롤러 봇 계정 (null 가능)
      application_end_at: finalDeadline
        ? (() => { try { return new Date(finalDeadline).toISOString(); } catch { return null; } })()
        : null,
      thumbnail_url: storedImages[0] ?? null,
      field_verification: fieldVerification,
      embedding: embeddingToPgVector(embedding),
    });
    if (isInvalidCrawlerTitle(posterRecord.title)) {
      fail++;
      collectionStats.recordRejected(post, "invalid_title");
      process.stdout.write("!");
      console.warn(`\n  잘못된 제목으로 판단되어 저장 건너뜀: ${posterRecord.title} — ${sourceUrl}`);
      continue;
    }

    const sourceKeyCandidates = [...new Set([sourceKey, sourceUrl].filter(Boolean))];
    const { data: existingPoster, error: existingErr } = await supabase
      .from("posters")
      .select("id, poster_status, title, summary_short, summary_long, thumbnail_url, source_key, embedding, field_verification, application_end_at")
      .in("source_key", sourceKeyCandidates)
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      fail++;
      collectionStats.recordFailed(post, `existing_lookup:${existingErr.message}`);
      process.stdout.write("✗");
      console.error(`\n  기존 포스터 확인 실패: ${post.title} — ${existingErr.message}`);
      continue;
    }

    if (existingPoster?.id) {
      skip++;
      collectionStats.recordDuplicate(post);
      skippedSourceKeys.push(sourceKey);
      await addSupplementalPosterLinks(existingPoster.id, linkEntries);
      const updates = {};
      if (
        posterRecord.title !== "제목 없음" &&
        (!existingPoster.title || existingPoster.title === "제목 없음" || looksMojibake(existingPoster.title) || isInvalidCrawlerTitle(existingPoster.title))
      ) {
        updates.title = posterRecord.title;
      }
      if (posterRecord.summary_short && (!existingPoster.summary_short || looksMojibake(existingPoster.summary_short))) {
        updates.summary_short = posterRecord.summary_short;
      } else if (existingPoster.summary_short && looksMojibake(existingPoster.summary_short)) {
        updates.summary_short = null;
      }
      if (posterRecord.summary_long && (!existingPoster.summary_long || looksMojibake(existingPoster.summary_long))) {
        updates.summary_long = posterRecord.summary_long;
      } else if (existingPoster.summary_long && looksMojibake(existingPoster.summary_long)) {
        updates.summary_long = null;
      }
      if (posterRecord.thumbnail_url && existingPoster.thumbnail_url !== posterRecord.thumbnail_url) {
        updates.thumbnail_url = posterRecord.thumbnail_url;
      }
      if (existingPoster.source_key !== sourceKey) {
        updates.source_key = sourceKey;
      }
      if (!existingPoster.embedding && posterRecord.embedding) {
        updates.embedding = posterRecord.embedding;
      }
      if (!existingPoster.application_end_at && posterRecord.application_end_at) {
        updates.application_end_at = posterRecord.application_end_at;
      }
      const hasReviewIssues = (verification) => (
        ["dateIssues", "classificationIssues", "qualityIssues", "duplicateIssues"]
          .some((key) => Array.isArray(verification?.[key]) && verification[key].length > 0)
      );
      const nextHasReviewIssues = hasReviewIssues(posterRecord.field_verification);
      const existingHasReviewIssues = hasReviewIssues(existingPoster.field_verification);
      const nextHasClassification = Boolean(posterRecord.field_verification?.classification);
      const existingHasClassification = Boolean(existingPoster.field_verification?.classification);
      const nextHasPosterImageOcr = Boolean(posterRecord.field_verification?.posterImageOcr?.posterTextSummary);
      const existingHasPosterImageOcr = Boolean(existingPoster.field_verification?.posterImageOcr?.posterTextSummary);
      if (
        !existingPoster.field_verification ||
        (nextHasReviewIssues && !existingHasReviewIssues) ||
        (nextHasClassification && !existingHasClassification) ||
        (nextHasPosterImageOcr && !existingHasPosterImageOcr)
      ) {
        updates.field_verification = posterRecord.field_verification;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("posters").update(updates).eq("id", existingPoster.id);
      }
      await syncPosterImages(existingPoster.id, postWithStoredImages, sourceUrl);
      await assignPosterCategories(existingPoster.id, post, categoryMap, classification);
      await assignPosterRegions(existingPoster.id, post, regionMap, classification);
      await assignPosterAudiences(existingPoster.id, classification, audienceMap);
      process.stdout.write("-");
      continue;
    }

    const { data: poster, error: posterErr } = await supabase
      .from("posters")
      .insert(posterRecord)
      .select("id")
      .single();

    if (posterErr || !poster?.id) {
      fail++;
      collectionStats.recordFailed(post, `poster_insert:${posterErr?.message ?? "insert returned no row"}`);
      process.stdout.write("✗");
      console.error(`\n  포스터 저장 실패: ${post.title} — ${posterErr?.message ?? "insert returned no row"}`);
      continue;
    }

    const posterId = poster.id;
    await syncPosterImages(posterId, postWithStoredImages, sourceUrl);

    // ── 2. poster_links 저장 (신청 URL + 원문 URL) ─────────────
    try {
      await insertPosterLinks(posterId, linkEntries);
    } catch (linkErr) {
      console.warn(`\n  링크 저장 실패: ${post.title} — ${linkErr.message}`);
    }

    // ── 3. poster_categories 저장 ───────────────────────────
    await assignPosterCategories(posterId, post, categoryMap, classification);
    await assignPosterRegions(posterId, post, regionMap, classification);
    await assignPosterAudiences(posterId, classification, audienceMap);
    addDuplicateCandidate(duplicateCandidates, posterId, posterRecord, post, sourceUrl, storedImages);

    success++;
    collectionStats.recordCreated(post);
    process.stdout.write("✓");
  }

  await flushCollectionSourceStats(supabase, collectionStats, { phase: "upload" });

  console.log(`\n\n━━━ 업로드 완료 ━━━`);
  console.log(`  성공: ${success}건`);
  console.log(`  중복(스킵): ${skip}건`);
  console.log(`  실패: ${fail}건`);
  console.log(`  품질검증 자동차단: ${qualityRejected.length}건`);
  console.log(`  품질검증 확인필요: ${qualityReview.length}건`);

  console.log(`  이미지 없는 공고 후보 신규: ${noticeCandidateSuccess}건`);
  console.log(`  이미지 없는 공고 후보 중복: ${noticeCandidateDuplicate}건`);

  const qualityReportPath = await writeUploadQualityReport(filePath, {
    rejected: qualityRejected,
    review: qualityReview,
  });
  if (qualityReportPath) {
    console.log(`  품질검증 리포트: ${qualityReportPath}`);
  }

  if (skippedSourceKeys.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("posters")
      .select("poster_status")
      .in("source_key", skippedSourceKeys);

    if (existingError) {
      console.warn(`  중복 포스터 상태 확인 실패: ${existingError.message}`);
    } else {
      const existingStatusCounts = {};
      for (const row of existingRows ?? []) {
        existingStatusCounts[row.poster_status] = (existingStatusCounts[row.poster_status] ?? 0) + 1;
      }
      console.log(`  중복 포스터 기존 상태: ${JSON.stringify(existingStatusCounts)}`);
    }
  }

  const { data: statusRows, error: statusError } = await supabase
    .from("posters")
    .select("poster_status");
  if (statusError) {
    console.warn(`  전체 상태 카운트 확인 실패: ${statusError.message}`);
  } else {
    const statusCounts = {};
    for (const row of statusRows ?? []) {
      statusCounts[row.poster_status] = (statusCounts[row.poster_status] ?? 0) + 1;
    }
    console.log(`  현재 posters 상태별 카운트: ${JSON.stringify(statusCounts)}`);
  }

  const { data: latestCrawlerRows, error: latestError } = await supabase
    .from("posters")
    .select("title, source_org_name, poster_status, created_at, source_key")
    .not("source_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (latestError) {
    console.warn(`  최근 크롤러 포스터 확인 실패: ${latestError.message}`);
  } else {
    console.log("  최근 크롤러 포스터:");
    for (const row of latestCrawlerRows ?? []) {
      console.log(`    - [${row.poster_status}] ${row.source_org_name ?? "-"} / ${row.title} / ${row.created_at}`);
    }
  }

  console.log(`\n👉 /admin/posters 에서 검수 후 승인하세요.\n`);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("사용법: node src/upload-to-supabase.js <결과파일.json>");
  process.exit(1);
}

uploadToSupabase(filePath).catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
