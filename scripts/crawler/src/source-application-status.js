// src/source-application-status.js
// Application state an adapter reads from the source itself (an application
// button such as 수강신청 / 대기신청 / 신청마감), plus the review issues an
// adapter can already see. Pure functions; upload-to-supabase.js applies
// them. Posts without `sourceApplicationStatus` / `sourceReviewIssues` /
// `sourceIdentity` (every other adapter) are not affected.

export const SOURCE_APPLICATION_STATUS_RULES = "source-application-status-20261119";

export const SOURCE_APPLICATION_STATES = Object.freeze(["open", "waitlist", "closed", "upcoming", "unknown"]);

/** Button or status text -> one of SOURCE_APPLICATION_STATES. Unknown text is never guessed. */
export function classifySourceApplicationLabel(label) {
  const text = String(label ?? "").replace(/\s+/g, "");
  if (!text) return "unknown";
  if (/마감|종료/.test(text)) return "closed";
  if (/대기/.test(text)) return "waitlist";
  if (/예정|준비중/.test(text)) return "upcoming";
  if (/^(수강신청|신청하기|신청|접수|접수중|모집중|신청가능)$/.test(text)) return "open";
  return "unknown";
}

// Review issue codes an adapter may attach. They become quality issues with
// decision "review" and are stored in field_verification.qualityIssues.
export const SOURCE_REVIEW_ISSUE_CODES = Object.freeze(new Set([
  "eligibility-unconfirmed",
  "application-period-unconfirmed",
  "organizer-unconfirmed",
  "application-status-unconfirmed",
  "source-application-waitlist",
  "source-application-closed",
]));

// The scheduled AI review must leave these for a person: the record lacks a
// fact the user needs (who may apply, until when, who runs it) or the source
// says the application is closed.
export const AUTO_APPROVAL_BLOCKING_QUALITY_ISSUES = Object.freeze(new Set([
  "eligibility-unconfirmed",
  "application-period-unconfirmed",
  "organizer-unconfirmed",
  "application-status-unconfirmed",
  "source-application-closed",
]));

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clip(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/** Adapter review issues in the quality-issue shape; unknown codes are dropped. */
export function sourceReviewIssuesOf(post = {}) {
  const issues = Array.isArray(post.sourceReviewIssues) ? post.sourceReviewIssues : [];
  const seen = new Set();
  const result = [];
  for (const issue of issues) {
    const code = String(issue?.code ?? "");
    if (!SOURCE_REVIEW_ISSUE_CODES.has(code) || seen.has(code)) continue;
    seen.add(code);
    result.push({
      code,
      severity: "medium",
      decision: "review",
      reason: clip(issue.reason, 200) || code,
      evidence: clip(issue.evidence, 240),
      source: "adapter",
    });
  }
  return result;
}

/** Quality issue codes in a stored field_verification that block AI auto-approval. */
export function blockingQualityIssueCodes(verification = {}) {
  const issues = Array.isArray(asObject(verification).qualityIssues) ? verification.qualityIssues : [];
  return [...new Set(issues.map((issue) => issue?.code).filter((code) => AUTO_APPROVAL_BLOCKING_QUALITY_ISSUES.has(code)))];
}

export function sourceApplicationStateOf(post = {}) {
  const state = asObject(post.sourceApplicationStatus).state;
  return SOURCE_APPLICATION_STATES.includes(state) ? state : null;
}

/** The record stored at field_verification.sourceApplicationStatus. */
export function buildSourceApplicationStatusRecord(post = {}, { previous = null, now = new Date() } = {}) {
  const status = asObject(post.sourceApplicationStatus);
  const state = sourceApplicationStateOf(post);
  if (!state) return null;
  const prior = asObject(previous);
  return {
    state,
    label: clip(status.label, 40) || null,
    applicationPeriod: status.applicationPeriod ?? null,
    checkedAt: now.toISOString(),
    previousState: prior.state ?? null,
    previousCheckedAt: prior.checkedAt ?? null,
    rules: status.rules ?? SOURCE_APPLICATION_STATUS_RULES,
  };
}

/**
 * Changes for an existing poster when the source is crawled again.
 *
 * - Nothing when the adapter gives no state, or the state is the one already
 *   stored (a published poster is still closed if the source says closed).
 * - The new state is recorded (with the previous one) in field_verification.
 * - closed + published -> poster_status closed. A review poster keeps its
 *   status for the reviewer and gets a blocking "source-application-closed"
 *   quality issue; closed / rejected / other statuses are left alone.
 * - A reopened source (closed -> open) is recorded only; reopening is a
 *   person's decision.
 *
 * Returns { updates, action, expectedStatus } where expectedStatus is the
 * poster_status the update must still match (compare-and-set).
 */
export function planSourceApplicationStatusUpdate(existing = {}, post = {}, { now = new Date() } = {}) {
  const state = sourceApplicationStateOf(post);
  if (!state || !existing?.id) return { updates: {}, action: "none", expectedStatus: null };

  const verification = asObject(existing.field_verification);
  const qualityIssues = Array.isArray(verification.qualityIssues) ? verification.qualityIssues : [];
  const previous = asObject(verification.sourceApplicationStatus);
  const closesPublished = state === "closed" && existing.poster_status === "published";
  const flagsReview = state === "closed"
    && existing.poster_status === "review"
    && !qualityIssues.some((issue) => issue?.code === "source-application-closed");
  if (previous.state === state && !closesPublished && !flagsReview) {
    return { updates: {}, action: "unchanged", expectedStatus: null };
  }

  const record = buildSourceApplicationStatusRecord(post, { previous, now });
  const nextVerification = { ...verification, sourceApplicationStatus: record };
  const updates = {};
  let action = "recorded";
  if (closesPublished) {
    updates.poster_status = "closed";
    record.closedFromStatus = "published";
    action = "closed";
  } else if (flagsReview) {
    nextVerification.qualityIssues = [
      ...qualityIssues,
      {
        code: "source-application-closed",
        severity: "medium",
        decision: "review",
        reason: "원문 신청 버튼이 신청마감으로 바뀜",
        evidence: clip(record.label, 240),
        source: "adapter",
      },
    ];
    action = "flagged_review";
  }
  updates.field_verification = nextVerification;
  return { updates, action, expectedStatus: existing.poster_status ?? null };
}

/** A new notice the source already shows as closed is not created. */
export function shouldSkipNewClosedPost(post = {}) {
  return sourceApplicationStateOf(post) === "closed";
}

function identityParts(url, param) {
  try {
    const parsed = new URL(url);
    return {
      base: `${parsed.origin.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`,
      value: parsed.searchParams.get(param),
    };
  } catch {
    return null;
  }
}

/**
 * True when `rowSourceUrl` is another item of the same source board: same
 * origin and path, a different identity parameter (for 50plus courses the
 * course id). Such rows are different notices whatever their titles say (a
 * new 기수, an 오전반/오후반 or 온라인/오프라인 class), so title-based
 * duplicate matching must not merge them.
 */
export function isDistinctSameSourceItem(post = {}, rowSourceUrl, candidateSourceUrl = post.sourceUrl ?? post.url) {
  const param = asObject(post.sourceIdentity).param;
  if (!param || !rowSourceUrl || !candidateSourceUrl) return false;
  const candidate = identityParts(candidateSourceUrl, param);
  const row = identityParts(rowSourceUrl, param);
  if (!candidate?.value || !row?.value) return false;
  return candidate.base === row.base && candidate.value !== row.value;
}
