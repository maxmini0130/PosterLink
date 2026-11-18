import assert from "node:assert/strict";
import test from "node:test";
import * as cheerio from "cheerio";

import { parseMapoLaborListPage } from "./adapters/mapo-labor.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";

const NOTICE = "https://mapolabor.org/community/notice";
const NEWS = "https://mapolabor.org/community/news";

test("공지사항 table rows map to /community/notice detail URLs", () => {
  const $ = cheerio.load(`<table><tbody>
    <tr><td>98</td><td><nobr><a href="javascript:Page.goView(411)">2026년도 노동자 송년회</a></nobr></td><td>2026-11-11</td></tr>
    <tr><td>97</td><td><nobr><a href="javascript:Page.goView(405)">2026년도 2차 운영위원회 결과 보고</a></nobr></td></tr>
  </tbody></table>`);
  const posts = parseMapoLaborListPage($, NOTICE, NOTICE);
  assert.deepEqual(posts.map((p) => [p.title, p.url]), [
    ["2026년도 노동자 송년회", "https://mapolabor.org/community/notice/post?seq=411"],
    ["2026년도 2차 운영위원회 결과 보고", "https://mapolabor.org/community/notice/post?seq=405"],
  ]);
});

test("센터소식 cards keep /community/news detail URLs", () => {
  const $ = cheerio.load(`<div class="item-box"><a href="javascript:Page.goView(410)"><figure><img src="/upload/a.jpg"></figure></a>
    <div class="item-box-desc"><h3>청소노동자 11월모임 소식</h3></div></div>`);
  const posts = parseMapoLaborListPage($, `${NEWS}?pageNo=2`, NEWS);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://mapolabor.org/community/news/post?seq=410");
  assert.deepEqual(posts[0].images, ["https://mapolabor.org/upload/a.jpg"]);
});

test("committee meeting notices are excluded but calls for members are not", () => {
  for (const title of ["2026년도 2차 운영위원회 결과 보고", "2025년도 1차 운영위원회 개최 공고", "운영위원회 회의 안내", "2026년도 2차 운영위원회 공지"]) {
    assert.match(JSON.stringify(getPostExclusionReason({ title })), /committee-meeting-notice/, title);
  }
  for (const title of ["2027년 운영위원 모집 공고", "2026년도 노동자 송년회"]) {
    const reason = getPostExclusionReason({ title });
    assert.ok(!/committee-meeting-notice/.test(JSON.stringify(reason ?? null)), title);
  }
});
