#!/usr/bin/env node
// src/index.js
// PosterLink 크롤러 메인 실행 파일
//
// 사용법:
//   npm run crawl                   — 전체 사이트 크롤링
//   npm run crawl -- --site mapo-gu — 특정 사이트만 크롤링
//   npm run test                    — 드라이런 (실제 상세 페이지 접근 안 함)
//   node src/index.js --list        — 등록된 사이트 목록 확인

import { sites } from "./sites.js";
import { getAdapter } from "./adapters/index.js";
import { crawlSite, logger } from "./crawler.js";
import "./load-env.js";
import {
  createCollectionSourceStats,
  createOptionalCollectionSourceClient,
  flushCollectionSourceStats,
  loadCollectionSources,
  resolveSitesForCollectionSource,
} from "./collection-source-tracker.js";
import fs from "fs/promises";

function getLatestPostDate(posts) {
  let latest = null;
  for (const post of posts) {
    const date = new Date(post.date || post.deadline || post.crawledAt);
    if (!Number.isNaN(date.getTime()) && (!latest || date > latest)) {
      latest = date;
    }
  }
  return latest?.toISOString() ?? null;
}

function buildCrawlRunMetadata(site, stats = {}) {
  return {
    sites: [{
      site_id: site.id,
      site_name: site.name,
      summary: {
        found: Number(stats.found ?? 0),
        checked: Number(stats.checked ?? 0),
        collected: Number(stats.collected ?? 0),
        post_filtered: Number(stats.postFiltered ?? 0),
        detail_filtered: Number(stats.detailFiltered ?? 0),
        no_poster_image: Number(stats.noPosterImage ?? 0),
        image_rule_rejected: Number(stats.imageRuleRejected ?? 0),
        verification_rejected: Number(stats.verificationRejected ?? 0),
        text_notice_collected: Number(stats.textNoticeCollected ?? 0),
        skipped_seen: Number(stats.skippedSeen ?? 0),
        detail_failed: Number(stats.detailFailed ?? 0),
        board_failed: Number(stats.boardFailed ?? 0),
      },
      skip_reasons: stats.skipReasons ?? {},
      skip_samples: stats.skipSamples ?? [],
    }],
    skip_reasons: stats.skipReasons ?? {},
    skip_samples: stats.skipSamples ?? [],
  };
}

