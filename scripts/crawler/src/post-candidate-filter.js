const TITLE_EXCLUDE_RULES = [
  {
    name: "breadcrumb-title",
    pattern: /^[^/]+(?:\s*\/\s*[^/]+){2,}$/i,
    reason: "breadcrumb/navigation path captured as title",
  },
  {
    name: "monthly-calendar-or-schedule-image",
    pattern: /(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4).*(?:\uC6D4\s*\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C)|(?:\uC6D4\s*\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C).*(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4)/i,
    reason: "monthly calendar/schedule image, not an individual poster",
  },
  {
    name: "gangbuk-anc-monthly-craft-class-schedule",
    pattern: /(?:\uAC15\uBD81\s*ANC|\uACF5\uC608\uC804\uC2DC\uAD00\s*\uAC15\uBD81\s*ANC).*(?:\d{1,2}\s*\uC6D4\s*\uACF5\uC608\s*(?:\uCCB4\uD5D8\s*)?\uD074\uB798\uC2A4|\uACF5\uC608\s*\uD074\uB798\uC2A4\s*\(\s*\d{1,2}\s*\uC6D4\s*\))/i,
    reason: "Gangbuk ANC monthly craft class schedule, not an individual poster",
  },
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
    name: "sports-facility-hours-or-closure",
    pattern: /(?:부분\s*운영일|법정\s*공휴일|공휴일|시간표|이용\s*시간|운영\s*안내|이용\s*안내).*(?:배드민턴|볼링장|종합체육관|체육관|센터|시설)|(?:배드민턴|볼링장|종합체육관|체육관|센터|시설).*(?:부분\s*운영일|법정\s*공휴일|공휴일|시간표|이용\s*시간|운영\s*안내|이용\s*안내)/i,
    reason: "sports facility hours or holiday operation notice, not a poster notice",
  },
  {
    name: "sports-program-timetable",
    pattern: /(?:프로그램|생활\s*체육|생활체육|스포츠|아카데미맥|수영장|헬스장|배드민턴|체육관|체력\s*인증\s*센터).*(?:시간표|운영\s*안내|운영안내|이용\s*안내|이용안내|모집\s*일정|고객\s*모집\s*일정|개소\s*및\s*이용)|(?:시간표|운영\s*안내|운영안내|이용\s*안내|이용안내|모집\s*일정|고객\s*모집\s*일정|개소\s*및\s*이용).*(?:프로그램|생활\s*체육|생활체육|스포츠|아카데미맥|수영장|헬스장|배드민턴|체육관|체력\s*인증\s*센터)/i,
    reason: "sports center timetable or operation guide, not an individual poster",
  },
  {
    name: "facility-administrative-notice",
    pattern: /(?:사진\s*및\s*동영상\s*촬영\s*안내|배드민턴\s*타임별\s*이용\s*(?:코드|코트)\s*안내|체육관\s*대관\s*당첨자\s*안내|주차장\s*일부\s*제한\s*안내|시설\s*장비\s*및\s*물품\s*현황\s*공시|장비\s*및\s*보호구\s*현황\s*공시|시설\s*이용료\s*소득공제\s*안내|회원\s*이용약관|홈페이지\s*이용약관|다중\s*로그인\s*차단\s*안내|직원\s*사칭\s*주의\s*안내)/i,
    reason: "facility or organization administrative notice, not a poster notice",
  },
  {
    name: "holiday-operation-notice",
    pattern: /(?:부분\s*운영일|법정\s*공휴일|공휴일).*(?:이용\s*안내|이용안내|운영\s*안내|운영안내)|(?:이용\s*안내|이용안내|운영\s*안내|운영안내).*(?:부분\s*운영일|법정\s*공휴일|공휴일)/i,
    reason: "holiday or partial-operation notice, not a poster notice",
  },
  {
    name: "holiday-designation-or-partial-operation",
    pattern: /(?:부분\s*운영일|법정\s*공휴일|공휴일).*(?:지정\s*알림|알림|공지|이용\s*시간|운영\s*안내|이용\s*안내)|(?:지정\s*알림|알림|공지|이용\s*시간|운영\s*안내|이용\s*안내).*(?:부분\s*운영일|법정\s*공휴일|공휴일)|부분\s*운영일/i,
    reason: "holiday or partial-operation administrative notice, not a poster notice",
  },
  {
    name: "election-facility-notice",
    pattern: /(?:전국\s*동시\s*지방\s*선거|전국동시지방선거|선거일).*(?:환불\s*안내|시설|주차|이용\s*제한|이용제한|운영\s*안내)/i,
    reason: "election-day facility operation notice, not a poster notice",
  },
  {
    name: "election-administrative-notice",
    pattern: /(?:전국\s*동시\s*지방\s*선거|전국동시지방선거).*(?:무투표|선거구|후보자|사퇴|환불|안내)/i,
    reason: "election administrative notice, not a poster notice",
  },
  {
    name: "facility-access-control-or-refund",
    pattern: /(?:주차장|주차|시설|센터).*(?:일부\s*통제|통제|이용\s*제한|이용제한)|(?:환불\s*안내|회원\s*접수\s*및\s*이용\s*안내|회원접수\s*및\s*이용안내)/i,
    reason: "facility access, refund, or member-use guide, not a poster notice",
  },
  {
    name: "rental-schedule-table",
    pattern: /(?:센터|체육관|시설).*(?:관내\s*대관|대관).*(?:일정표|일정\s*표)|(?:관내\s*대관|대관).*(?:일정표|일정\s*표)/i,
    reason: "facility rental schedule table, not a poster notice",
  },
  {
    name: "homepage-parking-control-notice",
    pattern: /홈페이지.*(?:이용|접속).*(?:주차\s*통제|주차통제)|(?:주차\s*통제|주차통제).*(?:홈페이지|이용\s*안내)/i,
    reason: "homepage or parking-control operation notice, not a poster notice",
  },
  {
    name: "sports-facility-use-schedule",
    pattern: /(?:\d{1,2}\s*월\s*(?:~|-|부터)\s*\d{1,2}\s*월|오전|오후|야간|평일|주말).*(?:종합체육관|체육관|체육센터|배드민턴|수영장|헬스장).*(?:이용\s*안내|운영\s*안내|시간\s*안내|일정\s*안내)|(?:종합체육관|체육관|체육센터|배드민턴|수영장|헬스장).*(?:오전|오후|야간|평일|주말|이용\s*안내|운영\s*안내|시간\s*안내|일정\s*안내)/i,
    reason: "sports facility use schedule, not a poster notice",
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
    pattern: /결과\s*안내|선정\s*결과|추첨\s*결과|합격자|당첨자|서류심사|최종\s*합격|발표|선발.*공개|공개.*선발/i,
    reason: "result announcement",
  },
  {
    name: "korean-result-or-selected-list",
    pattern: /합격자\s*발표|최종\s*합격자?|서류\s*합격자?|1차\s*합격자?|2차\s*합격자?|선정\s*결과|추첨\s*결과|결과\s*발표|대상자\s*발표|명단\s*발표/i,
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
    name: "public-workfare-recruitment-document",
    pattern: /지역공동체\s*일자리\s*사업.*참여자\s*모집|지역공동체일자리사업.*참여자\s*모집/i,
    reason: "administrative workfare recruitment document, not a poster notice",
  },
  {
    name: "facility-use-guide",
    pattern: /(종합체육관|체육관|배드민턴|수영장|헬스장|체육센터|시설|대관).*(이용\s*안내|운영\s*안내|휴관\s*안내|대관\s*안내)|(?:이용\s*안내|운영\s*안내|휴관\s*안내|대관\s*안내).*(종합체육관|체육관|배드민턴|수영장|헬스장|체육센터|시설|대관)/i,
    reason: "facility operation or use guide, not a poster notice",
  },
  {
    name: "low-poster-specific-known-terms",
    pattern: /외국인관광\s*도시민박업|안심장비\s*지원사업|반려식물\s*클리닉|구석구석\s*동네문화예술교육|인공달팽이관/i,
    reason: "known low-poster notice format",
  },
];

export function getPostExclusionReason(post = {}) {
  const title = String(post.title ?? "").replace(/\s+/g, " ").trim();
  const text = [
    post.title,
    post.content,
    post.summary_short,
    post.summary_long,
    ...(Array.isArray(post.attachments) ? post.attachments.map((attachment) => attachment?.name) : []),
    ...(Array.isArray(post.images) ? post.images : []),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const matchedRule = TITLE_EXCLUDE_RULES.find((rule) => rule.pattern.test(title) || rule.pattern.test(text));
  if (!matchedRule) return null;

  return {
    rule: matchedRule.name,
    reason: matchedRule.reason,
  };
}

export function isExcludedPostCandidate(post = {}) {
  return Boolean(getPostExclusionReason(post));
}
