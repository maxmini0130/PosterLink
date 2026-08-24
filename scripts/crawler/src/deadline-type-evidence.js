import { normalizeEvidenceRow } from "./field-evidence.js";

const APPLICATION_CONTEXT_RE = /(?:신청|접수|모집|응모|지원|등록)\s*(?:기간|기한|마감|일정|기간은|기간:|방법|대상)?/u;
const DATE_TOKEN_RE = /(?:20\d{2}\s*(?:[.\-/년]\s*)?)?\d{1,2}\s*(?:[.\-/월]\s*)\d{1,2}\s*(?:일)?/u;
const RANGE_OR_DEADLINE_RE = /(?:~|부터|까지|마감|종료|기한|접수기간|신청기간|모집기간)/u;
const ONGOING_RE = /(?:상시|수시|연중)\s*(?:모집|접수|신청|운영)/u;
const UNTIL_EXHAUSTED_RE = /(?:예산|재원|인원|정원)?\s*소진\s*시|소진\s*시까지|소진\s*시\s*마감|선착순\s*(?:마감|접수|모집)|마감\s*시까지|모집\s*시까지/u;
const OPEN_ENDED_RE = /(?:상시|수시|연중)\s*(?:모집|접수|신청|운영)|(?:모집|마감)\s*시까지|소진\s*시/u;

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

export function inferDeadlineTypeEvidence({
  posterId,
  sourceText,
  periodText,
  applicationEndAt,
  existingDeadlineType,
} = {}) {
  const existingType = String(existingDeadlineType ?? "").trim();
  if (existingType && existingType !== "unknown") return null;

  const text = compact([periodText, sourceText].filter(Boolean).join("\n"));
  const segments = splitEvidenceSegments(text);
  if (segments.length === 0) return null;

  const ongoingEvidence = firstMatchingSegment(segments, ONGOING_RE);
  const exhaustedEvidence = firstMatchingSegment(segments, UNTIL_EXHAUSTED_RE);

  if (ongoingEvidence && !exhaustedEvidence) {
    return normalizeEvidenceRow({
      posterId,
      fieldKey: "deadline_type",
      valueText: "ongoing",
      valueJson: { type: "ongoing" },
      confidence: 0.9,
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
      confidence: 0.9,
      evidenceText: exhaustedEvidence,
      evidenceSrc: "rule",
      extractor: "deadline-type-rule-v2",
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
