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

function compactText(value, limit = 300) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function normalizeForMatch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function clampConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.max(0, Math.min(1, confidence));
}

export function adjustConfidence(raw = {}) {
  let confidence = clampConfidence(raw.modelConfidence ?? raw.confidence ?? 0.5);
  const evidenceText = compactText(raw.evidenceText);
  const valueText = compactText(raw.valueText, 500);

  if (!evidenceText || evidenceText.length < 4) {
    confidence = Math.min(confidence, 0.4);
  }

  if (
    evidenceText &&
    valueText &&
    !normalizeForMatch(evidenceText).includes(normalizeForMatch(valueText))
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
      return normalizeEvidenceRow({
        posterId,
        fieldKey,
        valueText: value,
        valueJson: null,
        confidence,
        evidenceText: findEvidenceSentence(sourceText, value) ?? value,
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
