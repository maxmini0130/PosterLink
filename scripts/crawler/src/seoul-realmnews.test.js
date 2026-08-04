import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDeadline,
  resolveConfiguredListUrl,
} from "./adapters/generic-board.js";
import { isCollectableTextNotice } from "./crawler.js";
import { getPostExclusionReason } from "./post-candidate-filter.js";
import { sites } from "./sites.js";

test("Seoul realm news uses the existing Seoul institution with scoped selectors", () => {
  const site = sites.find((entry) => entry.id === "seoul-city");
  const board = site?.boards.find(
    (entry) => entry.url === "https://www.seoul.go.kr/realmnews/in/list.do",
  );

  assert.equal(site?.name, "서울특별시");
  assert.equal(site?.adapter, "seoul-city");
  assert.equal(board?.pagination?.param, "fetchStart");
  assert.equal(board?.analyzeAttachments, false);
  assert.equal(board?.forceHttps, true);
  assert.equal(board?.selectors?.listItem, ".news-lst .item");
  assert.equal(board?.selectors?.detailContent, "#post_content");
  assert.ok(board?.selectors?.detailImages.includes("#post_content > p img"));
  assert.ok(board?.selectors?.removeBeforeText.includes("#ratingWrapper"));
  assert.equal(
    new RegExp(board?.includeUrlPatterns?.[0]).test(
      "https://news.seoul.go.kr/safe/archives/518382",
    ),
    true,
  );
});

test("abbreviated Seoul notice ranges produce a complete deadline", () => {
  assert.equal(
    extractDeadline("모집기간 : ’26. 8. 3.(월) ~ 23.(일)"),
    "2026-08-23",
  );
  assert.equal(
    extractDeadline("신청기간 2026. 8. 10. ~ 9. 2."),
    "2026-09-02",
  );
  assert.equal(
    extractDeadline("접수기간 : '26.7.31.(금) 09:00 ~ '26.8.31.(월) 17:00 까지"),
    "2026-08-31",
  );
  assert.equal(
    extractDeadline("신청기간 : 2026. 8. 10.(월) 10:00~ 신청방법 : 온라인 신청 여행기간 : 2026. 8. 21.(금)~8. 23.(일)"),
    null,
  );
  assert.equal(
    extractDeadline("신청 방법은? 2026년 12월 31일까지 동 주민센터 또는 온라인으로 신청 가능합니다."),
    "2026-12-31",
  );
});

test("Seoul notice JavaScript links become canonical detail URLs", () => {
  assert.equal(
    resolveConfiguredListUrl(
      "javascript:fnTbbsView('463203');",
      "https://www.seoul.go.kr/news/news_notice.do?bbsNo=277",
      {
        forceHttps: true,
        linkTransform: {
          pattern: "fnTbbsView\\('(?<id>\\d+)'\\)",
          template: "https://www.seoul.go.kr/news/news_notice.do?bbsNo=277&nttNo={id}",
        },
      },
    ),
    "https://www.seoul.go.kr/news/news_notice.do?bbsNo=277&nttNo=463203",
  );
});

test("a Seoul recruitment notice is not rejected by its result announcement schedule", () => {
  assert.equal(
    getPostExclusionReason({
      title: "2026년 제5기 서울 대학생 순찰대 추가 모집 공고",
      content: "모집기간 2026. 8. 3. ~ 8. 23. 합격자 발표는 8. 26. 예정입니다.",
      url: "https://www.seoul.go.kr/news/news_notice.do?bbsNo=277&nttNo=463203",
    }),
    null,
  );

  assert.equal(
    getPostExclusionReason({
      title: "서울 대학생 순찰대 최종 합격자 발표",
      content: "선정 결과와 합격자 명단을 안내합니다.",
    })?.rule,
    "result-or-selected-list",
  );
});

test("Seoul text-only fallback keeps actionable notices and rejects administrative news", () => {
  assert.equal(
    isCollectableTextNotice({
      collectionSourceSlug: "seoul-city",
      title: "2026년 서울농장 참여자 모집",
      content: "신청기간은 2026년 8월 3일부터 8월 23일까지이며 신청방법과 모집대상을 안내합니다.",
    }),
    true,
  );

  assert.equal(
    isCollectableTextNotice({
      collectionSourceSlug: "seoul-city",
      title: "행정처분 사전통지 공시송달 공고",
      content: "관련 법률에 따라 행정처분 대상자에게 공고하고 의견 제출 기간과 접수 방법을 안내합니다.",
    }),
    false,
  );

  assert.equal(
    isCollectableTextNotice({
      collectionSourceSlug: "seoul-city",
      title: "서울시 AI 돌봄 서비스 확대",
      content: "서울시는 인공지능 기반 돌봄 서비스를 확대하고 향후 사업 계획과 주요 내용을 발표했습니다.",
    }),
    false,
  );
});

test("Seoul broad news requires public recruitment or application evidence before image review", () => {
  for (const title of [
    "무연고 사망자 공고",
    "수인성·식품매개감염병 6대 예방수칙",
    "2027년 시민참여예산 온라인 시민투표",
    "서울배달+ 땡겨요 8월 한달 간 한강 배달존 특별한 할인 혜택!",
    "서울 주얼리 브랜드 14개사, 더현대 서울에 모인다",
  ]) {
    assert.equal(
      getPostExclusionReason({
        title,
        content: "서울시 분야별 새소식의 상세 안내 내용입니다.",
        url: "https://news.seoul.go.kr/gov/archives/579999",
      })?.rule,
      "seoul-news-without-public-action",
    );
  }

  assert.equal(
    getPostExclusionReason({
      title: "[상주서울농장] 로컬만만세-씨실과 날실처럼",
      content: "신청기간 2026. 8. 10. 10:00부터 서울시 공공서비스예약에서 신청",
      url: "https://news.seoul.go.kr/gov/archives/579936",
    }),
    null,
  );
});
