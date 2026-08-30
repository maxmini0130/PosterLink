const FIELD_KEY_ALIASES = new Map([
  ["application_end_at", "deadline_date"],
  ["organizer_name", "host_org"],
  ["eligibility_summary", "target_desc"],
  ["benefits_summary", "benefit"],
  ["application_method", "apply_method"],
  ["contact_info", "contact"],
  ["event_location", "venue"],
  ["participation_fee", "cost"],
  ["recruitment_count", "capacity"],
]);

export const FIELD_KEYS = [
  "deadline_date",
  "deadline_type",
  "host_org",
  "official_url",
  "is_real_poster",
  "content_type",
  "apply_start",
  "category",
  "region",
  "age_min",
  "age_max",
  "target_desc",
  "benefit",
  "apply_method",
  "apply_url",
  "cost",
  "contact",
  "capacity",
  "venue",
];

function stripInvalidUnicode(value) {
  let text = "";
  const source = String(value ?? "");

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        text += source[index] + source[index + 1];
        index += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }
    text += source[index];
  }

  return text;
}

function truncateText(value, limit) {
  const text = value.slice(0, limit);
  const lastCode = text.charCodeAt(text.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return text.slice(0, -1);
  }
  return text;
}

function compactText(value, limit = 300) {
  const text = stripInvalidUnicode(value).replace(/\s+/g, " ").trim();
  return text ? truncateText(text, limit) : null;
}

