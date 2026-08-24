import { normalizeEvidenceRow } from "./field-evidence.js";

const GENERIC_SOURCE_NAMES = new Set([
  "청년몽땅정보통",
  "통합청년",
  "K-Startup",
]);

function compact(value, limit = 12_000) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizeForMatch(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function isGenericSourceName(value) {
  return GENERIC_SOURCE_NAMES.has(compact(value));
}

function titlePrefixBeforeProgram(title) {
  const text = compact(title, 500);
  const bracketIndex = text.indexOf("<");
  if (bracketIndex <= 0) return null;
  return text.slice(0, bracketIndex).replace(/^[\[\](){}\s]+|[\[\](){}\s]+$/g, "").trim() || null;
}

function centeredSnippet(text, needle, before = 120, after = 180) {
  const source = compact(text, 1000);
  const index = source.indexOf(needle);
  if (index < 0) return source.slice(0, before + after);
  return source.slice(
    Math.max(0, index - before),
    Math.min(source.length, index + needle.length + after),
  );
}

function findGroundedEvidence({ value, title, sourceText }) {
  const org = compact(value, 200);
  if (!org || org.length < 2 || isGenericSourceName(org)) return null;

  const normalizedOrg = normalizeForMatch(org);
  if (normalizedOrg.length < 2) return null;

  const safeTitle = compact(title, 500);
  const titlePrefix = titlePrefixBeforeProgram(safeTitle);
  if (
    titlePrefix &&
    (
      normalizeForMatch(titlePrefix) === normalizedOrg ||
      normalizeForMatch(titlePrefix).includes(normalizedOrg) ||
      normalizedOrg.includes(normalizeForMatch(titlePrefix))
    )
  ) {
    return { evidenceText: safeTitle, evidenceSrc: "title", confidence: 0.95 };
  }

  if (safeTitle && normalizeForMatch(safeTitle).includes(normalizedOrg)) {
    return { evidenceText: safeTitle, evidenceSrc: "title", confidence: 0.93 };
  }

  const source = compact(sourceText);
  const normalizedSource = normalizeForMatch(source);
  if (!source || !normalizedSource.includes(normalizedOrg)) return null;

  const sentences = source
    .split(/(?:[\n\r]+|(?<=[.!?。]|[다요음임])\s+)/u)
    .map((sentence) => compact(sentence, 500))
    .filter(Boolean);
  const sentence = sentences.find((item) => normalizeForMatch(item).includes(normalizedOrg));

  return {
    evidenceText: centeredSnippet(sentence ?? source, org),
    evidenceSrc: "body",
    confidence: 0.9,
  };
}

export function inferHostOrgEvidence({
  posterId,
  title,
  sourceText,
  organizerName,
  verifiedOrganization,
  sourceOrgName,
} = {}) {
  const organization = verifiedOrganization && typeof verifiedOrganization === "object"
    ? verifiedOrganization
    : {};
  const candidates = [
    organizerName,
    organization.displayOrgName,
    organization.organizerName,
    organization.hostName,
    sourceOrgName,
  ]
    .map((value) => compact(value, 200))
    .filter(Boolean);

  const seen = new Set();
  for (const value of candidates) {
    const key = normalizeForMatch(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const grounded = findGroundedEvidence({ value, title, sourceText });
    if (!grounded) continue;

    return normalizeEvidenceRow({
      posterId,
      fieldKey: "host_org",
      valueText: value,
      valueJson: { name: value },
      confidence: grounded.confidence,
      evidenceText: grounded.evidenceText,
      evidenceSrc: grounded.evidenceSrc,
      extractor: "host-org-grounded-v1",
    });
  }

  return null;
}
