import { normalizeEvidenceRow } from "./field-evidence.js";

const APPLICATION_CONTEXT_RE = /(?:신청|접수|모집|응모|지원|등록)\s*(?:기간|기한|마감|일정|기간은|기간:|방법|대상)?/u;
const DATE_TOKEN_RE = /(?:20\d{2}\s*(?:[.\-/년]\s*)?)?\d{1,2}\s*(?:[.\-/월]\s*)\d{1,2}\s*(?:일)?/u;
const RANGE_OR_DEADLINE_RE = /(?:~|부터|까지|마감|종료|기한|접수기간|신청기간|모집기간)/u;
const ONGOING_RE = /(?:상시|수시|연중)\s*(?:모집|접수|신청|운영)/u;
const UNTIL_EXHAUSTED_RE = /(?:예산|재원|인원|정원)?\s*소진\s*시|소진\s*시까지|소진\s*시\s*마감|선착순\s*(?:마감|접수|모집)|마감\s*시까지|모집\s*시까지/u;
const OPEN_ENDED_RE = /(?:상시|수시|연중)\s*(?:모집|접수|신청|운영)|(?:모집|마감)\s*시까지|소진\s*시/u;

const APPLICATION_LABEL_RE = /(?:신청|접수|모집|응모|지원)\s*(?:[·ㆍ:：-]\s*)?(?:기간|기한|마감|일정)/gu;
const NEXT_SECTION_LABEL_RE = /(?:신청방법|접수방법|여행\s*기간|진행\s*기간|운영\s*기간|활동\s*기간|프로그램\s*일정|진행\s*일정|진행\s*일시|운영\s*일시|행사\s*일시|일시|장소|대상|문의|내용|선정|선발|발표|참가\s*인원|참가\s*비용)\s*[:：]?/gu;
const FIXED_RANGE_RE = /(?:~|-|부터|까지|마감|기한|종료)/u;

const KOREAN_APPLICATION_CUE_RE = /(?:신청|접수|모집|지원|참여)\s*(?:방법|기간|기한|마감|일정|링크|폼|서류|서식|가능|하세요|바랍니다)?/u;
const KOREAN_PERIOD_LABEL_RE = /(?:기간|일정)\s*[:：]/u;