function mergeActiveCollectionSourceSites(staticSites, collectionSources) {
  const merged = [...staticSites];
  const siteIds = new Set(merged.map((site) => site.id));

  for (const source of collectionSources ?? []) {
    if (source.status !== "active" || source.collection_method === "manual") continue;

    for (const site of resolveSitesForCollectionSource(source, staticSites)) {
      if (!site?.id || siteIds.has(site.id)) continue;
      siteIds.add(site.id);
      merged.push(site);
    }
  }

  return merged;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const listOnly = args.includes("--list");
  const siteIdx = args.indexOf("--site");
  const targetSite = siteIdx >= 0 ? args[siteIdx + 1] : null;
  const sourceIdx = args.indexOf("--source");
  const targetSource = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

  // ── 사이트 목록 출력 ─────────────────────────
  if (listOnly) {
    console.log("\n📋 등록된 크롤링 대상 사이트:\n");
    console.log("ID".padEnd(30) + "이름".padEnd(25) + "게시판 수");
    console.log("─".repeat(70));
    for (const site of sites) {
      console.log(
        site.id.padEnd(30) +
        site.name.padEnd(25) +
        site.boards.length
      );
    }
    console.log(`\n총 ${sites.length}개 사이트, ${sites.reduce((s, x) => s + x.boards.length, 0)}개 게시판`);
    return;
  }

  // ── 크롤링 실행 ──────────────────────────────
  console.log(`
  ╔══════════════════════════════════════╗
  ║     PosterLink Crawler v1.0         ║
  ║     posterlink.kr                   ║
  ╚══════════════════════════════════════╝
  `);

  if (dryRun) logger.info("🔍 DRY-RUN 모드 — 목록만 수집, 상세 페이지 미접근");

  const collectionSourceClient = createOptionalCollectionSourceClient(logger);
  const collectionSources = collectionSourceClient
    ? await loadCollectionSources(collectionSourceClient, logger)
    : [];

  let targetSites = sites;
  if (targetSource) {
    const source = collectionSources.find((row) => row.id === targetSource || row.source_slug === targetSource);
    if (!source) {
      logger.error(`collection source "${targetSource}" could not be found. Check /admin/collection-sources first.`);
      process.exit(1);
    }

    targetSites = resolveSitesForCollectionSource(source, sites);
    logger.info(`collection source selected: ${source.name} (${source.source_slug}) -> ${targetSites.length} site(s)`);
    for (const site of targetSites) {
      if (site.collectionSourceSlug && !sites.some((knownSite) => knownSite.id === site.id)) {
        logger.info(`  dynamic source site: ${site.id} -> ${site.boards.length} board(s), adapter ${site.adapter}`);
      }
    }
  } else if (targetSite) {
    targetSites = sites.filter((s) => s.id === targetSite || s.id.startsWith(targetSite));
  } else {
    targetSites = mergeActiveCollectionSourceSites(sites, collectionSources);
  }

  if (targetSites.length === 0) {
    if (targetSource) {
      logger.error(`No crawler site matched collection source "${targetSource}". Add config_json.site_ids for sources with custom adapter ids.`);
      process.exit(1);
    }
    logger.error(`사이트 "${targetSite}"를 찾을 수 없습니다. --list로 확인하세요.`);
    process.exit(1);
  }

  logger.info(`크롤링 대상: ${targetSites.length}개 사이트\n`);

  const allResults = [];
  let successCount = 0;
  let failCount = 0;
  const crawlSourceStats = createCollectionSourceStats(collectionSources);

  for (const site of targetSites) {
    try {
      const adapter = getAdapter(site.adapter);
      const posts = await crawlSite(site, adapter, {
        maxPages: 2,
        dryRun,
        ignoreSeen: force,
      });
      const siteStats = posts.crawlerStats ?? {};
      allResults.push(...posts);
      crawlSourceStats.recordSiteRun(site, {
        checked: siteStats.checked ?? posts.length,
        valid: siteStats.valid ?? posts.length,
        duplicate: siteStats.duplicate ?? 0,
        rejected: siteStats.rejected ?? 0,
        failed: siteStats.failed ?? 0,
        latestPostFoundAt: siteStats.latestPostFoundAt ?? getLatestPostDate(posts),
        metadata: buildCrawlRunMetadata(site, siteStats),
      });
      successCount++;
    } catch (err) {
      logger.error(`Site failed: ${site.name} — ${err.message}`);
      crawlSourceStats.recordSiteRun(site, {
        failed: 1,
        error: err.message,
      });
      failCount++;
    }

    // 사이트 간 3초 대기
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (!dryRun) {
    await flushCollectionSourceStats(collectionSourceClient, crawlSourceStats, { logger, phase: "crawl" });
  }

  // ── 결과 요약 ────────────────────────────────
  console.log("\n" + "═".repeat(50));
  logger.info(`크롤링 완료!`);
  logger.info(`  성공: ${successCount}개 사이트`);
  logger.info(`  실패: ${failCount}개 사이트`);
  logger.info(`  수집: ${allResults.length}건`);
  console.log("═".repeat(50));

  // 전체 결과를 하나의 파일로도 저장
  if (allResults.length > 0) {
    const summaryFile = `data/results/all_${new Date().toISOString().slice(0, 10)}.json`;
    await fs.mkdir("data/results", { recursive: true });
    await fs.writeFile(summaryFile, JSON.stringify(allResults, null, 2), "utf-8");
    logger.info(`전체 결과 저장: ${summaryFile}`);
  }

  // ── 카테고리별 통계 ──────────────────────────
  const byCat = {};
  for (const p of allResults) {
    byCat[p.category] = (byCat[p.category] || 0) + 1;
  }
  if (Object.keys(byCat).length > 0) {
    console.log("\n📊 카테고리별 수집 현황:");
    for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${count}건`);
    }
  }
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
