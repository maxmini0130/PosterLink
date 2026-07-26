// SNS_INGESTION.md Phase 2, Stage 1 — 휴리스틱 정규식 관련성 분류기.
//
// post-candidate-filter.js(TITLE_EXCLUDE_RULES)와 같은 "정규식 목록 + 사유" 패턴을 따르되,
// 그 파일은 "행정 잡음"(시설 시간표, 선거 안내, 결과 공지 등)을 거르는 반면
// 이 파일은 완전히 다른 축 — "인사말/축하/일상"을 거르고, "마감+액션동사"가 뚜렷하면
// LLM 라우터(Stage 4) 호출 없이 바로 공고로 확정한다(비용 절감).
//
// route: '폐기' | '공고' | null(애매함 — Stage 4 LLM 라우터에 위임)

const GREETING_DISCARD_RULES = [
  {
    name: "head-greeting-message",
    pattern: /(?:구청장|시장|군수|구실장|원장|센터장|이사장|기관장)\s*인사말/,
    reason: "기관장 인사말은 공고/소식 어느 쪽도 아닌 내부 인사성 게시물",
    titleOnly: true,
  },
  {
    name: "new-year-address",
    pattern: /신년사|신년\s*인사말|취임\s*인사/,
    reason: "신년사/취임 인사는 지역민 액션·유용 정보가 없는 인사성 게시물",
    titleOnly: true,
  },
  {
    name: "congratulation-message",
    pattern: /축하(?:드립니다|합니다|메시지)|합격\s*축하|생일\s*축하/,
    reason: "축하 메시지류 게시물",
    titleOnly: true,
  },
  {
    name: "thanks-message",
    pattern: /감사(?:의\s*글|인사드립니다)(?!\s*패)/,
    reason: "감사 인사글 (감사패 수상 소식 등 실질 콘텐츠가 있는 경우는 제외 패턴에 해당 안 함)",
    titleOnly: true,
  },
  {
    name: "staff-daily-life",
    pattern: /직원\s*동정|일일\s*소통|국외\s*출장\s*보고/,
    reason: "내부 일상/동정 게시물, 지역민 유용성 없음",
    titleOnly: true,
  },
];

// "~까지", "접수기간", "마감" 등 마감/기간 표현
const DEADLINE_PATTERN =
  /까지|접수\s*기간|마감(?:일)?|신청\s*기간|\d{1,2}\s*[.\-/]\s*\d{1,2}\s*[.)]|상시|연중/;

// "신청", "모집", "지원", "응모", "참가", "제출" 등 사용자 액션 동사
const ACTION_VERB_PATTERN =
  /신청|모집|지원(?:하|사업)|응모|참가\s*신청|제출/;

function buildBundle(post, titleOnly) {
  if (titleOnly) return String(post.title ?? "");
  return [post.title, post.content, post.summary, post.deadline]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {{title?: string, content?: string, summary?: string, deadline?: string}} post
 * @returns {{route: '폐기'|'공고'|null, matchedRule: string|null, reason: string}}
 */
export function evaluateRelevanceHeuristic(post) {
  for (const rule of GREETING_DISCARD_RULES) {
    const bundle = buildBundle(post, rule.titleOnly);
    if (rule.pattern.test(bundle)) {
      return { route: "폐기", matchedRule: rule.name, reason: rule.reason };
    }
  }

  const bundle = buildBundle(post, false);
  const hasDeadline = DEADLINE_PATTERN.test(bundle);
  const hasAction = ACTION_VERB_PATTERN.test(bundle);

  if (hasDeadline && hasAction) {
    return {
      route: "공고",
      matchedRule: "deadline+action-verb",
      reason: "마감/기간 표현과 신청·모집 등 액션 동사가 함께 발견되어 공고로 확정(LLM 라우터 생략)",
    };
  }

  return { route: null, matchedRule: null, reason: "판단 불가 — LLM 라우터(Stage 4)에 위임" };
}
