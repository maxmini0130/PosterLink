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
import fs from "fs/promises";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const listOnly = args.includes("--list");
  const siteIdx = args.indexOf("--site");
  const targetSite = siteIdx >= 0 ? args[siteIdx + 1] : null;

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

  const targetSites = targetSite
    ? sites.filter((s) => s.id === targetSite || s.id.startsWith(targetSite))
    : sites;

  if (targetSites.length === 0) {
    logger.error(`사이트 "${targetSite}"를 찾을 수 없습니다. --list로 확인하세요.`);
    process.exit(1);
  }

  logger.info(`크롤링 대상: ${targetSites.length}개 사이트\n`);

  const allResults = [];
  let successCount = 0;
  let failCount = 0;

  for (const site of targetSites) {
    try {
      const adapter = getAdapter(site.adapter);
      const posts = await crawlSite(site, adapter, {
        maxPages: 2,
        dryRun,
      });
      allResults.push(...posts);
      successCount++;
    } catch (err) {
      logger.error(`Site failed: ${site.name} — ${err.message}`);
      failCount++;
    }

    // 사이트 간 3초 대기
    await new Promise((r) => setTimeout(r, 3000));
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