function normalizeForMatch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function parseIsoDate(value) {
  const match = String(value ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function makeIsoDate(year, month, day) {
  const y = Number(year);
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

function extractLastDate(value, referenceYear = null) {
  const dates = [];
  let lastYear = referenceYear;
  const text = String(value ?? "").normalize("NFKC");
  const re = /(?:(20\d{2})\s*(?:년|[.\-/])\s*)?(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*(?:일)?/gu;
  let match;
  while ((match = re.exec(text)) !== null) {
    const year = match[1] ? Number(match[1]) : lastYear;
    if (!year) continue;
    const iso = makeIsoDate(year, match[2], match[3]);
    if (!iso) continue;
    if (match[1]) lastYear = Number(match[1]);
    dates.push(iso);
  }
  return dates.at(-1) ?? null;
}

function normalizeReadableDeadlinePeriod({ value, evidenceText, sourceText }) {
  const evidence = compactText(evidenceText ?? "", 700) ?? "";
  const source = compactText(sourceText ?? "", 700) ?? "";
  const combined = `${evidence} ${source}`;
  const normalized = combined.normalize("NFKC");
  const normalizedEvidence = evidence.normalize("NFKC");

  const hasExplicitApplicationPeriod = /(?:신청|접수|모집|응모|지원)\s*(?:기간|기한|마감|일정)/u.test(normalizedEvidence);
  const hasApplicationCue = hasExplicitApplicationPeriod;
  const hasNonApplicationCue = /(?:진행|교육|행사|운영|활동|프로그램|강좌|공연|전시|여행)\s*(?:기간|일정|일시)/u.test(normalized);
  const openEnded = /(?:상시|수시|연중)\s*(?:모집|접수|신청)|(?:마감|모집)\s*시(?:까지)?|선착순\s*마감/u.test(normalized);

  if (!hasApplicationCue || openEnded) return null;
  if (hasNonApplicationCue && !/(?:신청기간|접수기간|모집기간|응모기간|지원기간)/u.test(normalizedEvidence)) {
    return null;
  }

  const referenceYear = Number(normalized.match(/\b(20\d{2})\b/)?.[1]) || null;
  return extractLastDate(value, referenceYear) ?? extractLastDate(evidence, referenceYear);
}

function hasEquivalentDateEvidence(evidenceText, valueText) {
  const value = parseIsoDate(valueText);
  if (!value) return false;

  const normalized = String(evidenceText ?? "").normalize("NFKC");
  const dateMatches = normalized.matchAll(
    /(?:(20\d{2})\s*[년.\-/]\s*)?(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*(?:일)?/g,
  );

  for (const match of dateMatches) {
    const year = match[1] ? Number(match[1]) : null;
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (
      month === value.month &&
      day === value.day &&
      (year === null || year === value.year)
    ) {
      return true;
    }
  }

  return false;
}

function valueAppearsInEvidence({ fieldKey, valueText, evidenceText, extractor }) {
  if (!valueText) return true;
  if (normalizeForMatch(evidenceText).includes(normalizeForMatch(valueText))) {
    return true;
  }
  if (["deadline_date", "apply_start"].includes(fieldKey)) {
    return hasEquivalentDateEvidence(evidenceText, valueText);
  }
  if (fieldKey === "deadline_type" && String(extractor ?? "").startsWith("deadline-type")) {
    return true;
  }
  return false;
}

function clampConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.max(0, Math.min(1, confidence));
}

export function evidenceValue(row) {
  const json = row?.value_json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (json.date !== undefined) return json.date;
    if (json.url !== undefined) return json.url;
    if (json.name !== undefined) return json.name;
    if (json.type !== undefined) return json.type;
    if (json.min !== undefined) return json.min;
    if (json.max !== undefined) return json.max;
    if (json.value !== undefined) return json.value;
  }
  return row?.value ?? row?.value_text ?? null;
}

export function evidenceExtractorPriority(row) {
  const extractor = String(row?.extractor ?? "");
  if (extractor === "human" || extractor.startsWith("golden-correction")) return 3;
  if (extractor.startsWith("operator-") && !/audit/i.test(extractor)) return 2;
  return 1;
}

export function effectiveEvidenceConfidence(row = {}) {
  let confidence = Number(row.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence <= 0) return 0;

  const fieldKey = String(row.field_key ?? "");
  const extractor = String(row.extractor ?? "");
  const evidenceText = String(row.evidence_text ?? "").normalize("NFKC");
  const predicted = String(evidenceValue(row) ?? "").normalize("NFKC");
  const hasApplicationCue = /신청|접수|모집|공모|참여/.test(evidenceText);
  const hasUnboundedCue = /마감시|소진|예산\s*소진|정원\s*소진|이후에도\s*신청\s*가능/.test(evidenceText);
  const hasOnlyFirstComeCue = /선착순/.test(evidenceText) && !hasUnboundedCue;

  if (/audit/i.test(extractor)) confidence = Math.min(confidence, 0.65);

  if (fieldKey === "deadline_date") {
    if (extractor === "regex-date-v1" && !hasApplicationCue) {
      confidence = Math.min(confidence, 0.65);
    }
    if (hasUnboundedCue) confidence = Math.min(confidence, 0.65);
  }

  if (fieldKey === "deadline_type") {
    if (predicted === "fixed" && !hasApplicationCue) {
      confidence = Math.min(confidence, 0.65);
    }
    if (predicted === "fixed" && hasUnboundedCue) {
      confidence = Math.min(confidence, 0.65);
    }
    if (predicted === "until_exhausted" && hasOnlyFirstComeCue) {
      confidence = Math.min(confidence, 0.65);
    }
  }

  return Math.round(confidence * 100) / 100;
}

export function adjustConfidence(raw = {}) {
  let confidence = clampConfidence(raw.modelConfidence ?? raw.confidence ?? 0.5);
  const evidenceText = compactText(raw.evidenceText);
  const valueText = compactText(raw.valueText, 500);
  const shortEvidence = !evidenceText || evidenceText.length < 4;

  if (!evidenceText || evidenceText.length < 4) {
    confidence = Math.min(confidence, 0.4);
  }

  if (
    evidenceText &&
    valueText &&
    !shortEvidence &&
    !valueAppearsInEvidence({
      fieldKey: raw.fieldKey,
      valueText,
      evidenceText,
      extractor: raw.extractor,
    })
  ) {
    confidence *= 0.6;
  }

  if (String(raw.extractor ?? "").startsWith("regex-")) {
    confidence = Math.min(1, confidence + 0.15);
  }

  if (Array.isArray(raw.corroboratedBy) && raw.corroboratedBy.length > 0) {
    confidence = Math.min(1, confidence + 0.1 * raw.corroboratedBy.length);
  }

  if (Array.isArray(raw.conflictsWith) && raw.conflictsWith.length > 0) {
    confidence *= 0.5;
  }

  if (raw.extractor === "human") confidence = 1;

  return Math.round(confidence * 100) / 100;
}

export function canonicalFieldKey(fieldKey) {
  const key = String(fieldKey ?? "").trim();
  return FIELD_KEY_ALIASES.get(key) ?? key;
}

export function normalizeEvidenceRow({
  posterId,
  fieldKey,
  valueText = null,
  valueJson = null,
  confidence = 0.5,
  evidenceText = null,
  evidenceSrc = "body",
  extractor,
  corroboratedBy,
  conflictsWith,
}) {
  const canonicalKey = canonicalFieldKey(fieldKey);
  if (!posterId || !canonicalKey || !extractor) return null;
  if (!FIELD_KEYS.includes(canonicalKey)) return null;

  const safeValueText = compactText(valueText, 2000);
  const safeEvidenceText = compactText(evidenceText, 300);
  const adjustedConfidence = adjustConfidence({
    fieldKey: canonicalKey,
    modelConfidence: confidence,
    valueText: safeValueText,
    evidenceText: safeEvidenceText,
    extractor,
    corroboratedBy,
    conflictsWith,
  });

  return {
    poster_id: posterId,
    field_key: canonicalKey,
    value_text: safeValueText,
    value_json: valueJson ?? null,
    confidence: adjustedConfidence,
    evidence_text: safeEvidenceText,
    evidence_src: evidenceSrc,
    extractor,
  };
}

export function evidenceRowsFromReadableFacts({
  posterId,
  facts = {},
  sourceText = "",
  extractor = "readable-notice-v1",
  confidence = 0.75,
} = {}) {
  const mappings = [
    ["period", "deadline_date"],
    ["target", "target_desc"],
    ["content", "benefit"],
    ["application", "apply_method"],
    ["location", "venue"],
    ["contact", "contact"],
  ];

  return mappings
    .map(([factKey, fieldKey]) => {
      const value = facts?.[factKey];
      if (!value) return null;
      const evidenceText = findEvidenceSentence(sourceText, value) ?? value;
      if (fieldKey === "deadline_date") {
        const deadlineDate = normalizeReadableDeadlinePeriod({
          value,
          evidenceText,
          sourceText,
        });
        if (!deadlineDate) return null;
        return normalizeEvidenceRow({
          posterId,
          fieldKey,
          valueText: deadlineDate,
          valueJson: { date: deadlineDate },
          confidence,
          evidenceText,
          evidenceSrc: "body",
          extractor,
        });
      }
      return normalizeEvidenceRow({
        posterId,
        fieldKey,
        valueText: value,
        valueJson: null,
        confidence,
        evidenceText,
        evidenceSrc: "body",
        extractor,
      });
    })
    .filter(Boolean);
}

export function findEvidenceSentence(sourceText, valueText) {
  const source = String(sourceText ?? "");
  const value = String(valueText ?? "").trim();
  if (!source || !value) return null;

  const normalizedValue = normalizeForMatch(value);
  if (!normalizedValue) return null;

  const sentences = source
    .replace(/<[^>]+>/g, " ")
    .split(/(?<=[.!?。]|[다요함됨음임])\s+|\n+/)
    .map((sentence) => compactText(sentence, 500))
    .filter(Boolean);

  return (
    sentences.find((sentence) =>
      normalizeForMatch(sentence).includes(normalizedValue),
    ) ?? null
  );
}
