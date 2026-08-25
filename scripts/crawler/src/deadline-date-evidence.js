import { normalizeEvidenceRow } from "./field-evidence.js";

const APP_PERIOD_RE = /(?:신청|접수|모집|응모|지원|참여)\s*(?:기간|기한|마감|일정)|(?:신청|접수|모집)\s*[·:>\-\s]*기간/u;
const NON_APPLICATION_PERIOD_RE = /(?:교육|행사|진행|운영|활동|사용|사업|프로그램|일경험|사전직무교육)\s*(?:기간|일정|일시)/u;
const OPEN_ENDED_RE = /(?:상시|수시|연중)\s*(?:모집|접수|신청|운영)|(?:마감|모집)\s*시(?:까지)?|선착순\s*(?:마감|접수|모집)/u;
const DATE_RE = /(?:(20\d{2}|\d{2})\s*(?:년|[.\-/])\s*)?(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*(?:일)?/gu;
const RANGE_CONNECTOR_RE = /(?:~|-|부터|까지)/u;

const KOREAN_APPLICATION_CUE_RE = /(?:신청|접수|모집|응모|지원|참여)\s*(?:방법|기간|기한|마감|일정|링크|및|서류|서식|가능|하세요|바랍니다)?/u;
const KOREAN_PERIOD_LABEL_RE = /(?:기간|일정)\s*[:>]/u;
const EXPLICIT_DATE_RE = /(?:(20\d{2}|\d{2})\s*(?:년|[.\-/])\s*)?(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*(?:일)?/gu;

function compact(value, limit = 12_000) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function makeIsoDate(year, month, day) {
  const y = String(year).length === 2 ? 2000 + Number(year) : Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoDateText(value) {
  if (!value) return null;
  const text = String(value);
  const direct = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (direct) return makeIsoDate(direct[1], direct[2], direct[3]);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dateMentionRe(isoDate) {
  const match = String(isoDate ?? "").match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (!match) return null;
  const [, year, month, day] = match;
  const shortYear = year.slice(2);
  const m = Number(month);
  const d = Number(day);
  return new RegExp(
    `(?:${year}|${shortYear})\\s*(?:년|[.\\-/])\\s*0?${m}\\s*(?:월|[.\\-/])\\s*0?${d}\\s*(?:일)?|0?${m}\\s*(?:월|[.\\-/])\\s*0?${d}\\s*(?:일)?`,
    "u",
  );
}

function extractDates(segment, referenceYear = null) {
  const dates = [];
  let lastYear = referenceYear;
  DATE_RE.lastIndex = 0;
  let match;
  while ((match = DATE_RE.exec(segment)) !== null) {
    const year = match[1] ? Number(match[1]) : lastYear;
    if (!year) continue;
    const iso = makeIsoDate(year, match[2], match[3]);
    if (!iso) continue;
    if (match[1]) lastYear = Number(match[1]);
    dates.push({
      iso,
      index: match.index,
      endIndex: DATE_RE.lastIndex,
      raw: match[0],
    });
  }
  return dates;
}

function extractExplicitDates(segment, referenceYear = null) {
  const dates = [];
  let lastYear = referenceYear;
  EXPLICIT_DATE_RE.lastIndex = 0;
  let match;
  while ((match = EXPLICIT_DATE_RE.exec(segment)) !== null) {
    const year = match[1] ? Number(match[1]) : lastYear;
    if (!year) continue;
    const iso = makeIsoDate(year, match[2], match[3]);
    if (!iso) continue;
    if (match[1]) lastYear = Number(match[1]);
    dates.push({
      iso,
      index: match.index,
      endIndex: EXPLICIT_DATE_RE.lastIndex,
      raw: match[0],
    });
  }
  return dates;
}

function splitSegments(text) {
  const source = compact(text);
  if (!source) return [];

  const sentenceLike = source
    .split(/(?:[\n\r]+|[•·]|(?<=[.!?。])\s+)/u)
    .map((segment) => compact(segment, 700))
    .filter(Boolean);

  const windows = [];
  for (const match of source.matchAll(/신청기간|접수기간|모집기간|응모기간|지원기간|신청|접수|모집|응모|지원/gu)) {
    const start = Math.max(0, (match.index ?? 0) - 120);
    const end = Math.min(source.length, (match.index ?? 0) + 320);
    windows.push(compact(source.slice(start, end), 700));
  }

  return [...new Set([...sentenceLike, ...windows])];
}

function isApplicationSegment(segment, title) {
  void title;
  if (NON_APPLICATION_PERIOD_RE.test(segment) && !APP_PERIOD_RE.test(segment)) return false;
  if (APP_PERIOD_RE.test(segment)) return true;
  return false;
}

function canUseGroundedDeadlineSegment(segment, title, { allowTitleRecruit = false } = {}) {
  if (!segment || OPEN_ENDED_RE.test(segment)) return false;
  if (isApplicationSegment(segment, title)) return true;
  if (!allowTitleRecruit) return false;
  if (/(?:\(|~)\s*\d{1,2}\s*(?:[.\/-]|월)\s*\d{1,2}\s*\)?/u.test(segment)) return true;
  if (NON_APPLICATION_PERIOD_RE.test(segment)) return false;
  return /(?:모집|신청|접수|참여자|교육생|수강생)/u.test(String(title ?? ""));
}

function findEvidenceForDate(sourceText, isoDate) {
  const target = isoDateText(isoDate);
  if (!target) return null;
  const [year] = target.split("-").map(Number);
  const dateRe = dateMentionRe(target);
  for (const segment of splitSegments(sourceText)) {
    const dates = extractDates(segment, year);
    if (dates.some((date) => date.iso === target)) return segment;
    if (dateRe?.test(segment)) return segment;
  }
  return null;
}

function inferDateFromApplicationSegments({ title, sourceText, referenceYear }) {
  for (const segment of splitSegments(sourceText)) {
    if (!isApplicationSegment(segment, title)) continue;
    if (OPEN_ENDED_RE.test(segment)) continue;
    const dates = extractDates(segment, referenceYear);
    if (dates.length === 0) continue;

    for (let index = 0; index + 1 < dates.length; index += 1) {
      const between = segment.slice(dates[index].endIndex, dates[index + 1].index);
      if (between.length <= 30 && RANGE_CONNECTOR_RE.test(between)) {
        return { date: dates[index + 1].iso, evidenceText: segment, confidence: 0.9 };
      }
    }

    const deadlineDate = [...dates].reverse().find((date) => {
      const after = segment.slice(date.endIndex, date.endIndex + 20);
      return /(?:까지|마감|종료|기한)/u.test(after);
    });
    if (deadlineDate) return { date: deadlineDate.iso, evidenceText: segment, confidence: 0.9 };
  }
  return null;
}

function inferDateFromGroundedPeriodSummary({ sourceText, targetDate, referenceYear }) {
  const target = isoDateText(targetDate);
  if (!target) return null;

  for (const segment of splitSegments(sourceText)) {
    if (!KOREAN_PERIOD_LABEL_RE.test(segment)) continue;
    if (!KOREAN_APPLICATION_CUE_RE.test(segment)) continue;
    if (OPEN_ENDED_RE.test(segment)) continue;

    const dates = extractExplicitDates(segment, referenceYear);
    if (dates.length < 2) continue;

    for (let index = 0; index + 1 < dates.length; index += 1) {
      const between = segment.slice(dates[index].endIndex, dates[index + 1].index);
      if (between.length > 40 || !/[~-]/u.test(between)) continue;
      if (dates[index + 1].iso !== target) continue;
      return { date: target, evidenceText: segment, confidence: 0.9 };
    }
  }

  return null;
}

export function inferDeadlineDateEvidence({
  posterId,
  title,
  sourceText,
  applicationEndAt,
  fieldVerification,
  createdAt,
} = {}) {
  const referenceYear = Number(String(createdAt ?? "").match(/\b(20\d{2})\b/)?.[1]) || null;
  const suggestedDeadline = isoDateText(fieldVerification?.dateQuality?.suggestedDeadline);
  const normalizedDeadline = isoDateText(
    fieldVerification?.dateQuality?.normalizedDeadline ??
    fieldVerification?.dateQuality?.extractedDeadline,
  );
  const storedDeadline = isoDateText(applicationEndAt);
  const dateQualityDecision = String(fieldVerification?.dateQuality?.decision ?? "");

  if (normalizedDeadline) {
    const evidenceText = findEvidenceForDate(sourceText, normalizedDeadline);
    if (canUseGroundedDeadlineSegment(evidenceText, title, { allowTitleRecruit: true })) {
      return normalizeEvidenceRow({
        posterId,
        fieldKey: "deadline_date",
        valueText: normalizedDeadline,
        valueJson: { date: normalizedDeadline },
        confidence: dateQualityDecision === "pass" ? 0.95 : 0.9,
        evidenceText: `${evidenceText} (normalized: ${normalizedDeadline})`,
        evidenceSrc: "body",
        extractor: "deadline-date-grounded-v1",
      });
    }
  }

  if (suggestedDeadline) {
    const evidenceText = findEvidenceForDate(sourceText, suggestedDeadline);
    if (canUseGroundedDeadlineSegment(evidenceText, title, { allowTitleRecruit: dateQualityDecision === "pass" })) {
      return normalizeEvidenceRow({
        posterId,
        fieldKey: "deadline_date",
        valueText: suggestedDeadline,
        valueJson: { date: suggestedDeadline },
        confidence: 0.9,
        evidenceText: `${evidenceText} (normalized: ${suggestedDeadline})`,
        evidenceSrc: "body",
        extractor: "deadline-date-grounded-v1",
      });
    }
  }

  const inferred = inferDateFromApplicationSegments({ title, sourceText, referenceYear });
  if (inferred) {
    return normalizeEvidenceRow({
      posterId,
      fieldKey: "deadline_date",
      valueText: inferred.date,
      valueJson: { date: inferred.date },
      confidence: inferred.confidence,
      evidenceText: inferred.evidenceText,
      evidenceSrc: "body",
      extractor: "deadline-date-grounded-v1",
    });
  }

  const groundedPeriod = inferDateFromGroundedPeriodSummary({
    sourceText,
    targetDate: normalizedDeadline,
    referenceYear,
  });
  if (groundedPeriod) {
    return normalizeEvidenceRow({
      posterId,
      fieldKey: "deadline_date",
      valueText: groundedPeriod.date,
      valueJson: { date: groundedPeriod.date },
      confidence: groundedPeriod.confidence,
      evidenceText: groundedPeriod.evidenceText,
      evidenceSrc: "body",
      extractor: "deadline-date-grounded-v1",
    });
  }

  if (!storedDeadline) return null;
  const evidenceText = findEvidenceForDate(sourceText, storedDeadline);
  if (!evidenceText || OPEN_ENDED_RE.test(evidenceText)) return null;
  if (!isApplicationSegment(evidenceText, title)) return null;

  return normalizeEvidenceRow({
    posterId,
    fieldKey: "deadline_date",
    valueText: storedDeadline,
    valueJson: { date: storedDeadline },
    confidence: 0.9,
    evidenceText,
    evidenceSrc: "body",
    extractor: "deadline-date-grounded-v1",
  });
}
