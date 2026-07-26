// SNS_INGESTION.md Phase 3-1 — 네이버 블로그 RSS 인제스터.
//
// RSS(https://blog.naver.com/rss/{blogId})는 인증 없이 무료로 접근 가능하다
// (검색 API만 네이버 개발자센터 Client ID/Secret이 필요 — 그건 특정 기관 블로그가
// 아니라 키워드로 여러 블로그를 검색할 때만 쓰므로 이 파일 범위 밖).
//
// 파이프라인: RSS raw 저장(무조건, 절대 안 버림) → Phase 2 분류(휴리스틱→LLM 라우터)
// → 마감일 파서 → Phase 3 dedup/링킹(기존 poster-duplicate-detector.js 재사용).
//
// 알려진 한계: dedup은 poster_notice_candidates(=items)까지만 링크한다.
// notice_sightings.candidate_id는 poster_notice_candidates(id)만 참조하도록
// Phase 1에서 만들어졌기 때문에, 이미 이미지 검증까지 끝나 posters 테이블로
// 승격된 공고와 매칭되는 경우는 여기서 자동 병합하지 못한다(로그만 남김).
// 이 케이스를 자동 처리하려면 posters 테이블과의 연결 스키마를 별도로 확장해야 한다.

import "./load-env.js";
import axios from "axios";
import * as cheerio from "cheerio";
import { createOptionalCollectionSourceClient } from "./collection-source-tracker.js";
import { evaluateRelevanceHeuristic } from "./relevance-heuristic.js";
import { routePosterRelevance } from "./poster-relevance-router.js";
import { parseDeadlineText } from "./deadline-parser.js";
import { normalizeSourceKey, loadDuplicateCandidates } from "./upload-to-supabase.js";
import { findBestPosterDuplicate } from "./poster-duplicate-detector.js";

const SOURCE_PRIORITY = { 게시판: 1, 네이버블로그: 2, 페이스북: 3, 인스타그램: 3 };

function stripHtml(html) {
  if (!html) return "";
  return cheerio.load(String(html)).text().replace(/\s+/g, " ").trim();
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchNaverBlogRss(blogId) {
  // SNS_INGESTION.md는 https://blog.naver.com/rss/{blogId} 형식을 명시하지만
  // 실제로는 이 형식이 "페이지 주소를 확인해주세요" 에러를 반환한다(2026-07 확인).
  // 현재 실제로 동작하는 형식은 rss.blog.naver.com 서브도메인이다.
  const url = `https://rss.blog.naver.com/${blogId}.xml`;
  const response = await axios.get(url, {
    timeout: 15000,
    responseType: "text",
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; Naver blog RSS ingester)",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
  });

  const $ = cheerio.load(response.data, { xmlMode: true });
  const items = [];
  $("item").each((_, el) => {
    const $el = $(el);
    const link = $el.find("link").first().text().trim();
    if (!link) return;
    items.push({
      title: $el.find("title").first().text().trim(),
      link,
      description: $el.find("description").first().text().trim(),
      pubDate: $el.find("pubDate").first().text().trim(),
    });
  });
  return items;
}

async function upsertNoticeSighting(supabase, entry, { sourceOrg }) {
  const sourceUrl = normalizeSourceKey(entry.link) || entry.link;

  const { data: existing, error: lookupError } = await supabase
    .from("notice_sightings")
    .select("id,candidate_id")
    .eq("surface_type", "네이버블로그")
    .eq("source_url", sourceUrl)
    .maybeSingle();

  if (lookupError) throw new Error(`notice_sighting_lookup:${lookupError.message}`);
  if (existing) return { sighting: existing, isNew: false, sourceUrl };

  const { data: inserted, error } = await supabase
    .from("notice_sightings")
    .insert({
      surface_type: "네이버블로그",
      source_url: sourceUrl,
      source_org: sourceOrg ?? null,
      raw_title: entry.title || null,
      raw_body: stripHtml(entry.description) || null,
      source_priority: SOURCE_PRIORITY.네이버블로그,
      crawled_at: new Date().toISOString(),
    })
    .select("id,candidate_id")
    .single();

  if (error) throw new Error(`notice_sighting_insert:${error.message}`);
  return { sighting: inserted, isNew: true, sourceUrl };
}

