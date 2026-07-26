// SNS_INGESTION.md Phase 3-1 — 네이버 블로그 RSS 인제스터.
//
// RSS(https://rss.blog.naver.com/{blogId}.xml)는 인증 없이 무료로 접근 가능하다
// (검색 API만 네이버 개발자센터 Client ID/Secret이 필요 — 그건 특정 기관 블로그가
// 아니라 키워드로 여러 블로그를 검색할 때만 쓰므로 이 파일 범위 밖).
//
// 파이프라인: RSS raw 저장(무조건, 절대 안 버림) → Phase 2 분류(휴리스틱→LLM 라우터)
// → 마감일 파서 → Phase 3 dedup/링킹(기존 poster-duplicate-detector.js 재사용).
//
// dedup 매칭 대상은 poster_notice_candidates(=items)와 posters(이미 이미지 검증까지
// 끝나 승격된 공고) 둘 다다. 전자는 notice_sightings.candidate_id로, 후자는
// notice_sightings.poster_id로 연결한다(20260726010000 마이그레이션). 필드 병합
// 정책(3-4)은 poster_notice_candidates끼리 병합할 때만 적용 — posters는 이미 검증
// 단계가 더 앞서 있으므로 블로그 값으로 덮어쓰지 않고 연결만 한다.

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

export function stripHtml(html) {
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
      // notice_sightings.poster_id로 직접 연결(20260726010000 마이그레이션).
      // posters는 poster_notice_candidates보다 검증 단계가 앞서 있으므로 필드 병합은
      // 하지 않는다 — 이미지 검증까지 끝난 posters 쪽 값이 항상 더 신뢰도가 높다.
      return { candidateId: null, posterId: match.row.id, created: false };
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
    } else if (result.posterId) {
      const { error: linkError } = await supabase
        .from("notice_sightings")
        .update({ poster_id: result.posterId })
        .eq("id", sighting.id);
      if (linkError) throw new Error(`sighting_link:${linkError.message}`);

      stats.matchedPosterOnly += 1;
      console.log(`  [기존 posters에 연결] ${entry.title} -> poster ${result.posterId}`);
    }
  }

  console.log(`[naver-blog:${blogId}] 완료:`, stats);
  return stats;
}

// SNS_INGESTION.md Phase 4 완료 기준 — "sns_enabled 플래그가 커버리지 등급에 따라
// 세팅되고, 블로그 인제스터가 이 플래그를 존중한다." collection_sources에서
// sns_enabled=true & naver_blog_id 설정된 기관만 순회한다.
export async function ingestAllEnabledNaverBlogs({ dryRun = false } = {}) {
  const supabase = createOptionalCollectionSourceClient();
  if (!supabase) throw new Error("Supabase client unavailable — check SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env vars");

  const { data: sources, error } = await supabase
    .from("collection_sources")
    .select("source_slug,name,naver_blog_id")
    .eq("sns_enabled", true)
    .not("naver_blog_id", "is", null);
  if (error) throw new Error(`collection_sources_load:${error.message}`);

  if (sources.length === 0) {
    console.log("sns_enabled=true 이면서 naver_blog_id가 설정된 기관이 없습니다.");
    return [];
  }

  const results = [];
  for (const source of sources) {
    console.log(`\n=== ${source.name} (${source.source_slug}) ===`);
    const stats = await ingestNaverBlog(source.naver_blog_id, { sourceOrg: source.name, dryRun });
    results.push({ slug: source.source_slug, name: source.name, ...stats });
  }
  return results;
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
  const runAllEnabled = args.includes("--all-enabled");

  if (runAllEnabled) {
    ingestAllEnabledNaverBlogs({ dryRun }).catch((err) => {
      console.error("Fatal:", err.message);
      process.exit(1);
    });
  } else if (!blogId) {
    console.error("사용법: node src/naver-blog-ingester.js --blog-id <blogId> [--source-org <기관명>] [--dry-run]");
    console.error("      또는: node src/naver-blog-ingester.js --all-enabled [--dry-run]  (sns_enabled=true 기관 전체)");
    process.exit(1);
  } else {
    ingestNaverBlog(blogId, { sourceOrg, dryRun }).catch((err) => {
      console.error("Fatal:", err.message);
      process.exit(1);
    });
  }
}
