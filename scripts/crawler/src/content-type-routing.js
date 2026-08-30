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

const ADMIN_RE = new RegExp([
  "\\uBBFC\\uBC29\\uC704", // civil defense
  "\\uACF5\\uC911\\uD654\\uC7A5\\uC2E4\\s*\\uAD00\\uB9AC\\uC778",
  "\\uBB34\\uC5F0\\uACE0\\s*\\uC0AC\\uB9DD\\uC790",
  "\\uACF5\\uC2DC\\uC1A1\\uB2EC",
  "\\uCC44\\uC6A9\\s*\\uACF5\\uACE0",
  "\\uC9C1\\uC6D0\\s*\\uCC44\\uC6A9",
  "\\uD1B5\\uC7A5\\s*\\uBAA8\\uC9D1\\s*\\uACF5\\uACE0",
  "\\uC785\\uCC30\\s*\\uACF5\\uACE0",
  "\\uACE0\\uC2DC\\s*\\uACF5\\uACE0",
  "\\uAD50\\uC721\\s*\\uBC0F\\s*\\uD1B5\\uC9C0\\uC11C\\s*\\uC218\\uB839\\s*\\uC548\\uB0B4",
  "\\uC628\\uB77C\\uC778\\s*\\uC811\\uC218\\s*\\uC548\\uB0B4",
  "\\uC608\\uBC29\\uC218\\uCE59",
  "\\uC218\\uC0C1\\uD6C4\\uBCF4\\uC790\\s*\\uCD94\\uCC9C\\s*\\uACF5\\uACE0",
  "\\uCD95\\uC81C\\uCD94\\uC9C4\\uC704\\uC6D0\\s*\\uACF5\\uAC1C\\uBAA8\\uC9D1\\s*\\uACF5\\uACE0",
  "\\uACF5\\uAC1C\\uBAA8\\uC9D1\\s*\\uACF5\\uACE0",
].join("|"), "i");

const ADMIN_ALWAYS_RE = new RegExp([
  "\\uC628\\uB77C\\uC778\\s*\\uC811\\uC218\\s*\\uC548\\uB0B4",
  "\\uC608\\uBC29\\uC218\\uCE59",
  "\\uC218\\uC0C1\\uD6C4\\uBCF4\\uC790\\s*\\uCD94\\uCC9C\\s*\\uACF5\\uACE0",
].join("|"), "i");

const NEWS_RE = new RegExp([
  "\\uC18C\\uC2DD",
  "\\uBCF4\\uB3C4\\uC790\\uB8CC",
  "\\uACB0\\uACFC\\s*(?:\\uBC1C\\uD45C|\\uACF5\\uC9C0|\\uC548\\uB0B4)",
  "\\uC2DC\\uBBFC\\uD22C\\uD45C",
  "\\uAC77\\uAE30\\uBAA8\\uC784",
  "\\uAC74\\uAC15\\uB3CC\\uBD04\\uD559\\uAD50",
  "\\uACBD\\uBE44\\uB178\\uB3D9\\uC790\\s*\\uAD50\\uC721\\s*\\uBC0F\\s*\\uD55C\\uB9C8\\uB2F9",
  "\\uD589\\uC0AC\\s*(?:\\uAC1C\\uCD5C\\s*)?\\uC548\\uB0B4",
  "\\uC774\\uBCA4\\uD2B8",
  "\\uD560\\uC778\\s*\\uD61C\\uD0DD",
  "\\uD31D\\uC5C5",
  "\\uBE0C\\uB79C\\uB4DC\\s*\\d+\\uAC1C\\uC0AC",
  "festa",
  "\\uD398\\uC2A4\\uD2F0\\uBC8C",
].join("|"), "i");

const RECRUIT_RE = new RegExp([
  "\\uBAA8\\uC9D1",
  "\\uC2E0\\uCCAD",
  "\\uC811\\uC218",
  "\\uCC38\\uC5EC\\uC790",
  "\\uCC38\\uAC00\\uC790",
  "\\uC218\\uAC15\\uC0DD",
  "\\uAD50\\uC721\\uC0DD",
  "\\uACF5\\uBAA8",
  "apply",
  "register",
  "registration",
].join("|"), "i");

const PROGRAM_RE = new RegExp([
  "\\uD504\\uB85C\\uADF8\\uB7A8",
  "\\uAD50\\uC721",
  "\\uAC15\\uC88C",
  "\\uD2B9\\uAC15",
  "\\uC6CC\\uD06C\\uC20D",
  "\\uBA58\\uD1A0\\uB9C1",
  "\\uCEE8\\uC124\\uD305",
  "\\uCCB4\\uD5D8",
  "\\uCC3D\\uC5C5",
  "\\uCDE8\\uC5C5",
  "\\uB300\\uD68C",
  "\\uD1A0\\uD06C\\uCF58\\uC11C\\uD2B8",
  "\\uD50C\\uB9AC\\uB9C8\\uCF13",
].join("|"), "i");

const QA_TEST_RE = /QA\s*(?:\uD14C\uC2A4\uD2B8)?/i;
const CONTAMINATED_EVENT_NOTICE_RE = /(?:\uC81C\uB85C\uB9C8\uCF13|(?:\uAC1C\uCD5C\s*\uC548\uB0B4[\s\S]{0,500}\uB2E4\uC74C\uAE00)|(?:\uB2E4\uC74C\uAE00[\s\S]{0,500}\uAC1C\uCD5C\s*\uC548\uB0B4))/i;
const APPLICATION_PERIOD_RE = /(?:\uC2E0\uCCAD|\uC811\uC218|\uBAA8\uC9D1)\s*(?:\uAE30\uAC04|\uBC29\uBC95|\uB9C8\uAC10)/i;

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
  const hasRecruitAction = RECRUIT_RE.test(text);
  const hasProgramSignal = PROGRAM_RE.test(text);
  const hasAdminTitle = ADMIN_RE.test(title);
  const hasNewsTitle = NEWS_RE.test(title);

  if (QA_TEST_RE.test(text)) {
    return {
      contentType: "discard",
      confidence: 0.95,
      reason: "qa_test_notice",
      evidenceText: title,
    };
  }

  if (CONTAMINATED_EVENT_NOTICE_RE.test(text) && !APPLICATION_PERIOD_RE.test(text)) {
    return {
      contentType: "news",
      confidence: 0.85,
      reason: "event_notice_without_application_period",
      evidenceText: compact(text),
    };
  }

  if (ADMIN_ALWAYS_RE.test(title)) {
    return {
      contentType: "admin",
      confidence: 0.9,
      reason: "admin_strong_title_rule",
      evidenceText: title,
    };
  }

  if (hasNewsTitle && !RECRUIT_RE.test(title) && !APPLICATION_PERIOD_RE.test(text)) {
    return {
      contentType: "news",
      confidence: 0.85,
      reason: "news_title_without_application_period",
      evidenceText: compact(text),
    };
  }

  if (hasAdminTitle && !(hasRecruitAction && hasProgramSignal)) {
    return {
      contentType: "admin",
      confidence: 0.85,
      reason: "admin_title_rule",
      evidenceText: title,
    };
  }

  if (hasNewsTitle && !hasRecruitAction) {
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

  if (row.poster_status === "rejected") {
    return {
      contentType: "discard",
      confidence: 0.8,
      reason: "poster_rejected",
      evidenceText: compact(row.title),
    };
  }

  if (NEWS_RE.test(text)) {
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