async function classifyEntry(entry) {
  const bodyText = stripHtml(entry.description);
  const heuristic = evaluateRelevanceHeuristic({ title: entry.title, content: bodyText });
  if (heuristic.route) {
    return {
      route: heuristic.route,
      category: null,
      deadlineText: null,
      target: null,
      supportScale: null,
      reason: `heuristic: ${heuristic.reason}`,
      model: "heuristic",
    };
  }
  return routePosterRelevance({ title: entry.title, body: bodyText, ocrText: "" });
}

// Phase 3-4 필드 병합 정책: source_priority가 더 높은(=낮은 숫자) 값이 이미 있으면
// 블로그(2) 값으로 덮어쓰지 않는다 — null 인 칸만 채운다.
function coalesceMergeRecord(existingRow, incomingFields) {
  const update = {};
  for (const [key, value] of Object.entries(incomingFields)) {
    if (value === null || value === undefined) continue;
    if (existingRow[key] === null || existingRow[key] === undefined || existingRow[key] === "") {
      update[key] = value;
    }
  }
  return update;
}

async function linkOrCreateCandidate(supabase, entry, sourceUrl, relevanceRoute, deadlineParse, duplicateCandidates, { sourceOrg }) {
  const candidateShape = {
    source_key: sourceUrl,
    title: entry.title,
    source_org_name: sourceOrg ?? null,
    application_end_at: deadlineParse.applyEnd ?? null,
  };

  const match = findBestPosterDuplicate(candidateShape, duplicateCandidates);

  if (match.decision === "merge" && match.row?.id) {
    if (match.row.duplicateTargetType === "poster") {
      // 알려진 한계 — 위 파일 헤더 주석 참고. 자동 링크 대신 로그만 남긴다.
      return { candidateId: null, created: false, note: `matched existing published poster ${match.row.id} (not auto-linked — schema limitation)` };
    }

    const { data: existingRow, error: fetchError } = await supabase
      .from("poster_notice_candidates")
      .select("*")
      .eq("id", match.row.id)
      .single();
    if (fetchError) throw new Error(`candidate_fetch:${fetchError.message}`);

    const mergeFields = coalesceMergeRecord(existingRow, {
      content_type: relevanceRoute.route === "소식" ? "소식" : "공고",
      category: relevanceRoute.category || null,
      deadline_type: deadlineParse.deadlineType ?? null,
      target: relevanceRoute.target || null,
      support_scale: relevanceRoute.supportScale || null,
      application_start_at: deadlineParse.applyStart ? toIsoOrNull(deadlineParse.applyStart) : null,
      application_end_at: deadlineParse.applyEnd ? toIsoOrNull(deadlineParse.applyEnd) : null,
    });

    if (Object.keys(mergeFields).length > 0) {
      mergeFields.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("poster_notice_candidates")
        .update(mergeFields)
        .eq("id", match.row.id);
      if (updateError) throw new Error(`candidate_merge_update:${updateError.message}`);
    }

    return { candidateId: match.row.id, created: false };
  }

  const record = {
    source_key: sourceUrl,
    source_url: sourceUrl,
    title: (entry.title || "").slice(0, 300),
    source_org_name: sourceOrg ?? null,
    summary_short: stripHtml(entry.description).slice(0, 200) || null,
    summary_long: stripHtml(entry.description).slice(0, 2000) || null,
    candidate_status: "pending",
    candidate_type: "text_notice",
    notice_date: toIsoOrNull(entry.pubDate),
    application_start_at: deadlineParse.applyStart ? toIsoOrNull(deadlineParse.applyStart) : null,
    application_end_at: deadlineParse.applyEnd ? toIsoOrNull(deadlineParse.applyEnd) : null,
    reason: "collected via naver blog RSS (SNS_INGESTION.md Phase 3)",
    quality_issues: [],
    field_verification: {},
    raw_payload: entry,
    content_type: relevanceRoute.route === "소식" ? "소식" : "공고",
    category: relevanceRoute.category || null,
    deadline_type: deadlineParse.deadlineType ?? null,
    target: relevanceRoute.target || null,
    support_scale: relevanceRoute.supportScale || null,
  };

  const { data, error } = await supabase
    .from("poster_notice_candidates")
    .insert(record)
    .select("id")
    .single();
  if (error) throw new Error(`candidate_insert:${error.message}`);
  return { candidateId: data.id, created: true };
}

