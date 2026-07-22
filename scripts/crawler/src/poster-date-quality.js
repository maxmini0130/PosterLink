const APPLICATION_LABEL_PATTERN = /신청|접수|모집|응모|지원|등록/i;
const ALWAYS_OPEN_PATTERN = /상시\s*(?:모집|접수|신청|운영)?|수시\s*(?:모집|접수|신청)?/i;
const MIDNIGHT_PATTERN = /(?:^|[^\d])00\s*:\s*00(?:[^\d]|$)/;
const RANGE_CONNECTOR_PATTERN = /(?:~|〜|∼|-|부터|에서|까지)/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function removeInvalidSurrogates(value) {
  return String(value ?? "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
}

function safeSlice(value, maxLength) {
  return Array.from(removeInvalidSurrogates(value)).slice(0, maxLength).join("");
}

function textBundle(input = {}) {
  return [
    input.title,
    input.source_org_name,
    input.org,
    input.site,
    input.board,
    input.category,
    input.summary_short,
    input.summary_long,
    input.content,
  ].filter(Boolean).join("\n");
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (String(value).length === 2) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function makeIsoDate(yearValue, monthValue, dayValue) {
  const year = normalizeYear(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeDateOnly(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) return makeIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);

  const fullMatch = text.match(/(?:^|[^\d])(\d{2,4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?\s*\.?/);
  if (fullMatch) return makeIsoDate(fullMatch[1], fullMatch[2], fullMatch[3]);

  return null;
}

function dateToTime(isoDate) {
  return new Date(`${isoDate}T00:00:00.000Z`).getTime();
}

function weekdayOf(isoDate) {
  return WEEKDAYS[new Date(`${isoDate}T00:00:00.000Z`).getUTCDay()];
}

function extractFullDates(text) {
  const dates = [];
  const pattern = /(^|[^\d])(\d{2,4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?\s*\.?\s*(?:\(([월화수목금토일])\))?/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0].trim();
    const iso = makeIsoDate(match[2], match[3], match[4]);
    if (!iso) continue;
    dates.push({
      iso,
      raw,
      weekday: match[5] ?? null,
      index: (match.index ?? 0) + (match[1]?.length ?? 0),
    });
  }

  return dates;
}

function stripFullDates(text) {
  return text.replace(/(^|[^\d])(\d{2,4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?\s*\.?/g, " ");
}

function hasMonthDayWithoutYear(text) {
  const stripped = stripFullDates(text);
  return /(?:^|[^\d])\d{1,2}\s*(?:월|[./-])\s*\d{1,2}\s*(?:일)?/.test(stripped);
}

function applicationSegments(text) {
  const segments = [];
  const pattern = new RegExp(APPLICATION_LABEL_PATTERN.source, "gi");
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const start = Math.max(0, (match.index ?? 0) - 50);
    const end = Math.min(text.length, (match.index ?? 0) + 260);
    segments.push(text.slice(start, end));
  }

  return segments;
}

function findApplicationRange(text) {
  for (const segment of applicationSegments(text)) {
    const dates = extractFullDates(segment);
    if (dates.length >= 2 && RANGE_CONNECTOR_PATTERN.test(segment)) {
      return { start: dates[0], end: dates[1], segment };
    }
    if (dates.length === 1 && /까지|마감|종료|기한|선착순/.test(segment)) {
      return { start: null, end: dates[0], segment };
    }
  }

  return null;
}

function addIssue(issues, code, severity, reason, evidence = "") {
  issues.push({
    code,
    severity,
    decision: "review",
    reason,
    evidence: safeSlice(compact(evidence), 240),
  });
}

export function evaluatePosterDateQuality(input = {}, options = {}) {
  const text = textBundle(input);
  const normalizedText = compact(text);
  const extractedDeadline = options.extractedDeadline ?? input.deadline ?? input.application_end_at ?? null;
  const normalizedDeadline = normalizeDateOnly(extractedDeadline);
  const issues = [];
  const fullDates = extractFullDates(text);
  const appRange = findApplicationRange(text);
  let suggestedDeadline = null;

  if (extractedDeadline && !normalizedDeadline) {
    addIssue(issues, "invalid-extracted-deadline", "high", "extracted deadline is not a valid full date", extractedDeadline);
  }

  for (const date of fullDates) {
    if (date.weekday && weekdayOf(date.iso) !== date.weekday) {
      addIssue(
        issues,
        "weekday-mismatch",
        "medium",
        "date weekday text does not match the calendar",
        `${date.raw} expected ${weekdayOf(date.iso)}`
      );
    }
  }

  const appSegments = applicationSegments(text);
  if (appSegments.some(hasMonthDayWithoutYear)) {
    addIssue(
      issues,
      "date-without-year",
      "medium",
      "application/recruitment period contains month/day without a year",
      appSegments.find(hasMonthDayWithoutYear)
    );
  }

  if (appSegments.some((segment) => MIDNIGHT_PATTERN.test(segment))) {
    addIssue(
      issues,
      "default-midnight-time",
      "medium",
      "application/recruitment period contains 00:00 and needs manual confirmation",
      appSegments.find((segment) => MIDNIGHT_PATTERN.test(segment))
    );
  }

  if (appRange?.start && appRange?.end && dateToTime(appRange.end.iso) < dateToTime(appRange.start.iso)) {
    addIssue(
      issues,
      "date-end-before-start",
      "high",
      "application/recruitment end date is earlier than the start date",
      appRange.segment
    );
  } else if (appRange?.end) {
    suggestedDeadline = appRange.end.iso;
  }

  if (ALWAYS_OPEN_PATTERN.test(normalizedText) && appRange?.end) {
    addIssue(
      issues,
      "always-open-conflict",
      "high",
      "notice says always open but also contains a clear application/recruitment end date",
      appRange.segment
    );
  }

  if (normalizedDeadline && appRange?.end && normalizedDeadline !== appRange.end.iso) {
    addIssue(
      issues,
      "deadline-mismatch",
      "high",
      "extracted deadline differs from the application/recruitment period in the notice text",
      `extracted ${normalizedDeadline}, notice ${appRange.end.iso}`
    );
    suggestedDeadline = appRange.end.iso;
  }

  if (!normalizedDeadline && appRange?.end) {
    addIssue(
      issues,
      "missing-clear-deadline",
      "medium",
      "notice text has a clear application/recruitment end date but crawler deadline is missing",
      appRange.segment
    );
    suggestedDeadline = appRange.end.iso;
  }

  if (!appRange && fullDates.length >= 3) {
    addIssue(
      issues,
      "ambiguous-multiple-dates",
      "medium",
      "notice contains multiple dates but no clear application/recruitment period was detected",
      fullDates.map((date) => date.raw).join(", ")
    );
  }

  return {
    decision: issues.length > 0 ? "review" : "pass",
    issues,
    extractedDeadline: extractedDeadline ? String(extractedDeadline) : null,
    normalizedDeadline,
    suggestedDeadline,
  };
}

export function chooseDeadlineForStorage(extractedDeadline, dateQuality) {
  if (dateQuality?.suggestedDeadline) return dateQuality.suggestedDeadline;

  const normalizedDeadline = dateQuality?.normalizedDeadline ?? normalizeDateOnly(extractedDeadline);
  if (!normalizedDeadline) return null;

  const blockingCodes = new Set(["invalid-extracted-deadline", "date-end-before-start"]);
  if ((dateQuality?.issues ?? []).some((issue) => blockingCodes.has(issue.code))) return null;

  return normalizedDeadline;
}

export function mergeDateQualityIntoFieldVerification(verification = {}, dateQuality = {}, context = {}) {
  const issues = dateQuality.issues ?? [];
  if (issues.length === 0) {
    return {
      ...verification,
      dateQuality: {
        decision: "pass",
        normalizedDeadline: dateQuality.normalizedDeadline ?? null,
        suggestedDeadline: dateQuality.suggestedDeadline ?? null,
      },
    };
  }

  const dateReason = issues
    .slice(0, 4)
    .map((issue) => `${issue.code}: ${issue.reason}`)
    .join("; ");
  const confidence = typeof verification.confidence === "number"
    ? Math.min(verification.confidence, 0.45)
    : 0.45;

  return {
    ...verification,
    deadlineMatches: false,
    confidence,
    decision: "needs_review",
    reason: safeSlice(compact([verification.reason, dateReason].filter(Boolean).join(" | ")), 800),
    dateIssues: issues,
    dateQuality: {
      decision: "review",
      extractedDeadline: dateQuality.extractedDeadline ?? null,
      normalizedDeadline: dateQuality.normalizedDeadline ?? null,
      suggestedDeadline: dateQuality.suggestedDeadline ?? null,
      storedDeadline: context.storedDeadline ?? null,
    },
  };
}