function compact(value, limit = 12_000) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function isoDateText(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dateVariantRe(isoDate) {
  const match = String(isoDate ?? "").match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new RegExp(
    `(?:${year}\\s*(?:년|[.\\-/])\\s*)?0?${Number(month)}\\s*(?:월|[.\\-/])\\s*0?${Number(day)}\\s*(?:일)?`,
    "u",
  );
}

function splitEvidenceSegments(text) {
  const compacted = compact(text);
  if (!compacted) return [];

  const sentenceLike = compacted
    .split(/(?:[\n\r]+|(?<=[.!?。]|[다요음임])\s+)/u)
    .map((segment) => compact(segment, 500))
    .filter(Boolean);

  const keywordWindows = [];
  for (const match of compacted.matchAll(/신청|접수|모집|응모|지원|등록|상시|수시|연중|소진|선착순|마감/gu)) {
    const start = Math.max(0, (match.index ?? 0) - 90);
    const end = Math.min(compacted.length, (match.index ?? 0) + 220);
    keywordWindows.push(compact(compacted.slice(start, end), 500));
  }

  return [...new Set([...sentenceLike, ...keywordWindows])];
}

function hasFixedDeadlineEvidence(segment, applicationEndAt) {
  if (!applicationEndAt) return false;
  if (!APPLICATION_CONTEXT_RE.test(segment)) return false;
  if (OPEN_ENDED_RE.test(segment)) return false;
  return DATE_TOKEN_RE.test(segment) && RANGE_OR_DEADLINE_RE.test(segment);
}

function firstMatchingSegment(segments, pattern) {
  return segments.find((segment) => pattern.test(segment)) ?? null;
}

function applicationWindows(segment) {
  const windows = [];
  APPLICATION_LABEL_RE.lastIndex = 0;
  let match;
  while ((match = APPLICATION_LABEL_RE.exec(segment)) !== null) {
    const rest = segment.slice(match.index + match[0].length);
    NEXT_SECTION_LABEL_RE.lastIndex = 0;
    const next = NEXT_SECTION_LABEL_RE.exec(rest);
    const end = next ? match.index + match[0].length + next.index : Math.min(segment.length, match.index + 180);
    windows.push(segment.slice(match.index, end));
  }
  return windows;
}

function containsDeadlineDate(window, dateRe) {
  dateRe.lastIndex = 0;
  const match = dateRe.exec(window);
  if (!match) return false;

  const before = window.slice(0, match.index);
  const after = window.slice(match.index + match[0].length, match.index + match[0].length + 24);
  return /(?:~|-|부터)/u.test(before) || /(?:까지|마감|기한|종료)/u.test(after);
}

function fixedTypeFromDeadlineDateEvidence(deadlineDateEvidence) {
  if (!deadlineDateEvidence || Number(deadlineDateEvidence.confidence) < 0.9) return null;
  const deadlineDate = isoDateText(deadlineDateEvidence.value_text ?? deadlineDateEvidence.value_json?.date);
  const dateRe = dateVariantRe(deadlineDate);
  if (!dateRe) return null;

  const evidenceText = compact(deadlineDateEvidence.evidence_text, 700);
  if (!evidenceText || OPEN_ENDED_RE.test(evidenceText)) return null;

  for (const window of applicationWindows(evidenceText)) {
    if (!FIXED_RANGE_RE.test(window)) continue;
    if (OPEN_ENDED_RE.test(window)) continue;
    if (!containsDeadlineDate(window, dateRe)) continue;
    return { date: deadlineDate, evidenceText: window };
  }

  if (
    String(deadlineDateEvidence.extractor ?? "") === "deadline-date-grounded-v1" &&
    KOREAN_PERIOD_LABEL_RE.test(evidenceText) &&
    KOREAN_APPLICATION_CUE_RE.test(evidenceText) &&
    containsDeadlineDate(evidenceText, dateRe)
  ) {
    return { date: deadlineDate, evidenceText };
  }

  return null;
}

export function inferDeadlineTypeEvidence({
  posterId,
  sourceText,
  periodText,
  applicationEndAt,
  existingDeadlineType,
  deadlineDateEvidence,
} = {}) {
  const existingType = String(existingDeadlineType ?? "").trim();
  if (existingType && existingType !== "unknown") return null;

  const text = compact([periodText, sourceText].filter(Boolean).join("\n"));
  const segments = splitEvidenceSegments(text);

  const ongoingEvidence = firstMatchingSegment(segments, ONGOING_RE);
  const exhaustedEvidence = firstMatchingSegment(segments, UNTIL_EXHAUSTED_RE);

  if (ongoingEvidence && !exhaustedEvidence) {
    return normalizeEvidenceRow({
      posterId,
      fieldKey: "deadline_type",
      valueText: "ongoing",
      valueJson: { type: "ongoing" },
      confidence: 0.95,
      evidenceText: ongoingEvidence,
      evidenceSrc: "rule",
      extractor: "deadline-type-rule-v2",
    });
  }

  if (exhaustedEvidence && !ongoingEvidence) {
    return normalizeEvidenceRow({
      posterId,
      fieldKey: "deadline_type",
      valueText: "until_exhausted",
      valueJson: { type: "until_exhausted" },
      confidence: 0.95,
      evidenceText: exhaustedEvidence,
      evidenceSrc: "rule",
      extractor: "deadline-type-rule-v2",
    });
  }

  const fixedFromDeadlineDate = fixedTypeFromDeadlineDateEvidence(deadlineDateEvidence);
  if (fixedFromDeadlineDate) {
    return normalizeEvidenceRow({
      posterId,
      fieldKey: "deadline_type",
      valueText: "fixed",
      valueJson: { type: "fixed", deadline_date: fixedFromDeadlineDate.date },
      confidence: 0.9,
      evidenceText: fixedFromDeadlineDate.evidenceText,
      evidenceSrc: "rule",
      extractor: "deadline-type-from-date-evidence-v1",
    });
  }

  const endDate = isoDateText(applicationEndAt);
  const fixedEvidence = segments.find((segment) => hasFixedDeadlineEvidence(segment, endDate));
  if (!fixedEvidence) return null;

  return normalizeEvidenceRow({
    posterId,
    fieldKey: "deadline_type",
    valueText: "fixed",
    valueJson: { type: "fixed", deadline_date: endDate },
    confidence: 0.9,
    evidenceText: fixedEvidence,
    evidenceSrc: "rule",
    extractor: "deadline-type-rule-v2",
  });
}