/**
 * @param {string} blogId 네이버 블로그 아이디(예: mapogu2020)
 * @param {{sourceOrg?: string, dryRun?: boolean}} options
 */
export async function ingestNaverBlog(blogId, options = {}) {
  const { sourceOrg = null, dryRun = false } = options;
  const supabase = createOptionalCollectionSourceClient();
  if (!supabase) {
    throw new Error("Supabase client unavailable — check SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  const entries = await fetchNaverBlogRss(blogId);
  console.log(`[naver-blog:${blogId}] RSS에서 ${entries.length}건 수신`);

  const stats = { total: entries.length, newSightings: 0, alreadySeen: 0, discarded: 0, linked: 0, created: 0, matchedPosterOnly: 0 };

  if (dryRun) {
    for (const entry of entries.slice(0, 5)) {
      const relevanceRoute = await classifyEntry(entry);
      console.log(`  [dry-run] ${entry.title} -> ${relevanceRoute.route} (${relevanceRoute.reason})`);
    }
    return stats;
  }

  let duplicateCandidates = null;

  for (const entry of entries) {
    const { sighting, isNew, sourceUrl } = await upsertNoticeSighting(supabase, entry, { sourceOrg });
    if (!isNew) {
      stats.alreadySeen += 1;
      continue;
    }
    stats.newSightings += 1;

    const relevanceRoute = await classifyEntry(entry);
    if (relevanceRoute.route === "폐기") {
      stats.discarded += 1;
      console.log(`  [폐기] ${entry.title} - ${relevanceRoute.reason}`);
      continue;
    }

    const deadlineParse = await parseDeadlineText(relevanceRoute.deadlineText || "", { postedAt: entry.pubDate });

    duplicateCandidates ??= await loadDuplicateCandidates();
    const result = await linkOrCreateCandidate(supabase, entry, sourceUrl, relevanceRoute, deadlineParse, duplicateCandidates, { sourceOrg });

    if (result.candidateId) {
      const { error: linkError } = await supabase
        .from("notice_sightings")
        .update({ candidate_id: result.candidateId })
        .eq("id", sighting.id);
      if (linkError) throw new Error(`sighting_link:${linkError.message}`);

      if (result.created) {
        stats.created += 1;
        console.log(`  [신규 items 생성] ${entry.title} (${relevanceRoute.route})`);
      } else {
        stats.linked += 1;
        console.log(`  [기존 items에 병합] ${entry.title} -> candidate ${result.candidateId}`);
      }
    } else {
      stats.matchedPosterOnly += 1;
      console.log(`  [참고] ${entry.title} - ${result.note}`);
    }
  }

  console.log(`[naver-blog:${blogId}] 완료:`, stats);
  return stats;
}

const isDirectExecution = process.argv[1] && process.argv[1].endsWith("naver-blog-ingester.js");
if (isDirectExecution) {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const blogId = getArg("--blog-id");
  const sourceOrg = getArg("--source-org") ?? null;
  const dryRun = args.includes("--dry-run");

  if (!blogId) {
    console.error("사용법: node src/naver-blog-ingester.js --blog-id <blogId> [--source-org <기관명>] [--dry-run]");
    process.exit(1);
  }

  ingestNaverBlog(blogId, { sourceOrg, dryRun }).catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
