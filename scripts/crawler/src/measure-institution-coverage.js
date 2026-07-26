// SNS_INGESTION.md Phase 4 — 기관 커버리지 맵.
//
// 목적: 게시판이 부실하거나 SNS에만 올리는 기관에만 SNS 수집을 켠다.
// 게시판에 이미 있는 걸 또 긁으면 dedup 부담만 늘어난다.
//
// collection_sources를 문서의 "institutions" 인벤토리로 쓰기로 했으므로(Phase 1 결정),
// naver_blog_id가 설정된 각 행에 대해:
//   1) 블로그 RSS 최근 3개월치를 Phase 2 분류기(휴리스틱→LLM 라우터)로 돌려 공고 건수 집계
//   2) 같은 기관의 board 쪽(posters/poster_notice_candidates) 최근 3개월 공고 건수 집계
//   3) Phase 3 dedup(findBestPosterDuplicate)으로 블로그 공고가 board와 겹치는 비율 계산
//   4) 겹침 비율로 coverage_grade 산출, sns_enabled 갱신
//
// 분류기·dedup을 그대로 재사용하므로 이 파일 자체의 로직은 "겹침 비율로 등급 매기기"뿐이다.

import "./load-env.js";
import { createOptionalCollectionSourceClient } from "./collection-source-tracker.js";
import { fetchNaverBlogRss, stripHtml } from "./naver-blog-ingester.js";
import { evaluateRelevanceHeuristic } from "./relevance-heuristic.js";
import { routePosterRelevance } from "./poster-relevance-router.js";
import { loadDuplicateCandidates, normalizeSourceKey } from "./upload-to-supabase.js";
import { findBestPosterDuplicate } from "./poster-duplicate-detector.js";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
// 겹침 비율이 이 값 이상이면 "게시판완결"(SNS 안 켜도 됨)로 본다.
const COVERAGE_OVERLAP_THRESHOLD = Number(process.env.COVERAGE_OVERLAP_THRESHOLD ?? "0.7");

async function classifyRoute(entry) {
  const heuristic = evaluateRelevanceHeuristic({ title: entry.title, content: stripHtml(entry.description) });
  if (heuristic.route) return heuristic.route;
  const result = await routePosterRelevance({ title: entry.title, body: stripHtml(entry.description), ocrText: "" });
  return result.route;
}

async function countBoardAnnouncements(supabase, sourceName, sinceIso) {
  const [{ count: posterCount }, { count: candidateCount }] = await Promise.all([
    supabase.from("posters")
      .select("*", { count: "exact", head: true })
      .eq("source_org_name", sourceName)
      .gte("created_at", sinceIso),
    supabase.from("poster_notice_candidates")
      .select("*", { count: "exact", head: true })
      .eq("source_org_name", sourceName)
      .eq("content_type", "공고")
      .gte("created_at", sinceIso),
  ]);
  return (posterCount ?? 0) + (candidateCount ?? 0);
}

// 여러 기관(예: 창조경제혁신센터 19곳)이 통합 블로그 하나를 공유하는 경우가 실제로
// 있다(ccei_forever). blogId당 RSS 수신+분류를 한 번만 하도록 캐시한다 — 겹침 계산은
// 기관마다 source_org_name이 달라서 개별로 다시 하되, 비싼 fetch/classify는 재사용.
const blogClassificationCache = new Map();

async function getClassifiedBlogEntries(blogId) {
  if (!blogClassificationCache.has(blogId)) {
    blogClassificationCache.set(blogId, (async () => {
      const entries = await fetchNaverBlogRss(blogId);
      const recentEntries = entries.filter((entry) => {
        const t = new Date(entry.pubDate).getTime();
        return Number.isFinite(t) && Date.now() - t <= THREE_MONTHS_MS;
      });

      const routed = [];
      for (const entry of recentEntries) {
        const route = await classifyRoute(entry);
        routed.push({ entry, route });
      }
      return routed;
    })());
  }
  return blogClassificationCache.get(blogId);
}

