export const DEFAULT_EXTRACTION_THRESHOLDS = Object.freeze({
  deadline_date: 0.9,
  deadline_type: 0.9,
  host_org: 0.9,
  official_url: 0.9,
  is_real_poster: 0.9,
  content_type: 0.9,
  apply_start: 0.8,
  category: 0.8,
  region: 0.8,
  age_min: 0.7,
  age_max: 0.7,
  target_desc: 0.7,
  benefit: 0.7,
  apply_method: 0.7,
  apply_url: 0.7,
  cost: 0.7,
  contact: 0.7,
  capacity: 0.7,
  venue: 0.7,
});

export const CRITICAL_FIELDS = Object.freeze([
  "deadline_date",
  "deadline_type",
  "host_org",
  "official_url",
  "is_real_poster",
]);

export const MAJOR_FIELDS = Object.freeze([
  "apply_start",
  "category",
  "region",
]);

export const MINOR_FIELDS = Object.freeze([
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
]);

export function fieldValue(field) {
  if (!field) return null;
  const valueJson = field.value_json;
  if (valueJson && typeof valueJson === "object" && !Array.isArray(valueJson)) {
    if (valueJson.date !== undefined) return valueJson.date;
    if (valueJson.type !== undefined) return valueJson.type;
    if (valueJson.url !== undefined) return valueJson.url;
    if (valueJson.value !== undefined) return valueJson.value;
  }
  return field.value ?? field.value_text ?? null;
}

function fieldConfidence(field) {
  const confidence = Number(field?.confidence);
  return Number.isFinite(confidence) ? confidence : 0;
}

function passesField(fields, fieldKey, thresholds) {
  const field = fields?.[fieldKey];
  return Boolean(field) && fieldConfidence(field) >= (thresholds[fieldKey] ?? 1);
}

function deadlineTypeAllowsAlerts(value) {
  const normalized = String(value ?? "").normalize("NFKC").toLowerCase();
  return [
    "fixed",
    "fixed_date",
    "date",
    "deadline",
    "마감일 고정",
    "고정",
  ].some((token) => normalized.includes(token));
}

function requiredCriticalFields(fields, thresholds) {
  const deadlineTypePassed = passesField(fields, "deadline_type", thresholds);
  const deadlineType = fieldValue(fields.deadline_type);
  const requiresDeadlineDate = !deadlineTypePassed || deadlineTypeAllowsAlerts(deadlineType);

  return CRITICAL_FIELDS.filter((fieldKey) => fieldKey !== "deadline_date" || requiresDeadlineDate);
}

export function computeTier(input, thresholds = DEFAULT_EXTRACTION_THRESHOLDS) {
  const fields = input?.fields ?? {};
  const reason = [];

  if (input?.isDuplicate) reason.push("duplicate_suspected");
  if (input?.contentType && input.contentType !== "recruit") {
    reason.push(`content_type_${input.contentType}`);
  }
  if (input?.hasPosterImage === false) reason.push("poster_image_missing");

  const criticalFields = requiredCriticalFields(fields, thresholds);
  const missingCritical = criticalFields.filter((fieldKey) => !fields[fieldKey]);
  const lowCritical = criticalFields.filter(
    (fieldKey) => fields[fieldKey] && !passesField(fields, fieldKey, thresholds),
  );
  for (const fieldKey of missingCritical) reason.push(`critical_missing_${fieldKey}`);
  for (const fieldKey of lowCritical) reason.push(`critical_low_confidence_${fieldKey}`);

  const criticalPassed = missingCritical.length === 0 && lowCritical.length === 0;
  const eligibleRecruit = !input?.isDuplicate && (input?.contentType ?? "recruit") === "recruit";

  const incompleteMajorMinor = [...MAJOR_FIELDS, ...MINOR_FIELDS].filter(
    (fieldKey) => fields[fieldKey] && !passesField(fields, fieldKey, thresholds),
  );
  for (const fieldKey of incompleteMajorMinor) {
    reason.push(`field_low_confidence_${fieldKey}`);
  }

  let tier = "C";
  if (criticalPassed && eligibleRecruit) {
    tier = incompleteMajorMinor.length === 0 ? "A" : "B";
  }

  const deadlineDatePassed = passesField(fields, "deadline_date", thresholds);
  const deadlineTypePassed = passesField(fields, "deadline_type", thresholds);
  const deadlineType = fieldValue(fields.deadline_type);
  const seo = passesField(fields, "host_org", thresholds) && passesField(fields, "official_url", thresholds);
  const deadlineAlert = deadlineDatePassed && deadlineTypePassed && deadlineTypeAllowsAlerts(deadlineType);

  return {
    tier,
    reason,
    gates: {
      seo,
      calendar: deadlineAlert,
      deadlineAlert,
      recommendation: seo && passesField(fields, "category", thresholds),
    },
  };
}

export function bestFieldsFromEvidence(rows = []) {
  const fields = {};
  for (const row of rows) {
    const existing = fields[row.field_key];
    if (!existing || fieldConfidence(row) > fieldConfidence(existing)) {
      fields[row.field_key] = row;
    }
  }
  return fields;
}
