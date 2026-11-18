import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  filterSupplementalLinksForNotice,
  ownYouthNoticeIds,
  sameProgramTitle,
  youthSeoulNoticeId,
} from "./youth-seoul-links.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../test-fixtures/youth-seoul");
const notice = (id) => `https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=${id}`;

test("youthSeoulNoticeId reads the portal notice id only from portal notice URLs", () => {
  assert.equal(youthSeoulNoticeId(notice(75755)), "75755");
  assert.equal(youthSeoulNoticeId("https://youth.seoul.go.kr/infoData/sprtInfo/view.do?sprtInfoId=75300&key=2309130006"), "75300");
  assert.equal(youthSeoulNoticeId("https://youth.seoul.go.kr/youngtech/cls/list/224"), null);
  assert.equal(youthSeoulNoticeId("https://forms.gle/Gh6f5VucFCWCqS2YA"), null);
  assert.equal(youthSeoulNoticeId("https://example.com/infoData/sprtInfo/view.do?sprtInfoId=1"), null);
  assert.equal(youthSeoulNoticeId("not a url"), null);
});

test("a live notice page links only its own notice inside .feed-view (fixtures 2026-11-19)", () => {
  for (const [file, ownId] of [["notice-75755.html", "75755"], ["notice-75866.html", "75866"]]) {
    const $ = cheerio.load(fs.readFileSync(path.join(FIXTURES, file), "utf8"));
    const hrefs = $(".feed-view a[href]").map((_, a) => $(a).attr("href")).get();
    const ids = hrefs.map(youthSeoulNoticeId).filter(Boolean);
    assert.ok(ids.every((id) => id === ownId), `${file}: ${ids.join(",")}`);
  }
  // 75866 was stored with naver.me/GfrQOpuR and notice 75826: neither is on its page.
  const $ = cheerio.load(fs.readFileSync(path.join(FIXTURES, "notice-75866.html"), "utf8"));
  const html = $.html();
  assert.ok(html.includes("https://forms.gle/s3kqXZmAZMpJRMa2A"));
  assert.ok(!html.includes("naver.me/GfrQOpuR"));
  assert.ok(!html.includes("sprtInfoId=75826"));
});

test("ownYouthNoticeIds uses the source notice, else the 경유 출처 link", () => {
  assert.deepEqual([...ownYouthNoticeIds({ source_key: notice(75777) })], ["75777"]);
  assert.deepEqual([...ownYouthNoticeIds({
    source_key: "https://dsnfilmart.or.kr/edu/program.php?programID=1412&type=view",
    poster_links: [
      { link_type: "other", url: notice(75873) },
      { link_type: "official_notice", url: "https://dsnfilmart.or.kr/edu/program.php?programID=1412&type=view" },
    ],
  })], ["75873"]);
  assert.equal(ownYouthNoticeIds({ source_key: "https://www.k-startup.go.kr/x" }).size, 0);
});

test("a sibling notice merged into a poster adds none of its links (golden df8f1404)", () => {
  const targetRow = {
    source_key: notice(75777),
    poster_links: [
      { link_type: "official_apply", url: "https://forms.gle/FhVbkxvBS6Mauey69" },
      { link_type: "official_notice", url: notice(75777) },
    ],
  };
  const linkEntries = [
    { link_type: "official_apply", url: "https://forms.gle/ZxUvewjs2N4SCRRr6", is_primary: true },
    { link_type: "official_notice", url: notice(75774), is_primary: false },
  ];
  const result = filterSupplementalLinksForNotice({ targetRow, sourceUrl: notice(75774), linkEntries });
  assert.deepEqual(result.links, []);
  assert.equal(result.dropped.length, 2);
  assert.equal(result.reason, "different-portal-notice");
});

test("an external original reached through another portal notice adds nothing (golden 0b85eae5)", () => {
  const result = filterSupplementalLinksForNotice({
    targetRow: { source_key: notice(75881) },
    sourceUrl: "https://dsnfilmart.or.kr/edu/program.php?programID=1412&type=view",
    linkEntries: [
      { link_type: "other", url: notice(75873) },
      { link_type: "official_apply", url: "https://dsnfilmart.or.kr/edu/program.php" },
    ],
  });
  assert.deepEqual(result.links, []);
});

test("the same notice seen again keeps its links; a link to another notice is dropped", () => {
  const result = filterSupplementalLinksForNotice({
    targetRow: { source_key: notice(75866) },
    sourceUrl: notice(75866),
    linkEntries: [
      { link_type: "official_apply", url: "https://forms.gle/s3kqXZmAZMpJRMa2A" },
      { link_type: "official_notice", url: notice(75866) },
      { link_type: "official_notice", url: notice(75826) },
    ],
  });
  assert.deepEqual(result.links.map((l) => l.url), ["https://forms.gle/s3kqXZmAZMpJRMa2A", notice(75866)]);
  assert.deepEqual(result.dropped.map((l) => l.url), [notice(75826)]);
  assert.equal(result.reason, "foreign-portal-notice-link");
});

test("sameProgramTitle compares the bracketed program name, else the plain title", () => {
  // Sibling sessions of one center (golden df8f1404, 69a216f5).
  assert.equal(sameProgramTitle("서울청년센터 양천<SKILL:ON - 클로드코드로 디자인>", "서울청년센터 양천<SKILL:ON - 클로드코드로 영상제작>"), false);
  assert.equal(sameProgramTitle("서울청년센터 마포 <리부트 프로젝트 - 화장대편> 참여자 모집", "서울청년센터 마포 <리부트 프로젝트 -옷장편> 참여자 모집"), false);
  // A repost with a typo fixed and a deadline extension (golden 32785fa3).
  assert.equal(sameProgramTitle(
    "서울청년센터 관악 신림동쓰리룸 X ATD캡스 <나를 지키는 호신술> 참여자 모집",
    "서울청년센터 관악 신림동쓰리룸 X ADT캡스 <나를 지키는 호신술> 참여자 모집 *모집 기간 연장*",
  ), true);
  assert.equal(sameProgramTitle("청년 마음건강 상담 모집", "청년 마음건강 상담 모집 (추가모집)"), true);
  assert.equal(sameProgramTitle("청년 마음건강 상담 모집", null), false);
});

test("a repost of the same program under a new notice id keeps its links", () => {
  const linkEntries = [{ link_type: "official_notice", url: notice(75895) }];
  const result = filterSupplementalLinksForNotice({
    targetRow: { title: "서울청년센터 관악 신림동쓰리룸 X ATD캡스 <나를 지키는 호신술> 참여자 모집", source_key: notice(75883) },
    sourceUrl: notice(75895),
    linkEntries,
    incomingTitle: "서울청년센터 관악 신림동쓰리룸 X ADT캡스 <나를 지키는 호신술> 참여자 모집 *모집 기간 연장*",
  });
  assert.equal(result.links, linkEntries);
});

test("posters unrelated to the portal are left unchanged", () => {
  const linkEntries = [{ link_type: "official_apply", url: "https://forms.gle/q61cvcRxJwF4Jiq88" }];
  const result = filterSupplementalLinksForNotice({
    targetRow: { source_key: "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=179664" },
    sourceUrl: "https://www.bizinfo.go.kr/x",
    linkEntries,
  });
  assert.equal(result.links, linkEntries);
  assert.equal(result.reason, null);
});
