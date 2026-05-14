const TITLE_EXCLUDE_RULES = [
  {
    name: "metadata-title",
    pattern: /^(작성자|관리자|번호|제목|공지사항|조회수|첨부파일|maposc)$/i,
    reason: "board metadata captured as title",
  },
  {
    name: "metadata-title-prefix",
    pattern: /^작성자\s*:/i,
    reason: "board metadata captured as title",
  },
  {
    name: "rss-or-feed",
    pattern: /^(rss|feed)$/i,
    reason: "RSS/feed navigation item",
  },
  {
    name: "application-guide",
    pattern: /신청\s*안내|신청안내|이용\s*안내|신청방법|신청서|등록\s*안내|업\s*신청/i,
    reason: "administrative application guide",
  },
  {
    name: "reporting-or-voting-guide",
    pattern: /거소투표|투표신고|전수조사|신고센터|신고\s*안내/i,
    reason: "reporting/voting guide",
  },
  {
    name: "result-or-selected-list",
    pattern: /결과\s*안내|선정\s*결과|추첨\s*결과|합격자|서류심사|최종\s*합격|발표/i,
    reason: "result announcement",
  },
  {
    name: "closure-or-operation-notice",
    pattern: /휴관\s*안내|휴무\s*안내|운영\s*안내|일정\s*안내|개관\s*안내/i,
    reason: "facility operation notice",
  },
  {
    name: "posting-guide",
    pattern: /게시\s*요청|게시요청|게시\s*가이드|프로그램\s*게시/i,
    reason: "posting guide",
  },
  {
    name: "donation-or-campaign-link",
    pattern: /모금함|후원|기부\s*안내|서명\s*관련/i,
    reason: "donation/signature notice",
  },
  {
    name: "job-document-notice",
    pattern: /직원\s*채용공고|직원\s*채용\s*공고|채용\s*서류|이의신청서|반환\s*신청서/i,
    reason: "job document notice",
  },
  {
    name: "low-poster-specific-known-terms",
    pattern: /외국인관광\s*도시민박업|안심장비\s*지원사업|반려식물\s*클리닉|구석구석\s*동네문화예술교육|인공달팽이관/i,
    reason: "known low-poster notice format",
  },
];

export function getPostExclusionReason(post = {}) {
  const title = String(post.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) return null;

  const matchedRule = TITLE_EXCLUDE_RULES.find((rule) => rule.pattern.test(title));
  if (!matchedRule) return null;

  return {
    rule: matchedRule.name,
    reason: matchedRule.reason,
  };
}

export function isExcludedPostCandidate(post = {}) {
  return Boolean(getPostExclusionReason(post));
}
