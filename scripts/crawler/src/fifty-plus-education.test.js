import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

import {
  buildFiftyPlusCoursePost,
  parseFiftyPlusDetailPage,
  parseFiftyPlusListPage,
} from "./adapters/fifty-plus-education.js";
import { getAdapter } from "./adapters/index.js";
import { sites } from "./sites.js";
import { isCollectableTextNotice } from "./crawler.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";
import { evaluatePosterQuality } from "./poster-quality-gate.js";
import { normalizeSourceKey } from "./upload-to-supabase.js";
import { scorePosterDuplicate } from "./poster-duplicate-detector.js";
import { isDistinctSameSourceItem } from "./source-application-status.js";

// Real pages saved from www.50plus.or.kr on 2026-11-19 (content block only).
const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-fixtures/50plus-sdm");
const BOARD = "https://www.50plus.or.kr/sdm/education.do";
const detailUrl = (id) => `https://www.50plus.or.kr/sdm/education-detail.do?id=${id}`;
const load = (name) => cheerio.load(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const allRows = parseFiftyPlusListPage(load("list-all-page1.html"), BOARD, BOARD);
const joinRows = parseFiftyPlusListPage(load("list-join-page1.html"), `${BOARD}?state=JOIN`, BOARD);

function coursePost(id, rows = [...joinRows, ...allRows]) {
  const url = detailUrl(id);
  const listRow = rows.find((row) => row.url === url) ?? null;
  const detail = parseFiftyPlusDetailPage(load(`detail-${id}.html`), url, listRow);
  return {
    ...buildFiftyPlusCoursePost({ detail, listRow, boardUrl: BOARD, postUrl: url }),
    url,
    site: "서울시50플러스포털",
    siteId: "sdm-50plus",
    board: "서대문50플러스센터 수강신청",
    category: "교육",
  };
}

test("site and adapter are registered", () => {
  const site = sites.find((entry) => entry.id === "sdm-50plus");
  assert.equal(site.adapter, "50plus-education");
  assert.equal(site.boards[0].url, BOARD);
  assert.equal(getAdapter("50plus-education").name, "50plus-education");
});

test("full list page 1: 10 courses with stable detail URLs and button states", () => {
  assert.equal(allRows.length, 10);
  assert.deepEqual(
    allRows.map((row) => [row.courseId, row.statusLabel]),
    [
      ["78659744", "수강신청"],
      ["78659421", "수강신청"],
      ["77391349", "수강신청"],
      ["77387970", "수강신청"],
      ["77387171", "신청마감"],
      ["77210311", "신청마감"],
      ["77199420", "신청마감"],
      ["76588175", "대기신청"],
      ["78660695", "수강신청"],
      ["78232916", "신청마감"],
    ],
  );
  const first = allRows[0];
  assert.equal(first.url, detailUrl("78659744"));
  assert.equal(first.title, "긱워커 디지털 역량 강화 과정 (이미지 심화 실습 과정)");
  assert.equal(first.centerLabel, "서대문센터");
  assert.deepEqual([first.applicationPeriod.start, first.applicationPeriod.end], ["2026-11-16", "2026-11-21"]);
  assert.deepEqual([first.educationPeriod.start, first.educationPeriod.end], ["2026-11-20", "2026-11-27"]);
  assert.equal(first.fee, "0원");
  assert.equal(first.capacity, "10");
  // Escaped title text is decoded.
  assert.equal(allRows[2].title, "[ANCHOR]서울시립대와 함께하는 시니어를 위한 스마트스토어 입문 <2기>");
});

test("모집중 list has no closed courses and the empty page ends paging", () => {
  assert.equal(joinRows.length, 10);
  assert.ok(joinRows.every((row) => row.statusLabel === "수강신청" || row.statusLabel === "대기신청"));
  assert.equal(parseFiftyPlusListPage(load("list-join-page3-empty.html"), `${BOARD}?state=JOIN&page=3`, BOARD).length, 0);
});

test("수강신청 course: fields match the source and the deadline is end of day in Seoul", () => {
  const post = coursePost("78659744");
  assert.equal(post.title, "긱워커 디지털 역량 강화 과정 (이미지 심화 실습 과정)");
  assert.equal(post.organizerName, "서대문50플러스센터");
  assert.equal(post.site, "서울시50플러스포털");
  assert.equal(post.sourceApplicationStatus.state, "open");
  assert.equal(post.deadline, "2026-11-21T23:59:59+09:00");
  assert.equal(post.portalDeadline.date, "2026-11-21");
  assert.equal(post.portalDeadline.time, null);
  assert.equal(post.eventStartAt, "2026-11-20");
  assert.equal(post.eventEndAt, "2026-11-27");
  assert.deepEqual(post.images, ["https://www.50plus.or.kr/upload/im/2026/11/c58735b7-6833-4129-bc50-b58cf485970b.png"]);
  assert.deepEqual(post.links, [{
    link_type: "official_apply",
    title: "서울시50플러스포털 수강신청",
    url: "https://www.50plus.or.kr/sdm/education-apply.do?id=78659744",
    is_primary: true,
  }]);
  for (const line of [
    "주관기관: 서대문50플러스센터",
    "접수상태: 수강신청",
    "모집기간: 2026.11.16 ~ 2026.11.21",
    "교육기간: 2026.11.20 ~ 2026.11.27",
    "수강료: 0원 (추가비용: 없음)",
    "정원: 10명",
  ]) {
    assert.ok(post.content.split("\n").includes(line), line);
  }
  // The source text states no eligibility: a person checks the poster image.
  assert.deepEqual(post.sourceReviewIssues.map((issue) => issue.code), ["eligibility-unconfirmed"]);
  assert.ok(!/대상\s*:/.test(post.content));
  assert.ok(!/상시/.test(post.content));
});

test("대기신청 course is open for a waitlist, with the shared banner image dropped", () => {
  const post = coursePost("76588175");
  assert.equal(post.sourceApplicationStatus.state, "waitlist");
  assert.equal(post.deadline, "2026-12-07T23:59:59+09:00");
  assert.ok(post.content.includes("접수상태: 대기신청"));
  assert.ok(post.content.includes("정원: 25명"));
  assert.equal(post.links[0].title, "서울시50플러스포털 대기신청");
  assert.deepEqual(post.images, ["https://www.50plus.or.kr/upload/im/2026/11/a6da5916-52a6-4b2c-94bd-4341fec25695.jpg"]);
  assert.deepEqual(
    post.sourceReviewIssues.map((issue) => issue.code),
    ["eligibility-unconfirmed", "source-application-waitlist"],
  );
});

test("신청마감 while the period remains is closed: no apply link, no image candidates", () => {
  const post = coursePost("78232916");
  // 모집기간 runs to 2026-12-04, but the button says 신청마감.
  assert.equal(post.sourceApplicationStatus.state, "closed");
  assert.equal(post.deadline, "2026-12-04T23:59:59+09:00");
  assert.deepEqual(post.links, []);
  assert.deepEqual(post.images, []);
  assert.ok(post.content.includes("접수상태: 신청마감"));
  assert.ok(!post.content.includes("신청방법"));
  // It still reaches upload (as a text notice), where the closed path runs.
  assert.equal(isCollectableTextNotice(post), true);
});

test("course posts pass the crawler filters and the quality gate only asks for review", () => {
  for (const id of ["78659744", "76588175"]) {
    const post = coursePost(id);
    assert.equal(getPostExclusionReason(post), null, id);
    const quality = evaluatePosterQuality(post, {
      sourceKey: post.sourceUrl,
      images: post.images,
      links: post.links.map((link) => link.url),
      sourceUrl: post.sourceUrl,
      extractedDeadline: post.deadline,
    });
    assert.notEqual(quality.decision, "reject", `${id}: ${quality.issues.map((issue) => issue.code)}`);
  }
});

test("re-crawl keeps the identity: same course -> same source key; list pages overlap without duplicates", () => {
  const merged = new Map([...joinRows, ...allRows].map((row) => [row.url, row]));
  assert.equal(merged.size, 14);
  const once = coursePost("78659744");
  const again = coursePost("78659744");
  assert.equal(normalizeSourceKey(once.sourceUrl), normalizeSourceKey(again.sourceUrl));
  assert.equal(normalizeSourceKey(`${detailUrl("78659744")}&page=2`), normalizeSourceKey(detailUrl("78659744")));
  assert.notEqual(normalizeSourceKey(detailUrl("78659744")), normalizeSourceKey(detailUrl("78659421")));
});

test("similar titles of different courses are not merged by title similarity", () => {
  // [온라인] / [오프라인] 사이특강 share title, organizer and deadline.
  const online = allRows.find((row) => row.courseId === "77210311");
  const offline = allRows.find((row) => row.courseId === "77199420");
  assert.match(online.title, /온라인/);
  assert.match(offline.title, /오프라인/);
  const candidate = {
    title: online.title,
    site: "서울시50플러스포털",
    sourceUrl: online.url,
    url: online.url,
    source_key: online.url,
    application_end_at: "2026-11-13T23:59:59+09:00",
    sourceIdentity: { param: "id", value: online.courseId },
  };
  const existing = {
    title: offline.title,
    source_org_name: "서울시50플러스포털",
    source_key: offline.url,
    application_end_at: "2026-11-13T23:59:59+09:00",
  };
  // The generic detector alone flags them as the same notice (82 points:
  // title 0.92 + org + deadline on 2026-11-19) ...
  assert.notEqual(scorePosterDuplicate(candidate, existing).decision, "none");
  // ... so upload drops other items of the same source board first.
  assert.equal(isDistinctSameSourceItem(candidate, existing.source_key), true);
  assert.equal(isDistinctSameSourceItem(candidate, online.url), false);
  assert.equal(isDistinctSameSourceItem(candidate, "https://www.sdm.go.kr/news/view.do?id=77199420"), false);
  assert.equal(isDistinctSameSourceItem({ ...candidate, sourceIdentity: undefined }, existing.source_key), false);
});

test("missing period or another center's row is sent to review, never filled in", () => {
  const url = detailUrl("78659744");
  const $ = load("detail-78659744.html");
  $(".application-info").remove();
  const detail = parseFiftyPlusDetailPage($, url, null);
  const post = buildFiftyPlusCoursePost({
    detail,
    listRow: { centerLabel: "노원센터", statusLabel: "수강신청" },
    boardUrl: BOARD,
    postUrl: url,
  });
  assert.equal(post.deadline, undefined);
  assert.equal(post.portalDeadline, undefined);
  assert.equal(post.organizerName, undefined);
  assert.ok(!post.content.includes("모집기간"));
  assert.ok(!/상시/.test(post.content));
  const codes = post.sourceReviewIssues.map((issue) => issue.code);
  assert.ok(codes.includes("application-period-unconfirmed"));
  assert.ok(codes.includes("organizer-unconfirmed"));
});
