export const NOTICE_FACT_KEYS = [
  "period",
  "target",
  "content",
  "application",
  "location",
  "contact",
];

const SECTION_LABELS = [
  "application organization",
  "official application",
  "수강 신청",
  "신청기간",
  "접수기간",
  "모집기간",
  "지원기간",
  "운영기간",
  "교육기간",
  "활동기간",
  "참여기간",
  "모집일정",
  "신청일정",
  "진행일정",
  "운영일시",
  "진행일시",
  "교육일정",
  "행사일",
  "교육대상",
  "지원대상",
  "모집대상",
  "참여대상",
  "신청대상",
  "지원자격",
  "신청자격",
  "모집자격",
  "지원내용",
  "주요내용",
  "사업내용",
  "교육내용",
  "프로그램내용",
  "활동내용",
  "진행내용",
  "참여혜택",
  "지원규모",
  "신청방법",
  "접수방법",
  "지원방법",
  "모집방법",
  "신청링크",
  "참여방법",
  "교육장소",
  "행사장소",
  "진행장소",
  "활동장소",
  "접수장소",
  "문의방법",
  "문의처",
  "연락처",
  "모집인원",
  "정원",
  "지원시기",
  "제출서류",
  "신청서류",
  "선정기준",
  "추천대상",
  "이런 분께",
  "선정발표",
  "결과발표",
  "참가비",
  "재료비",
  "준비물",
  "기타사항",
  "첨부파일",
  "찾아가기",
  "사업명",
  "모집명",
  "프로그램",
  "신청",
  "접수",
  "장소",
  "주소",
  "문의",
  "대상",
  "내용",
  "혜택",
  "비용",
  "기간",
  "일시",
  "목적",
  "강사",
];

