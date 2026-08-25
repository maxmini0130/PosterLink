const DISCARD_ISSUE_CODES = new Set([
  "duplicate_suspected",
  "generic-title",
  "breadcrumb-title",
  "mojibake",
  "system-error",
  "encoded-or-binary-text",
]);

const ADMIN_ISSUE_CODES = new Set([
  "employment-recruitment-notice",
  "public-workfare-doc",
  "administrative-campaign-attachment",
  "election-facility",
]);

const NEWS_ISSUE_CODES = new Set([
  "retrospective-news",
  "news-board-without-action",
  "public-safety-guide",
]);

const ADMIN_TITLE_RE = /(?:채용\s*(?:공고|재공고|기간|안내)|직원\s*채용|계약직\s*(?:직원|사회복지사|매니저)?\s*채용|강사\s*모집|(?:관리인|관리원|청소원|환경미화원)\s*모집\s*공고|통장\s*모집\s*공고|입찰\s*공고|수의계약|행정예고|고시\s*공고|공고\s*제\s*\d{4}-\d+)/i;
const NEWS_TITLE_RE = /(?:소식|보도자료|결과\s*(?:발표|공지|안내)|선정\s*결과|당첨자|합격자|후기|현장\s*스케치|활동\s*보고|행사\s*취소|변경\s*안내)/i;
const RECRUIT_ACTION_RE = /(?:모집|신청|접수|참여자|참가자|수강생|교육생|지원\s*대상|대상자\s*모집|공모|선착순|접수\s*중|apply|register|registration)/i;
const PROGRAM_RE = /(?:프로그램|교육|행사|강좌|특강|멘토링|컨설팅|창업|지원사업|바우처|공모전|네트워킹|워크숍|캠프|상담|클리닉)/i;

function compact(value, limit = 300) {
  return Array.from(String(value ?? "").replace(/\s+/g, " ").trim()).slice(0, limit).join("");
}

function issueCodesFrom(row = {}) {
  return [
    ...(row.quality_issues ?? []),
    ...(row.field_verification?.qualityIssues ?? []),
    ...(row.field_verification?.duplicateIssues ?? []),
  ]
    .map((issue) => (typeof issue === "string" ? issue : issue?.code))
    .filter(Boolean);
}

function sourceRoute(row = {}) {
  return String(
    row.field_verification?.classification?.route ??
    row.field_verification?.classification?.contentType ??
    row.content_type ??
    "",
  ).trim().toLowerCase();
}

function textBundle(row = {}) {
  return compact([
    row.title,
    row.source_org_name,
    row.summary_short,
    row.summary_long,
    row.source_key,
  ].filter(Boolean).join(" "), 5000);
}

function routeFromIssues(issueCodes) {
  if (issueCodes.some((code) => DISCARD_ISSUE_CODES.has(code))) return ["discard", 0.95, "quality_discard_issue"];
  if (issueCodes.some((code) => ADMIN_ISSUE_CODES.has(code))) return ["admin", 0.9, "quality_admin_issue"];
  if (issueCodes.some((code) => NEWS_ISSUE_CODES.has(code))) return ["news", 0.85, "quality_news_issue"];
  return null;
}

export function classifyPosterContentType(row = {}) {
  const route = sourceRoute(row);
  if (["recruit", "news", "admin", "discard"].includes(route)) {
    return {
      contentType: route,
      confidence: 0.9,
      reason: "stored_classification",
      evidenceText: compact(route),
    };
  }

  if (row.poster_status === "rejected") {
    return {
      contentType: "discard",
      confidence: 0.8,
      reason: "poster_rejected",
      evidenceText: compact(row.title),
    };
  }

  const issueRoute = routeFromIssues(issueCodesFrom(row));
  if (issueRoute) {
    const [contentType, confidence, reason] = issueRoute;
    return {
      contentType,
      confidence,
      reason,
      evidenceText: compact(`${reason}: ${row.title ?? ""}`),
    };
  }

  const title = compact(row.title);
  const text = textBundle(row);
  const hasRecruitAction = RECRUIT_ACTION_RE.test(text);
  const hasProgramSignal = PROGRAM_RE.test(text);

  if (ADMIN_TITLE_RE.test(title) && !(hasRecruitAction && hasProgramSignal)) {
    return {
      contentType: "admin",
      confidence: 0.85,
      reason: "admin_title_rule",
      evidenceText: title,
    };
  }

  if (NEWS_TITLE_RE.test(title) && !hasRecruitAction) {
    return {
      contentType: "news",
      confidence: 0.8,
      reason: "news_title_rule",
      evidenceText: title,
    };
  }

  if (hasRecruitAction && hasProgramSignal) {
    return {
      contentType: "recruit",
      confidence: 0.82,
      reason: "recruit_action_program_signal",
      evidenceText: compact(text),
    };
  }

  if (hasRecruitAction) {
    return {
      contentType: "recruit",
      confidence: 0.7,
      reason: "recruit_action_signal",
      evidenceText: compact(text),
    };
  }

  if (NEWS_TITLE_RE.test(text)) {
    return {
      contentType: "news",
      confidence: 0.65,
      reason: "news_text_signal",
      evidenceText: compact(text),
    };
  }

  return {
    contentType: "recruit",
    confidence: 0.55,
    reason: "default_reviewable_recruit",
    evidenceText: compact(text),
  };
}

export function buildContentTypeEvidence(row = {}) {
  const result = classifyPosterContentType(row);
  if (!row.id || !result.contentType) return null;
  return {
    poster_id: row.id,
    field_key: "content_type",
    value_text: result.contentType,
    value_json: {
      type: result.contentType,
      reason: result.reason,
    },
    confidence: result.confidence,
    evidence_text: result.evidenceText,
    evidence_src: "rule",
    extractor: "content-type-routing-v1",
  };
}
