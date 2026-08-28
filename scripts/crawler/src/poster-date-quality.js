const APPLICATION_LABEL_PATTERN = /(?:신청|접수|모집|응모|지원|등록)\s*(?:기간|기한|마감|일정|방법(?:은)?\s*\??)/i;
const NON_APPLICATION_PERIOD_PATTERN = /(?:여행|행사|교육|운영|활동|사용|사업|프로그램)\s*(?:기간|일정)/i;
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
      endIndex: pattern.lastIndex,
    });
  }

  return dates;
}

function makeInferredDateFromStart(startDate, monthValue, dayValue) {
  const startYear = Number(startDate.iso.slice(0, 4));
  const startMonth = Number(startDate.iso.slice(5, 7));
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!startYear || !month || !day) return null;

  const year = month < startMonth ? startYear + 1 : startYear;
  return makeIsoDate(year, month, day);
}

function findAbbreviatedRangeEnd(segment, startDate) {
  const trailingStart = startDate.endIndex;
  const trailing = segment.slice(trailingStart, trailingStart + 90);
  const match = trailing.match(
    /^\s*(?:\([^)]*\))?\s*(?:~|-|–|—|부터|에서)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})\s*(?:일)?\.?\s*(?:\([^)]*\))?/
  );
  if (!match) return null;

  const iso = makeInferredDateFromStart(startDate, match[1], match[2]);
  if (!iso) return null;

  return {
    iso,
    raw: match[0].trim(),
    weekday: null,
    index: trailingStart + (match.index ?? 0) + match[0].indexOf(match[1]),
    endIndex: trailingStart + match[0].length,
    inferredYear: true,
  };
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
    const start = match.index ?? 0;
    const end = Math.min(text.length, (match.index ?? 0) + 260);
    const rawSegment = text.slice(start, end);
    const trailingText = rawSegment.slice(match[0].length);
    const stopAt = trailingText.search(NON_APPLICATION_PERIOD_PATTERN);
    segments.push(stopAt >= 0
      ? rawSegment.slice(0, match[0].length + stopAt)
      : rawSegment);
  }

  return segments;
}

const DEADLINE_KEYWORD_PATTERN = /까지|마감|종료|기한|선착순/;

// 인접한 두 날짜 사이의 텍스트가 "실제 범위 연결어"인지 판단한다.
// 요일 표기(월)와 시:분 토큰을 제거한 뒤, 남은 텍스트가 짧고 다른 숫자(=또 다른
// 날짜/수치)가 없으며 범위 연결어를 포함해야 한다. 이렇게 하면 프로그램 일정 날짜와
// 신청기간 날짜가 한 세그먼트에 섞여도 엉뚱하게 페어링되지 않는다.
function isTightRange(between) {
  const cleaned = between
    .replace(/\d{1,2}\s*:\s*\d{2}/g, " ") // 09:00 같은 시각 토큰
    .replace(/\([월화수목금토일]\)/g, " ") // (월) 같은 요일 표기
    .trim();
  if (cleaned.length > 12) return false;
  if (/\d/.test(cleaned)) return false; // 사이에 다른 숫자가 있으면 별개 날짜가 낀 것
  return RANGE_CONNECTOR_PATTERN.test(cleaned);
}

// 마감 키워드(까지/마감/종료/기한/선착순) 기준 30자 이내에서 가장 가까운 날짜를
// 단일 마감일로 고른다. 키워드에서 멀리 떨어진 프로그램 일정 날짜를 마감으로
// 오인하지 않는다.
function pickDeadlineNearKeyword(segment, dates) {
  const keyword = segment.match(DEADLINE_KEYWORD_PATTERN);
  if (!keyword) return null;
  const kwIndex = keyword.index ?? 0;

  let best = null;
  let bestDistance = Infinity;
  for (const date of dates) {
    const distance = date.endIndex <= kwIndex ? kwIndex - date.endIndex : date.index - kwIndex;
    if (distance >= 0 && distance <= 30 && distance < bestDistance) {
      best = date;
      bestDistance = distance;
    }
  }

  return best;
}

function findApplicationRange(text) {
  for (const segment of applicationSegments(text)) {
    const dates = extractFullDates(segment);

    // 1) 인접한 두 날짜가 실제 범위 연결어로 이어진 경우에만 start~end 범위로 인정
    for (let i = 0; i + 1 < dates.length; i += 1) {
      const between = segment.slice(dates[i].endIndex, dates[i + 1].index);
      if (isTightRange(between)) {
        return { start: dates[i], end: dates[i + 1], segment };
      }
    }

    // "신청기간: 2026. 8. 20. ~ 모집시까지"처럼 종료일이 없는 열린 접수기간은
    // 뒤따르는 행사일이나 "모집시까지"의 "까지"를 마감일로 승격하지 않는다.
    for (const startDate of dates) {
      const inferredEnd = findAbbreviatedRangeEnd(segment, startDate);
      if (inferredEnd) return { start: startDate, end: inferredEnd, segment };
    }

    if (hasOpenEndedApplicationPeriod(segment)) {
      continue;
    }

    // 2) 범위가 없으면 마감 키워드 근처의 단일 날짜만 마감일로 채택
    if (DEADLINE_KEYWORD_PATTERN.test(segment)) {
      const deadline = pickDeadlineNearKeyword(segment, dates);
      if (deadline) return { start: null, end: deadline, segment };
    }
  }

  return null;
}

function hasOpenEndedApplicationPeriod(segment) {
  const firstDate = extractFullDates(segment)[0];
  if (!firstDate) return false;
  const trailing = segment.slice(firstDate.endIndex, firstDate.endIndex + 40);
  return /^(?:\s*\([월화수목금토일]\))?(?:\s*\d{1,2}\s*:\s*\d{2})?\s*(?:~|〜|∼|부터)(?!\s*[\u2018\u2019']?\d{2,4}\s*(?:년|[./-]))/.test(trailing);
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
  const hasOpenEndedApplication = !appRange && appSegments.some(hasOpenEndedApplicationPeriod);
  if (hasOpenEndedApplication) {
    addIssue(
      issues,
      "open-ended-application-period",
      "medium",
      "application/recruitment period states a start but no confirmed end date",
      appSegments.find(hasOpenEndedApplicationPeriod)
    );
  }
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

  const blockingCodes = new Set([
    "invalid-extracted-deadline",
    "date-end-before-start",
    "open-ended-application-period",
  ]);
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