const FACT_MAX_LENGTH = {
  period: 180,
  target: 400,
  content: 700,
  application: 700,
  location: 400,
  contact: 400,
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SECTION_LABEL_PATTERN = SECTION_LABELS
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join("|");
const SECTION_MARKER_PATTERN =
  "(?:[●○■□◆◇▶▷▸▹▪▫]|✅|☑️?|✔️?|📌|📆|🗓️?|🚩|👥|🔗|☎️?|❤️?|👉|🧡)";
const NUMBERED_SECTION_PATTERN = "(?:\\d{1,2}\\s*[.)]\\s*)?";

function normalizeSpaces(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function restoreNoticeSectionBreaks(value) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  text = text.replace(
    new RegExp(`\\s*(${SECTION_MARKER_PATTERN})\\s*(?=${NUMBERED_SECTION_PATTERN}(?:${SECTION_LABEL_PATTERN})\\s*(?:[:：]|\\s))`, "giu"),
    "\n$1 ",
  );
  text = text.replace(
    new RegExp(`\\s+(?=\\d{1,2}\\s*[.)]\\s*(?:${SECTION_LABEL_PATTERN})\\s*(?:[:：]|\\s))`, "giu"),
    "\n",
  );
  text = text.replace(
    new RegExp(`(?<!\\d[.)])(?<![●○■□◆◇▶▷▸▹▪▫–—-])\\s+(?=(?:${SECTION_LABEL_PATTERN})\\s*[:：])`, "giu"),
    "\n",
  );
  text = text.replace(
    new RegExp(`([^\\n])\\s+(?=[-–—]\\s*(?:${SECTION_LABEL_PATTERN})\\s*[:：])`, "giu"),
    "$1\n",
  );
  text = text.replace(/\s+(?=(?:첨부파일|찾아가기)(?:\s|$))/gu, "\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function firstSectionOnly(value) {
  const restored = restoreNoticeSectionBreaks(value);
  const [first = ""] = restored.split(/\n+/);
  return first
    .replace(new RegExp(`^\\s*(?:${SECTION_MARKER_PATTERN}|[-–—])\\s*`, "u"), "")
    .replace(/^\d{1,2}\s*[.)]\s*/, "")
    .replace(/^[☑️✅✔️]+\s*/u, "")
    .replace(/\s*(?:·|[|])\s*$/, "")
    .trim();
}

function hasUnfinishedTail(value) {
  const text = value.trim();
  if (!text) return true;
  if (/(?:https?:\/\/(?:www\.?)?|www\.)$/i.test(text)) return true;
  if (/(?:\[|\(|（|~|～|\-|\/|:|：)\s*$/.test(text)) return true;
  if (/\b(?:19|20)\d{0,3}\s*$/u.test(text)) return true;
  if (/\b(?:19|20)\d{2}\s*[.\-/년]\s*\d{0,2}\s*$/u.test(text)) return true;
  if (/\b(?:19|20)\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{0,1}\s*$/u.test(text)) return true;
  return false;
}

function hasInvalidUrl(value) {
  const urls = String(value).match(/https?:\/\/[^\s]+/gi) ?? [];
  return urls.some((url) => {
    try {
      const parsed = new URL(url.replace(/[),.;]+$/g, ""));
      return !parsed.hostname.includes(".");
    } catch {
      return true;
    }
  });
}

function hasSuspiciousApplicationSelection(value) {
  return /["'“”‘’「」『』]\s*[^"'“”‘’「」『』]{0,80}\d{1,2}\s*월\s*(?:신청자|참여자|수강생|대상자)?\s*모집[^"'“”‘’「」『』]{0,20}["'“”‘’「」『』]/u.test(
    value,
  );
}

function stripTrailingContactReferenceUrl(value) {
  const urlIndex = value.search(/https?:\/\//i);
  if (urlIndex <= 0) return value;

  const beforeUrl = value.slice(0, urlIndex).trim();
  const hasDirectContact =
    /(?:0\d{1,2}[- )]?\d{3,4}[- ]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/u.test(
      beforeUrl,
    );
  return hasDirectContact ? beforeUrl : value;
}

function isUsablePeriod(value) {
  if (/(?:상시|수시)\s*(?:모집|접수|신청|운영)?|소진\s*시|선착순\s*마감|마감\s*시/u.test(value)) {
    return !hasUnfinishedTail(value);
  }
  const hasCompleteDate = /(?:19|20)\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?/u.test(value);
  const hasKoreanDate = /\d{1,2}\s*월\s*\d{1,2}\s*일/u.test(value);
  return (hasCompleteDate || hasKoreanDate) && !hasUnfinishedTail(value);
}

export function sanitizeNoticeFactValue(value, key) {
  if (!NOTICE_FACT_KEYS.includes(key)) return null;
  let text = firstSectionOnly(value)
    .replace(/\s+/g, " ")
    .replace(/^[:：]\s*/, "")
    .replace(/\s+#.*$/u, "")
    .replace(/\s*\.\.\.$/, "")
    .trim();
  if (!text) return null;

  const embeddedBoundary = text.search(
    new RegExp(`\\s+(?:${NUMBERED_SECTION_PATTERN}|[-–—]\\s*)?(?:${SECTION_LABEL_PATTERN})\\s*[:：]`, "iu"),
  );
  if (embeddedBoundary > 0) text = text.slice(0, embeddedBoundary).trim();
  if (key === "contact") text = stripTrailingContactReferenceUrl(text);
  text = text.replace(/\s*(?:·|[|,;])\s*$/, "").trim();

  if (!text || hasUnfinishedTail(text) || hasInvalidUrl(text)) return null;
  if (/(?:또는|및|과|와|통해|→)\s*$/u.test(text)) return null;
  if (/\(\s*본문\s*[:：]/u.test(text)) return null;
  if (key === "application" && hasSuspiciousApplicationSelection(text))
    return null;
  if (key === "contact" && /[가-힣][A-Za-z]{3,}$/u.test(text)) return null;
  if (key === "period" && !isUsablePeriod(text)) return null;
  if (text.length > FACT_MAX_LENGTH[key]) return null;
  if (/^(?:없음|해당\s*없음|미정|확인\s*필요)$/u.test(text)) return null;
  return normalizeSpaces(text);
}

export function sanitizeNoticeFacts(facts = {}) {
  return Object.fromEntries(
    NOTICE_FACT_KEYS
      .map((key) => [key, sanitizeNoticeFactValue(facts?.[key], key)])
      .filter(([, value]) => Boolean(value)),
  );
}