async function measureSource(supabase, source, duplicateCandidates) {
  const sinceIso = new Date(Date.now() - THREE_MONTHS_MS).toISOString();
  const boardAnnouncementCount = await countBoardAnnouncements(supabase, source.name, sinceIso);

  let blogAnnouncementCount = 0;
  let overlapCount = 0;
  let blogEntryCount = 0;

  if (source.naver_blog_id) {
    const routedEntries = await getClassifiedBlogEntries(source.naver_blog_id);
    blogEntryCount = routedEntries.length;

    for (const { entry, route } of routedEntries) {
      if (route !== "공고") continue;
      blogAnnouncementCount += 1;

      const sourceUrl = normalizeSourceKey(entry.link) || entry.link;
      const match = findBestPosterDuplicate(
        { source_key: sourceUrl, title: entry.title, source_org_name: source.name },
        duplicateCandidates,
      );
      if (match.decision === "merge") overlapCount += 1;
    }
  }

  let coverageGrade;
  if (boardAnnouncementCount === 0 && blogAnnouncementCount > 0) {
    coverageGrade = "SNS-only";
  } else if (blogAnnouncementCount === 0 || overlapCount / blogAnnouncementCount >= COVERAGE_OVERLAP_THRESHOLD) {
    coverageGrade = "게시판완결";
  } else {
    coverageGrade = "게시판부실";
  }

  return {
    slug: source.source_slug,
    name: source.name,
    boardAnnouncementCount,
    blogEntryCount,
    blogAnnouncementCount,
    overlapCount,
    overlapRate: blogAnnouncementCount > 0 ? Number((overlapCount / blogAnnouncementCount).toFixed(2)) : null,
    coverageGrade,
    snsEnabled: coverageGrade !== "게시판완결",
  };
}

export async function measureAllInstitutionCoverage({ dryRun = false } = {}) {
  const supabase = createOptionalCollectionSourceClient();
  if (!supabase) throw new Error("Supabase client unavailable — check SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env vars");

  const { data: sources, error } = await supabase
    .from("collection_sources")
    .select("id,source_slug,name,naver_blog_id")
    .not("naver_blog_id", "is", null);
  if (error) throw new Error(`collection_sources_load:${error.message}`);

  if (sources.length === 0) {
    console.log("naver_blog_id가 설정된 collection_sources 행이 없습니다.");
    return [];
  }

  const duplicateCandidates = await loadDuplicateCandidates();
  const results = [];

  for (const source of sources) {
    console.log(`\n[측정] ${source.name} (${source.source_slug})`);
    const result = await measureSource(supabase, source, duplicateCandidates);
    results.push(result);
    console.log(
      `  게시판 공고(3개월): ${result.boardAnnouncementCount}건 | ` +
      `블로그 공고(3개월): ${result.blogAnnouncementCount}건(전체 ${result.blogEntryCount}건 중) | ` +
      `겹침: ${result.overlapCount}건(${result.overlapRate ?? "-"}) | ` +
      `등급: ${result.coverageGrade} | sns_enabled=${result.snsEnabled}`
    );

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("collection_sources")
        .update({ coverage_grade: result.coverageGrade, sns_enabled: result.snsEnabled })
        .eq("id", source.id);
      if (updateError) console.warn(`  coverage_grade 갱신 실패: ${updateError.message}`);
    }
  }

  console.log("\n=== 커버리지 리포트 요약 ===");
  console.table(results.map(({ slug, name, boardAnnouncementCount, blogAnnouncementCount, overlapCount, coverageGrade, snsEnabled }) =>
    ({ slug, name, boardAnnouncementCount, blogAnnouncementCount, overlapCount, coverageGrade, snsEnabled })));

  return results;
}

const isDirectExecution = process.argv[1] && process.argv[1].endsWith("measure-institution-coverage.js");
if (isDirectExecution) {
  const dryRun = process.argv.includes("--dry-run");
  measureAllInstitutionCoverage({ dryRun }).catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
