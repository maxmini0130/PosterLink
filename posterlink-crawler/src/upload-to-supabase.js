// src/upload-to-supabase.js
// 크롤링 결과를 Supabase DB에 업로드
//
// 사용법: node src/upload-to-supabase.js data/results/all_2026-05-08.json
//
// 환경변수:
//   SUPABASE_URL — Supabase 프로젝트 URL
//   SUPABASE_KEY — Supabase service_role 키

import fs from "fs/promises";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL 과 SUPABASE_KEY 환경변수를 설정하세요.");
  process.exit(1);
}

async function uploadToSupabase(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const posts = JSON.parse(raw);

  console.log(`📤 ${posts.length}건을 Supabase에 업로드합니다...\n`);

  let success = 0;
  let skip = 0;
  let fail = 0;

  for (const post of posts) {
    // PosterLink DB 스키마에 맞게 변환
    const record = {
      title: post.title || "제목 없음",
      summary: post.content ? post.content.substring(0, 200) : null,
      source_url: post.sourceUrl || post.url,
      image_urls: post.images || [],
      category: mapCategory(post.category),
      organization: post.site,
      deadline: post.deadline || null,
      published_at: post.date || null,
      status: "draft", // 검수 전이므로 draft
      crawled_from: post.siteId,
      raw_data: post,
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/posters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(record),
      });

      if (res.status === 201) {
        success++;
        process.stdout.write(`✓`);
      } else if (res.status === 409) {
        skip++;
        process.stdout.write(`-`);
      } else {
        const err = await res.text();
        fail++;
        process.stdout.write(`✗`);
        console.error(`\n  Error: ${res.status} ${err}`);
      }
    } catch (err) {
      fail++;
      console.error(`\n  Network error: ${err.message}`);
    }
  }

  console.log(`\n\n━━━ 업로드 완료 ━━━`);
  console.log(`  성공: ${success}건`);
  console.log(`  중복(스킵): ${skip}건`);
  console.log(`  실패: ${fail}건`);
}

function mapCategory(crawlerCategory) {
  const map = {
    "공지": "general",
    "공고": "announcement",
    "채용": "job",
    "문화": "culture",
    "장학": "scholarship",
    "일자리": "job",
    "노동": "labor",
    "청소년": "youth",
    "복지": "welfare",
    "노인복지": "senior",
    "체육": "sports",
    "안전": "safety",
    "급식": "childcare",
    "동주민센터": "community",
    "입법": "legislation",
  };
  return map[crawlerCategory] || "general";
}

// 실행
const filePath = process.argv[2];
if (!filePath) {
  console.error("사용법: node src/upload-to-supabase.js <결과파일.json>");
  process.exit(1);
}

uploadToSupabase(filePath).catch(console.error);
