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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CRAWLER_USER_ID = process.env.CRAWLER_USER_ID ?? null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env 파일에 SUPABASE_URL 과 SUPABASE_KEY 를 설정하세요.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    transport: WebSocket,
  },
});

// 카테고리 코드 → DB UUID 매핑 (시작 시 한 번 로드)
async function loadCategoryMap() {
  const { data, error } = await supabase.from("categories").select("id, code, name");
  if (error) throw new Error("categories 로드 실패: " + error.message);
  const map = {};
  for (const cat of data) {
    if (cat.code) map[cat.code] = cat.id;
    if (cat.name) map[cat.name] = cat.id;
  }
  return map;
}

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

async function uploadToSupabase(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const posts = JSON.parse(raw);

  console.log(`\n📤 ${posts.length}건을 Supabase에 업로드합니다...\n`);

  // 카테고리 맵 로드
  const categoryMap = await loadCategoryMap();

  let success = 0;
  let skip = 0;
  let fail = 0;

  for (const post of posts) {
    const sourceKey = post.sourceUrl || post.url;
    if (!sourceKey) { fail++; continue; }

    // ── 1. posters 테이블 upsert ─────────────────────────────
    const posterRecord = {
      title: (post.title || "제목 없음").substring(0, 200),
      source_org_name: post.site || null,
      summary_short: post.content ? post.content.substring(0, 500) : null,
      poster_status: "review",         // 관리자 검수 대기
      source_key: sourceKey,           // 중복 방지 키
      created_by: CRAWLER_USER_ID,     // 크롤러 봇 계정 (null 가능)
      application_end_at: post.deadline
        ? (() => { try { return new Date(post.deadline).toISOString(); } catch { return null; } })()
        : null,
      thumbnail_url: post.images?.[0] || null,
    };

    const { data: poster, error: posterErr } = await supabase
      .from("posters")
      .upsert(posterRecord, { onConflict: "source_key", ignoreDuplicates: true })
      .select("id")
      .single();

    if (posterErr || !poster?.id) {
      // ignoreDuplicates=true 이면 중복 시 data가 null — 정상 스킵
      if (!poster?.id) { skip++; process.stdout.write("-"); continue; }
      fail++;
      process.stdout.write("✗");
      console.error(`\n  포스터 저장 실패: ${post.title} — ${posterErr?.message}`);
      continue;
    }

    const posterId = poster.id;

    // ── 2. poster_links 저장 (원본 URL) ─────────────────────
    const { error: linkErr } = await supabase.from("poster_links").insert({
      poster_id: posterId,
      link_type: "official_notice",
      url: sourceKey,
      title: "원문 보기",
      is_primary: true,
    });
    if (linkErr) {
      console.warn(`\n  원문 링크 저장 실패: ${post.title} — ${linkErr.message}`);
    }

    // ── 3. poster_categories 저장 ───────────────────────────
    const categoryCode = CATEGORY_CODE_MAP[post.category] || "CAT_OTHER";
    const categoryId = categoryMap[categoryCode] || categoryMap["CAT_OTHER"];
    if (categoryId) {
      await supabase.from("poster_categories").upsert({
        poster_id: posterId,
        category_id: categoryId,
      }, { onConflict: "poster_id,category_id", ignoreDuplicates: true });
    }

    success++;
    process.stdout.write("✓");
  }

  console.log(`\n\n━━━ 업로드 완료 ━━━`);
  console.log(`  성공: ${success}건`);
  console.log(`  중복(스킵): ${skip}건`);
  console.log(`  실패: ${fail}건`);
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
