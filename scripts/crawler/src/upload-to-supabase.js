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

import "dotenv/config";
import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

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

function inferCategoryCodes(post) {
  const source = [
    post.title,
    post.content,
    post.summary_short,
    post.site,
    post.board,
    post.category,
  ].filter(Boolean).join(" ").toLowerCase();

  const scores = new Map();
  const mappedCode = CATEGORY_CODE_MAP[post.category];
  if (mappedCode) scores.set(mappedCode, 8);

  for (const [code, definition] of Object.entries(CATEGORY_DEFINITIONS)) {
    if (code === "CAT_OTHER") continue;

    let score = scores.get(code) ?? 0;
    for (const keyword of definition.keywords) {
      if (source.includes(keyword.toLowerCase())) score += 3;
    }
    if (score > 0) scores.set(code, score);
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);

  const uniqueCodes = [...new Set(ranked)];
  if (uniqueCodes.length === 0) return ["CAT_OTHER"];

  return uniqueCodes.slice(0, 2);
}

async function assignPosterCategories(posterId, post, categoryMap) {
  const categoryCodes = inferCategoryCodes(post);
  for (const categoryCode of categoryCodes) {
    const categoryId = await ensureCategory(categoryMap, categoryCode);
    if (!categoryId) continue;
    await supabase.from("poster_categories").upsert({
      poster_id: posterId,
      category_id: categoryId,
    }, { onConflict: "poster_id,category_id", ignoreDuplicates: true });
  }
}

function hasPosterImage(post) {
  return Array.isArray(post.images) && post.images.length > 0 && Boolean(post.images[0]);
}

const VOLATILE_SOURCE_PARAMS = new Set([
  "cp",
  "page",
  "pageIndex",
  "recordCountPerPage",
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

    const sortedParams = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
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

function cleanSummaryText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\bRSS\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function cleanupImageLessCrawlerReviews() {
  const { count, error } = await supabase
    .from("posters")
    .delete({ count: "exact" })
    .not("source_key", "is", null)
    .eq("poster_status", "review")
    .is("thumbnail_url", null);

  if (error) {
    console.warn(`이미지 없는 크롤러 검수대기 정리 실패: ${error.message}`);
    return 0;
  }

  return count ?? 0;
}

async function uploadToSupabase(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const posts = JSON.parse(raw);
  const imagePosts = posts.filter(hasPosterImage);
  const skippedNoImage = posts.length - imagePosts.length;

  console.log(`\n📤 ${imagePosts.length}건을 Supabase에 업로드합니다. (이미지 없음 제외: ${skippedNoImage}건)\n`);

  const cleanedCount = await cleanupImageLessCrawlerReviews();
  if (cleanedCount > 0) {
    console.log(`이미지 없는 기존 크롤러 검수대기 ${cleanedCount}건 정리`);
  }

  // 카테고리 맵 로드
  const categoryMap = await loadCategoryMap();

  let success = 0;
  let skip = 0;
  let fail = 0;
  const skippedSourceKeys = [];

  for (const post of imagePosts) {
    const sourceUrl = post.sourceUrl || post.url;
    const sourceKey = normalizeSourceKey(sourceUrl);
    if (!sourceKey) { fail++; continue; }

    // ── 1. posters 테이블 upsert ─────────────────────────────
    const posterRecord = {
      title: (post.title || "제목 없음").substring(0, 200),
      source_org_name: post.site || null,
      summary_short: normalizeSummary(post),
      poster_status: "review",         // 관리자 검수 대기
      source_key: sourceKey,           // 중복 방지 키
      created_by: CRAWLER_USER_ID,     // 크롤러 봇 계정 (null 가능)
      application_end_at: post.deadline
        ? (() => { try { return new Date(post.deadline).toISOString(); } catch { return null; } })()
        : null,
      thumbnail_url: normalizeImageUrl(post.images?.[0], sourceUrl),
    };

    const sourceKeyCandidates = [...new Set([sourceKey, sourceUrl].filter(Boolean))];
    const { data: existingPoster, error: existingErr } = await supabase
      .from("posters")
      .select("id, poster_status, title, summary_short, thumbnail_url, source_key")
      .in("source_key", sourceKeyCandidates)
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      fail++;
      process.stdout.write("✗");
      console.error(`\n  기존 포스터 확인 실패: ${post.title} — ${existingErr.message}`);
      continue;
    }

    if (existingPoster?.id) {
      skip++;
      skippedSourceKeys.push(sourceKey);
      const updates = {};
      if (posterRecord.title !== "제목 없음" && (!existingPoster.title || existingPoster.title === "제목 없음")) {
        updates.title = posterRecord.title;
      }
      if (posterRecord.summary_short && !existingPoster.summary_short) {
        updates.summary_short = posterRecord.summary_short;
      }
      if (posterRecord.thumbnail_url && (!existingPoster.thumbnail_url || !/^https?:\/\//i.test(existingPoster.thumbnail_url))) {
        updates.thumbnail_url = posterRecord.thumbnail_url;
      }
      if (existingPoster.source_key !== sourceKey) {
        updates.source_key = sourceKey;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("posters").update(updates).eq("id", existingPoster.id);
      }
      await assignPosterCategories(existingPoster.id, post, categoryMap);
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
      process.stdout.write("✗");
      console.error(`\n  포스터 저장 실패: ${post.title} — ${posterErr?.message ?? "insert returned no row"}`);
      continue;
    }

    const posterId = poster.id;

    // ── 2. poster_links 저장 (원본 URL) ─────────────────────
    const { error: linkErr } = await supabase.from("poster_links").insert({
      poster_id: posterId,
      link_type: "official_notice",
      url: sourceUrl,
      title: "원문 보기",
      is_primary: true,
    });
    if (linkErr) {
      console.warn(`\n  원문 링크 저장 실패: ${post.title} — ${linkErr.message}`);
    }

    // ── 3. poster_categories 저장 ───────────────────────────
    await assignPosterCategories(posterId, post, categoryMap);

    success++;
    process.stdout.write("✓");
  }

  console.log(`\n\n━━━ 업로드 완료 ━━━`);
  console.log(`  성공: ${success}건`);
  console.log(`  중복(스킵): ${skip}건`);
  console.log(`  실패: ${fail}건`);

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
